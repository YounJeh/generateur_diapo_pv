import { useState } from "react";
import type { GenerateResponse } from "../api/types";
import { SlideLightbox } from "../components/SlideLightbox";

interface Props {
  result: GenerateResponse;
  onStartOver: () => void;
}

export function Step3Result({ result, onStartOver }: Props) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div>
      <section className="section">
        <h2>Votre présentation est prête</h2>
        <p>Vérifiez l'aperçu ci-dessous, puis téléchargez votre fichier PowerPoint.</p>

        {result.previewImageUrls.length > 0 ? (
          <div className="preview-grid">
            {result.previewImageUrls.map((url, index) => (
              <div key={url}>
                <img
                  src={url}
                  alt={`Diapositive ${index + 1}`}
                  onClick={() => setOpenIndex(index)}
                />
                <p className="preview-caption">Diapositive {index + 1}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="actionbar-note">
            Aperçu indisponible pour cette génération — le fichier reste téléchargeable.
          </p>
        )}

        {openIndex !== null && (
          <SlideLightbox
            imageUrls={result.previewImageUrls}
            index={openIndex}
            onClose={() => setOpenIndex(null)}
          />
        )}
      </section>

      <div className="actionbar">
        <button type="button" className="btn btn-secondary" onClick={onStartOver}>
          Nouvelle présentation
        </button>
        <a className="btn btn-primary" href={result.pptxUrl} download>
          Télécharger le .pptx
        </a>
      </div>
    </div>
  );
}
