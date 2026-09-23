import { motion } from "framer-motion";
import { ArrowUpRight, Baby, Briefcase, Heart, Home, Sparkles, type LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { rise } from "../../animations/variants";
import type { CaseStatus } from "../../types";
import { cn } from "../../utils/format";
import { CaseStatusBadge } from "../ui/StatusBadge";
import { ProgressBar } from "../ui/primitives";

export const EVENT_ICON: Record<string, LucideIcon> = { BIRTH: Baby, MARRIAGE: Heart, MOVE: Home, BUSINESS_START: Briefcase };

interface Props {
  reference: string;
  title: string;
  eventType: string;
  status: CaseStatus;
  progress: { completed: number; total: number; percent: number };
  currentStage: string | null;
  waitingOn: "resident" | "authority" | "none";
  residentActionRequired: boolean;
}

export function CaseCard({ reference, title, eventType, status, progress, currentStage, waitingOn, residentActionRequired }: Props) {
  const Icon = EVENT_ICON[eventType] ?? Sparkles;
  const waiting = { resident: "Waiting for resident", authority: "Waiting for authority", none: status === "COMPLETED" ? "Complete" : "No one - moving on" }[waitingOn];
  return (
    <motion.div variants={rise}>
      <Link to={`/app/life-events/${reference}`} className="card group block p-6 transition-shadow hover:shadow-[var(--shadow-pop)]">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-civic-soft text-civic"><Icon className="h-5 w-5" aria-hidden /></span>
            <div>
              <p className="eyebrow">Active case</p>
              <p className="font-mono text-[13px]">{reference}</p>
            </div>
          </div>
          <CaseStatusBadge status={status} />
        </div>
        <h3 className="text-2xl">{title}</h3>
        <div className="mt-4 flex items-baseline justify-between text-sm">
          <span className="font-display text-3xl">{progress.percent}%<span className="ms-1.5 font-sans text-sm text-muted">complete</span></span>
          <span className="text-muted">{progress.completed} of {progress.total} services completed</span>
        </div>
        <div className="mt-2"><ProgressBar percent={progress.percent} label={`${title} progress`} /></div>
        <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
          <div><dt className="eyebrow mb-1">Current stage</dt><dd className="font-medium">{currentStage ?? "-"}</dd></div>
          <div><dt className="eyebrow mb-1">Status</dt><dd className="font-medium">{waiting}</dd></div>
          <div className="col-span-2">
            <dt className="eyebrow mb-1">Resident action</dt>
            <dd className={cn("font-medium", residentActionRequired && "text-amber")}>{residentActionRequired ? "Needs attention" : "None"}</dd>
          </div>
        </dl>
        <span className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-ink-2 group-hover:text-ink">
          Open case <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
        </span>
      </Link>
    </motion.div>
  );
}
