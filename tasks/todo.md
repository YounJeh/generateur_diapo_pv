# Todo : Générateur de diapo PV

Voir `tasks/plan.md` pour le contexte, les faits vérifiés sur les fixtures et les décisions d'architecture.

## Phase 0 : Scaffolding

### Task 1 : Initialisation du projet TypeScript
**Description :** Mettre en place la structure de base du projet : `package.json`, `tsconfig.json`, dépendances (`pdfjs-dist`, `canvas`, `sharp`, `adm-zip`, `typescript`, `vitest`, `@types/node`), scripts npm (`build`, `dev`, `test`), dossiers `src/`, `tests/`.

**Acceptance criteria :**
- [ ] `npm install` fonctionne sans erreur (y compris le build natif de `canvas`)
- [ ] `npm run build` compile sans erreur (même avec un `src/index.ts` vide)
- [ ] `npm test` s'exécute (0 test au départ, pas d'échec)

**Verification :**
- [ ] Build : `npm run build`
- [ ] Manuel : vérifier que `node_modules/canvas` a bien buildé son binding natif

**Dependencies :** Aucune

**Files likely touched :** `package.json`, `tsconfig.json`, `.gitignore`

**Estimated scope :** S

---

## Phase 1 : Extraction des valeurs du PDF

### Task 2 : Lecteur PDF simple
**Description :** Wrapper minimal autour de `pdfjs-dist` exposant `getPageTexts(pdfPath: string, pageNumbers: number[]): Promise<string[]>`, qui retourne le texte linéarisé de chaque page demandée (même logique que la vérification faite pendant le planning : concaténation des items de `getTextContent()`).

**Acceptance criteria :**
- [ ] Appelé sur `test/data/Solar_Edge_ITM_Rixhiem_3_omb_V2.pdf` avec `[1, 2]`, retourne bien le texte de la page 1 (contient "750 Modules PV") et de la page 2 (contient "RÉSULTATS DE CONSOMMATION")
- [ ] N'ouvre/ne parse jamais plus que les pages demandées

**Verification :**
- [ ] Tests : test unitaire contre la fixture réelle
- [ ] Build : `npm run build`

**Dependencies :** Task 1

**Files likely touched :** `src/pdf/reader.ts`, `tests/pdf/reader.test.ts`

**Estimated scope :** S

---

### Task 3 : Extracteurs regex par champ
**Description :** Fonctions d'extraction regex pour les 7 valeurs, généralisées (pas hardcodées sur "750"/"77" etc., mais sur le format/structure du texte autour). Une fonction par champ + une fonction `extractFromPdfText(page1Text, page2Text): ExtractedValues` qui les combine. Chaque regex qui ne matche pas lève une erreur explicite nommant le champ concerné.

Champs (avec le texte réel observé comme référence) :
- `nombreModules` — depuis `"750 Modules PV"` (page 1)
- `productionAnnuelleMwh` — depuis `"350,73 MWh"` juste après `"D'énergie Annuelle"` (page 1) — garder la chaîne source avec virgule, la conversion/format est faite ailleurs (Task 6)
- `ratioDePerformance` — depuis `"77 %"` juste après `"Performance"` (page 1) — garder tel quel (peut être un entier ou une décimale selon le PDF)
- `tauxAutoconsommation` — depuis `"Vers le bâtiment ... (71%)"` ou équivalent (page 2)
- `surplusProduction` — depuis `"Vers le réseau ... (29%)"` ou équivalent (page 2)
- `tauxAutoproduction` — depuis `"Depuis le PV ... (38%)"` ou équivalent (page 2)

**Acceptance criteria :**
- [ ] Sur le texte réel des pages 1-2 de la fixture, les 6 valeurs extraites (hors ratio perf qui est 7) correspondent exactement aux valeurs vérifiées : modules=750, production="350,73", ratio="77", autoconsommation=71, surplus=29, autoproduction=38
- [ ] Une regex qui ne matche rien lève une erreur explicite (pas de `undefined`/`NaN` silencieux)
- [ ] Les regex ne sont pas ancrées sur les valeurs numériques elles-mêmes (ex. pas `/750/`) mais sur les libellés/structure environnants, pour rester générales

**Verification :**
- [ ] Tests : `npm test` — un test par champ + un test d'erreur explicite si le libellé attendu est absent
- [ ] Build : `npm run build`

**Dependencies :** Task 2

**Files likely touched :** `src/pdf/extractValues.ts`, `src/types.ts`, `tests/pdf/extractValues.test.ts`

**Estimated scope :** M

---

### Task 4 : Calcul de la puissance installée + assemblage des valeurs
**Description :** `puissanceInstallee(modules: number): number` = `Math.ceil(modules * 470)`. Fonction `buildValues(extracted: ExtractedValues, rangees: number)` qui assemble l'objet final utilisé pour le remplacement pptx (7 valeurs extraites + 1 calculée + rangées fournie manuellement).

**Acceptance criteria :**
- [ ] `puissanceInstallee(750)` = 352500 (750 × 470, déjà un entier ici mais la fonction doit gérer l'arrondi supérieur pour un nombre de modules qui donnerait un résultat non entier si jamais le facteur changeait)
- [ ] L'objet assemblé contient bien les 8 champs + `rangees`

**Verification :**
- [ ] Tests : `npm test`
- [ ] Build : `npm run build`

**Dependencies :** Task 3

**Files likely touched :** `src/calc.ts`, `tests/calc.test.ts`

**Estimated scope :** XS

---

## Checkpoint : Après Tasks 1-4
- [ ] `npm test` passe entièrement
- [ ] `npm run build` sans erreur
- [ ] Extraction bout-en-bout (page 1 + page 2 → objet de valeurs complet) validée contre la fixture réelle
- [ ] **Revue avec l'utilisateur avant de continuer vers la Phase 2**

---

## Phase 2 : Remplacement de texte dans le PPTX

### Task 5 : Utilitaire zip PPTX
**Description :** Wrapper `adm-zip` (`src/pptx/zip.ts`) : `openPptx(path)`, `getEntryText(zip, entryPath)`, `setEntryText(zip, entryPath, newContent)`, `getEntryBuffer`, `setEntryBuffer`, `writePptx(zip, outputPath)`. Ne modifie que les entrées explicitement touchées ; toutes les autres sont réécrites telles quelles.

**Acceptance criteria :**
- [ ] Ouvrir le pptx réel, lire `ppt/slides/slide1.xml` en texte, le réécrire identique, sauvegarder → le fichier de sortie a un hash MD5 identique à l'original pour toutes les entrées non touchées
- [ ] Fonctionne aussi pour lire/écrire une entrée binaire (`ppt/media/image8.png`)

**Verification :**
- [ ] Tests : round-trip read/write/compare hash sur la fixture réelle
- [ ] Build : `npm run build`

**Dependencies :** Task 1

**Files likely touched :** `src/pptx/zip.ts`, `tests/pptx/zip.test.ts`

**Estimated scope :** S

---

### Task 6 : Formatage des valeurs pour insertion
**Description :** `formatProductionKwh(mwhString: string): string` — convertit `"350,73"` (MWh, virgule) en `"350 730"` (kWh, espace comme séparateur de milliers, ×1000). `formatRatioPerformance(raw: string): string` — passthrough du texte source du PDF (pas de reformatage arbitraire), confirmé avec l'utilisateur.

**Acceptance criteria :**
- [ ] `formatProductionKwh("350,73")` === `"350 730"`
- [ ] `formatRatioPerformance("77")` === `"77"` (passthrough, pas de `"77,0"`)

**Verification :**
- [ ] Tests : `npm test`
- [ ] Build : `npm run build`

**Dependencies :** Task 1

**Files likely touched :** `src/pptx/format.ts`, `tests/pptx/format.test.ts`

**Estimated scope :** XS

---

### Task 7 : Table de remplacement slide 1
**Description :** `buildSlide1Replacements(values): Map<string,string>` — 5 correspondances exactes de texte de run complet :
1. `"SCENARIO 1 : Ombrières de 350kWc"` → `"SCENARIO 1 : Ombrières de {puissance}kWc"`
2. `"Ombrières puissance de 350 kWc"` → `"Ombrières puissance de {puissance} kWc"`
3. `"350 kWc"` → `"{puissance} kWc"`
4. `"3 rangées d'ombrières photovoltaïques"` → `"{rangees} rangées d'ombrières photovoltaïques"`
5. `"3 rangées"` → `"{rangees} rangées"`

**Acceptance criteria :**
- [ ] Les 5 clés correspondent exactement aux `<a:t>` réels de `slide1.xml` de la fixture (vérifié pendant le planning)
- [ ] Les valeurs de remplacement utilisent la puissance installée calculée et les rangées fournies

**Verification :**
- [ ] Tests : `npm test`
- [ ] Build : `npm run build`

**Dependencies :** Task 4

**Files likely touched :** `src/pptx/slide1Map.ts`, `tests/pptx/slide1Map.test.ts`

**Estimated scope :** S

---

### Task 8 : Table de remplacement slide 2
**Description :** `buildSlide2Replacements(values): Map<string,string>` — 11 correspondances exactes de texte de run complet (titre, "350 kWc", "744", "347 760 kWh", "77,0 %", autoconsommation ×2, surplus ×2, autoproduction ×2). "52%" n'apparaît PAS dans la map (laissé inchangé intentionnellement — à documenter/logger séparément dans Task 9).

**Acceptance criteria :**
- [ ] Les 11 clés correspondent exactement aux `<a:t>` réels de `slide2.xml` de la fixture
- [ ] "52%" n'est dans aucune clé ni valeur de remplacement

**Verification :**
- [ ] Tests : `npm test`
- [ ] Build : `npm run build`

**Dependencies :** Task 4, Task 6

**Files likely touched :** `src/pptx/slide2Map.ts`, `tests/pptx/slide2Map.test.ts`

**Estimated scope :** M

---

### Task 9 : Moteur de remplacement de texte
**Description :** `replaceRuns(slideXml: string, replacements: Map<string,string>): { xml: string; applied: string[]; missing: string[] }` — pour chaque clé de la map, remplace le contenu exact du `<a:t>` correspondant (uniquement à l'intérieur des balises `<a:t>`, jamais dans des attributs XML). Retourne la liste des remplacements appliqués et ceux non trouvés (erreur si `missing` non vide — signale un changement de template).

**Acceptance criteria :**
- [ ] Appliqué sur le `slide1.xml`/`slide2.xml` réels avec les tables des Tasks 7/8, tous les remplacements sont trouvés et appliqués (`missing` vide)
- [ ] Un texte présent dans un attribut XML (ex. `cx="744992"`) n'est jamais modifié même s'il contient une sous-chaîne clé (ex. "744")
- [ ] Si une clé de la map n'existe pas dans le XML, l'appelant reçoit une erreur explicite listant la clé manquante

**Verification :**
- [ ] Tests : `npm test` — inclut un test de non-régression sur le faux-positif "744" trouvé pendant le planning (dans `cx="744992"`)
- [ ] Build : `npm run build`

**Dependencies :** Task 5, Task 7, Task 8

**Files likely touched :** `src/pptx/replaceText.ts`, `tests/pptx/replaceText.test.ts`

**Estimated scope :** M

---

## Checkpoint : Après Tasks 5-9
- [ ] `npm test` passe entièrement
- [ ] Génération d'un pptx de test à partir de la fixture réelle : relecture des `<a:t>` de slide1/slide2 → toutes les valeurs attendues présentes, "52%" inchangé
- [ ] Toutes les entrées du zip non touchées sont identiques octet pour octet à l'original (comparaison de hash)
- [ ] **Revue avec l'utilisateur avant de continuer vers la Phase 3**

---

## Phase 3 : Remplacement de l'image du graphique

### Task 10 : Détection de la zone du graphique
**Description :** `findChartBounds(page: PDFPageProxy): Promise<{x0,y0,x1,y1}>` — utilise `getTextContent()` sur la page 2, cherche l'item texte-ancre haut (contient "RÉSULTATS DE CONSOMMATION") et l'item texte-ancre bas (contient "Énergie solaire"), calcule une bounding box englobant les deux avec une marge, en largeur pleine page (moins les marges du header/footer déjà identifiés dans le texte : "RAPPORT DU DESIGNER...", adresse, date). Erreur explicite si une ancre est introuvable.

**Acceptance criteria :**
- [ ] Sur la page 2 de la fixture réelle, retourne une bounding box qui englobe visuellement tout le bloc "RÉSULTATS DE CONSOMMATION ET DE PRODUCTION ANNUELLES" (titre + barres + légendes) sans le header de page répété
- [ ] Si le texte-ancre n'est pas trouvé, lève une erreur explicite nommant l'ancre manquante

**Verification :**
- [ ] Tests : `npm test` contre la fixture réelle
- [ ] Manuel : la bbox calculée, une fois croppée et exportée en image (Task 11), montre bien le graphique complet sans coupure

**Dependencies :** Task 2

**Files likely touched :** `src/pdf/chartBounds.ts`, `tests/pdf/chartBounds.test.ts`

**Estimated scope :** M

---

### Task 11 : Rendu et crop du graphique en image
**Description :** `renderChartImage(pdfPath: string, pageNumber: number, bounds): Promise<Buffer>` — rend la page en raster haute résolution via `pdfjs-dist` + `canvas` (scale suffisant pour une bonne netteté, ex. 2-3x), rogne selon `bounds`, exporte en PNG.

**Acceptance criteria :**
- [ ] Sur la fixture réelle, produit un PNG lisible montrant le titre, les deux barres de progression et les légendes de la page 2
- [ ] Le PNG produit n'a pas de bordure/texte de header de page coupé au milieu

**Verification :**
- [ ] Tests : `npm test` (vérifie dimensions/format du buffer produit)
- [ ] Manuel : ouvrir le PNG généré et vérifier visuellement le contenu

**Dependencies :** Task 10

**Files likely touched :** `src/pdf/renderChart.ts`, `tests/pdf/renderChart.test.ts`

**Estimated scope :** M

---

### Task 12 : Remplacement de l'image dans le pptx
**Description :** `replaceChartImage(zip, newImageBuffer)` — remplace les octets de `ppt/media/image8.png` par `newImageBuffer`, et modifie `ppt/slides/slide2.xml` pour remettre `<a:srcRect b="0" l="0" r="0" t="0"/>` (ou supprimer l'élément `<a:srcRect>`) sur le `<p:pic>` concerné, sans toucher à `<a:off>`/`<a:ext>`.

**Acceptance criteria :**
- [ ] Le pptx de sortie contient le nouveau PNG à la place de `image8.png`
- [ ] `<a:off>`/`<a:ext>` du `<p:pic>` sont identiques à l'original (position/taille du cadre inchangées)
- [ ] `<a:srcRect>` ne rogne plus l'image (0 sur les 4 côtés, ou absent)

**Verification :**
- [ ] Tests : `npm test`
- [ ] Manuel : ouvrir le pptx généré (PowerPoint/LibreOffice/Google Slides) et vérifier que le graphique s'affiche correctement cadré, sans déformation excessive ni coupure

**Dependencies :** Task 9, Task 11

**Files likely touched :** `src/pptx/replaceImage.ts`, `tests/pptx/replaceImage.test.ts`

**Estimated scope :** M

---

## Checkpoint : Après Tasks 10-12
- [ ] `npm test` passe entièrement
- [ ] Le pptx généré contient la bonne image, correctement cadrée
- [ ] **Revue avec l'utilisateur avant de continuer vers la Phase 4**

---

## Phase 4 : CLI et bout-en-bout

### Task 13 : CLI
**Description :** `src/cli.ts` — point d'entrée orchestrant : lecture PDF (Task 2) → extraction (Task 3) → calcul (Task 4) → ouverture pptx template (Task 5) → remplacement texte slides 1/2 (Tasks 7-9) → remplacement image (Tasks 10-12) → écriture du fichier de sortie. Arguments : `--pdf <path>` (obligatoire), `--rangees <n>` (obligatoire), `--output <path>` (optionnel, défaut basé sur le nom du PDF dans un dossier `output/`). Affiche en sortie console : les valeurs extraites/calculées, la liste des remplacements appliqués, et un avertissement explicite pour "52%" resté inchangé.

**Acceptance criteria :**
- [ ] `node dist/cli.js --pdf test/data/Solar_Edge_ITM_Rixhiem_3_omb_V2.pdf --rangees 3` produit un fichier pptx de sortie sans erreur
- [ ] Arguments manquants → message d'erreur clair (pas de stack trace brute)
- [ ] La sortie console liste les valeurs extraites et signale explicitement que "52%" n'a pas été modifié

**Verification :**
- [ ] Build : `npm run build`
- [ ] Manuel : exécution complète contre la fixture réelle

**Dependencies :** Task 4, Task 9, Task 12

**Files likely touched :** `src/cli.ts`, `package.json` (bin/script)

**Estimated scope :** M

---

### Task 14 : Vérification bout-en-bout
**Description :** Exécuter le CLI sur les fixtures réelles, ouvrir le pptx généré (PowerPoint/LibreOffice/Google Slides) et vérifier manuellement chaque valeur listée dans la demande initiale, ainsi que la mise en forme générale (comparaison visuelle avec l'original).

**Acceptance criteria :**
- [ ] Slide 1 : puissance installée et nombre de rangées corrects partout (y compris le titre)
- [ ] Slide 2 : puissance, modules, production, ratio de performance, autoconsommation, surplus, autoproduction corrects partout (y compris le titre) ; "52%" inchangé
- [ ] Image du graphique slide 2 correspond aux données de la page 2 du PDF, correctement cadrée
- [ ] Mise en forme (polices, couleurs, tailles, layout) visuellement identique à l'original partout ailleurs

**Verification :**
- [ ] Manuel : ouverture et inspection visuelle du fichier généré

**Dependencies :** Task 13

**Files likely touched :** Aucun (vérification), sortie dans `test/output/` (gitignored)

**Estimated scope :** S

---

## Checkpoint final
- [ ] Toutes les acceptance criteria de toutes les tâches sont remplies
- [ ] `npm test` et `npm run build` passent
- [ ] `README.md` mis à jour avec les instructions d'usage du CLI
- [ ] Prêt pour `/code-review-and-quality`, puis proposition de PR
