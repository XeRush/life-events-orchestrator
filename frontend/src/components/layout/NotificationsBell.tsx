import { AnimatePresence, motion } from "framer-motion";
import { Bell, MessageCircle, Phone, Mail, Inbox } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { metaApi } from "../../api";
import { useAction, useNotifications } from "../../hooks/queries";
import { useLang, useT } from "../../i18n";
import { cn, relative } from "../../lib/format";
import { MockBadge } from "../ui/StatusBadge";

const CHANNEL_ICON = { IN_APP: Inbox, SMS: MessageCircle, EMAIL: Mail, VOICE: Phone } as const;

/** `dark` is accepted for older call sites and ignored: the bell follows the theme. */
export function NotificationsBell(_props: { dark?: boolean } = {}) {
  const t = useT();
  const lang = useLang();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data } = useNotifications();
  const readAll = useAction(() => metaApi.readAll(), { invalidate: [["notifications"]] });
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onClick); document.removeEventListener("keydown", onKey); };
  }, [open]);
  const unread = data?.unread ?? 0;
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={`${t("nav.notifications")}${unread ? ` (${unread})` : ""}`}
        className={cn("relative grid h-9 w-9 cursor-pointer place-items-center rounded-full transition-colors", "text-ink-2 hover:bg-paper-2")}>
        <Bell className="h-[18px] w-[18px]" aria-hidden />
        {unread > 0 && <span className="absolute -end-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-rose px-1 text-[10px] font-semibold text-on-accent">{unread > 9 ? "9+" : unread}</span>}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            className="absolute end-0 top-11 z-40 w-[min(92vw,380px)] overflow-hidden rounded-2xl border border-line bg-surface text-ink shadow-[var(--shadow-pop)]">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <p className="font-medium">{t("nav.notifications")}</p>
              {unread > 0 && <button onClick={() => readAll.mutate(undefined)} className="cursor-pointer text-xs text-azure hover:underline">{t("common.markAllRead")}</button>}
            </div>
            <ul className="max-h-[60vh] divide-y divide-line overflow-y-auto scroll-thin">
              {(data?.items ?? []).length === 0 && <li className="px-4 py-8 text-center text-sm text-muted">{t("common.noNotifications")}</li>}
              {(data?.items ?? []).map((n) => {
                const Icon = CHANNEL_ICON[n.channel];
                return (
                  <li key={n.id}>
                    <button onClick={() => { metaApi.readNotification(n.id).catch(() => undefined); if (n.link) navigate(n.link); setOpen(false); }}
                      className={cn("flex w-full cursor-pointer gap-3 px-4 py-3 text-start hover:bg-paper-2", !n.read_at && "bg-azure-soft/40")}>
                      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2"><span className="truncate text-sm font-medium">{n.title}</span>{n.is_mock && <MockBadge compact />}</span>
                        <span className="mt-0.5 line-clamp-2 block text-xs text-muted">{n.body}</span>
                        <span className="mt-1 block text-[11px] text-faint">{n.channel} · {relative(n.created_at, lang)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
