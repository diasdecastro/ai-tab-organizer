import type { AppliedGroup, Proposal, TabInfo, UndoRecord } from "../types";

export const MIN_GROUP_SIZE = 2;

export interface ResolvedGroup {
  key: string;
  name: string;
  color: AppliedGroup["color"];
  tabIds: number[];
}

export interface ResolvedApplyPlan {
  groups: ResolvedGroup[];
  appliedTabIds: number[];
  skippedTabCount: number;
  skippedGroupCount: number;
}

/**
 * Re-validate a proposal against a fresh tab snapshot.
 * A proposed tab is only included when it still exists, is in the proposal's
 * window, is ungrouped/unpinned, and still points at the same hostname.
 */
export function resolveApplyPlan(
  proposal: Proposal,
  currentTabs: TabInfo[],
): ResolvedApplyPlan {
  const tabsById = new Map(currentTabs.map((tab) => [tab.id, tab]));
  const seenTabIds = new Set<number>();
  const proposedTabIds = new Set<number>();
  const appliedTabIds: number[] = [];
  const groups: ResolvedGroup[] = [];
  let skippedGroupCount = 0;

  for (const group of proposal.groups) {
    const validTabIds: number[] = [];

    for (const proposedTab of group.tabs) {
      proposedTabIds.add(proposedTab.tabId);
      if (seenTabIds.has(proposedTab.tabId)) continue;

      const current = tabsById.get(proposedTab.tabId);
      if (
        !current ||
        !current.eligible ||
        current.windowId !== proposal.windowId ||
        current.hostname !== proposedTab.hostname
      ) {
        continue;
      }

      seenTabIds.add(current.id);
      validTabIds.push(current.id);
    }

    if (validTabIds.length < MIN_GROUP_SIZE) {
      skippedGroupCount += 1;
      continue;
    }

    groups.push({
      key: group.key,
      name: group.name,
      color: group.color,
      tabIds: validTabIds,
    });
    appliedTabIds.push(...validTabIds);
  }

  const appliedSet = new Set(appliedTabIds);
  const skippedTabCount = [...proposedTabIds].filter(
    (tabId) => !appliedSet.has(tabId),
  ).length;

  return { groups, appliedTabIds, skippedTabCount, skippedGroupCount };
}

export interface UndoPlan {
  tabIds: number[];
  groupsAffected: number;
}

/**
 * Only ungroup tabs that are still inside the group this extension created.
 * Tabs that were closed or moved elsewhere by the user are left alone.
 */
export function planUndo(undo: UndoRecord, currentTabs: TabInfo[]): UndoPlan {
  const tabsById = new Map(currentTabs.map((tab) => [tab.id, tab]));
  const tabIds = new Set<number>();
  const groupsAffected = new Set<number>();

  for (const group of undo.groups) {
    for (const tabId of group.tabIds) {
      const current = tabsById.get(tabId);
      if (!current || current.pinned || current.groupId !== group.groupId)
        continue;
      tabIds.add(tabId);
      groupsAffected.add(group.groupId);
    }
  }

  return { tabIds: [...tabIds], groupsAffected: groupsAffected.size };
}
