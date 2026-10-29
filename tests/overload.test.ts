import { describe, expect, it } from "vitest";
import {
  LOOSE_RED_MIN,
  LOOSE_GREEN_MAX,
  OVERLOAD_ARC_AMBER_END,
  OVERLOAD_ARC_GREEN_END,
  overloadArcRatio,
  overloadInfo,
  overloadZone,
} from "../lib/overload";

describe("tab overload zones", () => {
  it("is green under 8 loose tabs", () => {
    expect(overloadZone(0)).toBe("green");
    expect(overloadZone(7)).toBe("green");
  });

  it("is amber from 8 through 11 loose tabs", () => {
    expect(overloadZone(LOOSE_GREEN_MAX)).toBe("amber");
    expect(overloadZone(LOOSE_RED_MIN - 1)).toBe("amber");
  });

  it("is red starting at 12 loose tabs", () => {
    expect(overloadZone(LOOSE_RED_MIN)).toBe("red");
    expect(overloadZone(40)).toBe("red");
  });

  it("provides display metadata", () => {
    expect(overloadInfo(3)).toMatchObject({ zone: "green" });
    expect(overloadInfo(10)).toMatchObject({ zone: "amber" });
    expect(overloadInfo(12)).toMatchObject({ zone: "red" });
  });
});

describe("overload gauge arc scale", () => {
  it("puts the 8-tab breakpoint at the top of the semicircle", () => {
    expect(overloadArcRatio(0)).toBe(0);
    expect(overloadArcRatio(LOOSE_GREEN_MAX)).toBeCloseTo(
      OVERLOAD_ARC_GREEN_END,
    );
    expect(OVERLOAD_ARC_GREEN_END).toBe(0.5);
  });

  it("puts the 12-tab breakpoint in the top-right quadrant", () => {
    expect(overloadArcRatio(LOOSE_RED_MIN)).toBeCloseTo(OVERLOAD_ARC_AMBER_END);
    expect(OVERLOAD_ARC_AMBER_END).toBeGreaterThan(OVERLOAD_ARC_GREEN_END);
    expect(OVERLOAD_ARC_AMBER_END).toBeLessThan(1);
  });

  it("fills the gauge at the maximum and clamps out-of-range values", () => {
    expect(overloadArcRatio(20)).toBe(1);
    expect(overloadArcRatio(999)).toBe(1);
    expect(overloadArcRatio(-4)).toBe(0);
  });

  it("increases monotonically with the loose-tab count", () => {
    const ratios = Array.from({ length: 25 }, (_, value) =>
      overloadArcRatio(value),
    );
    for (let i = 1; i < ratios.length; i += 1) {
      expect(ratios[i]!).toBeGreaterThanOrEqual(ratios[i - 1]!);
    }
  });

  it("uses the requested gauge maximum", () => {
    expect(overloadArcRatio(30, 30)).toBe(1);
    expect(overloadArcRatio(21, 30)).toBeGreaterThan(
      overloadArcRatio(LOOSE_RED_MIN),
    );
  });
});
