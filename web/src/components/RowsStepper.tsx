interface Props {
  value: number;
  onChange: (value: number) => void;
  id?: string;
}

export function RowsStepper({ value, onChange, id }: Props) {
  return (
    <div className="step-input">
      <button
        type="button"
        aria-label="Diminuer le nombre de rangées"
        onClick={() => onChange(Math.max(1, value - 1))}
      >
        −
      </button>
      <input
        id={id}
        type="number"
        min={1}
        step={1}
        value={value}
        onChange={(event) => {
          const parsed = Number.parseInt(event.target.value, 10);
          onChange(Number.isFinite(parsed) && parsed > 0 ? parsed : 1);
        }}
      />
      <button type="button" aria-label="Augmenter le nombre de rangées" onClick={() => onChange(value + 1)}>
        +
      </button>
    </div>
  );
}
