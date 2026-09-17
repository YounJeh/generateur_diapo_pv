import { useState } from "react";
import { extractValues } from "../api/client";
import type { ExtractResponse, Scenario } from "../api/types";
import { GroupList } from "../components/GroupList";
import { RowsStepper } from "../components/RowsStepper";
import { ScenarioCard } from "../components/ScenarioCard";
import { UploadField } from "../components/UploadField";
import { createGroupe, isFormValid, type FormState } from "../state/formState";

interface Props {
  form: FormState;
  onChange: (form: FormState) => void;
  onExtracted: (result: ExtractResponse) => void;
}

const SCENARIOS: Array<{ value: Scenario; title: string; description: string }> = [
  { value: "sans-stockage", title: "Sans stockage", description: "Production photovoltaïque" },
  { value: "stockage", title: "Avec stockage", description: "Photovoltaïque + batterie" },
  { value: "comparaison", title: "Comparer", description: "Plusieurs scénarios réunis" },
];

export function Step1Scenario({ form, onChange, onExtracted }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function selectScenario(scenario: Scenario) {
    onChange({
      ...form,
      scenario,
      groupes: scenario === "comparaison" && form.groupes.length === 0 ? [createGroupe()] : form.groupes,
    });
  }

  async function handleSubmit() {
    setError(null);
    setLoading(true);
    try {
      const result = await extractValues(form);
      onExtracted(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  const valid = isFormValid(form);

  return (
    <fieldset style={{ border: "none", margin: 0, padding: 0 }}>
      {error && <div className="error-banner">{error}</div>}

      <section className="section">
        <h2>Quel projet souhaitez-vous présenter ?</h2>
        <p>Choisissez le scénario adapté à votre étude.</p>
        <div className="scenario-grid" role="radiogroup" aria-label="Type de présentation">
          {SCENARIOS.map((s) => (
            <ScenarioCard
              key={s.value}
              value={s.value}
              title={s.title}
              description={s.description}
              selected={form.scenario === s.value}
              onSelect={() => selectScenario(s.value)}
            />
          ))}
        </div>
      </section>

      <section className="section">
        <h2>Importez votre rapport SolarEdge</h2>
        <p>Les données et graphiques seront repris dans vos diapositives.</p>

        {form.scenario === "comparaison" ? (
          <GroupList
            groupes={form.groupes}
            onChange={(groupes) => onChange({ ...form, groupes })}
          />
        ) : (
          <>
            <UploadField
              label={form.scenario === "sans-stockage" ? "Rapport sans stockage" : "Rapport avec stockage"}
              file={form.pdf}
              onChange={(file) => onChange({ ...form, pdf: file })}
            />
            <div className="rows-field">
              <div>
                <label className="field-label" htmlFor="rangees-simple">
                  Rangées d'ombrières
                </label>
                <p style={{ margin: 0, fontSize: 12, color: "var(--muted)" }}>
                  Cette information n'est pas extraite du rapport.
                </p>
              </div>
              <RowsStepper
                id="rangees-simple"
                value={form.rangees}
                onChange={(value) => onChange({ ...form, rangees: value })}
              />
            </div>
          </>
        )}
      </section>

      <div className="actionbar">
        <span className="actionbar-note">Vos fichiers ne sont accessibles qu'à vous, le temps de la génération</span>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!valid || loading}
          onClick={handleSubmit}
        >
          {loading ? "Vérification…" : "Vérifier les données →"}
        </button>
      </div>
    </fieldset>
  );
}
