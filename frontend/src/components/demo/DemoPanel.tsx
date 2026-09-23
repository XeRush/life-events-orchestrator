import { useState } from "react";
import { FlaskConical, RotateCcw } from "lucide-react";
import { useDemoAction, useDemoActions, useInvalidateAll } from "../../hooks/queries";
import { demoApi } from "../../services/cases";
import { useAuth } from "../../stores/auth";
import { useUI } from "../../stores/ui";
import { Badge, Button, Card } from "../ui/primitives";

const GROUPS: { label: string; actions: string[] }[] = [
  { label: "Birth registration authority", actions: ["complete_birth_registration", "issue_birth_certificate"] },
  { label: "Civil identity authority", actions: ["start_identity", "delay_identity", "require_document", "submit_document", "approve_identity", "reject_identity"] },
  { label: "Health / insurance authority", actions: ["start_health", "complete_health"] },
  { label: "Additional services authority", actions: ["start_additional_services", "complete_additional_services"] },
  { label: "LIFELOOP", actions: ["trigger_callback", "replan_workflow"] },
];

/** Clearly marked Demo Mode. Each button calls the backend, which drives the mock authority through the real event pipeline. */
export function DemoPanel({ caseRef, compact }: { caseRef: string | undefined; compact?: boolean }) {
  const { data: actions, isError } = useDemoActions();
  const run = useDemoAction(caseRef);
  const toast = useUI((s) => s.toast);
  const invalidate = useInvalidateAll();
  const isAdmin = useAuth((s) => s.user?.role === "ADMIN");
  const [busy, setBusy] = useState<string | null>(null);
  const label = (a: string) => actions?.find((x) => x.action === a)?.label ?? a;

  if (isError) return <Card className="p-5 text-sm text-muted">Demo mode is disabled or your role cannot use it.</Card>;

  const perform = (action: string) => {
    setBusy(action);
    run.mutate(action, {
      onSuccess: (r) => {
        const res = r.result as { duplicate?: boolean; message?: string };
        toast(res.duplicate ? "info" : "success", `${label(action)}: ${res.duplicate ? "duplicate ignored (idempotent)" : "done"}`);
      },
      onSettled: () => setBusy(null),
    });
  };

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-xl"><FlaskConical className="h-5 w-5 text-violet" aria-hidden />Demo mode</h3>
        <Badge tone="violet">Real backend events</Badge>
      </div>
      {!compact && <p className="mb-4 text-sm text-muted">Play the authorities. The workflow engine, dependency resolution, replanning and callbacks respond exactly as they would to a real webhook.</p>}
      <div className="space-y-4">
        {GROUPS.map((g) => (
          <div key={g.label}>
            <p className="eyebrow mb-2">{g.label}</p>
            <div className="flex flex-wrap gap-2">
              {g.actions.filter((a) => actions?.some((x) => x.action === a)).map((a) => (
                <Button key={a} size="sm" variant={a === "reject_identity" ? "danger" : "secondary"} loading={busy === a} disabled={!caseRef || run.isPending} onClick={() => perform(a)}>
                  {label(a)}
                </Button>
              ))}
            </div>
          </div>
        ))}
      </div>
      {isAdmin && (
        <div className="mt-5 border-t border-line pt-4">
          <Button size="sm" variant="ghost" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={async () => {
            try { await demoApi.reset(); invalidate(); toast("success", "Demo case L-49281 reset to its seeded state"); } catch (e) { toast("error", (e as Error).message); }
          }}>Reset demo case L-49281</Button>
        </div>
      )}
    </Card>
  );
}
