export interface ReplaceResult {
  xml: string;
  applied: string[];
}

/**
 * Applique une table de correspondance texte-de-run -> texte-de-run sur un
 * XML de slide. Ne touche que le contenu de balises <a:t>...</a:t> entières
 * (jamais une sous-chaîne dans un attribut XML, ex. cx="744992").
 *
 * Lève une erreur explicite listant les clés introuvables plutôt que de
 * produire un pptx avec des valeurs manquantes en silence — un texte
 * attendu absent signale que le template a changé.
 */
export function replaceRuns(
  slideXml: string,
  replacements: Map<string, string>,
): ReplaceResult {
  let xml = slideXml;
  const applied: string[] = [];
  const missing: string[] = [];

  for (const [oldText, newText] of replacements) {
    const needle = `<a:t>${oldText}</a:t>`;
    if (!xml.includes(needle)) {
      missing.push(oldText);
      continue;
    }
    xml = xml.split(needle).join(`<a:t>${newText}</a:t>`);
    applied.push(oldText);
  }

  if (missing.length > 0) {
    throw new Error(
      `Remplacement(s) introuvable(s) dans le XML de la slide (le template a peut-être changé) : ${missing
        .map((text) => `"${text}"`)
        .join(", ")}`,
    );
  }

  return { xml, applied };
}
