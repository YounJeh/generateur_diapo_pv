import { createGroupe, type GroupeFormState } from "../state/formState";
import { RowsStepper } from "./RowsStepper";
import { UploadField } from "./UploadField";

interface Props {
  groupes: GroupeFormState[];
  onChange: (groupes: GroupeFormState[]) => void;
}

export function GroupList({ groupes, onChange }: Props) {
  function updateGroupe(id: string, patch: Partial<GroupeFormState>) {
    onChange(groupes.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  }

  function removeGroupe(id: string) {
    onChange(groupes.filter((g) => g.id !== id));
  }

  function addGroupe() {
    onChange([...groupes, createGroupe()]);
  }

  return (
    <div>
      {groupes.map((groupe, index) => (
        <div className="groupe-card" key={groupe.id}>
          <div className="groupe-card-header">
            <strong>Groupe {index + 1}</strong>
            {groupes.length > 1 && (
              <button
                type="button"
                className="text-btn danger"
                onClick={() => removeGroupe(groupe.id)}
              >
                Retirer
              </button>
            )}
          </div>

          <div className="uploads-grid">
            <UploadField
              label="Rapport sans stockage"
              file={groupe.pdfSansStockage}
              onChange={(file) => updateGroupe(groupe.id, { pdfSansStockage: file })}
            />
            <UploadField
              label="Rapport avec stockage"
              file={groupe.pdfAvecStockage}
              onChange={(file) => updateGroupe(groupe.id, { pdfAvecStockage: file })}
            />
          </div>

          <div className="rows-field">
            <div>
              <label className="field-label" htmlFor={`rangees-${groupe.id}`}>
                Rangées d'ombrières
              </label>
              <p style={{ margin: 0, fontSize: 12, color: "var(--muted)" }}>
                Au moins un des deux rapports est requis pour ce groupe.
              </p>
            </div>
            <RowsStepper
              id={`rangees-${groupe.id}`}
              value={groupe.rangees}
              onChange={(value) => updateGroupe(groupe.id, { rangees: value })}
            />
          </div>
        </div>
      ))}

      <button type="button" className="add-groupe-btn" onClick={addGroupe}>
        + Ajouter un groupe
      </button>
    </div>
  );
}
