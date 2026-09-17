import { useEffect, useState } from "react";
import type { GenerateResponse } from "../api/types";
import { SlideLightbox } from "../components/SlideLightbox";
import { SlidePreview } from "../components/SlidePreview";
import { readSlides } from "../preview/readSlides";
import type { PresentationPreview } from "../preview/types";

interface Props {
  result: GenerateResponse;
  onStartOver: () => void;
}

export function Step3Result(props: Props) {
  return <PresentationResult key={props.result.pptxUrl} {...props} />;
}

function PresentationResult({ result, onStartOver }: Props) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [preview, setPreview] = useState<PresentationPreview | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let loaded: PresentationPreview | undefined;
    async function load() {
      try {
        const response = await fetch(result.pptxUrl, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error("Présentation indisponible.");
        const buffer = await response.arrayBuffer();
        if (controller.signal.aborted) return;
        loaded = readSlides(buffer);
        setPreview(loaded);
      } catch {
        if (!controller.signal.aborted) setPreviewFailed(true);
      }
    }
    void load();
    return () => { controller.abort(); loaded?.dispose(); };
  }, [result.pptxUrl]);

  return (
    <div>
      <section className="section">
        <h2>Votre présentation est prête</h2>
        <p>Vérifiez l'aperçu ci-dessous, puis téléchargez votre fichier PowerPoint.</p>

        {preview ? (
          <div className="preview-grid">
            {preview.slides.map((slide, index) => (
              <div key={index}>
                <button
                  type="button"
                  className="preview-thumb"
                  onClick={() => setOpenIndex(index)}
                  aria-label={`Agrandir la diapositive ${index + 1}`}
                >
                  <SlidePreview slide={slide} label={`Diapositive ${index + 1}`} />
                </button>
                <p className="preview-caption">Diapositive {index + 1}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="actionbar-note">
            {previewFailed ? "Aperçu indisponible pour cette génération — le fichier reste téléchargeable."
              : "Préparation de l’aperçu… Vous pouvez déjà télécharger votre présentation."}
          </p>
        )}

        {preview && <p className="actionbar-note">La mise en page peut varier légèrement dans PowerPoint.</p>}
        {preview && openIndex !== null && (
          <SlideLightbox
            slides={preview.slides}
            startIndex={openIndex}
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
