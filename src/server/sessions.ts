import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { get, issueSignedToken, presignUrl, put } from "@vercel/blob";
import type { Scenario } from "../generate/types.js";

const DOWNLOAD_URL_TTL_MS = 15 * 60 * 1000;

// `sessionId` peut venir d'un paramètre d'URL fourni par le client
// (`POST /api/generate/:sessionId`) ou d'un chemin de blob référencé dans le
// corps de `POST /api/extract` : sans cette validation, une valeur forgée
// permettrait de lire/écrire des blobs hors de `sessions/<sessionId>/`.
// `createSessionId()` produit toujours un UUID, donc ce format n'est jamais
// trop restrictif pour un usage normal.
const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Même convention que les flags CLI (`--groupe-N-pdf-*`) : un allowlist
// strict sur le nom de champ, utilisé à la fois pour émettre un token
// d'upload et pour valider les chemins de blob référencés à l'extraction.
export const ALLOWED_UPLOAD_FIELDNAME_PATTERN =
  /^(pdf|groupe-\d+-pdf-(sans|avec)-stockage)$/;

export function isValidSessionId(sessionId: string): boolean {
  return SESSION_ID_PATTERN.test(sessionId);
}

function assertValidSessionId(sessionId: string): void {
  if (!isValidSessionId(sessionId)) {
    throw new Error(`Identifiant de session invalide : "${sessionId}".`);
  }
}

export function createSessionId(): string {
  return randomUUID();
}

/**
 * Construit le pathname Blob attendu pour un upload de session, et vérifie
 * qu'il correspond bien à ce sessionId + fieldname (jamais de valeur du
 * client prise telle quelle : un pathname arbitraire donnerait accès aux
 * blobs de n'importe quelle autre session).
 */
export function uploadPathname(sessionId: string, fieldname: string): string {
  assertValidSessionId(sessionId);
  if (!ALLOWED_UPLOAD_FIELDNAME_PATTERN.test(fieldname)) {
    throw new Error(`Champ de fichier inattendu : "${fieldname}".`);
  }
  return `sessions/${sessionId}/uploads/${fieldname}.pdf`;
}

const UPLOAD_PATHNAME_PATTERN = /^sessions\/([0-9a-f-]{36})\/uploads\/([a-z0-9-]+)\.pdf$/i;

/**
 * Valide un pathname de blob référencé par le client (dans le corps de
 * `POST /api/extract`, ou demandé au moment d'émettre un token d'upload) :
 * doit être un chemin d'upload de session bien formé, pour le `sessionId`
 * fourni. Sans ce contrôle, un pathname forgé donnerait accès aux blobs
 * (PDF) de n'importe quelle autre session.
 */
export function isUploadPathnameFor(sessionId: string, pathname: string): boolean {
  if (!isValidSessionId(sessionId)) {
    return false;
  }
  const match = UPLOAD_PATHNAME_PATTERN.exec(pathname);
  if (!match) {
    return false;
  }
  const [, pathSessionId, fieldname] = match;
  return pathSessionId.toLowerCase() === sessionId.toLowerCase() &&
    ALLOWED_UPLOAD_FIELDNAME_PATTERN.test(fieldname);
}

function manifestPathname(sessionId: string): string {
  assertValidSessionId(sessionId);
  return `sessions/${sessionId}/manifest.json`;
}

function outputPptxPathname(sessionId: string): string {
  assertValidSessionId(sessionId);
  return `sessions/${sessionId}/output.pptx`;
}

/**
 * Ce qu'une extraction (`POST /api/extract`) enregistre pour qu'une
 * génération ultérieure (`POST /api/generate/:sessionId`) puisse relire les
 * mêmes PDF sans nouvel upload. Les champs `pdf*Pathname` sont des pathnames
 * Blob (`sessions/<id>/uploads/...`), jamais des URLs signées (qui expirent).
 */
export type SessionManifest =
  | { scenario: Extract<Scenario, "sans-stockage" | "stockage">; rangees: number; pdfPathname: string }
  | {
      scenario: "comparaison";
      groupes: Array<{
        rangees: number;
        pdfSansStockagePathname?: string;
        pdfAvecStockagePathname?: string;
      }>;
    };

export async function writeSessionManifest(
  sessionId: string,
  manifest: SessionManifest,
): Promise<void> {
  await put(manifestPathname(sessionId), JSON.stringify(manifest), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

/** Renvoie `undefined` si la session n'existe pas ou a expiré/été nettoyée. */
export async function readSessionManifest(
  sessionId: string,
): Promise<SessionManifest | undefined> {
  if (!isValidSessionId(sessionId)) {
    return undefined;
  }
  try {
    const result = await get(manifestPathname(sessionId), { access: "private" });
    if (!result) {
      return undefined;
    }
    const text = await new Response(result.stream).text();
    return JSON.parse(text) as SessionManifest;
  } catch {
    return undefined;
  }
}

/** Dossier de travail local, valable uniquement le temps d'une requête (jamais partagé entre invocations serverless). */
export async function createScratchDir(): Promise<string> {
  const dir = path.join(os.tmpdir(), "generateur-diapo-pv", randomUUID());
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function removeScratchDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

/** Télécharge un blob (par pathname) vers un fichier local du scratch dir, et renvoie son chemin. */
export async function downloadPathnameToScratch(
  pathname: string,
  scratchDir: string,
  localFilename: string,
): Promise<string> {
  const result = await get(pathname, { access: "private" });
  if (!result) {
    throw new Error(`Fichier introuvable : "${pathname}".`);
  }
  const buffer = Buffer.from(await new Response(result.stream).arrayBuffer());
  const destPath = path.join(scratchDir, localFilename);
  await writeFile(destPath, buffer);
  return destPath;
}

export async function uploadOutputPptx(sessionId: string, data: Buffer): Promise<void> {
  await put(outputPptxPathname(sessionId), data, {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  });
}

/** URL de téléchargement signée et à durée de vie limitée pour un blob privé (le pptx généré, par ex.). */
export async function presignDownloadUrl(pathname: string): Promise<string> {
  const signed = await issueSignedToken({
    pathname,
    operations: ["get"],
    validUntil: Date.now() + DOWNLOAD_URL_TTL_MS,
  });
  const { presignedUrl } = await presignUrl(
    { clientSigningToken: signed.clientSigningToken, delegationToken: signed.delegationToken },
    { operation: "get", pathname, access: "private" },
  );
  return presignedUrl;
}

export function outputPptxDownloadPathname(sessionId: string): string {
  return outputPptxPathname(sessionId);
}

// NOTE : contrairement à l'ancien nettoyage sur disque local (TTL 24h balayé
// au démarrage du serveur), il n'y a pas de purge périodique des blobs de
// session ici : un job de nettoyage régulier (Vercel Cron) serait nécessaire,
// hors périmètre de ce déploiement.
