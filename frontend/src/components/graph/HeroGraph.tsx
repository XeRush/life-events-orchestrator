import gsap from "gsap";
import { useEffect, useRef } from "react";
import { prefersReducedMotion } from "../../animations/variants";

const W = 560;
const H = 480;
const C = { x: 280, y: 240 };

const NODES = [
  { id: "reg", label: "Birth Registration", sub: "Registered", angle: 198, r: 190 },
  { id: "cert", label: "Certificate", sub: "Issued", angle: -90, r: 178 },
  { id: "id", label: "Identity", sub: "In review", angle: -18, r: 196 },
  { id: "health", label: "Health", sub: "Enrolling", angle: 54, r: 186 },
  { id: "next", label: "Next Service", sub: "Waiting", angle: 126, r: 196 },
].map((n) => ({ ...n, x: C.x + n.r * Math.cos((n.angle * Math.PI) / 180) * 1.28, y: C.y + n.r * Math.sin((n.angle * Math.PI) / 180) * 1.05 }));

const pos = Object.fromEntries(NODES.map((n) => [n.id, n]));
const EDGES: [string, string][] = [["core", "reg"], ["reg", "cert"], ["cert", "id"], ["cert", "health"], ["id", "next"]];
const point = (id: string) => (id === "core" ? C : pos[id]);

/** Hero visualisation: a life event at the centre, its dependent services around it. GSAP draws the graph and sends signals along it. */
export function HeroGraph() {
  const root = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = root.current;
    if (!svg) return;
    const reduce = prefersReducedMotion();
    const ctx = gsap.context(() => {
      const paths = gsap.utils.toArray<SVGPathElement>("[data-edge]");
      const nodes = gsap.utils.toArray<SVGGElement>("[data-node]");
      if (reduce) return;
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      tl.from("[data-core]", { scale: 0, transformOrigin: "50% 50%", duration: 0.8, ease: "back.out(1.6)" })
        .from("[data-ring]", { scale: 0.4, opacity: 0, transformOrigin: "50% 50%", duration: 1.2, stagger: 0.15 }, "<0.1");
      paths.forEach((p, i) => {
        const len = p.getTotalLength();
        tl.fromTo(p, { strokeDasharray: len, strokeDashoffset: len }, { strokeDashoffset: 0, duration: 0.8, ease: "power2.inOut" }, 0.5 + i * 0.28);
      });
      tl.from(nodes, { opacity: 0, scale: 0.7, transformOrigin: "50% 50%", duration: 0.6, stagger: 0.28 }, 0.9);
      // signal dots travelling along each dependency
      tl.add(() => {
        paths.forEach((p, i) => {
          const dot = svg.querySelector<SVGCircleElement>(`[data-dot="${i}"]`);
          if (!dot) return;
          const len = p.getTotalLength();
          const proxy = { t: 0 };
          gsap.to(proxy, {
            t: 1, duration: 2.6, repeat: -1, delay: i * 0.5, ease: "none", repeatDelay: 1.2,
            onUpdate: () => {
              const pt = p.getPointAtLength(proxy.t * len);
              dot.setAttribute("cx", String(pt.x));
              dot.setAttribute("cy", String(pt.y));
              dot.setAttribute("opacity", String(Math.sin(proxy.t * Math.PI)));
            },
          });
        });
        gsap.to("[data-core-glow]", { attr: { r: 46 }, opacity: 0.0, duration: 2.2, repeat: -1, ease: "power1.out" });
      }, 2.2);
    }, svg);
    return () => ctx.revert();
  }, []);

  return (
    <svg ref={root} viewBox={`-50 0 ${W + 100} ${H}`} className="h-auto w-full" role="img" aria-label="A life event at the centre connected to Birth Registration, Certificate, Identity, Health and Next Service">
      <defs>
        <radialGradient id="glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#4fd1a5" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#4fd1a5" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx={C.x} cy={C.y} r={150} fill="url(#glow)" />
      {[70, 120, 175].map((r) => (
        <circle key={r} data-ring cx={C.x} cy={C.y} r={r} fill="none" stroke="#f7f5f0" strokeOpacity={0.1} strokeDasharray="2 7" />
      ))}
      {EDGES.map(([a, b], i) => {
        const p1 = point(a), p2 = point(b);
        const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
        const cx = mx + (C.y - my) * 0.12, cy = my + (mx - C.x) * 0.12;
        return <path key={i} data-edge d={`M ${p1.x} ${p1.y} Q ${cx} ${cy} ${p2.x} ${p2.y}`} fill="none" stroke="#4fd1a5" strokeOpacity={0.75} strokeWidth={1.6} strokeLinecap="round" />;
      })}
      {EDGES.map((_, i) => <circle key={i} data-dot={i} r={3.2} fill="#f7f5f0" opacity={0} />)}
      <circle data-core-glow cx={C.x} cy={C.y} r={30} fill="none" stroke="#4fd1a5" strokeWidth={1.5} />
      <g data-core>
        <circle cx={C.x} cy={C.y} r={34} fill="#4fd1a5" />
        <circle cx={C.x} cy={C.y} r={44} fill="none" stroke="#f7f5f0" strokeWidth={2} strokeDasharray="120 160" strokeLinecap="round" />
        <text x={C.x} y={C.y + 4} textAnchor="middle" fontSize={8.5} fontWeight={600} fill="#14202b" letterSpacing="0.04em">LIFE EVENT</text>
      </g>
      {NODES.map((n) => (
        <g key={n.id} data-node transform={`translate(${n.x - 62} ${n.y - 25})`}>
          <rect width={124} height={50} rx={14} fill="#1b2a37" stroke="#f7f5f0" strokeOpacity={0.18} />
          <circle cx={16} cy={25} r={5} fill={n.sub === "Waiting" ? "#8b95a0" : n.sub === "In review" || n.sub === "Enrolling" ? "#6fa8dc" : "#4fd1a5"} />
          <text x={28} y={22} fontSize={11.5} fontWeight={500} fill="#f7f5f0">{n.label}</text>
          <text x={28} y={37} fontSize={9.5} fill="#f7f5f0" fillOpacity={0.55}>{n.sub}</text>
        </g>
      ))}
    </svg>
  );
}
