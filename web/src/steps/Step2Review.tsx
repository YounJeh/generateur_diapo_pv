import type { ExtractResponse, GenerateResponse } from "../api/types";

interface Props {
  result: ExtractResponse;
  onBack: () => void;
  onGenerated: (result: GenerateResponse) => void;
}

export function Step2Review({ result: _result, onBack: _onBack, onGenerated: _onGenerated }: Props) {
  return <p>Étape 2 — à venir.</p>;
}
