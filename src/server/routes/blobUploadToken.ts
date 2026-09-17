import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { Router } from "express";
import { isUploadPathnameFor } from "../sessions.js";

const MAX_FILE_SIZE_BYTES = 35 * 1024 * 1024;

export const blobUploadTokenRouter = Router();

/**
 * Autorise un upload direct navigateur → Vercel Blob (contourne la limite de
 * 4,5 Mo par requête des fonctions serverless Vercel). Le client doit fournir
 * son propre `sessionId` (généré côté client) et ne peut obtenir un token que
 * pour un pathname `sessions/<sessionId>/uploads/<champ>.pdf` correspondant.
 */
blobUploadTokenRouter.post("/blob/upload-token", async (req, res) => {
  const sessionId = req.body?.sessionId as string | undefined;

  try {
    if (typeof sessionId !== "string" || sessionId.length === 0) {
      throw new Error("sessionId manquant.");
    }

    // Valider le pathname avant d'appeler `handleUpload` (qui exige
    // `BLOB_READ_WRITE_TOKEN`) : une valeur non autorisée est rejetée sans
    // toucher au stockage Blob.
    const body = req.body as HandleUploadBody;
    if (body?.type === "blob.generate-client-token") {
      const { pathname } = body.payload;
      if (!isUploadPathnameFor(sessionId, pathname)) {
        throw new Error(`Chemin d'upload non autorisé : "${pathname}".`);
      }
    }

    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        if (!isUploadPathnameFor(sessionId, pathname)) {
          throw new Error(`Chemin d'upload non autorisé : "${pathname}".`);
        }
        return {
          allowedContentTypes: ["application/pdf"],
          maximumSizeInBytes: MAX_FILE_SIZE_BYTES,
          addRandomSuffix: false,
          allowOverwrite: true,
        };
      },
    });
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});
