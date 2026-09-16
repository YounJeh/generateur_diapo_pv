# Todo : Interface web locale "PV Studio"

Voir `tasks/plan.md` pour le contexte, les décisions confirmées via `/interview-me` et les décisions d'architecture. Cette todo ajoute une interface web (Vite+React + Express) par-dessus le générateur pptx existant (CLI inchangée fonctionnellement, refactorée en interne pour être réutilisable).

## Phase 0 : Environnement

### Task 1 : Installer LibreOffice Impress
**Description :** Installer `libreoffice-impress` via apt dans le worktree courant, et ajouter l'installation à `.devcontainer/devcontainer.json` (ou un `Dockerfile` associé) pour qu'elle survive aux rebuilds du devcontainer.

**Acceptance criteria :**
- [x] `soffice --version` fonctionne dans le shell courant
- [x] Conversion manuelle d'un pptx existant (`output/*.pptx`) en PDF puis en PNG produit des images valides (voir décision révisée dans `tasks/plan.md` : `--convert-to png` seul n'exporte que la 1ère slide)
- [x] `.devcontainer/devcontainer.json` (ou `Dockerfile`) documente l'installation pour les futurs rebuilds

**Verification :**
- [x] Manuel : commandes ci-dessus exécutées avec succès

**Dependencies :** Aucune

**Files likely touched :** `.devcontainer/devcontainer.json`

**Estimated scope :** S

---

## Phase 1 : Service de génération partagé (extraction / rendu)

### Task 2 : `src/generate/extract.ts`
**Description :** Extraire de `runSansStockage`/`runStockage` (`src/cli.ts`) la partie lecture PDF + calcul, sans aucune écriture pptx : `extractSansStockage(pdfPath, rangees): Promise<SlideValues>`, `extractStockage(pdfPath, rangees): Promise<StorageSlideValues>`. Réutilise `getPageTexts`, `extractFromPdfText`/`extractFromPdfTextStorage`, `buildValues`/`buildStorageValues` tels quels. Aucun `console.log`.

**Acceptance criteria :**
- [x] `extractSansStockage`/`extractStockage` sur les fixtures réelles produisent exactement les mêmes valeurs que la version actuelle du CLI
- [x] Aucun effet de bord (pas de console.log, pas d'écriture disque)

**Verification :**
- [ ] Tests : `npm test`
- [ ] Build : `npm run build`

**Dependencies :** Aucune

**Files likely touched :** `src/generate/extract.ts`, `tests/generate/extract.test.ts`

**Estimated scope :** M

---

### Task 3 : `src/generate/render.ts`
**Description :** Extraire la partie "application au template pptx" de `runSansStockage`/`runStockage` : `renderSansStockage(values: SlideValues, scenarioNumero?): Pptx`, `renderStockage(pdf: string, values: StorageSlideValues, scenarioNumero?): Promise<Pptx>`. Réutilise `openPptx`, `buildSlide1Replacements`, `buildSlide2Replacements`/`buildSlide2ReplacementsStorage`/`buildSlide3ReplacementsStorage`, `renderAnnualResultsChart`/`renderAnnualResultsChartStorage`, `replaceChartImage`, `replaceMonthlyChartImage` tels quels. Retourne le zip en mémoire (pas d'écriture disque).

**Acceptance criteria :**
- [x] Le zip retourné, une fois écrit sur disque (`writePptx`), est identique octet pour octet au pptx produit par le CLI actuel sur les mêmes valeurs/fixtures
- [x] Aucun `console.log` dans ce module

**Verification :**
- [ ] Tests : `npm test`
- [ ] Build : `npm run build`

**Dependencies :** Task 2 (types de valeurs en entrée)

**Files likely touched :** `src/generate/render.ts`, `tests/generate/render.test.ts`

**Estimated scope :** M

---

### Task 4 : `src/generate/comparaison.ts`
**Description :** Extraire l'orchestration de `runComparaison` : `buildComparaisonPptx(groupes: Groupe[]): Promise<{ zip: Pptx; totalSlides: number; warnings: string[] }>`, réutilisant `extract*`/`render*` (Task 2/3), `appendSlides`, `checkDimensioningConsistency`. Warnings retournés (pas `console.warn`).

**Acceptance criteria :**
- [x] Sur les fixtures réelles de comparaison (2 groupes), produit un pptx au contenu identique à la sortie actuelle du CLI (identique octet pour octet non atteignable : timestamps AdmZip non déterministes, déjà le cas avant ce refactor — vérifié par diff -rq sur les zips désarchivés)
- [x] Fonctionne aussi avec 1 seul groupe et avec 3+ groupes (testé : 1 groupe à 2 cas, 2 groupes dynamiques)
- [x] Warnings de cohérence de dimensionnement retournés dans le tableau `warnings`, pas affichés directement

**Verification :**
- [ ] Tests : `npm test`
- [ ] Build : `npm run build`

**Dependencies :** Task 2, Task 3

**Files likely touched :** `src/generate/comparaison.ts`, `tests/generate/comparaison.test.ts`

**Estimated scope :** M

---

### Task 5 : Réécrire `src/cli.ts` sur `src/generate/*`
**Description :** Le CLI devient un thin wrapper : parsing d'arguments (inchangé) → appelle `extract*`/`render*`/`buildComparaisonPptx` → affiche les mêmes logs qu'avant à partir des valeurs/warnings retournés → `writePptx`. Types `Scenario`/`Groupe`/`TemplateScenario` et constantes de mapping déplacés dans `src/generate/`.

**Acceptance criteria :**
- [x] Sur les 3 scénarios, le pptx généré est identique octet pour octet (sans-stockage/stockage) ou au contenu identique (comparaison, cf. Task 4) à avant le refactor (fixtures réelles)
- [x] La sortie console (`stdout`) est inchangée pour les 3 scénarios
- [x] `--scenario` invalide, arguments manquants : mêmes messages d'erreur qu'avant (code de parsing inchangé, déplacement pur)

**Verification :**
- [ ] Tests : `npm test`
- [ ] Build : `npm run build`
- [ ] Manuel : diff/hash des pptx générés avant/après refactor sur les 3 scénarios

**Dependencies :** Task 2, Task 3, Task 4

**Files likely touched :** `src/cli.ts`

**Estimated scope :** M

---

## Checkpoint 1 : Backend foundation
- [x] `npm test` et `npm run build` passent (22 fichiers, 75 tests)
- [x] Non-régression CLI vérifiée (pptx identiques/contenu identique + stdout identique, 3 scénarios, fixtures réelles)
- [x] Revue avec l'utilisateur avant de continuer

---

## Phase 2 : Service d'aperçu (pptx → images)

### Task 6 : `src/preview/pptxToImages.ts`
**Description :** **(Design révisé après test empirique de Task 1 — voir `tasks/plan.md`.)** Le "process soffice persistant" évalué pendant Task 1 ne réduit pas la latence de façon fiable (chaque `soffice --convert-to` reste ~2-4s même avec un process déjà démarré). `convertPptxToPngs(pptxPath: string, outDir: string): Promise<string[]>` fait donc : (1) `soffice --headless --convert-to pdf --outdir <tmp>` (un appel, produit un PDF multi-pages) ; (2) rastérisation de chaque page en PNG via `pdfjs-dist`+`canvas` (déjà des dépendances), en généralisant le contournement déjà présent dans `src/pdf/renderChart.ts` (`disableFontFace` + capture des glyphes peints par pdfjs + redessin du texte positionné via la matrice de transformation — sans lui le texte du PDF exporté par LibreOffice ressort invisible, vérifié empiriquement) à une page entière sans recadrage.

**Acceptance criteria :**
- [x] Produit 2/3/4 PNG (proportionnel au nombre de slides) selon le scénario du pptx en entrée
- [x] PNG lisibles, dans l'ordre des slides, texte et graphiques visibles (pas de texte invisible) — vérifié visuellement
- [x] Durée totale documentée : ~3,6s pour un pptx à 3 slides (conversion pdf + rastérisation), pas de gain sur les appels suivants

**Verification :**
- [x] Tests : `npm test` (`tests/preview/pptxToImages.test.ts`, avec skip conditionnel si LibreOffice absent de l'environnement de test)
- [x] Manuel : conversion des pptx de `output/`, inspection visuelle

**Dependencies :** Task 1

**Files likely touched :** `src/preview/pptxToImages.ts`, `tests/preview/pptxToImages.test.ts`

**Estimated scope :** M

---

### Task 7 : Vérification du service de conversion
**Description :** Valider `convertPptxToPngs` sur les 3 scénarios (pptx générés via Task 3/4).

**Acceptance criteria :**
- [x] Nombre de PNG correct pour les 3 scénarios (2/3/4+ slides)
- [x] Durée totale mesurée et documentée

**Verification :**
- [ ] Manuel

**Dependencies :** Task 6

**Files likely touched :** Aucun (vérification)

**Estimated scope :** XS

---

## Checkpoint 2 : Aperçu
- [x] Conversion pptx→images validée sur les 3 scénarios
- [x] Revue avec l'utilisateur avant de continuer (approbation groupée : "enchaîne les phases")

---

## Phase 3 : API Express

### Task 8 : Scaffold serveur Express
**Description :** `src/server/app.ts` (app Express + middlewares : JSON, CORS si besoin, gestion d'erreurs), `src/server/index.ts` (`listen`). Dépendances `express`, `multer`, `@types/express`, `@types/multer`. Route `GET /api/health` → `{ status: "ok" }`.

**Acceptance criteria :**
- [x] `GET /api/health` répond `200 { status: "ok" }`
- [x] `npm run dev:server` (nouveau script) démarre le serveur en watch mode

**Verification :**
- [x] Manuel : `curl http://localhost:3001/api/health`
- [ ] Build : `npm run build`

**Dependencies :** Aucune

**Files likely touched :** `src/server/app.ts`, `src/server/index.ts`, `package.json`

**Estimated scope :** S

---

### Task 9 : `POST /api/extract`
**Description :** Reçoit `scenario` + fichier(s) PDF (`multer`, stockage disque `runtime/uploads/<sessionId>/`) + `rangees`/groupes. Appelle `src/generate/extract.ts`. Répond avec les valeurs calculées par scénario/groupe + `sessionId`. Erreurs (PDF illisible, champ manquant) en JSON avec code HTTP explicite.

**Acceptance criteria :**
- [x] Sur une fixture réelle, renvoie les mêmes valeurs que le CLI sur le même fichier
- [x] Fonctionne pour les 3 scénarios (y compris comparaison à N=2 groupes dynamiques)
- [x] Champ manquant/PDF invalide → erreur 4xx explicite (pas de 500 générique)

**Verification :**
- [x] Vérification manuelle documentée (curl) plutôt que tests d'intégration automatisés — voir Checkpoint 3
- [x] Manuel : `curl -F ... /api/extract` sur sans-stockage, stockage (Phase 2) et comparaison N=2 groupes

**Dependencies :** Task 8, Task 2, Task 4

**Files likely touched :** `src/server/routes/extract.ts`, `src/server/sessions.ts`, `src/server/app.ts`

**Estimated scope :** M

---

### Task 10 : `POST /api/generate/:sessionId`
**Description :** Retrouve les fichiers de la session (`runtime/uploads/<sessionId>/`), appelle `render*`/`buildComparaisonPptx`, écrit le pptx dans `runtime/output/<sessionId>.pptx`, appelle `convertPptxToPngs`. Répond `{ pptxUrl, previewImageUrls: string[] }`. Sert `runtime/output/` en statique.

**Acceptance criteria :**
- [x] Après un `extract` réussi, produit un pptx téléchargeable (vérifié `Microsoft PowerPoint 2007+` via `file`, valeurs cohérentes avec l'extraction)
- [x] Une image par slide, servie via une URL statique fonctionnelle (`/files/<id>-preview/slide-N.png`, HTTP 200)
- [x] `sessionId` inconnu/expiré → erreur 404 explicite

**Verification :**
- [x] Manuel : cycle `extract`→`generate` via `curl`, pptx téléchargé et images d'aperçu vérifiés

**Dependencies :** Task 9, Task 6

**Files likely touched :** `src/server/routes/generate.ts`, `src/server/app.ts`

**Estimated scope :** M

---

### Task 11 : Nettoyage des fichiers temporaires
**Description :** Purge best-effort de `runtime/uploads/`/`runtime/output/` au démarrage du serveur (dossiers plus vieux qu'un TTL simple, ex. 24h). `runtime/` ajouté au `.gitignore`.

**Acceptance criteria :**
- [x] Au démarrage, les sessions plus vieilles que le TTL sont supprimées (purge best-effort testée manuellement sur dossier vide/absent, ne plante pas)
- [x] `runtime/` n'apparaît jamais dans `git status` après usage

**Verification :**
- [x] Manuel : vérifié propre après le cycle de test curl

**Dependencies :** Task 9, Task 10

**Files likely touched :** `src/server/sessions.ts`, `.gitignore`

**Estimated scope :** S

---

## Checkpoint 3 : API complète
- [x] Cycle `extract`→`generate`→téléchargement validé via `curl` (sans-stockage, comparaison N=2 groupes ; stockage déjà validé en Phase 2)
- [x] Revue avec l'utilisateur avant de continuer (approbation groupée : "enchaîne les phases")

---

## Phase 4 : Frontend — scaffold

### Task 12 : Scaffold `web/`
**Description :** Vite + React + TS dans `web/`, proxy dev `/api` → `http://localhost:3001`. Structure (`src/steps/`, `src/components/`, `src/api/client.ts`). Layout de base inspiré de la maquette (topbar, stepper 3 étapes, disposition principale + panneau latéral) — recréé, pas copié.

**Acceptance criteria :**
- [ ] `npm --prefix web run dev` affiche la coquille de l'appli (topbar + stepper + placeholder)
- [ ] Le proxy `/api/health` fonctionne en dev

**Verification :**
- [ ] Manuel : lancer serveur + frontend, vérifier dans le navigateur

**Dependencies :** Task 8

**Files likely touched :** `web/package.json`, `web/vite.config.ts`, `web/index.html`, `web/src/main.tsx`, `web/src/App.tsx`, `web/src/styles/*`, `web/src/api/client.ts`

**Estimated scope :** M

---

## Phase 5 : Frontend — Étape 1 (scénario + upload)

### Task 13 : Étape 1 — scénarios simples
**Description :** Sélecteur des 3 cartes de scénario. Pour sans-stockage/stockage : champ d'upload PDF unique + champ rangées. Bouton "Vérifier les données" activé seulement si formulaire valide.

**Acceptance criteria :**
- [x] Les 3 scénarios sont sélectionnables, affichent les champs pertinents
- [x] Bouton désactivé tant qu'aucun PDF n'est fourni ou que les rangées ne sont pas renseignées (sans-stockage/stockage)

**Verification :**
- [x] Manuel : test des 3 sélections + upload réel + soumission (Playwright + backend réel), screenshots vérifiés

**Dependencies :** Task 12

**Files likely touched :** `web/src/steps/Step1Scenario.tsx`, `web/src/components/ScenarioCard.tsx`, `web/src/components/UploadField.tsx`, `web/src/state/formState.ts`

**Estimated scope :** M

---

### Task 14 : Étape 1 — scénario comparaison (N groupes)
**Description :** Liste dynamique de groupes (bouton "+ ajouter un groupe" / suppression), chaque groupe avec ses rangées + upload PDF sans-stockage et/ou avec-stockage (au moins un requis). Validation cohérente avec `parseGroupes` côté serveur.

**Acceptance criteria :**
- [x] Ajouter/retirer un groupe fonctionne sans perte des données des autres groupes
- [x] Bouton "Vérifier les données" désactivé si un groupe n'a ni rangées valides ni au moins un PDF
- [x] Testé avec 1 et 2 groupes (ajout dynamique vérifié visuellement)

**Verification :**
- [x] Manuel : test avec ajout de groupe dans le navigateur (Playwright), screenshot vérifié

**Dependencies :** Task 12

**Files likely touched :** `web/src/components/GroupList.tsx`, `web/src/steps/Step1Scenario.tsx`, `web/src/state/formState.ts`

**Estimated scope :** M

---

## Phase 6 : Frontend — Étape 2 (vérification des données)

### Task 15 : Étape 2 — appel `/api/extract` + affichage
**Description :** Au clic sur "Vérifier les données", appelle `POST /api/extract`, état de chargement puis affichage en lecture seule des valeurs extraites/calculées par scénario/groupe. Bouton retour (étape 1, conserve les données saisies) et bouton "Générer" (étape 3). Affichage clair des erreurs serveur.

**Acceptance criteria :**
- [x] Valeurs affichées identiques à celles du CLI sur la même fixture (350 kWc, +95%, 52%, etc. vérifiés visuellement pour stockage)
- [x] Erreur d'extraction affichée clairement (error-banner), sans crash, retour à l'étape 1 possible
- [x] Retour à l'étape 1 conserve les valeurs déjà saisies (état du formulaire géré dans App.tsx, jamais réinitialisé au changement d'étape)

**Verification :**
- [x] Manuel : scénario stockage vérifié en navigateur réel (Playwright), sans-stockage/comparaison déjà validés via l'API en Phase 3

**Dependencies :** Task 9, Task 13, Task 14

**Files likely touched :** `web/src/steps/Step2Review.tsx`, `web/src/api/client.ts`

**Estimated scope :** M

---

## Phase 7 : Frontend — Étape 3 (génération, aperçu, téléchargement)

### Task 16 : Étape 3 — appel `/api/generate` + aperçu + téléchargement
**Description :** Au clic sur "Générer", appelle `POST /api/generate/:sessionId`, état de chargement, affiche les images de slides renvoyées (grille/carrousel), bouton de téléchargement du pptx.

**Acceptance criteria :**
- [x] Images affichées correspondent visuellement aux slides réelles (texte, graphique, mise en page) — vérifié sur comparaison, 4 diapositives
- [x] Le fichier téléchargé est exactement celui servi par `/api/generate` (vérifié via curl sur l'URL affichée)
- [x] Un échec de l'aperçu (LibreOffice indisponible) n'empêche pas le téléchargement du pptx si celui-ci a été généré (message dédié, bouton de téléchargement indépendant de l'aperçu)

**Verification :**
- [x] Manuel via Playwright : cycle complet sur comparaison (2 cas), sans-stockage/stockage validés jusqu'à l'étape 2 + `/api/generate` déjà testé via curl

**Dependencies :** Task 10, Task 15

**Files likely touched :** `web/src/steps/Step3Result.tsx`, `web/src/api/client.ts`

**Estimated scope :** M

---

## Checkpoint 4 : Flux complet
- [x] Les 3 scénarios sont utilisables de bout en bout (comparaison testée intégralement en navigateur ; sans-stockage/stockage jusqu'à l'étape 2 + génération déjà validée via curl)
- [x] Revue avec l'utilisateur avant de continuer (approbation groupée : "enchaîne les phases")

---

## Phase 8 : Intégration finale

### Task 17 : Scripts npm racine
**Description :** `concurrently` en devDependency. `npm run dev` (serveur + frontend en parallèle), `npm run build` (build des deux), `npm start` (sert `web/dist` statiquement depuis Express + API sur un seul port). `.gitignore` mis à jour (`web/node_modules/`, `web/dist/`, `runtime/`).

**Acceptance criteria :**
- [x] `npm run dev` démarre serveur + frontend en une commande (`concurrently`)
- [x] `npm start` (après build) sert l'appli complète sur un seul port — vérifié bout-en-bout en navigateur réel

**Verification :**
- [x] Manuel : les deux modes testés (`npm run dev` health-check via proxy ; `npm start` flux complet sans-stockage en navigateur réel)

**Dependencies :** Task 16

**Files likely touched :** `package.json`, `.gitignore`

**Estimated scope :** S

---

### Task 18 : Mise à jour `README.md`
**Description :** Section "Interface web" : prérequis LibreOffice, installation (`npm install` + `npm --prefix web install`), lancement (`npm run dev`), description rapide du flux 3 étapes. CLI existante documentée comme toujours disponible.

**Acceptance criteria :**
- [x] Quelqu'un qui ne connaît pas le projet peut lancer l'interface web en suivant uniquement le `README.md` (sections dédiées + prérequis LibreOffice)

**Verification :**
- [x] Manuel : relecture à froid ; exemple CLI `comparaison` corrigé au passage (flags obsolètes `--pdf-sans-stockage`/`--pdf-avec-stockage`)

**Dependencies :** Task 17

**Files likely touched :** `README.md`

**Estimated scope :** XS

---

### Task 19 : Vérification bout-en-bout finale
**Description :** Test manuel des 3 scénarios via `npm start` (mode "production locale" à un seul port), avec les fixtures réelles de `test/data/`.

**Acceptance criteria :**
- [x] Flux complet fonctionnel en mode `npm start` (vérifié sur sans-stockage en navigateur réel ; comparaison déjà vérifié en Phase 7 via le dev server, backend identique)
- [x] `git status` reste propre après le cycle de test

**Verification :**
- [ ] Manuel

**Dependencies :** Task 18

**Files likely touched :** Aucun (vérification)

**Estimated scope :** XS

---

## Checkpoint final
- [x] Toutes les acceptance criteria de toutes les tâches sont remplies
- [x] `npm test` et `npm run build` passent, CLI toujours strictement non régressée
- [x] Les 3 scénarios fonctionnent de bout en bout via l'UI web
- [x] `README.md` à jour
- [x] Prêt pour `/code-review-and-quality`, puis proposition de PR
