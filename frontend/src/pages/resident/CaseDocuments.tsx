import { motion, useReducedMotion, type Variants } from "framer-motion";
import { Info } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { FIX_DOCUMENTS } from "../../bones/fixtures/resident";
import { CaseError, CaseHeader } from "../../components/case/CaseBits";
import { DocumentRow } from "../../components/documents/DocumentRow";
import { UploadZone } from "../../components/documents/UploadZone";
import { Bones } from "../../components/ui/Bones";
import { Tabs } from "../../components/ui/primitives";
import { DocBadge, MockBadge } from "../../components/ui/StatusBadge";
import { useDocuments } from "../../hooks/queries";
import { useLiveStream } from "../../hooks/useLiveStream";
import { useT } from "../../i18n";
import type { DocStatus, DocumentCenter, DocumentItem } from "../../types/api";

const CATEGORIES = ["PARENT", "CHILD", "MARRIAGE_CERTIFICATE", "BIRTH_CERTIFICATE", "PASSPORT", "VISA", "EMIRATES_ID", "INSURANCE"] as const;
const STATUS_ORDER: DocStatus[] = ["MISSING", "EXPIRED", "REQUIRED", "UPLOADED", "VERIFIED", "NOT_APPLICABLE"];
type Filter = "all" | "needed" | "provided" | "issued";
const EASE = [0.22, 1, 0.36, 1] as const;
const stack: Variants = { hidden: {}, shown: { transition: { staggerChildren: 0.05 } } };
const rise: Variants = { hidden: { opacity: 0, y: 12 }, shown: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } } };

const matches = (d: DocumentItem, f: Filter) =>
  f === "all" ? true
    : f === "needed" ? !d.is_output && (d.status === "MISSING" || d.status === "EXPIRED" || d.status === "REQUIRED")
    : f === "provided" ? !d.is_output && (d.status === "UPLOADED" || d.status === "VERIFIED")
    : d.is_output;

/** Document Center: the list (filterable, grouped by kind) beside the upload zone and the summary. */
export function DocumentsView({ center, reference }: { center: DocumentCenter; reference: string }) {
  const t = useT();
  const reduce = useReducedMotion();
  const [filter, setFilter] = useState<Filter>("all");
  const all = useMemo(() => Object.values(center.groups).flat(), [center]);
  const counts = STATUS_ORDER.filter((s) => (center.counts[s] ?? 0) > 0);
  const count = (f: Filter) => all.filter((d) => matches(d, f)).length;
  const empty = CATEGORIES.every((cat) => !(center.groups[cat] ?? []).some((d) => matches(d, filter)));

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
      <div className="space-y-4 lg:sticky lg:top-20 lg:col-start-2 lg:row-start-1">
        <div className="flex items-start gap-3 rounded-2xl border border-azure/25 bg-azure-soft/50 px-4 py-3 text-sm leading-relaxed text-ink-2" role="note">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-azure" aria-hidden />
          <div className="min-w-0">
            <p>{center.disclaimer}</p>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-muted"><MockBadge compact />{t("resident.docs.mockNote")}</p>
          </div>
        </div>
        {counts.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label={t("resident.docs.summary")} aria-live="polite">
            {counts.map((s) => (
              <li key={s} className="inline-flex items-center gap-2 rounded-full border border-line bg-surface py-1 pe-3 ps-1">
                <DocBadge status={s} />
                <span className="text-sm font-medium num">{center.counts[s]}</span>
              </li>
            ))}
          </ul>
        )}
        <UploadZone reference={reference} docs={all} />
      </div>

      <div className="min-w-0 lg:col-start-1 lg:row-start-1">
        <div className="-mx-4 mb-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0" data-lenis-prevent>
          <Tabs<Filter> value={filter} onChange={setFilter} items={[
            { value: "all", label: t("resident.docs.filter.all"), count: count("all") },
            { value: "needed", label: t("resident.docs.filter.needed"), count: count("needed") },
            { value: "provided", label: t("resident.docs.filter.provided"), count: count("provided") },
            { value: "issued", label: t("resident.docs.filter.issued"), count: count("issued") },
          ]} />
        </div>

        <motion.div key={filter} className="space-y-6" initial={reduce ? false : "hidden"} animate="shown" variants={stack}>
          {CATEGORIES.map((cat) => {
            const items = (center.groups[cat] ?? []).filter((d) => matches(d, filter))
              .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status));
            if (!items.length) return null;
            return (
              <motion.section key={cat} aria-labelledby={`cat-${cat}`} variants={rise}>
                <div className="mb-2.5">
                  <h2 id={`cat-${cat}`} className="text-xl">{t(`resident.docs.cat.${cat}`)}</h2>
                  <p className="mt-0.5 text-sm text-muted">{t(`resident.docs.catHint.${cat}`)}</p>
                </div>
                <ul className="space-y-2.5">{items.map((d) => <DocumentRow key={d.id} doc={d} reference={reference} />)}</ul>
              </motion.section>
            );
          })}
          {empty && (
            <motion.p variants={rise} className="rounded-2xl border border-dashed border-line-2 px-5 py-6 text-sm text-muted">{t(`resident.docs.empty.${filter}`)}</motion.p>
          )}
        </motion.div>
      </div>
    </div>
  );
}

/** Skeleton for the documents page; the same wrapper is rendered on /__bones for capture. */
export function DocumentsBones({ loading = true, children = null }: { loading?: boolean; children?: ReactNode }) {
  return (
    <Bones name="res-documents" loading={loading} lines={10}
      fixture={import.meta.env.DEV ? <DocumentsView center={FIX_DOCUMENTS} reference="LL-DEMO-001" /> : undefined}>
      {children}
    </Bones>
  );
}

/** Document Center: what each step needs, what you have provided, and what mock authorities have issued. */
export default function CaseDocuments() {
  const t = useT();
  const { ref = "" } = useParams();
  const docs = useDocuments(ref);
  const live = useLiveStream(ref);

  if (docs.isError || (!docs.isLoading && !docs.data)) return <CaseError error={docs.error} onRetry={() => docs.refetch()} />;
  return (
    <div>
      <CaseHeader reference={ref} title={t("resident.docs.title")} subtitle={t("resident.docs.subtitle")} connected={live.connected} />
      <DocumentsBones loading={docs.isLoading}>
        {docs.data && <DocumentsView center={docs.data} reference={ref} />}
      </DocumentsBones>
    </div>
  );
}
