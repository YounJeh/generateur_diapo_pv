# generateur_diapo_pv

Mini-application TypeScript qui extrait des valeurs d'un rapport SolarEdge
(PDF) et met à jour un template PPTX de proposition commerciale PV avec ces
valeurs — texte et graphiques — sans toucher au reste de la mise en forme.
Trois scénarios sont pris en charge : "sans stockage" (2 slides, pages 1-2 du
PDF), "avec stockage" (3 slides, pages 1-3 du PDF), et "comparaison" (4
slides, combine les deux à partir d'une paire de PDF).

## Installation

```bash
npm install
npm run build
```

## Usage

```bash
node dist/cli.js --pdf <chemin du PDF SolarEdge> --rangees <nombre de rangées> [--scenario sans-stockage|stockage] [--output <chemin de sortie>]
```

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

Le scénario `comparaison` prend en entrée deux PDF au lieu d'un : un même
dimensionnement (mêmes ombrières/puissance), testé avec et sans stockage. Il
utilise `--pdf-sans-stockage` et `--pdf-avec-stockage` à la place de `--pdf` :

```bash
node dist/cli.js \
  --scenario comparaison \
  --pdf-sans-stockage "test/data/Solar_Edge_ITM_Rixhiem_3_omb_V2.pdf" \
  --pdf-avec-stockage "test/data/D_26_1223_Intermarche_Rixhiem_3_Omb_avec_stockage_V2.pdf" \
  --rangees 3
```

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

Combine les deux pipelines ci-dessus en un seul pptx de 4 slides : les 2
slides du scénario sans stockage, suivies des 2 dernières slides
(résultats + énergie mensuelle) du scénario avec stockage. La slide 1 du
scénario avec stockage n'est pas reprise, car elle serait identique à celle
du scénario sans stockage pour un même dimensionnement.

Si le nombre de modules ou la puissance installée extraits diffèrent entre
les deux PDF, un avertissement (non bloquant) est affiché : ces valeurs ne
dépendent que de l'implantation physique, pas du stockage, donc une
divergence suggère que les deux PDF ne décrivent pas le même dimensionnement.

## Développement

```bash
npm test   # vitest, contre les fixtures réelles de test/data/
npm run build
```

Voir `tasks/plan.md` et `tasks/todo.md` pour le détail de l'architecture et
des décisions prises pendant la conception.
