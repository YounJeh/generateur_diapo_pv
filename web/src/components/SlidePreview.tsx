import { useLayoutEffect, useRef, useState } from "react";
import type { PreviewSlide } from "../preview/types";
import "../styles/slides.css";

export function SlidePreview({ slide, label }: { slide: PreviewSlide; label: string }) {
  const container = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  useLayoutEffect(() => {
    const node = container.current!;
    const update = () => setScale(node.clientWidth / slide.width);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [slide.width]);
  return (
    <div ref={container} className="slide-preview" role="img" aria-label={label}
      style={{ aspectRatio: `${slide.width} / ${slide.height}` }}>
      <div className="slide-scene" style={{ width: slide.width, height: slide.height,
        background: slide.background, transform: `scale(${scale})` }}>
        {slide.elements.map((element, index) => (
          <div key={index} style={element.style}>
            {element.image && <img src={element.image.src} style={element.image.style} alt="" draggable={false} />}
            {element.paragraphs?.map((paragraph, paragraphIndex) => (
              <p key={paragraphIndex} style={paragraph.style}>
                {paragraph.bullet && <span style={{ display: "inline-block", textIndent: 0,
                  width: Math.max(0, -Number(paragraph.style.textIndent ?? 0)) || undefined }}>{paragraph.bullet} </span>}
                {paragraph.runs.map((run, runIndex) => <span key={runIndex} style={run.style}>{run.text}</span>)}
              </p>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
