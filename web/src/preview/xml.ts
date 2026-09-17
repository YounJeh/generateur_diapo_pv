import { strFromU8, unzipSync } from "fflate";

export function children(node: Element | undefined, name: string): Element[] {
  return Array.from(node?.children ?? []).filter((child) => child.localName === name);
}

export function child(node: Element | undefined, name: string): Element | undefined {
  return children(node, name)[0];
}

export function descendant(node: Element | undefined, name: string): Element | undefined {
  return node?.getElementsByTagNameNS("*", name)[0];
}

export function number(node: Element | undefined, name: string, fallback = 0): number {
  const value = node?.getAttribute(name);
  return value === null || value === undefined ? fallback : Number(value);
}

export function openPresentation(buffer: ArrayBuffer) {
  const files = unzipSync(new Uint8Array(buffer));
  const urls = new Map<string, string>();
  function xml(path: string): Element {
    if (!files[path]) throw new Error(`Élément de présentation introuvable : ${path}`);
    const doc = new DOMParser().parseFromString(strFromU8(files[path]), "application/xml");
    if (doc.getElementsByTagName("parsererror").length) throw new Error("Présentation illisible.");
    return doc.documentElement;
  }
  function relationships(path: string) {
    const directory = path.slice(0, path.lastIndexOf("/") + 1);
    const relPath = `${directory}_rels/${path.slice(directory.length)}.rels`;
    if (!files[relPath]) return [];
    return children(xml(relPath), "Relationship")
      .filter((rel) => rel.getAttribute("TargetMode") !== "External")
      .map((rel) => ({
        id: rel.getAttribute("Id"),
        type: rel.getAttribute("Type")?.split("/").at(-1),
        path: new URL(rel.getAttribute("Target")!, `https://pptx.local/${path}`).pathname.slice(1),
      }));
  }
  function image(path: string): string {
    const existing = urls.get(path);
    if (existing) return existing;
    const extension = path.split(".").at(-1)?.toLowerCase();
    const mime = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg" }[extension ?? ""];
    if (!mime || !files[path]) throw new Error(`Image d’aperçu non prise en charge : ${path}`);
    const url = URL.createObjectURL(new Blob([files[path].slice().buffer], { type: mime }));
    urls.set(path, url);
    return url;
  }
  return {
    xml, relationships, image,
    dispose: () => { urls.forEach((url) => URL.revokeObjectURL(url)); urls.clear(); },
  };
}

// Un pixel de la scène correspond à un point typographique PowerPoint.
export const emuToPx = (value: number) => value / 12700;
