# Implementation Plan: Cover + conclusion slides, chart readability

## Overview

Three independent work items, confirmed via `/interview-me` (see conversation), on branch
`feature/cover-conclusion-slides-chart-sizing`:

1. Make the "RÉSULTATS DE CONSOMMATION ET DE PRODUCTION ANNUELLES" chart more legible (bigger
   text, thicker bars) within its existing, non-resizable on-slide frame.
2. Prepend a client-agnostic cover slide (anonymized logo placeholder) to every generated pptx —
   single-scenario and "comparaison".
3. Append a data-driven conclusion slide (1–3 "Scénario N" blocks, real autoconsommation/besoins
   values, count-aware closing sentence) to every generated pptx.

Source material for (2) and (3): `test/data/slide intro + conclusion.pptx` (2 slides, Google
Slides export — different slideMaster/slideLayouts than `assets/templates/*.pptx`).

## Architecture Decisions

- **Promote + anonymize the source deck once, commit it as a proper asset**
  (`assets/templates/template-intro-conclusion.pptx`), rather than reading
  `test/data/slide intro + conclusion.pptx` at runtime (that path is an untracked local fixture,
  same convention as the other `test/data/*.pdf` files — not meant to ship). The Intermarché logo
  is replaced with a blank/neutral placeholder image **in this committed asset**, once — no
  runtime image-swap logic needed for the cover slide at all.

- **Cross-deck slide merge happens at runtime, not via an offline "bake" script.** The codebase's
  existing pattern is "generate everything fresh from source assets on every run" (chart drawn at
  runtime, monthly chart image captured at runtime, nothing pre-baked). A one-time bake script
  would be the first exception to that pattern, and would produce a derived binary asset that's
  opaque to review. Instead we extend the existing `appendSlides` idea (src/pptx/mergeSlides.ts)
  into a new, general **`graftSlide`** utility that also copies the referenced slideLayout +
  slideMaster (source and target templates do NOT share a layout/master, unlike the two existing
  templates which `appendSlides` assumes share one).
  - Verified this is tractable: the source deck's cover slide (slideLayout1) and conclusion slide
    (slideLayout2) both point to the **same single slideMaster1.xml** — so grafting either slide
    only ever requires copying 1 master + 1 layout (+ that layout's own media) into the target,
    once per generated pptx, not once per slide.
  - Fonts are a non-issue: the source deck embeds the exact same `Barlow-{regular,bold,italic,
    boldItalic}.fntdata` files as both existing templates — no font copying needed.

- **Cover and conclusion are NOT baked into `renderSansStockage`/`renderStockage`.** Those two
  functions stay exactly as they are today (pure, single-case, no cover/conclusion) because
  `buildComparaisonPptx` (src/generate/comparaison.ts) reuses them per-case/per-groupe and
  `appendSlides` already assumes their output is just the raw content slides. Instead:
  - The **cover** is grafted exactly once per final pptx, as the new first slide.
  - The **conclusion** is grafted exactly once per final pptx, as the new last slide, built from
    the *complete* list of scenarios in that run (1 for a single-scenario run, N for comparaison).
  - A single new helper, `finalizePptx(zip, scenarios)`, does both and is called from: two new
    thin wrapper functions in `render.ts` (single-scenario CLI/web paths) and once at the tail of
    `buildComparaisonPptx` (after the groupe loop, using `groupeResults`).
  - This sidesteps an ordering hazard: `appendSlides`' `registerSlideInPresentation` always
    inserts new slides at the very end of `<p:sldIdLst>`. If the conclusion were baked into the
    per-case template used as `buildComparaisonPptx`'s `baseZip`, every subsequent groupe's
    appended content would land *after* the conclusion. Keeping conclusion-append as an explicit
    final step (after all groupe content is assembled) avoids this entirely.

- **Conclusion block sizing** (EMU, slide is 12192000×6858000): content envelope is
  `x=685800`, `total width=10820400` (matches the title/banner boxes exactly), blocks at
  `y=1635760`, `height=3014240` for every N. Gap between blocks = `160000` (derived from the
  template's own N=2 layout: `10820400 − 2×5330200`). Block width per N:
  - N=1: one block, `width=10820400`.
  - N=2: template's own values, `width=5330200`, `x = 685800 + i×(5330200+160000)`.
  - N=3: `width=3500133` (`(10820400 − 2×160000) / 3`, rounded), same gap.
  Closing banner box position/size is fixed (`x=685800, y=4830000, w=10820400, h=1080000`) for
  every N — only its text changes.

- **Per-scenario value/phrasing rule** (already implicit in the source template's own two
  example blocks): a scenario/groupe with an avec-stockage case uses
  `tauxAutoconsommationAffichage` (string, may be `"+95"`) + `tauxAutoproductionStockage`
  (number) and storage phrasing (" grâce à l'intégration d'une solution de stockage.");
  otherwise it uses `tauxAutoconsommation` + `tauxAutoproduction` (both numbers) and non-storage
  phrasing (" de la production photovoltaïque."). `"+95"` renders as "Plus de 95 %" instead of
  "+95 %" specifically on this slide (matches the template's own example text). For a
  `GroupeResult`, the preferred case is simply `groupe.cases[groupe.cases.length - 1]`
  (`orderedCases` always puts sans-stockage before avec-stockage).

- **Chart resize is a scale-to-fit, not a literal ×2.** The on-slide picture frame is wedged with
  ~zero vertical gap between the 4 metric boxes above and the dark summary box below on the real
  template slides (verified against `assets/templates/*.pptx`, not just the intro/conclusion
  deck) — it cannot grow. `barH` (bar thickness) and font sizes scale up together, capped below
  2× if literal 2× would overlap within the existing canvas height (`WIDTH=2344`,
  height derived from `DEFAULT_FRAME_RATIO`/`STORAGE_FRAME_RATIO`, both fixed). Bar *length*
  (`barMaxW`) is untouched — it encodes the MWh value, not a "size" setting. Layout shape stays
  as today (label above bar, legend beside, italic footnote below) — no repositioning.

## Task List

### Phase 1: Chart readability (independent, no dependencies on the rest)
- [x] Task 1: Scale up chart text + bar thickness in `annualResultsChart.ts`

### Checkpoint: Phase 1
- [x] `npm test` passes (tests/chart/annualResultsChart.test.ts, annualResultsChartStorage.test.ts)
- [x] Visual check: render both variants, confirm no overlap, text/bars visibly larger

### Phase 2: Foundation for slide grafting
- [x] Task 2: Promote + anonymize the intro/conclusion asset
- [x] Task 3: `graftSlide` cross-deck merge utility (slide + layout + master + media, prepend/append)

### Checkpoint: Phase 2
- [x] `graftSlide` round-trip test passes (grafted pptx is well-formed, opens cleanly)
- [x] `npm test` still passes (no regression to `appendSlides`' existing comparaison use case)

### Phase 3: Cover + conclusion slide builders
- [ ] Task 4: `addCoverSlide(zip)` using Task 2 + Task 3
- [ ] Task 5: `addConclusionSlide(zip, scenarios)` — block count/positioning
- [ ] Task 6: Per-block text content + closing banner text rules

### Checkpoint: Phase 3
- [ ] Unit tests pass for cover slide (1 slide added, first in order, rest untouched)
- [ ] Unit tests pass for conclusion slide at N=1, N=2, N=3 (block count, positions, text)

### Phase 4: Wiring into the real pipelines
- [ ] Task 7: `finalizePptx` + wire into `render.ts` wrappers, `cli.ts`, `generate.ts`, `comparaison.ts`

### Checkpoint: Phase 4 (end-to-end)
- [ ] CLI run against `test/data/` fixtures for all 3 scenarios (sans-stockage, stockage,
      comparaison with 1/2/3 groupes) produces a pptx with cover first, conclusion last, correct
      block count/values
- [ ] Generated pptx opens cleanly via the existing LibreOffice preview pipeline
      (`src/preview/pptxToImages.ts`) — no corruption
- [ ] `npm test` and `npm run build` pass

### Phase 5: Docs
- [ ] Task 8: Update `README.md`

### Checkpoint: Complete
- [ ] All acceptance criteria met
- [ ] Ready for `/code-review-and-quality`

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Cross-deck graft produces a corrupt/unopenable pptx (relationship ID collisions, dangling refs) | High | Task 3 has its own round-trip validity test before anything is built on top of it; reuse the existing LibreOffice-based preview pipeline as an end-to-end smoke test at Phase 4's checkpoint |
| Literal 2× chart scaling doesn't fit, silently overlaps | Medium | Confirmed with user: treat 2× as a ceiling, not a requirement — scale to the largest size that doesn't overlap, verify visually |
| EMU rounding on N=3 block widths leaves a visible gap/overflow at the right edge | Low | Compute the last block's width as the remainder (`total − Σ previous widths − Σ gaps`) rather than repeating the rounded value 3×, so the envelope sums exactly to 10820400 |
| `graftSlide`'s master-pruning (copying only layout1+layout2 out of the source's 6 layouts) breaks if the source deck's master references layouts by index/order assumptions | Low | Only copy the `<p:sldLayoutId>` entries for the 2 layouts actually used; test opens cleanly via LibreOffice |

## Open Questions

None outstanding — all resolved via `/interview-me` before this plan was written.
