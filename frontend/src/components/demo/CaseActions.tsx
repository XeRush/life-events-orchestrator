import { PhoneOutgoing, RotateCcw, ShieldAlert, Webhook } from "lucide-react";
import { useState } from "react";
import { demoApi } from "../../api";
import { useAction } from "../../hooks/queries";
import { useT } from "../../i18n";
import { Actions, DIALOG_BODY } from "../officer/dialogs";
import { Button, Modal, SelectField } from "../ui/primitives";
import { DemoPanel } from "./DemoFrame";
import { ESCALATION_REASONS, tOr } from "./labels";

/** Case-level simulations: callback, escalation, an ElevenLabs post-call webhook, and a full demo reset. */
export function CaseActions({ caseRef, onReset }: { caseRef: string; onReset: (ref: string) => void }) {
  const t = useT();
  const [reason, setReason] = useState<(typeof ESCALATION_REASONS)[number]>("SLA_STALL");
  const [confirmReset, setConfirmReset] = useState(false);

  const callback = useAction(() => demoApi.callback(caseRef), {
    success: (r) => (r.callback ? t("demo.toast.callback", { status: tOr(t, `cb.${r.callback.status}`, r.callback.status) }) : t("demo.toast.callbackNone")),
  });
  const escalate = useAction(() => demoApi.escalate(caseRef, reason), { success: t("demo.toast.escalated") });
  const webhook = useAction(() => demoApi.webhook(caseRef), {
    success: (r) => t(r.signed ? "demo.toast.webhookSigned" : "demo.toast.webhookUnsigned"),
  });
  const reset = useAction(() => demoApi.reset(), { success: (r) => t("demo.toast.reset", { ref: r.case }) });

  return (
    <DemoPanel id="demo-case-actions" title={t("demo.case.title")} hint={t("demo.case.hint", { ref: caseRef })}>
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-paper/50 p-3">
          <div className="min-w-0">
            <p className="text-[14px] font-medium">{t("demo.case.callback")}</p>
            <p className="text-[12.5px] text-muted">{t("demo.case.callbackHint")}</p>
          </div>
          <Button size="sm" variant="secondary" icon={<PhoneOutgoing className="h-4 w-4" aria-hidden />} loading={callback.isPending} onClick={() => callback.mutate(undefined)}>
            {t("demo.case.callbackRun")}
          </Button>
        </div>

        <div className="rounded-xl border border-line bg-paper/50 p-3">
          <p className="text-[14px] font-medium">{t("demo.case.escalate")}</p>
          <p className="text-[12.5px] text-muted">{t("demo.case.escalateHint")}</p>
          <div className="mt-2.5 flex flex-wrap items-end gap-2">
            <SelectField label={t("demo.case.reason")} value={reason} onChange={(e) => setReason(e.target.value as (typeof ESCALATION_REASONS)[number])} className="min-w-0 flex-1 basis-48">
              {ESCALATION_REASONS.map((r) => <option key={r} value={r}>{tOr(t, `demo.reason.${r}`, r)}</option>)}
            </SelectField>
            <Button size="md" variant="secondary" className="h-11" icon={<ShieldAlert className="h-4 w-4" aria-hidden />} loading={escalate.isPending} onClick={() => escalate.mutate(undefined)}>
              {t("demo.case.escalateRun")}
            </Button>
          </div>
        </div>

        <div className="rounded-xl border border-line bg-paper/50 p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[14px] font-medium">{t("demo.case.webhook")}</p>
              <p className="text-[12.5px] text-muted">{t("demo.case.webhookHint")}</p>
            </div>
            <Button size="sm" variant="secondary" icon={<Webhook className="h-4 w-4" aria-hidden />} loading={webhook.isPending} onClick={() => webhook.mutate(undefined)}>
              {t("demo.case.webhookRun")}
            </Button>
          </div>
          {webhook.data && (
            <details className="mt-2.5">
              <summary className="inline-flex min-h-8 cursor-pointer items-center text-[12.5px] text-ink-2">{t(webhook.data.signed ? "demo.case.webhookResultSigned" : "demo.case.webhookResultUnsigned")}</summary>
              <pre className="scroll-thin mt-2 max-h-48 overflow-auto rounded-xl border border-line bg-stage p-3 font-mono text-[11px] leading-relaxed text-ink-2" dir="ltr">{JSON.stringify(webhook.data.webhook, null, 2)}</pre>
            </details>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose/25 bg-rose-soft/40 p-3">
          <div className="min-w-0">
            <p className="text-[14px] font-medium text-rose">{t("demo.case.reset")}</p>
            <p className="text-[12.5px] text-muted">{t("demo.case.resetHint")}</p>
          </div>
          <Button size="sm" variant="danger" icon={<RotateCcw className="h-4 w-4" aria-hidden />} onClick={() => setConfirmReset(true)}>{t("demo.case.resetRun")}</Button>
        </div>
      </div>

      <Modal open={confirmReset} onClose={() => setConfirmReset(false)} title={t("demo.case.resetConfirmTitle")}>
        <div className={DIALOG_BODY}>
        <p className="text-[14.5px] leading-relaxed text-ink-2">{t("demo.case.resetConfirm")}</p>
        <Actions>
          <Button variant="ghost" onClick={() => setConfirmReset(false)}>{t("common.cancel")}</Button>
          <Button
            variant="danger" loading={reset.isPending} icon={<RotateCcw className="h-4 w-4" aria-hidden />}
            onClick={() => reset.mutate(undefined, { onSuccess: (r) => { setConfirmReset(false); onReset(r.case); } })}
          >
            {t("demo.case.resetRun")}
          </Button>
        </Actions>
        </div>
      </Modal>
    </DemoPanel>
  );
}
