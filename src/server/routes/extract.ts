import { Router } from "express";
import { extractSansStockage, extractStockage } from "../../generate/extract.js";
import type { Groupe } from "../../generate/types.js";
import {
  createScratchDir,
  downloadPathnameToScratch,
  isUploadPathnameFor,
  isValidSessionId,
  removeScratchDir,
  writeSessionManifest,
} from "../sessions.js";

export const extractRouter = Router();

interface ExtractGroupeBody {
  rangees: unknown;
  pdfSansStockagePathname?: unknown;
  pdfAvecStockagePathname?: unknown;
}

extractRouter.post("/extract", async (req, res, next) => {
  const sessionId = req.body?.sessionId as string | undefined;
  const scenario = req.body?.scenario as string | undefined;

  if (typeof sessionId !== "string" || !isValidSessionId(sessionId)) {
    res.status(400).json({ error: "sessionId manquant ou invalide." });
    return;
  }

  let scratchDir: string | undefined;
  try {
    scratchDir = await createScratchDir();

    if (scenario === "sans-stockage" || scenario === "stockage") {
      const rangees = parsePositiveInt(req.body?.rangees);
      if (rangees === undefined) {
        res.status(400).json({ error: "Le champ rangees doit être un entier positif." });
        return;
      }
      const pdfPathname = req.body?.pdfPathname as string | undefined;
      if (typeof pdfPathname !== "string" || !isUploadPathnameFor(sessionId, pdfPathname)) {
        res.status(400).json({ error: "Fichier PDF manquant ou invalide (champ 'pdfPathname')." });
        return;
      }

      const pdfPath = await downloadPathnameToScratch(pdfPathname, scratchDir, "pdf.pdf");
      const values =
        scenario === "sans-stockage"
          ? await extractSansStockage(pdfPath, rangees)
          : await extractStockage(pdfPath, rangees);

      await writeSessionManifest(sessionId, { scenario, rangees, pdfPathname });

      res.json({ sessionId, scenario, values });
      return;
    }

    if (scenario === "comparaison") {
      let groupes: Groupe[];
      let manifestGroupes: Array<{
        rangees: number;
        pdfSansStockagePathname?: string;
        pdfAvecStockagePathname?: string;
      }>;
      try {
        ({ groupes, manifestGroupes } = await parseAndDownloadGroupes(
          sessionId,
          req.body?.groupes,
          scratchDir,
        ));
      } catch (validationError) {
        res.status(400).json({
          error: validationError instanceof Error ? validationError.message : String(validationError),
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
      }

      await writeSessionManifest(sessionId, { scenario, groupes: manifestGroupes });

      res.json({ sessionId, scenario, groupes: groupeResults });
      return;
    }

    res.status(400).json({ error: `Scénario invalide : "${scenario ?? ""}".` });
  } catch (error) {
    next(error);
  } finally {
    if (scratchDir) {
      await removeScratchDir(scratchDir);
    }
  }
});

function parsePositiveInt(raw: unknown): number | undefined {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return Math.trunc(raw);
  }
  if (typeof raw !== "string") {
    return undefined;
  }
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

/**
 * Valide les groupes envoyés par le client (chemins Blob, jamais des fichiers
 * directement), les télécharge dans le scratch dir de la requête, et
 * reconstruit à la fois les `Groupe` (chemins locaux, pour l'extraction) et
 * les entrées de manifest (pathnames Blob, pour une génération ultérieure).
 */
async function parseAndDownloadGroupes(
  sessionId: string,
  rawGroupes: unknown,
  scratchDir: string,
): Promise<{
  groupes: Groupe[];
  manifestGroupes: Array<{
    rangees: number;
    pdfSansStockagePathname?: string;
    pdfAvecStockagePathname?: string;
  }>;
}> {
  if (!Array.isArray(rawGroupes)) {
    throw new Error("Le champ groupes doit être un tableau.");
  }

  const groupes: Groupe[] = [];
  const manifestGroupes: Array<{
    rangees: number;
    pdfSansStockagePathname?: string;
    pdfAvecStockagePathname?: string;
  }> = [];

  for (let index = 0; index < rawGroupes.length; index += 1) {
    const n = index + 1;
    const raw = rawGroupes[index] as ExtractGroupeBody;
    const rangees = parsePositiveInt(raw?.rangees);
    if (rangees === undefined) {
      throw new Error(`Le champ groupe-${n}-rangees doit être un entier positif.`);
    }

    const pdfSansStockagePathname = validateOptionalPathname(
      sessionId,
      raw?.pdfSansStockagePathname,
      `groupe-${n}-pdf-sans-stockage`,
    );
    const pdfAvecStockagePathname = validateOptionalPathname(
      sessionId,
      raw?.pdfAvecStockagePathname,
      `groupe-${n}-pdf-avec-stockage`,
    );
    if (!pdfSansStockagePathname && !pdfAvecStockagePathname) {
      throw new Error(
        `Le groupe ${n} doit fournir au moins un PDF (sans-stockage et/ou avec-stockage).`,
      );
    }

    const pdfSansStockage = pdfSansStockagePathname
      ? await downloadPathnameToScratch(
          pdfSansStockagePathname,
          scratchDir,
          `groupe-${n}-sans-stockage.pdf`,
        )
      : undefined;
    const pdfAvecStockage = pdfAvecStockagePathname
      ? await downloadPathnameToScratch(
          pdfAvecStockagePathname,
          scratchDir,
          `groupe-${n}-avec-stockage.pdf`,
        )
      : undefined;

    groupes.push({ rangees, pdfSansStockage, pdfAvecStockage });
    manifestGroupes.push({ rangees, pdfSansStockagePathname, pdfAvecStockagePathname });
  }

  return { groupes, manifestGroupes };
}

function validateOptionalPathname(
  sessionId: string,
  raw: unknown,
  expectedFieldname: string,
): string | undefined {
  if (raw === undefined || raw === null) {
    return undefined;
  }
  if (typeof raw !== "string" || !isUploadPathnameFor(sessionId, raw) || !raw.includes(`/${expectedFieldname}.pdf`)) {
    throw new Error(`Chemin de fichier invalide pour "${expectedFieldname}".`);
  }
  return raw;
}
