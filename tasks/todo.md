# Todo : Scénario "avec stockage"

Voir `tasks/plan.md` pour le contexte, les faits vérifiés sur les fixtures et les décisions d'architecture. Ce todo étend le générateur existant (scénario "sans stockage", déjà en production) sans le modifier fonctionnellement.

## Phase 1 : Extraction augmentée (types + regex)

### Task 1 : Types storage
**Description :** Dans `src/types.ts`, ajouter `StorageExtractedValues extends ExtractedValues` avec 4 nouveaux champs (`versStockageMwh: string`, `versStockagePct: number`, `depuisStockageMwh: string`, `depuisStockagePct: number`) et `StorageSlideValues extends StorageExtractedValues` avec `puissanceInstallee: number`, `rangees: number`, `tauxAutoconsommationAffichage: string`, `tauxAutoproductionStockage: number`. Ne pas toucher à `ExtractedValues`/`SlideValues` existants.

**Acceptance criteria :**
- [ ] `StorageExtractedValues` et `StorageSlideValues` compilent et étendent correctement les types existants
- [ ] `ExtractedValues`/`SlideValues` inchangés (diff de `src/types.ts` n'ajoute que les 2 nouvelles interfaces)

**Verification :**
- [ ] Build : `npm run build`

**Dependencies :** Aucune

**Files likely touched :** `src/types.ts`

**Estimated scope :** XS

---

### Task 2 : Nouveaux extracteurs regex + fonction combinée storage
**Description :** Dans `src/pdf/extractValues.ts`, ajouter 4 fonctions au même style que l'existant (`extract()` interne, erreur explicite si le motif n'est pas trouvé) :
- `extractVersStockageMwh(page2Text): string` — depuis `"Vers le stockage (\d+,\d+) MWh"`
- `extractVersStockagePct(page2Text): number` — depuis `"Vers le stockage[^)]*\((\d+)%\)"`
- `extractDepuisStockageMwh(page2Text): string` — depuis `"Depuis le stockage (\d+,\d+) MWh"`
- `extractDepuisStockagePct(page2Text): number` — depuis `"Depuis le stockage[^)]*\((\d+)%\)"`

Ajouter `extractFromPdfTextStorage(page1Text, page2Text): StorageExtractedValues` qui appelle `extractFromPdfText(page1Text, page2Text)` (réutilisé tel quel) puis ajoute les 4 nouveaux champs.

**Acceptance criteria :**
- [ ] Sur le texte réel des pages 1-2 de `test/data/D_26_1223_Intermarche_Rixhiem_3_Omb_avec_stockage_V2.pdf` :
  - `versStockageMwh === "93,88"`, `versStockagePct === 27`
  - `depuisStockageMwh === "91,64"`, `depuisStockagePct === 14`
  - Champs hérités : `nombreModules===744`, `productionAnnuelleMwh==="343,74"`, `ratioDePerformance==="76"`, `tauxAutoconsommation===72`, `surplusProduction===1`, `tauxAutoproduction===38`, `productionTotaleMwh==="344,98"`, `consommationTotaleMwh==="658,15"`, `versBatimentMwh==="247,42"`, `versReseauMwh==="3,20"`, `depuisPvMwh==="247,42"`, `duReseauMwh==="316,11"`
- [ ] Une regex qui ne matche rien lève une erreur explicite nommant le champ
- [ ] Aucune régression sur `extractFromPdfText`/les extracteurs existants (tests sans-stockage inchangés et verts)

**Verification :**
- [ ] Tests : `npm test` (nouveau `tests/pdf/extractValues.storage.test.ts`)
- [ ] Build : `npm run build`

**Dependencies :** Task 1

**Files likely touched :** `src/pdf/extractValues.ts`, `tests/pdf/extractValues.storage.test.ts`

**Estimated scope :** M

---

## Checkpoint : Après Tasks 1-2
- [ ] `npm test` passe entièrement (existants + nouveaux)
- [ ] Toutes les valeurs extraites correspondent exactement aux valeurs vérifiées ci-dessus
- [ ] **Revue avec l'utilisateur avant de continuer vers la Phase 2**

---

## Phase 2 : Calcul des valeurs dérivées

### Task 3 : Fonctions de calcul storage
**Description :** Dans `src/calc.ts`, ajouter :
- `tauxAutoconsommationAffichage(tauxAutoconsommation: number, versStockagePct: number): string` — `total = tauxAutoconsommation + versStockagePct` ; retourne `"+95"` si `total >= 95`, sinon `String(total)`.
- `tauxAutoproductionStockage(tauxAutoproduction: number, depuisStockagePct: number): number` — retourne `tauxAutoproduction + depuisStockagePct`.
- `buildStorageValues(extracted: StorageExtractedValues, rangees: number): StorageSlideValues` — assemble `puissanceInstallee` (fonction existante `puissanceInstallee()` réutilisée telle quelle) + les 2 valeurs ci-dessus + tous les champs de `extracted` + `rangees`.

**Acceptance criteria :**
- [ ] `tauxAutoconsommationAffichage(72, 27)` === `"+95"` (99 ≥ 95)
- [ ] `tauxAutoconsommationAffichage(50, 30)` === `"80"` (80 < 95)
- [ ] `tauxAutoconsommationAffichage(60, 40)` === `"+95"` (100, dépassement par arrondi)
- [ ] `tauxAutoconsommationAffichage(50, 45)` === `"+95"` (exactement 95, cas limite inclus)
- [ ] `tauxAutoproductionStockage(38, 14)` === `52`
- [ ] `buildStorageValues(...)` sur les valeurs réelles de la fixture produit `puissanceInstallee===350`, `tauxAutoconsommationAffichage==="+95"`, `tauxAutoproductionStockage===52`
- [ ] Aucune régression sur `puissanceInstallee()`/`buildValues()` existants (tests inchangés et verts)

**Verification :**
- [ ] Tests : `npm test` (nouveau `tests/calc.storage.test.ts`)
- [ ] Build : `npm run build`

**Dependencies :** Task 1, Task 2

**Files likely touched :** `src/calc.ts`, `tests/calc.storage.test.ts`

**Estimated scope :** S

---

## Checkpoint : Après Task 3
- [ ] `npm test` passe entièrement
- [ ] Les 3 cas limites de `tauxAutoconsommationAffichage` (< 95, ≥ 95, exactement 95) sont couverts et corrects
- [ ] **Revue avec l'utilisateur avant de continuer vers la Phase 3**

---

## Phase 3 : Table de remplacement texte slide 2 (storage)

### Task 4 : `buildSlide2ReplacementsStorage`
**Description :** Nouveau fichier `src/pptx/slide2MapStorage.ts`, calqué sur `src/pptx/slide2Map.ts` : `buildSlide2ReplacementsStorage(values: StorageSlideValues): Map<string,string>` avec les 9 correspondances exactes suivantes (apostrophe typographique `’`, espaces exacts vérifiés dans le template réel) :
1. `"Étude de production – Ombrières 350 kWc avec stockage "` → `"Étude de production – Ombrières {puissanceInstallee} kWc avec stockage "`
2. `"350 kWc"` → `"{puissanceInstallee} kWc"`
3. `"744"` → `"{nombreModules}"`
4. `"347 760 kWh"` → `"{formatProductionKwh(productionAnnuelleMwh)} kWh"` (réutiliser `formatProductionKwh` existant de `format.ts`)
5. `"77,0 %"` → `"{formatRatioPerformance(ratioDePerformance)} %"` (réutiliser `formatRatioPerformance` existant)
6. `"Taux d’autoconsommation : +95%"` → `"Taux d’autoconsommation : {tauxAutoconsommationAffichage}%"`
7. `"+95 % de la production de votre centrale photovoltaïque"` → `"{tauxAutoconsommationAffichage} % de la production de votre centrale photovoltaïque"`
8. `"Taux d’autoproduction : 52%"` → `"Taux d’autoproduction : {tauxAutoproductionStockage}%"`
9. `"52 % de vos besoins en électricité"` → `"{tauxAutoproductionStockage} % de vos besoins en électricité"`

**Acceptance criteria :**
- [ ] `buildSlide2ReplacementsStorage(values).size === 9`
- [ ] Les 9 clés existent verbatim dans `ppt/slides/slide2.xml` du template réel `test/data/scenario 1 avec stockage Projet_Ombriere_Rixhiem.pptx` (test qui dézippe la fixture, comme `tests/pptx/slide2Map.test.ts`)
- [ ] Avec les valeurs réelles de la fixture (`tauxAutoconsommationAffichage="+95"`, `tauxAutoproductionStockage=52`), la map produit exactement `"Taux d’autoconsommation : +95%"` et `"Taux d’autoproduction : 52%"` (identiques au défaut du template, car cette fixture est justement dans le cas plafonné)
- [ ] Avec une valeur synthétique `tauxAutoconsommationAffichage="80"` (cas non plafonné), la map produit `"Taux d’autoconsommation : 80%"` (pas de `+`)
- [ ] Aucun texte "surplus" présent dans les clés ou valeurs

**Verification :**
- [ ] Tests : `npm test` (nouveau `tests/pptx/slide2MapStorage.test.ts`)
- [ ] Build : `npm run build`

**Dependencies :** Task 3

**Files likely touched :** `src/pptx/slide2MapStorage.ts`, `tests/pptx/slide2MapStorage.test.ts`

**Estimated scope :** M

---

## Checkpoint : Après Task 4
- [ ] `npm test` passe entièrement
- [ ] `replaceRuns` appliqué avec `buildSlide1Replacements` + `buildSlide2ReplacementsStorage` sur `slide1.xml`/`slide2.xml` réels du template storage : tous les remplacements trouvés (`missing` vide)
- [ ] **Revue avec l'utilisateur avant de continuer vers la Phase 4**

---

## Phase 4 : Graphique annuel à 3 segments

### Task 5 : Refactor générique de `annualResultsChart.ts`
**Description :** Dans `src/chart/annualResultsChart.ts` : changer `Row.segments` de `[Segment, Segment]` à `Segment[]` (nombre variable, la boucle de dessin existante fonctionne déjà par itération donc ce changement de type est peu invasif). Extraire un moteur de rendu interne (ex. `drawRows(ctx, rows: [Row, Row], width, height, frameRatio)`) paramétré par le `frameRatio` (actuellement la constante `FRAME_RATIO` figée). `renderAnnualResultsChart` (export existant) doit garder exactement la même signature et le même comportement — il construit ses 2 lignes à 2 segments comme aujourd'hui et appelle le moteur interne avec le ratio sans-stockage (10718018/2219711) par défaut.

**Acceptance criteria :**
- [ ] `tests/chart/annualResultsChart.test.ts` (existant, non modifié) passe toujours sans aucune modification de son contenu
- [ ] Le moteur interne accepte un nombre de segments variable par ligne (testable indirectement via Task 7)

**Verification :**
- [ ] Tests : `npm test`
- [ ] Build : `npm run build`

**Dependencies :** Aucune

**Files likely touched :** `src/chart/annualResultsChart.ts`

**Estimated scope :** M

---

### Task 6 : Couleurs réelles du graphique storage
**Description :** Écrire un script d'investigation ponctuel (peut être un test temporaire ou une exécution manuelle via `tsx`, non nécessairement conservé) qui inspecte la page 2 du PDF storage via `pdfjs-dist` (operator list : `constructPath`/`setFillRGBColor` ou équivalent) pour déterminer les couleurs de remplissage réelles des segments "Vers le stockage" et "Depuis le stockage", suivant la méthode déjà utilisée pour les couleurs existantes (commit "Match chart text color to the PDF's actual fill color per item"). Documenter les 2 valeurs hex trouvées.

**Acceptance criteria :**
- [ ] 2 couleurs hex identifiées et documentées (commentaire dans le code, comme `PROD_GREEN`/`PROD_TEAL`/`CONS_BLUE`/`CONS_ORANGE` existants), visuellement distinctes des 4 couleurs déjà utilisées

**Verification :**
- [ ] Manuel : couleurs vérifiées visuellement par comparaison avec le PDF source (page 2, légende)

**Dependencies :** Aucune (peut être fait en parallèle de Task 5)

**Files likely touched :** Aucun fichier de production (investigation), résultat consommé par Task 7

**Estimated scope :** XS

---

### Task 7 : `renderAnnualResultsChartStorage`
**Description :** Dans `src/chart/annualResultsChart.ts`, ajouter l'export `renderAnnualResultsChartStorage(values: StorageAnnualResultsChartValues, frameRatio?: number): Buffer` (nouveau type `StorageAnnualResultsChartValues` = `Pick` sur `StorageExtractedValues` avec tous les champs MWh/pct nécessaires, y compris `versStockageMwh`/`versStockagePct`/`depuisStockageMwh`/`depuisStockagePct`). Construit 2 `Row` à 3 segments chacune (Production : bâtiment/stockage/réseau ; Consommation : PV/stockage/réseau) avec les couleurs de Task 6, appelle le moteur interne de Task 5 avec `frameRatio` par défaut = `10820400/2493845` (ratio du cadre storage).

**Acceptance criteria :**
- [ ] Le PNG produit a un ratio largeur/hauteur ≈ 4,339 (cadre storage) par défaut
- [ ] 3 segments visibles par barre (test de présence d'au moins 3 couleurs de remplissage distinctes hors fond, par ligne)
- [ ] Barre Production plus courte que barre Consommation (345 MWh vs 658 MWh), proportionnalité vérifiée comme le test existant
- [ ] `renderAnnualResultsChart` (2 segments, existant) reste inchangé et son test passe toujours

**Verification :**
- [ ] Tests : `npm test` (nouveau `tests/chart/annualResultsChartStorage.test.ts`, même style que le test existant)
- [ ] Build : `npm run build`
- [ ] Manuel : ouvrir le PNG généré et vérifier visuellement les 3 segments + légende + absence de déformation

**Dependencies :** Task 3, Task 5, Task 6

**Files likely touched :** `src/chart/annualResultsChart.ts`, `tests/chart/annualResultsChartStorage.test.ts`

**Estimated scope :** M

---

## Checkpoint : Après Tasks 5-7
- [ ] `npm test` passe entièrement, y compris le test de non-régression du graphique sans-stockage (inchangé)
- [ ] PNG storage vérifié visuellement (3 segments, bon ratio, bonnes couleurs, pas de déformation)
- [ ] **Revue avec l'utilisateur avant de continuer vers la Phase 5**

---

## Phase 5 : Remplacement d'image générique

### Task 8 : Généraliser `replaceChartImage`
**Description :** Dans `src/pptx/replaceImage.ts`, ajouter un paramètre optionnel `imageEntry: string = "ppt/media/image8.png"` à `replaceChartImage(zip, newImageBuffer, imageEntry?)`. Le reste du comportement (reset `<a:srcRect b="0" l="0" r="0" t="0"/>`, remplacement des octets, erreur explicite si `srcRect` introuvable) reste identique.

**Acceptance criteria :**
- [ ] Appel `replaceChartImage(zip, buffer)` (sans 3ᵉ argument, existant) : comportement strictement identique — test existant `tests/pptx/replaceImage.test.ts` inchangé et vert
- [ ] Appel `replaceChartImage(zip, buffer, "ppt/media/image5.png")` sur le template storage réel : `ppt/media/image5.png` remplacé, `<a:srcRect b="0" l="0" r="0" t="0"/>` présent (déjà le cas dans ce template), `<a:off x="685800" y="2597086"/>`/`<a:ext cx="10820400" cy="2493845"/>` inchangés, toutes les autres entrées du zip identiques octet pour octet à l'original

**Verification :**
- [ ] Tests : `npm test` (existant inchangé + nouveau cas dans `tests/pptx/replaceImage.test.ts`)
- [ ] Build : `npm run build`

**Dependencies :** Aucune (indépendant, peut être fait en parallèle des phases 1-4)

**Files likely touched :** `src/pptx/replaceImage.ts`, `tests/pptx/replaceImage.test.ts`

**Estimated scope :** S

---

## Checkpoint : Après Task 8
- [ ] `npm test` passe entièrement
- [ ] **Revue avec l'utilisateur avant de continuer vers la Phase 6**

---

## Phase 6 : CLI et orchestration bout-en-bout

### Task 9 : Flag `--scenario` et dispatch dans `cli.ts`
**Description :** Dans `src/cli.ts` : ajouter l'argument `--scenario` (valeurs autorisées `"sans-stockage"` [défaut] / `"stockage"`, erreur explicite sinon). Table de dispatch par scénario regroupant : chemin du template pptx, fonction d'extraction (`extractFromPdfText` / `extractFromPdfTextStorage`), fonction de calcul (`buildValues` / `buildStorageValues`), fonction de remplacement slide 2 (`buildSlide2Replacements` / `buildSlide2ReplacementsStorage`), fonction de rendu du graphique (`renderAnnualResultsChart` / `renderAnnualResultsChartStorage`), entrée image (`ppt/media/image8.png` / `ppt/media/image5.png`). `buildSlide1Replacements` reste appelé identiquement pour les deux scénarios. Affichage console adapté (log des champs pertinents selon le scénario actif).

**Acceptance criteria :**
- [ ] `node dist/cli.js --pdf test/data/Solar_Edge_ITM_Rixhiem_3_omb_V2.pdf --rangees 3` (sans `--scenario`) produit un résultat identique à avant (non-régression, diff de sortie nul par rapport au comportement actuel)
- [ ] `node dist/cli.js --pdf test/data/D_26_1223_Intermarche_Rixhiem_3_Omb_avec_stockage_V2.pdf --rangees <n> --scenario stockage` produit un pptx sans erreur, avec les 9 remplacements de texte de slide 2 + le remplacement de slide 1 + l'image storage
- [ ] `--scenario abc` → message d'erreur clair listant `sans-stockage`/`stockage`
- [ ] La sortie console pour le scénario storage affiche `tauxAutoconsommationAffichage` et `tauxAutoproductionStockage`

**Verification :**
- [ ] Build : `npm run build`
- [ ] Manuel : exécution complète sur les deux fixtures réelles, comparaison de la sortie console avant/après pour le cas sans-stockage

**Dependencies :** Task 2, Task 3, Task 4, Task 7, Task 8

**Files likely touched :** `src/cli.ts`

**Estimated scope :** M

---

## Checkpoint : Après Task 9
- [ ] `npm test` et `npm run build` passent
- [ ] Exécution bout-en-bout réussie sur les deux fixtures
- [ ] **Revue avec l'utilisateur avant de continuer vers la Phase 7**

---

## Phase 7 : Vérification bout-en-bout et documentation

### Task 10 : Vérification manuelle bout-en-bout
**Description :** Exécuter le CLI sur `test/data/D_26_1223_Intermarche_Rixhiem_3_Omb_avec_stockage_V2.pdf --scenario stockage`, ouvrir le pptx généré et vérifier chaque valeur listée dans la demande initiale (slide 1 : puissance/rangées ; slide 2 : puissance/modules/production/ratio/autoconsommation "+95"/autoproduction "52"/graphique 3 segments). Vérifier par hash que `ppt/slides/slide3.xml` et les médias associés (`image11.png`) sont strictement identiques à l'original dans le fichier de sortie.

**Acceptance criteria :**
- [ ] Toutes les valeurs de slide 1/2 sont correctes visuellement
- [ ] Hash de `ppt/slides/slide3.xml` (sortie) === hash de `ppt/slides/slide3.xml` (template original)
- [ ] Hash de `ppt/media/image11.png` (sortie) === hash de `ppt/media/image11.png` (template original)
- [ ] Mise en forme générale (polices, couleurs, layout) visuellement identique à l'original ailleurs

**Verification :**
- [ ] Manuel : ouverture et inspection visuelle + comparaison de hash

**Dependencies :** Task 9

**Files likely touched :** Aucun (vérification), sortie dans `test/output/` (gitignored)

**Estimated scope :** S

---

### Task 11 : Mise à jour du README
**Description :** Mettre à jour `README.md` : documenter le flag `--scenario` (valeurs, défaut), ajouter un exemple de commande pour le scénario storage avec les fixtures réelles, décrire brièvement les règles "+95" (autoconsommation plafonnée) et taux d'autoproduction combiné (PV + stockage), et préciser que la slide 3 du template storage n'est pas traitée (reste identique à l'original).

**Acceptance criteria :**
- [ ] `README.md` documente les deux scénarios et leurs différences
- [ ] Exemple de commande storage présent et exact (chemins réels des fixtures)

**Verification :**
- [ ] Relecture manuelle

**Dependencies :** Task 9

**Files likely touched :** `README.md`

**Estimated scope :** XS

---

## Checkpoint final
- [ ] Toutes les acceptance criteria de toutes les tâches sont remplies
- [ ] `npm test` et `npm run build` passent, y compris tous les tests existants du scénario sans-stockage (zéro régression)
- [ ] `README.md` mis à jour
- [ ] Prêt pour `/code-review-and-quality`, puis proposition de PR
