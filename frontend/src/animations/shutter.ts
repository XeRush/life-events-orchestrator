import { gsap } from "./motion";

/**
 * Camera-iris shutter over the whole window, used when the theme changes: six blades twist shut, `onClosed` runs while
 * the screen is covered (so the new theme is painted out of sight), then the blades twist open again.
 *
 * Geometry: each blade is a 60-degree wedge from the centre. Sliding every wedge along its own tangent (60 degrees
 * past its trailing edge) keeps neighbouring blades edge to edge while a regular hexagonal hole opens in the middle,
 * which is how a real iris diaphragm moves. The hole's inradius is d * cos(30deg), so it clears the window's corners
 * once d >= halfDiagonal / cos(30deg).
 *
 * Resolves when the shutter has fully opened. Under prefers-reduced-motion it simply runs `onClosed`.
 */
const BLADES = 6;
const NS = "http://www.w3.org/2000/svg";
let running = false;

export function playShutter(onClosed: () => void): Promise<void> {
  if (running || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    onClosed();
    return Promise.resolve();
  }
  running = true;
  const root = document.documentElement;
  root.dataset.shutter = "1";

  const w = window.innerWidth;
  const h = window.innerHeight;
  const half = Math.hypot(w, h) / 2;
  const open = (half / Math.cos(Math.PI / 6)) * 1.06;
  const reach = half * 2.8; // long enough that the blades still cover the corners while sliding

  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `${-w / 2} ${-h / 2} ${w} ${h}`);
  svg.setAttribute("aria-hidden", "true");
  Object.assign(svg.style, { position: "fixed", inset: "0", width: "100vw", height: "100vh", zIndex: "2147483000", pointerEvents: "auto" });
  svg.innerHTML = `<defs>
      <linearGradient id="ll-shutter-blade" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#2a3a47"/><stop offset="0.55" stop-color="#141f28"/><stop offset="1" stop-color="#0a1116"/>
      </linearGradient>
    </defs>`;

  const group = document.createElementNS(NS, "g");
  const blades: { el: SVGPolygonElement; tx: number; ty: number }[] = [];
  for (let i = 0; i < BLADES; i++) {
    const a = (i * 2 * Math.PI) / BLADES;
    const b = a + (2 * Math.PI) / BLADES;
    const el = document.createElementNS(NS, "polygon");
    el.setAttribute("points", `0,0 ${reach * Math.cos(a)},${reach * Math.sin(a)} ${reach * Math.cos(b)},${reach * Math.sin(b)}`);
    el.setAttribute("fill", "url(#ll-shutter-blade)");
    el.setAttribute("stroke", "rgba(236, 232, 223, 0.14)");
    el.setAttribute("stroke-width", "1.25");
    el.setAttribute("stroke-linejoin", "round");
    group.appendChild(el);
    const tangent = a + (2 * Math.PI) / 3;
    blades.push({ el, tx: Math.cos(tangent), ty: Math.sin(tangent) });
  }
  // The brand dot glints in the centre while the shutter is shut.
  const dot = document.createElementNS(NS, "circle");
  dot.setAttribute("r", "0");
  dot.setAttribute("fill", "#4fd1a5");
  svg.append(group, dot);
  document.body.appendChild(svg);

  const state = { d: open, turn: -38 };
  const apply = () => {
    group.setAttribute("transform", `rotate(${state.turn})`);
    for (const b of blades) b.el.setAttribute("transform", `translate(${state.d * b.tx} ${state.d * b.ty})`);
  };
  apply();

  return new Promise((resolve) => {
    gsap.timeline({
      onComplete: () => {
        svg.remove();
        delete root.dataset.shutter;
        running = false;
        resolve();
      },
    })
      .to(state, { d: 0, turn: 0, duration: 0.42, ease: "power2.in", onUpdate: apply })
      .call(onClosed)
      .to(dot, { attr: { r: 7 }, duration: 0.14, ease: "power2.out" })
      .to(dot, { attr: { r: 0 }, duration: 0.14, ease: "power2.in" })
      .to(state, { d: open, turn: 38, duration: 0.56, ease: "power3.out", onUpdate: apply });
  });
}
