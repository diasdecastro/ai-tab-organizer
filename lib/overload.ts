export type OverloadZone = "green" | "amber" | "red";

export const LOOSE_GREEN_MAX = 8;
export const LOOSE_RED_MIN = 12;
export const OVERLOAD_GAUGE_MAX = 20;

/** Arc fraction where the green zone ends: the 8-tab breakpoint sits at the top. */
export const OVERLOAD_ARC_GREEN_END = 0.5;
/** Arc fraction where the amber zone ends at 12 tabs. */
export const OVERLOAD_ARC_AMBER_END = 0.75;

/**
 * Maps a loose-tab count onto a non-linear 0–1 arc position.
 *
 * The gauge is piecewise linear so the 8-tab breakpoint lands exactly halfway
 * around the semicircle and the amber band stays tight around the top-right.
 */
export function overloadArcRatio(
  looseTabs: number,
  gaugeMax = OVERLOAD_GAUGE_MAX,
): number {
  const max = Math.max(LOOSE_RED_MIN + 1, gaugeMax);
  const value = Math.max(0, looseTabs);

  if (value <= LOOSE_GREEN_MAX) {
    return (value / LOOSE_GREEN_MAX) * OVERLOAD_ARC_GREEN_END;
  }

  if (value <= LOOSE_RED_MIN) {
    const progress =
      (value - LOOSE_GREEN_MAX) / (LOOSE_RED_MIN - LOOSE_GREEN_MAX);
    return (
      OVERLOAD_ARC_GREEN_END +
      progress * (OVERLOAD_ARC_AMBER_END - OVERLOAD_ARC_GREEN_END)
    );
  }

  if (value >= max) return 1;

  const progress = (value - LOOSE_RED_MIN) / (max - LOOSE_RED_MIN);
  return OVERLOAD_ARC_AMBER_END + progress * (1 - OVERLOAD_ARC_AMBER_END);
}

export interface OverloadInfo {
  zone: OverloadZone;
  label: string;
  status: string;
  hex: string;
}

export function overloadZone(looseTabs: number): OverloadZone {
  if (looseTabs < LOOSE_GREEN_MAX) return "green";
  if (looseTabs < LOOSE_RED_MIN) return "amber";
  return "red";
}

export function overloadInfo(looseTabs: number): OverloadInfo {
  const zone = overloadZone(looseTabs);
  if (zone === "green") {
    return {
      zone,
      label: "Nicely tidy",
      status: "Nicely tidy — keep it up.",
      hex: "#34c759",
    };
  }
  if (zone === "amber") {
    return {
      zone,
      label: "Getting busy",
      status: "Getting busy — tidy a few loose tabs.",
      hex: "#ff9f0a",
    };
  }
  return {
    zone,
    label: "Tab overload",
    status: "Tab overload — clear some loose tabs.",
    hex: "#ff453a",
  };
}
