import { del, list } from "@vercel/blob";

export const SESSION_FILE_TTL_MS = 24 * 60 * 60 * 1000;

export function isSessionFileExpired(uploadedAt: Date, now = Date.now()): boolean {
  return uploadedAt.getTime() <= now - SESSION_FILE_TTL_MS;
}

/** Includes abandoned uploads, which have no manifest. Other store prefixes are untouched. */
export async function cleanupExpiredSessionFiles(): Promise<number> {
  const now = Date.now();
  const abortSignal = AbortSignal.timeout(45_000);
  let cursor: string | undefined;
  let deleted = 0;
  do {
    const page = await list({ prefix: "sessions/", limit: 1000, cursor, abortSignal });
    const expired = page.blobs.filter((blob) => isSessionFileExpired(blob.uploadedAt, now));
    if (expired.length > 0) {
      await del(expired.map((blob) => blob.url), { abortSignal });
      deleted += expired.length;
    }
    if (!page.hasMore) return deleted;
    if (!page.cursor || page.cursor === cursor) {
      throw new Error("Pagination Blob invalide pendant la purge.");
    }
    cursor = page.cursor;
  } while (true);
}
