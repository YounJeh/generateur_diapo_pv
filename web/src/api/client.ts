import type { ApiErrorBody, ExtractResponse, GenerateResponse } from "./types";

async function parseErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as ApiErrorBody;
    return body.error ?? `Erreur ${response.status}`;
  } catch {
    return `Erreur ${response.status}`;
  }
}

export async function extractValues(formData: FormData): Promise<ExtractResponse> {
  const response = await fetch("/api/extract", { method: "POST", body: formData });
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
