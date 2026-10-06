import { type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { FIX_TIMELINE } from "../../bones/fixtures/resident";
import { Reveal } from "../../animations/motion";
import { CaseError, CaseHeader, Panel } from "../../components/case/CaseBits";
import { SourceKey } from "../../components/case/SidePanels";
import { CaseTimeline } from "../../components/timeline/CaseTimeline";
import { Bones } from "../../components/ui/Bones";
import { EmptyState } from "../../components/ui/primitives";
import { MockBadge } from "../../components/ui/StatusBadge";
import { useTimeline } from "../../hooks/queries";
import { useLiveStream } from "../../hooks/useLiveStream";
import { useLang, useT } from "../../i18n";
import { relative } from "../../lib/format";
import type { Source, TimelineEvent } from "../../types/api";

const ALL_SOURCES: Source[] = ["AI_AGENT", "GOVERNMENT_MOCK", "PARENT_REPORTED", "HUMAN_OFFICER", "RESIDENT", "SYSTEM"];

/** The full timeline beside the colour key. Presentational: events come in as props. */
export function TimelineView({ items, total }: { items: TimelineEvent[]; total: number }) {
  const t = useT();
  const lang = useLang();
  const latest = items.reduce<string | null>((max, e) => (!max || e.occurred_at > max ? e.occurred_at : max), null);
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
      <section aria-labelledby="timeline-list-title" className="min-w-0">
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 id="timeline-list-title" className="text-xl num" aria-live="polite">{t("resident.timeline.count", { n: total })}</h2>
          {latest && <p className="text-sm text-muted">{t("resident.timeline.latest", { when: relative(latest, lang) })}</p>}
        </div>
        <p className="mb-3 text-sm text-muted">{t("resident.timeline.filterHint")}</p>
        {items.length === 0 ? <EmptyState title={t("resident.timeline.emptyTitle")} hint={t("resident.timeline.emptyHint")} />
          : <CaseTimeline events={items} />}
      </section>

      <Reveal className="space-y-4 lg:sticky lg:top-20" y={12}>
        <Panel id="colours" title={t("resident.timeline.coloursTitle")}>
          <p className="mb-3 text-sm text-muted">{t("resident.timeline.coloursHint")}</p>
          <SourceKey detailed sources={ALL_SOURCES} />
        </Panel>
        <p className="flex items-start gap-2 px-1 text-xs leading-relaxed text-muted">
          <MockBadge compact />
          <span>{t("resident.dash.mockNote")}</span>
        </p>
      </Reveal>
    </div>
  );
}

/** Skeleton for the timeline page; the same wrapper is rendered on /__bones for capture. */
export function TimelineBones({ loading = true, children = null }: { loading?: boolean; children?: ReactNode }) {
  return (
    <Bones name="res-timeline" loading={loading} lines={10}
      fixture={import.meta.env.DEV ? <TimelineView items={FIX_TIMELINE} total={FIX_TIMELINE.length} /> : undefined}>
      {children}
    </Bones>
  );
}

/** Every event in the case, in order, with who reported it. Updates live; filter by source. */
export default function CaseTimelinePage() {
  const t = useT();
  const { ref = "" } = useParams();
  const timeline = useTimeline(ref);
  const live = useLiveStream(ref);

  if (timeline.isError || (!timeline.isLoading && !timeline.data)) return <CaseError error={timeline.error} onRetry={() => timeline.refetch()} />;
  return (
    <div>
      <CaseHeader reference={ref} title={t("resident.timeline.title")} subtitle={t("resident.timeline.subtitle")} connected={live.connected} />
      <TimelineBones loading={timeline.isLoading}>
        {timeline.data && <TimelineView items={timeline.data.items} total={timeline.data.total} />}
      </TimelineBones>
    </div>
  );
}
