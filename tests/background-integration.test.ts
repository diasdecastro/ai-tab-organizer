import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import type {
  ApiResponse,
  AppSettings,
  PopupState,
  ResponseMap,
  RuntimeRequest,
} from "../lib/types";

type RawTab = {
  id: number;
  windowId: number;
  index: number;
  title: string;
  url: string;
  favIconUrl: string;
  pinned: boolean;
  groupId: number;
  incognito: boolean;
  active: boolean;
};

const tabs: RawTab[] = [
  {
    id: 1,
    windowId: 1,
    index: 0,
    title: "Inbox",
    url: "https://mail.example.com/inbox?token=secret",
    favIconUrl: "https://mail.example.com/favicon.ico",
    pinned: false,
    groupId: -1,
    incognito: false,
    active: true,
  },
  {
    id: 2,
    windowId: 1,
    index: 1,
    title: "Project board",
    url: "https://linear.example.com/team/AT",
    favIconUrl: "https://linear.example.com/favicon.ico",
    pinned: false,
    groupId: -1,
    incognito: false,
    active: false,
  },
  {
    id: 3,
    windowId: 1,
    index: 2,
    title: "Tech news",
    url: "https://news.example.com/articles",
    favIconUrl: "https://news.example.com/favicon.ico",
    pinned: false,
    groupId: -1,
    incognito: false,
    active: false,
  },
  {
    id: 4,
    windowId: 1,
    index: 3,
    title: "Docs",
    url: "https://docs.example.com/guide",
    favIconUrl: "https://docs.example.com/favicon.ico",
    pinned: false,
    groupId: -1,
    incognito: false,
    active: false,
  },
];

function settingsWithKey(): AppSettings {
  return {
    version: 1,
    activeProvider: "openrouter",
    providers: {
      openrouter: { apiKey: "sk-or-test", model: "test/model" },
      deepseek: { apiKey: "", model: "deepseek-chat" },
    },
    defaultMethod: "category",
  };
}

async function send<K extends keyof ResponseMap>(
  message: Extract<RuntimeRequest, { type: K }>,
): Promise<ApiResponse<ResponseMap[K]>> {
  return (await fakeBrowser.runtime.sendMessage(message)) as ApiResponse<
    ResponseMap[K]
  >;
}

async function expectOk<K extends keyof ResponseMap>(
  message: Extract<RuntimeRequest, { type: K }>,
): Promise<ResponseMap[K]> {
  const response = await send(message);
  if (!response.ok) throw new Error(response.error);
  return response.data;
}

function mockTabs(current: RawTab[]): ReturnType<typeof vi.spyOn> {
  const query = vi
    .spyOn(fakeBrowser.tabs, "query")
    .mockResolvedValue(current as never);
  vi.spyOn(fakeBrowser.tabGroups, "query").mockResolvedValue([] as never);
  return query;
}

function classificationResponse(): Response {
  return new Response(
    JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify({
              groups: [
                { name: "Work", color: "blue", tabIds: ["T1", "T2"] },
                { name: "Reading", color: "orange", tabIds: ["T3", "T4"] },
              ],
            }),
          },
        },
      ],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

beforeAll(async () => {
  fakeBrowser.reset();
  const background = await import("../entrypoints/background");
  background.default.main?.();
});

beforeEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await fakeBrowser.storage.local.clear();
  await fakeBrowser.storage.session.clear();
});

describe("background worker integration", () => {
  it("organizes, auto-applies collapsed groups, and undoes through messages", async () => {
    await expectOk({
      type: "SAVE_SETTINGS",
      settings: settingsWithKey(),
    });

    mockTabs(tabs);
    const fetchMock = vi.fn().mockResolvedValue(classificationResponse());
    vi.stubGlobal("fetch", fetchMock);

    const groupMock = vi
      .spyOn(fakeBrowser.tabs, "group")
      .mockResolvedValueOnce(101 as never)
      .mockResolvedValueOnce(102 as never);
    const updateMock = vi
      .spyOn(fakeBrowser.tabGroups, "update")
      .mockResolvedValue(undefined as never);

    const applied = await expectOk({
      type: "ORGANIZE",
      windowId: 1,
      method: "category",
    });

    expect(applied.job.status).toBe("applied");
    if (applied.job.status !== "applied") throw new Error("expected applied");
    expect(applied.job.proposal.groups.map((group) => group.name)).toEqual([
      "Work",
      "Reading",
    ]);
    expect(applied.snapshot.stats.eligible).toBe(4);
    expect(applied.job.result.groups).toHaveLength(2);
    expect(applied.job.result.groupedTabCount).toBe(4);
    expect(applied.undo).not.toBeNull();
    expect(groupMock).toHaveBeenNthCalledWith(1, {
      tabIds: [1, 2],
      createProperties: { windowId: 1 },
    });
    expect(groupMock).toHaveBeenNthCalledWith(2, {
      tabIds: [3, 4],
      createProperties: { windowId: 1 },
    });
    expect(updateMock).toHaveBeenCalledWith(101, {
      title: "Work",
      color: "blue",
      collapsed: true,
    });

    const dismissed = await expectOk({ type: "DISMISS", windowId: 1 });
    expect(dismissed.job.status).toBe("idle");
    expect(dismissed.undo).not.toBeNull();

    mockTabs(
      tabs.map((tab) => ({
        ...tab,
        groupId: tab.id <= 2 ? 101 : 102,
      })),
    );
    const ungroupMock = vi
      .spyOn(fakeBrowser.tabs, "ungroup")
      .mockResolvedValue(undefined as never);

    const undone = await expectOk({ type: "UNDO", windowId: 1 });

    expect(undone.result.ungroupedTabCount).toBe(4);
    expect(undone.result.groupsAffected).toBe(2);
    expect(undone.state.job.status).toBe("idle");
    expect(undone.state.undo).toBeNull();
    expect(ungroupMock).toHaveBeenCalledWith([1, 2, 3, 4]);
  });

  it("returns a friendly error state when no API key is configured", async () => {
    mockTabs(tabs);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const state: PopupState = await expectOk({
      type: "ORGANIZE",
      windowId: 1,
      method: "category",
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(state.job).toMatchObject({
      status: "error",
      phase: "organize",
    });
    if (state.job.status !== "error") throw new Error("expected error");
    expect(state.job.message).toMatch(/API key/i);
  });

  it("organizes with a local method without calling AI or needing a key", async () => {
    mockTabs(tabs);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(fakeBrowser.tabs, "group").mockResolvedValue(201 as never);
    vi.spyOn(fakeBrowser.tabGroups, "update").mockResolvedValue(
      undefined as never,
    );

    const state = await expectOk({
      type: "ORGANIZE",
      windowId: 1,
      method: "alphabetical",
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(state.settings.defaultMethod).toBe("alphabetical");
    expect(state.job.status).toBe("applied");
    if (state.job.status !== "applied") throw new Error("expected applied");
    expect(state.job.proposal.source).toBe("local");
    expect(state.job.proposal.provider).toBe("local");
    expect(state.job.proposal.method).toBe("alphabetical");
    expect(state.job.proposal.groups.length).toBeGreaterThan(0);
    expect(state.job.result.groups.length).toBeGreaterThan(0);
  });

  it("persists the selected organization method", async () => {
    const settings = await expectOk({
      type: "SET_METHOD",
      method: "relevance",
    });
    expect(settings.defaultMethod).toBe("relevance");
  });

  it("returns dashboard state with URLs kept local", async () => {
    mockTabs(tabs);
    const state = await expectOk({ type: "GET_DASHBOARD", windowId: 1 });

    expect(state.stats.totalTabs).toBe(4);
    expect(state.stats.totalWindows).toBe(1);
    expect(state.tabs).toHaveLength(4);
    expect(state.tabs[0]).toMatchObject({
      id: 1,
      url: "https://mail.example.com/inbox?token=secret",
      hostname: "mail.example.com",
    });
    expect(state.savedGroups).toEqual([]);
    expect(state.settings.defaultMethod).toBe("category");
  });

  it("ungroups all tabs through a dashboard action", async () => {
    const grouped = tabs.map((tab) => ({
      ...tab,
      groupId: tab.id <= 2 ? 101 : -1,
    }));
    mockTabs(grouped);
    const ungroupMock = vi
      .spyOn(fakeBrowser.tabs, "ungroup")
      .mockResolvedValue(undefined as never);

    const result = await expectOk({ type: "UNGROUP_ALL", windowId: 1 });

    expect(result.message).toMatch(/Ungrouped 2 tabs/);
    expect(ungroupMock).toHaveBeenCalledWith([1, 2]);
  });

  it("toggles collapse state for every group", async () => {
    mockTabs(
      tabs.map((tab) => ({
        ...tab,
        groupId: tab.id <= 2 ? 101 : -1,
      })),
    );
    vi.spyOn(fakeBrowser.tabGroups, "query").mockResolvedValue([
      { id: 101, title: "Work", color: "blue", collapsed: false, windowId: 1 },
    ] as never);
    const updateMock = vi
      .spyOn(fakeBrowser.tabGroups, "update")
      .mockResolvedValue(undefined as never);

    const result = await expectOk({
      type: "TOGGLE_GROUPS_COLLAPSED",
      windowId: 1,
    });

    expect(result.message).toMatch(/Collapsed 1 group/);
    expect(updateMock).toHaveBeenCalledWith(101, { collapsed: true });
  });
});
