import type { PreviewElement, PresentationPreview } from "./types";
import { child, children, descendant, emuToPx, number, openPresentation } from "./xml";

/** Rendu des éléments employés par les templates PVstudio, sans moteur Office. */
export function readSlides(buffer: ArrayBuffer): PresentationPreview {
  const archive = openPresentation(buffer);
  try {
    const presentation = archive.xml("ppt/presentation.xml");
    const size = child(presentation, "sldSz");
    const width = emuToPx(number(size, "cx"));
    const height = emuToPx(number(size, "cy"));
    const slideRels = archive.relationships("ppt/presentation.xml");
    const slides = children(child(presentation, "sldIdLst"), "sldId").map((id) => {
      const slidePath = slideRels.find((rel) => rel.id === id.getAttribute("r:id"))?.path;
      if (!slidePath) throw new Error("Ordre des diapositives illisible.");
      const slide = archive.xml(slidePath);
      const layoutPath = archive.relationships(slidePath).find((rel) => rel.type === "slideLayout")?.path;
      const layout = layoutPath ? archive.xml(layoutPath) : undefined;
      const masterPath = layoutPath ? archive.relationships(layoutPath).find((rel) => rel.type === "slideMaster")?.path : undefined;
      const master = masterPath ? archive.xml(masterPath) : undefined;
      const themePath = masterPath ? archive.relationships(masterPath).find((rel) => rel.type === "theme")?.path : undefined;
      const colors = themePath ? descendant(archive.xml(themePath), "clrScheme") : undefined;
      function color(fill: Element | undefined): string {
        const rgb = child(fill, "srgbClr");
        if (rgb) return `#${rgb.getAttribute("val")}`;
        const scheme = child(fill, "schemeClr")?.getAttribute("val");
        const map = child(master, "clrMap");
        const themeColor = scheme ? child(colors, map?.getAttribute(scheme) ?? scheme) : undefined;
        const value = child(themeColor, "srgbClr")?.getAttribute("val") ?? child(themeColor, "sysClr")?.getAttribute("lastClr");
        return value ? `#${value}` : "transparent";
      }
      const backgroundFill = [slide, layout, master].map((part) => child(child(child(part, "cSld"), "bg"), "bgPr")).find(Boolean);
      const elements: PreviewElement[] = [];
      const layers: [Element | undefined, string | undefined][] = [];
      if (slide.getAttribute("showMasterSp") !== "0" && layout?.getAttribute("showMasterSp") !== "0") layers.push([master, masterPath]);
      layers.push([layout, layoutPath], [slide, slidePath]);
      for (const [part, path] of layers) {
        if (!part || !path) continue;
        const rels = archive.relationships(path);
        for (const shape of Array.from(child(child(part, "cSld"), "spTree")?.children ?? [])) {
          if (shape.localName !== "pic") continue;
          const props = child(shape, "spPr");
          const transform = child(props, "xfrm");
          const off = child(transform, "off"), ext = child(transform, "ext");
          const w = emuToPx(number(ext, "cx")), h = emuToPx(number(ext, "cy"));
          const fill = child(shape, "blipFill");
          const imagePath = rels.find((rel) => rel.id === child(fill, "blip")?.getAttribute("r:embed"))?.path;
          if (!imagePath) continue;
          const crop = child(fill, "srcRect");
          const l = number(crop, "l") / 100000, r = number(crop, "r") / 100000;
          const t = number(crop, "t") / 100000, b = number(crop, "b") / 100000;
          const rounded = child(props, "prstGeom")?.getAttribute("prst") === "roundRect";
          const adjustment = child(child(child(props, "prstGeom"), "avLst"), "gd")?.getAttribute("fmla")?.split(" ").at(-1);
          elements.push({
            style: { position: "absolute", left: emuToPx(number(off, "x")), top: emuToPx(number(off, "y")), width: w, height: h,
              overflow: "hidden", borderRadius: rounded ? Math.min(w, h) * Number(adjustment ?? 16667) / 100000 : 0 },
            image: { src: archive.image(imagePath), style: { position: "absolute", width: `${100 / (1 - l - r)}%`, height: `${100 / (1 - t - b)}%`, left: `${-l * 100 / (1 - l - r)}%`, top: `${-t * 100 / (1 - t - b)}%` } },
          });
        }
      }
      return { width, height, background: color(child(backgroundFill, "solidFill")), elements };
    });
    return { slides, dispose: archive.dispose };
  } catch (error) {
    archive.dispose();
    throw error;
  }
}
