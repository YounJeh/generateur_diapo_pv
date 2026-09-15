import { describe, expect, it } from "vitest";
import { formatProductionKwh, formatRatioPerformance } from "../../src/pptx/format.js";

describe("formatProductionKwh", () => {
  it("converts MWh (comma) to kWh with space thousands separator", () => {
    expect(formatProductionKwh("350,73")).toBe("350 730");
  });

  it("matches the original template's own value for a round-trip sanity check", () => {
    // Le template original affichait "347 760 kWh" pour 347,76 MWh.
    expect(formatProductionKwh("347,76")).toBe("347 760");
  });

  it("handles values under 1000 kWh without a spurious separator", () => {
    expect(formatProductionKwh("0,5")).toBe("500");
  });
});

describe("formatRatioPerformance", () => {
  it("passes the raw PDF value through unchanged", () => {
    expect(formatRatioPerformance("77")).toBe("77");
    expect(formatRatioPerformance("76,4")).toBe("76,4");
  });
});
