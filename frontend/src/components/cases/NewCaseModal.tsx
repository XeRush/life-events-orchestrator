import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTemplates } from "../../hooks/queries";
import { casesApi } from "../../services/cases";
import { useUI } from "../../stores/ui";
import { cn } from "../../utils/format";
import { Badge, Button, Modal } from "../ui/primitives";
import { EVENT_ICON } from "./CaseCard";

export function NewCaseModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: templates } = useTemplates();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useUI((s) => s.toast);
  const [type, setType] = useState("BIRTH");
  const [date, setDate] = useState(() => new Date(Date.now() - 86400000).toISOString().slice(0, 10));
  const [child, setChild] = useState("");
  const [consent, setConsent] = useState(true);
  const [callback, setCallback] = useState(true);

  const create = useMutation({
    mutationFn: () =>
      casesApi.create({
        event_type: type, event_date: date, source: "dashboard",
        participants: [{ role: "parent", name: "Resident" }, ...(type === "BIRTH" ? [{ role: "child", name: child || "Newborn" }] : [])],
        consent_service_initiation: consent, consent_callback: callback, consent_data_processing: consent,
      }),
    onSuccess: (c) => {
      qc.invalidateQueries();
      toast("success", `Case ${c.reference} created`);
      onClose();
      navigate(`/app/life-events/${c.reference}`);
    },
    onError: (e: Error) => toast("error", e.message),
  });

  const selected = templates?.find((t) => t.code === type);
  return (
    <Modal open={open} onClose={onClose} title="Start a life event" wide>
      <p className="mb-4 text-sm text-muted">Consent is captured first. Nothing is submitted to any authority until you agree.</p>
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {templates?.map((t) => {
          const Icon = EVENT_ICON[t.code];
          return (
            <button key={t.code} onClick={() => setType(t.code)} aria-pressed={type === t.code}
              className={cn("flex flex-col items-start gap-2 rounded-2xl border p-3 text-start transition-colors cursor-pointer", type === t.code ? "border-ink bg-paper-2" : "border-line hover:border-line-2")}>
              {Icon && <Icon className="h-5 w-5" aria-hidden />}
              <span className="text-sm font-medium">{t.name}</span>
              {!t.is_configured && <Badge tone="slate">Definition only</Badge>}
            </button>
          );
        })}
      </div>
      {selected && !selected.is_configured ? (
        <p className="rounded-xl border border-line bg-paper-2 p-3 text-sm text-muted">
          {selected.name} has a workflow definition, but this prototype is not connected to authorities for it. Government-authorized integrations would be required.
        </p>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm"><span className="mb-1 block text-muted">Event date</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-10 w-full rounded-xl border border-line-2 bg-surface px-3" /></label>
            {type === "BIRTH" && (
              <label className="block text-sm"><span className="mb-1 block text-muted">Child's name (optional)</span>
                <input value={child} onChange={(e) => setChild(e.target.value)} placeholder="e.g. Demo Daughter" className="h-10 w-full rounded-xl border border-line-2 bg-surface px-3" /></label>
            )}
          </div>
          <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 h-4 w-4 accent-[var(--color-civic)]" />
            <span>I consent to LIFELOOP coordinating the services linked to this event and submitting requests to the responsible authorities on my behalf.</span></label>
          <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={callback} onChange={(e) => setCallback(e.target.checked)} className="mt-1 h-4 w-4 accent-[var(--color-civic)]" />
            <span>I consent to proactive voice callbacks when something meaningful changes.</span></label>
        </div>
      )}
      <div className="mt-7 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={() => create.mutate()} loading={create.isPending} disabled={!selected?.is_configured}>
          {consent ? "Create case and start" : "Create case (awaiting consent)"}
        </Button>
      </div>
    </Modal>
  );
}
