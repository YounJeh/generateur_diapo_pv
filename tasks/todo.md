# Task List: Cover + conclusion slides, chart readability

See `tasks/plan.md` for architecture decisions and rationale. Run `npm test` / `npm run build`
from the repo root for verification unless noted otherwise.

---

### Task 1: Scale up chart text + bar thickness

**Description:** In `src/chart/annualResultsChart.ts`, increase `barH` and all font-size
constants used by `drawChart()`, recomputing `rowY` spacing and any other layout offsets that
depend on them so nothing overlaps within the existing fixed canvas (`WIDTH=2344`, height derived
from `DEFAULT_FRAME_RATIO` / `STORAGE_FRAME_RATIO` — do not change these ratios, the on-slide
frame cannot grow). Target ~2× on `barH` and font sizes; if a literal 2× causes overlap (most
likely in the 3-segment storage variant, which has one more legend row than sans-stockage in the
same-ish vertical budget), scale down until it fits — document the actual factor used in a code
comment if it ends up below 2×. Do not change `barMaxW` (bar length stays proportional to MWh).
Do not reposition the legend or footnote (same layout shape, just bigger).

**Acceptance criteria:**
- [ ] `barH` and font-size constants are visibly larger than today (target 2×, may be less if
      required to avoid overlap)
- [ ] No element overlaps another when rendered, for both the 2-segment (sans-stockage) and
      3-segment (avec-stockage) variants
- [ ] Bar length (`barMaxW`-derived) still encodes the MWh value proportionally, unchanged

**Verification:**
- [ ] Tests pass: `npm test -- tests/chart/annualResultsChart.test.ts tests/chart/annualResultsChartStorage.test.ts`
- [ ] Build succeeds: `npm run build`
- [ ] Manual check: render both variants to PNG (e.g. via a throwaway script calling
      `renderAnnualResultsChart`/`renderAnnualResultsChartStorage` with fixture values and writing
      `canvas.toBuffer()` to a file) and visually confirm no overlap and a clear size increase

**Dependencies:** None

**Files likely touched:**
- `src/chart/annualResultsChart.ts`

**Estimated scope:** Small (1 file)

---

### Task 2: Promote + anonymize the intro/conclusion asset

**Description:** Copy `test/data/slide intro + conclusion.pptx` to
`assets/templates/template-intro-conclusion.pptx` and replace the Intermarché logo image
(`ppt/media/image5.png` in that file, referenced by the `<p:pic>` on slide 1 at
`off=(3343121,5119274) ext=(2536569,1465573)`) with a blank/neutral placeholder image of the
same file type, keeping the picture shape itself (position/size/relationship) untouched so it
stays a drop-in target for the end user in PowerPoint. This can be done as a small one-off script
(e.g. in the scratchpad, not committed) that opens the pptx with `adm-zip`, swaps the image
bytes, and writes the result to `assets/templates/`.

**Acceptance criteria:**
- [ ] `assets/templates/template-intro-conclusion.pptx` exists, contains the same 2 slides as the
      source, opens cleanly (no corruption)
- [ ] Slide 1's logo picture shape is present at the same position/size, but its image content is
      a blank/neutral placeholder, not the Intermarché logo
- [ ] Slide 2 (conclusion) is untouched at this stage — text/values still the template's own
      example content (that gets replaced at runtime, not here)

**Verification:**
- [ ] Manual check: open the resulting pptx (or convert via the existing LibreOffice preview
      pipeline) and visually confirm the logo is gone/blank and nothing else moved
- [ ] `git status` shows only the new asset file added under `assets/templates/`

**Dependencies:** None

**Files likely touched:**
- `assets/templates/template-intro-conclusion.pptx` (new, binary)

**Estimated scope:** Small (1 file, plus a throwaway script not committed)

---

### Task 3: `graftSlide` cross-deck merge utility

**Description:** Add a new function (e.g. `graftSlide(base: Pptx, source: Pptx, sourceSlideNumber: number, position: "prepend" | "append"): void` in a new `src/pptx/graftSlide.ts`, or as an
extension alongside `appendSlides` in `src/pptx/mergeSlides.ts` — implementer's call, keep
`appendSlides` itself unmodified/unregressed) that copies a slide from `source` into `base` when
`source` does **not** share `base`'s slideMaster/slideLayouts (unlike `appendSlides`'s existing
assumption). Needs to, for the one slide being grafted:
- Copy the slide XML + its own media + its own rels (excluding notesSlide), same as
  `appendSlides` already does — reuse/adapt that logic rather than duplicating it.
- Determine the slide's slideLayout via its rels; if that layout isn't already present in `base`
  (compare by content or just always treat foreign layouts as new — simplest and safe), copy the
  layout XML + its own rels + its referenced media into `base` under new non-colliding names/IDs.
- Determine that layout's slideMaster; if not already present in `base`, copy it too, **pruned**
  to reference only the `<p:sldLayoutId>` entries actually being brought over (not all 6 in the
  source deck — see `tasks/plan.md` risk note), plus register the master's own theme reference
  (source uses `theme2.xml`; copy it under a new name if `base` doesn't already have an identical
  one — safest to always copy fresh, themes are cheap).
- Register everything in `[Content_Types].xml`, `ppt/presentation.xml` (`sldMasterIdLst` if a new
  master was added, `sldIdLst`), and `ppt/_rels/presentation.xml.rels`, with fresh non-colliding
  relationship IDs (reuse `nextNumericSuffix`-style logic from `mergeSlides.ts`).
- `position: "prepend"` inserts the new `<p:sldId>` as the **first** entry in `<p:sldIdLst>`
  (new capability — today's `registerSlideInPresentation` only appends at the end); `"append"`
  matches today's end-of-list behavior.
- Do NOT copy fonts (verified identical `Barlow-*.fntdata` already embedded in both existing
  templates — skip font handling entirely for this utility, out of scope).

**Acceptance criteria:**
- [ ] Grafting slide 1 of `assets/templates/template-intro-conclusion.pptx` into a fresh copy of
      `assets/templates/template-sans-stockage.pptx` with `position: "prepend"` produces a pptx
      with the cover slide as the new first slide, all 2 original slides still present afterward,
      unmodified
- [ ] The grafted layout/master resources are present under names that don't collide with the
      target's existing `slideLayoutN.xml`/`slideMasterN.xml`
- [ ] `[Content_Types].xml`, `presentation.xml`, and `presentation.xml.rels` are all internally
      consistent (every referenced part exists, every part is referenced)
- [ ] `appendSlides`' existing behavior (used by `buildComparaisonPptx`) is unaffected — its
      existing tests still pass unmodified

**Verification:**
- [ ] Tests pass: new test file (e.g. `tests/pptx/graftSlide.test.ts`) covering the round-trip
      above, plus `npm test -- tests/pptx/mergeSlides.test.ts` (regression check)
- [ ] Build succeeds: `npm run build`
- [ ] Manual check: convert the grafted test-output pptx via the existing LibreOffice preview
      pipeline (`src/preview/pptxToImages.ts` or a direct `soffice --headless --convert-to png`
      call) to confirm it's not corrupt and renders visually as expected

**Dependencies:** None (can be built/tested against Task 2's asset once available, but the utility
itself doesn't depend on Task 2 being done first)

**Files likely touched:**
- `src/pptx/graftSlide.ts` (new) or `src/pptx/mergeSlides.ts`
- `tests/pptx/graftSlide.test.ts` (new)

**Estimated scope:** Medium (1-2 files, the highest-risk task in this plan — the OOXML plumbing
is fiddly; budget real time for it and lean on the LibreOffice smoke test to catch corruption
early)

---

### Checkpoint: Phase 2
- [ ] `npm test` passes, including the new `graftSlide` round-trip test
- [ ] A manually-grafted test pptx (cover prepended into a copy of `template-sans-stockage.pptx`)
      opens cleanly via LibreOffice
- [ ] No changes to `appendSlides`' existing behavior/tests

---

### Task 4: `addCoverSlide(zip)`

**Description:** Small wrapper (e.g. `src/pptx/coverSlide.ts`) around `graftSlide` that opens
`assets/templates/template-intro-conclusion.pptx`, grafts its slide 1 into the given `zip` with
`position: "prepend"`. No text/image substitution needed at call time — the asset from Task 2 is
already the final, anonymized content.

**Acceptance criteria:**
- [ ] Calling `addCoverSlide(zip)` on a rendered `renderSansStockage`/`renderStockage` result adds
      exactly one new slide, first in presentation order, with the anonymized placeholder logo
- [ ] The zip's original slides (title/details/monthly) are unchanged and still in their original
      relative order after the cover

**Verification:**
- [ ] Tests pass: `tests/pptx/coverSlide.test.ts` (new)
- [ ] Build succeeds: `npm run build`

**Dependencies:** Task 2, Task 3

**Files likely touched:**
- `src/pptx/coverSlide.ts` (new)
- `tests/pptx/coverSlide.test.ts` (new)

**Estimated scope:** Small (1-2 files)

---

### Task 5: `addConclusionSlide` — block count/positioning

**Description:** In a new `src/pptx/conclusionSlide.ts`, graft slide 2 of
`assets/templates/template-intro-conclusion.pptx` into the given `zip` with `position: "append"`,
then adjust the grafted slide's own block shapes (the "Scénario N" rounded rectangles) to match
the actual scenario count N (1, 2, or 3 — comparaison can have more than 2 groupes, unlike the
template's built-in 2):
- N=2: no shape-count change needed, template already has 2 blocks at the right position.
- N=1: remove one of the two block shapes; resize/reposition the remaining one to
  `x=685800, width=10820400` (full content width), keeping `y=1635760, height=3014240`.
- N=3: clone one block shape to get a third; reposition all three per the formula in
  `tasks/plan.md` (`width=3500133` each, `gap=160000`, computed left-to-right so the widths+gaps
  sum exactly to `10820400` — see the plan's rounding risk note).
Use direct XML shape manipulation (find the `<p:sp>` block by its `roundRect` + rounded-corner
`avLst`/fill color signature, or by paragraph text match on "Scénario 1 "/"Scénario 2 ", clone/
remove/edit its `<a:off>`/`<a:ext>`) — this is XML surgery on a single already-grafted slide, not
a cross-deck operation, so it doesn't need `graftSlide`. Leave the actual bullet text content
(autoconsommation/besoins values, phrasing) and the closing banner text for Task 6 — this task is
positioning/count only; use placeholder/template text for now and let Task 6 replace it.

**Acceptance criteria:**
- [ ] N=1 produces one full-width block
- [ ] N=2 produces the template's original two-block layout, unchanged
- [ ] N=3 produces three equal-width blocks whose widths+gaps sum exactly to 10820400 (no visible
      gap or overflow at the right edge)
- [ ] All blocks share the same `y`/`height` regardless of N
- [ ] Each block's "Scénario N " label text is renumbered correctly for its position (1-indexed)

**Verification:**
- [ ] Tests pass: `tests/pptx/conclusionSlide.test.ts` (new) — assert shape count and EMU
      positions for N=1, N=2, N=3
- [ ] Build succeeds: `npm run build`
- [ ] Manual check: convert an N=1 and an N=3 output through the LibreOffice preview pipeline,
      visually confirm no overlap/misalignment

**Dependencies:** Task 3 (and Task 2 for the source asset)

**Files likely touched:**
- `src/pptx/conclusionSlide.ts` (new)
- `tests/pptx/conclusionSlide.test.ts` (new)

**Estimated scope:** Medium (XML shape cloning/repositioning is fiddly — keep this task scoped to
positioning only, defer text content to Task 6)

---

### Task 6: Conclusion per-block text + closing banner

**Description:** Extend `addConclusionSlide` (or add a sibling function called right after it) to
fill each block's two bullets and the closing banner, given a list of per-scenario inputs. Define
a small input type, e.g.:

```ts
interface ConclusionScenario {
  scenarioNumero: number;
  avecStockage: boolean;
  autoconsommationDisplay: string; // "60" or "+95" — reuse tauxAutoconsommationAffichage's own convention
  besoinsPct: number; // tauxAutoproduction or tauxAutoproductionStockage
}
```

Per block: if `avecStockage`, bullet 1 = (`autoconsommationDisplay === "+95"` ?
`"Plus de 95 % d'autoconsommation"` : `` `${autoconsommationDisplay} % d'autoconsommation` ``) +
`" grâce à l'intégration d'une solution de stockage."`; bullet 2 = `` `${besoinsPct} % des besoins
énergétiques du site couverts` `` + `" par la production photovoltaïque."`. If not
`avecStockage`, bullet 1 = `` `${autoconsommationDisplay} % d'autoconsommation` `` + `" de la
production photovoltaïque."`; bullet 2 same as above. Use `replaceRuns`-style exact `<a:t>` run
matching against the (now positioned, from Task 5) block shapes — likely needs a variant of
`replaceRuns` that targets a specific shape/paragraph rather than the whole slide XML, since block
1 and block 2 start from the same template text ("Scénario 1 "/"Scénario 2 ") only for N=2; for
N=1 and N=3 the cloned blocks all start from the same source text and need per-instance
replacement, not a single find-all-instances-of-this-string pass.

Closing banner: replace the template's "Les deux solutions sont pertinentes au vu des résultats."
with `"Cette solution est pertinente au vu des résultats."` for N=1, or `"Les solutions
présentées sont pertinentes au vu des résultats."` for N=2/N=3.

Add the code path in `comparaison.ts` that derives `ConclusionScenario[]` from `groupeResults`
(preferred case per groupe = `groupe.cases[groupe.cases.length - 1]`, per `orderedCases`'
sans-stockage-before-avec-stockage ordering) and in `render.ts`'s single-scenario wrappers (Task
7) that derive a 1-element array from the single `SlideValues`/`StorageSlideValues`.

**Acceptance criteria:**
- [ ] A storage scenario with `tauxAutoconsommationAffichage === "+95"` renders "Plus de 95 %
      d'autoconsommation ... grâce à l'intégration d'une solution de stockage." — matching the
      template's own example text
- [ ] A storage scenario with a lower `tauxAutoconsommationAffichage` (e.g. "80") renders "80 %
      d'autoconsommation ... grâce à l'intégration d'une solution de stockage."
- [ ] A non-storage scenario renders "{X} % d'autoconsommation ... de la production
      photovoltaïque."
- [ ] Both scenario types render "{Y} % des besoins énergétiques du site couverts ... par la
      production photovoltaïque." with the correct Y (`tauxAutoproduction` or
      `tauxAutoproductionStockage`)
- [ ] Banner text is singular for N=1, plural for N=2/N=3
- [ ] `comparaison.ts` picks the avec-stockage case when a groupe has both, sans-stockage when it
      only has that

**Verification:**
- [ ] Tests pass: extend `tests/pptx/conclusionSlide.test.ts` with text-content assertions for
      mixed storage/non-storage scenario lists
- [ ] Build succeeds: `npm run build`

**Dependencies:** Task 5

**Files likely touched:**
- `src/pptx/conclusionSlide.ts`
- `src/generate/comparaison.ts`
- `tests/pptx/conclusionSlide.test.ts`

**Estimated scope:** Medium (2-3 files)

---

### Checkpoint: Phase 3
- [ ] Cover slide unit tests pass
- [ ] Conclusion slide unit tests pass for N=1, N=2, N=3, both storage and non-storage phrasing
- [ ] `npm test` and `npm run build` both pass

---

### Task 7: Wire cover + conclusion into the real generation pipelines

**Description:** Add `finalizePptx(zip: Pptx, scenarios: ConclusionScenario[]): void` (e.g. in
`src/generate/finalize.ts`) = `addCoverSlide(zip)` + `addConclusionSlide(zip, scenarios)`. Add two
thin wrapper functions in `render.ts` — e.g. `renderSansStockageStandalone` /
`renderStockageStandalone` — that call the existing (unmodified) `renderSansStockage`/
`renderStockage` and then `finalizePptx` with a 1-element scenario array derived from that call's
`values`. Update `cli.ts` and `src/server/routes/generate.ts` single-scenario branches to call
these new wrapper functions instead of the raw ones (comparaison branches in both already go
through `buildComparaisonPptx`, untouched here). Add the `finalizePptx` call at the very end of
`buildComparaisonPptx`, after the groupe loop, using `groupeResults` to build the full
`ConclusionScenario[]` (Task 6's derivation logic).

**Acceptance criteria:**
- [ ] `node dist/cli.js --pdf test/data/Solar_Edge_ITM_Rixhiem_3_omb_V2.pdf --rangees 3` (sans-
      stockage) produces a pptx with cover first, 1 conclusion block last
- [ ] The equivalent `--scenario stockage` run produces the same, with storage phrasing
- [ ] A `--scenario comparaison` run with 1, 2, and 3 groupes each produce a pptx with cover
      first, N conclusion blocks last, correct per-groupe phrasing/values
- [ ] `slide1Applied`/`slide2Applied`/etc. counters returned by `renderSansStockage`/
      `renderStockage` are unaffected (those functions are untouched)

**Verification:**
- [ ] Tests pass: `npm test` (full suite, including `tests/generate/render.test.ts`,
      `tests/generate/comparaison.test.ts` — extend these with cover/conclusion assertions)
- [ ] Build succeeds: `npm run build`
- [ ] Manual check: run all 3 CLI scenarios against `test/data/` fixtures, convert each output
      through the LibreOffice preview pipeline, visually confirm cover/conclusion look right

**Dependencies:** Task 4, Task 6

**Files likely touched:**
- `src/generate/finalize.ts` (new)
- `src/generate/render.ts`
- `src/generate/comparaison.ts`
- `src/cli.ts`
- `src/server/routes/generate.ts`
- `tests/generate/render.test.ts`
- `tests/generate/comparaison.test.ts`

**Estimated scope:** Medium (5+ files, but each change is small/mechanical)

---

### Checkpoint: Phase 4 (end-to-end)
- [ ] All 3 scenario types verified end-to-end via CLI against real `test/data/` fixtures
- [ ] Generated pptx files open cleanly (LibreOffice conversion, or manual open if available)
- [ ] `npm test` and `npm run build` pass

---

### Task 8: Update README

**Description:** Document the cover/conclusion slide behavior (every generated pptx now starts
with an anonymized cover slide and ends with a conclusion slide summarizing all scenarios in that
generation) and the chart readability change, in the relevant sections of `README.md` (the
"Ce que l'outil remplace" section per scenario, plus a short mention near the top).

**Acceptance criteria:**
- [ ] Someone reading `README.md` cold understands that every generated pptx now has a cover +
      conclusion slide, and that the cover's logo placeholder is meant to be replaced by the user

**Verification:**
- [ ] Manual: re-read `README.md` cold

**Dependencies:** Task 7

**Files likely touched:**
- `README.md`

**Estimated scope:** XS (1 file)

---

## Checkpoint: Complete
- [ ] All acceptance criteria across all 8 tasks met
- [ ] `npm test` and `npm run build` pass
- [ ] All 3 scenario types manually verified end-to-end
- [ ] `README.md` up to date
- [ ] Ready for `/code-review-and-quality`
