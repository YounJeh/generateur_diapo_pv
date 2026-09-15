# Implementation Plan: Générateur de diapo PV (extraction PDF SolarEdge → mise à jour PPTX)

## Overview

Mini-application TypeScript/CLI qui lit les 2 premières pages d'un rapport SolarEdge (PDF), en extrait 7 valeurs par regex, calcule la puissance installée, puis génère une copie du template PPTX "Scenario 1 sans stockage Projet_Ombriere_Rixhiem.pptx" avec uniquement les valeurs et l'image du graphique (slide 2) mises à jour — le reste du fichier (mise en forme, polices, autres slides, autres shapes) reste identique à l'original.

Confirmé via `/interview-me` puis vérifié par inspection directe des fichiers réels (`pdf-parse`, `pdfjs-dist`, `adm-zip` sur les fixtures `test/data/`).

## Faits vérifiés sur les fixtures réelles (important pour la suite)

- Le PDF (`Solar_Edge_ITM_Rixhiem_3_omb_V2.pdf`) fait 7 pages ; seules les pages 1-2 sont utilisées.
- Page 1 (texte réel) : `750 Modules PV`, `350,73 MWh` (Production D'énergie Annuelle), `77 %` (Ratio De Performance — **entier, pas de décimale**, malgré le template qui affiche "77,0 %").
- Page 2 (texte réel) : `Production 351,31 MWh 29% 71%`, `Vers le bâtiment 249,34 MWh (71%)`, `Vers le réseau 101,39 MWh (29%)`, `Consommation 656,65 MWh 62% 38%`, `Depuis le PV 249,34 MWh (38%)`, `38% Énergie solaire`.
- **"nombre de rangées" (3) n'existe nulle part en texte** sur les 7 pages du PDF (recherche exhaustive "rang" insensible à la casse = 0 résultat). Probablement un label dans une image raster du schéma d'implantation (page 1 contient 4 `paintImageXObject`). Décision utilisateur : **ce champ est saisi manuellement en argument CLI**, pas extrait.
- Le graphique page 2 ("RÉSULTATS DE CONSOMMATION ET DE PRODUCTION ANNUELLES") est **dessiné en vectoriel** dans le PDF (confirmé via `pdfjs-dist` operator list : `constructPath`/`setFillRGBColor` en nombre, seulement 3 `paintImageXObject` non liés au graphique) — donc il faut **rendre la page en image puis rogner (crop) une zone**, pas extraire une image intégrée.
- Les textes des slides PPTX sont des runs `<a:t>` propres et atomiques (pas de découpage caractère par caractère par PowerPoint/Google Slides) — la stratégie de remplacement par **correspondance exacte de texte de run entier** est fiable et à faible risque.
- Le placeholder image du graphique (slide 2, shape `Google Shape;577;p3`, `r:embed="rId3"` → `ppt/media/image8.png`) a une position/taille fixes (`off x=671991 y=2596129`, `ext cx=10718018 cy=2219711`) et un `<a:srcRect b="14310" l="0" r="5625" t="0"/>` qui rogne l'image source actuelle avant de l'étirer dans le cadre. **La nouvelle image (déjà rognée proprement depuis le PDF) devra remettre ce `srcRect` à 0 sur les 4 côtés**, sinon elle sera sur-rognée avec les mêmes pourcentages que l'ancienne capture d'écran (qui avait des éléments d'UI en trop à couper).
- Titres slide 1/2 contiennent aussi "350 kWc" / "350kWc" (non listés initialement par l'utilisateur) — **décision : les mettre à jour aussi**, pour cohérence.
- Une phrase finale slide 2 contient "52%" (estimation marketing hypothétique "avec stockage") — **décision : hors périmètre, ne pas toucher**, mais le logger explicitement comme "ignoré" dans la sortie de l'outil.

## Architecture Decisions

- **Une seule lib PDF (`pdfjs-dist`)** pour tout : extraction de texte (page 1/2 → regex) ET rendu raster + positions de texte pour le crop du graphique (évite une deuxième dépendance de parsing PDF type `pdf-parse`).
- **`adm-zip`** pour lire/écrire le `.pptx` comme une archive zip, en ne touchant que `ppt/slides/slide1.xml`, `ppt/slides/slide2.xml` et `ppt/media/image8.png` ; toutes les autres entrées du zip sont recopiées telles quelles (octet pour octet) pour respecter "le pptx doit être strictement identique à l'original".
- **Remplacement par correspondance exacte de run entier**, pas de regex globale sur tout le XML : une table `ancien texte complet du run → texte de remplacement` par slide, appliquée uniquement à l'intérieur des balises `<a:t>...</a:t>`. Réduit le risque de collision avec des nombres présents ailleurs dans le XML (attributs de position, tailles, IDs — on a déjà trouvé de faux positifs de ce type lors de l'investigation, ex. "744" dans `cx="744992"`).
- **`node-canvas`** pour le rendu raster des pages PDF via `pdfjs-dist` (déjà testé installable dans ce devcontainer).
- **`sharp`** (ou `node-canvas` directement) pour le crop/export PNG du graphique.
- **CLI simple** (pas de framework, `process.argv` ou une petite lib comme `commander`) avec arguments : `--pdf <path>` (obligatoire), `--rangees <n>` (obligatoire, saisie manuelle), `--output <path>` (optionnel), template pptx fixé en constante (uniquement "sans stockage" dans cette version).
- **Tests avec `vitest`**, contre les fixtures réelles de `test/data/` (pas de mocks — les vraies valeurs qu'on a déjà vérifiées servent d'oracle).
- Toute extraction qui échoue à matcher une regex attendue **lève une erreur explicite** plutôt qu'un `undefined` silencieux — cohérent avec l'hypothèse "la structure du PDF est toujours la même" : si elle change, on veut le savoir immédiatement, pas produire un pptx avec des valeurs manquantes.

## Task List

### Phase 0 : Scaffolding

- [x] **Task 1** : Initialiser le projet TypeScript (`package.json`, `tsconfig.json`, `vitest`, dépendances `pdfjs-dist`, `canvas`, `sharp`, `adm-zip`, structure `src/`, `tests/`, script `npm run build` / `npm run dev` / `npm test`)

### Phase 1 : Extraction des valeurs du PDF

- [x] **Task 2** : Lecteur PDF simple (`src/pdf/reader.ts`) — `getPageTexts(pdfPath, pageNumbers): Promise<string[]>` via `pdfjs-dist`, retourne le texte brut linéarisé de chaque page demandée
- [x] **Task 3** : Extracteurs regex par champ (`src/pdf/extractValues.ts`) — 7 règles généralistes (nombre de modules, production annuelle, ratio de performance depuis page 1 ; taux d'autoconsommation, surplus de production, taux d'autoproduction depuis page 2), chacune avec message d'erreur explicite si non trouvée
- [x] **Task 4** : Calcul de la puissance installée (`src/calc.ts`) — `puissanceInstallee(modules) = Math.ceil(modules * 470)` + assemblage du type `ExtractedValues` complet (7 extraites + 1 calculée + `rangees` fournie manuellement)

### Checkpoint 1 : Pipeline d'extraction
- [x] `npm test` passe sur les tests d'extraction (regex) contre le PDF réel de `test/data/`
- [x] Les 7 valeurs + la puissance installée calculée correspondent aux valeurs vérifiées ci-dessus (750, 350,73→350730, 77, 71, 29, 38, puissance calculée)
- [x] Revue avec l'utilisateur avant de continuer

### Phase 2 : Remplacement de texte dans le PPTX

- [x] **Task 5** : Utilitaire zip PPTX (`src/pptx/zip.ts`) — ouvrir le `.pptx`, lire/écrire une entrée texte (`slide1.xml`, `slide2.xml`), lire/écrire une entrée binaire (`image8.png`), réécrire l'archive en recopiant toutes les autres entrées telles quelles
- [x] **Task 6** : Formatage des valeurs (`src/pptx/format.ts`) — kWh avec séparateur de milliers "espace" depuis la valeur MWh (virgule → point, ×1000, formaté "350 730"), ratio de performance repris tel quel du texte source PDF (pas de décimale forcée)
- [x] **Task 7** : Table de remplacement slide 1 (`src/pptx/slide1Map.ts`) — 5 correspondances exactes de run (titre "350kWc", "Ombrières puissance de 350 kWc", "350 kWc" standalone, "3 rangées d'ombrières photovoltaïques", "3 rangées" standalone)
- [x] **Task 8** : Table de remplacement slide 2 (`src/pptx/slide2Map.ts`) — 11 correspondances exactes de run (titre, "350 kWc", "744", "347 760 kWh", "77,0 %", autoconsommation ×2, surplus ×2, autoproduction ×2) ; "52%" explicitement exclu et loggé comme ignoré
- [x] **Task 9** : Moteur de remplacement (`src/pptx/replaceText.ts`) — applique une table de correspondance sur un XML de slide, erreur explicite si un ancien texte attendu n'est pas trouvé (détecte un changement de template), retourne aussi la liste des remplacements effectués

### Checkpoint 2 : Remplacement de texte
- [x] Génération d'un pptx de test : ouverture du zip de sortie, relecture des `<a:t>` de slide1/slide2 → toutes les valeurs attendues sont présentes, "52%" est inchangé
- [x] Toutes les entrées du zip non touchées (autres slides, `media/`, `theme`, etc.) sont identiques octet pour octet à l'original (hash de comparaison)
- [x] Revue avec l'utilisateur avant de continuer

### Phase 3 : Remplacement de l'image du graphique

- [x] **Task 10** : Détection de la zone du graphique (`src/pdf/chartBounds.ts`) — via `pdfjs-dist` `getTextContent()` sur la page 2, trouver les positions du texte-ancre haut ("RÉSULTATS DE CONSOMMATION ET DE PRODUCTION ANNUELLES") et bas ("Énergie solaire" / dernière ligne de légende), en déduire une bounding box (+ marge), erreur explicite si une ancre est introuvable
- [x] **Task 11** : Rendu + crop (`src/pdf/renderChart.ts`) — rendre la page 2 en raster haute résolution via `pdfjs-dist` + `canvas`, rogner selon la bounding box, exporter en PNG (buffer)
- [x] **Task 12** : Remplacement de l'image dans le pptx (`src/pptx/replaceImage.ts`) — remplacer les octets de `ppt/media/image8.png` par le nouveau PNG, remettre `<a:srcRect b="0" l="0" r="0" t="0"/>` (ou le supprimer) dans `slide2.xml`, sans toucher à `<a:off>`/`<a:ext>` (position/taille du cadre inchangées)

### Checkpoint 3 : Image du graphique
- [x] Le pptx généré, une fois dézippé, contient la nouvelle image dans `media/image8.png` avec un contenu visiblement correspondant aux données de la page 2 du PDF (vérification visuelle manuelle du PNG extrait)
- [x] Le cadre image (`off`/`ext`) dans `slide2.xml` est identique à l'original
- [x] Revue avec l'utilisateur avant de continuer

### Phase 4 : CLI et bout-en-bout

- [x] **Task 13** : CLI (`src/cli.ts`) — orchestration extraction → calcul → remplacement texte → remplacement image → écriture du fichier de sortie ; arguments `--pdf`, `--rangees`, `--output` (défaut basé sur le nom du PDF) ; affichage clair des valeurs extraites/calculées et des remplacements ignorés (ex. "52%")
- [x] **Task 14** : Exécution bout-en-bout sur les fixtures réelles (`test/data/Solar_Edge_ITM_Rixhiem_3_omb_V2.pdf` + `--rangees 3`), production d'un pptx dans `test/output/` (gitignored), vérification manuelle à l'ouverture (PowerPoint/LibreOffice/Google Slides)

### Checkpoint final
- [x] Toutes les valeurs listées sont correctement remplacées dans le pptx généré
- [x] Le reste du contenu (mise en forme, autres slides, "52%") est inchangé
- [x] `README.md` mis à jour avec les instructions d'usage du CLI
- [x] Prêt pour `/code-review-and-quality` puis proposition de PR (selon les instructions du projet)

## Risks and Mitigations

| Risque | Impact | Mitigation |
|---|---|---|
| "nombre de rangées" non extractible du PDF (confirmé) | Moyen | Saisie manuelle en argument CLI, documentée clairement comme limitation connue |
| La bounding box du graphique (ancres texte) peut ne pas se généraliser à un futur PDF légèrement différent | Moyen | Détection par recherche de texte-ancre (titre + dernière légende), pas de coordonnées pixel en dur ; erreur explicite si une ancre est introuvable plutôt qu'un crop silencieusement faux |
| `srcRect` mal réinitialisé → image du graphique mal cadrée dans le pptx final | Moyen | Task 12 remet explicitement `srcRect` à 0 puisque la nouvelle image est déjà rognée proprement en amont (Task 11) |
| Regex trop rigides si un futur PDF a un phrasé légèrement différent | Faible-Moyen | Erreurs explicites (fail-fast) plutôt que valeurs `undefined`/`NaN` silencieuses ; tests contre le texte réel extrait |
| Le pptx généré n'est pas réellement "strictement identique" ailleurs (recompression zip, etc.) | Faible | Recopie octet pour octet de toutes les entrées zip non modifiées (Task 5), pas de round-trip via une lib de génération pptx |
| `canvas`/`sharp` natifs peuvent échouer à builder selon l'environnement | Faible | Déjà vérifié installable dans ce devcontainer pendant l'investigation |

## Open Questions

- Aucune à ce stade — tous les points bloquants ont été levés avec l'utilisateur (rangées = CLI manuel, format ratio de performance = tel quel PDF, titres 350 kWc = mis à jour, "52%" = hors périmètre + loggé).
