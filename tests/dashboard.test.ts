import { describe, expect, it } from "vitest";
import {
  computeDashboardStats,
  leastAccessedTabs,
  mostAccessedTabs,
  relativeTime,
} from "../lib/dashboard";
import type {
  DashboardGroup,
  DashboardTab,
  DashboardWindowInfo,
} from "../lib/types";
import { makeTab } from "./fixtures";

const NOW = 1_700_000_000_000;

function dashTab(
  id: number,
  url: string,
  overrides: Partial<DashboardTab> = {},
): DashboardTab {
  const hostname = url.startsWith("http") ? new URL(url).hostname : "";
  return {
    ...makeTab({ id, hostname }),
    url,
    lastAccessed: NOW,
    audible: false,
    ...overrides,
  };
}

const windows: DashboardWindowInfo[] = [
  { id: 1, focused: true, incognito: false, tabCount: 4 },
  { id: 2, focused: false, incognito: false, tabCount: 2 },
];

const groups: DashboardGroup[] = [
  {
    id: 10,
    windowId: 1,
    name: "Work",
    color: "blue",
    tabIds: [1, 2],
  },
];

describe("dashboard stats", () => {
  it("counts empty new tabs as loose when ungrouped", () => {
    const tabs = [
      dashTab(1, "https://example.com/a", {
        groupId: 10,
        groupName: "Work",
      }),
      dashTab(2, "https://example.com/b"),
      dashTab(3, "chrome://newtab/", { title: "New Tab" }),
      dashTab(4, "https://example.com/pinned", { pinned: true }),
    ];

    const stats = computeDashboardStats(tabs, windows, groups, 1);
    expect(stats).toEqual({
      totalTabs: 4,
      totalWindows: 2,
      totalGroups: 1,
      loose: 2,
      organizedPercent: 25,
      pinned: 1,
    });
  });

  it("returns empty-safe stats", () => {
    expect(computeDashboardStats([], [], [], 1)).toEqual({
      totalTabs: 0,
      totalWindows: 0,
      totalGroups: 0,
      loose: 0,
      organizedPercent: 0,
      pinned: 0,
    });
  });
});

describe("access ordering", () => {
  it("returns most and least recently accessed web tabs", () => {
    const tabs = [
      dashTab(1, "https://a.com", { lastAccessed: NOW - 1000 }),
      dashTab(2, "https://b.com", { lastAccessed: NOW - 10 }),
      dashTab(3, "https://c.com", { lastAccessed: NOW - 500 }),
      dashTab(4, "chrome://newtab", { lastAccessed: 0 }),
    ];

    expect(mostAccessedTabs(tabs, 2).map((tab) => tab.id)).toEqual([2, 3]);
    expect(leastAccessedTabs(tabs, 2).map((tab) => tab.id)).toEqual([1, 3]);
  });

  it("formats relative times", () => {
    expect(relativeTime(0, NOW)).toBe("Unknown");
    expect(relativeTime(NOW - 10_000, NOW)).toBe("Just now");
    expect(relativeTime(NOW - 5 * 60_000, NOW)).toBe("5m ago");
    expect(relativeTime(NOW - 3 * 60 * 60_000, NOW)).toBe("3h ago");
    expect(relativeTime(NOW - 3 * 24 * 60 * 60_000, NOW)).toBe("3d ago");
  });
});
