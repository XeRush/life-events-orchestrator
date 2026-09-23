import { motion } from "framer-motion";
import {
  ArrowRight, BellRing, Building2, CalendarClock, FileCheck2, GitBranch, Layers, Mic, Play, RefreshCw, ShieldCheck, UserCheck,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { ease, rise, stagger } from "../animations/variants";
import { HeroGraph } from "../components/graph/HeroGraph";
import { Button, Logo } from "../components/ui/primitives";
import { useAuth } from "../stores/auth";

const reveal = { initial: "initial", whileInView: "animate", viewport: { once: true, margin: "-80px" } } as const;

const STEPS = [
  { icon: Mic, title: "One call", text: "“My daughter was born yesterday.” The assistant identifies itself as AI, understands the event and asks for consent." },
  { icon: FileCheck2, title: "One persistent case", text: "A Life Event Case is created with a passport of everything already said: event, people, consent, preferences, documents." },
  { icon: GitBranch, title: "A dependency graph", text: "Registration, certificate, identity, health and more are planned as a real graph. Independent services run in parallel." },
  { icon: Building2, title: "Authorities decide", text: "Each authority approves, rejects or asks for documents. LIFELOOP only coordinates and reflects their events." },
  { icon: BellRing, title: "Meaningful callbacks", text: "The resident is called when a milestone lands or action is needed. Never for noise." },
];

const AI = ["Understand the event", "Plan the journey", "Coordinate services", "Monitor progress", "Explain status", "Notify", "Replan", "Escalate"];
const GOV = ["Approve", "Reject", "Determine eligibility", "Authorize", "Maintain official records"];

const FEATURES = [
  { icon: UserCheck, title: "Zero-repetition passport", text: "Call back days later and ask “Where are we?”. The case already knows." },
  { icon: RefreshCw, title: "Dependency-aware replanning", text: "A delayed certificate keeps identity blocked, silently. A rejection triggers retry, an alternative path, or a human." },
  { icon: CalendarClock, title: "Digital life timeline", text: "Every meaningful state change, persisted and auditable, across every life event." },
  { icon: ShieldCheck, title: "Auditable by design", text: "Actor, actor type, before/after state and source for every action. AI never invents a decision." },
];

export default function Landing() {
  const navigate = useNavigate();
  const signedIn = !!useAuth((s) => s.tokens);
  return (
    <div className="bg-paper">
      <div className="bg-ink text-paper">
        <nav className="mx-auto flex max-w-[1240px] items-center justify-between px-5 py-5 sm:px-8" aria-label="Primary">
          <Logo light />
          <div className="flex items-center gap-2">
            <Link to="/login" className="rounded-full px-4 py-2 text-sm text-paper/80 hover:text-paper">Sign in</Link>
            <Button variant="light" size="sm" onClick={() => navigate(signedIn ? "/app" : "/register")}>{signedIn ? "Open dashboard" : "Get started"}</Button>
          </div>
        </nav>

        <section className="mx-auto grid max-w-[1240px] items-center gap-6 px-5 pb-20 pt-10 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:pb-28 lg:pt-16">
          <motion.div initial="initial" animate="animate" variants={stagger}>
            <motion.p variants={rise} className="eyebrow !text-civic-bright/90">Life-event service orchestration · Government services</motion.p>
            <motion.h1 variants={rise} className="mt-5 font-display text-[clamp(3.4rem,9vw,7rem)] leading-[0.95] tracking-[0.02em]">LIFELOOP</motion.h1>
            <motion.p variants={rise} className="mt-5 font-display text-2xl text-civic-bright sm:text-3xl">One event. One call. Every next step.</motion.p>
            <motion.p variants={rise} className="mt-6 max-w-xl text-[17px] leading-relaxed text-paper/75">
              Life events shouldn’t require citizens to navigate a maze of departments. LIFELOOP turns a single call into a living journey that coordinates every connected service.
            </motion.p>
            <motion.div variants={rise} className="mt-9 flex flex-wrap gap-3">
              <Button variant="light" size="lg" icon={<ArrowRight className="h-4 w-4" />} onClick={() => navigate(signedIn ? "/app/life-events" : "/register")}>Start a Life Event</Button>
              <Button variant="ghost" size="lg" className="!text-paper hover:!bg-white/10 border border-white/25" icon={<Play className="h-4 w-4" />} onClick={() => navigate("/login?demo=1")}>Watch Demo</Button>
            </motion.div>
            <motion.p variants={rise} className="mt-6 text-xs text-paper/50">Prototype · mock government entities · AI orchestrates, government decides.</motion.p>
          </motion.div>
          <div className="relative mx-auto w-full max-w-[600px]"><HeroGraph /></div>
        </section>
      </div>

      <section className="mx-auto max-w-[1240px] px-5 py-20 sm:px-8 sm:py-28">
        <motion.div {...reveal} variants={stagger}>
          <motion.p variants={rise} className="eyebrow">The idea</motion.p>
          <motion.h2 variants={rise} className="mt-3 max-w-3xl text-4xl leading-tight sm:text-5xl">Government services are transaction-oriented. LIFELOOP is life-event-oriented.</motion.h2>
        </motion.div>
        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          <motion.div {...reveal} variants={rise} className="card p-8">
            <p className="eyebrow mb-4">Traditional</p>
            <div className="space-y-2.5 font-mono text-sm text-muted">
              {["Service A", "Service B", "Service C", "Service D"].map((s) => (
                <p key={s} className="flex items-center gap-3"><span className="text-ink">Resident</span><span className="h-px flex-1 bg-line-2" aria-hidden /><ArrowRight className="h-3.5 w-3.5" aria-hidden /><span>{s}</span></p>
              ))}
            </div>
            <p className="mt-6 text-sm text-muted">The resident is the integration layer: repeating the same story, tracking every application.</p>
          </motion.div>
          <motion.div {...reveal} variants={rise} className="card border-civic/30 bg-civic-soft/40 p-8">
            <p className="eyebrow mb-4 !text-civic">LIFELOOP</p>
            <div className="space-y-2 font-mono text-sm">
              <p><span className="text-ink">Resident</span> → Life event</p>
              <p className="text-muted ps-4">↓ manages the dependency graph</p>
              <p className="text-muted ps-4">↓ entities execute their own responsibilities</p>
              <p className="text-muted ps-4">↓ propagates state between them</p>
              <p className="text-civic">↓ resident receives only meaningful updates</p>
            </div>
            <p className="mt-6 text-sm text-muted">The resident tells the story once. The case remembers.</p>
          </motion.div>
        </div>
      </section>

      <section className="bg-paper-2/70 py-20 sm:py-28">
        <div className="mx-auto max-w-[1240px] px-5 sm:px-8">
          <motion.p {...reveal} variants={rise} className="eyebrow">How it works</motion.p>
          <motion.h2 {...reveal} variants={rise} className="mt-3 max-w-2xl text-4xl sm:text-5xl">From a sentence to a coordinated journey.</motion.h2>
          <motion.ol {...reveal} variants={stagger} className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
            {STEPS.map((s, i) => (
              <motion.li key={s.title} variants={rise} className="card p-6">
                <div className="mb-5 flex items-center justify-between"><span className="grid h-10 w-10 place-items-center rounded-full bg-ink text-paper"><s.icon className="h-4 w-4" aria-hidden /></span><span className="font-mono text-xs text-faint">0{i + 1}</span></div>
                <h3 className="text-xl">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{s.text}</p>
              </motion.li>
            ))}
          </motion.ol>
        </div>
      </section>

      <section className="mx-auto max-w-[1240px] px-5 py-20 sm:px-8 sm:py-28">
        <motion.div {...reveal} variants={stagger} className="grid gap-5 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <motion.div key={f.title} variants={rise} className="card flex gap-5 p-7">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-civic-soft text-civic"><f.icon className="h-5 w-5" aria-hidden /></span>
              <div><h3 className="text-xl">{f.title}</h3><p className="mt-1.5 text-sm leading-relaxed text-muted">{f.text}</p></div>
            </motion.div>
          ))}
        </motion.div>
      </section>

      <section className="bg-ink py-20 text-paper sm:py-28">
        <div className="mx-auto max-w-[1240px] px-5 sm:px-8">
          <motion.h2 {...reveal} variants={rise} className="max-w-3xl text-4xl leading-tight sm:text-5xl">AI coordinates. Government decides.</motion.h2>
          <div className="mt-12 grid gap-6 md:grid-cols-2">
            <motion.div {...reveal} variants={rise} transition={{ ease }} className="rounded-3xl border border-white/15 p-8">
              <p className="eyebrow !text-civic-bright"><Layers className="me-2 inline h-3.5 w-3.5" aria-hidden />AI role</p>
              <ul className="mt-5 grid grid-cols-2 gap-x-6 gap-y-2.5 text-[15px]">{AI.map((a) => <li key={a} className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-civic-bright" aria-hidden />{a}</li>)}</ul>
            </motion.div>
            <motion.div {...reveal} variants={rise} className="rounded-3xl border border-white/15 bg-white/[0.04] p-8">
              <p className="eyebrow !text-paper/60"><Building2 className="me-2 inline h-3.5 w-3.5" aria-hidden />Government role</p>
              <ul className="mt-5 space-y-2.5 text-[15px]">{GOV.map((a) => <li key={a} className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-paper/60" aria-hidden />{a}</li>)}</ul>
              <p className="mt-6 text-sm text-paper/60">The assistant never approves, denies, determines eligibility, impersonates an officer or invents an official decision. Every fact it speaks comes from a backend tool.</p>
            </motion.div>
          </div>
          <motion.div {...reveal} variants={rise} className="mt-14 flex flex-wrap items-center justify-between gap-6 border-t border-white/15 pt-10">
            <p className="font-display text-3xl">One event. One call. Every next step.</p>
            <div className="flex gap-3">
              <Button variant="light" size="lg" onClick={() => navigate("/register")}>Start a Life Event</Button>
              <Button variant="ghost" size="lg" className="!text-paper border border-white/25 hover:!bg-white/10" onClick={() => navigate("/login?demo=1")}>Watch Demo</Button>
            </div>
          </motion.div>
        </div>
        <p className="mx-auto mt-14 max-w-[1240px] px-5 text-xs text-paper/45 sm:px-8">LIFELOOP is a hackathon prototype using mock government entities and a demonstration workflow. Government-authorized integrations would be required for production.</p>
      </section>
    </div>
  );
}
