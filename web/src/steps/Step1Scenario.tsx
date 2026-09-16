import type { ExtractResponse } from "../api/types";
import type { FormState } from "../state/formState";

interface Props {
  form: FormState;
  onChange: (form: FormState) => void;
  onExtracted: (result: ExtractResponse) => void;
}

export function Step1Scenario({ form: _form, onChange: _onChange, onExtracted: _onExtracted }: Props) {
  return <p>Étape 1 — à venir.</p>;
}
