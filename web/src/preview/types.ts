import type { CSSProperties } from "react";

export interface PreviewElement {
  style: CSSProperties;
  image?: { src: string; style: CSSProperties };
  paragraphs?: { style: CSSProperties; bullet?: string; runs: { text: string; style: CSSProperties }[] }[];
}

export interface PreviewSlide {
  width: number;
  height: number;
  background: string;
  elements: PreviewElement[];
}

export interface PresentationPreview {
  slides: PreviewSlide[];
  dispose: () => void;
}
