import { Link } from "react-router-dom";
import { useT, type MessageKey } from "../../i18n";
import { Logo } from "../ui/primitives";
import { MockBadge } from "../ui/StatusBadge";

const LINKS: { to: string; label: MessageKey }[] = [
  { to: "/architecture", label: "nav.architecture" },
  { to: "/register", label: "nav.getStarted" },
  { to: "/login", label: "nav.signIn" },
  { to: "/login?demo=1", label: "landing.hero.ctaDemo" },
];

/** Public footer: team, challenge, and the standing statement that government integrations are simulated. */
export function PublicFooter() {
  const t = useT();
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)] lg:py-12">
        <div className="min-w-0">
          <Logo size={28} />
          <p className="mt-3 max-w-sm text-[14px] leading-relaxed text-muted">{t("landing.footer.about")}</p>
          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            <MockBadge />
            <span className="text-[12.5px] text-muted">{t("landing.footer.simulated")}</span>
          </div>
        </div>
        <div className="min-w-0">
          <p className="eyebrow">{t("landing.footer.challengeTitle")}</p>
          <p className="mt-2.5 text-[14px] text-ink-2">{t("landing.footer.challenge")}</p>
          <p className="mt-1 text-[13px] text-muted">{t("landing.footer.track")}</p>
          <p className="mt-3 text-[14px] text-ink-2">{t("app.team")}</p>
        </div>
        <nav aria-label={t("landing.footer.navLabel")} className="min-w-0">
          <p className="eyebrow">{t("landing.footer.explore")}</p>
          <ul className="mt-1.5 grid grid-cols-2 gap-x-4 text-[14px] md:grid-cols-1">
            {LINKS.map((l) => (
              <li key={l.to}>
                <Link to={l.to} className="inline-flex min-h-10 items-center text-ink-2 underline-offset-4 transition-colors hover:text-ink hover:underline">{t(l.label)}</Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="border-t border-line">
        <p className="mx-auto max-w-6xl px-4 py-4 font-mono text-[11px] uppercase tracking-[0.14em] text-muted sm:px-6">{t("app.prototype")}</p>
      </div>
    </footer>
  );
}
