import { useEffect, useState } from "react";

interface Props {
  imageUrls: string[];
  startIndex: number;
  onClose: () => void;
}

export function SlideLightbox({ imageUrls, startIndex, onClose }: Props) {
  const [currentIndex, setCurrentIndex] = useState(startIndex);

  const canGoPrevious = currentIndex > 0;
  const canGoNext = currentIndex < imageUrls.length - 1;

  function goToPrevious() {
    setCurrentIndex((current) => Math.max(0, current - 1));
  }

  function goToNext() {
    setCurrentIndex((current) => Math.min(imageUrls.length - 1, current + 1));
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

        <img
          src={imageUrls[currentIndex]}
          alt={`Diapositive ${currentIndex + 1}`}
          className="lightbox-image"
        />

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
