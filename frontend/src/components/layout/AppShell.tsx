import { AnimatePresence, motion } from "framer-motion";
import { Outlet, useLocation } from "react-router-dom";
import { pageVariants } from "../../animations/variants";
import { useLiveEvents } from "../../hooks/useLiveEvents";
import { useUI } from "../../stores/ui";
import { Toasts } from "../ui/primitives";
import { Header } from "../header/Header";
import { Sidebar } from "../sidebar/Sidebar";

export function AppShell() {
  const location = useLocation();
  const { connected, lastEvent } = useLiveEvents();
  const toasts = useUI((s) => s.toasts);
  const dismiss = useUI((s) => s.dismiss);
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[264px_1fr]">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-paper">
        Skip to content
      </a>
      <Sidebar />
      <div className="flex min-w-0 flex-col">
        <Header live={connected} lastEvent={lastEvent?.event_type} />
        <main id="main" className="mx-auto w-full max-w-[1240px] flex-1 px-4 py-8 sm:px-8 sm:py-10">
          <AnimatePresence mode="wait">
            <motion.div key={location.pathname} variants={pageVariants} initial="initial" animate="animate" exit="exit">
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
        <footer className="border-t border-line px-4 py-4 text-center text-xs text-faint sm:px-8">
          LIFELOOP is a hackathon prototype. Authorities shown are mock government entities; government-authorized integrations would be required for production.
        </footer>
      </div>
      <Toasts toasts={toasts} dismiss={dismiss} />
    </div>
  );
}
