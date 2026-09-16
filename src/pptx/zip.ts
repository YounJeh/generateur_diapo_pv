import AdmZip from "adm-zip";

export type Pptx = AdmZip;

export function openPptx(path: string): Pptx {
  return new AdmZip(path);
}

function requireEntry(zip: Pptx, entryPath: string) {
  const entry = zip.getEntry(entryPath);
  if (!entry) {
    throw new Error(`Entrée introuvable dans le pptx : ${entryPath}`);
  }
  return entry;
}

export function getEntryText(zip: Pptx, entryPath: string): string {
  return zip.readAsText(requireEntry(zip, entryPath));
}

export function setEntryText(
  zip: Pptx,
  entryPath: string,
  content: string,
): void {
  requireEntry(zip, entryPath);
  zip.updateFile(entryPath, Buffer.from(content, "utf-8"));
}

export function getEntryBuffer(zip: Pptx, entryPath: string): Buffer {
  const entry = requireEntry(zip, entryPath);
  const buffer = zip.readFile(entry);
  if (!buffer) {
    throw new Error(`Impossible de lire l'entrée du pptx : ${entryPath}`);
  }
  return buffer;
}

export function setEntryBuffer(
  zip: Pptx,
  entryPath: string,
  content: Buffer,
): void {
  requireEntry(zip, entryPath);
  zip.updateFile(entryPath, content);
}

export function addEntryText(
  zip: Pptx,
  entryPath: string,
  content: string,
): void {
  zip.addFile(entryPath, Buffer.from(content, "utf-8"));
}

export function addEntryBuffer(
  zip: Pptx,
  entryPath: string,
  content: Buffer,
): void {
  zip.addFile(entryPath, content);
}

export function writePptx(zip: Pptx, outputPath: string): void {
  zip.writeZip(outputPath);
}
