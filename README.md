# generateur_diapo_pv

Mini-application TypeScript qui extrait des valeurs d'un rapport SolarEdge
(PDF, pages 1-2) et met à jour un template PPTX de proposition commerciale
PV avec ces valeurs — texte et graphique de la slide 2 — sans toucher au
reste de la mise en forme. Deux scénarios sont pris en charge : "sans
stockage" (2 slides) et "avec stockage" (3 slides, dont une slide 3 non
traitée par l'outil).

## Installation

```bash
npm install
npm run build
```

## Usage

```bash
node dist/cli.js --pdf <chemin du PDF SolarEdge> --rangees <nombre de rangées> [--scenario sans-stockage|stockage] [--output <chemin de sortie>]
```

- `--pdf` (obligatoire) : chemin vers le rapport SolarEdge (PDF). Seules les
  pages 1 et 2 sont lues.
- `--rangees` (obligatoire) : nombre de rangées d'ombrières. Cette valeur
  n'apparaît nulle part en texte dans le PDF (probablement un label dans le
  schéma d'implantation, une image) — elle doit être saisie manuellement.
- `--scenario` (optionnel, défaut `sans-stockage`) : `sans-stockage` ou
  `stockage`. Sélectionne le template pptx et les règles d'extraction/calcul
  correspondantes.
- `--output` (optionnel) : chemin du pptx généré. Par défaut :
  `output/<nom-du-pdf>.pptx`.

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

### Scénario sans stockage (template `Scenario 1 sans stockage Projet_Ombriere_Rixhiem.pptx`)

- **Slide 1** : puissance installée (titre + corps), nombre de rangées.
- **Slide 2** : puissance installée (titre + corps), nombre de modules,
  production annuelle, ratio de performance, taux d'autoconsommation,
  surplus de production, taux d'autoproduction, et l'image du graphique
  "Résultats de consommation et de production annuelles" (dessiné à partir
  des valeurs extraites, 2 segments par barre).

Le reste du contenu (mise en forme, polices, autres slides) reste
strictement identique à l'original. Un chiffre volontairement laissé
inchangé (l'estimation marketing "52%" sur la slide 2, qui ne provient pas
du PDF) est signalé dans la sortie console.

### Scénario avec stockage (template `scenario 1 avec stockage Projet_Ombriere_Rixhiem.pptx`)

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
- **Slide 3** ("Énergie mensuelle estimée") : **non traitée**, laissée
  strictement identique à l'original.

## Développement

```bash
npm test   # vitest, contre les fixtures réelles de test/data/
npm run build
```

Voir `tasks/plan.md` et `tasks/todo.md` pour le détail de l'architecture et
des décisions prises pendant la conception.
