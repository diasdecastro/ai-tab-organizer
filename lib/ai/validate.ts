import { z } from "zod";
import {
  TAB_GROUP_COLORS,
  type ClassificationInput,
  type OrganizationMethod,
  type ProposedGroup,
  type ProposedTab,
  type ProviderId,
  type TabGroupColor,
  type TabInfo,
  type Proposal,
} from "../types";
import { truncate } from "../tabs";
import { MIN_GROUP_SIZE } from "../grouping/apply";

const MAX_GROUPS = 8;
const MAX_GROUP_NAME_LENGTH = 32;

const FALLBACK_PALETTE: TabGroupColor[] = [
  "blue",
  "purple",
  "green",
  "orange",
  "cyan",
  "pink",
  "yellow",
  "red",
  "grey",
];

const RawGroupSchema = z.object({
  name: z.string().min(1).max(200),
  color: z.string().nullish(),
  tabIds: z.array(z.string()).max(1000),
});

const RawResponseSchema = z.object({
  groups: z.array(RawGroupSchema).max(100),
});

export class AiResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiResponseError";
  }
}

interface WorkingGroup {
  name: string;
  color: TabGroupColor;
  tabIds: number[];
  order: number;
}

export interface BuildProposalOptions {
  input: ClassificationInput;
  tabs: TabInfo[];
  windowId: number;
  provider: ProviderId;
  model: string;
  method?: OrganizationMethod;
  now?: number;
  proposalId?: string;
}

const GENERIC_GROUP_NAMES = new Set([
  "other",
  "others",
  "misc",
  "miscellaneous",
  "uncategorized",
  "uncategorised",
  "general",
  "random",
  "various",
  "assorted",
  "everything",
  "everything else",
  "leftovers",
  "unfiled",
  "unassigned",
  "rest",
]);

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "your",
  "from",
  "that",
  "this",
  "are",
  "was",
  "were",
  "you",
  "about",
  "into",
  "over",
  "under",
  "more",
  "most",
  "new",
  "www",
  "http",
  "https",
  "com",
  "org",
  "net",
  "html",
  "home",
  "page",
  "site",
  "online",
]);

/** Extract JSON even if the model wrapped it in a markdown fence or prose. */
export function parseJsonResponse(content: string): unknown {
  let text = content.trim();
  if (!text) throw new AiResponseError("The AI returned an empty response.");

  text = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  if (!text.startsWith("{") && !text.startsWith("[")) {
    const objectStart = text.indexOf("{");
    if (objectStart >= 0) {
      const objectEnd = text.lastIndexOf("}");
      if (objectEnd > objectStart)
        text = text.slice(objectStart, objectEnd + 1);
    } else {
      const arrayStart = text.indexOf("[");
      const arrayEnd = text.lastIndexOf("]");
      if (arrayStart >= 0 && arrayEnd > arrayStart) {
        text = text.slice(arrayStart, arrayEnd + 1);
      }
    }
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new AiResponseError(
      "The AI response was not valid JSON. Please try again.",
    );
  }
}

export function sanitizeGroupName(raw: string): string {
  let name = raw
    .replace(
      /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
  name = name
    .replace(/^[\s"'`#*•\-–—:]+/, "")
    .replace(/[\s"'`*:;.,!?]+$/, "")
    .trim();
  if (!name) return "Other";
  return truncate(name, MAX_GROUP_NAME_LENGTH);
}

function normalizeName(name: string): string {
  return name.toLocaleLowerCase();
}

function isGenericGroupName(name: string): boolean {
  const normalized = normalizeName(name);
  return (
    GENERIC_GROUP_NAMES.has(normalized) ||
    /^(other|misc|miscellaneous|uncategor|general|random|various|assorted)\b/.test(
      normalized,
    )
  );
}

function toProposedTab(tab: TabInfo): ProposedTab {
  return {
    tabId: tab.id,
    title: tab.title,
    hostname: tab.hostname,
    faviconUrl: tab.faviconUrl,
  };
}

function parseColor(
  raw: string | null | undefined,
  index: number,
): TabGroupColor {
  const value = raw?.trim().toLowerCase();
  if (value && (TAB_GROUP_COLORS as readonly string[]).includes(value)) {
    return value as TabGroupColor;
  }
  return FALLBACK_PALETTE[index % FALLBACK_PALETTE.length]!;
}

function tokenize(value: string): string[] {
  return value
    .toLocaleLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

function groupTokens(name: string): string[] {
  return tokenize(name);
}

function tabTokens(tab: TabInfo): Set<string> {
  return new Set([
    ...tokenize(tab.title),
    ...tokenize(tab.hostname.replace(/^www\./, "")),
  ]);
}

function bestTargetForTab(
  tabId: number,
  groups: WorkingGroup[],
  tabsById: Map<number, TabInfo>,
): WorkingGroup | null {
  const tab = tabsById.get(tabId);
  if (!tab) return null;
  const tokens = tabTokens(tab);
  let best: WorkingGroup | null = null;
  let bestScore = 0;

  for (const group of groups) {
    const score = groupTokens(group.name).filter((token) =>
      tokens.has(token),
    ).length;
    if (score > bestScore) {
      best = group;
      bestScore = score;
    }
  }

  return best;
}

/**
 * Turn an untrusted model response into a proposal.
 *
 * Unknown/duplicate tab ids are discarded. Generic junk-drawer groups are
 * dissolved, singleton groups are folded into keyword-related groups, and
 * anything that cannot be placed confidently is left ungrouped instead.
 */
export function buildProposalFromResponse(
  content: string,
  options: BuildProposalOptions,
): Proposal {
  const parsed = parseJsonResponse(content);
  const candidate = Array.isArray(parsed) ? { groups: parsed } : parsed;
  const validated = RawResponseSchema.safeParse(candidate);

  if (!validated.success) {
    throw new AiResponseError(
      "The AI returned an unexpected response shape. Please try again.",
    );
  }

  const eligibleTabs = options.tabs.filter((tab) => tab.eligible);
  const tabsById = new Map(eligibleTabs.map((tab) => [tab.id, tab]));
  const usedTabIds = new Set<number>();
  let groups: WorkingGroup[] = [];
  const groupsByName = new Map<string, WorkingGroup>();
  let order = 0;

  for (const rawGroup of validated.data.groups) {
    const realTabIds: number[] = [];

    for (const rawTabId of rawGroup.tabIds) {
      const realTabId = options.input.idMap[rawTabId.trim()];
      if (realTabId === undefined || usedTabIds.has(realTabId)) continue;

      const tab = tabsById.get(realTabId);
      if (!tab) continue;

      usedTabIds.add(realTabId);
      realTabIds.push(realTabId);
    }

    if (realTabIds.length === 0) continue;

    const name = sanitizeGroupName(rawGroup.name);
    const key = normalizeName(name);
    const existing = groupsByName.get(key);

    if (existing) {
      existing.tabIds.push(...realTabIds);
      continue;
    }

    const group: WorkingGroup = {
      name,
      color: parseColor(rawGroup.color, groups.length),
      tabIds: realTabIds,
      order: order++,
    };
    groups.push(group);
    groupsByName.set(key, group);
  }

  if (groups.length === 0) {
    throw new AiResponseError(
      "The AI did not return any usable tab groups. Try again or switch models.",
    );
  }

  groups = dissolveGenericGroups(groups, tabsById);
  groups = mergeSingletonGroups(groups, tabsById);
  groups = limitGroups(groups, tabsById, MAX_GROUPS);
  groups.sort((a, b) => a.order - b.order);

  if (groups.length === 0) {
    throw new AiResponseError(
      "The AI did not return any specific multi-tab groups. Try again or choose a different model.",
    );
  }

  if (groups.length === 1 && groups[0]!.tabIds.length < MIN_GROUP_SIZE) {
    throw new AiResponseError(
      "The AI did not return enough tabs to form a usable group. Try again.",
    );
  }

  const groupedTabIds = new Set<number>();
  const proposedGroups: ProposedGroup[] = groups.map((group, index) => {
    const tabs = group.tabIds
      .map((tabId) => tabsById.get(tabId))
      .filter((tab): tab is TabInfo => tab !== undefined);
    tabs.forEach((tab) => groupedTabIds.add(tab.id));
    return {
      key: `g${index + 1}`,
      name: group.name,
      color: group.color,
      tabs: tabs.map(toProposedTab),
    };
  });

  return {
    id: options.proposalId ?? crypto.randomUUID(),
    createdAt: options.now ?? Date.now(),
    windowId: options.windowId,
    provider: options.provider,
    model: options.model,
    method: options.method ?? "category",
    source: "ai",
    groups: proposedGroups,
    ungrouped: eligibleTabs
      .filter((tab) => !groupedTabIds.has(tab.id))
      .map(toProposedTab),
  };
}

/**
 * Never surface "Other", "Misc", or similar junk-drawer groups. Tabs from a
 * generic group are reassigned to a keyword-related specific group when
 * possible; otherwise they remain ungrouped for the user to review.
 */
function dissolveGenericGroups(
  groups: WorkingGroup[],
  tabsById: Map<number, TabInfo>,
): WorkingGroup[] {
  const specific = groups.filter((group) => !isGenericGroupName(group.name));
  const generic = groups.filter((group) => isGenericGroupName(group.name));
  if (specific.length === 0) return [];

  for (const genericGroup of generic) {
    for (const tabId of genericGroup.tabIds) {
      const target = bestTargetForTab(tabId, specific, tabsById);
      if (target) target.tabIds.push(tabId);
    }
  }

  return specific;
}

function mergeSingletonGroups(
  groups: WorkingGroup[],
  tabsById: Map<number, TabInfo>,
): WorkingGroup[] {
  const remaining = [...groups];

  while (remaining.length > 0) {
    const index = remaining.findIndex(
      (group) => group.tabIds.length < MIN_GROUP_SIZE,
    );
    if (index === -1) break;

    const [singleton] = remaining.splice(index, 1);
    if (!singleton) break;

    for (const tabId of singleton.tabIds) {
      const target = bestTargetForTab(tabId, remaining, tabsById);
      if (target) target.tabIds.push(tabId);
    }
  }

  return remaining;
}

function limitGroups(
  groups: WorkingGroup[],
  tabsById: Map<number, TabInfo>,
  maxGroups: number,
): WorkingGroup[] {
  if (groups.length <= maxGroups) return groups;

  const sorted = [...groups].sort((a, b) => b.tabIds.length - a.tabIds.length);
  const kept = sorted.slice(0, maxGroups);
  const overflow = sorted.slice(maxGroups);

  for (const group of overflow) {
    for (const tabId of group.tabIds) {
      const target = bestTargetForTab(tabId, kept, tabsById);
      if (target) target.tabIds.push(tabId);
    }
  }

  return kept;
}
