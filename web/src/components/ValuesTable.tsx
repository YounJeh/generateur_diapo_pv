import type { SlideValues, StorageSlideValues, TemplateScenario } from "../api/types";

interface Props {
  scenario: TemplateScenario;
  values: SlideValues | StorageSlideValues;
}

export function ValuesTable({ scenario, values }: Props) {
  const rows: Array<[string, string | number]> =
    scenario === "stockage"
      ? [
          ["Puissance installée", `${values.puissanceInstallee} kWc`],
          ["Nombre de modules", values.nombreModules],
          ["Production annuelle", `${values.productionAnnuelleMwh} MWh`],
          ["Ratio de performance", `${values.ratioDePerformance} %`],
          [
            "Taux d'autoconsommation",
            `${(values as StorageSlideValues).tauxAutoconsommationAffichage} %`,
          ],
          [
            "Taux d'autoproduction",
            `${(values as StorageSlideValues).tauxAutoproductionStockage} %`,
          ],
          ["Nombre de rangées", values.rangees],
        ]
      : [
          ["Puissance installée", `${values.puissanceInstallee} kWc`],
          ["Nombre de modules", values.nombreModules],
          ["Production annuelle", `${values.productionAnnuelleMwh} MWh`],
          ["Ratio de performance", `${values.ratioDePerformance} %`],
          ["Taux d'autoconsommation", `${values.tauxAutoconsommation} %`],
          ["Surplus de production", `${values.surplusProduction} %`],
          ["Taux d'autoproduction", `${values.tauxAutoproduction} %`],
          ["Nombre de rangées", values.rangees],
        ];

  return (
    <table className="values-table">
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label}>
            <td>{label}</td>
            <td>{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
