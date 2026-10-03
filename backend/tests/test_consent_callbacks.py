"""Consent tokens, opt-out, callback scheduling/dialling/coalescing, and SMS fallbacks."""
from datetime import timedelta

from sqlalchemy import select

from app.core.clock import utcnow
from app.events.recorder import Actor
from app.models import Callback, CallSession, Notification
from app.models.enums import CallbackStatus, CallState, ConsentType, NotificationChannel
from app.workers.jobs import dial_callbacks
from tests.conftest import approve, authority, open_case, run


async def _callbacks(infra, ref):
    async def go(c):
        case = await c.cases_repo.by_reference(ref)
        return list((await c.session.scalars(select(Callback).where(Callback.case_id == case.id).order_by(Callback.created_at))).all())
    return await run(infra, go)


async def _clear_birth_certificate(infra, ref, officer_id):
    await approve(infra, ref, "BIRTH_CERTIFICATE", officer_id)
    await authority(infra, ref, "BIRTH_CERTIFICATE", "CLEARED")


async def test_no_consent_means_no_call(infra, world):
    ref = await open_case(infra, world["resident"], consent_callback=False)
    await _clear_birth_certificate(infra, ref, world["officer"].id)
    callbacks = await _callbacks(infra, ref)
    assert callbacks and all(cb.status == CallbackStatus.BLOCKED_NO_CONSENT for cb in callbacks)
    assert await dial_callbacks(infra) == 0


async def test_consented_callback_dials_and_disclosure_comes_first(infra, world):
    ref = await open_case(infra, world["resident"])
    await _clear_birth_certificate(infra, ref, world["officer"].id)
    callbacks = await _callbacks(infra, ref)
    assert [cb.status for cb in callbacks] == [CallbackStatus.SCHEDULED]
    assert {r["reason"] for r in callbacks[0].reasons} == {"CLEARED"}
    assert await dial_callbacks(infra) == 1

    async def answer(c):
        call = await c.session.scalar(select(CallSession).where(CallSession.state == CallState.RINGING))
        user = await c.users_repo.get(world["resident"].id)
        result = await c.calls.answer(user, call.id)
        return result["call"]
    view = await run(infra, answer)
    first = view["transcript"][0]
    assert first["is_disclosure"] and "LifeLoop" in first["text"] and "recorded" in first["text"]


async def test_consent_revoked_after_scheduling_is_rechecked_at_dial_time(infra, world):
    ref = await open_case(infra, world["resident"])
    await _clear_birth_certificate(infra, ref, world["officer"].id)

    async def revoke(c):
        case = await c.cases_repo.by_reference(ref)
        user = await c.users_repo.get(world["resident"].id)
        # Revoke directly on the record (not via the service) to simulate a race between scheduling and dialling.
        consent = await c.consents_repo.active(case.id, ConsentType.CALLBACK)
        consent.status = consent.status.REVOKED
        _ = user
    await run(infra, revoke)
    assert await dial_callbacks(infra) == 0
    assert (await _callbacks(infra, ref))[0].status == CallbackStatus.BLOCKED_NO_CONSENT


async def test_opt_out_cancels_and_switches_to_sms(infra, world):
    ref = await open_case(infra, world["resident"])
    await _clear_birth_certificate(infra, ref, world["officer"].id)

    async def stop(c):
        case = await c.cases_repo.by_reference(ref)
        user = await c.users_repo.get(world["resident"].id)
        await c.optouts.opt_out(case, user, source="VOICE", actor=Actor.user(user))
    await run(infra, stop)
    callbacks = await _callbacks(infra, ref)
    assert callbacks[0].status == CallbackStatus.CANCELLED

    await approve(infra, ref, "MOFA_ATTESTATION", world["officer"].id)
    await authority(infra, ref, "MOFA_ATTESTATION", "CLEARED")
    later = (await _callbacks(infra, ref))[1:]
    assert later and all(cb.status == CallbackStatus.SMS_ONLY and cb.channel == "SMS" for cb in later)
    assert await dial_callbacks(infra) == 0

    async def check(c):
        case = await c.cases_repo.by_reference(ref)
        assert case.channel_mode.value == "SMS_ONLY"
        sms = (await c.session.scalars(select(Notification).where(Notification.case_id == case.id,
                                                                    Notification.channel == NotificationChannel.SMS))).all()
        assert sms and all(n.status.value == "SENT" and n.is_mock for n in sms)
        user = await c.users_repo.get(world["resident"].id)
        await c.optouts.opt_in(case, user, Actor.user(user))
        assert case.channel_mode.value == "VOICE"
        assert (await c.consents_repo.active(case.id, ConsentType.CALLBACK)).token
    await run(infra, check)


async def test_updates_close_together_share_one_call(infra, world):
    ref = await open_case(infra, world["resident"])
    await _clear_birth_certificate(infra, ref, world["officer"].id)
    await approve(infra, ref, "MOFA_ATTESTATION", world["officer"].id)
    await authority(infra, ref, "MOFA_ATTESTATION", "CLEARED")  # MOFA cleared + consulate needs the parent
    scheduled = [cb for cb in await _callbacks(infra, ref) if cb.status == CallbackStatus.SCHEDULED]
    assert len(scheduled) == 1
    assert {r["reason"] for r in scheduled[0].reasons} >= {"CLEARED", "PARENT_INPUT"}


async def test_unanswered_call_falls_back_to_sms(infra, world):
    ref = await open_case(infra, world["resident"])
    await _clear_birth_certificate(infra, ref, world["officer"].id)
    await dial_callbacks(infra)

    async def age(c):
        cb = await c.session.scalar(select(Callback).where(Callback.status == CallbackStatus.DIALING))
        cb.dialed_at = utcnow() - timedelta(minutes=10)
    await run(infra, age)
    await dial_callbacks(infra)
    cb = (await _callbacks(infra, ref))[0]
    assert cb.status == CallbackStatus.NO_ANSWER
