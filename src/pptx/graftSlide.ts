import path from "node:path";
import {
  buildRelationshipsXml,
  nextNumericSuffix,
  parseRelationships,
  type RelationshipEntry,
} from "./mergeSlides.js";
import {
  addEntryBuffer,
  addEntryText,
  getEntryBuffer,
  getEntryText,
  listEntryNames,
  setEntryText,
  type Pptx,
} from "./zip.js";

const CONTENT_TYPES_ENTRY = "[Content_Types].xml";
const PRESENTATION_ENTRY = "ppt/presentation.xml";
const PRESENTATION_RELS_ENTRY = "ppt/_rels/presentation.xml.rels";

const SLIDE_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.presentationml.slide+xml";
const SLIDE_LAYOUT_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml";
const SLIDE_MASTER_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml";
const THEME_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.theme+xml";

const RELS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const SLIDE_RELATIONSHIP_TYPE = `${RELS}/slide`;
const SLIDE_MASTER_RELATIONSHIP_TYPE = `${RELS}/slideMaster`;
const IMAGE_RELATIONSHIP_TYPE_SUFFIX = "/relationships/image";
const NOTES_SLIDE_RELATIONSHIP_TYPE_SUFFIX = "/relationships/notesSlide";
const SLIDE_LAYOUT_RELATIONSHIP_TYPE_SUFFIX = "/relationships/slideLayout";

/** Résout un `Target` relatif de `.rels` (ex. `../slideLayouts/slideLayout1.xml`) depuis le dossier de la partie qui le référence. */
function resolveTarget(partDir: string, target: string): string {
  return path.posix.normalize(path.posix.join(partDir, target));
}

function relsPathFor(partPath: string): string {
  const dir = path.posix.dirname(partPath);
  const base = path.posix.basename(partPath);
  return path.posix.join(dir, "_rels", `${base}.rels`);
}

function readRels(zip: Pptx, partPath: string): RelationshipEntry[] {
  return parseRelationships(getEntryText(zip, relsPathFor(partPath)));
}

function findRelByTypeSuffix(
  relationships: readonly RelationshipEntry[],
  typeSuffix: string,
  context: string,
): RelationshipEntry {
  const rel = relationships.find((r) => r.type.endsWith(typeSuffix));
  if (!rel) {
    throw new Error(`Relation "${typeSuffix}" introuvable pour ${context}.`);
  }
  return rel;
}

/** Prochain numéro libre pour des parties nommées `${dirPrefix}N.xml` dans `zip`. */
function nextPartNumber(zip: Pptx, dirPrefix: string): number {
  const pattern = new RegExp(`^${dirPrefix}(\\d+)\\.xml$`);
  let max = 0;
  for (const name of listEntryNames(zip)) {
    const match = name.match(pattern);
    if (match) {
      max = Math.max(max, Number.parseInt(match[1], 10));
    }
  }
  return max + 1;
}

function registerContentTypeOverride(zip: Pptx, contentType: string, partName: string): void {
  const xml = getEntryText(zip, CONTENT_TYPES_ENTRY);
  const override = `<Override ContentType="${contentType}" PartName="${partName}"/>`;
  setEntryText(zip, CONTENT_TYPES_ENTRY, xml.replace("</Types>", `${override}</Types>`));
}

/** Copie le fichier média référencé par une relation d'image sous un nom garanti unique dans `base`. */
function copyMediaWithPrefix(
  base: Pptx,
  source: Pptx,
  sourcePartDir: string,
  relativeTarget: string,
  prefix: string,
): string {
  const sourcePath = resolveTarget(sourcePartDir, relativeTarget);
  const mediaName = `${prefix}${path.posix.basename(sourcePath)}`;
  const buffer = getEntryBuffer(source, sourcePath);
  addEntryBuffer(base, `ppt/media/${mediaName}`, buffer);
  return `../media/${mediaName}`;
}

/**
 * Réécrit un jeu de relations pour `base` : chaque relation garde son `id`
 * d'origine (namespace de `r:id` propre à chaque fichier .rels — aucun
 * risque de collision entre relations d'un même fichier fraîchement créé),
 * seul le `target` d'une image est réécrit vers sa copie média fraîchement
 * ajoutée. Ne pas renuméroter les `id` évite tout risque de désynchronisation
 * avec les `r:embed`/`r:id` déjà présents dans le XML de la partie copiée.
 */
function rewriteImageTargets(
  base: Pptx,
  source: Pptx,
  sourcePartDir: string,
  relationships: readonly RelationshipEntry[],
  mediaPrefix: string,
): RelationshipEntry[] {
  return relationships.map((rel) =>
    rel.type.endsWith(IMAGE_RELATIONSHIP_TYPE_SUFFIX)
      ? { ...rel, target: copyMediaWithPrefix(base, source, sourcePartDir, rel.target, mediaPrefix) }
      : rel,
  );
}

/**
 * Réduit `<p:sldLayoutIdLst>` du master à la seule entrée dont le `r:id`
 * vaut `keepRid` (le layout qu'on importe réellement) — les 5 autres
 * layouts du master source ne sont pas copiés, les garder référencées
 * casserait le fichier. Le `r:id` n'est pas renuméroté (voir
 * `rewriteImageTargets`).
 */
function pruneSldLayoutIdLst(masterXml: string, keepRid: string): string {
  const list = masterXml.match(/<p:sldLayoutIdLst>[\s\S]*?<\/p:sldLayoutIdLst>/)?.[0];
  if (!list) {
    throw new Error("<p:sldLayoutIdLst> introuvable dans le slideMaster source.");
  }
  const entries = list.match(/<p:sldLayoutId\b[^/]*\/>/g) ?? [];
  const keep = entries.find((entry) => entry.includes(`r:id="${keepRid}"`));
  if (!keep) {
    throw new Error(`Entrée <p:sldLayoutId r:id="${keepRid}"/> introuvable.`);
  }
  return masterXml.replace(list, `<p:sldLayoutIdLst>${keep}</p:sldLayoutIdLst>`);
}

function registerMasterInPresentation(zip: Pptx, masterNumber: number): void {
  const relsXml = getEntryText(zip, PRESENTATION_RELS_ENTRY);
  const relationships = parseRelationships(relsXml);
  const rid = `rId${nextNumericSuffix(relationships.map((rel) => rel.id), "rId")}`;

  setEntryText(
    zip,
    PRESENTATION_RELS_ENTRY,
    relsXml.replace(
      "</Relationships>",
      `<Relationship Id="${rid}" Type="${SLIDE_MASTER_RELATIONSHIP_TYPE}" Target="slideMasters/slideMaster${masterNumber}.xml"/></Relationships>`,
    ),
  );

  const presentationXml = getEntryText(zip, PRESENTATION_ENTRY);
  const existingMasterIds = [
    ...presentationXml.matchAll(/<p:sldMasterId id="(\d+)"/g),
  ].map((match) => Number.parseInt(match[1], 10));
  const nextId = Math.max(2147483648, ...existingMasterIds) + 1;
  setEntryText(
    zip,
    PRESENTATION_ENTRY,
    presentationXml.replace(
      "</p:sldMasterIdLst>",
      `<p:sldMasterId id="${nextId}" r:id="${rid}"/></p:sldMasterIdLst>`,
    ),
  );
}

function registerSlideInPresentation(
  zip: Pptx,
  slideNumber: number,
  position: "prepend" | "append",
): void {
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
  const existingIds = [...presentationXml.matchAll(/<p:sldId id="(\d+)"/g)].map((match) =>
    Number.parseInt(match[1], 10),
  );
  const newEntry = `<p:sldId id="${Math.max(...existingIds) + 1}" r:id="${rid}"/>`;
  const newXml =
    position === "append"
      ? presentationXml.replace("</p:sldIdLst>", `${newEntry}</p:sldIdLst>`)
      : presentationXml.replace("<p:sldIdLst>", `<p:sldIdLst>${newEntry}`);
  setEntryText(zip, PRESENTATION_ENTRY, newXml);
}

/**
 * Copie une slide de `source` vers `base` avec sa propre chaîne
 * slideLayout → slideMaster → theme, quand `source` ne partage PAS le
 * master/layouts de `base` (contrairement à `appendSlides`, qui suppose un
 * master/layouts partagés et ne copie donc jamais ces parties).
 *
 * Une nouvelle copie du master/layout/theme est ajoutée à chaque appel,
 * même si deux appels successifs (ex. couverture + conclusion, toutes deux
 * issues du même pptx source) partagent le même master d'origine : la
 * dé-duplication inter-appels ajouterait de la complexité pour un gain
 * négligeable (quelques Ko par pptx généré).
 *
 * `position` place la nouvelle slide en tête (`"prepend"`) ou à la fin
 * (`"append"`) de `<p:sldIdLst>` — `appendSlides` ne gère que l'ajout en fin.
 *
 * Retourne le numéro de la nouvelle slide dans `base` (`ppt/slides/slide${N}.xml`),
 * pour permettre à l'appelant d'éditer son contenu juste après la greffe.
 */
export function graftSlide(
  base: Pptx,
  source: Pptx,
  sourceSlideNumber: number,
  position: "prepend" | "append",
): number {
  const sourceSlidePath = `ppt/slides/slide${sourceSlideNumber}.xml`;
  const sourceSlideRels = readRels(source, sourceSlidePath);
  const layoutRel = findRelByTypeSuffix(
    sourceSlideRels,
    SLIDE_LAYOUT_RELATIONSHIP_TYPE_SUFFIX,
    sourceSlidePath,
  );
  const sourceLayoutPath = resolveTarget("ppt/slides", layoutRel.target);

  const sourceLayoutRels = readRels(source, sourceLayoutPath);
  const masterRel = findRelByTypeSuffix(
    sourceLayoutRels,
    "/relationships/slideMaster",
    sourceLayoutPath,
  );
  const sourceMasterPath = resolveTarget("ppt/slideLayouts", masterRel.target);

  const sourceMasterRels = readRels(source, sourceMasterPath);
  const themeRel = findRelByTypeSuffix(sourceMasterRels, "/relationships/theme", sourceMasterPath);
  const sourceThemePath = resolveTarget("ppt/slideMasters", themeRel.target);
  const masterRelForLayout = sourceMasterRels.find(
    (rel) => resolveTarget("ppt/slideMasters", rel.target) === sourceLayoutPath,
  );
  if (!masterRelForLayout) {
    throw new Error(
      `Le master ${sourceMasterPath} ne référence pas le layout ${sourceLayoutPath}.`,
    );
  }

  const newSlideNumber = nextPartNumber(base, "ppt/slides/slide");
  const newLayoutNumber = nextPartNumber(base, "ppt/slideLayouts/slideLayout");
  const newMasterNumber = nextPartNumber(base, "ppt/slideMasters/slideMaster");
  const newThemeNumber = nextPartNumber(base, "ppt/theme/theme");
  const mediaPrefix = `graft${newSlideNumber}-`;

  // 1. Thème : copie telle quelle (pas de média/relations propres à gérer).
  addEntryText(base, `ppt/theme/theme${newThemeNumber}.xml`, getEntryText(source, sourceThemePath));
  registerContentTypeOverride(base, THEME_CONTENT_TYPE, `/ppt/theme/theme${newThemeNumber}.xml`);

  // 2. Master : `<p:sldLayoutIdLst>` réduit au seul layout importé ; ses
  // relations ne gardent que ce layout (target réécrit vers la copie) + le
  // thème fraîchement copié.
  const masterXml = pruneSldLayoutIdLst(
    getEntryText(source, sourceMasterPath),
    masterRelForLayout.id,
  );
  addEntryText(base, `ppt/slideMasters/slideMaster${newMasterNumber}.xml`, masterXml);
  registerContentTypeOverride(
    base,
    SLIDE_MASTER_CONTENT_TYPE,
    `/ppt/slideMasters/slideMaster${newMasterNumber}.xml`,
  );
  const newMasterRels: RelationshipEntry[] = [
    {
      ...masterRelForLayout,
      target: `../slideLayouts/slideLayout${newLayoutNumber}.xml`,
    },
    { ...themeRel, target: `../theme/theme${newThemeNumber}.xml` },
  ];
  addEntryText(
    base,
    `ppt/slideMasters/_rels/slideMaster${newMasterNumber}.xml.rels`,
    buildRelationshipsXml(newMasterRels),
  );

  // 3. Layout : copie le XML + ses médias propres (fonds/logos du layout),
  // relations réécrites vers le nouveau master + les copies média (`id`
  // d'origine conservés, seuls les `target` changent).
  addEntryText(base, `ppt/slideLayouts/slideLayout${newLayoutNumber}.xml`, getEntryText(source, sourceLayoutPath));
  registerContentTypeOverride(
    base,
    SLIDE_LAYOUT_CONTENT_TYPE,
    `/ppt/slideLayouts/slideLayout${newLayoutNumber}.xml`,
  );
  const layoutRelsWithNewMaster = sourceLayoutRels.map((rel) =>
    rel.id === masterRel.id
      ? { ...rel, target: `../slideMasters/slideMaster${newMasterNumber}.xml` }
      : rel,
  );
  const newLayoutRels = rewriteImageTargets(
    base,
    source,
    "ppt/slideLayouts",
    layoutRelsWithNewMaster,
    mediaPrefix,
  );
  addEntryText(
    base,
    `ppt/slideLayouts/_rels/slideLayout${newLayoutNumber}.xml.rels`,
    buildRelationshipsXml(newLayoutRels),
  );

  // 4. Slide : copie le XML + ses médias propres, relations réécrites vers
  // le nouveau layout + les copies média (notesSlide jamais reportée, comme
  // `appendSlides`).
  addEntryText(base, `ppt/slides/slide${newSlideNumber}.xml`, getEntryText(source, sourceSlidePath));
  registerContentTypeOverride(base, SLIDE_CONTENT_TYPE, `/ppt/slides/slide${newSlideNumber}.xml`);
  const slideRelsWithoutNotes = sourceSlideRels.filter(
    (rel) => !rel.type.endsWith(NOTES_SLIDE_RELATIONSHIP_TYPE_SUFFIX),
  );
  const slideRelsWithNewLayout = slideRelsWithoutNotes.map((rel) =>
    rel.id === layoutRel.id
      ? { ...rel, target: `../slideLayouts/slideLayout${newLayoutNumber}.xml` }
      : rel,
  );
  const newSlideRels = rewriteImageTargets(
    base,
    source,
    "ppt/slides",
    slideRelsWithNewLayout,
    mediaPrefix,
  );
  addEntryText(
    base,
    `ppt/slides/_rels/slide${newSlideNumber}.xml.rels`,
    buildRelationshipsXml(newSlideRels),
  );

  registerMasterInPresentation(base, newMasterNumber);
  registerSlideInPresentation(base, newSlideNumber, position);

  return newSlideNumber;
}
