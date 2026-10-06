import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AudioLines, Landmark, Loader2, Radio, Zap } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { ease } from "../../animations/variants";
import { demoApi } from "../../api";
import { useAction } from "../../hooks/queries";
import { useT, type MessageKey } from "../../i18n";
import { cn } from "../../lib/format";
import type { DemoStatus } from "../../types/api";
import { DemoPanel } from "./DemoFrame";

type Component = "government" | "kafka" | "elevenlabs";
const MODES = ["unavailable", "timeout", "malformed"] as const;

/**
 * Failure switch: the knob glides across (transform only), the track and its row warm to rose, and a bolt marks the
 * injected failure. While the request is in flight the switch already shows where it is going, with a spinner.
 */
function FailSwitch({ checked, onChange, label, description, disabled, busy }: {
  checked: boolean; onChange: (v: boolean) => void; label: ReactNode; description?: ReactNode; disabled?: boolean; busy?: boolean;
}) {
  const id = useId();
  const reduce = useReducedMotion();
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={id} className="cursor-pointer text-[15px] font-medium">{label}</label>
        {description && <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-busy={busy || undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full p-0.5 transition-colors duration-300 before:absolute before:-inset-2 before:content-[''] disabled:cursor-wait",
          checked ? "justify-end bg-rose" : "justify-start bg-line-2",
        )}
      >
        <motion.span
          layout
          transition={reduce ? { duration: 0 } : { duration: 0.32, ease }}
          className="grid h-6 w-6 place-items-center rounded-full bg-surface shadow-sm ring-1 ring-black/5"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted" aria-hidden />
          ) : (
            <AnimatePresence initial={false}>
              {checked && (
                <motion.span key="on" initial={reduce ? false : { scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={{ duration: 0.25, ease }}>
                  <Zap className="h-3.5 w-3.5 fill-rose text-rose" aria-hidden />
                </motion.span>
              )}
            </AnimatePresence>
          )}
        </motion.span>
      </button>
    </div>
  );
}

function SwitchRow({ icon, on, children }: { icon: ReactNode; on: boolean; children: ReactNode }) {
  return (
    <div className={cn("rounded-xl border p-3.5 transition-colors duration-500", on ? "border-rose/40 bg-rose-soft/60" : "border-line bg-paper/50")}>
      <div className="flex gap-3">
        <span className={cn("mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full transition-colors duration-500", on ? "pulse-rose bg-rose text-on-accent" : "bg-paper-2 text-ink-2")}>{icon}</span>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}

/** Failure switches: each drives the real fallback path, so the UI shows what a resident and an officer would see. */
export function FailureSwitches({ status }: { status: DemoStatus }) {
  const t = useT();
  const reduce = useReducedMotion();
  const gov = status.failures.government ?? {};
  const govOn = Object.keys(gov).length > 0;
  const [localMode, setLocalMode] = useState<(typeof MODES)[number]>("unavailable");
  const govMode = (govOn ? Object.values(gov)[0] : localMode) as (typeof MODES)[number];
  const pending = status.outbox.PENDING ?? 0;

  const toggle = useAction(
    (v: { component: Component; enabled: boolean; mode?: string }) => demoApi.failure(v.component, v.enabled, v.mode),
    {
      success: (r) => (r.failures.kafka || r.failures.elevenlabs || Object.keys(r.failures.government ?? {}).length ? t("demo.failure.someOn") : t("demo.failure.allOff")),
      invalidate: [["demo"], ["ready"], ["agent-config"]],
    },
  );
  // Optimistic: while a switch's request is in flight it already shows the state it is heading to.
  const shown = (component: Component, actual: boolean) =>
    toggle.isPending && toggle.variables?.component === component ? toggle.variables.enabled : actual;
  const busy = (component: Component) => toggle.isPending && toggle.variables?.component === component;

  const setGovMode = (mode: (typeof MODES)[number]) => {
    setLocalMode(mode);
    if (govOn) toggle.mutate({ component: "government", enabled: true, mode });
  };
  const govShown = shown("government", govOn);
  const kafkaShown = shown("kafka", status.failures.kafka);
  const voiceShown = shown("elevenlabs", status.failures.elevenlabs);

  return (
    <DemoPanel id="demo-failures" title={t("demo.failure.title")} hint={t("demo.failure.hint")}>
      <div className="space-y-2.5">
        <SwitchRow icon={<Landmark className="h-4 w-4" aria-hidden />} on={govShown}>
          <FailSwitch
            checked={govShown} disabled={toggle.isPending} busy={busy("government")}
            onChange={(v) => toggle.mutate({ component: "government", enabled: v, mode: govMode })}
            label={t("demo.failure.government")} description={t("demo.failure.governmentHint")}
          />
          <fieldset className="mt-2.5">
            <legend className="mb-1.5 text-[12px] font-medium text-ink-2">{t("demo.failure.mode")}</legend>
            <div className="flex flex-wrap gap-1.5">
              {MODES.map((m) => (
                <label key={m} className={cn("inline-flex min-h-9 cursor-pointer items-center rounded-full border px-3 text-[12.5px] transition-colors has-focus-visible:ring-2 has-focus-visible:ring-azure sm:min-h-7", govMode === m ? "border-ink bg-ink text-paper" : "border-line-2 text-ink-2 hover:bg-paper-2")}>
                  <input type="radio" name="gov-mode" value={m} checked={govMode === m} onChange={() => setGovMode(m)} className="sr-only" />
                  {t(`demo.failure.mode.${m}` as MessageKey)}
                </label>
              ))}
            </div>
          </fieldset>
        </SwitchRow>

        <SwitchRow icon={<Radio className="h-4 w-4" aria-hidden />} on={kafkaShown}>
          <FailSwitch
            checked={kafkaShown} disabled={toggle.isPending} busy={busy("kafka")}
            onChange={(v) => toggle.mutate({ component: "kafka", enabled: v })}
            label={t("demo.failure.kafka")} description={t("demo.failure.kafkaHint")}
          />
          <div className="mt-2.5 flex items-end justify-between gap-4 rounded-xl border border-line bg-surface px-3.5 py-2.5">
            <div className="min-w-0">
              <p className="eyebrow">{t("demo.failure.outboxPending")}</p>
              <p className="mt-1 text-[12px] text-muted">{t(status.failures.kafka ? "demo.failure.outboxClimbing" : "demo.failure.outboxDraining")}</p>
            </div>
            <div className="relative h-11 min-w-16 overflow-hidden text-end" aria-live="polite">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={pending}
                  initial={reduce ? false : { y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={reduce ? undefined : { y: -24, opacity: 0 }}
                  transition={{ duration: 0.3, ease }}
                  className={cn("num block font-display text-[2.4rem] leading-none", pending > 0 ? "text-amber" : "text-ink")}
                >
                  {pending}
                </motion.span>
              </AnimatePresence>
            </div>
          </div>
        </SwitchRow>

        <SwitchRow icon={<AudioLines className="h-4 w-4" aria-hidden />} on={voiceShown}>
          <FailSwitch
            checked={voiceShown} disabled={toggle.isPending} busy={busy("elevenlabs")}
            onChange={(v) => toggle.mutate({ component: "elevenlabs", enabled: v })}
            label={t("demo.failure.elevenlabs")} description={t("demo.failure.elevenlabsHint")}
          />
        </SwitchRow>
      </div>
    </DemoPanel>
  );
}
