import { describe, expect, it } from "vitest";
import { checkDimensioningConsistency } from "../src/dimensioningCheck.js";

describe("checkDimensioningConsistency", () => {
  it("returns no warning when both PDFs agree on the dimensioning", () => {
    const warnings = checkDimensioningConsistency(
      { nombreModules: 750, puissanceInstallee: 352500 },
      { nombreModules: 750, puissanceInstallee: 352500 },
    );
    expect(warnings).toEqual([]);
  });

  it("warns when the module count differs", () => {
    const warnings = checkDimensioningConsistency(
      { nombreModules: 750, puissanceInstallee: 352500 },
      { nombreModules: 600, puissanceInstallee: 352500 },
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/Nombre de modules/);
    expect(warnings[0]).toContain("750");
    expect(warnings[0]).toContain("600");
  });

  it("warns when the installed power differs", () => {
    const warnings = checkDimensioningConsistency(
      { nombreModules: 750, puissanceInstallee: 352500 },
      { nombreModules: 750, puissanceInstallee: 300000 },
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/Puissance installée/);
  });

  it("reports both warnings when both values differ", () => {
    const warnings = checkDimensioningConsistency(
      { nombreModules: 750, puissanceInstallee: 352500 },
      { nombreModules: 600, puissanceInstallee: 300000 },
    );
    expect(warnings).toHaveLength(2);
  });
});
