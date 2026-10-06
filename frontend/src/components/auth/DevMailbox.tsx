import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, FlaskConical, Inbox, Mail, RefreshCw } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Stagger, StaggerItem } from "../../animations/motion";
import { authApi } from "../../api";
import { FIXTURE_MAIL } from "../../bones/fixtures/public";
import { useAuthConfig } from "../../hooks/queries";
import { useLang, useT, type MessageKey } from "../../i18n";
import { cn, relative } from "../../lib/format";
import { Bones } from "../ui/Bones";
import { isEmail } from "./authErrors";

const APP_LINKS: Record<string, MessageKey> = {
  "/verify-email": "auth.mailbox.openVerify",
  "/reset-password": "auth.mailbox.openReset",
  "/accept-invite": "auth.mailbox.openInvite",
};

type Mail = { to: string; subject: string; text: string; sent_at: string };

function linksIn(text: string): { href: string; internal: string | null; label: MessageKey | null }[] {
  const found = text.match(/https?:\/\/[^\s<>"')\]]+/g) ?? [];
  return [...new Set(found)].map((href) => {
    try {
      const url = new URL(href);
      const label = APP_LINKS[url.pathname] ?? null;
      return { href, internal: label ? `${url.pathname}${url.search}` : null, label };
    } catch {
      return { href, internal: null, label: null };
    }
  });
}

/** Captured emails, newest first, each with a button for the app link it carries. */
export function MailList({ items }: { items: Mail[] }) {
  const t = useT();
  const lang = useLang();
  return (
    <Stagger as="ul" gap={0.05} className="space-y-3">
      {items.map((m, i) => (
        <StaggerItem as="li" key={`${m.sent_at}-${i}`} className="rounded-2xl border border-amber/25 bg-surface p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <p className="flex min-w-0 items-center gap-2 font-medium text-ink"><Mail className="h-4 w-4 shrink-0 text-amber" aria-hidden /><span className="min-w-0 break-words">{m.subject}</span></p>
            <p className="text-[12px] text-muted">{relative(m.sent_at, lang)}</p>
          </div>
          <p className="mt-0.5 text-[12px] text-muted">{t("auth.mailbox.to", { email: m.to })}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {linksIn(m.text).map((l) =>
              l.internal && l.label ? (
                <Link key={l.href} to={l.internal} className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-ink px-4 text-[13px] font-medium text-paper transition-colors hover:bg-ink-2">
                  {t(l.label)}<ArrowUpRight className="rtl-flip h-3.5 w-3.5" aria-hidden />
                </Link>
              ) : (
                <a key={l.href} href={l.href} className="max-w-full truncate text-[12.5px] text-azure underline underline-offset-2" rel="noreferrer">{l.href}</a>
              ),
            )}
          </div>
          <details className="mt-2">
            <summary className="inline-flex min-h-10 cursor-pointer items-center text-[12.5px] text-muted hover:text-ink">{t("auth.mailbox.showText")}</summary>
            <pre className="mt-1 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-paper-2 p-3 font-mono text-[11.5px] leading-relaxed text-ink-2" dir="ltr">{m.text}</pre>
          </details>
        </StaggerItem>
      ))}
    </Stagger>
  );
}

/** The dashed "development only" box around the mailbox (shared with the skeleton capture page). */
export function MailboxFrame({ titleId, action, children, className }: { titleId: string; action?: ReactNode; children: ReactNode; className?: string }) {
  const t = useT();
  return (
    <section aria-labelledby={titleId} className={cn("rounded-3xl border-2 border-dashed border-amber/50 bg-amber-soft/40 p-5 sm:p-6", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-1.5 rounded-md bg-amber/15 px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-[0.14em] text-amber">
            <FlaskConical className="h-3.5 w-3.5" aria-hidden />{t("auth.mailbox.badge")}
          </p>
          <h2 id={titleId} className="mt-2 text-[1.3rem] leading-tight">{t("auth.mailbox.title")}</h2>
          <p className="mt-1 max-w-xl text-[13.5px] leading-relaxed text-ink-2">{t("auth.mailbox.note")}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Skeleton-wrapped list: "pub-dev-mailbox". */
export function MailboxList({ loading, items }: { loading: boolean; items: Mail[] }) {
  return (
    <Bones name="pub-dev-mailbox" loading={loading} lines={3} fixture={<MailList items={FIXTURE_MAIL} />}>
      <MailList items={items} />
    </Bones>
  );
}

/**
 * Development only (auth config dev_mailbox = true): emails captured by the console transport are shown here, so
 * verification, reset and invitation links work without a mail server. Never rendered in other environments.
 */
export function DevMailbox({ email, className }: { email?: string | null; className?: string }) {
  const t = useT();
  const inputId = useId();
  const config = useAuthConfig();
  const [manual, setManual] = useState("");
  const target = (email ?? manual).trim().toLowerCase();
  const enabled = !!config.data?.dev_mailbox && isEmail(target);
  const mail = useQuery({
    queryKey: ["dev-mailbox", target],
    queryFn: () => authApi.devMailbox(target),
    enabled,
    refetchInterval: 3000,
  });

  if (!config.data?.dev_mailbox) return null;
  const items = [...(mail.data ?? [])].sort((a, b) => b.sent_at.localeCompare(a.sent_at));

  return (
    <MailboxFrame
      titleId={`${inputId}-title`}
      className={className}
      action={enabled && (
        <button type="button" onClick={() => mail.refetch()} className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full border border-amber/40 px-3.5 text-[12.5px] text-amber transition-colors hover:bg-amber/10">
          <RefreshCw className={cn("h-3.5 w-3.5", mail.isFetching && "animate-spin")} aria-hidden />{t("auth.mailbox.refresh")}
        </button>
      )}
    >
      {email == null && (
        <label htmlFor={inputId} className="mt-4 block max-w-sm">
          <span className="mb-1.5 block text-[13px] font-medium text-ink-2">{t("auth.mailbox.emailLabel")}</span>
          <input
            id={inputId} type="email" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="name@example.com" autoComplete="email"
            className="h-11 w-full rounded-xl border border-amber/40 bg-surface px-3 text-[14px] outline-none focus:border-amber focus:ring-2 focus:ring-amber/20"
          />
        </label>
      )}

      <div className="mt-4" aria-live="polite" aria-busy={mail.isLoading || undefined}>
        {!enabled ? null : mail.isError ? (
          <p className="text-[13px] text-rose">{t("auth.mailbox.error")}</p>
        ) : !mail.isLoading && items.length === 0 ? (
          <p className="flex items-center gap-2 text-[13.5px] text-muted"><Inbox className="h-4 w-4 shrink-0" aria-hidden />{t("auth.mailbox.empty", { email: target })}</p>
        ) : (
          <MailboxList loading={mail.isLoading} items={items} />
        )}
      </div>
    </MailboxFrame>
  );
}
