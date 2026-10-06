import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import gsap from "gsap";
import { Footprints, PhoneOff, UserRoundCheck } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { prefersReducedMotion } from "../../animations/variants";
import { isRTL, useLang, useT } from "../../i18n";
import { cn, fmtDate } from "../../lib/format";
import { DONE, NODE_STATE, SOURCE, TONE } from "../../lib/status";
import type { CaseGraph, GraphNode, NodeState } from "../../types/api";

const H = 128;
const MIN_W = 150;
const MAX_W = 210;
const GAP_X = 32;
const MAX_GAP_X = 96;
const GAP_Y = 18;
const ROW_GAP = 34;
const PAD = 8;
const LIVE: NodeState[] = ["SUBMITTING", "SUBMITTED", "PROCESSING", "WAITING_FOR_HUMAN", "WAITING_FOR_PARENT", "READY"];
const EASE = [0.22, 1, 0.36, 1] as const;

interface Box { x: number; y: number; row: number }
interface Layout { boxes: Record<string, Box>; width: number; height: number; w: number }

/** Longest-path layering: works for today's serial chain and for parallel branches added later. */
function layers(graph: CaseGraph): Map<string, number> {
  const depth = new Map<string, number>();
  const deps = new Map<string, string[]>(graph.nodes.map((n) => [n.key, n.dependencies]));
  const visit = (k: string, seen: Set<string> = new Set()): number => {
    if (depth.has(k)) return depth.get(k)!;
    if (seen.has(k)) return 0;
    seen.add(k);
    const d = Math.max(-1, ...(deps.get(k) ?? []).map((p) => visit(p, seen))) + 1;
    depth.set(k, d);
    return d;
  };
  graph.nodes.forEach((n) => visit(n.key));
  return depth;
}

/**
 * Lays the steps out at their real size for the width available (no scaling, so text stays crisp):
 * one row when every step fits, balanced folded rows ("snake") on medium widths, one column on phones.
 * Right-to-left languages mirror the flow.
 */
function layout(graph: CaseGraph, avail: number, rtl: boolean): Layout {
  const depth = layers(graph);
  const byLayer = new Map<number, GraphNode[]>();
  graph.nodes.forEach((n) => byLayer.set(depth.get(n.key)!, [...(byLayer.get(depth.get(n.key)!) ?? []), n]));
  const order = [...byLayer.keys()].sort((a, b) => a - b);
  const count = Math.max(order.length, 1);
  const widest = Math.max(...[...byLayer.values()].map((l) => l.length), 1);
  const inner = Math.max(avail - PAD * 2, 0);
  const fit = (k: number) => (inner - (k - 1) * GAP_X) / k;
  const band = widest * H + (widest - 1) * GAP_Y;
  const boxes: Record<string, Box> = {};

  let perRow = 0;
  for (let k = count; k >= 2; k--) if (fit(k) >= MIN_W) { perRow = k; break; }

  if (perRow >= 2) {
    const rows = Math.ceil(count / perRow);
    const cols = Math.ceil(count / rows); // balanced rows: 3 + 3, never 5 + 1
    const w = Math.min(MAX_W, fit(cols));
    const gap = cols > 1 ? Math.min(MAX_GAP_X, Math.max(GAP_X, (inner - cols * w) / (cols - 1))) : 0;
    order.forEach((layer, li) => {
      const row = Math.floor(li / cols);
      let col = li % cols;
      if (row % 2 === 1) col = cols - 1 - col;
      byLayer.get(layer)!.forEach((n, i) => {
        const offset = (widest - byLayer.get(layer)!.length) / 2 + i;
        boxes[n.key] = { x: PAD + col * (w + gap), y: PAD + row * (band + ROW_GAP) + offset * (H + GAP_Y), row };
      });
    });
    const width = PAD * 2 + cols * w + (cols - 1) * gap;
    const height = PAD * 2 + rows * band + (rows - 1) * ROW_GAP;
    if (rtl) Object.values(boxes).forEach((b) => { b.x = width - b.x - w; });
    return { boxes, width, height, w };
  }

  // One column (phones): each layer is a row of its own; parallel steps sit side by side.
  const w = Math.max(120, Math.min(MAX_W + 120, (inner - (widest - 1) * GAP_Y) / widest));
  order.forEach((layer, li) => {
    byLayer.get(layer)!.forEach((n, i) => {
      const offset = (widest - byLayer.get(layer)!.length) / 2 + i;
      boxes[n.key] = { x: PAD + offset * (w + GAP_Y), y: PAD + li * (H + 26), row: li };
    });
  });
  const width = PAD * 2 + widest * w + (widest - 1) * GAP_Y;
  if (rtl) Object.values(boxes).forEach((b) => { b.x = width - b.x - w; });
  return { boxes, width, height: PAD * 2 + count * H + (count - 1) * 26, w };
}

/** Same row: a horizontal curve between facing sides. Different rows: a vertical curve from bottom to top. */
function edgePath(a: Box, b: Box, w: number) {
  if (a.row === b.row) {
    const forward = b.x >= a.x;
    const x1 = forward ? a.x + w : a.x, y1 = a.y + H / 2, x2 = forward ? b.x : b.x + w, y2 = b.y + H / 2;
    const dx = Math.max(16, Math.abs(x2 - x1) / 2) * (forward ? 1 : -1);
    return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
  }
  const x1 = a.x + w / 2, y1 = a.y + H, x2 = b.x + w / 2, y2 = b.y;
  const dy = Math.max(14, (y2 - y1) / 2);
  return `M ${x1} ${y1} C ${x1} ${y1 + dy}, ${x2} ${y2 - dy}, ${x2} ${y2}`;
}

/**
 * The six steps and what each waits for. Colours come from theme tokens (light and dark).
 * Motion: nodes rise in and edges draw on first view; a packet travels along each live edge; a step whose state changes
 * pulses once (a ring fades out) and its badge cross-fades. Live refetches with no state change animate nothing.
 * `dark` is accepted for older call sites and ignored: the graph follows the theme.
 */
export function LifeEventGraph({ graph, selected, onSelect, label }: {
  graph: CaseGraph; selected?: string | null; onSelect?: (key: GraphNode["key"]) => void; dark?: boolean; label?: string;
}) {
  const t = useT();
  const lang = useLang();
  const rtl = isRTL(lang);
  const reduce = useReducedMotion();
  const wrap = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const els = useRef<Record<string, HTMLElement | null>>({});
  const prev = useRef<Record<string, NodeState>>({});
  const first = useRef(true);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const { boxes, width: gw, height: gh, w } = useMemo(() => layout(graph, width, rtl), [graph, width, rtl]);
  const byKey = useMemo(() => Object.fromEntries(graph.nodes.map((n) => [n.key, n])), [graph.nodes]);
  const ready = width > 0;

  useEffect(() => {
    if (!ready) return;
    const reduceNow = prefersReducedMotion();
    const ctx = gsap.context(() => {
      if (first.current) {
        first.current = false;
        if (reduceNow) return;
        gsap.from(Object.values(els.current).filter(Boolean), { opacity: 0, y: 12, duration: 0.55, stagger: 0.06, ease: "power3.out" });
        svg.current?.querySelectorAll<SVGPathElement>("path[data-edge]").forEach((p, i) => {
          const len = p.getTotalLength();
          gsap.fromTo(p, { strokeDasharray: len, strokeDashoffset: len }, {
            strokeDashoffset: 0, duration: 0.7, delay: 0.15 + i * 0.06, ease: "power2.inOut",
            onComplete: () => { p.style.strokeDasharray = ""; p.style.strokeDashoffset = ""; },
          });
        });
        return;
      }
      if (reduceNow) return;
      graph.nodes.forEach((n) => {
        const before = prev.current[n.key];
        if (!before || before === n.state) return;
        const el = els.current[n.key];
        if (!el) return;
        gsap.fromTo(el, { scale: 1.035 }, { scale: 1, duration: 0.6, ease: "power3.out" });
        const ring = el.querySelector<HTMLElement>("[data-ring]");
        if (ring) gsap.fromTo(ring, { opacity: 0.85, scale: 1 }, { opacity: 0, scale: 1.08, duration: 0.8, ease: "power3.out" });
      });
    }, wrap);
    prev.current = Object.fromEntries(graph.nodes.map((n) => [n.key, n.state]));
    return () => ctx.revert();
  }, [graph.nodes, ready]);

  const left = Math.max(0, (width - gw) / 2);
  const fade = reduce ? { duration: 0 } : { duration: 0.25, ease: EASE };

  return (
    <div ref={wrap} dir="ltr" role="group" aria-label={label ?? t("nav.graph")} className="w-full">
      {ready && (
        <div style={{ height: gh, width: Math.max(gw, width) }} className="relative">
          <div style={{ width: gw, height: gh, left }} className="absolute top-0">
            <svg ref={svg} width={gw} height={gh} className="absolute inset-0 overflow-visible" aria-hidden>
              {graph.edges.map((e) => {
                const a = boxes[e.from], b = boxes[e.to];
                if (!a || !b) return null;
                const src = byKey[e.from], dst = byKey[e.to];
                const done = DONE.includes(src.state);
                const live = done && LIVE.includes(dst.state);
                const d = edgePath(a, b, w);
                return (
                  <g key={`${e.from}-${e.to}`}>
                    <path data-edge d={d} fill="none" strokeWidth={2} strokeLinecap="round"
                      stroke={done ? "var(--color-civic)" : "var(--color-line-2)"} strokeDasharray={done ? undefined : "4 6"}
                      strokeOpacity={live ? 0.55 : 1} />
                    {live && !reduce && (
                      <g>
                        <circle r={7} fill="var(--color-civic)" opacity={0.16}>
                          <animateMotion dur="2.2s" repeatCount="indefinite" path={d} />
                        </circle>
                        <circle r={3.5} fill="var(--color-civic)">
                          <animateMotion dur="2.2s" repeatCount="indefinite" path={d} />
                        </circle>
                      </g>
                    )}
                  </g>
                );
              })}
            </svg>
            {graph.nodes.map((n, i) => {
              const b = boxes[n.key];
              if (!b) return null;
              const meta = NODE_STATE[n.state];
              const tone = TONE[meta.tone];
              const src = SOURCE[n.status_source];
              const Icon = meta.icon;
              const SrcIcon = src.icon;
              const stamp = n.cleared_at ?? n.submitted_at ?? (n.state === "PENDING" ? null : n.updated_at);
              const isSel = selected === n.key;
              const done = DONE.includes(n.state);
              const Tag = onSelect ? "button" : "div";
              return (
                <Tag
                  key={n.key}
                  ref={(el: HTMLElement | null) => { els.current[n.key] = el; }}
                  {...(onSelect ? { onClick: () => onSelect(n.key), "aria-pressed": isSel, type: "button" } : {})}
                  aria-label={`${t(`node.${n.key}`)}: ${t(`state.${n.state}`)}. ${n.entity_label}. ${t(`source.${n.status_source}`)}`}
                  dir={rtl ? "rtl" : "ltr"}
                  style={{ left: b.x, top: b.y, width: w, height: H }}
                  className={cn(
                    "group absolute flex flex-col justify-between rounded-2xl border bg-surface p-3 text-start shadow-[var(--shadow-card)]",
                    "transition-[border-color,box-shadow,translate] duration-300",
                    onSelect && "cursor-pointer hover:-translate-y-0.5 hover:border-line-2 hover:shadow-[var(--shadow-pop)]",
                    isSel ? "border-ink/70 ring-2 ring-ink/15" : done ? "border-civic/30" : "border-line",
                    meta.pulse && !done && `pulse-${meta.pulse}`,
                  )}
                >
                  <span data-ring aria-hidden className="pointer-events-none absolute -inset-1 rounded-[20px] border-2 opacity-0" style={{ borderColor: tone.solid }} />
                  <span className="flex items-start justify-between gap-2">
                    <span className="font-mono text-[10px] tracking-[0.18em] text-faint">{String(i + 1).padStart(2, "0")}</span>
                    <span className="flex items-center gap-1">
                      {n.human_approval_required && <UserRoundCheck className={cn("h-3.5 w-3.5", n.state === "WAITING_FOR_HUMAN" ? "text-violet" : "text-faint")} aria-label={t("drawer.officerRelease")} />}
                      {n.resident_present_required && <Footprints className="h-3.5 w-3.5 text-faint" aria-label={t("timeline.inPerson")} />}
                      {n.type === "PARENT_REPORTED" && <PhoneOff className="h-3.5 w-3.5 text-amber" aria-label={t("drawer.noApi")} />}
                      <AnimatePresence mode="wait" initial={false}>
                        <motion.span key={n.state} className={cn("grid h-6 w-6 place-items-center rounded-full", tone.bg, tone.text)}
                          initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }} transition={fade}>
                          <Icon className={cn("h-3.5 w-3.5", meta.spin && "animate-spin")} aria-hidden />
                        </motion.span>
                      </AnimatePresence>
                    </span>
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-display text-[15px] leading-tight text-ink">{t(`node.${n.key}`)}</span>
                    <span className="mt-0.5 block truncate text-[11.5px] text-muted">{n.entity_label}</span>
                  </span>
                  <span className="flex items-center justify-between gap-2 text-[11.5px]">
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.span key={n.state} className={cn("truncate font-semibold", tone.text)}
                        initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={fade}>
                        {t(`state.${n.state}`)}
                      </motion.span>
                    </AnimatePresence>
                    <span className="flex shrink-0 items-center gap-1 text-faint">
                      {n.state !== "PENDING" && <SrcIcon className="h-3 w-3" aria-hidden />}
                      <span className="num">{stamp ? fmtDate(stamp, lang, { day: "numeric", month: "short" }) : ""}</span>
                    </span>
                  </span>
                </Tag>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
