import gsap from "gsap";
import { RefreshCw } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { prefersReducedMotion } from "../../animations/variants";
import type { CaseGraph, GraphNode } from "../../types";
import { cn, fmtDate } from "../../utils/format";
import { TASK_STATUS, TONE_CLASSES } from "../../utils/status";

const NODE_W = 208;
const NODE_H = 92;
const SYS_W = 132;
const SYS_H = 48;
const GAP_X = 72;
const GAP_Y = 26;
const PAD = 16;

interface Box { x: number; y: number; w: number; h: number }

function layout(nodes: GraphNode[]) {
  const byLayer = new Map<number, GraphNode[]>();
  nodes.forEach((n) => byLayer.set(n.layer, [...(byLayer.get(n.layer) ?? []), n]));
  const layers = [...byLayer.keys()].sort((a, b) => a - b);
  const heights = layers.map((l) => byLayer.get(l)!.reduce((sum, n, i) => sum + (n.is_system ? SYS_H : NODE_H) + (i ? GAP_Y : 0), 0));
  const maxH = Math.max(...heights, NODE_H);
  const boxes: Record<string, Box> = {};
  let x = PAD;
  layers.forEach((l, li) => {
    const col = byLayer.get(l)!;
    const w = Math.max(...col.map((n) => (n.is_system ? SYS_W : NODE_W)));
    let y = PAD + (maxH - heights[li]) / 2;
    col.forEach((n) => {
      const bw = n.is_system ? SYS_W : NODE_W;
      const bh = n.is_system ? SYS_H : NODE_H;
      boxes[n.key] = { x: x + (w - bw) / 2, y, w: bw, h: bh };
      y += bh + GAP_Y;
    });
    x += w + GAP_X;
  });
  return { boxes, width: x - GAP_X + PAD, height: maxH + PAD * 2 };
}

const LIVE_STATES = new Set(["SUBMITTED", "PROCESSING", "WAITING_FOR_ENTITY", "WAITING_FOR_RESIDENT", "READY"]);

export function LifeEventGraph({ graph, selected, onSelect }: { graph: CaseGraph; selected: string | null; onSelect: (key: string) => void }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const nodeEls = useRef<Record<string, HTMLButtonElement | null>>({});
  const prev = useRef<Record<string, string>>({});
  const drawn = useRef(false);
  const [scale, setScale] = useState(1);

  const { boxes, width, height } = useMemo(() => layout(graph.nodes), [graph.nodes]);
  const byKey = useMemo(() => Object.fromEntries(graph.nodes.map((n) => [n.key, n])), [graph.nodes]);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const fit = () => setScale(Math.min(1, Math.max(0.55, el.clientWidth / width)));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);

  // GSAP: draw connections + stagger nodes on first paint; pulse nodes whose state changed afterwards.
  useEffect(() => {
    const reduce = prefersReducedMotion();
    const ctx = gsap.context(() => {
      if (!drawn.current) {
        drawn.current = true;
        if (!reduce) {
          gsap.from(Object.values(nodeEls.current).filter(Boolean), { opacity: 0, y: 16, duration: 0.5, stagger: 0.07, ease: "power3.out" });
          const paths = svgRef.current?.querySelectorAll<SVGPathElement>("path[data-edge]") ?? [];
          paths.forEach((p) => {
            const len = p.getTotalLength();
            gsap.fromTo(p, { strokeDasharray: len, strokeDashoffset: len }, { strokeDashoffset: 0, duration: 0.9, delay: 0.25, ease: "power2.inOut", onComplete: () => { p.style.strokeDasharray = "none"; } });
          });
        }
      } else if (!reduce) {
        graph.nodes.forEach((n) => {
          const old = prev.current[n.key];
          if (old && old !== n.status) {
            const el = nodeEls.current[n.key];
            if (el) gsap.fromTo(el, { scale: 1.07 }, { scale: 1, duration: 0.9, ease: "elastic.out(1, 0.5)" });
          }
        });
      }
    }, wrapRef);
    prev.current = Object.fromEntries(graph.nodes.map((n) => [n.key, n.status]));
    return () => ctx.revert();
  }, [graph.nodes]);

  const edgePath = (from: Box, to: Box) => {
    const x1 = from.x + from.w, y1 = from.y + from.h / 2, x2 = to.x, y2 = to.y + to.h / 2;
    const dx = Math.max(28, (x2 - x1) / 2);
    return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
  };

  return (
    <div ref={wrapRef} dir="ltr" className="w-full overflow-x-auto scroll-thin" style={{ height: height * scale + 4 }}>
      <div style={{ width, height, transform: `scale(${scale})`, transformOrigin: "top left" }} className="relative">
        <svg ref={svgRef} width={width} height={height} className="absolute inset-0" aria-hidden>
          {graph.edges.map((e) => {
            const a = boxes[e.from], b = boxes[e.to];
            if (!a || !b) return null;
            const src = byKey[e.from], dst = byKey[e.to];
            const done = src.status === "COMPLETED";
            const live = done && LIVE_STATES.has(dst.status);
            const d = edgePath(a, b);
            return (
              <g key={`${e.from}-${e.to}`}>
                <path data-edge d={d} fill="none" strokeWidth={2} stroke={done ? "#1f6f5c" : "#cfcabb"} strokeLinecap="round" opacity={done ? 0.85 : 1} />
                {live && <path d={d} fill="none" strokeWidth={2.5} stroke="#2b5c8a" className="edge-live" strokeLinecap="round" />}
              </g>
            );
          })}
        </svg>
        {graph.nodes.map((n) => {
          const b = boxes[n.key];
          const meta = TASK_STATUS[n.status];
          const tone = TONE_CLASSES[meta.tone];
          const Icon = meta.icon;
          const stamp = n.completed_at ?? n.started_at ?? (n.status === "BLOCKED" || n.status === "PENDING" ? null : n.updated_at);
          const isSel = selected === n.key;
          const needsAction = n.status === "WAITING_FOR_RESIDENT";
          return (
            <button
              key={n.key}
              ref={(el) => { nodeEls.current[n.key] = el; }}
              onClick={() => onSelect(n.key)}
              aria-pressed={isSel}
              aria-label={`${n.name}. ${meta.label}${n.entity ? `. ${n.entity.name}` : ""}`}
              style={{ left: b.x, top: b.y, width: b.w, height: b.h }}
              className={cn(
                "absolute cursor-pointer rounded-2xl border bg-surface text-start shadow-[var(--shadow-card)] transition-[border-color,box-shadow] duration-300 focus-visible:outline-2",
                n.is_system ? "flex items-center gap-2 px-3" : "flex flex-col justify-between p-3",
                isSel ? "border-ink ring-2 ring-ink/10" : "border-line hover:border-line-2",
                needsAction && "pulse-amber",
                n.status === "PROCESSING" && "pulse-azure",
                n.status === "CANCELLED" && "opacity-55",
              )}
            >
              {n.is_system ? (
                <>
                  <Icon className={cn("h-4 w-4 shrink-0", tone.text, meta.spin && "animate-spin")} aria-hidden />
                  <span className="truncate text-[13px] font-medium">{n.name}</span>
                </>
              ) : (
                <>
                  <span className="flex items-start gap-2">
                    <span className={cn("mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full", tone.bg, tone.text)}>
                      <Icon className={cn("h-3.5 w-3.5", meta.spin && "animate-spin")} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn("block truncate font-display text-[15px] leading-tight", n.status === "CANCELLED" && "line-through")}>{n.name}</span>
                      <span className="block truncate text-[11.5px] text-muted">{n.entity?.name ?? "LIFELOOP"}</span>
                    </span>
                    {n.replanned && <RefreshCw className="h-3.5 w-3.5 shrink-0 text-violet" aria-label="Replanned" />}
                  </span>
                  <span className="flex items-center justify-between text-[11.5px]">
                    <span className={cn("font-medium", tone.text)}>{meta.short}</span>
                    <span className="text-faint">{stamp ? fmtDate(stamp, { day: "numeric", month: "short" }) : ""}</span>
                  </span>
                </>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
