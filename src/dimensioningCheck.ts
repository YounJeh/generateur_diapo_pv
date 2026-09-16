/** Sous-ensemble de `SlideValues`/`StorageSlideValues` qui caractérise le dimensionnement physique. */
export interface DimensioningSummary {
  nombreModules: number;
  puissanceInstallee: number;
}

/**
 * Compare le dimensionnement extrait des deux PDF du scénario "comparaison".
 * Renvoie une liste d'avertissements (vide si cohérent) : le nombre de
 * modules et la puissance installée dépendent uniquement de l'implantation
 * physique, pas du stockage, donc ils doivent être identiques si les deux
 * PDF décrivent bien le même dimensionnement.
 */
export function checkDimensioningConsistency(
  sansStockage: DimensioningSummary,
  avecStockage: DimensioningSummary,
): string[] {
  const warnings: string[] = [];

  if (sansStockage.nombreModules !== avecStockage.nombreModules) {
    warnings.push(
      `Nombre de modules différent entre les deux PDF : ${sansStockage.nombreModules} (sans stockage) vs ${avecStockage.nombreModules} (avec stockage).`,
    );
  }

  if (sansStockage.puissanceInstallee !== avecStockage.puissanceInstallee) {
    warnings.push(
      `Puissance installée différente entre les deux PDF : ${sansStockage.puissanceInstallee} kWc (sans stockage) vs ${avecStockage.puissanceInstallee} kWc (avec stockage).`,
    );
  }

  return warnings;
}
