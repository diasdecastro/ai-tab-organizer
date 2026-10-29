import {
  TAB_GROUP_NONE,
  type AiTab,
  type ClassificationInput,
  type ExclusionReason,
  type TabGroupColor,
  type TabInfo,
  type TabSnapshot,
  type TabStats,
} from "./types";

/** Minimal structural shape needed from a browser tab. */
export interface RawTab {
  id?: number;
  windowId: number;
  index: number;
  title?: string;
  url?: string;
  favIconUrl?: string;
  pinned: boolean;
  groupId?: number;
  incognito?: boolean;
  active: boolean;
  lastAccessed?: number;
  audible?: boolean;
}

export interface RawTabGroup {
  id: number;
  title?: string;
  color: string;
}

const SUPPORTED_PROTOCOLS = new Set(["http:", "https:"]);
const MAX_PROMPT_TITLE_LENGTH = 180;

export function parseHostname(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (!SUPPORTED_PROTOCOLS.has(parsed.protocol)) return null;
    return parsed.hostname || null;
  } catch {
    return null;
  }
}

export function exclusionReasonFor(
  tab: Pick<RawTab, "pinned" | "incognito" | "groupId">,
  hostname: string | null,
): ExclusionReason | undefined {
  if (tab.pinned) return "pinned";
  if (tab.incognito) return "incognito";
  if ((tab.groupId ?? TAB_GROUP_NONE) !== TAB_GROUP_NONE) return "grouped";
  if (!hostname) return "unsupported";
  return undefined;
}

export function toTabInfo(
  tab: RawTab,
  groups: ReadonlyMap<number, RawTabGroup> = new Map(),
): TabInfo {
  const hostname = parseHostname(tab.url);
  const groupId = tab.groupId ?? TAB_GROUP_NONE;
  const group = groupId === TAB_GROUP_NONE ? undefined : groups.get(groupId);
  const exclusionReason = exclusionReasonFor(tab, hostname);
  const title =
    tab.title?.replace(/\s+/g, " ").trim() || hostname || "Untitled tab";

  return {
    id: tab.id ?? -1,
    windowId: tab.windowId,
    index: tab.index,
    title,
    hostname: hostname ?? "",
    faviconUrl: tab.favIconUrl,
    pinned: tab.pinned,
    groupId,
    groupName: group?.title?.trim() || (group ? "Unnamed group" : undefined),
    groupColor: (group?.color as TabGroupColor | undefined) ?? undefined,
    incognito: tab.incognito ?? false,
    active: tab.active,
    eligible: exclusionReason === undefined,
    exclusionReason,
    lastAccessed: tab.lastAccessed,
    audible: tab.audible ?? false,
  };
}

export function summarizeTabs(tabs: TabInfo[]): TabStats {
  const eligible = tabs.filter((tab) => tab.eligible).length;
  return {
    total: tabs.length,
    eligible,
    grouped: tabs.filter((tab) => tab.groupId !== TAB_GROUP_NONE).length,
    pinned: tabs.filter((tab) => tab.pinned).length,
    excluded: tabs.length - eligible,
  };
}

export function buildTabSnapshot(
  windowId: number,
  tabs: TabInfo[],
  capturedAt = Date.now(),
): TabSnapshot {
  return {
    windowId,
    tabs,
    stats: summarizeTabs(tabs),
    capturedAt,
  };
}

/** Build the minimal AI payload. Deliberately excludes URLs, IDs and favicons. */
export function buildClassificationInput(tabs: TabInfo[]): ClassificationInput {
  const eligible = tabs.filter((tab) => tab.eligible);
  const promptTabs: AiTab[] = [];
  const idMap: Record<string, number> = {};

  eligible.forEach((tab, index) => {
    const temporaryId = `T${index + 1}`;
    promptTabs.push({
      id: temporaryId,
      title: truncate(tab.title, MAX_PROMPT_TITLE_LENGTH),
      hostname: tab.hostname,
    });
    idMap[temporaryId] = tab.id;
  });

  return { tabs: promptTabs, idMap };
}

export function truncate(value: string, maxLength: number): string {
  const characters = Array.from(value);
  if (characters.length <= maxLength) return value;
  return `${characters.slice(0, Math.max(0, maxLength - 1)).join("")}…`;
}
