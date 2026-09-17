import { createApp } from "../dist/server/app.js";

// Point d'entrée Vercel : `src/server/index.ts` (utilisé par `npm start` en
// local) appelle `app.listen(...)`, ce qui n'a pas de sens pour une fonction
// serverless — Vercel appelle directement l'app Express (elle-même un
// handler `(req, res)`) à chaque requête. Importe le build compilé
// (`npm run build`, exécuté par Vercel comme Build Command) plutôt que la
// source TS, pour rester sur le même code que celui testé en local.
export default createApp();
