import {
  addEntryBuffer,
  addEntryText,
  getEntryBuffer,
  getEntryText,
  setEntryText,
  type Pptx,
} from "./zip.js";

const CONTENT_TYPES_ENTRY = "[Content_Types].xml";
const PRESENTATION_ENTRY = "ppt/presentation.xml";
const PRESENTATION_RELS_ENTRY = "ppt/_rels/presentation.xml.rels";

const SLIDE_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.presentationml.slide+xml";
const SLIDE_RELATIONSHIP_TYPE =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide";
const IMAGE_RELATIONSHIP_TYPE_SUFFIX = "/relationships/image";
const NOTES_SLIDE_RELATIONSHIP_TYPE_SUFFIX = "/relationships/notesSlide";

export interface RelationshipEntry {
  id: string;
  type: string;
  target: string;
}

/**
 * Copie les slides `slideNumbers` de `extra` (dans l'ordre donné) à la suite
 * des slides existantes de `base`, en renumérotant slides/médias/relations
 * pour éviter toute collision. Suppose que `base` et `extra` partagent le
 * même slideMaster/slideLayouts (vrai pour les templates sans-stockage et
 * avec-stockage de ce projet, vérifié par hash) : les relations de type
 * slideLayout sont donc conservées telles quelles vers `base`, sans copie.
 * Les notes de la slide source (relation notesSlide) ne sont pas reportées.
 */
export function appendSlides(
  base: Pptx,
  extra: Pptx,
  slideNumbers: readonly number[],
): void {
  let nextSlideNumber = highestSlideNumber(base) + 1;

  for (const sourceSlideNumber of slideNumbers) {
    copySlide(base, extra, sourceSlideNumber, nextSlideNumber);
    nextSlideNumber += 1;
  }
}

function highestSlideNumber(zip: Pptx): number {
  const relationships = parseRelationships(
    getEntryText(zip, PRESENTATION_RELS_ENTRY),
  );
  let max = 0;
  for (const rel of relationships) {
    const match = rel.target.match(/^slides\/slide(\d+)\.xml$/);
    if (match) {
      max = Math.max(max, Number.parseInt(match[1], 10));
    }
  }
  return max;
}

function copySlide(
  base: Pptx,
  extra: Pptx,
  sourceSlideNumber: number,
  targetSlideNumber: number,
): void {
  const slideXml = getEntryText(
    extra,
    `ppt/slides/slide${sourceSlideNumber}.xml`,
  );
  const relationships = parseRelationships(
    getEntryText(extra, `ppt/slides/_rels/slide${sourceSlideNumber}.xml.rels`),
  );

  const keptRelationships = relationships
    .filter((rel) => !rel.type.endsWith(NOTES_SLIDE_RELATIONSHIP_TYPE_SUFFIX))
    .map((rel) =>
      rel.type.endsWith(IMAGE_RELATIONSHIP_TYPE_SUFFIX)
        ? { ...rel, target: copyMedia(base, extra, rel.target, targetSlideNumber) }
        : rel,
    );

  addEntryText(base, `ppt/slides/slide${targetSlideNumber}.xml`, slideXml);
  addEntryText(
    base,
    `ppt/slides/_rels/slide${targetSlideNumber}.xml.rels`,
    buildRelationshipsXml(keptRelationships),
  );

  registerSlideInContentTypes(base, targetSlideNumber);
  registerSlideInPresentation(base, targetSlideNumber);
}

/** Copie le fichier média référencé par une relation d'image sous un nom garanti unique dans `base`. */
function copyMedia(
  base: Pptx,
  extra: Pptx,
  relativeTarget: string,
  targetSlideNumber: number,
): string {
  const mediaName = relativeTarget.replace(/^.*\//, "");
  const buffer = getEntryBuffer(extra, `ppt/media/${mediaName}`);
  const newMediaName = `slide${targetSlideNumber}-${mediaName}`;
  addEntryBuffer(base, `ppt/media/${newMediaName}`, buffer);
  return `../media/${newMediaName}`;
}

function registerSlideInContentTypes(zip: Pptx, slideNumber: number): void {
  const xml = getEntryText(zip, CONTENT_TYPES_ENTRY);
  const override = `<Override ContentType="${SLIDE_CONTENT_TYPE}" PartName="/ppt/slides/slide${slideNumber}.xml"/>`;
  setEntryText(
    zip,
    CONTENT_TYPES_ENTRY,
    xml.replace("</Types>", `${override}</Types>`),
  );
}

function registerSlideInPresentation(zip: Pptx, slideNumber: number): void {
  const relsXml = getEntryText(zip, PRESENTATION_RELS_ENTRY);
  const relationships = parseRelationships(relsXml);
  const rid = `rId${nextNumericSuffix(relationships.map((rel) => rel.id), "rId")}`;

  setEntryText(
    zip,
    PRESENTATION_RELS_ENTRY,
    relsXml.replace(
      "</Relationships>",
      `<Relationship Id="${rid}" Type="${SLIDE_RELATIONSHIP_TYPE}" Target="slides/slide${slideNumber}.xml"/></Relationships>`,
    ),
  );

  const presentationXml = getEntryText(zip, PRESENTATION_ENTRY);
  const existingIds = [...presentationXml.matchAll(/<p:sldId id="(\d+)"/g)].map(
    (match) => Number.parseInt(match[1], 10),
  );
  const nextId = Math.max(...existingIds) + 1;
  setEntryText(
    zip,
    PRESENTATION_ENTRY,
    presentationXml.replace(
      "</p:sldIdLst>",
      `<p:sldId id="${nextId}" r:id="${rid}"/></p:sldIdLst>`,
    ),
  );
}

/** Réutilisé par `graftSlide.ts` pour la fusion inter-templates (masters/layouts distincts). */
export function parseRelationships(relsXml: string): RelationshipEntry[] {
  const entries: RelationshipEntry[] = [];
  for (const tag of relsXml.match(/<Relationship\b[^>]*\/>/g) ?? []) {
    const id = tag.match(/\bId="([^"]+)"/)?.[1];
    const type = tag.match(/\bType="([^"]+)"/)?.[1];
    const target = tag.match(/\bTarget="([^"]+)"/)?.[1];
    if (!id || !type || !target) {
      throw new Error(`Relation mal formée dans un .rels : ${tag}`);
    }
    entries.push({ id, type, target });
  }
  return entries;
}

/** Réutilisé par `graftSlide.ts`. */
export function buildRelationshipsXml(
  relationships: readonly RelationshipEntry[],
): string {
  const items = relationships
    .map(
      (rel) =>
        `<Relationship Id="${rel.id}" Type="${rel.type}" Target="${rel.target}"/>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${items}</Relationships>`;
}

/** Réutilisé par `graftSlide.ts`. */
export function nextNumericSuffix(ids: readonly string[], prefix: string): number {
  let max = 0;
  for (const id of ids) {
    const match = id.match(new RegExp(`^${prefix}(\\d+)$`));
    if (match) {
      max = Math.max(max, Number.parseInt(match[1], 10));
    }
  }
  return max + 1;
}
