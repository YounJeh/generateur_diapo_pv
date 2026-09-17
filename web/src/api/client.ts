import { upload } from "@vercel/blob/client";
import type { FormState } from "../state/formState";
import type { ApiErrorBody, ExtractResponse, GenerateResponse } from "./types";

async function parseErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as ApiErrorBody;
    return body.error ?? `Erreur ${response.status}`;
  } catch {
    return `Erreur ${response.status}`;
  }
}

/**
 * Upload direct navigateur → Vercel Blob : contourne la limite de 4,5 Mo par
 * requête des fonctions serverless Vercel (bloquante pour "comparaison", qui
 * envoie plusieurs PDF réels de ~2,3 Mo). Le serveur n'autorise un token que
 * pour un pathname `sessions/<sessionId>/uploads/<fieldname>.pdf`, avec
 * `sessionId` transmis via `clientPayload` (voir src/server/routes/blobUploadToken.ts).
 */
async function uploadPdf(sessionId: string, fieldname: string, file: File): Promise<string> {
  const pathname = `sessions/${sessionId}/uploads/${fieldname}.pdf`;
  const result = await upload(pathname, file, {
    access: "private",
    contentType: "application/pdf",
    handleUploadUrl: "/api/blob/upload-token",
    clientPayload: sessionId,
  });
  return result.pathname;
}

async function buildExtractRequestBody(form: FormState, sessionId: string): Promise<unknown> {
  if (form.scenario === "comparaison") {
    return {
      sessionId,
      scenario: form.scenario,
      groupes: await Promise.all(
        form.groupes.map(async (groupe, index) => {
          const n = index + 1;
          return {
            rangees: groupe.rangees,
            pdfSansStockagePathname: groupe.pdfSansStockage
              ? await uploadPdf(sessionId, `groupe-${n}-pdf-sans-stockage`, groupe.pdfSansStockage)
              : undefined,
            pdfAvecStockagePathname: groupe.pdfAvecStockage
              ? await uploadPdf(sessionId, `groupe-${n}-pdf-avec-stockage`, groupe.pdfAvecStockage)
              : undefined,
          };
        }),
      ),
    };
  }

  return {
    sessionId,
    scenario: form.scenario,
    rangees: form.rangees,
    pdfPathname: form.pdf ? await uploadPdf(sessionId, "pdf", form.pdf) : undefined,
  };
}

export async function extractValues(form: FormState): Promise<ExtractResponse> {
  const sessionId = crypto.randomUUID();
  const body = await buildExtractRequestBody(form, sessionId);

  const response = await fetch("/api/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }
  return (await response.json()) as ExtractResponse;
}

export async function generatePptx(sessionId: string): Promise<GenerateResponse> {
  const response = await fetch(`/api/generate/${sessionId}`, { method: "POST" });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }
  return (await response.json()) as GenerateResponse;
}
