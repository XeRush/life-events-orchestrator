import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { rise } from "../../animations/variants";
import { cn } from "../../utils/format";
import { TONE_CLASSES, type Tone } from "../../utils/status";

export function StatTile({ label, value, icon: Icon, tone = "slate", hint }: { label: string; value: number | string; icon: LucideIcon; tone?: Tone; hint?: string }) {
  const t = TONE_CLASSES[tone];
  return (
    <motion.div variants={rise} className="card flex flex-col gap-4 p-5">
      <div className="flex items-center justify-between">
        <p className="eyebrow">{label}</p>
        <span className={cn("grid h-8 w-8 place-items-center rounded-full", t.bg, t.text)}><Icon className="h-4 w-4" aria-hidden /></span>
      </div>
      <p className="font-display text-4xl leading-none">{value}</p>
      {hint && <p className="-mt-2 text-xs text-muted">{hint}</p>}
    </motion.div>
  );
}
