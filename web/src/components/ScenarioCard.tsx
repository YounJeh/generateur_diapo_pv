import type { Scenario } from "../api/types";

interface Props {
  value: Scenario;
  title: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
}

export function ScenarioCard({ value, title, description, selected, onSelect }: Props) {
  return (
    <label className={`scenario-card${selected ? " selected" : ""}`}>
      <input
        type="radio"
        name="scenario"
        value={value}
        checked={selected}
        onChange={onSelect}
      />
      <strong>{title}</strong>
      <span>{description}</span>
    </label>
  );
}
