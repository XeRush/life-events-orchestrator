import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileUp, TriangleAlert } from "lucide-react";
import { useRef } from "react";
import { casesApi } from "../../services/cases";
import { useUI } from "../../stores/ui";
import type { Snapshot } from "../../types";
import { Button } from "../ui/primitives";

/** Shown only when an authority is waiting on the resident. Uploading records the document and resumes the task. */
export function PendingActionCard({ reference, actions }: { reference: string; actions: Snapshot["pending_actions"] }) {
  const qc = useQueryClient();
  const toast = useUI((s) => s.toast);
  const input = useRef<HTMLInputElement>(null);
  const target = useRef<string>("");
  const upload = useMutation({
    mutationFn: async ({ type, file }: { type: string; file?: File }) => (file ? casesApi.uploadDocument(reference, type, file) : casesApi.recordDocument(reference, type)),
    onSuccess: () => { qc.invalidateQueries(); toast("success", "Document recorded and passed to the authority"); },
    onError: (e: Error) => toast("error", e.message),
  });
  if (!actions.length) return null;
  return (
    <div className="rounded-2xl border border-amber/40 bg-amber-soft p-5" role="region" aria-label="Action needed">
      <p className="flex items-center gap-2 font-display text-xl text-amber"><TriangleAlert className="h-5 w-5" aria-hidden />Your action is needed</p>
      <input ref={input} type="file" className="sr-only" aria-label="Choose document file" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload.mutate({ type: target.current, file: f }); e.target.value = ""; }} />
      <ul className="mt-3 space-y-3">
        {actions.map((a, i) => (
          <li key={i} className="text-sm">
            <p className="font-medium">{a.task}: {a.action}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {a.documents.map((d) => (
                <span key={d.type} className="inline-flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" icon={<FileUp className="h-3.5 w-3.5" />} loading={upload.isPending} onClick={() => { target.current = d.type; input.current?.click(); }}>Upload {d.name}</Button>
                  <Button size="sm" variant="ghost" onClick={() => upload.mutate({ type: d.type })}>Mark as provided</Button>
                </span>
              ))}
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted">LIFELOOP never marks anything approved: the authority confirms whether the document is accepted.</p>
    </div>
  );
}
