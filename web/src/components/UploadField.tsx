import { useId } from "react";

interface Props {
  label: string;
  file: File | null;
  onChange: (file: File | null) => void;
}

export function UploadField({ label, file, onChange }: Props) {
  const inputId = useId();

  return (
    <div>
      <label className="field-label" htmlFor={inputId}>
        {label}
      </label>
      <input
        id={inputId}
        type="file"
        accept=".pdf"
        style={{ position: "absolute", width: 1, height: 1, opacity: 0 }}
        onChange={(event) => onChange(event.target.files?.[0] ?? null)}
      />
      <label htmlFor={inputId} className={`dropzone${file ? " filled" : ""}`}>
        {file ? (
          <>
            <strong>{file.name}</strong>
            <small>Cliquez pour remplacer</small>
          </>
        ) : (
          <>
            <strong>Glissez votre rapport ici</strong>
            <small>ou cliquez pour parcourir vos fichiers — PDF, 35 Mo maximum</small>
          </>
        )}
      </label>
    </div>
  );
}
