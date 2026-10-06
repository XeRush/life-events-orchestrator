import { configureBoneyard, Skeleton, type SkeletonProps } from "boneyard-js/react";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "../../lib/format";

type CapturedBones = NonNullable<SkeletonProps["initialBones"]>;

configureBoneyard({
  color: "#e9e6dd", darkColor: "#1b2833", animate: "shimmer", shimmerColor: "#f4f2ec", darkShimmerColor: "#253543",
  speed: "1.6s", transition: 250, select: "viewport",
});

/* Each captured skeleton is its own small chunk, fetched the first time that skeleton renders, so the app entry never
   carries every page's bones. (The registry.ts that boneyard-js also writes is deliberately not imported.) */
const LOADERS = import.meta.glob<CapturedBones>("../../bones/*.bones.json", { import: "default" });
const CACHE = new Map<string, CapturedBones>();

function useCapturedBones(name?: string): CapturedBones | undefined {
  const [bones, setBones] = useState(() => (name ? CACHE.get(name) : undefined));
  useEffect(() => {
    if (!name) return;
    const cached = CACHE.get(name);
    if (cached) { setBones(cached); return; }
    const load = LOADERS[`../../bones/${name}.bones.json`];
    if (!load) return;
    let live = true;
    load().then((b) => { CACHE.set(name, b); if (live) setBones(b); }).catch(() => undefined);
    return () => { live = false; };
  }, [name]);
  return bones;
}

/**
 * Skeleton screen for a region that loads data. Bones are captured from the real layout by `npm run bones`
 * (boneyard-js) on the dev-only /__bones page, where each <Bones> renders its `fixture` (mock data, same layout).
 *
 * Usage: <Bones name="res-case-home" loading={q.isLoading} fixture={<CaseHome view={FIXTURE} />}>{q.data && <CaseHome view={q.data} />}</Bones>
 * Names must be unique and stable. Until a name's bones are captured (or while they download), `fallback` shows.
 */
export function Bones({ fallback, lines = 4, initialBones, ...props }: SkeletonProps & { lines?: number }) {
  const captured = useCapturedBones(initialBones ? undefined : props.name);
  const bones = initialBones ?? captured;
  // boneyard scales bones to the first container height it measures. Its very first render (before it knows the
  // viewport width) shows `fallback`, so with bones available the fallback must be empty, and the component remounts
  // when bones arrive so a shimmer shown while the bones chunk downloaded is never mistaken for the content height.
  return (
    <Skeleton key={bones ? "bones" : "fallback"} fallback={bones ? null : (fallback ?? <ShimmerBlock lines={lines} />)}
      initialBones={bones} {...props} />
  );
}

/** Generic shimmer used before bones are available, and for tiny regions not worth capturing. */
export function ShimmerBlock({ lines = 4, className }: { lines?: number; className?: string }): ReactNode {
  return (
    <div className={cn("space-y-3", className)} aria-hidden>
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="shimmer h-4 rounded-md" style={{ width: `${[92, 78, 85, 64, 88, 70][i % 6]}%` }} />
      ))}
    </div>
  );
}
