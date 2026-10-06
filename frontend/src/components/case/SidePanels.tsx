import { CheckCircle2, MessageCircle, Phone, PhoneIncoming, PhoneOutgoing, Settings } from "lucide-react";
import { Link } from "react-router-dom";
import { casesApi } from "../../api";
import { useAction } from "../../hooks/queries";
import { LANGUAGES, useLang, useT } from "../../i18n";
import { cn, duration, fmtDate, fmtDateTime, relative } from "../../lib/format";
import { SOURCE, TONE } from "../../lib/status";
import type { CallbackItem, CallView, CaseView, Source } from "../../types/api";
import { Badge, Button, KeyValue } from "../ui/primitives";
import { CallbackBadge, DocBadge, MockBadge, SourceBadge } from "../ui/StatusBadge";
import { Panel } from "./CaseBits";
import { asEmirate, fmtDay, tx } from "./text";

/** Documents the case is waiting for (missing or expired). */
export function DocumentsDue({ view }: { view: CaseView }) {
  const t = useT();
  const docs = view.outstanding_documents;
  return (
    <Panel id="docs-due" title={t("resident.docsDue.title")}
      action={<Link to={`/app/cases/${view.reference}/documents`} className="-my-2 inline-flex min-h-10 shrink-0 items-center text-sm font-medium text-azure underline-offset-4 hover:underline">{t("resident.docsDue.open")}</Link>}>
      {docs.length === 0 ? (
        <p className="flex items-start gap-2 text-sm text-ink-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-civic" aria-hidden />{t("resident.docsDue.none")}</p>
      ) : (
        <ul className="divide-y divide-line">
          {docs.map((d) => (
            <li key={d.doc_type} className="flex items-start justify-between gap-3 py-2.5 text-sm">
              <span className="min-w-0">{tx(t, `resident.doc.type.${d.doc_type}`, d.title)}</span>
              <DocBadge status={d.status} />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/** How LifeLoop may contact the resident: voice + SMS, or SMS only after "stop calling"; and the callback consent. */
export function ContactPanel({ view }: { view: CaseView }) {
  const t = useT();
  const lang = useLang();
  const sms = view.channel_mode === "SMS_ONLY";
  return (
    <Panel id="contact" title={t("resident.contact.title")}
      action={<Link to="/app/settings" aria-label={t("resident.contact.manage")} className="-me-2 -mt-1.5 grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-paper-2 hover:text-ink"><Settings className="h-4 w-4" aria-hidden /></Link>}>
      <div className="flex items-start gap-3">
        <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full", sms ? "bg-violet-soft text-violet" : "bg-civic-soft text-civic")}>
          {sms ? <MessageCircle className="h-4 w-4" aria-hidden /> : <Phone className="h-4 w-4" aria-hidden />}
        </span>
        <div className="min-w-0 text-sm">
          <p className="font-medium">{sms ? t("resident.contact.smsOnly") : t("resident.contact.voice")}</p>
          <p className="mt-0.5 text-muted">
            {sms
              ? t("resident.contact.smsOnlyHint", { date: fmtDate(view.opted_out_at, lang) })
              : view.consent.callback ? t("resident.contact.voiceHint") : t("resident.contact.noConsentHint")}
          </p>
        </div>
      </div>
      <KeyValue className="mt-3" items={[
        { label: t("resident.contact.callbackConsent"), value: view.consent.callback ? t("resident.contact.granted") : t("resident.contact.notGranted") },
        ...(view.consent.callback ? [{ label: t("resident.contact.token"), value: view.consent.token_present ? t("resident.contact.tokenYes") : t("resident.contact.tokenNo") }] : []),
        ...(view.consent.captured_at ? [{ label: t("resident.contact.since"), value: fmtDate(view.consent.captured_at, lang) }] : []),
      ]} />
      <Link to="/app/settings" className="mt-1 inline-flex min-h-10 items-center text-sm font-medium text-azure underline-offset-4 hover:underline">{t("resident.contact.manage")}</Link>
    </Panel>
  );
}

/** Scheduled and past callbacks, with an explicit way to ask for one (consent and opt-out are enforced by the API). */
export function CallbacksPanel({ view, callbacks }: { view: CaseView; callbacks: CallbackItem[] | undefined }) {
  const t = useT();
  const lang = useLang();
  const request = useAction(() => casesApi.requestCallback(view.reference), {
    success: (r) => (r.status === "SCHEDULED" || r.status === "DIALING" ? t("resident.callbacks.requested") : t("resident.callbacks.notPlaced")),
  });
  const items = [...(callbacks ?? [])].sort((a, b) => b.scheduled_for.localeCompare(a.scheduled_for)).slice(0, 5);
  const canCall = view.channel_mode === "VOICE" && view.consent.callback;
  return (
    <Panel id="callbacks" title={t("resident.callbacks.title")}>
      {items.length === 0 ? (
        <p className="text-sm text-muted">{t("resident.callbacks.none")}</p>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((cb) => {
            const r = cb.reasons[0];
            const step = r?.node_key ? tx(t, `node.${r.node_key}`, r.node_title ?? "") : "";
            return (
              <li key={cb.id} className="py-2.5 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 font-medium">{tx(t, `resident.callbacks.reason.${cb.reason}`, cb.reason, { step })}</span>
                  <CallbackBadge status={cb.status} />
                </div>
                <p className="mt-0.5 text-xs text-muted num">
                  {cb.status === "SCHEDULED" ? t("resident.callbacks.when", { when: relative(cb.scheduled_for, lang) }) : fmtDateTime(cb.completed_at ?? cb.dialed_at ?? cb.scheduled_for, lang)}
                </p>
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-3 border-t border-line pt-3">
        <Button size="sm" variant="secondary" className="min-h-10 sm:min-h-8" icon={<PhoneIncoming className="h-4 w-4" aria-hidden />} onClick={() => request.mutate(undefined)} loading={request.isPending} disabled={!canCall}>
          {t("resident.callbacks.request")}
        </Button>
        {!canCall && <p className="mt-2 text-xs text-muted">{view.channel_mode === "SMS_ONLY" ? t("resident.callbacks.blockedOptOut") : t("resident.callbacks.blockedConsent")}</p>}
      </div>
    </Panel>
  );
}

/** The latest calls on the case, inbound and outbound. */
export function RecentCalls({ calls }: { calls: CallView[] | undefined }) {
  const t = useT();
  const lang = useLang();
  const items = (calls ?? []).slice(0, 4);
  return (
    <Panel id="calls" title={t("resident.calls.title")}
      action={<Link to="/app/voice" className="-my-2 inline-flex min-h-10 shrink-0 items-center text-sm font-medium text-azure underline-offset-4 hover:underline">{t("resident.calls.new")}</Link>}>
      {items.length === 0 ? (
        <p className="text-sm text-muted">{t("resident.calls.none")}</p>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((c) => {
            const Icon = c.direction === "OUTBOUND" ? PhoneOutgoing : PhoneIncoming;
            return (
              <li key={c.id} className="flex items-start gap-3 py-2.5 text-sm">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{c.direction === "OUTBOUND" ? t("resident.calls.outbound") : t("resident.calls.inbound")}</p>
                  <p className="text-xs text-muted num">
                    {t("resident.calls.meta", { when: fmtDateTime(c.started_at, lang), length: duration(c.duration_seconds) })}
                  </p>
                  {c.outcome && <p className="mt-0.5 text-xs text-ink-2">{c.outcome}</p>}
                </div>
                <Badge tone={c.provider === "ELEVENLABS" ? "ink" : "slate"} className="shrink-0">
                  {c.provider === "ELEVENLABS" ? t("resident.voice.provider.elevenlabs") : t("resident.voice.provider.simulatedShort")}
                </Badge>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

/** The facts LifeLoop holds for this case (captured once at intake). Emirates IDs only ever appear masked.
 * `wide` lays the facts out in two columns from the sm breakpoint. */
export function CaseFacts({ view, wide = false }: { view: CaseView; wide?: boolean }) {
  const t = useT();
  const lang = useLang();
  const emirate = asEmirate(view.emirate);
  const items = [
    ...(view.child ? [
      { label: t("resident.facts.child"), value: view.child.full_name_en },
      { label: t("resident.facts.born"), value: t("resident.facts.bornValue", { date: fmtDay(view.child.date_of_birth, lang, { day: "numeric", month: "short", year: "numeric" }), place: view.child.place_of_birth }) },
      { label: t("resident.facts.nationality"), value: view.child.nationality },
    ] : []),
    ...view.parents.map((p) => ({
      label: p.role === "MOTHER" ? t("resident.facts.mother") : p.role === "FATHER" ? t("resident.facts.father") : t("resident.facts.parent"),
      value: <span>{p.full_name}{p.emirates_id && <span className="block font-mono text-[11px] font-normal text-faint" dir="ltr">{p.emirates_id}</span>}</span>,
    })),
    { label: t("resident.facts.emirate"), value: emirate ? t(`resident.emirate.${emirate}`) : view.emirate },
    { label: t("resident.facts.language"), value: LANGUAGES.find((l) => l.code === view.language)?.native ?? view.language },
    ...(view.assigned_officer ? [{ label: t("resident.facts.officer"), value: view.assigned_officer.full_name }] : []),
    ...(view.organization ? [{ label: t("resident.facts.centre"), value: view.organization.name }] : []),
    { label: t("resident.facts.opened"), value: fmtDate(view.created_at, lang) },
  ];
  return (
    <Panel id="facts" title={t("resident.facts.title")}>
      {wide ? (
        <div className="grid gap-x-8 sm:grid-cols-2">
          <KeyValue items={items.slice(0, Math.ceil(items.length / 2))} />
          <KeyValue items={items.slice(Math.ceil(items.length / 2))} className="border-t border-line sm:border-t-0" />
        </div>
      ) : <KeyValue items={items} />}
      <p className="mt-3 text-xs text-muted">{t("resident.facts.captured", { n: view.passport.fields_captured })}</p>
    </Panel>
  );
}

const KEY_SOURCES: Source[] = ["AI_AGENT", "GOVERNMENT_MOCK", "PARENT_REPORTED", "HUMAN_OFFICER"];

/** Who said it: the four voices in a case, with what each one means. */
export function SourceKey({ detailed = false, sources = KEY_SOURCES, className }: { detailed?: boolean; sources?: Source[]; className?: string }) {
  const t = useT();
  if (!detailed) {
    return (
      <div className="flex flex-wrap items-center gap-1.5" aria-label={t("resident.sources.title")}>
        {sources.map((s) => <SourceBadge key={s} source={s} />)}
        <MockBadge compact className="ms-1" />
      </div>
    );
  }
  return (
    <ul className={className ?? "space-y-3"}>
      {sources.map((s) => {
        const m = SOURCE[s];
        const Icon = m.icon;
        return (
          <li key={s} className="flex items-start gap-3">
            <span className={cn("mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full", TONE[m.tone].bg, TONE[m.tone].text)}><Icon className="h-3.5 w-3.5" aria-hidden /></span>
            <span className="min-w-0 text-sm">
              <span className="block font-medium">{t(`source.${s}`)}</span>
              <span className="block text-muted">{t(`resident.sources.${s}`)}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
