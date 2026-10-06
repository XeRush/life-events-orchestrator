"""Resident-facing step text follows the reader's language; the stored English (officer and audit views) is unchanged."""
import re

from app.agents.dialog import nlu
from app.workflows.step_text import EN, TRANSLATIONS
from tests.conftest import approve, authority, open_case, run


def test_step_text_translations_complete_with_matching_placeholders():
    for lang, table in TRANSLATIONS.items():
        assert set(table) == set(EN), lang
        for key, text in table.items():
            assert set(re.findall(r"\{(\w+)\}", text)) == set(re.findall(r"\{(\w+)\}", EN[key])), (lang, key)


async def test_case_view_and_graph_follow_reader_language(infra, world):
    resident, officer = world["resident"], world["officer"]
    ref = await open_case(infra, resident)
    await approve(infra, ref, "BIRTH_CERTIFICATE", officer.id)
    await authority(infra, ref, "BIRTH_CERTIFICATE", "PROCESSING")

    async def views(c):
        case = await c.cases_repo.by_reference(ref)
        user = await c.users_repo.get(resident.id)
        return (await c.cases.view(case, user, "ar"), await c.graph.snapshot(case, "ar"),
                await c.graph.snapshot(case), await c.documents.view(case, "hi"))

    view_ar, graph_ar, graph_en, docs_hi = await run(infra, views)
    assert view_ar["next_action"]["text"].startswith("لدى DHA")
    assert "Idea Canvas" in view_ar["deadline"]["source"] and "مهلة" in view_ar["deadline"]["source"]
    bc_ar = next(n for n in graph_ar["nodes"] if n["key"] == "BIRTH_CERTIFICATE")
    bc_en = next(n for n in graph_en["nodes"] if n["key"] == "BIRTH_CERTIFICATE")
    assert "يُجيزه موظف" in bc_ar["lifeloop_does"] and "(تجريبي - محاكاة)" in bc_ar["status"]
    assert bc_ar["form_field_labels"][0] == "اسم الطفل (بالإنجليزية)"
    # English keeps the stored wording (the mock authority's own message) for officers and the audit trail.
    assert bc_en["status"] == (await run(infra, lambda c: _stored_status(c, ref)))
    assert bc_en["next_action"].startswith("With DHA")
    assert "विभाग" in docs_hi["disclaimer"]


async def _stored_status(c, ref):
    case = await c.cases_repo.by_reference(ref)
    return (await c.nodes_repo.by_key(case.id, "BIRTH_CERTIFICATE")).status


def test_short_native_tokens_do_not_match_inside_words():
    # "مب" (Gulf "no") inside "نمبر" (number) once turned an Urdu yes into "unsure".
    assert nlu.yes_no("جی ہاں، میرے پاس پاسپورٹ نمبر ہے") is True
    assert nlu.yes_no("جی نہیں") is False
    assert nlu.yes_no("जी नहीं") is False
    assert nlu.exception_signals("هل ستتم الموافقة عليه؟").approval_question  # Arabic article prefix
    assert nlu.consulate_milestone("Nailabas na po ang passport") == "PASSPORT_ISSUED"
