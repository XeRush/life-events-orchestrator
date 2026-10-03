import { Landmark, ShieldCheck, UserRound } from "lucide-react";
import { FIXTURE_DEMO_ACCOUNTS } from "../../bones/fixtures/public";
import { useT, type MessageKey } from "../../i18n";
import { cn } from "../../lib/format";
import type { Role } from "../../types/api";
import { Bones } from "../ui/Bones";

const ROLE_META: Record<Role, { label: MessageKey; hint: MessageKey; icon: typeof UserRound }> = {
  RESIDENT: { label: "auth.login.role.RESIDENT", hint: "auth.login.roleHint.RESIDENT", icon: UserRound },
  OFFICER: { label: "auth.login.role.OFFICER", hint: "auth.login.roleHint.OFFICER", icon: Landmark },
  ADMIN: { label: "auth.login.role.ADMIN", hint: "auth.login.roleHint.ADMIN", icon: ShieldCheck },
};

type Account = { email: string; role: Role };

/** The three demo roles as pick-buttons; choosing one fills in its email address. */
export function DemoAccountGrid({ accounts, selected, onPick }: { accounts: Account[]; selected: string; onPick: (email: string) => void }) {
  const t = useT();
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {accounts.map((acc) => {
        const meta = ROLE_META[acc.role];
        const on = selected.trim().toLowerCase() === acc.email;
        return (
          <button
            key={acc.email} type="button" onClick={() => onPick(acc.email)} aria-pressed={on}
            className={cn(
              "flex min-h-11 cursor-pointer flex-col items-start gap-1 rounded-xl border px-3 py-2.5 text-start transition-[color,background-color,border-color,translate] duration-200 hover:-translate-y-px",
              on ? "border-ink bg-ink text-paper" : "border-line-2 bg-surface text-ink hover:border-ink/40",
            )}
          >
            <span className="inline-flex items-center gap-1.5 text-[14px] font-medium"><meta.icon className="h-4 w-4" aria-hidden />{t(meta.label)}</span>
            <span className={cn("text-[11.5px] leading-snug", on ? "text-paper/75" : "text-muted")}>{t(meta.hint)}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Demo-account picker on the sign-in card. The list comes from /auth/config, so it shows a skeleton while that loads. */
export function DemoAccounts({ loading, accounts, highlight, selected, onPick }: {
  loading: boolean; accounts: Account[]; highlight: boolean; selected: string; onPick: (email: string) => void;
}) {
  const t = useT();
  return (
    <section
      aria-labelledby="demo-accounts-title"
      className={cn("rounded-2xl border p-4 sm:p-5", highlight ? "border-civic/40 bg-civic-soft/50 ring-4 ring-civic/10" : "border-line bg-paper/70")}
    >
      <h2 id="demo-accounts-title" className="text-[1.1rem]">{t(highlight ? "auth.login.demoTitleHint" : "auth.login.demoTitle")}</h2>
      {loading || accounts.length > 0 ? (
        <>
          <p className="mt-1 text-[13.5px] text-muted">{t("auth.login.demoBody")}</p>
          <Bones name="pub-demo-accounts" loading={loading} lines={2} className="mt-3"
            fixture={<DemoAccountGrid accounts={FIXTURE_DEMO_ACCOUNTS} selected="" onPick={() => undefined} />}>
            <DemoAccountGrid accounts={accounts} selected={selected} onPick={onPick} />
          </Bones>
          <p className="mt-3 text-[12.5px] leading-relaxed text-ink-2">{t("auth.login.demoPassword", { name: "DEMO_USER_PASSWORD" })}</p>
        </>
      ) : (
        <p className="mt-1 text-[13.5px] text-muted">{t("auth.login.demoUnavailable")}</p>
      )}
    </section>
  );
}
