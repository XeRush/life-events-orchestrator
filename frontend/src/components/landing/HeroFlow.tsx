import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
import { MotionPathPlugin } from "gsap/MotionPathPlugin";
import { Phone } from "lucide-react";
import { useId, useLayoutEffect, useRef, useState, type ReactNode, type SVGProps } from "react";
import { gsap, useGsap } from "../../animations/motion";
import { isRTL, useLang, useT, type MessageKey } from "../../i18n";
import { roundedPath } from "../architecture/diagram";

gsap.registerPlugin(MotionPathPlugin, DrawSVGPlugin);

interface Entity { title: MessageKey; sub: MessageKey; parent?: boolean }

/** The serial post-birth chain, in dependency order. The consulate has no API and no status feed: parent-reported. */
const ENTITIES: Entity[] = [
  { title: "landing.flow.entity.dha", sub: "node.BIRTH_CERTIFICATE" },
  { title: "landing.flow.entity.mofa", sub: "node.MOFA_ATTESTATION" },
  { title: "landing.flow.entity.consulate", sub: "landing.flow.consulateNote", parent: true },
  { title: "landing.flow.entity.gdrfa", sub: "node.RESIDENCE_VISA" },
  { title: "landing.flow.entity.icp", sub: "node.EMIRATES_ID" },
  { title: "landing.flow.entity.insurer", sub: "node.INSURANCE" },
];

/* Theme tokens: every colour flips with `.dark`. GSAP only tweens opacity, transforms and drawSVG here. */
const LIT = "var(--color-civic)";
const AMBER = "var(--color-amber)";
const VIOLET = "var(--color-violet)";
const INK = "var(--color-ink)";
const MUTED = "var(--color-muted)";
const BASE = "var(--color-line-2)";
const PANEL = "var(--color-stage-2)";
const ON = "var(--color-on-accent)";

/** SVG text that never spills out of its box: a translation longer than `max` user units is condensed to fit. */
function FitText({ max, children, ...props }: SVGProps<SVGTextElement> & { max: number; children: ReactNode }) {
  const ref = useRef<SVGTextElement>(null);
  const [fit, setFit] = useState<number>();
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let live = true;
    const measure = () => {
      if (!live) return;
      el.removeAttribute("textLength");
      setFit(el.getComputedTextLength() > max ? max : undefined);
    };
    measure();
    document.fonts?.ready.then(measure).catch(() => undefined);
    return () => { live = false; };
  }, [children, max]);
  return <text ref={ref} {...props} {...(fit ? { textLength: fit, lengthAdjust: "spacingAndGlyphs" } : {})}>{children}</text>;
}

type Pt = [number, number];
type Anchor = "start" | "middle" | "end";
interface Geometry {
  w: number; h: number;
  call: { x: number; y: number; r: number };
  kase: { x: number; y: number; r: number };
  callPath: string;
  branch: (i: number) => string;
  yc: (i: number) => number;
  nodeLeft: number; nodeW: number; nodeH: number;
  checkX: number; chainX: number; textX: number; statusX: number; textMax: number;
  callLabel: { x: number; y: number; anchor: Anchor };
  caseLabel: { x: number; y: number; anchor: Anchor };
  caseRef: { x: number; y: number; anchor: Anchor };
  titleSize: number; subSize: number;
}

/**
 * Two layouts: "wide" (call -> case -> six branches fanning to a column of filings) and "compact" for phones (call and
 * case across the top, the six filings stacked under a spine, so labels stay readable at 360 px). Both mirror for RTL:
 * every x is reflected and SVG text runs right-to-left, so "start" anchors extend leftwards.
 */
function geometry(compact: boolean, rtl: boolean): Geometry {
  const W = compact ? 360 : 560;
  const X = (x: number) => (rtl ? W - x : x);
  const path = (pts: Pt[]) => roundedPath(pts.map(([x, y]) => [X(x), y] as Pt), 12);
  if (!compact) {
    const call = { x: 58, y: 270, r: 30 };
    const kase = { x: 206, y: 270, r: 46 };
    const NX = 338, NW = 212;
    const yc = (i: number) => 45 + i * 90;
    return {
      w: W, h: 540, call: { ...call, x: X(call.x) }, kase: { ...kase, x: X(kase.x) },
      callPath: path([[call.x + call.r, call.y], [kase.x - kase.r, kase.y]]),
      branch: (i) => `M ${X(kase.x + kase.r)} ${kase.y} C ${X(kase.x + 92)} ${kase.y} ${X(292)} ${yc(i)} ${X(318)} ${yc(i)} L ${X(NX)} ${yc(i)}`,
      yc, nodeLeft: rtl ? W - NX - NW : NX, nodeW: NW, nodeH: 58,
      checkX: X(326), chainX: X(NX + 16), textX: X(NX + 30), statusX: X(NX + NW - 20), textMax: NW - 62,
      callLabel: { x: X(call.x), y: call.y + call.r + 22, anchor: "middle" },
      caseLabel: { x: X(kase.x), y: kase.y + kase.r + 22, anchor: "middle" },
      caseRef: { x: X(kase.x), y: kase.y + kase.r + 38, anchor: "middle" },
      titleSize: 12.5, subSize: 11,
    };
  }
  const call = { x: 44, y: 50, r: 27 };
  const kase = { x: 166, y: 50, r: 36 };
  const NX = 64, NW = 292, NH = 56, SPINE = 22, RAIL = 116;
  const yc = (i: number) => 172 + i * 76;
  return {
    w: W, h: yc(ENTITIES.length - 1) + NH / 2 + 8, call: { ...call, x: X(call.x) }, kase: { ...kase, x: X(kase.x) },
    callPath: path([[call.x + call.r, call.y], [kase.x - kase.r, kase.y]]),
    branch: (i) => path([[kase.x, kase.y + kase.r], [kase.x, RAIL], [SPINE, RAIL], [SPINE, yc(i)], [NX, yc(i)]]),
    yc, nodeLeft: rtl ? W - NX - NW : NX, nodeW: NW, nodeH: NH,
    checkX: X(44), chainX: X(NX + 16), textX: X(NX + 30), statusX: X(NX + NW - 20), textMax: NW - 66,
    callLabel: { x: X(call.x), y: call.y + call.r + 20, anchor: "middle" },
    caseLabel: { x: X(kase.x + kase.r + 14), y: kase.y - 3, anchor: "start" },
    caseRef: { x: X(kase.x + kase.r + 14), y: kase.y + 14, anchor: "start" },
    titleSize: 13.5, subSize: 11.5,
  };
}

/** Compact below this rendered width (phones); measured on the figure, so it also works inside narrow columns. */
const COMPACT_BELOW = 480;

/**
 * Hero visual: one call opens one case, then six authority filings light up in dependency order.
 * A pulse travels each branch; an officer "release" checkpoint lights before every filing; the consulate branch is
 * dashed amber (parent-reported, no status feed). The loop only runs while the figure is on screen.
 */
export function HeroFlow({ caseRef = "LL-DEMO-001" }: { caseRef?: string }) {
  const t = useT();
  const rtl = isRTL(useLang());
  const fig = useRef<HTMLElement>(null);
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [compact, setCompact] = useState(() => typeof window !== "undefined" && window.innerWidth < 640);
  const g = geometry(compact, rtl);

  useLayoutEffect(() => {
    const el = fig.current;
    if (!el) return;
    const measure = () => el.clientWidth > 0 && setCompact(el.clientWidth < COMPACT_BELOW);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

  useGsap(fig, ({ gsap, ScrollTrigger, reduce }) => {
    const q = gsap.utils.selector(fig.current);
    const lit = q("[data-lit]");
    if (reduce) {
      gsap.set(lit, { opacity: 1 });
      gsap.set(q("[data-draw]"), { drawSVG: "100%" });
      return;
    }
    const pulse = q("[data-pulse]")[0];
    const amberPulse = q("[data-pulse-amber]")[0];
    const pathOf = (sel: string) => q(sel)[0] as unknown as SVGPathElement;
    gsap.set(q("[data-draw]"), { drawSVG: "0%" });
    const tl = gsap.timeline({ repeat: -1, repeatDelay: 0.3, paused: true, defaults: { ease: "power2.inOut" } });
    tl.set(lit, { opacity: 0 })
      .set(q("[data-draw]"), { drawSVG: "0%", opacity: 1 })
      .set([pulse, amberPulse], { opacity: 0 })
      // the phone rings
      .fromTo(q("[data-ring]"), { scale: 0.95, opacity: 0.6, transformOrigin: "50% 50%" }, { scale: 1.9, opacity: 0, duration: 1.1, stagger: 0.32, ease: "power1.out" })
      .set(pulse, { opacity: 1 }, "-=0.5")
      .to(pulse, { motionPath: { path: pathOf("[data-callpath]") }, duration: 0.6 }, "<")
      .to(q("[data-draw='call']"), { drawSVG: "100%", duration: 0.6 }, "<")
      .to(q("[data-lit='case']"), { opacity: 1, duration: 0.35 }, ">-0.05")
      .fromTo(q("[data-case-glow]"), { scale: 0.9, opacity: 0.5, transformOrigin: "50% 50%" }, { scale: 1.5, opacity: 0, duration: 0.9, ease: "power1.out" }, "<");

    ENTITIES.forEach((entity, i) => {
      const path = pathOf(`[data-branch='${i}']`);
      const runner = entity.parent ? amberPulse : pulse;
      const travel = entity.parent ? 1.4 : compact ? 0.7 + i * 0.06 : 0.75;
      tl.set(runner, { opacity: 1 }, ">0.1").to(runner, { motionPath: { path }, duration: travel }, "<");
      if (entity.parent) {
        tl.to(q(`[data-lit-branch='${i}']`), { opacity: 1, duration: travel, ease: "none" }, "<");
      } else {
        tl.to(q(`[data-draw='${i}']`), { drawSVG: "100%", duration: travel }, "<")
          .fromTo(q(`[data-check='${i}']`), { opacity: 0, scale: 0.4, transformOrigin: "50% 50%" }, { opacity: 1, scale: 1, duration: 0.3, ease: "power3.out" }, `<${travel * 0.72}`);
      }
      tl.to(q(`[data-node-lit='${i}']`), { opacity: 1, duration: 0.35 }, ">-0.02")
        .to(runner, { opacity: 0, duration: 0.2 }, "<")
        .to(q(`[data-chain='${i}']`), { opacity: 1, duration: 0.3 }, "<0.15");
    });
    tl.to({}, { duration: 2.4 })
      .to(lit, { opacity: 0, duration: 0.6 })
      .to(q("[data-draw]"), { opacity: 0, duration: 0.6 }, "<");

    // Only animate while the figure is on screen.
    ScrollTrigger.create({ trigger: fig.current, start: "top bottom", end: "bottom top", onToggle: (self) => (self.isActive ? tl.play() : tl.pause()) });
  }, [compact, rtl]);

  const titleId = `hf-title-${uid}`;
  const descId = `hf-desc-${uid}`;
  const { call, kase, yc } = g;
  const logoScale = (kase.r * 1.08) / 64;

  return (
    <figure ref={fig} className="relative w-full">
      <svg viewBox={`0 0 ${g.w} ${g.h}`} direction={rtl ? "rtl" : "ltr"} className="h-auto w-full overflow-visible" role="img" aria-labelledby={`${titleId} ${descId}`} style={{ fontFamily: "var(--font-sans)" }}>
        <title id={titleId}>{t("landing.flow.title")}</title>
        <desc id={descId}>{t("landing.flow.desc")}</desc>
        <defs>
          <radialGradient id={`glow-${uid}`}>
            <stop offset="0%" style={{ stopColor: LIT, stopOpacity: 0.5 }} />
            <stop offset="100%" style={{ stopColor: LIT, stopOpacity: 0 }} />
          </radialGradient>
          <radialGradient id={`glow-a-${uid}`}>
            <stop offset="0%" style={{ stopColor: AMBER, stopOpacity: 0.5 }} />
            <stop offset="100%" style={{ stopColor: AMBER, stopOpacity: 0 }} />
          </radialGradient>
        </defs>

        {/* chain: each filing unlocks the next */}
        {ENTITIES.slice(0, -1).map((_, i) => (
          <g key={`chain-${i}`}>
            <line x1={g.chainX} y1={yc(i) + g.nodeH / 2} x2={g.chainX} y2={yc(i + 1) - g.nodeH / 2} stroke={BASE} strokeWidth={1.5} strokeDasharray="2 4" />
            <line data-lit data-chain={i} x1={g.chainX} y1={yc(i) + g.nodeH / 2} x2={g.chainX} y2={yc(i + 1) - g.nodeH / 2} stroke={ENTITIES[i + 1].parent || ENTITIES[i].parent ? AMBER : LIT} strokeWidth={1.5} opacity={0} />
          </g>
        ))}

        {/* call -> case */}
        <path data-callpath d={g.callPath} stroke={BASE} strokeWidth={2} fill="none" />
        <path data-draw="call" d={g.callPath} stroke={LIT} strokeWidth={2} fill="none" strokeLinecap="round" />

        {/* case -> six entities */}
        {ENTITIES.map((entity, i) => (
          <g key={`branch-${i}`}>
            <path data-branch={i} d={g.branch(i)} fill="none" stroke={entity.parent ? AMBER : BASE} strokeOpacity={entity.parent ? 0.45 : 1} strokeWidth={1.6} strokeDasharray={entity.parent ? "5 6" : undefined} />
            {entity.parent ? (
              <path data-lit data-lit-branch={i} d={g.branch(i)} fill="none" stroke={AMBER} strokeWidth={1.8} strokeDasharray="5 6" opacity={0} />
            ) : (
              <path data-draw={i} d={g.branch(i)} fill="none" stroke={LIT} strokeWidth={1.9} strokeLinecap="round" />
            )}
            {!entity.parent && (
              <g transform={`translate(${g.checkX} ${yc(i)})`}>
                <rect x={-5.5} y={-5.5} width={11} height={11} rx={2} transform="rotate(45)" fill={PANEL} stroke={VIOLET} strokeOpacity={0.55} strokeWidth={1.2} />
                <g data-lit data-check={i} opacity={0}>
                  <rect x={-5.5} y={-5.5} width={11} height={11} rx={2} transform="rotate(45)" fill={VIOLET} />
                  <path d="M -2.6 0.2 L -0.7 2 L 2.8 -1.8" stroke={ON} strokeWidth={1.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </g>
              </g>
            )}
          </g>
        ))}

        {/* call node */}
        <g>
          <circle data-ring cx={call.x} cy={call.y} r={call.r} fill="none" stroke={LIT} strokeWidth={1.5} opacity={0} />
          <circle data-ring cx={call.x} cy={call.y} r={call.r} fill="none" stroke={LIT} strokeWidth={1.5} opacity={0} />
          <circle cx={call.x} cy={call.y} r={call.r} fill={PANEL} stroke={BASE} strokeWidth={1.2} />
          <Phone x={call.x - 11} y={call.y - 11} width={22} height={22} color={INK} strokeWidth={1.7} aria-hidden />
          <text x={g.callLabel.x} y={g.callLabel.y} textAnchor={g.callLabel.anchor} fill={INK} fontSize={13} fontWeight={600}>{t("landing.flow.call")}</text>
        </g>

        {/* case node */}
        <g>
          <circle data-case-glow cx={kase.x} cy={kase.y} r={kase.r} fill={`url(#glow-${uid})`} opacity={0} />
          <circle cx={kase.x} cy={kase.y} r={kase.r} fill={PANEL} stroke={BASE} strokeWidth={1.2} />
          <circle data-lit="case" cx={kase.x} cy={kase.y} r={kase.r} fill="var(--color-civic-soft)" fillOpacity={0.7} stroke={LIT} strokeWidth={2} opacity={0} />
          <g transform={`translate(${kase.x - 32 * logoScale} ${kase.y - 32 * logoScale}) scale(${logoScale})`}>
            <path d="M32 14a18 18 0 1 1-17.2 12.7" fill="none" stroke={INK} strokeWidth={3.4} strokeLinecap="round" />
            <circle cx="14.8" cy="26.7" r="3.6" fill={LIT} />
            <circle cx="32" cy="32" r="7" fill={LIT} />
          </g>
          <text x={g.caseLabel.x} y={g.caseLabel.y} textAnchor={g.caseLabel.anchor} fill={INK} fontSize={13} fontWeight={600}>{t("landing.flow.case")}</text>
          <text x={g.caseRef.x} y={g.caseRef.y} textAnchor={g.caseRef.anchor} fill={MUTED} fontSize={10} style={{ fontFamily: "var(--font-mono)" }}>{t("landing.flow.caseRef", { ref: caseRef })}</text>
        </g>

        {/* entity nodes */}
        {ENTITIES.map((entity, i) => {
          const y = yc(i) - g.nodeH / 2;
          const tone = entity.parent ? AMBER : LIT;
          const sx = g.statusX;
          return (
            <g key={`node-${i}`}>
              <rect x={g.nodeLeft} y={y} width={g.nodeW} height={g.nodeH} rx={14} fill={PANEL} stroke={entity.parent ? AMBER : BASE} strokeOpacity={entity.parent ? 0.6 : 1} strokeWidth={1.2} strokeDasharray={entity.parent ? "5 5" : undefined} />
              <g data-lit data-node-lit={i} opacity={0}>
                <rect x={g.nodeLeft} y={y} width={g.nodeW} height={g.nodeH} rx={14} fill={entity.parent ? "var(--color-amber-soft)" : "var(--color-civic-soft)"} fillOpacity={0.75} stroke={tone} strokeWidth={1.5} strokeDasharray={entity.parent ? "5 5" : undefined} />
                <circle cx={sx} cy={yc(i)} r={8} fill={tone} />
                {entity.parent ? (
                  <path d={`M ${sx} ${yc(i) - 4} L ${sx} ${yc(i)} L ${sx + 3} ${yc(i) + 2.5}`} stroke={ON} strokeWidth={1.6} fill="none" strokeLinecap="round" />
                ) : (
                  <path d={`M ${sx - 3.5} ${yc(i)} L ${sx - 1} ${yc(i) + 2.5} L ${sx + 3.5} ${yc(i) - 2.5}`} stroke={ON} strokeWidth={1.7} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                )}
              </g>
              <circle cx={g.chainX} cy={yc(i)} r={4.5} fill={PANEL} stroke={entity.parent ? AMBER : MUTED} strokeWidth={1.3} />
              <circle data-lit data-node-lit={i} cx={g.chainX} cy={yc(i)} r={4.5} fill={tone} opacity={0} />
              <FitText max={g.textMax} x={g.textX} y={yc(i) - 3} fill={INK} fontSize={g.titleSize} fontWeight={600}>{t(entity.title)}</FitText>
              <FitText max={g.textMax} x={g.textX} y={yc(i) + g.subSize + 3} fill={entity.parent ? AMBER : MUTED} fontSize={g.subSize}>{t(entity.sub)}</FitText>
            </g>
          );
        })}

        {/* travelling pulses (positioned by MotionPathPlugin; drawn at the origin) */}
        <g data-pulse opacity={0}>
          <circle r={13} fill={`url(#glow-${uid})`} />
          <circle r={4.5} fill={LIT} />
        </g>
        <g data-pulse-amber opacity={0}>
          <circle r={13} fill={`url(#glow-a-${uid})`} />
          <circle r={4.5} fill={AMBER} />
        </g>
      </svg>

      <figcaption className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[12.5px] text-muted">
        <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-civic" aria-hidden />{t("landing.flow.legend.filed")}</span>
        <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rotate-45 rounded-xs bg-violet" aria-hidden />{t("landing.flow.legend.release")}</span>
        <span className="inline-flex items-center gap-2"><span className="w-5 border-t border-dashed border-amber" aria-hidden />{t("landing.flow.legend.consulate")}</span>
      </figcaption>
    </figure>
  );
}
