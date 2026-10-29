import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { updateActionIcon } from "../lib/browser/action-icon";

type RawTab = {
  id: number;
  pinned: boolean;
  incognito: boolean;
  groupId: number;
  url: string;
};

function looseTabs(count: number): RawTab[] {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    pinned: false,
    incognito: false,
    groupId: -1,
    url: `https://example.com/${index}`,
  }));
}

async function runWithTabs(tabs: RawTab[]) {
  vi.spyOn(fakeBrowser.windows, "getLastFocused").mockResolvedValue({
    id: 1,
  } as never);
  vi.spyOn(fakeBrowser.tabs, "query").mockResolvedValue(tabs as never);
  const setIcon = vi
    .spyOn(fakeBrowser.action, "setIcon")
    .mockResolvedValue(undefined as never);
  vi.spyOn(fakeBrowser.action, "setBadgeText").mockResolvedValue(
    undefined as never,
  );

  await updateActionIcon();
  return setIcon;
}

beforeEach(() => {
  vi.restoreAllMocks();
  fakeBrowser.reset();
});

describe("toolbar status dot", () => {
  it("uses the green icon below 8 loose tabs", async () => {
    const setIcon = await runWithTabs(looseTabs(5));

    expect(setIcon).toHaveBeenCalledWith({
      path: expect.objectContaining({
        16: "icon/status-green-16.png",
        32: "icon/status-green-32.png",
      }),
    });
  });

  it("uses amber from 8 through 11 loose tabs", async () => {
    const setIcon = await runWithTabs(looseTabs(9));

    expect(setIcon).toHaveBeenCalledWith({
      path: expect.objectContaining({
        16: "icon/status-amber-16.png",
      }),
    });
  });

  it("uses red starting at 12 loose tabs and ignores pinned/extension tabs", async () => {
    const tabs: RawTab[] = [
      ...looseTabs(12),
      {
        id: 100,
        pinned: true,
        incognito: false,
        groupId: -1,
        url: "https://pinned.example.com",
      },
      {
        id: 101,
        pinned: false,
        incognito: false,
        groupId: -1,
        url: fakeBrowser.runtime.getURL("/dashboard.html"),
      },
    ];
    const setIcon = await runWithTabs(tabs);

    expect(setIcon).toHaveBeenCalledWith({
      path: expect.objectContaining({
        16: "icon/status-red-16.png",
        48: "icon/status-red-48.png",
      }),
    });
  });
});
