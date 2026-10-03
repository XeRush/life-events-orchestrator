import { useT, type MessageKey } from "../../i18n";
import { cn } from "../../lib/format";

type Id = "english" | "birth" | "yes" | "no" | "whereAreWe" | "passportIssued" | "passportNumber" | "approved" | "stop";

/** Suggestions that fit the conversation's current stage; "Stop calling" is always offered. */
const BY_STAGE: Record<string, Id[]> = {
  LANGUAGE: ["english", "birth"],
  INTAKE: ["birth", "yes", "no"],
  VERIFY: [],
  STATUS: ["whereAreWe", "passportIssued", "passportNumber", "approved"],
};
const DEFAULT: Id[] = ["english", "birth", "whereAreWe", "passportIssued", "approved"];

/**
 * Quick replies for demos and for anyone who would rather tap than talk. Each chip sends exactly the words shown
 * (in the interface language), except "Stop calling", which first asks for confirmation.
 */
export function QuickReplies({ stage, onSend, onStop, disabled }: { stage: string | null | undefined; onSend: (text: string) => void; onStop: () => void; disabled?: boolean }) {
  const t = useT();
  const ids: Id[] = [...(stage && stage in BY_STAGE ? BY_STAGE[stage] : DEFAULT), "stop"];
  return (
    <div role="group" aria-label={t("resident.voice.suggest.title")} data-lenis-prevent
      className="scroll-thin -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
      {ids.map((id) => {
        const text = t(`resident.voice.suggest.${id}` as MessageKey);
        return (
          <button
            key={id} type="button" disabled={disabled}
            onClick={() => (id === "stop" ? onStop() : onSend(text))}
            className={cn(
              "min-h-10 shrink-0 cursor-pointer rounded-full border px-3.5 py-1.5 text-start text-[13px] transition-[color,background-color,border-color,transform] duration-200 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-9",
              id === "stop" ? "border-rose/40 bg-surface text-rose hover:bg-rose-soft" : "border-line-2 bg-surface text-ink-2 hover:border-ink/30 hover:bg-paper-2 hover:text-ink",
            )}
          >
            {text}
          </button>
        );
      })}
    </div>
  );
}
