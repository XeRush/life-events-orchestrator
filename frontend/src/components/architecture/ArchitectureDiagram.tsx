import { motion, useReducedMotion } from "framer-motion";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
import { ArrowDown, ArrowRight, ChevronLeft, ChevronRight, Mic, MousePointer2, Pause, Play, Route, Volume2, X } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { gsap, Stagger, StaggerItem, useGsap } from "../../animations/motion";
import { ease, prefersReducedMotion } from "../../animations/variants";
import { isRTL, useLang, useT, type MessageKey } from "../../i18n";
import { cn } from "../../lib/format";
import {
  ADAPTER_CHIPS, CANVAS, EDGE_COLOR, EDGE_ORDER, EDGES, LINKS, NODES, PD_DOTS, TRACE, ZONES, nodeById, roundedPath, type ArchNode, type BadgeTone,
  type EdgeKind, type ZoneId,
} from "./diagram";

gsap.registerPlugin(DrawSVGPlugin);

const STACK_BELOW = 980;

/** Zone tints as theme tokens: the soft accent fills the band, the solid accent draws its dotted outline. */
const ZONE_STYLE: Record<ZoneId, { fill: string; stroke: string; text: string; tint: string }> = {
  channel: { fill: "var(--color-azure-soft)", stroke: "var(--color-azure)", text: "text-azure", tint: "border-azure/25 bg-azure-soft/55" },
  platform: { fill: "var(--color-violet-soft)", stroke: "var(--color-violet)", text: "text-violet", tint: "border-violet/25 bg-violet-soft/55" },
  institution: { fill: "var(--color-civic-soft)", stroke: "var(--color-civic)", text: "text-civic", tint: "border-civic/25 bg-civic-soft/55" },
};

const BADGE: Record<BadgeTone, string> = {
  mock: "border-dashed border-amber/60 bg-amber-soft text-amber",
  auth: "border-civic/40 bg-civic-soft text-civic",
  human: "border-violet/40 bg-violet-soft text-violet",
  projection: "border-azure/40 bg-azure-soft text-azure",
  fallback: "border-dashed border-amber/60 bg-stage-2 text-amber",
  readonly: "border-line-2 bg-paper-2 text-muted",
  gate: "border-violet/40 bg-violet-soft text-violet",
};

export const nodeName = (id: string): MessageKey => (id === "voice" ? "landing.arch.node.voice" : nodeById(id).title);

function Badge({ tone, label }: { tone: BadgeTone; label: MessageKey }) {
  const t = useT();
  return <span className={cn("absolute -top-2.5 end-3 rounded-md border px-1.5 py-0.5 font-mono text-[9.5px] uppercase leading-none tracking-[0.12em]", BADGE[tone])}>{t(label)}</span>;
}

/** One node card; used on the canvas (absolute, positioned with logical insets so RTL mirrors it) and in the stacked layout. */
function NodeCard({ node, absolute, dim, hi, onHover }: { node: ArchNode; absolute?: boolean; dim?: boolean; hi?: boolean; onHover?: (id: string | null) => void }) {
  const t = useT();
  const Icon = node.icon;
  const pos = absolute ? { insetInlineStart: node.x, top: node.y, width: node.w, height: node.h } : undefined;
  const hover = onHover ? { onMouseEnter: () => onHover(node.id), onMouseLeave: () => onHover(null) } : {};
  const shell = cn(
    "rounded-2xl border bg-stage-2 text-ink shadow-(--shadow-card) transition-[opacity,box-shadow,border-color] duration-300",
    absolute ? "absolute" : "relative",
    node.dashed ? "border-dashed border-amber/60" : "border-line",
    dim && "opacity-30",
    hi && "border-civic shadow-[0_0_0_4px_color-mix(in_oklab,var(--color-civic)_18%,transparent)]",
  );

  if (node.variant === "voice") {
    return (
      <div data-node={node.id} style={pos} className={cn(shell, "flex flex-col overflow-hidden")} {...hover}>
        <div className="flex flex-1 items-start gap-2.5 px-3.5 py-2">
          <Mic className="mt-0.5 h-4 w-4 shrink-0 text-azure" aria-hidden />
          <div className="min-w-0">
            <p className="font-display text-[14.5px] leading-tight">{t("landing.arch.node.stt")}</p>
            <p className="mt-0.5 text-[11.5px] leading-snug text-muted">{t("landing.arch.node.sttDetail")}</p>
          </div>
        </div>
        <div className="flex flex-1 items-start gap-2.5 border-t border-line px-3.5 py-2">
          <Volume2 className="mt-0.5 h-4 w-4 shrink-0 text-azure" aria-hidden />
          <div className="min-w-0">
            <p className="font-display text-[14.5px] leading-tight">{t("landing.arch.node.tts")}</p>
            <p className="mt-0.5 text-[11.5px] leading-snug text-muted">{t("landing.arch.node.ttsDetail")}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div data-node={node.id} style={pos} className={cn(shell, "flex flex-col px-3.5 py-3")} {...hover}>
      {node.badge && <Badge tone={node.badge.tone} label={node.badge.label} />}
      <p className="flex min-w-0 items-center gap-2">
        <Icon className="h-4 w-4 shrink-0 text-muted" aria-hidden />
        <span className="truncate font-display text-[15px] leading-tight">{t(node.title)}</span>
      </p>
      <p className="mt-1 text-[11.25px] leading-[1.38] text-muted">{t(node.detail)}</p>

      {node.variant === "agent" && (
        <div className="mt-auto flex flex-col items-stretch gap-1.5 pt-3">
          <span className="rounded-xl border border-violet/40 bg-violet-soft px-3 py-2 text-center text-[12px] font-medium text-violet">{t("landing.arch.agent.router")}</span>
          <ArrowDown className="mx-auto h-3.5 w-3.5 text-faint" aria-hidden />
          <div className="grid grid-cols-3 gap-1.5">
            {(["landing.arch.agent.intake", "landing.arch.agent.status", "landing.arch.agent.exception"] as MessageKey[]).map((k) => (
              <span key={k} className="min-w-0 truncate rounded-lg border border-line bg-paper px-1 py-1.5 text-center text-[11px] text-ink-2">{t(k)}</span>
            ))}
          </div>
          <p className="mt-1.5 text-center text-[10.5px] text-muted">{t("landing.arch.agent.handover")}</p>
        </div>
      )}

      {node.variant === "adapters" && (
        <ul className="mt-auto grid grid-cols-5 gap-1.5 pt-2">
          {ADAPTER_CHIPS.map((chip) => (
            <li key={chip.label} className={cn("min-w-0 rounded-lg border px-2 py-1.5", chip.noApi ? "border-dashed border-amber/60 bg-amber-soft/70" : "border-line bg-paper")}>
              <p className={cn("text-[11px] font-semibold leading-tight", chip.noApi ? "text-amber" : "text-ink")}>{t(chip.label)}</p>
              <p className={cn("mt-0.5 text-[10px] leading-tight", chip.noApi ? "text-amber" : "text-muted")}>{t(chip.service)}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PdMarker({ n, small }: { n: number; small?: boolean }) {
  return (
    <span className={cn("inline-grid shrink-0 place-items-center rounded-full bg-rose font-bold text-on-accent", small ? "h-4 w-4 text-[9px]" : "h-5 w-5 text-[10.5px]")} aria-hidden>{n}</span>
  );
}

/** Text alternative / stacked layout: every flow, grouped by the zone it starts in. */
export function DiagramList({ stacked }: { stacked?: boolean }) {
  const t = useT();
  return (
    <Stagger as="ol" gap={0.08} className="space-y-4">
      {ZONES.map((zone) => {
        const nodes = NODES.filter((n) => n.zone === zone.id);
        const edges = EDGES.filter((e) => nodeById(e.from).zone === zone.id);
        return (
          <StaggerItem as="li" key={zone.id} className={cn("rounded-3xl border p-4 sm:p-5", ZONE_STYLE[zone.id].tint)}>
            <h3 className="flex flex-wrap items-baseline gap-x-2 text-[1.2rem]">
              <span className={cn("font-mono text-[11px] tracking-[0.16em]", ZONE_STYLE[zone.id].text)}>{zone.index}</span>
              {t(zone.title)}
            </h3>
            <p className="mt-0.5 text-[12.5px] text-muted">{t(zone.sub)}</p>
            {stacked && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {nodes.map((n) => <NodeCard key={n.id} node={n} />)}
              </div>
            )}
            <p className="eyebrow mt-5">{t("landing.arch.flowsFrom")}</p>
            <ul className="mt-2 space-y-2">
              {edges.map((e) => (
                <li key={e.id} className="flex items-start gap-2.5 text-[13.5px] leading-snug text-ink-2">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: EDGE_COLOR[e.kind] }} aria-hidden />
                  <span className="min-w-0">
                    <span className="font-medium text-ink">{t(nodeName(e.from))}</span>
                    <ArrowRight className="rtl-flip mx-1.5 inline h-3.5 w-3.5 text-muted" aria-hidden />
                    <span className="sr-only">{e.both ? t("landing.arch.both") : t("landing.arch.to")}</span>
                    <span className="font-medium text-ink">{t(nodeName(e.to))}</span>
                    <span className="text-muted">: {t(e.label)}</span>
                    {e.pd && (
                      <span className="ms-2 inline-flex items-center gap-1 align-middle text-[12px] text-rose">
                        <PdMarker n={e.pd} small />{t("landing.arch.pdInline")}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </StaggerItem>
        );
      })}
    </Stagger>
  );
}

/**
 * Desktop canvas: zones, nodes, labelled arrows, personal-data dots, the "follow one call" trace and hover highlighting.
 * Scroll story: nodes rise in as they enter; connectors draw in reading order, scrubbed to the scroll position.
 * Mirrors for RTL: HTML nodes use logical insets, SVG x coordinates are reflected and SVG text runs right-to-left.
 */
function Canvas({ width, step }: { width: number; step: number | null }) {
  const t = useT();
  const rtl = isRTL(useLang());
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const outer = useRef<HTMLDivElement>(null);
  const drawTl = useRef<gsap.core.Timeline | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const scale = Math.min(1, width / CANVAS.w);
  const offset = Math.max(0, (width - CANVAS.w * scale) / 2);
  const focus = step != null ? TRACE[step] : hover ? LINKS[hover] : null;
  const X = (x: number) => (rtl ? CANVAS.w - x : x);
  const flip = (a?: "start" | "middle" | "end") => a ?? "middle";

  useGsap(outer, ({ gsap, ScrollTrigger, reduce }) => {
    if (reduce) return;
    const q = gsap.utils.selector(outer.current);
    gsap.set(q("[data-node]"), { autoAlpha: 0, y: 16 });
    gsap.set(q("[data-zone]"), { autoAlpha: 0 });
    ScrollTrigger.batch(q("[data-zone], [data-node]"), {
      start: "top 92%", once: true,
      onEnter: (batch) => gsap.to(batch, { autoAlpha: 1, y: 0, duration: 0.55, stagger: 0.05, overwrite: true, clearProps: "opacity,visibility,transform" }),
    });

    gsap.set(q("[data-edge-base]"), { drawSVG: "0%" });
    gsap.set(q("[data-edge-flow], [data-edge-label]"), { autoAlpha: 0 });
    gsap.set(q("[data-pd]"), { scale: 0, transformOrigin: "50% 50%" });
    const tl = gsap.timeline({ scrollTrigger: { trigger: outer.current, start: "top 72%", end: "bottom 88%", scrub: 0.8 } });
    EDGE_ORDER.forEach((id, i) => {
      const at = i * 0.55;
      tl.to(q(`[data-edge-base='${id}']`), { drawSVG: "100%", duration: 1, ease: "none" }, at)
        .to(q(`[data-edge-flow='${id}'], [data-edge-label='${id}']`), { autoAlpha: 1, duration: 0.35 }, at + 0.75);
      const pd = EDGES.find((e) => e.id === id)?.pd;
      if (pd) tl.to(q(`[data-pd='${pd}']`), { scale: 1, duration: 0.4, ease: "power3.out" }, at + 0.85);
    });
    drawTl.current = tl;
    return () => { drawTl.current = null; };
  }, [rtl]);

  // Starting the walkthrough finishes the drawing at once, so no step points at an arrow that is not there yet.
  useEffect(() => {
    const tl = drawTl.current;
    if (step == null || !tl) return;
    tl.scrollTrigger?.kill(false);
    tl.progress(1);
  }, [step]);

  const marker = (kind: EdgeKind) => `arr-${kind}-${uid}`;

  return (
    <div ref={outer} style={{ height: CANVAS.h * scale }} className="relative">
      <div style={{ width: CANVAS.w, height: CANVAS.h, transform: `scale(${scale})`, transformOrigin: "top left", left: offset }} className="absolute top-0" dir={rtl ? "rtl" : "ltr"}>
        <svg width={CANVAS.w} height={CANVAS.h} direction={rtl ? "rtl" : "ltr"} className="absolute inset-0 overflow-visible" aria-hidden style={{ fontFamily: "var(--font-sans)" }}>
          <defs>
            {(Object.keys(EDGE_COLOR) as EdgeKind[]).map((kind) => (
              <marker key={kind} id={marker(kind)} viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0 0 L10 5 L0 10 z" fill={EDGE_COLOR[kind]} />
              </marker>
            ))}
          </defs>

          {ZONES.map((zone) => (
            <rect key={zone.id} data-zone x={4} y={zone.y} width={CANVAS.w - 8} height={zone.h} rx={26}
              fill={ZONE_STYLE[zone.id].fill} fillOpacity={0.55} stroke={ZONE_STYLE[zone.id].stroke} strokeOpacity={0.35} strokeDasharray="2 6" strokeWidth={1.2} />
          ))}

          {EDGES.map((e) => {
            const d = roundedPath(e.points.map(([x, y]) => [X(x), y] as [number, number]));
            const on = focus?.edges.includes(e.id) ?? false;
            const dim = focus != null && !on;
            return (
              <g key={e.id} style={{ opacity: dim ? 0.12 : 1, transition: "opacity 300ms" }}>
                <path data-edge-base={e.id} d={d} fill="none" stroke={EDGE_COLOR[e.kind]} strokeOpacity={0.28} strokeWidth={1.4} />
                <path
                  data-edge-flow={e.id} d={d} fill="none" stroke={EDGE_COLOR[e.kind]} strokeWidth={on ? 2.6 : 1.7} strokeOpacity={on ? 1 : 0.85}
                  strokeDasharray={e.dashed ? "6 6" : "3 9"} strokeLinecap="round" markerEnd={`url(#${marker(e.kind)})`} markerStart={e.both ? `url(#${marker(e.kind)})` : undefined}
                  style={{ animation: "flow 1.1s linear infinite" }}
                />
                <text
                  data-edge-label={e.id} x={X(e.at.x)} y={e.at.y} textAnchor={flip(e.at.anchor)} fontSize={11} fontWeight={on ? 600 : 500}
                  fill={on ? "var(--color-ink)" : "var(--color-ink-2)"}
                  transform={e.at.rotate ? `rotate(-90 ${X(e.at.x)} ${e.at.y})` : undefined}
                  style={{ paintOrder: "stroke", stroke: "var(--color-stage)", strokeWidth: 4, strokeLinejoin: "round" }}
                >
                  {t(e.label)}
                </text>
              </g>
            );
          })}

          {PD_DOTS.map((p) => (
            <g key={p.n} transform={`translate(${X(p.x)} ${p.y})`}>
              <g data-pd={p.n}>
                <title>{`${t("landing.arch.pdTitle", { n: p.n })} ${t(p.what)}`}</title>
                <circle r={9.5} fill="var(--color-rose)" stroke="var(--color-stage)" strokeWidth={2.5} />
                <text y={3.6} textAnchor="middle" fontSize={10} fontWeight={700} fill="var(--color-on-accent)">{p.n}</text>
              </g>
            </g>
          ))}
        </svg>

        {ZONES.map((zone) => (
          <p key={zone.id} data-zone className="absolute flex items-baseline gap-2.5 whitespace-nowrap" style={{ insetInlineStart: 28, top: zone.y + 12 }}>
            <span className={cn("font-mono text-[11px] tracking-[0.16em]", ZONE_STYLE[zone.id].text)}>{zone.index}</span>
            <span className="font-display text-[15px] text-ink">{t(zone.title)}</span>
            <span className="text-[11.5px] text-muted">{t(zone.sub)}</span>
          </p>
        ))}

        {NODES.map((n) => (
          <NodeCard key={n.id} node={n} absolute onHover={setHover} dim={focus != null && !focus.nodes.includes(n.id)} hi={focus?.nodes.includes(n.id)} />
        ))}
      </div>
    </div>
  );
}

/** Stepper: walks one call through the system; auto-advances unless reduced motion is on. */
function TraceControls({ step, setStep }: { step: number | null; setStep: Dispatch<SetStateAction<number | null>> }) {
  const t = useT();
  const reduce = useReducedMotion();
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing || step == null) return;
    const id = window.setTimeout(() => {
      if (step >= TRACE.length - 1) setPlaying(false);
      else setStep(step + 1);
    }, 3800);
    return () => window.clearTimeout(id);
  }, [playing, step, setStep]);

  const start = () => {
    setStep(0);
    setPlaying(!prefersReducedMotion());
  };
  const icon = "grid h-10 w-10 cursor-pointer place-items-center rounded-full border border-line-2 text-ink transition-colors hover:bg-paper-2 disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-stage-2 shadow-(--shadow-card)">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4 sm:p-5">
        {step == null ? (
          <>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] leading-relaxed text-ink-2">{t("landing.arch.trace.intro")}</p>
              <p className="mt-1 hidden items-center gap-1.5 text-[12.5px] text-muted [@media(hover:hover)]:flex"><MousePointer2 className="h-3.5 w-3.5 rtl-flip" aria-hidden />{t("landing.arch.hoverHint")}</p>
            </div>
            <button type="button" onClick={start} className="inline-flex h-11 shrink-0 cursor-pointer items-center gap-2 self-start rounded-full bg-civic px-5 text-[14px] font-semibold text-on-accent transition-colors hover:bg-civic/90 sm:self-auto">
              <Route className="h-4 w-4" aria-hidden />{t("landing.arch.trace.start")}
            </button>
          </>
        ) : (
          <>
            <div className="min-w-0 flex-1" aria-live="polite">
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-civic">{t("landing.arch.trace.step", { n: step + 1, total: TRACE.length })}</p>
              <motion.p key={step} initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease }} className="mt-1 text-[15px] leading-relaxed text-ink">
                {t(TRACE[step].caption)}
              </motion.p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button type="button" onClick={() => { setPlaying(false); setStep((s) => Math.max(0, (s ?? 0) - 1)); }} disabled={step === 0} aria-label={t("landing.arch.trace.prev")} className={icon}>
                <ChevronLeft className="rtl-flip h-4 w-4" aria-hidden />
              </button>
              <button type="button" onClick={() => setPlaying((p) => !p)} aria-label={playing ? t("landing.arch.trace.pause") : t("landing.arch.trace.play")}
                className="grid h-10 w-10 cursor-pointer place-items-center rounded-full bg-ink text-paper transition-colors hover:bg-ink-2">
                {playing ? <Pause className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
              </button>
              <button type="button" onClick={() => { setPlaying(false); setStep((s) => Math.min(TRACE.length - 1, (s ?? 0) + 1)); }} disabled={step === TRACE.length - 1} aria-label={t("landing.arch.trace.next")} className={icon}>
                <ChevronRight className="rtl-flip h-4 w-4" aria-hidden />
              </button>
              <button type="button" onClick={() => { setPlaying(false); setStep(null); }} aria-label={t("landing.arch.trace.exit")}
                className="grid h-10 w-10 cursor-pointer place-items-center rounded-full text-muted transition-colors hover:bg-paper-2 hover:text-ink">
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </>
        )}
      </div>
      {step != null && (
        <div className="h-0.5 bg-line" aria-hidden>
          <motion.div className="h-full origin-left bg-civic rtl:origin-right" initial={false} animate={{ scaleX: (step + 1) / TRACE.length }} transition={{ duration: reduce ? 0 : 0.5, ease }} />
        </div>
      )}
    </div>
  );
}

/** The responsive architecture figure: a canvas on wide screens, stacked zone cards on narrow ones, always with a text alternative. */
export function ArchitectureDiagram() {
  const t = useT();
  const wrap = useRef<HTMLElement>(null);
  const [width, setWidth] = useState(0);
  const [step, setStep] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const stacked = width > 0 && width < STACK_BELOW;

  return (
    <figure ref={wrap} aria-labelledby="arch-figure-title" className="w-full">
      <h2 id="arch-figure-title" className="sr-only">{t("landing.arch.figureTitle")}</h2>
      {width === 0 ? <div className="min-h-[60vh]" /> : stacked ? (
        <DiagramList stacked />
      ) : (
        <>
          <div className="mb-5"><TraceControls step={step} setStep={setStep} /></div>
          <div role="img" aria-label={t("landing.arch.figureAlt")}>
            <Canvas width={width} step={step} />
          </div>
          <details className="group mt-6 rounded-2xl border border-line bg-surface p-4 sm:p-5">
            <summary className="flex min-h-10 cursor-pointer list-none items-center text-[14px] font-medium text-ink marker:hidden">
              <span className="inline-flex items-center gap-2"><ChevronRight className="rtl-flip h-4 w-4 transition-transform group-open:rotate-90" aria-hidden />{t("landing.arch.readAsList")}</span>
            </summary>
            <div className="mt-4"><DiagramList /></div>
          </details>
        </>
      )}
    </figure>
  );
}

export { PdMarker };
