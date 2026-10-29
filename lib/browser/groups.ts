import { browser } from "wxt/browser";
import type {
  AppliedGroup,
  ApplyResult,
  Proposal,
  UndoRecord,
  UndoResult,
} from "../types";
import { planUndo, resolveApplyPlan } from "../grouping/apply";
import { readTabSnapshot } from "./tabs";

export interface CreateGroupsOutcome {
  result: ApplyResult;
  undo: UndoRecord;
}

export async function createNativeGroups(
  proposal: Proposal,
): Promise<CreateGroupsOutcome> {
  const snapshot = await readTabSnapshot(proposal.windowId);
  const plan = resolveApplyPlan(proposal, snapshot.tabs);

  if (plan.groups.length === 0) {
    throw new Error(
      "None of the proposed groups can be applied. The tabs may have been closed, moved, or grouped since the tabs were classified.",
    );
  }

  const applied: AppliedGroup[] = [];

  try {
    for (const group of plan.groups) {
      const groupId = await groupTabs(group.tabIds, proposal.windowId);

      // Record the new group before updating metadata so it is still rolled
      // back if renaming or recoloring fails.
      applied.push({
        groupId,
        name: group.name,
        color: group.color,
        tabIds: group.tabIds,
      });

      await browser.tabGroups.update(groupId, {
        title: group.name,
        color: group.color,
        collapsed: true,
      });
    }
  } catch (error) {
    const rolledBack = await rollbackAppliedGroups(proposal.windowId, applied);
    const suffix = rolledBack
      ? "No changes were kept."
      : "Some tabs may remain grouped; you can ungroup them manually.";
    throw new Error(
      `Could not create tab groups: ${errorMessage(error)}. ${suffix}`,
    );
  }

  const now = Date.now();
  return {
    result: {
      appliedAt: now,
      windowId: proposal.windowId,
      groups: applied,
      groupedTabCount: plan.appliedTabIds.length,
      skippedTabCount: plan.skippedTabCount,
      skippedGroupCount: plan.skippedGroupCount,
    },
    undo: {
      id: `undo-${proposal.id}`,
      createdAt: now,
      windowId: proposal.windowId,
      groups: applied,
      tabCount: plan.appliedTabIds.length,
    },
  };
}

/**
 * Best-effort removal of groups created by a failed apply. Tabs that the user
 * moved elsewhere during the operation are not touched.
 */
export async function rollbackAppliedGroups(
  windowId: number,
  groups: AppliedGroup[],
): Promise<boolean> {
  if (groups.length === 0) return true;

  const snapshot = await readTabSnapshot(windowId).catch(() => null);
  let allRolledBack = true;

  for (const group of [...groups].reverse()) {
    try {
      const tabIds = snapshot
        ? snapshot.tabs
            .filter(
              (tab) =>
                tab.groupId === group.groupId && group.tabIds.includes(tab.id),
            )
            .map((tab) => tab.id)
        : group.tabIds;

      if (tabIds.length > 0) {
        await ungroupTabs(tabIds);
      }
    } catch {
      allRolledBack = false;
    }
  }

  return allRolledBack;
}

export async function ungroupLastOperation(
  undo: UndoRecord,
): Promise<UndoResult> {
  const snapshot = await readTabSnapshot(undo.windowId);
  const plan = planUndo(undo, snapshot.tabs);

  if (plan.tabIds.length > 0) {
    await ungroupTabs(plan.tabIds);
  }

  return {
    ungroupedTabCount: plan.tabIds.length,
    groupsAffected: plan.groupsAffected,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown browser error";
}

type NonEmptyTabIds = [number, ...number[]];

async function groupTabs(tabIds: number[], windowId: number): Promise<number> {
  return browser.tabs.group({
    tabIds: tabIds as NonEmptyTabIds,
    createProperties: { windowId },
  }) as Promise<number>;
}

async function ungroupTabs(tabIds: number[]): Promise<void> {
  await (browser.tabs.ungroup(tabIds as NonEmptyTabIds) as Promise<void>);
}
