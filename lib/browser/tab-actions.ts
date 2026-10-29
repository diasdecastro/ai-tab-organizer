import { browser } from "wxt/browser";
import {
  addSavedGroup,
  loadSavedGroups,
  removeSavedGroup,
} from "../saved-groups";
import {
  TAB_GROUP_COLORS,
  type SavedGroup,
  type SavedGroupTab,
  type TabGroupColor,
} from "../types";

function isWebUrl(url: string | undefined): url is string {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function nonEmpty<T>(items: T[]): [T, ...T[]] {
  if (items.length === 0) throw new Error("No tabs selected.");
  return items as [T, ...T[]];
}

export async function closeTabsByIds(tabIds: number[]): Promise<string> {
  const requested = new Set(tabIds);
  const tabs = await browser.tabs.query({});
  const targets = tabs.filter(
    (tab) =>
      tab.id !== undefined &&
      requested.has(tab.id) &&
      !tab.pinned &&
      !tab.incognito,
  );

  if (targets.length === 0) {
    throw new Error(
      "No closable tabs were selected. Pinned tabs are preserved.",
    );
  }

  await browser.tabs.remove(targets.map((tab) => tab.id!));
  return `Closed ${targets.length} tab${targets.length === 1 ? "" : "s"}.`;
}

export async function moveTabsToNewWindow(tabIds: number[]): Promise<string> {
  const requested = new Set(tabIds);
  const tabs = await browser.tabs.query({});
  const targets = tabs.filter(
    (tab) =>
      tab.id !== undefined &&
      requested.has(tab.id) &&
      !tab.pinned &&
      !tab.incognito,
  );

  if (targets.length === 0) {
    throw new Error("No movable tabs were selected.");
  }

  const [first, ...rest] = targets;
  const created = await browser.windows.create({
    tabId: first!.id,
    focused: true,
    type: "normal",
  });
  if (!created || created.id === undefined) {
    throw new Error("The browser did not create a new window.");
  }

  if (rest.length > 0) {
    await browser.tabs.move(
      rest.map((tab) => tab.id!),
      { windowId: created.id, index: -1 },
    );
  }

  return `Moved ${targets.length} tab${
    targets.length === 1 ? "" : "s"
  } to a new window.`;
}

export async function mergeOtherWindows(
  targetWindowId: number,
): Promise<string> {
  const allTabs = await browser.tabs.query({});
  const movable = allTabs.filter(
    (tab) =>
      tab.id !== undefined &&
      tab.windowId !== targetWindowId &&
      !tab.incognito &&
      !tab.pinned &&
      (tab.groupId ?? -1) === -1 &&
      isWebUrl(tab.url),
  );

  if (movable.length === 0) {
    throw new Error(
      "No ungrouped, unpinned web tabs were found in other windows. Existing groups and pinned tabs stay where they are.",
    );
  }

  await browser.tabs.move(
    movable.map((tab) => tab.id!),
    { windowId: targetWindowId, index: -1 },
  );

  // Close windows that became empty as a result of the merge. Windows with
  // pinned or grouped tabs are intentionally left open.
  const remainingTabs = await browser.tabs.query({});
  const windows = await browser.windows.getAll();
  let closedWindows = 0;
  for (const window of windows) {
    if (
      window.id === undefined ||
      window.id === targetWindowId ||
      window.incognito
    ) {
      continue;
    }
    if (!remainingTabs.some((tab) => tab.windowId === window.id)) {
      try {
        await browser.windows.remove(window.id);
        closedWindows += 1;
      } catch {
        // An empty window may be closed by the browser already.
      }
    }
  }

  return `Moved ${movable.length} tab${movable.length === 1 ? "" : "s"} into this window${
    closedWindows > 0
      ? ` and closed ${closedWindows} empty window${closedWindows === 1 ? "" : "s"}`
      : ""
  }.`;
}

export async function saveGroupToLibrary(groupId: number): Promise<string> {
  const groups = await browser.tabGroups.query({});
  const group = groups.find((item) => item.id === groupId);
  if (!group) {
    throw new Error("That tab group no longer exists.");
  }

  const groupTabs = await browser.tabs.query({ groupId });
  const tabs: SavedGroupTab[] = groupTabs
    .filter((tab) => isWebUrl(tab.url))
    .map((tab) => ({
      title: tab.title?.trim() || new URL(tab.url!).hostname,
      url: tab.url!,
      faviconUrl: tab.favIconUrl,
    }));

  if (tabs.length === 0) {
    throw new Error("That group has no web tabs that can be saved.");
  }

  const saved: SavedGroup = {
    id: crypto.randomUUID(),
    name: group.title?.trim() || "Saved group",
    color: group.color as TabGroupColor,
    createdAt: Date.now(),
    tabs,
  };
  await addSavedGroup(saved);
  return `Saved “${saved.name}” with ${tabs.length} tab${
    tabs.length === 1 ? "" : "s"
  }.`;
}

export async function restoreSavedGroup(
  savedGroupId: string,
  windowId: number,
): Promise<string> {
  const savedGroups = await loadSavedGroups();
  const saved = savedGroups.find((group) => group.id === savedGroupId);
  if (!saved) throw new Error("That saved group no longer exists.");

  const createdIds: number[] = [];
  for (const tab of saved.tabs) {
    try {
      const created = await browser.tabs.create({
        url: tab.url,
        windowId,
        active: false,
      });
      if (created.id !== undefined) createdIds.push(created.id);
    } catch {
      // Skip URLs the browser refuses to reopen.
    }
  }

  if (createdIds.length === 0) {
    throw new Error("Could not reopen any tabs from that saved group.");
  }

  const groupId = await browser.tabs.group({
    tabIds: nonEmpty(createdIds),
    createProperties: { windowId },
  });
  await browser.tabGroups.update(groupId, {
    title: saved.name,
    color: saved.color,
    collapsed: true,
  });

  return `Reopened “${saved.name}” with ${createdIds.length} tab${
    createdIds.length === 1 ? "" : "s"
  }.`;
}

export async function deleteSavedGroup(savedGroupId: string): Promise<string> {
  await removeSavedGroup(savedGroupId);
  return "Saved group removed.";
}

export async function ungroupAllTabs(windowId: number): Promise<string> {
  const tabs = await browser.tabs.query({ windowId });
  const grouped = tabs.filter(
    (tab) => tab.id !== undefined && !tab.pinned && (tab.groupId ?? -1) !== -1,
  );

  if (grouped.length === 0) {
    throw new Error("There are no grouped tabs to ungroup in this window.");
  }

  await browser.tabs.ungroup(
    nonEmpty(grouped.map((tab) => tab.id!)) as [number, ...number[]],
  );
  return `Ungrouped ${grouped.length} tab${grouped.length === 1 ? "" : "s"}.`;
}

export async function toggleGroupsCollapsed(windowId: number): Promise<string> {
  const groups = await browser.tabGroups.query({ windowId });
  if (groups.length === 0) {
    throw new Error("There are no tab groups in this window.");
  }

  const collapse = !groups.every((group) => group.collapsed);
  for (const group of groups) {
    await browser.tabGroups.update(group.id, { collapsed: collapse });
  }

  return `${collapse ? "Collapsed" : "Expanded"} ${groups.length} group${
    groups.length === 1 ? "" : "s"
  }.`;
}

export async function renameTabGroup(
  groupId: number,
  title: string,
  color?: TabGroupColor,
): Promise<string> {
  const trimmed = title.replace(/\s+/g, " ").trim();
  if (!trimmed) throw new Error("Group name cannot be empty.");
  if (trimmed.length > 60) throw new Error("Group name is too long.");

  await browser.tabGroups.update(groupId, {
    title: trimmed,
    ...(color && (TAB_GROUP_COLORS as readonly string[]).includes(color)
      ? { color }
      : {}),
  });
  return "Group renamed.";
}
