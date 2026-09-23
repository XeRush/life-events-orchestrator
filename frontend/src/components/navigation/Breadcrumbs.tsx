import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

export function Breadcrumbs({ trail }: { trail: { label: string; to?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-5 flex items-center gap-1.5 text-sm text-muted">
      {trail.map((t, i) => (
        <span key={t.label} className="flex items-center gap-1.5">
          {t.to ? <Link to={t.to} className="hover:text-ink hover:underline underline-offset-4">{t.label}</Link> : <span aria-current="page" className="font-mono text-ink">{t.label}</span>}
          {i < trail.length - 1 && <ChevronRight className="rtl-flip h-3.5 w-3.5" aria-hidden />}
        </span>
      ))}
    </nav>
  );
}
