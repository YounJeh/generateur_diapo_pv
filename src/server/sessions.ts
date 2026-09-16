import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Scenario } from "../generate/types.js";

const RUNTIME_DIR = path.join(process.cwd(), "runtime");
const UPLOADS_DIR = path.join(RUNTIME_DIR, "uploads");
const OUTPUT_DIR = path.join(RUNTIME_DIR, "output");
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export { OUTPUT_DIR };

// `sessionId` peut venir d'un paramètre d'URL fourni par le client
// (`POST /api/generate/:sessionId`) : sans cette validation, une valeur
// forgée contenant "../" atteindrait `path.join` ci-dessous et permettrait
// une traversée de chemin. `createSessionId()` produit toujours un UUID, donc
// ce format n'est jamais trop restrictif pour un usage normal.
const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidSessionId(sessionId: string): boolean {
  return SESSION_ID_PATTERN.test(sessionId);
}

function assertValidSessionId(sessionId: string): void {
  if (!isValidSessionId(sessionId)) {
    throw new Error(`Identifiant de session invalide : "${sessionId}".`);
  }
}

/**
 * Ce qu'une extraction (`POST /api/extract`) enregistre pour qu'une
 * génération ultérieure (`POST /api/generate/:sessionId`) puisse relire les
 * mêmes fichiers PDF sans nouvel upload. `pdfFilename`/`pdfSansStockageFilename`/
 * `pdfAvecStockageFilename` sont relatifs au dossier de session
 * (`sessionUploadDir`), jamais des chemins absolus (le dossier peut être
 * déplacé/reconstruit).
 */
export type SessionManifest =
  | { scenario: Extract<Scenario, "sans-stockage" | "stockage">; rangees: number; pdfFilename: string }
  | {
      scenario: "comparaison";
      groupes: Array<{
        rangees: number;
        pdfSansStockageFilename?: string;
        pdfAvecStockageFilename?: string;
      }>;
    };

export function createSessionId(): string {
  return randomUUID();
}

export function sessionUploadDir(sessionId: string): string {
  assertValidSessionId(sessionId);
  return path.join(UPLOADS_DIR, sessionId);
}

export async function ensureSessionUploadDir(sessionId: string): Promise<string> {
  const dir = sessionUploadDir(sessionId);
  await mkdir(dir, { recursive: true });
  return dir;
}

function manifestPath(sessionId: string): string {
  return path.join(sessionUploadDir(sessionId), "manifest.json");
}

export async function writeSessionManifest(
  sessionId: string,
  manifest: SessionManifest,
): Promise<void> {
  await writeFile(manifestPath(sessionId), JSON.stringify(manifest), "utf-8");
}

/** Renvoie `undefined` si la session n'existe pas ou a expiré/été nettoyée. */
export async function readSessionManifest(
  sessionId: string,
): Promise<SessionManifest | undefined> {
  try {
    const raw = await readFile(manifestPath(sessionId), "utf-8");
    return JSON.parse(raw) as SessionManifest;
  } catch {
    return undefined;
  }
}

export function sessionOutputPptxPath(sessionId: string): string {
  assertValidSessionId(sessionId);
  return path.join(OUTPUT_DIR, `${sessionId}.pptx`);
}

export function sessionOutputPreviewDir(sessionId: string): string {
  assertValidSessionId(sessionId);
  return path.join(OUTPUT_DIR, `${sessionId}-preview`);
}

export async function ensureOutputDir(): Promise<void> {
  await mkdir(OUTPUT_DIR, { recursive: true });
}

/** Purge best-effort des sessions plus vieilles que le TTL, au démarrage du serveur. */
export async function cleanupStaleSessions(): Promise<void> {
  await cleanupStaleEntriesIn(UPLOADS_DIR);
  await cleanupStaleEntriesIn(OUTPUT_DIR);
}

async function cleanupStaleEntriesIn(dir: string): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return; // dossier pas encore créé, rien à nettoyer
  }
  const now = Date.now();
  for (const entry of entries) {
    const entryPath = path.join(dir, entry);
    try {
      const info = await stat(entryPath);
      if (now - info.mtimeMs > SESSION_TTL_MS) {
        await rm(entryPath, { recursive: true, force: true });
      }
    } catch {
      // Entrée disparue entre le readdir et le stat/rm : ignorée.
    }
  }
}
