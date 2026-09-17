import { createCanvas } from "@napi-rs/canvas";
import { CHART_FONT_FAMILY, ensureChartFontsRegistered } from "./fonts.js";
import type { ExtractedValues, StorageExtractedValues } from "../types.js";

/**
 * Ratio largeur/hauteur par défaut, celui du cadre image de la slide 2 du
 * template sans stockage (`<a:ext>` dans slide2.xml : cx=10718018,
 * cy=2219711 EMU). L'image est étirée pour remplir ce cadre
 * (`<a:stretch/>`) : la générer à ce ratio évite toute déformation visible
 * une fois insérée dans le pptx. Paramétrable (voir `renderAnnualResultsChart`)
 * car le template "avec stockage" utilise un cadre de ratio différent.
 */
const DEFAULT_FRAME_RATIO = 10718018 / 2219711;
const WIDTH = 2344;

function heightForRatio(frameRatio: number): number {
  return Math.round(WIDTH / frameRatio);
}

const SURFACE = "#fcfcfb";
const INK = "#0b0b0b";
const INK_SECONDARY = "#52514e";
const INK_MUTED = "#898781";

// Couleurs d'origine du rapport SolarEdge (échantillonnées sur le graphique
// source) : vert/sarcelle côté Production, bleu/orange côté Consommation.
// Choix utilisateur confirmé de garder ces couleurs plutôt qu'une palette
// neutre, la longueur des barres devenant en plus proportionnelle au MWh.
const PROD_GREEN = "#00e77f";
const PROD_TEAL = "#00bbaa";
const CONS_BLUE = "#6fa8ff";
const CONS_ORANGE = "#ffb44c";

// Couleurs du segment "stockage" (scénario avec stockage), échantillonnées
// de la même façon sur le graphique vectoriel du rapport SolarEdge storage :
// des teintes plus claires des couleurs "bâtiment"/"PV" ci-dessus (le PDF
// source réutilise exactement PROD_GREEN/PROD_TEAL/CONS_BLUE/CONS_ORANGE
// pour bâtiment/réseau/PV/réseau, seul le stockage a ses propres teintes).
const PROD_STOCKAGE_GREEN = "#88ffbb";
const CONS_STOCKAGE_BLUE = "#bbddff";

/**
 * Ratio largeur/hauteur du cadre image de la slide 2 du template "avec
 * stockage" (`<a:ext>` : cx=10820400, cy=2493845 EMU).
 */
const STORAGE_FRAME_RATIO = 10820400 / 2493845;

interface Segment {
  label: string;
  value: number;
  pct: number;
  color: string;
}

interface Row {
  label: string;
  total: number;
  /** Nombre variable de segments empilés (2 pour sans-stockage, 3 pour avec stockage). */
  segments: Segment[];
}

type AnnualResultsChartValues = Pick<
  ExtractedValues,
  | "productionTotaleMwh"
  | "consommationTotaleMwh"
  | "versBatimentMwh"
  | "versReseauMwh"
  | "depuisPvMwh"
  | "duReseauMwh"
  | "tauxAutoconsommation"
  | "surplusProduction"
  | "tauxAutoproduction"
>;

function parseFr(value: string): number {
  return Number.parseFloat(value.replace(",", "."));
}

function formatFr(value: number): string {
  return value.toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function buildRows(values: AnnualResultsChartValues): [Row, Row] {
  const duReseauPct = 100 - values.tauxAutoproduction;
  return [
    {
      label: "Production",
      total: parseFr(values.productionTotaleMwh),
      segments: [
        {
          label: "Vers le bâtiment",
          value: parseFr(values.versBatimentMwh),
          pct: values.tauxAutoconsommation,
          color: PROD_GREEN,
        },
        {
          label: "Vers le réseau",
          value: parseFr(values.versReseauMwh),
          pct: values.surplusProduction,
          color: PROD_TEAL,
        },
      ],
    },
    {
      label: "Consommation",
      total: parseFr(values.consommationTotaleMwh),
      segments: [
        {
          label: "Depuis le PV",
          value: parseFr(values.depuisPvMwh),
          pct: values.tauxAutoproduction,
          color: CONS_BLUE,
        },
        {
          label: "Du réseau",
          value: parseFr(values.duReseauMwh),
          pct: duReseauPct,
          color: CONS_ORANGE,
        },
      ],
    },
  ];
}

type StorageAnnualResultsChartValues = Pick<
  StorageExtractedValues,
  | "productionTotaleMwh"
  | "consommationTotaleMwh"
  | "versBatimentMwh"
  | "versStockageMwh"
  | "versReseauMwh"
  | "depuisPvMwh"
  | "depuisStockageMwh"
  | "duReseauMwh"
  | "tauxAutoconsommation"
  | "versStockagePct"
  | "surplusProduction"
  | "tauxAutoproduction"
  | "depuisStockagePct"
>;

function buildStorageRows(values: StorageAnnualResultsChartValues): [Row, Row] {
  const duReseauPct =
    100 - values.tauxAutoproduction - values.depuisStockagePct;
  return [
    {
      label: "Production",
      total: parseFr(values.productionTotaleMwh),
      segments: [
        {
          label: "Vers le bâtiment",
          value: parseFr(values.versBatimentMwh),
          pct: values.tauxAutoconsommation,
          color: PROD_GREEN,
        },
        {
          label: "Vers le stockage",
          value: parseFr(values.versStockageMwh),
          pct: values.versStockagePct,
          color: PROD_STOCKAGE_GREEN,
        },
        {
          label: "Vers le réseau",
          value: parseFr(values.versReseauMwh),
          pct: values.surplusProduction,
          color: PROD_TEAL,
        },
      ],
    },
    {
      label: "Consommation",
      total: parseFr(values.consommationTotaleMwh),
      segments: [
        {
          label: "Depuis le PV",
          value: parseFr(values.depuisPvMwh),
          pct: values.tauxAutoproduction,
          color: CONS_BLUE,
        },
        {
          label: "Depuis le stockage",
          value: parseFr(values.depuisStockageMwh),
          pct: values.depuisStockagePct,
          color: CONS_STOCKAGE_BLUE,
        },
        {
          label: "Du réseau",
          value: parseFr(values.duReseauMwh),
          pct: duReseauPct,
          color: CONS_ORANGE,
        },
      ],
    },
  ];
}

function roundedRect(
  ctx: import("@napi-rs/canvas").SKRSContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, h / 2, w / 2 || r);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
  ctx.fill();
}

/**
 * Moteur de dessin générique : rend 2 lignes (Production / Consommation) à
 * un nombre variable de segments par barre, à un ratio largeur/hauteur
 * paramétrable. Partagé par `renderAnnualResultsChart` (2 segments) et
 * `renderAnnualResultsChartStorage` (3 segments).
 */
function drawChart(rows: [Row, Row], frameRatio: number): Buffer {
  ensureChartFontsRegistered();
  const height = heightForRatio(frameRatio);
  const canvas = createCanvas(WIDTH, height);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = SURFACE;
  ctx.fillRect(0, 0, WIDTH, height);

  ctx.fillStyle = INK_MUTED;
  ctx.font = `700 26px ${CHART_FONT_FAMILY}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("RÉSULTATS DE CONSOMMATION ET DE PRODUCTION ANNUELLES", 64, 62);

  const maxTotal = Math.max(rows[0].total, rows[1].total);

  // Texte et épaisseur de barre agrandis par rapport à la version d'origine
  // (barH 24->64, fonts +20 à +75% selon l'élément) — marginX/barMaxW/
  // legendX inchangés : la longueur des barres et la largeur du cadre-image
  // ne bougent pas, seule la présentation grossit. labelW élargi pour
  // laisser la place au plus gros nombre total. Le label/nombre (colonne
  // marginX..barX) et la légende (colonne legendX..fin) sont dans des
  // colonnes distinctes de celle de la barre (barX..barX+barMaxW) : épaissir
  // la barre ne les fait pas se chevaucher. Seul le bas de la barre de la
  // ligne 2 (Consommation) doit rester au-dessus de la note en italique
  // (même colonne) — c'est elle qui borne réellement barH, pas les autres
  // éléments.
  const marginX = 64;
  const labelW = 340;
  const barX = marginX + labelW;
  const barMaxW = 1150;
  const barH = 64;
  const gap = 4;
  const legendX = barX + barMaxW + 70;
  const rowY = [175, 365];

  rows.forEach((row, i) => {
    const y = rowY[i];
    const barW = barMaxW * (row.total / maxTotal);

    ctx.fillStyle = INK_SECONDARY;
    ctx.font = `400 26px ${CHART_FONT_FAMILY}`;
    ctx.textAlign = "left";
    ctx.fillText(row.label, marginX, y - 58);

    ctx.fillStyle = INK;
    ctx.font = `700 62px ${CHART_FONT_FAMILY}`;
    ctx.fillText(formatFr(row.total), marginX, y + 14);
    const totalW = ctx.measureText(formatFr(row.total)).width;
    ctx.fillStyle = INK_MUTED;
    ctx.font = `400 22px ${CHART_FONT_FAMILY}`;
    ctx.fillText("MWh", marginX + totalW + 10, y + 14);

    let cx = barX;
    row.segments.forEach((seg, si) => {
      const segW = (barW - gap) * (seg.pct / 100) - (si === 0 ? gap / 2 : 0);
      ctx.fillStyle = seg.color;
      roundedRect(ctx, cx, y - barH / 2, segW, barH, 10);

      if (segW > 110) {
        ctx.fillStyle = "#ffffff";
        ctx.font = `700 26px ${CHART_FONT_FAMILY}`;
        ctx.textAlign = "left";
        ctx.fillText(`${seg.pct}%`, cx + 16, y + 9);
      }
      cx += segW + gap;
    });

    row.segments.forEach((seg, si) => {
      const ly = y - 30 + si * 34;
      ctx.fillStyle = seg.color;
      ctx.beginPath();
      ctx.arc(legendX + 8, ly - 5, 8, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = INK_SECONDARY;
      ctx.font = `400 20px ${CHART_FONT_FAMILY}`;
      ctx.textAlign = "left";
      ctx.fillText(
        `${seg.label} — ${formatFr(seg.value)} MWh (${Math.round(seg.pct)}%)`,
        legendX + 26,
        ly,
      );
    });
  });

  ctx.fillStyle = INK_MUTED;
  ctx.font = `italic 18px ${CHART_FONT_FAMILY}`;
  ctx.textAlign = "left";
  ctx.fillText(
    `Longueur des barres proportionnelle au total MWh (Consommation ≈ ${(rows[1].total / rows[0].total).toFixed(1)}× Production).`,
    barX,
    rowY[1] + 80,
  );

  return canvas.toBuffer("image/png");
}

/**
 * Dessine le graphique "RÉSULTATS DE CONSOMMATION ET DE PRODUCTION
 * ANNUELLES" (barres empilées, couleurs d'origine, longueur proportionnelle
 * au MWh — format retenu par l'utilisateur après comparaison de plusieurs
 * propositions). Remplace le crop du PDF source utilisé précédemment.
 */
export function renderAnnualResultsChart(
  values: AnnualResultsChartValues,
  frameRatio: number = DEFAULT_FRAME_RATIO,
): Buffer {
  return drawChart(buildRows(values), frameRatio);
}

/**
 * Variante du graphique "RÉSULTATS DE CONSOMMATION ET DE PRODUCTION
 * ANNUELLES" pour le scénario "avec stockage" : 3 segments par barre
 * (bâtiment/stockage/réseau ; PV/stockage/réseau), même style visuel,
 * ratio de cadre par défaut = celui du template storage.
 */
export function renderAnnualResultsChartStorage(
  values: StorageAnnualResultsChartValues,
  frameRatio: number = STORAGE_FRAME_RATIO,
): Buffer {
  return drawChart(buildStorageRows(values), frameRatio);
}
