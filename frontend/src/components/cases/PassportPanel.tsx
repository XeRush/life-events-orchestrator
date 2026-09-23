import { FileText, Globe, Mic, ShieldCheck, Users } from "lucide-react";
import type { Passport } from "../../types";
import { fmtDate, fmtDateTime, fmtDuration, title } from "../../utils/format";
import { Badge } from "../ui/primitives";

function Block({ icon: Icon, label, children }: { icon: typeof Users; label: string; children: React.ReactNode }) {
  return (
    <section>
      <h4 className="eyebrow mb-2 flex items-center gap-2"><Icon className="h-3.5 w-3.5" aria-hidden />{label}</h4>
      <div className="text-sm">{children}</div>
    </section>
  );
}

/** The zero-repetition passport: everything the resident never has to say twice. */
export function PassportPanel({ passport }: { passport: Passport }) {
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <Block icon={Users} label="Identity and event">
        <p className="font-medium">{passport.identity.name} <span className="font-mono text-xs text-faint">{passport.identity.resident_reference}</span></p>
        <p className="text-muted">{passport.event.title} · {fmtDate(passport.event.event_date)}</p>
        <ul className="mt-2 space-y-0.5 text-muted">
          {passport.participants.map((p, i) => <li key={i}>{title(p.role)}: {p.name ?? "-"}{p.relationship ? ` (${p.relationship})` : ""}</li>)}
        </ul>
      </Block>
      <Block icon={ShieldCheck} label="Consent">
        <ul className="space-y-2">
          {passport.consents.map((c) => (
            <li key={c.consent_type} className="flex items-start justify-between gap-3">
              <span>{title(c.consent_type.replace("_CONSENT", ""))}<span className="block text-xs text-faint">v{c.version} · {c.source} · {fmtDateTime(c.captured_at)}</span></span>
              <Badge tone={c.status === "GRANTED" ? "civic" : "rose"}>{title(c.status)}</Badge>
            </li>
          ))}
        </ul>
      </Block>
      <Block icon={Globe} label="Preferences">
        <dl className="space-y-1">
          {Object.entries(passport.preferences).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3"><dt className="text-muted">{title(k)}</dt><dd className="font-medium">{String(v)}</dd></div>
          ))}
        </dl>
      </Block>
      <Block icon={FileText} label="Documents">
        {passport.documents.length === 0 ? <p className="text-muted">No documents requested or received.</p> : (
          <ul className="space-y-2">
            {passport.documents.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3">
                <span>{d.name}<span className="block text-xs text-faint">{d.uploaded_at ? fmtDateTime(d.uploaded_at) : "Requested"}</span></span>
                <Badge tone={d.status === "REQUESTED" ? "amber" : d.verification_status === "VERIFIED" ? "civic" : "azure"}>{d.status === "REQUESTED" ? "Requested" : d.verification_status === "VERIFIED" ? "Verified" : "Received"}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Block>
      <div className="sm:col-span-2">
        <Block icon={Mic} label="Conversations">
          {passport.conversations.length === 0 ? <p className="text-muted">No conversations yet.</p> : (
            <ul className="divide-y divide-line/70">
              {passport.conversations.map((c) => (
                <li key={c.id} className="flex items-center justify-between py-2">
                  <span>{title(c.channel.replace("VOICE_", ""))} call · {c.provider}<span className="block text-xs text-faint">{fmtDateTime(c.started_at)}</span></span>
                  <span className="font-mono text-xs text-muted">{c.turns} turns · {fmtDuration(c.duration_seconds)}</span>
                </li>
              ))}
            </ul>
          )}
        </Block>
      </div>
    </div>
  );
}
