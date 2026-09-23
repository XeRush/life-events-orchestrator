import { motion } from "framer-motion";
import { Plus } from "lucide-react";
import { useState } from "react";
import { stagger } from "../animations/variants";
import { CaseCard } from "../components/cases/CaseCard";
import { NewCaseModal } from "../components/cases/NewCaseModal";
import { Badge, Button, Card, EmptyState, PageHeader, Skeleton } from "../components/ui/primitives";
import { useCases, useTemplates } from "../hooks/queries";
import { useT } from "../i18n";
import { EVENT_ICON } from "../components/cases/CaseCard";

export default function LifeEvents() {
  const t = useT();
  const { data, isLoading } = useCases();
  const { data: templates } = useTemplates();
  const [open, setOpen] = useState(false);
  return (
    <>
      <PageHeader eyebrow="Cases" title={t("nav.lifeEvents")} subtitle="Each life event is one persistent case with its own graph, timeline and passport." actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)}>{t("case.new")}</Button>} />
      {isLoading ? <div className="grid gap-5 md:grid-cols-2"><Skeleton className="h-64" /><Skeleton className="h-64" /></div> :
        data && data.items.length > 0 ? (
          <motion.div variants={stagger} initial="initial" animate="animate" className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {data.items.map((c) => (
              <CaseCard key={c.id} reference={c.reference} title={c.title} eventType={c.event_type} status={c.status} progress={c.progress}
                currentStage={c.current_stage} waitingOn={c.waiting_on} residentActionRequired={c.resident_action_required} />
            ))}
          </motion.div>
        ) : <EmptyState title="No life events yet" hint="Call the assistant or start one here." action={<Button onClick={() => setOpen(true)}>{t("case.new")}</Button>} />}

      <h2 className="mb-4 mt-14 text-2xl">Supported life events</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {templates?.map((tpl) => {
          const Icon = EVENT_ICON[tpl.code];
          return (
            <Card key={tpl.code} className="p-5">
              <div className="mb-3 flex items-center justify-between">{Icon && <Icon className="h-5 w-5 text-muted" aria-hidden />}
                <Badge tone={tpl.is_configured ? "civic" : "slate"}>{tpl.is_configured ? "Fully implemented" : "Definition only"}</Badge></div>
              <h3 className="text-lg">{tpl.name}</h3>
              <p className="mt-1 text-sm text-muted">{tpl.description}</p>
              <p className="mt-3 text-xs text-faint">{tpl.service_count} services in workflow</p>
            </Card>
          );
        })}
      </div>
      <NewCaseModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
