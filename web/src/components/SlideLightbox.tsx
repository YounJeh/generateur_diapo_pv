import { useEffect, useRef, useState, type PointerEvent, type WheelEvent } from "react";

interface Props {
  imageUrls: string[];
  startIndex: number;
  onClose: () => void;
}

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const ZOOM_STEP = 0.0015;

export function SlideLightbox({ imageUrls, startIndex, onClose }: Props) {
  const [currentIndex, setCurrentIndex] = useState(startIndex);
  const [scale, setScale] = useState(MIN_SCALE);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragState = useRef<{ startX: number; startY: number; startOffset: { x: number; y: number } } | null>(
    null,
  );

  const canGoPrevious = currentIndex > 0;
  const canGoNext = currentIndex < imageUrls.length - 1;

  function resetZoom() {
    setScale(MIN_SCALE);
    setOffset({ x: 0, y: 0 });
  }

  function goToPrevious() {
    setCurrentIndex((current) => Math.max(0, current - 1));
    resetZoom();
  }

  function goToNext() {
    setCurrentIndex((current) => Math.min(imageUrls.length - 1, current + 1));
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
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, imageUrls.length]);

  function handleWheel(event: WheelEvent<HTMLImageElement>) {
    event.preventDefault();
    setScale((current) => {
      const next = current - event.deltaY * ZOOM_STEP;
      return Math.min(MAX_SCALE, Math.max(MIN_SCALE, next));
    });
  }

  function handlePointerDown(event: PointerEvent<HTMLImageElement>) {
    if (scale <= MIN_SCALE) return;
    dragState.current = { startX: event.clientX, startY: event.clientY, startOffset: offset };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<HTMLImageElement>) {
    if (!dragState.current) return;
    const { startX, startY, startOffset } = dragState.current;
    setOffset({
      x: startOffset.x + (event.clientX - startX),
      y: startOffset.y + (event.clientY - startY),
    });
  }

  function handlePointerUp(event: PointerEvent<HTMLImageElement>) {
    dragState.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return (
    <div className="lightbox-backdrop" onClick={onClose}>
      <div className="lightbox-content" onClick={(event) => event.stopPropagation()}>
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
          <img
            src={imageUrls[currentIndex]}
            alt={`Diapositive ${currentIndex + 1}`}
            className="lightbox-image"
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
              cursor: scale > MIN_SCALE ? "grab" : "zoom-in",
            }}
            onWheel={handleWheel}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            draggable={false}
          />
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
          Diapositive {currentIndex + 1} / {imageUrls.length}
        </p>
      </div>
    </div>
  );
}
