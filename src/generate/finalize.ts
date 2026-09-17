import { addConclusionSlide, type ConclusionScenario } from "../pptx/conclusionSlide.js";
import { addCoverSlide } from "../pptx/coverSlide.js";
import type { Pptx } from "../pptx/zip.js";

/**
 * Complète un pptx déjà rendu (contenu sans-stockage/stockage/comparaison)
 * avec la slide de couverture (en tête) et la slide de conclusion (en
 * queue, un bloc par élément de `scenarios`). Appelé une seule fois par
 * pptx final généré, jamais par cas/groupe individuel — voir
 * `render.ts` (scénarios sans-stockage/stockage seuls) et
 * `comparaison.ts` (scénario comparaison, après assemblage de tous les
 * groupes).
 */
export function finalizePptx(zip: Pptx, scenarios: ConclusionScenario[]): void {
  addCoverSlide(zip);
  addConclusionSlide(zip, scenarios);
}
