import { useEffect, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import type { PreviewSlide } from "../preview/types";
import { SlidePreview } from "./SlidePreview";

interface Props {
  slides: PreviewSlide[];
  startIndex: number;
  onClose: () => void;
}

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const ZOOM_STEP = 0.0015;

export function SlideLightbox({ slides, startIndex, onClose }: Props) {
  const [currentIndex, setCurrentIndex] = useState(startIndex);
  const [scale, setScale] = useState(MIN_SCALE);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragState = useRef<{ startX: number; startY: number; startOffset: { x: number; y: number } } | null>(
    null,
  );

  const canGoPrevious = currentIndex > 0;
  const canGoNext = currentIndex < slides.length - 1;

  function resetZoom() {
    setScale(MIN_SCALE);
    setOffset({ x: 0, y: 0 });
  }

  function goToPrevious() {
    setCurrentIndex((current) => Math.max(0, current - 1));
    resetZoom();
  }

  function goToNext() {
    setCurrentIndex((current) => Math.min(slides.length - 1, current + 1));
    resetZoom();
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      } else if (event.key === "ArrowLeft") {
        goToPrevious();
      } else if (event.key === "ArrowRight") {
        goToNext();
      }
    }
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => { window.removeEventListener("keydown", handleKeyDown); document.body.style.overflow = overflow; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, slides.length]);

  function handleWheel(event: WheelEvent<HTMLDivElement>) {
    setScale((current) => {
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, current - event.deltaY * ZOOM_STEP));
      if (next === MIN_SCALE) {
        setOffset({ x: 0, y: 0 });
      }
      return next;
    });
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (scale <= MIN_SCALE) return;
    dragState.current = { startX: event.clientX, startY: event.clientY, startOffset: offset };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!dragState.current) return;
    const { startX, startY, startOffset } = dragState.current;
    setOffset({
      x: startOffset.x + (event.clientX - startX),
      y: startOffset.y + (event.clientY - startY),
    });
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    dragState.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return (
    <div className="lightbox-backdrop" onClick={onClose}>
      <div
        className="lightbox-content"
        role="dialog"
        aria-modal="true"
        aria-label={`Diapositive ${currentIndex + 1} sur ${slides.length}, agrandie`}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="lightbox-close"
          onClick={onClose}
          aria-label="Fermer l'aperçu"
        >
          ✕
        </button>

        {canGoPrevious && (
          <button
            type="button"
            className="lightbox-nav lightbox-nav-prev"
            onClick={goToPrevious}
            aria-label="Diapositive précédente"
          >
            ‹
          </button>
        )}

        <div className="lightbox-viewport">
          <div
            className="lightbox-image"
            style={{
              width: `min(90vw, ${80 * slides[currentIndex].width / slides[currentIndex].height}vh)`,
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
              cursor: scale > MIN_SCALE ? "grab" : "zoom-in",
            }}
            onWheel={handleWheel}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            <SlidePreview slide={slides[currentIndex]} label={`Diapositive ${currentIndex + 1}`} />
          </div>
        </div>

        {canGoNext && (
          <button
            type="button"
            className="lightbox-nav lightbox-nav-next"
            onClick={goToNext}
            aria-label="Diapositive suivante"
          >
            ›
          </button>
        )}

        <p className="lightbox-caption">
          Diapositive {currentIndex + 1} / {slides.length}
        </p>
      </div>
    </div>
  );
}
