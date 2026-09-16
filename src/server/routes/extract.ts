import { Router, type Request } from "express";
import multer from "multer";
import path from "node:path";
import { extractSansStockage, extractStockage } from "../../generate/extract.js";
import type { Groupe } from "../../generate/types.js";
import { createSessionId, ensureSessionUploadDir, writeSessionManifest } from "../sessions.js";

const MAX_FILE_SIZE_BYTES = 35 * 1024 * 1024;

// Seuls ces noms de champ sont attendus (même convention que les flags CLI
// --groupe-N-pdf-*). `filename` ci-dessous construit le nom de fichier sur
// disque à partir de `file.fieldname` : sans cet allowlist, un champ forgé
// (ex. "../../../../etc/cron.d/x") permettrait une traversée de chemin lors
// de l'écriture (multer ne sanitize pas `filename` avant `path.join`).
const ALLOWED_FIELDNAME_PATTERN = /^(pdf|groupe-\d+-pdf-(sans|avec)-stockage)$/;

interface RequestWithSessionId extends Request {
  sessionId?: string;
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, callback) => {
      const sessionId = (req as RequestWithSessionId).sessionId;
      if (!sessionId) {
        callback(new Error("sessionId manquant (middleware non exécuté)"), "");
        return;
      }
      ensureSessionUploadDir(sessionId)
        .then((dir) => callback(null, dir))
        .catch((error: unknown) => callback(error as Error, ""));
    },
    filename: (_req, file, callback) => {
      callback(null, `${file.fieldname}${path.extname(file.originalname) || ".pdf"}`);
    },
  }),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (_req, file, callback) => {
    if (!ALLOWED_FIELDNAME_PATTERN.test(file.fieldname)) {
      callback(new Error(`Champ de fichier inattendu : "${file.fieldname}".`));
      return;
    }
    callback(null, true);
  },
});

export const extractRouter = Router();

extractRouter.post(
  "/extract",
  (req: RequestWithSessionId, _res, next) => {
    req.sessionId = createSessionId();
    next();
  },
  upload.any(),
  async (req: RequestWithSessionId, res, next) => {
    const sessionId = req.sessionId!;
    const scenario = req.body.scenario as string | undefined;
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];

    try {
      if (scenario === "sans-stockage" || scenario === "stockage") {
        const rangees = parsePositiveInt(req.body.rangees);
        if (rangees === undefined) {
          res.status(400).json({ error: "Le champ rangees doit être un entier positif." });
          return;
        }
        const file = files.find((f) => f.fieldname === "pdf");
        if (!file) {
          res.status(400).json({ error: "Fichier PDF manquant (champ 'pdf')." });
          return;
        }

        const values =
          scenario === "sans-stockage"
            ? await extractSansStockage(file.path, rangees)
            : await extractStockage(file.path, rangees);

        await writeSessionManifest(sessionId, { scenario, rangees, pdfFilename: file.filename });

        res.json({ sessionId, scenario, values });
        return;
      }

      if (scenario === "comparaison") {
        let groupes: Groupe[];
        try {
          groupes = parseGroupesFromRequest(req.body, files);
        } catch (validationError) {
          res.status(400).json({
            error:
              validationError instanceof Error ? validationError.message : String(validationError),
          });
          return;
        }
        if (groupes.length === 0) {
          res.status(400).json({
            error:
              "Au moins un groupe (rangées + un PDF sans-stockage et/ou avec-stockage) est requis.",
          });
          return;
        }

        const groupeResults = [];
        const manifestGroupes: Array<{
          rangees: number;
          pdfSansStockageFilename?: string;
          pdfAvecStockageFilename?: string;
        }> = [];

        for (let index = 0; index < groupes.length; index += 1) {
          const groupe = groupes[index];
          const cases = [];

          if (groupe.pdfSansStockage) {
            const values = await extractSansStockage(groupe.pdfSansStockage, groupe.rangees);
            cases.push({ scenario: "sans-stockage" as const, values });
          }
          if (groupe.pdfAvecStockage) {
            const values = await extractStockage(groupe.pdfAvecStockage, groupe.rangees);
            cases.push({ scenario: "stockage" as const, values });
          }

          groupeResults.push({ scenarioNumero: index + 1, rangees: groupe.rangees, cases });
          manifestGroupes.push({
            rangees: groupe.rangees,
            pdfSansStockageFilename: groupe.pdfSansStockage
              ? path.basename(groupe.pdfSansStockage)
              : undefined,
            pdfAvecStockageFilename: groupe.pdfAvecStockage
              ? path.basename(groupe.pdfAvecStockage)
              : undefined,
          });
        }

        await writeSessionManifest(sessionId, { scenario, groupes: manifestGroupes });

        res.json({ sessionId, scenario, groupes: groupeResults });
        return;
      }

      res.status(400).json({ error: `Scénario invalide : "${scenario ?? ""}".` });
    } catch (error) {
      next(error);
    }
  },
);

function parsePositiveInt(raw: unknown): number | undefined {
  if (typeof raw !== "string") {
    return undefined;
  }
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

/**
 * Reconstruit les groupes de dimensionnement à partir des champs
 * `groupe-N-rangees` (texte) et `groupe-N-pdf-sans-stockage`/`groupe-N-pdf-avec-stockage`
 * (fichiers), même convention de nommage que les flags CLI
 * (`--groupe-N-rangees`, etc.) pour rester cohérent entre les deux interfaces.
 *
 * Lève une erreur explicite (plutôt que d'ignorer silencieusement le groupe)
 * si un groupe référencé par `groupe-N-*` a des rangées invalides ou aucun
 * PDF — un groupe manquant sans erreur produirait une comparaison plus
 * pauvre que ce que l'utilisateur a soumis, sans aucune indication.
 */
function parseGroupesFromRequest(
  body: Record<string, unknown>,
  files: Express.Multer.File[],
): Groupe[] {
  const indexPattern = /^groupe-(\d+)-rangees$/;
  const indices = new Set<number>();
  for (const key of Object.keys(body)) {
    const match = key.match(indexPattern);
    if (match) {
      indices.add(Number.parseInt(match[1], 10));
    }
  }

  const sortedIndices = [...indices].sort((a, b) => a - b);
  const groupes: Groupe[] = [];
  for (const n of sortedIndices) {
    const rangees = parsePositiveInt(body[`groupe-${n}-rangees`]);
    if (rangees === undefined) {
      throw new Error(`Le champ groupe-${n}-rangees doit être un entier positif.`);
    }
    const pdfSansStockage = files.find((f) => f.fieldname === `groupe-${n}-pdf-sans-stockage`)
      ?.path;
    const pdfAvecStockage = files.find((f) => f.fieldname === `groupe-${n}-pdf-avec-stockage`)
      ?.path;
    if (!pdfSansStockage && !pdfAvecStockage) {
      throw new Error(
        `Le groupe ${n} doit fournir au moins un PDF (sans-stockage et/ou avec-stockage).`,
      );
    }
    groupes.push({ rangees, pdfSansStockage, pdfAvecStockage });
  }
  return groupes;
}
