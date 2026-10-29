import type {
  DashboardGroup,
  DashboardStats,
  DashboardTab,
  DashboardWindowInfo,
} from "./types";

export function computeDashboardStats(
  tabs: DashboardTab[],
  windows: DashboardWindowInfo[],
  groups: DashboardGroup[],
  _windowId: number,
): DashboardStats {
  const groupedTabs = tabs.filter((tab) => tab.groupId !== -1);
  const looseTabs = tabs.filter((tab) => !tab.pinned && tab.groupId === -1);

  return {
    totalTabs: tabs.length,
    totalWindows: windows.length,
    totalGroups: groups.length,
    loose: looseTabs.length,
    organizedPercent:
      tabs.length === 0
        ? 0
        : Math.round((groupedTabs.length / tabs.length) * 100),
    pinned: tabs.filter((tab) => tab.pinned).length,
  };
}

export function mostAccessedTabs(
  tabs: DashboardTab[],
  limit = 5,
): DashboardTab[] {
  return tabs
    .filter((tab) => tab.hostname && tab.lastAccessed > 0)
    .sort((a, b) => b.lastAccessed - a.lastAccessed)
    .slice(0, limit);
}

export function leastAccessedTabs(
  tabs: DashboardTab[],
  limit = 5,
): DashboardTab[] {
  return tabs
    .filter((tab) => tab.hostname && tab.lastAccessed > 0)
    .sort((a, b) => a.lastAccessed - b.lastAccessed)
    .slice(0, limit);
}

export function relativeTime(timestamp: number, now = Date.now()): string {
  if (!timestamp) return "Unknown";
  const diff = Math.max(0, now - timestamp);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function hostnameLabel(hostname: string): string {
  return hostname.replace(/^www\./, "") || "Browser page";
}
