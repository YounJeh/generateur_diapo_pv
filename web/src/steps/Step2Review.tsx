import { useState } from "react";
import { generatePptx } from "../api/client";
import type { ExtractResponse, GenerateResponse } from "../api/types";
import { ValuesTable } from "../components/ValuesTable";

interface Props {
  result: ExtractResponse;
  onBack: () => void;
  onGenerated: (result: GenerateResponse) => void;
}

export function Step2Review({ result, onBack, onGenerated }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setError(null);
    setLoading(true);
    try {
      const generated = await generatePptx(result.sessionId);
      onGenerated(generated);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      {error && <div className="error-banner">{error}</div>}

      <section className="section">
        <h2>Vérifiez les données extraites</h2>
        <p>
          Ces valeurs ont été lues dans votre rapport SolarEdge. Vérifiez-les avant de générer
          votre présentation.
        </p>

        {result.scenario === "comparaison" ? (
          result.groupes.map((groupe) => (
            <div key={groupe.scenarioNumero}>
              <p className="groupe-heading">
                Groupe {groupe.scenarioNumero} — {groupe.rangees} rangées
              </p>
              {groupe.cases.map((cas) => (
                <div className="case-block" key={cas.scenario}>
                  <h3>{cas.scenario === "sans-stockage" ? "Sans stockage" : "Avec stockage"}</h3>
                  <ValuesTable scenario={cas.scenario} values={cas.values} />
                </div>
              ))}
            </div>
          ))
        ) : (
          <ValuesTable scenario={result.scenario} values={result.values} />
        )}
      </section>

      <div className="actionbar">
        <button type="button" className="btn btn-secondary" onClick={onBack} disabled={loading}>
          ← Retour
        </button>
        <button type="button" className="btn btn-primary" onClick={handleGenerate} disabled={loading}>
          {loading ? "Génération…" : "Générer la présentation →"}
        </button>
      </div>
    </div>
  );
}
