import { motion, useReducedMotion } from "framer-motion";
import { Check, MessageCircle, PhoneOff } from "lucide-react";
import { useId } from "react";
import { LANGUAGES, useT } from "../../i18n";
import { cn } from "../../lib/format";
import type { Lang } from "../../types/api";
import { Button, Modal } from "../ui/primitives";

/** Explicit, visible language choice: six languages, each in its own script. The highlight glides to the chosen one.
 * `dark` is accepted for older call sites and ignored: colours follow the theme. */
export function LanguagePicker({ value, onChange, name }: { value: Lang; onChange: (lang: Lang) => void; dark?: boolean; name: string }) {
  const pill = useId();
  const reduce = useReducedMotion();
  return (
    <div role="group" aria-label={name} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {LANGUAGES.map((l) => {
        const on = l.code === value;
        return (
          <button
            key={l.code} type="button" aria-pressed={on} onClick={() => onChange(l.code)}
            className={cn(
              "relative flex min-h-14 cursor-pointer items-center justify-between gap-2 rounded-2xl border px-3.5 py-2.5 text-start transition-colors duration-200",
              on ? "border-transparent text-ink" : "border-line bg-surface/70 text-ink-2 hover:border-line-2 hover:bg-surface",
            )}
          >
            {on && (
              <motion.span layoutId={pill} aria-hidden className="absolute inset-0 rounded-2xl border border-ink/70 bg-surface shadow-[var(--shadow-card)]"
                transition={reduce ? { duration: 0 } : { duration: 0.35, ease: [0.22, 1, 0.36, 1] }} />
            )}
            <span className="relative min-w-0">
              <span className="block text-[15px] font-medium leading-tight" lang={l.code} dir={l.rtl ? "rtl" : "ltr"}>{l.native}</span>
              {l.native !== l.english && <span className="block text-xs text-muted" lang="en" dir="ltr">{l.english}</span>}
            </span>
            {on && <Check className="relative h-4 w-4 shrink-0 text-civic" aria-hidden />}
          </button>
        );
      })}
    </div>
  );
}

export function LanguageDialog({ open, onClose, value, onChoose }: { open: boolean; onClose: () => void; value: Lang; onChoose: (lang: Lang) => void }) {
  const t = useT();
  return (
    <Modal open={open} onClose={onClose} title={t("resident.voice.language.title")}>
      <p className="mb-4 text-sm text-muted">{t("resident.voice.language.hint")}</p>
      <LanguagePicker name={t("resident.voice.language.title")} value={value} onChange={(l) => { onChoose(l); onClose(); }} />
    </Modal>
  );
}

/** "Stop calling" is honoured immediately; the dialog says exactly what happens before it happens. */
export function StopCallingDialog({ open, onClose, onConfirm, loading }: { open: boolean; onClose: () => void; onConfirm: () => void; loading?: boolean }) {
  const t = useT();
  return (
    <Modal open={open} onClose={onClose} title={t("resident.stop.title")}>
      <ul className="space-y-3 text-[15px] leading-relaxed">
        <li className="flex gap-3"><PhoneOff className="mt-1 h-4 w-4 shrink-0 text-rose" aria-hidden />{t("resident.stop.point1")}</li>
        <li className="flex gap-3"><MessageCircle className="mt-1 h-4 w-4 shrink-0 text-violet" aria-hidden />{t("resident.stop.point2")}</li>
        <li className="flex gap-3"><Check className="mt-1 h-4 w-4 shrink-0 text-civic" aria-hidden />{t("resident.stop.point3")}</li>
      </ul>
      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>{t("common.cancel")}</Button>
        <Button variant="danger" onClick={onConfirm} loading={loading} icon={<PhoneOff className="h-4 w-4" aria-hidden />}>{t("resident.stop.confirm")}</Button>
      </div>
    </Modal>
  );
}
