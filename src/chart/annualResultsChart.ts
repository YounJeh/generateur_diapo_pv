import { createCanvas } from "canvas";
import type { ExtractedValues } from "../types.js";

/**
 * Ratio largeur/hauteur du cadre image de la slide 2 (`<a:ext>` dans
 * slide2.xml : cx=10718018, cy=2219711 EMU). L'image est étirée pour
 * remplir ce cadre (`<a:stretch/>`) : la générer à ce ratio évite toute
 * déformation visible une fois insérée dans le pptx.
 */
const FRAME_RATIO = 10718018 / 2219711;
const WIDTH = 2344;
const HEIGHT = Math.round(WIDTH / FRAME_RATIO);

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

interface Segment {
  label: string;
  value: number;
  pct: number;
  color: string;
}

interface Row {
  label: string;
  total: number;
  segments: [Segment, Segment];
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

function roundedRect(
  ctx: import("canvas").CanvasRenderingContext2D,
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
 * Dessine le graphique "RÉSULTATS DE CONSOMMATION ET DE PRODUCTION
 * ANNUELLES" (barres empilées, couleurs d'origine, longueur proportionnelle
 * au MWh — format retenu par l'utilisateur après comparaison de plusieurs
 * propositions). Remplace le crop du PDF source utilisé précédemment.
 */
export function renderAnnualResultsChart(
  values: AnnualResultsChartValues,
): Buffer {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = SURFACE;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = INK_MUTED;
  ctx.font = "700 22px sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("RÉSULTATS DE CONSOMMATION ET DE PRODUCTION ANNUELLES", 64, 58);

  const rows = buildRows(values);
  const maxTotal = Math.max(rows[0].total, rows[1].total);

  const marginX = 64;
  const labelW = 260;
  const barX = marginX + labelW;
  const barMaxW = 1150;
  const barH = 24;
  const gap = 3;
  const legendX = barX + barMaxW + 70;
  const rowY = [165, 340];

  rows.forEach((row, i) => {
    const y = rowY[i];
    const barW = barMaxW * (row.total / maxTotal);

    ctx.fillStyle = INK_SECONDARY;
    ctx.font = "400 20px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(row.label, marginX, y - 40);

    ctx.fillStyle = INK;
    ctx.font = "700 44px sans-serif";
    ctx.fillText(formatFr(row.total), marginX, y + 8);
    const totalW = ctx.measureText(formatFr(row.total)).width;
    ctx.fillStyle = INK_MUTED;
    ctx.font = "400 17px sans-serif";
    ctx.fillText("MWh", marginX + totalW + 8, y + 8);

    let cx = barX;
    row.segments.forEach((seg, si) => {
      const segW = (barW - gap) * (seg.pct / 100) - (si === 0 ? gap / 2 : 0);
      ctx.fillStyle = seg.color;
      roundedRect(ctx, cx, y - barH / 2, segW, barH, 4);

      if (segW > 60) {
        ctx.fillStyle = "#ffffff";
        ctx.font = "600 14px sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(`${seg.pct}%`, cx + 10, y + 5);
      }
      cx += segW + gap;
    });

    row.segments.forEach((seg, si) => {
      const ly = y - 14 + si * 26;
      ctx.fillStyle = seg.color;
      ctx.beginPath();
      ctx.arc(legendX + 6, ly - 4, 6, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = INK_SECONDARY;
      ctx.font = "400 16px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(
        `${seg.label} — ${formatFr(seg.value)} MWh (${Math.round(seg.pct)}%)`,
        legendX + 20,
        ly,
      );
    });
  });

  ctx.fillStyle = INK_MUTED;
  ctx.font = "italic 15px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(
    `Longueur des barres proportionnelle au total MWh (Consommation ≈ ${(rows[1].total / rows[0].total).toFixed(1)}× Production).`,
    barX,
    rowY[1] + 40,
  );

  return canvas.toBuffer("image/png");
}
