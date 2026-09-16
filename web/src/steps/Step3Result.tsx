import type { GenerateResponse } from "../api/types";

interface Props {
  result: GenerateResponse;
  onStartOver: () => void;
}

export function Step3Result({ result: _result, onStartOver: _onStartOver }: Props) {
  return <p>Étape 3 — à venir.</p>;
}
