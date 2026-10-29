import { beforeEach, describe, expect, it } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import {
  SAVED_GROUPS_KEY,
  addSavedGroup,
  loadSavedGroups,
  persistSavedGroups,
  removeSavedGroup,
} from "../lib/saved-groups";
import type { SavedGroup } from "../lib/types";

function savedGroup(id: string, createdAt = 1): SavedGroup {
  return {
    id,
    name: `Group ${id}`,
    color: "blue",
    createdAt,
    tabs: [
      {
        title: "Example",
        url: "https://example.com/",
        faviconUrl: "https://example.com/favicon.ico",
      },
    ],
  };
}

beforeEach(() => {
  fakeBrowser.reset();
});

describe("saved groups", () => {
  it("adds, loads, and removes groups in local storage", async () => {
    expect(await loadSavedGroups()).toEqual([]);

    await addSavedGroup(savedGroup("a", 10));
    await addSavedGroup(savedGroup("b", 20));

    const loaded = await loadSavedGroups();
    expect(loaded.map((group) => group.id)).toEqual(["b", "a"]);

    await removeSavedGroup("b");
    expect((await loadSavedGroups()).map((group) => group.id)).toEqual(["a"]);

    const stored = await fakeBrowser.storage.local.get(SAVED_GROUPS_KEY);
    expect(stored[SAVED_GROUPS_KEY]).toHaveLength(1);
    expect(await fakeBrowser.storage.sync.get(null)).toEqual({});
  });

  it("filters invalid and non-web saved tabs", async () => {
    await fakeBrowser.storage.local.set({
      [SAVED_GROUPS_KEY]: [
        {
          id: "valid",
          name: "Valid",
          color: "purple",
          createdAt: 5,
          tabs: [
            { title: "Web", url: "https://example.com/path" },
            { title: "Internal", url: "chrome://settings" },
            { title: "Bad", url: "not a url" },
          ],
        },
        { id: "empty", name: "Empty", tabs: [] },
        "nope",
      ],
    });

    const loaded = await loadSavedGroups();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]!.id).toBe("valid");
    expect(loaded[0]!.tabs).toHaveLength(1);
    expect(loaded[0]!.tabs[0]!.url).toBe("https://example.com/path");
  });

  it("refreshes instead of duplicating an identical saved group", async () => {
    const base = { ...savedGroup("a", 10), name: "Same group" };
    await addSavedGroup(base);
    await addSavedGroup({ ...base, id: "b", createdAt: 20 });
    await addSavedGroup({ ...base, id: "c", createdAt: 30 });
    const loaded = await loadSavedGroups();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]!.id).toBe("a");
  });

  it("persists a normalized, sorted list", async () => {
    const normalized = await persistSavedGroups([
      savedGroup("old", 1),
      savedGroup("new", 2),
    ]);
    expect(normalized.map((group) => group.id)).toEqual(["new", "old"]);
  });
});
