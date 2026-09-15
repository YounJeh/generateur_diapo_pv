# Implementation Plan: Scénario "avec stockage" (extension du générateur diapo PV)

## Overview

Étendre l'outil CLI existant (qui génère déjà le pptx du scénario "sans stockage" en production) pour supporter un second scénario, "avec stockage" : nouveau template pptx (3 slides), nouveau PDF SolarEdge source, deux valeurs calculées spécifiques (taux d'autoconsommation plafonné à "+95", taux d'autoproduction combiné PV+stockage), et un graphique annuel à 3 segments par barre au lieu de 2. Sélection du scénario via un nouveau flag CLI `--scenario`. Le scénario "sans stockage" existant doit continuer à fonctionner sans aucune régression (aucun test existant ne doit changer de comportement).

Confirmé via `/interview-me` (voir résumé ci-dessous) puis vérifié par inspection directe des fixtures réelles (`test/data/scenario 1 avec stockage Projet_Ombriere_Rixhiem.pptx`, `test/data/D_26_1223_Intermarche_Rixhiem_3_Omb_avec_stockage_V2.pdf`).

## Décisions confirmées avec l'utilisateur (via /interview-me)

- **Slide 3 du template storage ("ÉNERGIE MENSUELLE ESTIMÉE") : hors périmètre, non traitée du tout.** Elle reste dans le pptx de sortie strictement identique à l'original (comme n'importe quelle partie non touchée).
- **Slide 1 : traitement identique à l'existant**, `buildSlide1Replacements` est réutilisé tel quel (mêmes textes de run "SCENARIO 1 : Ombrières de 350kWc" etc., mêmes valeurs `puissanceInstallee`/`rangees`).
- **Taux d'autoconsommation (storage)** = `%vers-bâtiment + %vers-stockage`. Si le résultat est **≥ 95** (couvre aussi un éventuel dépassement de 100 par arrondi), affichage figé `"+95"` au lieu du nombre exact. Sinon, affichage du nombre exact tel quel. *(Attention : c'est l'inverse de la formulation initiale de la demande utilisateur — confirmé explicitement pendant l'interview.)*
- **Taux d'autoproduction (storage)** = `%depuis-PV + %depuis-stockage` (ex. 38+14=52). Toujours affiché tel quel, **pas** de plafond "+95" pour celui-ci.
- **Graphique annuel (slide 2)** : étendre `annualResultsChart.ts` pour accepter 2 **ou** 3 segments par barre, même style visuel (couleurs, barres empilées, longueur proportionnelle au MWh). **Ne pas** réintroduire le pipeline "screenshot/crop PDF" retiré précédemment (commit "Remove the unused PDF-crop chart pipeline").
- **Sélection du scénario** : nouveau flag CLI `--scenario` (`sans-stockage` par défaut = comportement actuel inchangé, ou `stockage`).

## Faits vérifiés sur les fixtures réelles "avec stockage"

- Template pptx (`scenario 1 avec stockage Projet_Ombriere_Rixhiem.pptx`) : **3 slides** (`slide1.xml`, `slide2.xml`, `slide3.xml`). Slide 3 = "ÉNERGIE MENSUELLE ESTIMÉE" (hors périmètre).
- PDF (`D_26_1223_Intermarche_Rixhiem_3_Omb_avec_stockage_V2.pdf`) fait **8 pages** ; seules les pages 1-2 sont utilisées (page 3 = graphique mensuel, hors périmètre).
- Page 1 (texte réel) : `744 Modules PV`, `343,74 MWh` (Production D'énergie Annuelle), `76 %` (Ratio De Performance, entier). **Mêmes libellés/structure que le PDF sans-stockage** → les regex existantes (`extractNombreModules`, `extractProductionAnnuelleMwh`, `extractRatioDePerformance`) sont réutilisables telles quelles, aucune modification requise.
- Page 2 (texte réel) : `Production 344,98 MWh` / `Vers le bâtiment 247,42 MWh (72%)` / `Vers le stockage 93,88 MWh (27%)` / `Vers le réseau 3,20 MWh (1%)` ; `Consommation 658,15 MWh` / `Depuis le PV 247,42 MWh (38%)` / `Depuis le stockage 91,64 MWh (14%)` / `du réseau 316,11 MWh (48%)` ; ligne récapitulative `"52% Énergie provenant de panneaux solaires avec stockage"` (cohérente avec 38+14=52, non utilisée comme source d'extraction — on garde la méthode par sommation des valeurs itemisées, cohérente avec le style existant).
  - Les libellés "Vers le bâtiment", "Vers le réseau", "Depuis le PV", "du réseau" ont la **même structure** que le PDF sans-stockage → `extractTauxAutoconsommation`, `extractSurplusProduction`, `extractTauxAutoproduction`, `extractVersBatimentMwh`, `extractVersReseauMwh`, `extractDepuisPvMwh`, `extractDuReseauMwh`, `extractProductionTotaleMwh`, `extractConsommationTotaleMwh` sont **tous réutilisables tels quels**.
  - Seuls 4 champs sont réellement nouveaux : `versStockageMwh`, `versStockagePct`, `depuisStockageMwh`, `depuisStockagePct` (labels "Vers le stockage" / "Depuis le stockage", non ambigus avec les labels existants).
- Textes de run réels de `slide2.xml` (storage, vérifiés par dézippage) à faire correspondre exactement dans la nouvelle table de remplacement :
  - `"Étude de production – Ombrières 350 kWc avec stockage "` (titre)
  - `"350 kWc"` (occurrences multiples, hors titre)
  - `"744"` (nombre de modules)
  - `"347 760 kWh"` (production)
  - `"77,0 %"` (ratio de performance)
  - `"Taux d’autoconsommation : +95%"` (**sans espace** avant `%`, apostrophe typographique `’`)
  - `"+95 % de la production de votre centrale photovoltaïque"` (**avec espace**, run qui suit `"Vous consommez directement "`)
  - `"Taux d’autoproduction : 52%"` (sans espace)
  - `"52 % de vos besoins en électricité"` (avec espace, run qui suit `"Vos ombrières photovoltaïques couvrent "`)
  - **Aucun run "surplus"** dans ce template (contrairement au sans-stockage) — ne rien chercher à ce sujet, 9 correspondances au total (vs 11 pour le sans-stockage).
- Image du graphique slide 2 (storage) : `ppt/media/image5.png`, référencée via `rId3` dans `slide2.xml.rels` (au lieu de `image8.png`/`rId3` en sans-stockage — même `rId` mais fichier différent puisque ce sont deux pptx distincts).
- **`<a:srcRect>` du placeholder image slide 2 storage est déjà `b="0" l="0" r="0" t="0"`** (contrairement au sans-stockage où l'original était rogné `b="14310" l="0" r="5625" t="0"`) — remettre à 0 reste correct et idempotent, pas de risque de régression en réutilisant `replaceChartImage`.
- **Cadre image (`<a:off>`/`<a:ext>`) différent entre les deux templates** : storage `off x="685800" y="2597086"`, `ext cx="10820400" cy="2493845"` (ratio ≈ 4,339) vs sans-stockage `ext cx="10718018" cy="2219711"` (ratio ≈ 4,828). **`annualResultsChart.ts` doit donc accepter un ratio de cadre paramétrable** (actuellement une constante `FRAME_RATIO` figée sur le cas sans-stockage) — sinon l'image générée pour le storage sera visuellement étirée/déformée une fois insérée.
- `dist/` contient des artefacts de build obsolètes (`chartBounds.js`, `renderChart.js`) issus d'un pipeline "screenshot PDF" **explicitement retiré** du code source (commit `b2d733a`, dossier gitignored) — ne pas s'y référer, ne pas les reconstruire.
- `test/` et `CLAUDE.md` sont **untracked** sur `main` (fichiers locaux, probablement volontairement non commités — données clients réelles). Ne pas forcer leur ajout au dépôt sans demande explicite.

## Architecture Decisions

- **Réutilisation maximale de l'existant** : `buildSlide1Replacements`, toutes les fonctions d'extraction page 1/2 déjà écrites, `replaceRuns`, `zip.ts` sont réutilisés **tels quels**, sans modification, pour éviter toute régression sur le scénario sans-stockage.
- **Nouveaux fichiers plutôt que branches conditionnelles internes** pour tout ce qui diffère structurellement : `src/pptx/slide2MapStorage.ts` (nouvelle table de remplacement, 9 correspondances) plutôt que d'ajouter un paramètre `scenario` dans `slide2Map.ts` — garde chaque fichier simple et testable isolément, cohérent avec le style actuel (un fichier = une responsabilité).
- **`annualResultsChart.ts` refactorisé en interne** : extraction d'une fonction de rendu générique acceptant un nombre variable de segments par ligne (`Segment[]` au lieu du tuple fixe `[Segment, Segment]`) et un `frameRatio` paramétrable. Les deux exports publics existant/nouveau (`renderAnnualResultsChart` pour 2 segments, `renderAnnualResultsChartStorage` pour 3 segments) construisent chacun leurs `Row[]` puis appellent le même moteur de dessin interne. **Signature et comportement de `renderAnnualResultsChart` inchangés** (ratio par défaut = constante actuelle) → zéro régression sur les tests existants.
- **Nouvelle couleur pour le segment "stockage"** (2 nouvelles couleurs en réalité : une pour "Vers le stockage" côté Production, une pour "Depuis le stockage" côté Consommation) : à déterminer en échantillonnant les couleurs réelles du graphique vectoriel du PDF storage (page 2), en suivant la même méthodologie que celle déjà appliquée aux couleurs bâtiment/réseau/PV/réseau existantes (cf. commit "Match chart text color to the PDF's actual fill color per item"). Décision reportée à la tâche dédiée (Task 8) plutôt que devinée ici.
- **`replaceImage.ts` généralisé par un paramètre optionnel** `imageEntry` (défaut = constante actuelle `ppt/media/image8.png`) plutôt qu'une nouvelle fonction dupliquée — la logique (reset `srcRect`, remplacement des octets) est strictement identique entre les deux scénarios, seul le chemin de l'entrée zip change.
- **CLI** : ajout d'un flag `--scenario` (`sans-stockage` par défaut ou `stockage`), qui sélectionne : le template pptx, la fonction d'extraction (`extractFromPdfText` vs `extractFromPdfTextStorage`), la fonction de calcul (`buildValues` vs `buildStorageValues`), la table de remplacement slide 2, la fonction de rendu du graphique, et l'entrée image à remplacer. Un `switch`/table de dispatch simple, pas de framework/plugin.
- **Types** : `StorageExtractedValues extends ExtractedValues` (+ 4 champs stockage bruts) et `StorageSlideValues extends StorageExtractedValues` (+ `puissanceInstallee`, `rangees`, + 2 champs calculés `tauxAutoconsommationAffichage: string` et `tauxAutoproductionStockage: number`). `ExtractedValues`/`SlideValues` existants **non modifiés**.
- **Tests** : mêmes conventions que l'existant — un fichier de test miroir par nouveau module, contre les fixtures réelles (`test/data/...avec stockage...`), pas de mocks. Les tests existants (sans-stockage) doivent continuer à passer sans modification.

## Task List

### Phase 1 : Extraction augmentée (types + regex)

- [x] **Task 1** : Types storage (`src/types.ts`) — ajouter `StorageExtractedValues` (extends `ExtractedValues` + `versStockageMwh: string`, `versStockagePct: number`, `depuisStockageMwh: string`, `depuisStockagePct: number`) et `StorageSlideValues` (extends `StorageExtractedValues` + `puissanceInstallee: number`, `rangees: number`, `tauxAutoconsommationAffichage: string`, `tauxAutoproductionStockage: number`). `ExtractedValues`/`SlideValues` inchangés.
- [x] **Task 2** : Nouveaux extracteurs regex (`src/pdf/extractValues.ts`) — `extractVersStockageMwh`, `extractVersStockagePct`, `extractDepuisStockageMwh`, `extractDepuisStockagePct` (même style fail-fast que l'existant), + `extractFromPdfTextStorage(page1Text, page2Text): StorageExtractedValues` qui combine `extractFromPdfText(...)` (réutilisé tel quel) avec les 4 nouveaux champs.

**Acceptance criteria (Phase 1) :**
- [x] Sur le texte réel des pages 1-2 de `D_26_1223_Intermarche_Rixhiem_3_Omb_avec_stockage_V2.pdf` : `versStockageMwh="93,88"`, `versStockagePct=27`, `depuisStockageMwh="91,64"`, `depuisStockagePct=14` (+ les champs hérités : modules=744, production="343,74", ratio="76", tauxAutoconsommation=72, surplusProduction=1, tauxAutoproduction=38, productionTotaleMwh="344,98", consommationTotaleMwh="658,15", versBatimentMwh="247,42", versReseauMwh="3,20", depuisPvMwh="247,42", duReseauMwh="316,11")
- [x] Une regex qui ne matche rien lève une erreur explicite nommant le champ
- [x] Aucune régression sur `extractFromPdfText` existant (tests sans-stockage inchangés)

**Verification :**
- [x] Tests : `npm test` (nouveau `tests/pdf/extractValues.storage.test.ts` + tests existants toujours verts)
- [x] Build : `npm run build`

**Dependencies :** Aucune

**Files likely touched :** `src/types.ts`, `src/pdf/extractValues.ts`, `tests/pdf/extractValues.storage.test.ts`

**Estimated scope :** M

---

### Checkpoint 1 : Extraction
- [x] `npm test` passe entièrement (existants + nouveaux)
- [x] Les 4 nouvelles valeurs + les valeurs héritées correspondent exactement aux valeurs vérifiées ci-dessus
- [x] Revue avec l'utilisateur avant de continuer

---

### Phase 2 : Calcul des valeurs dérivées

- [x] **Task 3** : Fonctions de calcul storage (`src/calc.ts`) — `tauxAutoconsommationAffichage(tauxAutoconsommation: number, versStockagePct: number): string` (total = somme ; si `total >= 95`, retourne `"+95"` ; sinon `String(total)`) ; `tauxAutoproductionStockage(tauxAutoproduction: number, depuisStockagePct: number): number` (somme simple) ; `buildStorageValues(extracted: StorageExtractedValues, rangees: number): StorageSlideValues` (assemble `puissanceInstallee` via la fonction existante `puissanceInstallee()` réutilisée telle quelle + les 2 valeurs dérivées ci-dessus).

**Acceptance criteria :**
- [x] `tauxAutoconsommationAffichage(72, 27)` === `"+95"` (99 ≥ 95)
- [x] `tauxAutoconsommationAffichage(50, 30)` === `"80"` (80 < 95, cas limite à couvrir même s'il n'apparaît pas dans la fixture actuelle)
- [x] `tauxAutoconsommationAffichage(60, 40)` === `"+95"` (100, cas de dépassement par arrondi)
- [x] `tauxAutoproductionStockage(38, 14)` === `52`
- [x] `buildStorageValues(...)` sur les valeurs extraites de la fixture réelle produit `puissanceInstallee=350` (744×470/1000=349,68→ceil=350), `tauxAutoconsommationAffichage="+95"`, `tauxAutoproductionStockage=52`
- [x] Aucune régression sur `puissanceInstallee`/`buildValues` existants

**Verification :**
- [x] Tests : `npm test` (nouveau `tests/calc.storage.test.ts`)
- [x] Build : `npm run build`

**Dependencies :** Task 1, Task 2

**Files likely touched :** `src/calc.ts`, `tests/calc.storage.test.ts`

**Estimated scope :** S

---

### Phase 3 : Table de remplacement texte slide 2 (storage)

- [x] **Task 4** : `src/pptx/slide2MapStorage.ts` — `buildSlide2ReplacementsStorage(values: StorageSlideValues): Map<string,string>`, 9 correspondances exactes de run listées dans "Faits vérifiés" ci-dessus (titre avec puissance, "350 kWc", "744", "347 760 kWh", "77,0 %", "Taux d'autoconsommation : +95%" → utilise `tauxAutoconsommationAffichage` tel quel comme valeur insérée sans `+` additionnel si non plafonné, "+95 % de la production..." idem, "Taux d'autoproduction : 52%" → `tauxAutoproductionStockage`, "52 % de vos besoins...").

**Acceptance criteria :**
- [x] Les 9 clés correspondent exactement (apostrophe `’`, espaces) aux `<a:t>` réels de `slide2.xml` du template storage (vérifié par un test qui dézippe la fixture réelle, comme `tests/pptx/slide2Map.test.ts` existant)
- [x] Avec les valeurs de la fixture réelle (`tauxAutoconsommationAffichage="+95"`, `tauxAutoproductionStockage=52`), la map produit `"Taux d’autoconsommation : +95%"` (identique au défaut, cas plafonné) et `"Taux d’autoproduction : 52%"`
- [x] Avec une valeur `tauxAutoconsommationAffichage="80"` (cas non plafonné, test synthétique), la map produit `"Taux d’autoconsommation : 80%"` (pas de `+`)
- [x] Aucun texte "surplus" recherché ou produit (n'existe pas dans ce template)

**Verification :**
- [x] Tests : `npm test` (nouveau `tests/pptx/slide2MapStorage.test.ts`, même style que `slide2Map.test.ts`)
- [x] Build : `npm run build`

**Dependencies :** Task 3

**Files likely touched :** `src/pptx/slide2MapStorage.ts`, `tests/pptx/slide2MapStorage.test.ts`

**Estimated scope :** M

---

### Checkpoint 2 : Textes
- [x] `npm test` passe entièrement
- [x] Génération d'un remplacement de test sur `slide1.xml`/`slide2.xml` du template storage réel (via `replaceRuns` existant + les deux maps) : tous les remplacements trouvés, aucun `missing`
- [x] Revue avec l'utilisateur avant de continuer

---

### Phase 4 : Graphique annuel à 3 segments

- [x] **Task 5** : Refactor interne de `src/chart/annualResultsChart.ts` — remplacer le tuple `segments: [Segment, Segment]` par `segments: Segment[]` dans `Row`, extraire le rendu (boucle segments empilés + légende) dans une fonction interne générique acceptant `rows: [Row, Row]` et un `frameRatio: number` paramétrable (au lieu de la constante `FRAME_RATIO` figée). `renderAnnualResultsChart` (export existant) construit ses 2 lignes à 2 segments comme aujourd'hui et appelle le moteur générique avec le ratio sans-stockage par défaut — **signature et comportement inchangés**.
- [x] **Task 6** : Échantillonnage des couleurs réelles du graphique storage — inspecter le contenu vectoriel de la page 2 du PDF storage (via `pdfjs-dist`, operator list, même méthode que le commit "Match chart text color...") pour déterminer les couleurs "Vers le stockage" et "Depuis le stockage". Documenter les valeurs hex trouvées en commentaire (comme `PROD_GREEN` etc. existants).
- [x] **Task 7** : `renderAnnualResultsChartStorage(values: StorageAnnualResultsChartValues, frameRatio?: number): Buffer` (nouvel export dans `annualResultsChart.ts`) — construit 2 lignes à 3 segments (Production : bâtiment/stockage/réseau ; Consommation : PV/stockage/réseau) avec les couleurs de Task 6, appelle le même moteur générique de Task 5, ratio par défaut = celui du cadre storage (10820400/2493845).

**Acceptance criteria :**
- [x] `renderAnnualResultsChart(VALUES)` (2 segments, existant) produit un PNG strictement visuellement équivalent à avant (test existant `tests/chart/annualResultsChart.test.ts` passe sans modification)
- [x] `renderAnnualResultsChartStorage(values)` produit un PNG dont le ratio largeur/hauteur correspond au cadre storage (≈4,339), avec 3 segments visibles par barre, longueur totale des barres toujours proportionnelle au MWh (Consommation ≈ 658/345 ≈ 1,9× Production)
- [x] Les 3 segments de chaque barre utilisent des couleurs visuellement distinctes (test de présence de ≥3 couleurs de remplissage distinctes sur chaque ligne, en plus du fond)

**Verification :**
- [x] Tests : `npm test` (existant `tests/chart/annualResultsChart.test.ts` inchangé et vert + nouveau `tests/chart/annualResultsChartStorage.test.ts`)
- [x] Build : `npm run build`
- [x] Manuel : ouvrir le PNG généré pour le cas storage et vérifier visuellement les 3 segments + légende

**Dependencies :** Task 3 (pour les types de valeurs d'entrée)

**Files likely touched :** `src/chart/annualResultsChart.ts`, `tests/chart/annualResultsChart.test.ts` (vérifier non-régression, pas de modif sauf si nécessaire), `tests/chart/annualResultsChartStorage.test.ts`

**Estimated scope :** L — *si ça dépasse une session, scinder Task 5 (refactor generique) de Task 7 (nouvel export storage) en deux tours de revue séparés ; Task 6 (couleurs) peut se faire en parallèle de Task 5.*

---

### Checkpoint 3 : Graphique
- [x] `npm test` passe entièrement, y compris le test de non-régression du graphique sans-stockage
- [x] PNG storage vérifié visuellement (3 segments, bon ratio, bonnes couleurs)
- [x] Revue avec l'utilisateur avant de continuer

---

### Phase 5 : Remplacement d'image générique

- [x] **Task 8** : Généraliser `src/pptx/replaceImage.ts` — ajouter un paramètre optionnel `imageEntry: string` à `replaceChartImage(zip, newImageBuffer, imageEntry = "ppt/media/image8.png")`. Comportement (reset `srcRect` à 0, remplacement des octets) inchangé. Aucune modification de la signature d'appel existante (paramètre optionnel avec défaut = comportement actuel).

**Acceptance criteria :**
- [x] Appel sans 3ᵉ argument (existant) : comportement strictement identique, test existant `tests/pptx/replaceImage.test.ts` inchangé et vert
- [x] Appel avec `imageEntry="ppt/media/image5.png"` sur le template storage réel : l'image `image5.png` est remplacée, `srcRect` reste `b="0" l="0" r="0" t="0"` (déjà le cas), `<a:off>`/`<a:ext>` inchangés, toutes les autres entrées du zip identiques octet pour octet

**Verification :**
- [x] Tests : `npm test` (existant inchangé + nouveau cas storage dans `tests/pptx/replaceImage.test.ts` ou fichier dédié)
- [x] Build : `npm run build`

**Dependencies :** Aucune (indépendant, peut être fait en parallèle des phases 1-4)

**Files likely touched :** `src/pptx/replaceImage.ts`, `tests/pptx/replaceImage.test.ts`

**Estimated scope :** S

---

### Phase 6 : CLI et orchestration bout-en-bout

- [x] **Task 9** : `src/cli.ts` — ajouter le flag `--scenario` (valeurs autorisées : `sans-stockage` [défaut], `stockage` ; erreur explicite si autre valeur), une table de dispatch par scénario (template pptx, fonction d'extraction, fonction de calcul, table de remplacement slide 2, fonction de rendu du graphique, entrée image), orchestration identique à l'existant sinon (slide 1 toujours via `buildSlide1Replacements`, réutilisé pour les deux scénarios).

**Acceptance criteria :**
- [x] `node dist/cli.js --pdf <pdf sans-stockage> --rangees 3` (sans `--scenario`, ou `--scenario sans-stockage`) : comportement strictement identique à avant (non-régression)
- [x] `node dist/cli.js --pdf test/data/D_26_1223_Intermarche_Rixhiem_3_Omb_avec_stockage_V2.pdf --rangees <n> --scenario stockage` produit un pptx sans erreur
- [x] `--scenario` avec une valeur invalide → message d'erreur clair listant les valeurs autorisées
- [x] La sortie console liste les valeurs extraites/calculées pour le scénario actif (y compris `tauxAutoconsommationAffichage` et `tauxAutoproductionStockage` pour le storage)

**Verification :**
- [x] Build : `npm run build`
- [x] Manuel : exécution complète sur les deux fixtures réelles

**Dependencies :** Task 2, Task 3, Task 4, Task 7, Task 8

**Files likely touched :** `src/cli.ts`

**Estimated scope :** M

---

### Phase 7 : Vérification bout-en-bout et documentation

- [x] **Task 10** : Exécution bout-en-bout sur la fixture storage réelle, ouverture du pptx généré (PowerPoint/LibreOffice/Google Slides), vérification manuelle de chaque valeur (slide 1 : puissance/rangées ; slide 2 : puissance, modules, production, ratio, autoconsommation "+95", autoproduction "52", graphique 3 segments), et confirmation que **la slide 3 est strictement identique à l'originale** (hash de l'entrée `ppt/slides/slide3.xml` et de `ppt/media/image11.png` inchangés).
- [x] **Task 11** : Mise à jour de `README.md` (nouveau flag `--scenario`, exemple de commande pour le scénario storage, description des valeurs "+95"/combinées).

**Acceptance criteria :**
- [x] Toutes les valeurs listées dans la demande initiale sont correctement remplacées dans le pptx généré storage
- [x] `ppt/slides/slide3.xml` et tous les médias de la slide 3 sont identiques octet pour octet à l'original dans le fichier de sortie
- [x] Mise en forme (polices, couleurs, layout) visuellement identique à l'original partout ailleurs
- [x] `README.md` documente les deux scénarios

**Verification :**
- [x] Manuel : ouverture et inspection visuelle + comparaison de hash pour slide3/image11
- [x] `npm test` et `npm run build` passent

**Dependencies :** Task 9

**Files likely touched :** `README.md`, aucun fichier source (vérification), sortie dans `test/output/` (gitignored)

**Estimated scope :** S

---

### Checkpoint final
- [x] Toutes les acceptance criteria de toutes les tâches sont remplies
- [x] `npm test` et `npm run build` passent, y compris tous les tests existants du scénario sans-stockage (zéro régression)
- [x] `README.md` mis à jour
- [x] Prêt pour `/code-review-and-quality`, puis proposition de PR (selon les instructions du projet)

## Risks and Mitigations

| Risque | Impact | Mitigation |
|---|---|---|
| Inversion de la règle "+95" mal comprise (le sens a été explicitement inversé pendant l'interview par rapport à la demande initiale) | Élevé | Règle reformulée et confirmée explicitement avec l'utilisateur ; tests unitaires couvrant les 3 cas (plafonné, non plafonné, dépassement par arrondi) |
| Refactor de `annualResultsChart.ts` (Task 5) casse le rendu 2-segments existant | Moyen | Test existant `tests/chart/annualResultsChart.test.ts` non modifié doit rester vert tel quel après le refactor ; signature publique inchangée |
| Couleurs "stockage" mal choisies (pas d'ancrage sur les couleurs réelles du PDF) | Faible-Moyen | Task 6 dédiée à l'échantillonnage des couleurs réelles avant de coder le rendu, même méthode que les couleurs existantes |
| Ratio de cadre image différent entre les deux templates non pris en compte → image storage étirée | Moyen | Identifié explicitement dans les faits vérifiés ; `frameRatio` paramétrable dès le refactor (Task 5), valeur storage fixée en Task 7 |
| Régression sur le scénario sans-stockage (déjà en production) pendant les modifications de fichiers partagés (`annualResultsChart.ts`, `replaceImage.ts`, `cli.ts`) | Élevé | Aucun test existant modifié sauf si strictement nécessaire ; tous les paramètres nouveaux sont optionnels avec défaut = comportement actuel ; `npm test` complet à chaque checkpoint |
| `test/` étant untracked sur git, un `git add -A` accidentel pourrait committer des données clients réelles | Moyen | Ajouts git explicites fichier par fichier (jamais `-A`/`.`), vérification `git status` avant chaque commit |

## Open Questions

- Aucune à ce stade — tous les points bloquants ont été levés avec l'utilisateur via `/interview-me` (règle "+95" inversée et confirmée, formule autoproduction confirmée, slide 3 hors périmètre, extension du renderer canvas plutôt que crop PDF, flag `--scenario`).
