import { motion } from "framer-motion";
import { stagger } from "../animations/variants";
import { EntityCard } from "../components/entities/EntityCard";
import { EmptyState, PageHeader, Skeleton } from "../components/ui/primitives";
import { useEntities } from "../hooks/queries";
import { useT } from "../i18n";

export default function Entities() {
  const t = useT();
  const { data, isLoading, isError } = useEntities();
  return (
    <>
      <PageHeader eyebrow="Multi-entity orchestration" title={t("ent.title")} subtitle={t("ent.subtitle")} />
      {isError ? <EmptyState title="Operator access required" hint="Entity operations are visible to operators and admins only." /> :
        isLoading ? <div className="grid gap-5 lg:grid-cols-2"><Skeleton className="h-72" /><Skeleton className="h-72" /></div> : (
          <motion.div variants={stagger} initial="initial" animate="animate" className="grid gap-5 lg:grid-cols-2">
            {data?.map((e) => <EntityCard key={e.id} e={e} />)}
          </motion.div>
        )}
    </>
  );
}
