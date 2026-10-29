import { describe, expect, it } from "vitest";
import {
  AiResponseError,
  buildProposalFromResponse,
  parseJsonResponse,
  sanitizeGroupName,
} from "../lib/ai/validate";
import type { Proposal, TabInfo } from "../lib/types";
import { makeInput, makeTab } from "./fixtures";

function proposalFor(content: string, tabs: TabInfo[]): Proposal {
  return buildProposalFromResponse(content, {
    input: makeInput(tabs),
    tabs,
    windowId: 1,
    provider: "openrouter",
    model: "test/model",
    now: 1_700_000_000_000,
    proposalId: "proposal-1",
  });
}

function makeTabs(count: number): TabInfo[] {
  return Array.from({ length: count }, (_, index) =>
    makeTab({ id: index + 1, title: `Tab ${index + 1}` }),
  );
}

describe("parseJsonResponse", () => {
  it("parses plain JSON", () => {
    expect(parseJsonResponse('{"groups":[]}')).toEqual({ groups: [] });
  });

  it("parses JSON wrapped in markdown fences", () => {
    expect(
      parseJsonResponse('```json\n{"groups":[{"name":"Work"}]}\n```'),
    ).toEqual({ groups: [{ name: "Work" }] });
  });

  it("extracts JSON surrounded by prose", () => {
    expect(
      parseJsonResponse('Here you go: {"groups":[]} hope that helps'),
    ).toEqual({
      groups: [],
    });
  });

  it("rejects invalid JSON and empty responses", () => {
    expect(() => parseJsonResponse("not json")).toThrow(AiResponseError);
    expect(() => parseJsonResponse("   ")).toThrow(/empty/i);
  });
});

describe("sanitizeGroupName", () => {
  it("strips decoration and normalizes whitespace", () => {
    expect(sanitizeGroupName("  **Work   & Research**  ")).toBe(
      "Work & Research",
    );
  });

  it("strips bidi and control characters", () => {
    expect(sanitizeGroupName("Wo\u202Erk\u0000")).toBe("Work");
  });

  it("returns Other for empty names", () => {
    expect(sanitizeGroupName("   ")).toBe("Other");
    expect(sanitizeGroupName("***")).toBe("Other");
  });

  it("limits long names", () => {
    expect(Array.from(sanitizeGroupName("x".repeat(100)))).toHaveLength(32);
  });
});

describe("buildProposalFromResponse", () => {
  it("maps temporary ids to validated real tab metadata", () => {
    const tabs = makeTabs(4);
    const proposal = proposalFor(
      JSON.stringify({
        groups: [
          { name: "Work", color: "blue", tabIds: ["T1", "T2"] },
          { name: "News", color: "red", tabIds: ["T3", "T4"] },
        ],
      }),
      tabs,
    );

    expect(proposal.id).toBe("proposal-1");
    expect(proposal.createdAt).toBe(1_700_000_000_000);
    expect(proposal.provider).toBe("openrouter");
    expect(proposal.model).toBe("test/model");
    expect(proposal.groups).toHaveLength(2);
    expect(proposal.groups[0]).toMatchObject({
      name: "Work",
      color: "blue",
      tabs: [
        { tabId: 1, title: "Tab 1", hostname: "example.com" },
        { tabId: 2, title: "Tab 2", hostname: "example.com" },
      ],
    });
    expect(proposal.groups[1]!.tabs.map((tab) => tab.tabId)).toEqual([3, 4]);
    expect(proposal.ungrouped).toEqual([]);
  });

  it("accepts a top-level array and fenced output", () => {
    const tabs = makeTabs(2);
    const proposal = proposalFor(
      '```json\n[{"name":"Work","color":"green","tabIds":["T1","T2"]}]\n```',
      tabs,
    );

    expect(proposal.groups[0]!.name).toBe("Work");
    expect(proposal.groups[0]!.color).toBe("green");
  });

  it("keeps unassigned eligible tabs ungrouped", () => {
    const tabs = makeTabs(4);
    const proposal = proposalFor(
      JSON.stringify({
        groups: [{ name: "Work", color: "blue", tabIds: ["T1", "T2"] }],
      }),
      tabs,
    );

    expect(proposal.ungrouped.map((tab) => tab.tabId)).toEqual([3, 4]);
  });

  it("ignores invented and real-looking tab ids", () => {
    const tabs = makeTabs(4);
    const proposal = proposalFor(
      JSON.stringify({
        groups: [
          {
            name: "Work",
            color: "blue",
            tabIds: ["T1", "T2", "T99", "1", "2"],
          },
          { name: "News", color: "red", tabIds: ["T3", "T4"] },
        ],
      }),
      tabs,
    );

    expect(proposal.groups[0]!.tabs.map((tab) => tab.tabId)).toEqual([1, 2]);
    expect(proposal.groups[1]!.tabs.map((tab) => tab.tabId)).toEqual([3, 4]);
  });

  it("assigns each tab to at most one group", () => {
    const tabs = makeTabs(4);
    const proposal = proposalFor(
      JSON.stringify({
        groups: [
          { name: "Work", color: "blue", tabIds: ["T1", "T2"] },
          { name: "News", color: "red", tabIds: ["T2", "T3", "T4"] },
        ],
      }),
      tabs,
    );

    const ids = proposal.groups.flatMap((group) =>
      group.tabs.map((tab) => tab.tabId),
    );
    expect(ids).toEqual([1, 2, 3, 4]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(proposal.groups[1]!.tabs.map((tab) => tab.tabId)).toEqual([3, 4]);
  });

  it("merges duplicate group names case-insensitively", () => {
    const tabs = makeTabs(4);
    const proposal = proposalFor(
      JSON.stringify({
        groups: [
          { name: "Work", color: "blue", tabIds: ["T1", "T2"] },
          { name: "work", color: "red", tabIds: ["T3", "T4"] },
        ],
      }),
      tabs,
    );

    expect(proposal.groups).toHaveLength(1);
    expect(proposal.groups[0]!.name).toBe("Work");
    expect(proposal.groups[0]!.tabs.map((tab) => tab.tabId)).toEqual([
      1, 2, 3, 4,
    ]);
  });

  it("never creates an Other/Misc junk-drawer group", () => {
    const tabs = makeTabs(4);
    const proposal = proposalFor(
      JSON.stringify({
        groups: [
          { name: "Work", color: "blue", tabIds: ["T1", "T2"] },
          { name: "Solo", color: "green", tabIds: ["T3"] },
          { name: "Misc", color: "orange", tabIds: ["T4"] },
        ],
      }),
      tabs,
    );

    expect(proposal.groups.map((group) => group.name)).toEqual(["Work"]);
    expect(proposal.groups[0]!.tabs.map((tab) => tab.tabId)).toEqual([1, 2]);
    expect(proposal.ungrouped.map((tab) => tab.tabId)).toEqual([3, 4]);
  });

  it("reassigns tabs from generic groups by keyword similarity", () => {
    const tabs = [
      makeTab({ id: 1, title: "Project planning notes" }),
      makeTab({ id: 2, title: "Project documentation" }),
      makeTab({ id: 3, title: "Project budget" }),
      makeTab({ id: 4, title: "Groceries" }),
    ];
    const proposal = proposalFor(
      JSON.stringify({
        groups: [
          { name: "Project", color: "blue", tabIds: ["T1", "T2"] },
          { name: "Misc", color: "orange", tabIds: ["T3", "T4"] },
        ],
      }),
      tabs,
    );

    expect(proposal.groups.map((group) => group.name)).toEqual(["Project"]);
    expect(proposal.groups[0]!.tabs.map((tab) => tab.tabId)).toEqual([1, 2, 3]);
    expect(proposal.ungrouped.map((tab) => tab.tabId)).toEqual([4]);
  });

  it("merges a singleton group into a keyword-related group", () => {
    const tabs = [
      makeTab({ id: 1, title: "Project planning" }),
      makeTab({ id: 2, title: "Project docs" }),
      makeTab({ id: 3, title: "Project notes" }),
    ];
    const proposal = proposalFor(
      JSON.stringify({
        groups: [
          { name: "Project", color: "blue", tabIds: ["T1", "T2"] },
          { name: "Solo notes", color: "green", tabIds: ["T3"] },
        ],
      }),
      tabs,
    );

    expect(proposal.groups).toHaveLength(1);
    expect(proposal.groups[0]!.tabs.map((tab) => tab.tabId)).toEqual([1, 2, 3]);
  });

  it("leaves unmatched singleton tabs ungrouped instead of creating Other", () => {
    const tabs = makeTabs(3);
    const proposal = proposalFor(
      JSON.stringify({
        groups: [
          { name: "Work", color: "blue", tabIds: ["T1", "T2"] },
          { name: "Solo", color: "green", tabIds: ["T3"] },
        ],
      }),
      tabs,
    );

    expect(proposal.groups).toHaveLength(1);
    expect(proposal.groups[0]!.tabs.map((tab) => tab.tabId)).toEqual([1, 2]);
    expect(proposal.ungrouped.map((tab) => tab.tabId)).toEqual([3]);
  });

  it("rejects all-singleton proposals", () => {
    const tabs = makeTabs(2);
    expect(() =>
      proposalFor(
        JSON.stringify({
          groups: [
            { name: "One", color: "blue", tabIds: ["T1"] },
            { name: "Two", color: "red", tabIds: ["T2"] },
          ],
        }),
        tabs,
      ),
    ).toThrow(/specific multi-tab/i);
  });

  it("caps fragmentation at eight groups without creating Other", () => {
    const tabs = makeTabs(18);
    const groups = Array.from({ length: 9 }, (_, index) => ({
      name: `Group ${index + 1}`,
      color: "blue",
      tabIds: [`T${index * 2 + 1}`, `T${index * 2 + 2}`],
    }));

    const proposal = proposalFor(JSON.stringify({ groups }), tabs);

    expect(proposal.groups).toHaveLength(8);
    expect(proposal.groups.map((group) => group.name)).not.toContain("Other");
    expect(
      proposal.groups.flatMap((group) => group.tabs.map((tab) => tab.tabId)),
    ).toHaveLength(16);
    expect(proposal.ungrouped).toHaveLength(2);
  });

  it("strips generic group names even when they contain many tabs", () => {
    const tabs = [
      makeTab({ id: 1, title: "Project plan" }),
      makeTab({ id: 2, title: "Project notes" }),
      makeTab({ id: 3, title: "Project budget" }),
      makeTab({ id: 4, title: "Groceries" }),
      makeTab({ id: 5, title: "Recipes" }),
    ];
    const proposal = proposalFor(
      JSON.stringify({
        groups: [
          { name: "Project", color: "blue", tabIds: ["T1", "T2"] },
          { name: "General", color: "grey", tabIds: ["T3", "T4", "T5"] },
        ],
      }),
      tabs,
    );

    expect(proposal.groups.map((group) => group.name)).not.toContain("General");
    expect(proposal.groups[0]!.tabs.map((tab) => tab.tabId)).toEqual([1, 2, 3]);
    expect(proposal.ungrouped.map((tab) => tab.tabId)).toEqual([4, 5]);
  });

  it("falls back to the palette for unknown colors and normalizes case", () => {
    const tabs = makeTabs(4);
    const proposal = proposalFor(
      JSON.stringify({
        groups: [
          { name: "Work", color: "MAGENTA", tabIds: ["T1", "T2"] },
          { name: "News", color: "ORANGE", tabIds: ["T3", "T4"] },
        ],
      }),
      tabs,
    );

    expect(proposal.groups[0]!.color).toBe("blue");
    expect(proposal.groups[1]!.color).toBe("orange");
  });

  it("rejects malformed responses and responses with no usable groups", () => {
    const tabs = makeTabs(2);
    expect(() => proposalFor('{"groups":"nope"}', tabs)).toThrow(
      AiResponseError,
    );
    expect(() => proposalFor('{"groups":[]}', tabs)).toThrow(/usable/i);
    expect(() =>
      proposalFor(
        JSON.stringify({
          groups: [
            { name: "Work", color: "blue", tabIds: ["99", "not-a-tab"] },
          ],
        }),
        tabs,
      ),
    ).toThrow(/usable/i);
  });

  it("does not allow a one-tab group", () => {
    const tabs = makeTabs(1);
    expect(() =>
      proposalFor(
        JSON.stringify({
          groups: [{ name: "Work", color: "blue", tabIds: ["T1"] }],
        }),
        tabs,
      ),
    ).toThrow(/specific multi-tab/i);
  });
});
