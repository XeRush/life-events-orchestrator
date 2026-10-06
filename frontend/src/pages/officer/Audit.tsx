import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Filter, ScrollText, X } from "lucide-react";
import { useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { officerApi } from "../../api";
import { AuditTable } from "../../components/officer/lists";
import { ACTOR_TYPES, EmptyNote, Notice, PageHead, SELECT_CLS, useTx } from "../../components/officer/kit";
import { Bones } from "../../components/ui/Bones";
import { Button, ErrorState } from "../../components/ui/primitives";
import { useT } from "../../i18n";
import { cn } from "../../lib/format";

const LIMIT = 50;
const INPUT_CLS = "h-10 w-full rounded-full border border-line-2 bg-surface px-4 text-sm outline-none transition-colors placeholder:text-faint focus:border-ink/50 focus:ring-2 focus:ring-ink/10";

export default function Audit() {
  const t = useT();
  const tx = useTx();
  const [params, setParams] = useSearchParams();
  const applied = { case: params.get("case") ?? "", action: params.get("action") ?? "", actor_type: params.get("actor_type") ?? "" };
  const offset = Math.max(0, Number(params.get("offset") ?? 0) || 0);
  const [draft, setDraft] = useState(applied);

  const query = { case: applied.case || undefined, action: applied.action || undefined, actor_type: applied.actor_type || undefined, limit: LIMIT, offset };
  // Same key and fetcher as useAudit, keeping the previous page visible while the next one loads.
  const q = useQuery({ queryKey: ["officer", "audit", query], queryFn: () => officerApi.audit(query), placeholderData: keepPreviousData });
  const key = `${applied.case}|${applied.action}|${applied.actor_type}|${offset}`;
  const settled = useRef(key);
  if (!q.isPlaceholderData && q.data) settled.current = key;

  const apply = (next: typeof applied, nextOffset = 0) => {
    const n = new URLSearchParams();
    if (next.case.trim()) n.set("case", next.case.trim().toUpperCase());
    if (next.action.trim()) n.set("action", next.action.trim());
    if (next.actor_type) n.set("actor_type", next.actor_type);
    if (nextOffset) n.set("offset", String(nextOffset));
    setParams(n);
  };
  const filtered = !!(applied.case || applied.action || applied.actor_type);
  const total = q.data?.total ?? 0;
  const items = q.data?.items ?? [];
  const from = total ? offset + 1 : 0;
  const to = Math.min(offset + LIMIT, total);
  const denied = items.filter((a) => a.result.toUpperCase() === "DENIED").length;

  return (
    <div className="space-y-5">
      <PageHead eyebrow={t("officer.audit.eyebrow")} title={t("officer.audit.title")} subtitle={t("officer.audit.subtitle")} />

      <form
        role="search"
        aria-label={t("officer.audit.filters")}
        className="card grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          apply(draft);
        }}
      >
        <label className="block min-w-0">
          <span className="eyebrow mb-1.5 block">{t("officer.audit.filterCase")}</span>
          <input className={cn(INPUT_CLS, "font-mono")} value={draft.case} maxLength={40} placeholder={t("officer.audit.filterCasePh")} onChange={(e) => setDraft({ ...draft, case: e.target.value })} dir="ltr" />
        </label>
        <label className="block min-w-0">
          <span className="eyebrow mb-1.5 block">{t("officer.audit.filterAction")}</span>
          <input className={cn(INPUT_CLS, "font-mono")} value={draft.action} maxLength={80} placeholder={t("officer.audit.filterActionPh")} onChange={(e) => setDraft({ ...draft, action: e.target.value })} dir="ltr" />
        </label>
        <label className="block min-w-0">
          <span className="eyebrow mb-1.5 block">{t("officer.audit.filterActor")}</span>
          <select className={cn(SELECT_CLS, "w-full")} value={draft.actor_type} onChange={(e) => { const next = { ...draft, actor_type: e.target.value }; setDraft(next); apply(next); }}>
            <option value="">{t("officer.audit.anyActor")}</option>
            {ACTOR_TYPES.map((a) => <option key={a} value={a}>{tx(`officer.actorType.${a}`)}</option>)}
          </select>
        </label>
        <div className="flex items-end gap-2">
          <Button type="submit" icon={<Filter className="h-4 w-4" aria-hidden />}>{t("officer.audit.apply")}</Button>
          {filtered && (
            <Button variant="ghost" icon={<X className="h-4 w-4" aria-hidden />} onClick={() => { const empty = { case: "", action: "", actor_type: "" }; setDraft(empty); apply(empty); }}>
              {t("officer.audit.clear")}
            </Button>
          )}
        </div>
      </form>

      <section aria-label={t("officer.audit.caption")} className="space-y-3">
        <Notice tone="slate" icon={ScrollText}>{t("officer.audit.note")}</Notice>

        <div className="flex min-h-4 flex-wrap items-center justify-between gap-3 text-xs text-muted" aria-live="polite">
          <span>
            {q.isSuccess && t("officer.audit.range", { from, to, total })}
            {denied > 0 && <span className="ms-2 font-medium text-rose">{t("officer.audit.deniedOnPage", { n: denied })}</span>}
          </span>
          {q.isFetching && !q.isLoading && <span>{t("officer.common.refreshing")}</span>}
        </div>

        <Bones name="staff-audit" loading={q.isLoading} lines={8}>
          {q.error ? (
            <ErrorState error={q.error} onRetry={() => q.refetch()} />
          ) : q.data && !items.length ? (
            <EmptyNote icon={<ScrollText aria-hidden />} title={t("officer.audit.empty")} hint={filtered ? t("officer.audit.emptyFiltered") : undefined} />
          ) : q.data ? (
            <div className={cn("transition-opacity duration-300", q.isPlaceholderData && "opacity-60")}>
              <AuditTable items={items} expandable caption={t("officer.audit.caption")} setKey={settled.current} maxH="max-h-[calc(100vh-14rem)]" />
            </div>
          ) : null}
        </Bones>

        {total > LIMIT && (
          <nav aria-label={t("officer.audit.pagination")} className="flex flex-wrap items-center justify-start gap-2 sm:justify-end">
            <Button size="sm" variant="secondary" className="max-sm:min-h-10" disabled={offset === 0} icon={<ChevronLeft className="h-4 w-4 rtl-flip" aria-hidden />} onClick={() => apply(applied, Math.max(0, offset - LIMIT))}>
              {t("officer.audit.prev")}
            </Button>
            <span className="num px-2 text-sm text-muted">{t("officer.audit.page", { page: Math.floor(offset / LIMIT) + 1, pages: Math.ceil(total / LIMIT) })}</span>
            <Button size="sm" variant="secondary" className="max-sm:min-h-10" disabled={offset + LIMIT >= total} onClick={() => apply(applied, offset + LIMIT)}>
              {t("officer.audit.next")}<ChevronRight className="h-4 w-4 rtl-flip" aria-hidden />
            </Button>
          </nav>
        )}
      </section>
    </div>
  );
}
