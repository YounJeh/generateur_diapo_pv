function formatThousands(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** Convertit une production PDF en MWh (virgule, ex. "350,73") en kWh formaté comme le template (ex. "350 730"). */
export function formatProductionKwh(mwhRaw: string): string {
  const mwh = Number.parseFloat(mwhRaw.replace(",", "."));
  const kwh = Math.round(mwh * 1000);
  return formatThousands(kwh);
}

/**
 * Le ratio de performance est réinjecté tel quel, sans reformatage : le PDF
 * peut afficher un entier ("77") ou une décimale selon les cas, et on ne
 * force pas un format fixe (décision utilisateur confirmée pendant le
 * planning, après avoir constaté que le template affichait "77,0" alors que
 * le PDF ne donne que "77").
 */
export function formatRatioPerformance(raw: string): string {
  return raw;
}
