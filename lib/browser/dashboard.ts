import { browser } from "wxt/browser";
import { toTabInfo, type RawTabGroup } from "../tabs";
import { computeDashboardStats } from "../dashboard";
import { loadSavedGroups } from "../saved-groups";
import { loadSettings } from "../settings";
import type {
  DashboardGroup,
  DashboardState,
  DashboardTab,
  DashboardWindowInfo,
  TabGroupColor,
} from "../types";

export async function readDashboardState(
  windowId: number,
): Promise<DashboardState> {
  const [rawTabs, rawGroups, rawWindows, savedGroups, settings] =
    await Promise.all([
      browser.tabs.query({}),
      browser.tabGroups.query({}),
      browser.windows.getAll(),
      loadSavedGroups(),
      loadSettings(),
    ]);

  const incognitoWindows = new Set(
    rawWindows.filter((window) => window.incognito).map((window) => window.id),
  );
  const groupsById = new Map<number, RawTabGroup>(
    rawGroups.map((group) => [
      group.id,
      { id: group.id, title: group.title, color: group.color },
    ]),
  );

  const extensionOrigin = browser.runtime.getURL("");
  const tabs: DashboardTab[] = rawTabs
    .filter(
      (tab) =>
        tab.id !== undefined &&
        !tab.incognito &&
        !(tab.url?.startsWith(extensionOrigin) ?? false),
    )
    .map((tab) => ({
      ...toTabInfo(tab, groupsById),
      url: tab.url ?? "",
      lastAccessed: tab.lastAccessed ?? 0,
      audible: tab.audible ?? false,
    }))
    .sort((a, b) => a.windowId - b.windowId || a.index - b.index);

  const windows: DashboardWindowInfo[] = rawWindows
    .filter((window) => window.id !== undefined && !window.incognito)
    .map((window) => ({
      id: window.id!,
      focused: window.focused ?? false,
      incognito: false,
      tabCount: tabs.filter((tab) => tab.windowId === window.id).length,
    }));

  const groups: DashboardGroup[] = rawGroups
    .filter((group) => !incognitoWindows.has(group.windowId))
    .map((group) => ({
      id: group.id,
      windowId: group.windowId,
      name: group.title?.trim() || "Unnamed group",
      color: group.color as TabGroupColor,
      tabIds: tabs
        .filter((tab) => tab.groupId === group.id)
        .map((tab) => tab.id),
    }));

  return {
    windowId,
    tabs,
    windows,
    groups,
    stats: computeDashboardStats(tabs, windows, groups, windowId),
    savedGroups,
    settings,
    capturedAt: Date.now(),
  };
}
