import { useEffect } from "react";

interface Props {
  imageUrls: string[];
  index: number;
  onClose: () => void;
}

export function SlideLightbox({ imageUrls, index, onClose }: Props) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

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
        <img src={imageUrls[index]} alt={`Diapositive ${index + 1}`} className="lightbox-image" />
        <p className="lightbox-caption">
          Diapositive {index + 1} / {imageUrls.length}
        </p>
      </div>
    </div>
  );
}
