import { FileUp } from "lucide-react";
import { useState } from "react";
import { useT } from "../../i18n";
import type { DocumentItem } from "../../types/api";
import { tx } from "../case/text";
import { SelectField } from "../ui/primitives";
import { DropTarget, FilePicker, MAX_MB, SuccessCheck, UploadProgress, useUpload } from "./upload";

/** One place to add any document: choose which one it is, then drop the file or browse for it.
 * Stacks in a narrow side column; sits side by side from md until lg (where it moves into the side column). */
export function UploadZone({ reference, docs }: { reference: string; docs: DocumentItem[] }) {
  const t = useT();
  const options = docs.filter((d) => !d.is_output && d.status !== "NOT_APPLICABLE");
  const firstNeeded = options.find((d) => d.status === "MISSING" || d.status === "EXPIRED") ?? options.find((d) => d.status === "REQUIRED") ?? options[0];
  const [docType, setDocType] = useState<string>(firstNeeded?.doc_type ?? "");
  const upload = useUpload(reference);
  const chosen = options.find((d) => d.doc_type === docType) ?? firstNeeded;
  if (!chosen) return null;
  const send = (file: File) => upload.send(chosen.doc_type, file);
  return (
    <section aria-labelledby="upload-zone-title" className="card p-4 sm:p-5">
      <h2 id="upload-zone-title" className="text-lg leading-snug">{t("resident.docs.zone.title")}</h2>
      <p className="mt-1 text-sm text-muted">{t("resident.docs.zone.hint", { mb: MAX_MB })}</p>
      <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,260px)_1fr] md:items-stretch lg:grid-cols-1">
        <SelectField label={t("resident.docs.zone.which")} value={chosen.doc_type} onChange={(e) => { setDocType(e.target.value); upload.setError(null); }}>
          {options.map((d) => (
            <option key={d.doc_type} value={d.doc_type}>
              {t("resident.docs.zone.option", { doc: tx(t, `resident.doc.type.${d.doc_type}`, d.title), status: t(`doc.${d.status}`) })}
            </option>
          ))}
        </SelectField>
        <DropTarget onFile={send} disabled={upload.pending}
          className="flex min-h-28 flex-col items-start justify-center gap-2 rounded-2xl border-2 border-dashed border-line-2 bg-paper/60 px-4 py-4 transition-colors">
          <span className="flex items-start gap-2.5">
            <FileUp className="mt-0.5 h-5 w-5 shrink-0 text-muted" aria-hidden />
            <span className="text-sm text-ink-2">{t("resident.docs.zone.drop", { doc: tx(t, `resident.doc.type.${chosen.doc_type}`, chosen.title) })}</span>
          </span>
          <FilePicker onFile={send} loading={upload.pending} label={t("resident.docs.zone.browse")} size="md" />
        </DropTarget>
      </div>
      <UploadProgress active={upload.pending} className="mt-3" />
      <div className="mt-2 min-h-0" aria-live="polite"><SuccessCheck show={upload.done} label={t("resident.docs.uploaded")} /></div>
      {upload.error && <p role="alert" className="mt-2 text-sm text-rose">{upload.error}</p>}
    </section>
  );
}
