import type { CSSProperties } from "react";
import type { PreviewElement } from "./types";
import { child, children, descendant, emuToPx, number } from "./xml";

type ColorReader = (fill: Element | undefined) => string;

function placeholder(part: Element | undefined, ph: Element | undefined) {
  if (!ph) return undefined;
  return children(child(child(part, "cSld"), "spTree"), "sp").find((shape) => {
    const other = descendant(shape, "ph");
    return other && (ph.hasAttribute("idx") ? other.getAttribute("idx") === ph.getAttribute("idx")
      : other.getAttribute("type") === ph.getAttribute("type"));
  });
}

function runStyle(props: Element | undefined, color: ColorReader): CSSProperties {
  if (!props) return {};
  const style: CSSProperties = {};
  if (props.hasAttribute("sz")) style.fontSize = number(props, "sz") / 100;
  if (props.hasAttribute("b")) style.fontWeight = props.getAttribute("b") === "1" ? 700 : 400;
  if (props.hasAttribute("i")) style.fontStyle = props.getAttribute("i") === "1" ? "italic" : "normal";
  if (props.hasAttribute("spc")) style.letterSpacing = number(props, "spc") / 100;
  if (child(props, "solidFill")) style.color = color(child(props, "solidFill"));
  const font = child(props, "latin")?.getAttribute("typeface");
  if (font && !font.startsWith("+")) style.fontFamily = font;
  if (props.getAttribute("u") && props.getAttribute("u") !== "none") style.textDecoration = "underline";
  return style;
}

/** Résout les styles hérités des espaces réservés avant les styles de chaque run. */
export function readText(shape: Element, layout: Element | undefined, master: Element | undefined,
  color: ColorReader, slideNumber: number): Pick<PreviewElement, "paragraphs"> & { bodyStyle: CSSProperties } {
  const ph = descendant(shape, "ph");
  const inherited = [placeholder(master, ph), placeholder(layout, ph), shape];
  const body = child(shape, "txBody"), bodyProps = child(body, "bodyPr");
  const bodyStyle: CSSProperties = { display: "flex", flexDirection: "column",
    justifyContent: bodyProps?.getAttribute("anchor") === "ctr" ? "center" : bodyProps?.getAttribute("anchor") === "b" ? "flex-end" : "flex-start",
    padding: `${emuToPx(number(bodyProps, "tIns", 45720))}px ${emuToPx(number(bodyProps, "rIns", 91440))}px ${emuToPx(number(bodyProps, "bIns", 45720))}px ${emuToPx(number(bodyProps, "lIns", 91440))}px` };
  const paragraphs = children(body, "p").map((paragraph) => {
    const own = child(paragraph, "pPr"), level = number(own, "lvl") + 1;
    const kind = ph?.getAttribute("type") === "title" ? "titleStyle" : ph?.getAttribute("type") === "body" ? "bodyStyle" : "otherStyle";
    const defaults = child(child(master, "txStyles"), kind);
    const props = [child(defaults, `lvl${level}pPr`), ...inherited.map((source) => child(child(child(source, "txBody"), "lstStyle"), `lvl${level}pPr`)), own].filter((p): p is Element => Boolean(p));
    const attr = (name: string) => props.findLast((p) => p.hasAttribute(name))?.getAttribute(name);
    const property = (name: string) => props.map((p) => child(p, name)).findLast(Boolean);
    const style: CSSProperties = { margin: 0, whiteSpace: "pre-wrap", overflowWrap: "break-word", fontFamily: "Barlow", fontSize: 14, lineHeight: 1.1 };
    for (const p of props) Object.assign(style, runStyle(child(p, "defRPr"), color));
    const alignment = attr("algn");
    style.textAlign = alignment === "ctr" ? "center" : alignment === "r" ? "right" : alignment === "just" ? "justify" : "left";
    const spacing = property("lnSpc");
    if (child(spacing, "spcPct")) style.lineHeight = number(child(spacing, "spcPct"), "val") / 100000;
    if (child(spacing, "spcPts")) style.lineHeight = `${number(child(spacing, "spcPts"), "val") / 100}px`;
    style.marginTop = number(child(property("spcBef"), "spcPts"), "val") / 100;
    style.marginBottom = number(child(property("spcAft"), "spcPts"), "val") / 100;
    style.paddingLeft = emuToPx(Number(attr("marL") ?? 0));
    style.paddingRight = emuToPx(Number(attr("marR") ?? 0));
    style.textIndent = emuToPx(Number(attr("indent") ?? 0));
    const bulletProp = props.flatMap((p) => Array.from(p.children).filter((c) => ["buNone", "buChar"].includes(c.localName))).at(-1);
    const bullet = bulletProp?.localName === "buChar" ? bulletProp.getAttribute("char") ?? undefined : undefined;
    const runs = Array.from(paragraph.children).filter((run) => ["r", "fld", "br"].includes(run.localName)).map((run) => ({
      text: run.localName === "br" ? "\n" : run.getAttribute("type") === "slidenum" ? String(slideNumber) : child(run, "t")?.textContent ?? "",
      style: runStyle(child(run, "rPr"), color),
    }));
    if (runs.length) style.fontSize = Math.max(...runs.map((run) => Number(run.style.fontSize ?? style.fontSize)));
    style.fontFamily = runs.find((run) => run.style.fontFamily)?.style.fontFamily ?? style.fontFamily;
    if (!runs.some((run) => run.text)) runs.push({ text: "\u00a0", style: runStyle(child(paragraph, "endParaRPr"), color) });
    return { style, bullet, runs };
  });
  return { paragraphs, bodyStyle };
}
