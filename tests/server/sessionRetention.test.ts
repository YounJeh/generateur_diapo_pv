import { randomUUID } from "node:crypto";
import { del, get, list, type GetBlobResult, type ListBlobResultBlob } from "@vercel/blob";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanupExpiredSessionFiles, SESSION_FILE_TTL_MS } from "../../src/server/sessionRetention.js";
import { downloadPathnameToScratch, readSessionManifest } from "../../src/server/sessions.js";

vi.mock("@vercel/blob", async (importOriginal) => ({
  ...await importOriginal<typeof import("@vercel/blob")>(),
  list: vi.fn(), del: vi.fn(), get: vi.fn(),
}));

afterEach(() => { vi.resetAllMocks(); });

function blob(pathname: string, age: number): ListBlobResultBlob {
  return {
    pathname, url: `https://store.example/${pathname}`, downloadUrl: `https://store.example/${pathname}`,
    size: 10, uploadedAt: new Date(Date.now() - age),
  };
}

function manifestResult(age: number): GetBlobResult {
  const data = JSON.stringify({ scenario: "sans-stockage", rangees: 3, pdfPathname: "pdf.pdf" });
  return {
    statusCode: 200, headers: new Headers(), stream: new Response(data).body!,
    blob: { ...blob("sessions/example/manifest.json", age),
      contentDisposition: "", cacheControl: "", etag: "test", contentType: "application/json" },
  };
}

describe("conservation des fichiers de session", () => {
  it("purge les pages suivantes et les uploads abandonnés, tout en conservant les fichiers récents", async () => {
    const abandoned = blob("sessions/abandoned/uploads/pdf.pdf", SESSION_FILE_TTL_MS + 1000);
    const recent = blob("sessions/recent/output.pptx", 1000);
    const manifest = blob("sessions/old/manifest.json", SESSION_FILE_TTL_MS + 1000);
    const preview = blob("sessions/old/preview/0.png", SESSION_FILE_TTL_MS + 1000);
    vi.mocked(list).mockResolvedValueOnce({ blobs: [abandoned, recent], hasMore: true, cursor: "next" })
      .mockResolvedValueOnce({ blobs: [manifest, preview], hasMore: false });
    expect(await cleanupExpiredSessionFiles()).toBe(3);
    expect(list).toHaveBeenNthCalledWith(1, expect.objectContaining({ prefix: "sessions/", cursor: undefined }));
    expect(list).toHaveBeenNthCalledWith(2, expect.objectContaining({ cursor: "next" }));
    expect(del).toHaveBeenNthCalledWith(1, [abandoned.url], expect.anything());
    expect(del).toHaveBeenNthCalledWith(2, [manifest.url, preview.url], expect.anything());
  });

  it("ne supprime rien quand tous les fichiers sont récents", async () => {
    vi.mocked(list).mockResolvedValue({ blobs: [blob("sessions/fresh/uploads/pdf.pdf", 100)], hasMore: false });
    expect(await cleanupExpiredSessionFiles()).toBe(0);
    expect(del).not.toHaveBeenCalled();
  });

  it("signale une suppression échouée pour ne pas annoncer une purge réussie", async () => {
    vi.mocked(list).mockResolvedValue({ blobs: [blob("sessions/old/output.pptx", SESSION_FILE_TTL_MS + 1000)], hasMore: false });
    vi.mocked(del).mockRejectedValue(new Error("Blob unavailable"));
    await expect(cleanupExpiredSessionFiles()).rejects.toThrow("Blob unavailable");
  });

  it("rejette les sessions expirées même avant la purge", async () => {
    vi.mocked(get).mockResolvedValue(manifestResult(SESSION_FILE_TTL_MS + 1000));
    expect(await readSessionManifest(randomUUID())).toBeUndefined();
  });

  it("conserve la lecture des sessions récentes", async () => {
    vi.mocked(get).mockResolvedValue(manifestResult(100));
    expect(await readSessionManifest(randomUUID())).toMatchObject({ scenario: "sans-stockage", rangees: 3 });
  });

  it("ne télécharge pas un PDF expiré dans le dossier temporaire", async () => {
    vi.mocked(get).mockResolvedValue(manifestResult(SESSION_FILE_TTL_MS + 1000));
    await expect(downloadPathnameToScratch("sessions/old/uploads/pdf.pdf", "/unused", "pdf.pdf"))
      .rejects.toThrow(/expiré/);
  });
});
