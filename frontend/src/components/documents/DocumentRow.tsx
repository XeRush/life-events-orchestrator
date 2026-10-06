import { FileCheck2, FileText, FileWarning, Hourglass, Landmark } from "lucide-react";
import { useLang, useT } from "../../i18n";
import { cn, fmtDate } from "../../lib/format";
import type { DocumentItem } from "../../types/api";
import { fmtDay, formatBytes, tx } from "../case/text";
import { Badge } from "../ui/primitives";
import { DocBadge, MockBadge } from "../ui/StatusBadge";
import { DropTarget, FilePicker, SuccessCheck, UploadProgress, useUpload } from "./upload";

/** Mock authorities' output labels always carry "(mock)" - LifeLoop never presents simulated output as real. */
const issuer = (by: string) => (/\(mock\)/i.test(by) ? by : `${by} (mock)`);

/**
 * One document: what it is, which step needs it, its honest status and, if the resident provides it, an upload
 * control that also accepts a dropped file. Outputs issued by mock authorities cannot be uploaded over.
 */
export function DocumentRow({ doc, reference }: { doc: DocumentItem; reference: string }) {
  const t = useT();
  const lang = useLang();
  const upload = useUpload(reference);
  const uploadable = !doc.is_output && doc.status !== "NOT_APPLICABLE";
  const step = doc.node_key ? t(`node.${doc.node_key}`) : null;
  const title = tx(t, `resident.doc.type.${doc.doc_type}`, doc.title);
  const issued = doc.is_output && doc.status === "UPLOADED" && doc.source === "GOVERNMENT_MOCK";

  let line: string;
  if (issued) line = t("resident.docs.line.issued", { by: issuer(doc.issued_by ?? t("resident.docs.authority")), date: fmtDate(doc.uploaded_at, lang) });
  else if (doc.is_output) line = step ? t("resident.docs.line.output", { step }) : t("resident.docs.line.outputGeneric");
  else if (doc.status === "VERIFIED") line = t("resident.docs.line.verified", { date: fmtDate(doc.verified_at, lang) });
  else if (doc.status === "UPLOADED") line = t("resident.docs.line.uploaded", { file: doc.file_name ?? title, size: formatBytes(doc.size_bytes), date: fmtDate(doc.uploaded_at, lang) });
  else if (doc.status === "MISSING") line = step ? t("resident.docs.line.missing", { step }) : t("resident.docs.line.missingGeneric");
  else if (doc.status === "EXPIRED") line = t("resident.docs.line.expired");
  else if (doc.status === "NOT_APPLICABLE") line = t("resident.docs.line.na");
  else if (doc.declared_available) line = t("resident.docs.line.declared");
  else line = t("resident.docs.line.required");

  const Icon = issued ? Landmark : doc.status === "VERIFIED" || doc.status === "UPLOADED" ? FileCheck2 : doc.status === "MISSING" || doc.status === "EXPIRED" ? FileWarning : FileText;
  const attention = doc.status === "MISSING" || doc.status === "EXPIRED";

  const body = (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
      <Icon className={cn("mt-0.5 hidden h-5 w-5 shrink-0 sm:block", attention ? "text-amber" : issued || doc.status === "VERIFIED" ? "text-civic" : "text-muted")} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-sans text-[15px] font-medium tracking-normal">{title}</h3>
          {doc.is_output && !issued && doc.status !== "NOT_APPLICABLE"
            ? <Badge tone="slate" icon={<Hourglass className="h-3.5 w-3.5" aria-hidden />}>{t("resident.docs.notIssued")}</Badge>
            : <DocBadge status={doc.status} />}
          {doc.is_output && <MockBadge compact />}
        </div>
        <p className="mt-1 text-sm leading-relaxed text-ink-2">{line}</p>
        {doc.notes && <p className="mt-1 text-[13px] leading-relaxed text-muted">{doc.notes}</p>}
        {step && !doc.is_output && <p className="mt-1 text-xs text-faint">{t("resident.docs.neededFor", { step })}</p>}
        {doc.expires_on && <p className="mt-1 text-xs text-faint">{t("resident.docs.expires", { date: fmtDay(doc.expires_on, lang) })}</p>}
        {upload.error && <p role="alert" className="mt-2 text-sm text-rose">{upload.error}</p>}
        <UploadProgress active={upload.pending} className="mt-2.5 max-w-xs" />
        <div aria-live="polite"><SuccessCheck show={upload.done} label={t("resident.docs.done")} /></div>
      </div>
      {uploadable && (
        <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
          <FilePicker
            onFile={(f) => upload.send(doc.doc_type, f)}
            loading={upload.pending}
            label={doc.status === "UPLOADED" || doc.status === "VERIFIED" ? t("resident.docs.replace") : t("resident.docs.upload")}
            variant={attention ? "primary" : "secondary"}
            size="md"
          />
          <span className="hidden text-[11px] text-faint lg:block">{t("resident.docs.dropHint")}</span>
        </div>
      )}
    </div>
  );

  return (
    <li>
      {uploadable ? (
        <DropTarget onFile={(f) => upload.send(doc.doc_type, f)} disabled={upload.pending}
          className={cn("rounded-2xl border bg-surface p-4 transition-[border-color,box-shadow] duration-300 hover:shadow-[var(--shadow-card)]", attention ? "border-amber/50" : "border-line")}>
          {body}
        </DropTarget>
      ) : (
        <div className={cn("rounded-2xl border p-4", issued ? "border-civic/30 bg-civic-soft/30" : "border-dashed border-line-2 bg-transparent")}>{body}</div>
      )}
    </li>
  );
}
