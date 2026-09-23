import { useState } from "react";
import { Timeline } from "../components/timeline/Timeline";
import { Card, EmptyState, PageHeader, Skeleton } from "../components/ui/primitives";
import { useLifeTimeline } from "../hooks/queries";
import { useT } from "../i18n";
import { cn } from "../utils/format";

export default function TimelinePage() {
  const t = useT();
  const { data, isLoading } = useLifeTimeline();
  const [filter, setFilter] = useState<string>("all");
  const kinds = [...new Set(data?.items.map((i) => i.case_reference).filter(Boolean) as string[])];
  const items = (data?.items ?? []).filter((i) => filter === "all" || i.case_reference === filter);
  return (
    <>
      <PageHeader eyebrow="Persistent memory" title={t("tl.title")} subtitle={t("tl.subtitle")} />
      {kinds.length > 1 && (
        <div className="mb-6 flex flex-wrap gap-2" role="group" aria-label="Filter by case">
          {["all", ...kinds].map((k) => (
            <button key={k} onClick={() => setFilter(k)} aria-pressed={filter === k} className={cn("rounded-full border px-3.5 py-1.5 text-sm cursor-pointer", filter === k ? "border-ink bg-ink text-paper" : "border-line-2 hover:bg-paper-2")}>{k === "all" ? "All life events" : k}</button>
          ))}
        </div>
      )}
      <Card className="p-6 sm:p-8">
        {isLoading ? <Skeleton className="h-64" /> : items.length === 0 ? <EmptyState title="Your timeline is empty" hint="Every meaningful event of every life event will appear here." /> : <Timeline items={items} showCase />}
      </Card>
    </>
  );
}
