import { useState } from "react";
import type { ExtractResponse, GenerateResponse } from "./api/types";
import { createInitialFormState, type FormState } from "./state/formState";
import { Step1Scenario } from "./steps/Step1Scenario";
import { Step2Review } from "./steps/Step2Review";
import { Step3Result } from "./steps/Step3Result";

type StepNumber = 1 | 2 | 3;

const STEP_LABELS: Record<StepNumber, string> = {
  1: "Importer les rapports",
  2: "Vérifier les données",
  3: "Télécharger",
};

function scenarioLabel(scenario: FormState["scenario"]): string {
  switch (scenario) {
    case "sans-stockage":
      return "Sans stockage";
    case "stockage":
      return "Avec stockage";
    case "comparaison":
      return "Comparaison";
  }
}

export default function App() {
  const [step, setStep] = useState<StepNumber>(1);
  const [form, setForm] = useState<FormState>(createInitialFormState());
  const [extractResult, setExtractResult] = useState<ExtractResponse | null>(null);
  const [generateResult, setGenerateResult] = useState<GenerateResponse | null>(null);

  function goToStep2(result: ExtractResponse) {
    setExtractResult(result);
    setStep(2);
  }

  function goToStep3(result: GenerateResponse) {
    setGenerateResult(result);
    setStep(3);
  }

  function backToStep1() {
    setStep(1);
  }

  function startOver() {
    setForm(createInitialFormState());
    setExtractResult(null);
    setGenerateResult(null);
    setStep(1);
  }

  return (
    <div className="studio">
      <header className="topbar">
        <a className="brand" href="/">
          <span className="brand-mark">☀</span>
          <span>
            PV<span className="brand-light">studio</span>
          </span>
        </a>
      </header>

      <div className="workspace">
        <div className="title-row">
          <div>
            <p className="eyebrow">Du rapport à la présentation</p>
            <h1>Votre projet solaire, prêt à présenter.</h1>
            <p className="intro">Vos données SolarEdge. Votre mise en page. Quelques clics.</p>
          </div>
          <span className="format-badge">PowerPoint .pptx</span>
        </div>

        <ol className="stepper" aria-label="Étapes de création">
          {([1, 2, 3] as StepNumber[]).map((n) => (
            <li key={n} className={n === step ? "active" : n < step ? "done" : ""}>
              <span>{String(n).padStart(2, "0")}</span>
              {STEP_LABELS[n]}
            </li>
          ))}
        </ol>

        <div className="work-grid">
          <main className="main-panel">
            {step === 1 && (
              <Step1Scenario form={form} onChange={setForm} onExtracted={goToStep2} />
            )}
            {step === 2 && extractResult && (
              <Step2Review
                result={extractResult}
                onBack={backToStep1}
                onGenerated={goToStep3}
              />
            )}
            {step === 3 && generateResult && (
              <Step3Result result={generateResult} onStartOver={startOver} />
            )}
          </main>

          <aside className="summary-card">
            <p className="eyebrow">Votre présentation</p>
            <h2>{scenarioLabel(form.scenario)}</h2>
            <p>Format de sortie : .pptx</p>
            <dl className="summary-stats">
              <div>
                <dt>Scénario</dt>
                <dd>{scenarioLabel(form.scenario)}</dd>
              </div>
              <div>
                <dt>Étape</dt>
                <dd>
                  {step} / 3 — {STEP_LABELS[step]}
                </dd>
              </div>
              {form.scenario === "comparaison" && (
                <div>
                  <dt>Groupes</dt>
                  <dd>{form.groupes.length}</dd>
                </div>
              )}
            </dl>
          </aside>
        </div>
      </div>

      <footer className="footer">PV studio — Du temps pour vos projets.</footer>
    </div>
  );
}
