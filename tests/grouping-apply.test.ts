import { describe, expect, it } from "vitest";
import { planUndo, resolveApplyPlan } from "../lib/grouping/apply";
import type {
  Proposal,
  TabGroupColor,
  TabInfo,
  UndoRecord,
} from "../lib/types";
import { makeTab } from "./fixtures";

function proposal(
  groups: Array<{ name: string; tabIds: number[]; color?: TabGroupColor }>,
): Proposal {
  return {
    id: "p1",
    createdAt: 0,
    windowId: 1,
    provider: "openrouter",
    model: "test/model",
    method: "category",
    source: "ai",
    groups: groups.map((group, index) => ({
      key: `g${index + 1}`,
      name: group.name,
      color: group.color ?? "blue",
      tabs: group.tabIds.map((tabId) => ({
        tabId,
        title: `Tab ${tabId}`,
        hostname: tabId === 4 ? "changed.example" : "example.com",
      })),
    })),
    ungrouped: [],
  };
}

function undoRecord(
  groups: Array<{ groupId: number; tabIds: number[] }>,
): UndoRecord {
  return {
    id: "undo-1",
    createdAt: 0,
    windowId: 1,
    groups: groups.map((group) => ({
      ...group,
      name: "Group",
      color: "blue",
    })),
    tabCount: groups.reduce((sum, group) => sum + group.tabIds.length, 0),
  };
}

describe("resolveApplyPlan", () => {
  it("keeps eligible tabs and reports groups that can no longer be applied", () => {
    const plan = resolveApplyPlan(
      proposal([
        { name: "Work", tabIds: [1, 2] },
        { name: "Closed", tabIds: [3, 4] },
      ]),
      [
        makeTab({ id: 1 }),
        makeTab({ id: 2 }),
        makeTab({ id: 4, groupId: 9, eligible: false }),
      ],
    );

    expect(plan.groups).toEqual([
      { key: "g1", name: "Work", color: "blue", tabIds: [1, 2] },
    ]);
    expect(plan.appliedTabIds).toEqual([1, 2]);
    expect(plan.skippedTabCount).toBe(2);
    expect(plan.skippedGroupCount).toBe(1);
  });

  it("drops a group that falls below two tabs because a tab closed", () => {
    const plan = resolveApplyPlan(
      proposal([{ name: "Work", tabIds: [1, 2] }]),
      [makeTab({ id: 1 })],
    );

    expect(plan.groups).toEqual([]);
    expect(plan.skippedGroupCount).toBe(1);
    expect(plan.skippedTabCount).toBe(2);
  });

  it("skips tabs that were pinned, grouped, moved window, or navigated", () => {
    const plan = resolveApplyPlan(
      proposal([
        { name: "Mixed", tabIds: [1, 2, 3, 4, 5, 6] },
        { name: "Fallback", tabIds: [7, 8] },
      ]),
      [
        makeTab({ id: 1 }),
        makeTab({ id: 2, pinned: true, eligible: false }),
        makeTab({ id: 3, groupId: 12, eligible: false }),
        makeTab({ id: 4, hostname: "navigated.example" }),
        makeTab({ id: 5, windowId: 2 }),
        makeTab({ id: 6 }),
        makeTab({ id: 8, groupId: 12, eligible: false }),
      ],
    );

    expect(plan.groups).toEqual([
      {
        key: "g1",
        name: "Mixed",
        color: "blue",
        tabIds: [1, 6],
      },
    ]);
    expect(plan.skippedTabCount).toBe(6);
    expect(plan.skippedGroupCount).toBe(1);
  });

  it("never applies the same tab twice across groups", () => {
    const plan = resolveApplyPlan(
      proposal([
        { name: "First", tabIds: [1, 2] },
        { name: "Second", tabIds: [1, 3] },
      ]),
      [makeTab({ id: 1 }), makeTab({ id: 2 }), makeTab({ id: 3 })],
    );

    expect(plan.groups).toEqual([
      { key: "g1", name: "First", color: "blue", tabIds: [1, 2] },
    ]);
    expect(plan.appliedTabIds).toEqual([1, 2]);
    expect(plan.skippedTabCount).toBe(1);
    expect(plan.skippedGroupCount).toBe(1);
  });

  it("returns no groups when the window has no matching tabs", () => {
    const plan = resolveApplyPlan(
      proposal([{ name: "Work", tabIds: [1, 2] }]),
      [],
    );

    expect(plan.groups).toEqual([]);
    expect(plan.appliedTabIds).toEqual([]);
    expect(plan.skippedTabCount).toBe(2);
    expect(plan.skippedGroupCount).toBe(1);
  });
});

describe("planUndo", () => {
  it("ungroups only tabs still inside the groups created by the extension", () => {
    const plan = planUndo(
      undoRecord([
        { groupId: 10, tabIds: [1, 2] },
        { groupId: 11, tabIds: [3] },
      ]),
      [
        makeTab({ id: 1, groupId: 10, eligible: false }),
        makeTab({ id: 2, groupId: 12, eligible: false }),
        makeTab({ id: 4, groupId: 10, eligible: false }),
        makeTab({ id: 5, groupId: 10, pinned: true, eligible: false }),
      ],
    );

    expect(plan.tabIds).toEqual([1]);
    expect(plan.groupsAffected).toBe(1);
  });

  it("reports nothing to undo when tabs were closed or moved", () => {
    const plan = planUndo(undoRecord([{ groupId: 10, tabIds: [1, 2] }]), [
      makeTab({ id: 1 }),
      makeTab({ id: 2, groupId: 11, eligible: false }),
    ]);

    expect(plan.tabIds).toEqual([]);
    expect(plan.groupsAffected).toBe(0);
  });

  it("leaves tabs in unrelated groups untouched", () => {
    const plan = planUndo(undoRecord([{ groupId: 10, tabIds: [1] }]), [
      makeTab({ id: 1, groupId: 10, eligible: false }),
      makeTab({ id: 2, groupId: 99, eligible: false }),
    ]);

    expect(plan.tabIds).not.toContain(2);
  });
});
