# Implementation Plan : Interface web locale "PV Studio"

## Overview

Ajouter une interface web locale (frontend Vite+React + backend Express) par-dessus le générateur pptx existant, pour piloter les 3 scénarios (sans-stockage, avec-stockage, comparaison à N groupes) depuis un navigateur au lieu de la CLI. Les templates pptx ne sont plus fournis par l'utilisateur : ils restent ceux déjà présents dans `assets/templates/`, sélectionnés automatiquement selon le scénario (comme le fait déjà `TEMPLATE_PPTX` dans `src/cli.ts`). Après génération, le pptx est converti en images de slides (LibreOffice headless) pour un aperçu fidèle dans le navigateur, avant téléchargement.

Confirmé via `/interview-me` (voir résumé ci-dessous).

## Décisions confirmées avec l'utilisateur (via /interview-me)

- **Aperçu = rendu fidèle des slides réelles** (images), pas un résumé texte des données — via LibreOffice headless (`libreoffice-impress`), avec un process `soffice` persistant pour éviter le coût de démarrage à froid (2-5s) sur les conversions suivantes (~200-500ms).
- **Comparaison = N groupes dynamiques**, pas limité à 2 PDF comme dans la maquette d'origine — mapping direct de ce que la CLI sait déjà faire (`--groupe-N-*`).
- **Stack** : React via Vite pour le frontend (état non trivial : stepper, groupes dynamiques, upload multi-fichiers, statut génération/aperçu).
- **Usage strictement local**, un seul utilisateur, pas d'authentification, pas de déploiement.
- **Templates non uploadables** : la notion "Mes modèles" de la maquette d'origine est supprimée, hors scope.

## Faits vérifiés sur le code existant

- Le projet est actuellement 100% CLI (`src/cli.ts`), aucune brique web. Build via `tsc` (tsconfig `rootDir: src`, `outDir: dist`, `module/moduleResolution: NodeNext`). Tests Vitest contre fixtures réelles (`test/data/`, non commité — probablement des données clients).
- `src/cli.ts` contient toute la logique d'orchestration dans des fonctions module-level (`runSansStockage`, `runStockage`, `runComparaison`, `run`) qui mélangent extraction, calcul, application au template pptx, **et** `console.log` d'affichage — à séparer pour être réutilisable par un serveur HTTP.
- Modules métier réutilisables tels quels (aucune modification requise) : `buildValues`/`buildStorageValues` (`calc.ts`), `extractFromPdfText(Storage)` (`pdf/extractValues.ts`), `getPageTexts`/`openPdfPage` (`pdf/reader.ts`, `pdf/document.ts`), `renderAnnualResultsChart(Storage)` (`chart/annualResultsChart.ts`), `openPptx`/`writePptx`/`getEntryText`/`setEntryText` (`pptx/zip.ts`), `replaceRuns` (`pptx/replaceText.ts`), `buildSlide1Replacements`/`buildSlide2Replacements(Storage)`/`buildSlide3ReplacementsStorage` (`pptx/slide*Map*.ts`), `replaceChartImage`/`replaceMonthlyChartImage` (`pptx/replaceImage.ts`), `appendSlides` (`pptx/mergeSlides.ts`), `checkDimensioningConsistency` (`dimensioningCheck.ts`), `findMonthlyEnergyChartBounds`/`renderChartImage` (pipeline slide 3 storage).
- LibreOffice n'est pas installé sur cette machine/devcontainer (`.devcontainer/devcontainer.json`, image `mcr.microsoft.com/devcontainers/typescript-node:1-22-bookworm`). `sudo`/`apt` sont disponibles dans le worktree courant.
- Le canvas natif (`canvas` npm) est déjà une dépendance système du projet (rendu des graphiques) — installer une dépendance système supplémentaire (LibreOffice) est cohérent avec l'existant.
- `.gitignore` ignore déjà `dist/`, `output/`, `test/output/` — même logique à appliquer aux nouveaux dossiers générés (`runtime/`, `web/dist/`, `web/node_modules/`).
- Convention du dépôt : `tasks/plan.md`/`tasks/todo.md` documentent la fonctionnalité **en cours**, remplacés (pas cumulés) à chaque nouvelle fonctionnalité planifiée — l'historique reste accessible via `git log`.

## Architecture Decisions

- **Séparation extraction / rendu dans un nouveau module `src/generate/`** : `extract.ts` (lit le PDF, calcule les valeurs, **aucune écriture pptx**), `render.ts` (prend des valeurs déjà calculées + applique au template pptx en mémoire), `comparaison.ts` (orchestration N-groupes au-dessus des deux). Cette séparation est nécessaire pour l'étape "Vérifier les données" de l'UI (afficher les valeurs extraites avant de générer le pptx) — le CLI actuel fait les deux d'un coup, sans point d'arrêt intermédiaire.
- **`src/cli.ts` devient un thin wrapper** sur `src/generate/*` : parsing d'arguments + appel des fonctions extraites + `console.log` des valeurs retournées + écriture disque. Comportement et sortie strictement inchangés (non-régression vérifiée par diff binaire des pptx générés sur les fixtures réelles, avant/après refactor).
- **Backend HTTP dans `src/server/`** (même arborescence `src/`, même pipeline de build `tsc`), pas un projet séparé — reste un simple ajout au package Node existant. Nouveau script `dev:server` (`tsx src/server/index.ts`).
- **Frontend dans `web/`** (répertoire séparé à la racine), projet Vite+React+TS indépendant avec son propre `package.json` — séparation standard entre un package Node/CLI et une app web, évite de mélanger les dépendances navigateur (React, Vite) dans le `package.json` du CLI.
- **Sessions de fichiers temporaires** : `POST /api/extract` sauvegarde les PDF uploadés dans `runtime/uploads/<sessionId>/` (dossier gitignored) et retourne les valeurs calculées + `sessionId`. `POST /api/generate/:sessionId` réutilise ces fichiers pour éviter un second upload. Un nettoyage simple (best-effort, au démarrage du serveur + TTL) évite l'accumulation.
- **Conversion pptx → images (révisé après test empirique, voir Task 1)** : `soffice --convert-to png` n'exporte que la première slide d'un pptx multi-slides — inutilisable tel quel. Un process `soffice --headless` persistant avec profil partagé a été testé pour accélérer les conversions successives : **ça ne fonctionne pas** de façon fiable en invoquant `soffice --convert-to` en CLI à chaque fois (chaque appel reste ~2-4s, qu'un process tourne déjà ou non ; une vraie réutilisation demanderait un client UNO dédié type `unoconv`, jugé disproportionné ici). Design retenu : `soffice --headless --convert-to pdf --outdir <dir> <pptx>` (un seul appel par génération, ~2-4s, produit un PDF multi-pages) puis rastérisation page par page **en Node**, via `pdfjs-dist`+`canvas` (déjà des dépendances du projet) — réutilise le contournement déjà existant dans `src/pdf/renderChart.ts` pour le bug de rendu de texte à police intégrée sous Node (`disableFontFace` + capture des glyphes peints par pdfjs + redessin du texte positionné via la matrice de transformation), généralisé à une page entière (pas de recadrage). Validé empiriquement sur un pptx réel (7 slides, texte et image lisibles, ~300ms pour rastériser toutes les pages une fois le PDF obtenu). Pas de process persistant, pas de dépendance npm supplémentaire.
- **Budget de latence par génération, révisé** : ~2-4s pour `soffice --convert-to pdf` + ~300ms-1s pour la rastérisation de toutes les pages, à chaque génération (pas de gain sur les générations suivantes). Acceptable pour un usage local où l'action "Générer" est déclenchée une fois par présentation — la promesse initiale de conversions suivantes "quasi instantanées" (~200-500ms) ne tient pas et est abandonnée.
- **Pas de champ éditable dans l'étape "Vérifier les données"** : les valeurs affichées sont en lecture seule (aucune valeur du mock fourni par l'utilisateur ne suggérait de champ éditable à cette étape, hormis les rangées déjà saisies en étape 1). Si le besoin apparaît plus tard, ce sera une itération séparée.
- **`npm run dev` unique** à la racine (nouvelle dépendance `concurrently`) lance serveur Express (`tsx --watch`) + Vite dev server (proxy `/api` vers `http://localhost:3001`), pour un flux de développement fluide en une commande.

## Task List

### Phase 0 : Environnement

- [x] **Task 1** : Installer LibreOffice Impress (`libreoffice-impress`) via apt dans le worktree courant + ajouter l'installation au devcontainer (`postCreateCommand` ou feature apt dans `.devcontainer/devcontainer.json`) pour qu'elle survive à un rebuild.

**Acceptance criteria :**
- `soffice --version` fonctionne dans le shell courant
- Conversion manuelle d'un pptx existant (`output/*.pptx`) en PNG via `soffice --headless --convert-to png --outdir /tmp/test <fichier>` produit un ou plusieurs PNG valides
- `.devcontainer/devcontainer.json` (ou un `Dockerfile` associé) documente l'installation pour les futurs rebuilds

**Verification :**
- Manuel : commandes ci-dessus exécutées avec succès

**Dependencies :** Aucune

**Files likely touched :** `.devcontainer/devcontainer.json` (et/ou nouveau `Dockerfile`)

**Estimated scope :** S

---

### Phase 1 : Service de génération partagé (extraction / rendu), refactor sans régression

- [x] **Task 2** : `src/generate/extract.ts` — `extractSansStockage(pdfPath, rangees): Promise<SlideValues>` et `extractStockage(pdfPath, rangees): Promise<StorageSlideValues>`, extraits de `runSansStockage`/`runStockage` (partie lecture PDF + `extractFromPdfText(Storage)` + `buildValues`/`buildStorageValues`). Aucun `console.log` dans ce module — retourne uniquement les valeurs.
- [x] **Task 3** : `src/generate/render.ts` — `renderSansStockage(values: SlideValues, scenarioNumero?): Pptx` et `renderStockage(pdf: string, values: StorageSlideValues, scenarioNumero?): Promise<Pptx>`, extraits de la partie "application au template" de `runSansStockage`/`runStockage` (ouverture du zip, `buildSlide1Replacements`, `buildSlide2Replacements(Storage)`, rendu graphique, `replaceChartImage`, et pour storage `replaceMonthlyChartImage`). Retourne le zip en mémoire (`Pptx`), pas d'écriture disque.
- [x] **Task 4** : `src/generate/comparaison.ts` — `buildComparaisonPptx(groupes: Groupe[]): Promise<{ zip: Pptx; totalSlides: number; warnings: string[] }>`, orchestration extraite de `runComparaison` (boucle groupes/cas, `appendSlides`, `checkDimensioningConsistency`), warnings retournés au lieu de `console.warn`.
- [x] **Task 5** : Réécrire `src/cli.ts` pour consommer `src/generate/*` : parse arguments → appelle `extract*`/`render*`/`buildComparaisonPptx` → affiche les mêmes logs qu'avant à partir des valeurs retournées → `writePptx`. Types `Scenario`/`Groupe`/`TemplateScenario`/constantes de mapping déplacés dans `src/generate/` (réexportés ou dupliqués côté CLI si besoin de l'usage/parsing uniquement).

**Acceptance criteria (Phase 1) :**
- [x] Sur sans-stockage et stockage, le pptx généré par `dist/cli.js` après refactor est **identique octet pour octet** à celui généré avant refactor. Sur comparaison, **contenu identique** (diff -rq sur les zips désarchivés) — l'égalité octet pour octet n'est pas atteignable : les timestamps qu'AdmZip écrit dans les entrées ajoutées par `appendSlides` sont non déterministes, y compris avant ce refactor (deux exécutions successives du CLI non modifié produisent déjà des fichiers différents à ce niveau). Vérifié sur les mêmes fixtures réelles (`test/data/`)
- [x] La sortie console (`stdout`) du CLI est inchangée pour les 3 scénarios
- [x] `npm test` passe entièrement (aucun test existant modifié sauf déplacement de code testé, comportement identique)

**Verification :**
- Tests : `npm test`
- Build : `npm run build`
- Manuel : générer les 3 scénarios avant/après (`git stash`/`git stash pop` sur `src/`, ou branche de comparaison) et `diff`/hash des fichiers de sortie

**Dependencies :** Aucune

**Files likely touched :** `src/generate/extract.ts`, `src/generate/render.ts`, `src/generate/comparaison.ts`, `src/generate/types.ts` (si utile pour `Scenario`/`Groupe`), `src/cli.ts`

**Estimated scope :** L — *si ça dépasse une session, traiter Task 2+3 (sans-stockage/stockage) dans un tour, Task 4 (comparaison) + Task 5 (cli.ts) dans un second.*

---

### Checkpoint 1 : Backend foundation
- [x] `npm test` et `npm run build` passent
- [x] Non-régression CLI vérifiée (pptx identiques byte-à-byte sans-stockage/stockage, contenu identique comparaison ; stdout identique) sur les 3 scénarios, fixtures réelles
- [x] Revue avec l'utilisateur avant de continuer

---

### Phase 2 : Service d'aperçu (pptx → images)

- [x] **Task 6** : `src/preview/pptxToImages.ts` — `convertPptxToPngs(pptxPath: string, outDir: string): Promise<string[]>` : (1) appelle `soffice --headless --convert-to pdf --outdir <tmp>` (via `child_process`, un appel par génération, pas de process persistant — voir décision révisée ci-dessus) ; (2) rastérise chaque page du PDF obtenu en PNG via `pdfjs-dist`+`canvas`, en généralisant le contournement de `src/pdf/renderChart.ts` (`disableFontFace`, capture des glyphes peints, redessin du texte positionné) à une page entière sans recadrage. Retourne les chemins des PNG, un par slide, dans l'ordre.
- [x] **Task 7** : Vérification du service de conversion sur les 3 scénarios (nombre de PNG produits = nombre de slides attendu : 2/3/4).

**Acceptance criteria :**
- [x] `convertPptxToPngs` sur un pptx sans-stockage produit 2 PNG, avec-stockage 3 PNG, comparaison (1 groupe complet) 4 PNG — vérifié pour les 3
- [x] Les PNG sont lisibles (dimensions non nulles), dans l'ordre des slides, texte et graphiques visibles (pas de texte invisible comme observé sans le contournement) — inspection visuelle
- [x] Durée totale documentée : ~3,6s pour un pptx à 3 slides (conversion pdf ~2-3s + rastérisation <1s), pas de promesse de latence "quasi instantanée" sur les appels suivants

**Verification :**
- [x] Tests : `npm test` (`tests/preview/pptxToImages.test.ts`, skip conditionnel si LibreOffice absent)
- [x] Manuel : conversion de pptx générés via `src/generate/*`, inspection visuelle (sans-stockage, stockage, comparaison)

**Dependencies :** Task 1 (LibreOffice installé), Task 3/4 (pptx à convertir)

**Files likely touched :** `src/preview/pptxToImages.ts`, `tests/preview/pptxToImages.test.ts`

**Estimated scope :** M

---

### Checkpoint 2 : Aperçu
- [x] Conversion pptx→images validée sur les 3 scénarios
- [x] Revue avec l'utilisateur avant de continuer (approbation groupée : "enchaîne les phases")

---

### Phase 3 : API Express

- [ ] **Task 8** : Scaffold serveur (`src/server/app.ts` : app Express + middlewares ; `src/server/index.ts` : `listen`), dépendances `express`, `multer`, `@types/express`, `@types/multer`. Route `GET /api/health` → `{ status: "ok" }`.
- [ ] **Task 9** : `POST /api/extract` — reçoit `scenario` + fichier(s) PDF (`multer`, stockage disque dans `runtime/uploads/<sessionId>/`) + `rangees` (scénarios simples) ou la liste des groupes (`comparaison`), appelle `src/generate/extract.ts`, répond avec les valeurs calculées par scénario/groupe + `sessionId`. Erreurs (PDF illisible, champ manquant) renvoyées en JSON avec code HTTP explicite.
- [ ] **Task 10** : `POST /api/generate/:sessionId` — retrouve les fichiers de la session, appelle `render*`/`buildComparaisonPptx`, écrit le pptx dans `runtime/output/<sessionId>.pptx`, appelle `convertPptxToPngs`, répond `{ pptxUrl, previewImageUrls: string[] }`. Sert `runtime/output/` en statique pour le téléchargement et les images.
- [ ] **Task 11** : Nettoyage best-effort des sessions (`runtime/uploads/`, `runtime/output/`) — purge au démarrage du serveur des dossiers plus vieux qu'un TTL simple (ex. 24h), `runtime/` ajouté au `.gitignore`.

**Acceptance criteria :**
- `POST /api/extract` avec une fixture réelle de `test/data/` renvoie les mêmes valeurs que celles affichées par le CLI sur le même fichier
- `POST /api/generate/:sessionId` après un `extract` réussi produit un pptx téléchargeable identique (mêmes valeurs remplacées) à celui produit par le CLI, et une image par slide
- Une requête `generate` avec un `sessionId` inconnu/expiré renvoie une erreur 404 explicite
- `runtime/` n'est jamais commité (vérifié via `.gitignore` + `git status` propre après un cycle extract/generate)

**Verification :**
- Tests : `npm test` (tests d'intégration légers sur les routes, via `supertest` ou équivalent, si raisonnable — sinon vérification manuelle via `curl`/Postman documentée)
- Manuel : cycle complet `extract` → `generate` sur les 3 scénarios via `curl`

**Dependencies :** Task 5 (generate/), Task 6 (preview)

**Files likely touched :** `src/server/app.ts`, `src/server/index.ts`, `src/server/routes/extract.ts`, `src/server/routes/generate.ts`, `src/server/sessions.ts`, `.gitignore`

**Estimated scope :** L — *si ça dépasse une session, scinder Task 8 (scaffold+health) de Task 9 (extract) et Task 10 (generate) en tours séparés.*

---

### Checkpoint 3 : API complète
- [ ] Cycle `extract`→`generate`→téléchargement validé via `curl` sur les 3 scénarios
- [ ] Revue avec l'utilisateur avant de continuer

---

### Phase 4 : Frontend — scaffold

- [ ] **Task 12** : Scaffold `web/` (Vite + React + TS), proxy dev `/api` → `http://localhost:3001` (`vite.config.ts`), structure de dossiers (`src/steps/`, `src/components/`, `src/api/client.ts`), layout de base inspiré de la maquette (topbar avec logo/marque, stepper 3 étapes, disposition principale + panneau latéral récapitulatif) — **recréé**, pas copié du HTML fourni. Palette/typographie librement inspirées (pas de contrainte de pixel-perfect).

**Acceptance criteria :**
- `npm --prefix web run dev` démarre un serveur Vite affichant la coquille de l'appli (topbar + stepper + zone de contenu vide/placeholder)
- Le proxy `/api/health` fonctionne en dev (requête depuis le frontend atteint le serveur Express)

**Verification :**
- Manuel : lancer serveur + frontend, vérifier dans le navigateur

**Dependencies :** Task 8 (API health)

**Files likely touched :** `web/package.json`, `web/vite.config.ts`, `web/index.html`, `web/src/main.tsx`, `web/src/App.tsx`, `web/src/styles/*`, `web/src/api/client.ts`

**Estimated scope :** M

---

### Phase 5 : Frontend — Étape 1 (scénario + upload)

- [ ] **Task 13** : Étape 1, scénarios simples (`sans-stockage`/`stockage`) — sélecteur des 3 cartes de scénario, champ d'upload PDF unique + champ rangées, activation du bouton "Vérifier les données" seulement si le formulaire est valide.
- [ ] **Task 14** : Étape 1, scénario `comparaison` — liste dynamique de groupes (bouton "+ ajouter un groupe" / suppression), chaque groupe avec ses rangées + upload PDF sans-stockage et/ou avec-stockage (au moins un des deux requis), validation cohérente avec `parseGroupes` côté serveur.

**Acceptance criteria :**
- Les 3 scénarios sont sélectionnables et affichent les champs pertinents (upload simple pour sans-stockage/stockage, liste de groupes pour comparaison)
- Impossible d'activer "Vérifier les données" tant que le formulaire du scénario actif n'est pas valide (au moins un PDF requis par cas, rangées > 0)
- Ajouter/retirer un groupe en mode comparaison fonctionne sans perte des données déjà saisies dans les autres groupes

**Verification :**
- Manuel : test des 3 scénarios dans le navigateur, y compris ajout/suppression de 3+ groupes en comparaison

**Dependencies :** Task 12

**Files likely touched :** `web/src/steps/Step1Scenario.tsx`, `web/src/components/ScenarioCard.tsx`, `web/src/components/UploadField.tsx`, `web/src/components/GroupList.tsx`, `web/src/state/formState.ts` (ou équivalent)

**Estimated scope :** M (par tâche)

---

### Phase 6 : Frontend — Étape 2 (vérification des données)

- [ ] **Task 15** : Étape 2 — au clic sur "Vérifier les données", appelle `POST /api/extract` avec les fichiers/valeurs de l'étape 1, affiche un état de chargement puis les valeurs extraites/calculées (en lecture seule) par scénario/groupe, avec bouton retour (étape 1) et bouton "Générer" (étape 3). Affichage des erreurs serveur (PDF illisible, format inattendu) de façon compréhensible.

**Acceptance criteria :**
- Les valeurs affichées correspondent exactement à celles que produit le CLI sur la même fixture
- Une erreur d'extraction (PDF invalide) est affichée clairement, sans crash de l'UI, avec possibilité de revenir à l'étape 1
- Le retour à l'étape 1 conserve les valeurs déjà saisies

**Verification :**
- Manuel : test des 3 scénarios avec fixtures réelles + un cas d'erreur (PDF invalide/vide)

**Dependencies :** Task 9 (`/api/extract`), Task 13/14

**Files likely touched :** `web/src/steps/Step2Review.tsx`, `web/src/api/client.ts`

**Estimated scope :** M

---

### Phase 7 : Frontend — Étape 3 (génération, aperçu, téléchargement)

- [ ] **Task 16** : Étape 3 — au clic sur "Générer", appelle `POST /api/generate/:sessionId`, état de chargement (génération pptx + conversion aperçu peuvent prendre quelques secondes), affiche les images de slides renvoyées (grille ou carrousel), bouton de téléchargement du pptx.

**Acceptance criteria :**
- Après génération, les images affichées correspondent visuellement aux slides réelles du pptx (texte, graphique, mise en page)
- Le téléchargement produit exactement le fichier servi par `/api/generate` (même contenu)
- Un échec de génération (ex. LibreOffice indisponible) est affiché clairement sans bloquer le téléchargement du pptx si celui-ci a bien été généré (l'aperçu est un bonus, pas un prérequis au téléchargement)

**Verification :**
- Manuel : cycle complet upload→vérification→génération→aperçu→téléchargement sur les 3 scénarios, ouverture du pptx téléchargé pour confirmer la cohérence avec l'aperçu affiché

**Dependencies :** Task 10 (`/api/generate`), Task 15

**Files likely touched :** `web/src/steps/Step3Result.tsx`, `web/src/api/client.ts`

**Estimated scope :** M

---

### Checkpoint 4 : Flux complet
- [ ] Les 3 scénarios sont utilisables de bout en bout dans le navigateur (upload → vérification → génération → aperçu → téléchargement)
- [ ] Revue avec l'utilisateur avant de continuer

---

### Phase 8 : Intégration finale

- [ ] **Task 17** : Scripts npm racine — `concurrently` en devDependency, `npm run dev` (serveur + frontend en parallèle), `npm run build` (build des deux), `npm start` (sert `web/dist` statiquement depuis Express + API sur un seul port, pour un usage local simple sans deux serveurs séparés). `.gitignore` mis à jour (`web/node_modules/`, `web/dist/`, `runtime/`).
- [ ] **Task 18** : Mise à jour `README.md` — section "Interface web" (prérequis LibreOffice, `npm install` + `npm --prefix web install`, `npm run dev`, description rapide du flux 3 étapes), CLI existante documentée comme toujours disponible en parallèle.
- [ ] **Task 19** : Vérification manuelle bout-en-bout finale des 3 scénarios via `npm start` (mode "production locale" à un seul port), avec les fixtures réelles de `test/data/`.

**Acceptance criteria :**
- `npm run dev` démarre serveur + frontend en une commande, flux complet fonctionnel
- `npm start` (après `npm run build`) sert l'appli complète sur un seul port, flux complet fonctionnel
- `README.md` permet à quelqu'un qui ne connaît pas le projet de lancer l'interface web sans aide supplémentaire
- `git status` reste propre après un cycle complet d'utilisation (rien d'indésirable ajouté au dépôt)

**Verification :**
- Manuel : suivre `README.md` depuis un clone propre (ou simulation), `npm test`/`npm run build` verts

**Dependencies :** Task 16

**Files likely touched :** `package.json`, `.gitignore`, `README.md`

**Estimated scope :** S

---

### Checkpoint final
- [ ] Toutes les acceptance criteria de toutes les tâches sont remplies
- [ ] `npm test` et `npm run build` passent, CLI toujours strictement non régressée
- [ ] Les 3 scénarios fonctionnent de bout en bout via l'UI web (upload réel → aperçu fidèle → téléchargement)
- [ ] `README.md` à jour
- [ ] Prêt pour `/code-review-and-quality`, puis proposition de PR

## Risks and Mitigations

| Risque | Impact | Mitigation |
|---|---|---|
| Refactor `src/generate/*` (Phase 1) casse silencieusement un des 3 scénarios déjà en production côté CLI | Élevé | Diff binaire des pptx générés avant/après refactor sur fixtures réelles, `npm test` complet au Checkpoint 1, aucune logique métier réécrite (seulement déplacée) |
| LibreOffice headless instable/lent en environnement conteneurisé (mémoire, permissions du profil utilisateur) | Moyen | Profil utilisateur isolé dédié, process persistant testé explicitement (Task 6/7) avant de bâtir l'API dessus ; aperçu traité comme optionnel côté UI (le téléchargement du pptx ne dépend pas de la réussite de l'aperçu) |
| Sessions de fichiers temporaires (`runtime/`) qui s'accumulent ou fuient des données PDF sensibles (clients réels) | Moyen | Dossier gitignored, nettoyage best-effort au démarrage (Task 11), usage strictement local (pas de risque d'exposition réseau externe) |
| Scope frontend (N-groupes dynamiques + 3 étapes + aperçu) plus gros que prévu, dérive vers une session unique trop longue | Moyen | Découpage vertical par étape (Phase 5/6/7 indépendantes une fois l'API prête), chaque tâche livrable et vérifiable isolément |
| Confusion entre le `package.json` racine (CLI/serveur) et celui de `web/` (dépendances divergentes, scripts dupliqués) | Faible | Séparation stricte actée en Architecture Decisions ; scripts racine (`Task 17`) qui orchestrent les deux sans les mélanger |

## Open Questions

- Aucune bloquante à ce stade — le périmètre a été confirmé via `/interview-me` (aperçu fidèle par LibreOffice avec process persistant, comparaison à N groupes dynamiques, React/Vite, usage strictement local, templates non uploadables). Le détail de l'étape "Vérifier les données" (aucun champ éditable, affichage en lecture seule) est une décision d'architecture prise faute de maquette pour cet écran précis — à confirmer avec l'utilisateur si un besoin d'édition apparaît en cours de route.
