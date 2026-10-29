import { describe, expect, it } from "vitest";
import { buildLocalProposal } from "../lib/grouping/methods";
import type { TabInfo } from "../lib/types";
import { makeTab } from "./fixtures";

const NOW = 1_700_000_000_000;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function tab(id: number, overrides: Partial<TabInfo> = {}): TabInfo {
  return makeTab({ id, ...overrides });
}

describe("last access method", () => {
  it("groups tabs into time buckets and merges singleton buckets", () => {
    const tabs = [
      tab(1, { lastAccessed: NOW - HOUR }),
      tab(2, { lastAccessed: NOW - 2 * HOUR }),
      tab(3, { lastAccessed: NOW - 3 * DAY }),
      tab(4, { lastAccessed: NOW - 4 * DAY }),
      tab(5, { lastAccessed: NOW - 10 * DAY }),
    ];

    const proposal = buildLocalProposal("lastAccess", tabs, 1, {
      now: NOW,
      proposalId: "local-1",
    });

    expect(proposal.source).toBe("local");
    expect(proposal.provider).toBe("local");
    expect(proposal.model).toBe("On-device");
    expect(proposal.method).toBe("lastAccess");
    expect(proposal.groups.map((group) => group.name)).toEqual([
      "Today",
      "This week",
    ]);
    expect(proposal.groups[0]!.tabs.map((item) => item.tabId)).toEqual([1, 2]);
    expect(proposal.groups[1]!.tabs.map((item) => item.tabId)).toEqual([
      3, 4, 5,
    ]);
    expect(proposal.ungrouped).toEqual([]);
  });

  it("puts unknown access times into Earlier", () => {
    const proposal = buildLocalProposal("lastAccess", [tab(1), tab(2)], 1, {
      now: NOW,
    });
    expect(proposal.groups[0]!.name).toBe("Earlier");
    expect(proposal.groups[0]!.tabs).toHaveLength(2);
  });

  it("rejects fewer than two eligible tabs", () => {
    expect(() =>
      buildLocalProposal("lastAccess", [tab(1)], 1, { now: NOW }),
    ).toThrow(/two eligible/i);
  });
});

describe("alphabetical method", () => {
  it("groups by alphabetical ranges", () => {
    const tabs = [
      tab(1, { hostname: "github.com", title: "GitHub" }),
      tab(2, { hostname: "google.com", title: "Google" }),
      tab(3, { hostname: "amazon.com", title: "Amazon" }),
      tab(4, { hostname: "apple.com", title: "Apple" }),
      tab(5, { hostname: "news.example.com", title: "News" }),
      tab(6, { hostname: "netflix.com", title: "Netflix" }),
      tab(7, { hostname: "youtube.com", title: "YouTube" }),
    ];

    const proposal = buildLocalProposal("alphabetical", tabs, 1, {
      now: NOW,
    });

    expect(proposal.groups.map((group) => group.name)).toEqual([
      "A–F",
      "G–M",
      "N–S",
    ]);
    const grouped = proposal.groups.flatMap((group) =>
      group.tabs.map((item) => item.tabId),
    );
    expect(grouped).toHaveLength(7);
    expect(proposal.ungrouped).toEqual([]);
  });

  it("uses the title when a hostname is unavailable", () => {
    const proposal = buildLocalProposal(
      "alphabetical",
      [
        tab(1, { hostname: "", title: "Alpha notes" }),
        tab(2, { hostname: "", title: "Beta notes" }),
      ],
      1,
      { now: NOW },
    );
    expect(proposal.groups[0]!.name).toBe("A–F");
  });

  it("refuses AI-only methods", () => {
    expect(() => buildLocalProposal("category", [tab(1), tab(2)], 1)).toThrow(
      /requires AI/i,
    );
    expect(() => buildLocalProposal("relevance", [tab(1), tab(2)], 1)).toThrow(
      /requires AI/i,
    );
  });
});
