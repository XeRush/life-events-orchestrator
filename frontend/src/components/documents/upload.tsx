import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Upload } from "lucide-react";
import { useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import { casesApi } from "../../api";
import { isRTL, useLang, useT, type MessageKey } from "../../i18n";
import { cn } from "../../lib/format";
import { useUI } from "../../stores/ui";
import { Button } from "../ui/primitives";

export const ACCEPT = "application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg";
const TYPES = ["application/pdf", "image/png", "image/jpeg"];
export const MAX_MB = 10;

/** Same rules as the API (PDF / PNG / JPEG, 10 MB), checked before anything is sent. The API re-checks the bytes. */
export function validateFile(file: File): MessageKey | null {
  if (file.size === 0) return "resident.docs.err.empty";
  if (!TYPES.includes(file.type) && !/\.(pdf|png|jpe?g)$/i.test(file.name)) return "resident.docs.err.type";
  if (file.size > MAX_MB * 1024 * 1024) return "resident.docs.err.size";
  return null;
}

/** Upload one file for one document type; errors are returned to the caller to show next to the control. */
export function useUpload(reference: string) {
  const t = useT();
  const qc = useQueryClient();
  const toast = useUI((s) => s.toast);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return;
    const id = window.setTimeout(() => setDone(false), 2600);
    return () => window.clearTimeout(id);
  }, [done]);
  const mutation = useMutation({
    mutationFn: ({ docType, file }: { docType: string; file: File }) => casesApi.uploadDocument(reference, docType, file),
    onSuccess: () => {
      setError(null);
      setDone(true);
      toast("success", t("resident.docs.uploaded"));
      qc.invalidateQueries({ queryKey: ["documents", reference] });
      qc.invalidateQueries({ queryKey: ["case", reference] });
      qc.invalidateQueries({ queryKey: ["timeline", reference] });
      qc.invalidateQueries({ queryKey: ["graph", reference] });
    },
    onError: (e: Error) => setError(e.message),
  });
  const send = (docType: string, file: File) => {
    const problem = validateFile(file);
    if (problem) {
      setError(t(problem, { mb: MAX_MB }));
      return;
    }
    setError(null);
    setDone(false);
    mutation.mutate({ docType, file });
  };
  return { send, error, setError, pending: mutation.isPending, done, variables: mutation.variables };
}

/** Indeterminate progress while a file is sent (the API reports no byte progress); transform-only. */
export function UploadProgress({ active, className }: { active: boolean; className?: string }) {
  const t = useT();
  const lang = useLang();
  const reduce = useReducedMotion();
  const dir = isRTL(lang) ? -1 : 1;
  return (
    <AnimatePresence initial={false}>
      {active && (
        <motion.div key="bar" role="status" aria-label={t("resident.docs.uploading")} className={cn("overflow-hidden", className)}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.25 } }}>
          <div className="relative h-1 overflow-hidden rounded-full bg-azure-soft">
            <motion.div className="absolute inset-y-0 start-0 w-1/3 rounded-full bg-azure"
              animate={reduce ? undefined : { x: [`${-100 * dir}%`, `${300 * dir}%`] }} transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }} />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** A check that draws itself once, for a finished upload. */
export function SuccessCheck({ show, label }: { show: boolean; label: string }) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence>
      {show && (
        <motion.span key="ok" role="status" className="inline-flex items-center gap-1.5 text-sm font-medium text-civic"
          initial={{ opacity: 0, y: reduce ? 0 : 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: { duration: 0.3 } }}>
          <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" aria-hidden>
            <motion.circle cx="12" cy="12" r="10" fill="none" stroke="var(--color-civic)" strokeWidth="2"
              initial={{ pathLength: reduce ? 1 : 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} />
            <motion.path d="M7.5 12.5l3 3 6-6.5" fill="none" stroke="var(--color-civic)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
              initial={{ pathLength: reduce ? 1 : 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.35, delay: reduce ? 0 : 0.35, ease: [0.22, 1, 0.36, 1] }} />
          </svg>
          {label}
        </motion.span>
      )}
    </AnimatePresence>
  );
}

/** A button that opens the file chooser. */
export function FilePicker({ onFile, label, disabled, loading, variant = "secondary", size = "sm" }: {
  onFile: (file: File) => void; label: string; disabled?: boolean; loading?: boolean; variant?: "secondary" | "primary"; size?: "sm" | "md";
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input ref={input} type="file" accept={ACCEPT} className="sr-only" tabIndex={-1} aria-hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
      <Button variant={variant} size={size} disabled={disabled} loading={loading} icon={<Upload className="h-4 w-4" aria-hidden />} onClick={() => input.current?.click()}>
        {label}
      </Button>
    </>
  );
}

/** Wraps any block so a file can be dropped on it; shows a clear outline while a file is over it. */
export function DropTarget({ onFile, disabled, children, className, activeClassName }: {
  onFile: (file: File) => void; disabled?: boolean; children: ReactNode; className?: string; activeClassName?: string;
}) {
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  const has = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
  return (
    <div
      className={cn(className, over && (activeClassName ?? "border-azure bg-azure-soft/40 ring-2 ring-azure/20"))}
      onDragEnter={(e) => { if (disabled || !has(e)) return; e.preventDefault(); depth.current += 1; setOver(true); }}
      onDragOver={(e) => { if (disabled || !has(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }}
      onDragLeave={() => { depth.current = Math.max(0, depth.current - 1); if (depth.current === 0) setOver(false); }}
      onDrop={(e) => {
        if (disabled) return;
        e.preventDefault();
        depth.current = 0;
        setOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
    >
      {children}
    </div>
  );
}
