# Frontend: theme, motion, skeletons, responsive layout

The web app (`frontend/`) is React 19 + TypeScript + Vite + Tailwind CSS 4, with no component library. This page
covers the cross-cutting design system. Routes are listed in the [Architecture overview](overview.md#frontend-routes);
languages and right-to-left layout are covered in [Multilingual design](../agent/multilingual.md#frontend).

## Theme: light by default, dark on request

Every colour is a design token defined once in [`src/styles/index.css`](../../frontend/src/styles/index.css).
Tailwind 4 utilities read the tokens as CSS variables, so `bg-paper`, `text-ink` or `border-line` change with the
theme without any `dark:` variants in components.

| Token | Use | Light | Dark |
|---|---|---|---|
| `paper`, `paper-2`, `surface` | Page background, subtle fills, cards | warm paper | deep blue-black |
| `stage`, `stage-2` | Tinted panel behind diagrams, the life-event graph and the voice console, and the raised item on it | soft sage grey | near-black |
| `ink`, `ink-2`, `muted`, `faint` | Text, from strongest to faintest | navy ink | warm off-white |
| `line`, `line-2` | Borders and dividers | | |
| `civic`, `azure`, `amber`, `rose`, `violet` (+ `-soft`) | Status and accent colours | deep | brightened for contrast on dark |
| `on-accent` | Text on a solid accent fill | white | near-black |

- The preference (`light`, `dark` or `system`) is stored in `localStorage` (`lifeloop.theme`) and defaults to
  **light**. The toggle in every navigation bar cycles light → dark → system.
- A small script in `index.html` applies `class="dark"` to `<html>` before the first paint, so the page never
  flashes the wrong theme. [`src/app/theme.ts`](../../frontend/src/app/theme.ts) keeps the class, `data-theme` and
  the browser `theme-color` in sync afterwards.
- Switching theme from the toggle plays a camera-iris shutter ([`src/animations/shutter.ts`](../../frontend/src/animations/shutter.ts)):
  six blades twist shut, the new theme is painted while the screen is covered, and the blades twist open (about one
  second). Changes with no visible effect skip it, and reduced motion switches instantly.
- Inverse elements (the primary button, the active navigation pill) use `bg-ink text-paper`, which flips correctly
  in both themes. Status colours used in SVG charts come from `TONE[x].solid`, which is a CSS variable.

## Motion

Shared primitives live in [`src/animations/motion.tsx`](../../frontend/src/animations/motion.tsx):

| Primitive | What it does |
|---|---|
| `Reveal` | Rises into place the first time it scrolls into view |
| `Stagger` / `StaggerItem` | Children enter one after another |
| `TextReveal` | A heading rises word by word (works for all six scripts) |
| `HoverLift` | Lifts slightly on hover, presses on tap |
| `CountUp` | Counts a number up when it scrolls into view |
| `useGsap` | Runs GSAP (with ScrollTrigger) in a `gsap.context`, reverted on unmount |
| `FetchBar` | A thin bar across the top while any data is loading |

The motion language is shared by Framer Motion (component state, route transitions, layout and shared-element
animation such as the sliding navigation pill) and GSAP (scroll-driven sequences and SVG drawing):

- one long-tail settle ease (`[0.22, 1, 0.36, 1]` in Framer, `power3.out` in GSAP); smooth rather than bouncy;
- only `transform` and `opacity` are animated, so nothing reflows;
- every primitive is static under `prefers-reduced-motion`, and GSAP sequences jump to their end state;
- live updates animate what changed, never the whole page. Lenis smooth scrolling is kept in step with ScrollTrigger.

## Skeleton screens (boneyard-js)

Loading regions use [boneyard-js](https://boneyard.vercel.app), which captures skeletons from the real layout
instead of hand-drawn placeholders:

```tsx
<Bones name="res-case-home" loading={q.isLoading} fixture={<CaseHome view={FIXTURE} />}>
  {q.data && <CaseHome view={q.data} />}
</Bones>
```

1. [`Bones`](../../frontend/src/components/ui/Bones.tsx) wraps boneyard's `<Skeleton>` with the LifeLoop bone
   colours (light and dark) and a shimmer fallback for names that have not been captured yet.
2. Each area renders its named skeletons, with mock `fixture` data and the same layout wrapper as the real page, on
   a dev-only page, `/__bones` ([`src/bones/capture/`](../../frontend/src/bones/capture/)). The route is not part of
   production builds.
3. `make bones` (or `npm run bones` in `frontend/`) starts a throwaway dev server, captures every skeleton at 390,
   768, 1024 and 1440 px wide, and writes one `src/bones/<name>.bones.json` per skeleton. Re-run it whenever a
   skeleton-wrapped layout changes. 25 skeletons are captured today (`pub-*`, `res-*`, `staff-*`).

At runtime each skeleton's JSON is its own small chunk, fetched the first time that skeleton renders, so the app
entry never carries every page's bones (the all-in-one registry that boneyard-js can generate is not used). The
skeleton picks the closest breakpoint, scales to the real container, follows the `.dark` class for its colours, and
mirrors for right-to-left languages.

## Responsive layout

- Phones (360-390 px) are a first-class target. Below 1024 px the resident app uses a bottom tab bar and the officer
  workspace a drawer; from 1024 px both show their full navigation. On phones the language picker shows a short
  code (EN, AR, ...) and the open list still shows each language's own name.
- Wide tables become stacked cards on phones or scroll inside their own box; the page itself never scrolls
  sideways.
- Text is start-aligned (left in English, right in Arabic and Urdu), and long translations wrap rather than
  overflow (buttons wrap too).
- The browser QA scripts check every page in both themes at phone, tablet and desktop widths for console errors and
  horizontal overflow.

## Related

- [Architecture overview](overview.md)
- [Multilingual design](../agent/multilingual.md)

[Documentation index](../README.md)
