# generateur_diapo_pv

Mini-application TypeScript qui extrait des valeurs d'un rapport SolarEdge
(PDF) et met à jour un template PPTX de proposition commerciale PV avec ces
valeurs — texte et graphiques — sans toucher au reste de la mise en forme.
Trois scénarios sont pris en charge : "sans stockage" (2 slides, pages 1-2 du
PDF), "avec stockage" (3 slides, pages 1-3 du PDF), et "comparaison" (4+
slides, combine N groupes de dimensionnement, chacun avec un cas sans
stockage et/ou avec stockage).

Deux façons d'utiliser l'outil : une **interface web locale** (recommandée,
voir ci-dessous) ou la **ligne de commande** directement.

## Installation

```bash
npm install
npm --prefix web install
npm run build
```

L'aperçu du pptx généré dans l'interface web nécessite LibreOffice Impress
(conversion pptx → images). Sur Debian/Ubuntu :

```bash
sudo apt-get install --no-install-recommends libreoffice-impress
```

Sans LibreOffice, le reste de l'application (extraction, génération,
téléchargement du pptx) fonctionne normalement — seul l'aperçu visuel est
indisponible.

## Interface web

```bash
npm run dev
```

Démarre le serveur Express (API, port 3001) et le serveur de développement
Vite (port 5173, proxy `/api`/`/files` vers le serveur) en une seule
commande. Ouvrir `http://localhost:5173`.

Pour un usage local à un seul port (après `npm run build`) :

```bash
npm start
```

Sert l'API et le frontend buildé sur `http://localhost:3001`.

Le flux en 3 étapes :

1. **Importer les rapports** : choisir le scénario (sans stockage / avec
   stockage / comparaison), uploader le ou les PDF SolarEdge requis, saisir
   le nombre de rangées d'ombrières par cas. En comparaison, les groupes de
   dimensionnement s'ajoutent dynamiquement ("+ Ajouter un groupe").
2. **Vérifier les données** : les valeurs extraites/calculées sont affichées
   en lecture seule avant de générer le pptx.
3. **Télécharger** : aperçu visuel de chaque diapositive générée (rendu
   fidèle via LibreOffice), puis téléchargement du fichier `.pptx`.

Les templates pptx (`assets/templates/`) sont sélectionnés automatiquement
selon le scénario — rien à uploader de ce côté. Tout reste local : aucune
donnée n'est envoyée en dehors de votre machine.

## Ligne de commande (CLI)

```bash
npm run dev:cli -- --pdf <chemin du PDF SolarEdge> --rangees <nombre de rangées> [--scenario sans-stockage|stockage] [--output <chemin de sortie>]
```

(ou `node dist/cli.js ...` après `npm run build`)

- `--pdf` (obligatoire) : chemin vers le rapport SolarEdge (PDF). Les pages 1
  et 2 sont lues dans les deux scénarios ; la page 3 ("Énergie mensuelle
  estimée") l'est en plus dans le scénario avec stockage.
- `--rangees` (obligatoire) : nombre de rangées d'ombrières. Cette valeur
  n'apparaît nulle part en texte dans le PDF (probablement un label dans le
  schéma d'implantation, une image) — elle doit être saisie manuellement.
- `--scenario` (optionnel, défaut `sans-stockage`) : `sans-stockage`,
  `stockage` ou `comparaison`. Sélectionne le template pptx et les règles
  d'extraction/calcul correspondantes.
- `--output` (optionnel) : chemin du pptx généré. Par défaut :
  `output/<nom-du-pdf>.pptx` (`output/<nom-du-pdf-sans-stockage>_comparaison.pptx`
  pour le scénario `comparaison`).

Le scénario `comparaison` prend en entrée N groupes de dimensionnement
(chacun avec un cas sans stockage et/ou avec stockage) au lieu d'un seul PDF.
Il utilise `--groupe-N-rangees`/`--groupe-N-pdf-sans-stockage`/`--groupe-N-pdf-avec-stockage`
à la place de `--pdf`/`--rangees` :

```bash
node dist/cli.js \
  --scenario comparaison \
  --groupe-1-rangees 3 \
  --groupe-1-pdf-sans-stockage "test/data/Solar_Edge_ITM_Rixhiem_3_omb_V2.pdf" \
  --groupe-1-pdf-avec-stockage "test/data/D_26_1223_Intermarche_Rixhiem_3_Omb_avec_stockage_V2.pdf"
```

Plusieurs groupes s'ajoutent avec `--groupe-2-*`, `--groupe-3-*`, etc. ; les
slides sont assemblées dans l'ordre des groupes.

Exemple, scénario sans stockage (fixtures du dépôt) :

```bash
node dist/cli.js \
  --pdf "test/data/Solar_Edge_ITM_Rixhiem_3_omb_V2.pdf" \
  --rangees 3
```

Exemple, scénario avec stockage :

```bash
node dist/cli.js \
  --pdf "test/data/D_26_1223_Intermarche_Rixhiem_3_Omb_avec_stockage_V2.pdf" \
  --rangees 3 \
  --scenario stockage
```

## Ce que l'outil remplace

### Scénario sans stockage (template `assets/templates/template-sans-stockage.pptx`)

- **Slide 1** : puissance installée (titre + corps), nombre de rangées.
- **Slide 2** : puissance installée (titre + corps), nombre de modules,
  production annuelle, ratio de performance, taux d'autoconsommation,
  surplus de production, taux d'autoproduction, et l'image du graphique
  "Résultats de consommation et de production annuelles" (dessiné à partir
  des valeurs extraites, 2 segments par barre).

Le reste du contenu (mise en forme, polices, autres slides) reste
strictement identique à l'original. Un chiffre volontairement laissé
inchangé (l'estimation marketing "65%" sur la slide 2, qui ne provient pas
du PDF) est signalé dans la sortie console.

### Scénario avec stockage (template `assets/templates/template-avec-stockage.pptx`)

- **Slide 1** : traitement identique au scénario sans stockage.
- **Slide 2** : puissance installée, nombre de modules, production
  annuelle, ratio de performance, et deux valeurs spécifiques au stockage :
  - **Taux d'autoconsommation affiché** = %vers-bâtiment + %vers-stockage ;
    si ce total est ≥ 95 (ou dépasse 100 par arrondi), affiché comme `+95`
    (convention marketing) plutôt que le nombre exact.
  - **Taux d'autoproduction combiné** = %depuis-PV + %depuis-stockage,
    toujours affiché tel quel (pas de plafond).
  - L'image du graphique "Résultats de consommation et de production
    annuelles" est dessinée avec 3 segments par barre (bâtiment/stockage/
    réseau côté production ; PV/stockage/réseau côté consommation).
- **Slide 3** ("Énergie mensuelle estimée") : l'image du graphique est
  remplacée par une capture du graphique correspondant sur la page 3 du
  PDF (recadrage précis par repérage du titre et de la légende, texte
  redessiné par-dessus), plutôt qu'une reconstruction à partir de valeurs
  extraites comme pour la slide 2. La taille du cadre-image est ajustée au
  ratio réel de cette capture ; sa position ne change pas.

### Scénario comparaison

Combine les deux pipelines ci-dessus en un seul pptx, groupe de
dimensionnement par groupe : pour chaque groupe, les 2 slides du cas sans
stockage (si fourni) suivies des slides de contenu du cas avec stockage (si
fourni) — la slide de titre du cas avec stockage n'est pas reprise dans un
groupe qui a aussi un cas sans stockage, car elle serait identique pour un
même dimensionnement. Les groupes sont assemblés dans l'ordre donné.

Si, au sein d'un même groupe, le nombre de modules ou la puissance installée
extraits diffèrent entre le cas sans stockage et le cas avec stockage, un
avertissement (non bloquant) est affiché : ces valeurs ne dépendent que de
l'implantation physique, pas du stockage, donc une divergence suggère que
les deux PDF du groupe ne décrivent pas le même dimensionnement. Aucune
vérification n'est faite entre groupes différents, qui décrivent
intentionnellement des dimensionnements distincts.

## Développement

```bash
npm test              # vitest, contre les fixtures réelles de test/data/ (backend uniquement)
npm run build          # build backend (dist/) + frontend (web/dist/)
npm run build:server   # build backend seul
```

- Backend (CLI + serveur Express) : `src/` — `src/generate/` (extraction/rendu
  partagés CLI + API), `src/server/` (API), `src/preview/` (aperçu pptx→images).
- Frontend : `web/` (Vite + React + TS), projet indépendant avec son propre
  `package.json`.

Voir `tasks/plan.md` et `tasks/todo.md` pour le détail de l'architecture et
des décisions prises pendant la conception.
