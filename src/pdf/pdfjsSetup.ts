import { createRequire } from "node:module";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

/**
 * pdfjs (même en environnement Node) charge le moteur de parsing/rendu via
 * `pdfjsLib.GlobalWorkerOptions.workerSrc`, résolu par défaut à
 * `./pdf.worker.mjs` relatif à `pdf.mjs`. Ce chemin est calculé dynamiquement
 * (`import(this.workerSrc)`), ce que le traceur de fichiers de Vercel (NFT)
 * ne détecte pas : le fichier n'était donc jamais inclus dans le bundle de la
 * fonction serverless (repéré en testant sur un vrai déploiement — erreur
 * "Setting up fake worker failed", fichier manquant dans /var/task).
 *
 * `require.resolve` avec un spécificateur statique est un idiome que NFT sait
 * tracer et inclure automatiquement (contrairement au calcul interne de
 * pdfjs). Préféré à `import.meta.resolve` (non polyfillé par le SSR de
 * Vitest, cf. `__vite_ssr_import_meta__.resolve is not a function`) — ne fait
 * que calculer un chemin, jamais charger le fichier comme un module CJS,
 * donc compatible avec ce `.mjs`.
 */
const require = createRequire(import.meta.url);
pdfjsLib.GlobalWorkerOptions.workerSrc = require.resolve(
  "pdfjs-dist/legacy/build/pdf.worker.mjs",
);
