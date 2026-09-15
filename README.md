# generateur_diapo_pv

Mini-application TypeScript qui extrait des valeurs d'un rapport SolarEdge
(PDF, pages 1-2) et met à jour le template PPTX "Scenario 1 sans stockage"
avec ces valeurs — texte et graphique de la slide 2 — sans toucher au reste
de la mise en forme.

## Installation

```bash
npm install
npm run build
```

## Usage

```bash
node dist/cli.js --pdf <chemin du PDF SolarEdge> --rangees <nombre de rangées> [--output <chemin de sortie>]
```

- `--pdf` (obligatoire) : chemin vers le rapport SolarEdge (PDF). Seules les
  pages 1 et 2 sont lues.
- `--rangees` (obligatoire) : nombre de rangées d'ombrières. Cette valeur
  n'apparaît nulle part en texte dans le PDF (probablement un label dans le
  schéma d'implantation, une image) — elle doit être saisie manuellement.
- `--output` (optionnel) : chemin du pptx généré. Par défaut :
  `output/<nom-du-pdf>.pptx`.

Le template pptx utilisé est fixe : `test/data/Scenario 1 sans stockage
Projet_Ombriere_Rixhiem.pptx`. Seule cette variante est prise en charge pour
le moment (pas la version "avec stockage").

Exemple, avec les fixtures du dépôt :

```bash
node dist/cli.js \
  --pdf "test/data/Solar_Edge_ITM_Rixhiem_3_omb_V2.pdf" \
  --rangees 3
```

## Ce que l'outil remplace

- **Slide 1** : puissance installée (titre + corps), nombre de rangées.
- **Slide 2** : puissance installée (titre + corps), nombre de modules,
  production annuelle, ratio de performance, taux d'autoconsommation,
  surplus de production, taux d'autoproduction, et l'image du graphique
  "Résultats de consommation et de production annuelles" (rendue à partir
  du PDF et rognée automatiquement).

Le reste du contenu (mise en forme, polices, autres slides) reste
strictement identique à l'original. Un chiffre volontairement laissé
inchangé (l'estimation marketing "52%" sur la slide 2, qui ne provient pas
du PDF) est signalé dans la sortie console.

## Développement

```bash
npm test   # vitest, contre les fixtures réelles de test/data/
npm run build
```

Voir `tasks/plan.md` et `tasks/todo.md` pour le détail de l'architecture et
des décisions prises pendant la conception.
