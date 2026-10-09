# Design log — chat-style UI with spring animations

**Date:** 9 October 2026
**Task:** bring the interface to life with spring animations, switch to
Inter + Roboto Mono, move to a single black / milk theme, and lay the page out
like a chat app: a one-sentence hero in the centre, the search bar docked at the
bottom, answers forming at the top once the first query is sent.

Same format as `CHANGES.md`: **Cause → What was done → Effect**, per-file
index at the end. Every entry is something that was added or changed in this
pass; nothing here is planned-but-not-done.

---

## 0. Starting point

`app/page.tsx` was a single client component: title at the top, input + mode
radio group under it, results listed below. Fonts were Geist via `next/font`,
and the theme followed `prefers-color-scheme`. No animation library.

---

## 1. Animation library

### 1.1 Chose Motion (framer-motion) over react-spring

**Cause.** The brief allowed react-spring if it turned out better, with the
constraint that the site must stay optimized. The UI needs four things:
enter/exit animations for the hero, results and errors; a pill that slides
between the three modes; cards that expand with a height spring; and respect for
`prefers-reduced-motion`.

**What was done.** Compared the two on exactly those needs:

| Need | framer-motion | @react-spring/web |
| --- | --- | --- |
| Exit animations | `AnimatePresence`, declarative | `useTransition`, works but more code per list |
| Sliding mode pill | `layoutId`, no measuring | manual `getBoundingClientRect` + `useSpring` |
| Card expand | `layout` prop animates height | measure `scrollHeight`, animate `height` by hand |
| Reduced motion | `MotionConfig reducedMotion="user"` | manual `matchMedia` check |
| Lazy feature loading | `LazyMotion` + `m` components | not applicable |
| Core size (gzip, measured) | ~20 KB initial + ~29 KB lazy | ~19 KB per bundlephobia, no lazy split |

**Effect.** Motion was taken. With `LazyMotion` the initial cost is in the same
range as react-spring, and the lazy chunk carries the layout/drag code that
react-spring would have required hand-written replacements for.

### 1.2 Imported from `framer-motion`, not from the `motion` barrel

**Cause.** The first build used the `motion` package (`import { m } from
"motion/react"`). Measuring the production chunks showed the initial JS at
**226 KB gzip** against **174 KB** on `main`, and the supposedly lazy feature
chunk was a 296-byte stub: all of framer-motion, including drag and layout
code, sat in the initial chunk. `motion/react` is `export * from
"framer-motion"`, and Turbopack did not tree-shake through that re-export
chain. `experimental.optimizePackageImports` for both packages changed nothing.

**What was done.** Replaced the `motion` dependency with `framer-motion`
directly (same author, same code, `motion` is a thin wrapper) and changed every
import to `from "framer-motion"`.

**Effect.** Measured on `next build` + `next start`, gzip sizes of the scripts
referenced by the `/` HTML:

| Build | Initial JS (gzip) | Lazy feature chunk |
| --- | --- | --- |
| `main` (no animations) | 174 KB | — |
| `motion/react` barrel | 226 KB | 0.3 KB stub, features in initial |
| `framer-motion` direct | **194 KB** | **28.8 KB**, loaded after hydration |

Animations cost 20 KB on first paint instead of 52 KB. The remaining 20 KB is
the `m` runtime, `AnimatePresence`, the new components, and the second font.

### 1.3 `LazyMotion` with `domMax`, loaded asynchronously

**Cause.** `layoutId` (mode pill) and `layout` (card expand) need the
projection feature set, which lives in `domMax`. Loading it statically puts it
on the critical path.

**What was done.** `app/components/MotionProvider.tsx` wraps the app in
`<LazyMotion features={() => import(...)} strict>` and
`<MotionConfig reducedMotion="user">`. `lib/ui/motion-features.ts` is the
single module the dynamic import points at; it re-exports `domMax` as default.
`strict` throws if anyone imports the full `motion` component instead of `m`,
which would silently reintroduce the bundle cost.

**Effect.** Hydration completes with the small core; springs, layout animations
and gestures attach once the feature chunk lands. `reducedMotion="user"` turns
transform animations off for users who asked for it at the OS level.

### 1.4 Shared spring presets

**Cause.** Twenty call sites each picking their own stiffness/damping produce a
UI where every element feels like a different material.

**What was done.** `lib/ui/motion.ts` exports three presets and a stagger
step:

| Preset | stiffness / damping | Used for |
| --- | --- | --- |
| `spring` | 320 / 30, mass 0.8 | cards, query bubble, hero text, chips |
| `springSoft` | 200 / 26 | hero enter/exit, results section fade |
| `springSnappy` | 520 / 34 | mode pill, send button |
| `STAGGER` | 0.05 s | per-item delay in the hero chips and result cards |

---

## 2. Typography

**Cause.** Brief: Inter for everything, Roboto Mono for accents.

**What was done.** `app/layout.tsx` loads `Inter` and `Roboto_Mono` from
`next/font/google` with CSS variables `--font-inter` and `--font-roboto-mono`
(`display: "swap"`). `globals.css` maps them to Tailwind's `--font-sans` and
`--font-mono` so `font-sans` / `font-mono` utilities resolve to them. Geist was
removed.

Roboto Mono is used only where the text is a value rather than prose: mode
labels, the mode hint, paragraph ids, scores, the `N fragments · mode` header,
and the example chips in the hero.

**Effect.** Self-hosted fonts through `next/font`: no external requests, no
layout shift, fallback metrics generated at build time (`Inter Fallback`,
`Roboto Mono Fallback`).

---

## 3. Colour

**Cause.** Brief: milk instead of white, black background, no light theme.

**What was done.** `globals.css` now defines two theme colours in `@theme`:

```
--color-ink:  #0a0a0a   (background)
--color-milk: #f3eee4   (text, buttons, active pill)
--color-danger: #f0a39a (error text)
```

They are declared as plain hex in `@theme` rather than via `@theme inline` +
CSS variables so Tailwind's opacity modifiers (`text-milk/55`,
`border-milk/15`) work. `prefers-color-scheme` handling was removed;
`color-scheme: dark` is set on `html` so native controls and scrollbars match.
Selection colour is milk on ink.

**Effect.** One palette, four tints of milk (100 / 75 / 55 / 40 %) carry the
whole hierarchy; no `dark:` variants anywhere.

---

## 4. Layout: chat-style

### 4.1 Hero in the centre, search bar at the bottom

**Cause.** Brief: like AI chat apps, one sentence about what the app does in the
centre, input docked at the bottom.

**What was done.**

- `app/components/Hero.tsx`: one sentence (`Search 29 lease agreements and get
  the original clauses back, not an LLM answer.`) plus three example queries
  as chips. Clicking a chip runs that search immediately. Enters with a spring,
  exits upward (`y: -28`, `scale: 0.98`) through `AnimatePresence`.
- `app/components/SearchBar.tsx`: `position: fixed` at the bottom with a
  gradient from ink to transparent above it, so content scrolls under it. Inside
  a rounded container: the input, a round send button, and under them the mode
  switch and the mode hint. The whole form lifts by 3 px on focus and the border
  brightens.
- `app/page.tsx` renders `Hero` while there are no turns and `Thread`
  afterwards, both inside one `AnimatePresence`.

**Effect.** First screen is a single sentence and a prompt; the first query
clears it.

### 4.2 Thread of turns

**Cause.** Brief: once the user searches, the greeting disappears and the answer
forms at the top. Replace-vs-append was left open; append was chosen because it
matches the chat-app reference and keeps previous results scrollable for
comparing modes on the same query.

**What was done.** `Turn` type in `lib/ui/search.ts`:
`{ id, query, mode, results | null, error | null }`. `page.tsx` appends a turn
with `results: null` the moment the form is submitted, then patches that turn by
id when the fetch resolves. `app/components/Thread.tsx` renders each turn as:

1. the query as a right-aligned milk bubble (user message);
2. under it, one of three states through `AnimatePresence mode="wait"`:
   three bouncing dots while loading, an error card, or the results section.

A sentinel `div` at the end is scrolled into view when a turn is added or
resolves. Bottom padding (`pb-44`) keeps the last card above the fixed bar.

**Effect.** Each search is a message pair; the input clears after submit like a
chat composer.

### 4.3 Mode switch

**What was done.** `app/components/ModeSwitch.tsx`: three buttons in a
`radiogroup`. The active one renders an absolutely positioned `m.span` with
`layoutId="mode-pill"`, so the milk pill slides to the newly selected option
with `springSnappy`. Text colour cross-fades via CSS. The hint for the active
mode shows beside the switch in Roboto Mono.

### 4.4 Result cards

**What was done.** `app/components/ResultCard.tsx`: each card enters from
`y: 18` with `index * STAGGER` delay, lifts 2 px on hover, and toggles between
`line-clamp-5` and full text on click. `layout` on the `li` animates the height
change with a spring; `layout="position"` on the header and paragraph stops
them from being scale-distorted while the box resizes. Index is zero-padded
(`01`), the paragraph range collapses to a single id when first === last.

### 4.5 Send button and loading state

**What was done.** The send button is an arrow, not a word. It scales to 0.92
and fades to 30 % while the query is empty, pops to 1.06 on hover and 0.9 on
tap when enabled, and shows a spinning ring while a request is in flight.
`disabled` and `aria-label` are preserved.

### 4.6 Milk glow behind the hero sentence

**Cause.** Follow-up request: a blurred milk sphere around the hero text,
visible against the black.

**What was done.** `Hero.tsx` renders a two-layer element behind the
sentence:

- outer `m.div`, centred with `absolute inset-0 m-auto` (no transform), owns
  the enter (`scale 0.6 → 1`) and exit (`scale → 1.3`, fade) through the same
  `AnimatePresence` as the hero;
- inner `div.hero-glow`, a radial gradient of milk at 38 % in the centre
  fading to transparent at 70 % radius, `filter: blur(28px)`, and a 7 s CSS
  `hero-breathe` keyframe that scales 1 → 1.12 and shifts opacity
  0.85 → 1.

The layers are split on purpose: Motion writes an inline `transform` for
enter/exit, CSS keyframes also write `transform` for the breathing, and on one
element the animation would override the inline value and kill the exit.
Breathing is CSS rather than a Motion `repeat` so it costs no JS per frame;
`will-change: transform, opacity` keeps it on the compositor, and
`prefers-reduced-motion: reduce` stops it. The glow is 28 rem on phones and
36 rem from `sm`, clipped by `overflow-hidden` on the hero section.

**Effect.** The sentence sits in a soft milk halo that slowly breathes and
collapses outward when the first query clears the hero.

---

## 5. What was verified and what was not

| Check | Result |
| --- | --- |
| `npm run lint` | clean |
| `npm run typecheck` | clean |
| `next build` | compiles, `/` prerendered static |
| `/api/search` through the dev server, `bm25` mode | returns fragments |
| Rendered HTML contains the hero sentence and both font classes | yes |
| Chunk sizes | see table in 1.2 |
| Visual check in a browser | **not done**: the Chrome extension was not connected in this session |

---

## 6. Per-file index

| File | Change |
| --- | --- |
| `package.json` | `+ framer-motion ^14.0.0` |
| `app/layout.tsx` | Inter + Roboto Mono via `next/font`, `MotionProvider` wraps `children` |
| `app/globals.css` | ink / milk / danger tokens, font mapping, `color-scheme: dark`, selection, `.hero-glow` + `hero-breathe` keyframes |
| `app/page.tsx` | rewritten: turn state, `Hero` ⇄ `Thread` switch, `SearchBar` |
| `app/components/MotionProvider.tsx` | new: `LazyMotion` (async `domMax`, strict) + `MotionConfig` |
| `app/components/Hero.tsx` | new: centred sentence + example chips + breathing milk glow |
| `app/components/SearchBar.tsx` | new: fixed bottom composer with mode switch |
| `app/components/ModeSwitch.tsx` | new: radiogroup with `layoutId` pill |
| `app/components/Thread.tsx` | new: list of turns, loading dots, error, results |
| `app/components/ResultCard.tsx` | new: staggered, expandable result card |
| `lib/ui/motion.ts` | new: spring presets and stagger step |
| `lib/ui/motion-features.ts` | new: lazy entry re-exporting `domMax` |
| `lib/ui/search.ts` | new: `MODES`, `Mode`, `Result`, `Turn`, `EXAMPLES` |

`app/api/search/route.ts` and everything under `lib/api`, `lib/data`,
`lib/test` are untouched.
