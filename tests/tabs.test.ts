import { describe, expect, it } from "vitest";
import {
  buildClassificationInput,
  buildTabSnapshot,
  parseHostname,
  summarizeTabs,
  toTabInfo,
  type RawTab,
  type RawTabGroup,
} from "../lib/tabs";
import { makeTab } from "./fixtures";

describe("parseHostname", () => {
  it("keeps only the hostname and strips path, port, query, and hash", () => {
    expect(
      parseHostname("https://Example.com:8443/a/b?token=secret#frag"),
    ).toBe("example.com");
  });

  it("supports http and localhost", () => {
    expect(parseHostname("http://localhost:3000/dashboard")).toBe("localhost");
  });

  it.each([
    "chrome://settings",
    "brave://extensions",
    "about:blank",
    "chrome-extension://abc/popup.html",
    "file:///Users/me/secret.txt",
    "devtools://devtools/bundled/inspector.html",
    "not a url",
    undefined,
  ])("rejects unsupported URLs (%s)", (url) => {
    expect(parseHostname(url)).toBeNull();
  });
});

describe("toTabInfo", () => {
  const groups = new Map<number, RawTabGroup>([
    [7, { id: 7, title: " Work ", color: "blue" }],
  ]);

  function raw(overrides: Partial<RawTab> = {}): RawTab {
    return {
      id: 5,
      windowId: 1,
      index: 2,
      title: "  Example\n Page  ",
      url: "https://example.com/path?secret=1",
      favIconUrl: "https://example.com/favicon.ico",
      pinned: false,
      groupId: -1,
      incognito: false,
      active: false,
      ...overrides,
    };
  }

  it("maps tab and group metadata, and never exposes the full URL", () => {
    const tab = toTabInfo(raw({ groupId: 7 }), groups);

    expect(tab).toMatchObject({
      id: 5,
      title: "Example Page",
      hostname: "example.com",
      groupId: 7,
      groupName: "Work",
      groupColor: "blue",
      eligible: false,
      exclusionReason: "grouped",
    });
    expect("url" in tab).toBe(false);
  });

  it("excludes pinned tabs before grouped tabs", () => {
    const tab = toTabInfo(raw({ pinned: true, groupId: 7 }), groups);
    expect(tab.exclusionReason).toBe("pinned");
    expect(tab.eligible).toBe(false);
  });

  it("excludes incognito tabs", () => {
    const tab = toTabInfo(raw({ incognito: true }));
    expect(tab.exclusionReason).toBe("incognito");
  });

  it("excludes unsupported internal pages", () => {
    const tab = toTabInfo(raw({ url: "chrome://settings" }));
    expect(tab.exclusionReason).toBe("unsupported");
    expect(tab.hostname).toBe("");
    expect(tab.title).toBe("Example Page");
  });

  it("marks regular ungrouped http tabs as eligible", () => {
    const tab = toTabInfo(raw());
    expect(tab.eligible).toBe(true);
    expect(tab.exclusionReason).toBeUndefined();
  });
});

describe("summarizeTabs", () => {
  it("counts totals, eligible tabs, groups, and pinned tabs", () => {
    const tabs = [
      makeTab({ id: 1 }),
      makeTab({ id: 2, groupId: 10, eligible: false }),
      makeTab({ id: 3, pinned: true, eligible: false }),
      makeTab({ id: 4, incognito: true, eligible: false }),
      makeTab({ id: 5, hostname: "", eligible: false }),
    ];

    expect(summarizeTabs(tabs)).toEqual({
      total: 5,
      eligible: 1,
      grouped: 1,
      pinned: 1,
      excluded: 4,
    });
    expect(buildTabSnapshot(1, tabs, 123).capturedAt).toBe(123);
  });
});

describe("buildClassificationInput", () => {
  it("includes only temporary ids, titles, and hostnames for eligible tabs", () => {
    const tabs = [
      makeTab({ id: 11, title: "Inbox", hostname: "mail.example.com" }),
      makeTab({
        id: 12,
        title: "Pinned secret",
        pinned: true,
        eligible: false,
      }),
      makeTab({ id: 13, title: "Grouped", groupId: 4, eligible: false }),
      makeTab({ id: 14, title: "Docs", hostname: "docs.example.com" }),
    ];

    const input = buildClassificationInput(tabs);

    expect(input.tabs).toEqual([
      { id: "T1", title: "Inbox", hostname: "mail.example.com" },
      { id: "T2", title: "Docs", hostname: "docs.example.com" },
    ]);
    expect(input.idMap).toEqual({ T1: 11, T2: 14 });
    expect(input.tabs[0]).not.toHaveProperty("url");
    expect(JSON.stringify(input.tabs)).not.toContain("/");
  });

  it("truncates very long titles in the prompt", () => {
    const input = buildClassificationInput([
      makeTab({ id: 1, title: "x".repeat(300) }),
    ]);
    expect(Array.from(input.tabs[0]!.title)).toHaveLength(180);
    expect(input.tabs[0]!.title.endsWith("…")).toBe(true);
  });
});
