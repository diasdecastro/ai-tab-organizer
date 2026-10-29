import { browser } from "wxt/browser";
import {
  TAB_GROUP_COLORS,
  type SavedGroup,
  type SavedGroupTab,
  type TabGroupColor,
} from "./types";
import { truncate } from "./tabs";

export const SAVED_GROUPS_KEY = "ato.savedGroups.v1";
const MAX_SAVED_GROUPS = 50;
const MAX_SAVED_TABS = 200;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isWebUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeColor(value: unknown): TabGroupColor {
  return typeof value === "string" &&
    (TAB_GROUP_COLORS as readonly string[]).includes(value)
    ? (value as TabGroupColor)
    : "grey";
}

function normalizeSavedTab(value: unknown): SavedGroupTab | null {
  if (!isRecord(value) || !isWebUrl(value.url)) return null;
  return {
    title:
      typeof value.title === "string" && value.title.trim()
        ? truncate(value.title, 300)
        : new URL(value.url).hostname,
    url: value.url,
    faviconUrl:
      typeof value.faviconUrl === "string" && value.faviconUrl
        ? value.faviconUrl
        : undefined,
  };
}

function normalizeSavedGroup(value: unknown): SavedGroup | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;
  if (!Array.isArray(value.tabs)) return null;

  const tabs = value.tabs
    .slice(0, MAX_SAVED_TABS)
    .map(normalizeSavedTab)
    .filter((tab): tab is SavedGroupTab => tab !== null);
  if (tabs.length === 0) return null;

  return {
    id: value.id,
    name:
      typeof value.name === "string" && value.name.trim()
        ? truncate(value.name.trim(), 60)
        : "Saved group",
    color: normalizeColor(value.color),
    createdAt:
      typeof value.createdAt === "number" ? value.createdAt : Date.now(),
    tabs,
  };
}

export async function loadSavedGroups(): Promise<SavedGroup[]> {
  try {
    const stored = await browser.storage.local.get(SAVED_GROUPS_KEY);
    const value = stored[SAVED_GROUPS_KEY];
    if (!Array.isArray(value)) return [];
    return value
      .slice(0, MAX_SAVED_GROUPS)
      .map(normalizeSavedGroup)
      .filter((group): group is SavedGroup => group !== null);
  } catch {
    return [];
  }
}

export async function persistSavedGroups(
  groups: SavedGroup[],
): Promise<SavedGroup[]> {
  const normalized = groups
    .slice(0, MAX_SAVED_GROUPS)
    .map(normalizeSavedGroup)
    .filter((group): group is SavedGroup => group !== null)
    .sort((a, b) => b.createdAt - a.createdAt);
  await browser.storage.local.set({ [SAVED_GROUPS_KEY]: normalized });
  return normalized;
}

function sameTabSet(a: SavedGroupTab[], b: SavedGroupTab[]): boolean {
  if (a.length !== b.length) return false;
  const urls = new Set(a.map((tab) => tab.url));
  return b.every((tab) => urls.has(tab.url));
}

export async function addSavedGroup(group: SavedGroup): Promise<SavedGroup[]> {
  const existing = await loadSavedGroups();
  const duplicate = existing.find(
    (item) => item.name === group.name && sameTabSet(item.tabs, group.tabs),
  );
  const saved: SavedGroup = duplicate
    ? { ...group, id: duplicate.id, createdAt: Date.now() }
    : group;
  return persistSavedGroups([
    saved,
    ...existing.filter(
      (item) => item.id !== group.id && item.id !== duplicate?.id,
    ),
  ]);
}

export async function removeSavedGroup(id: string): Promise<SavedGroup[]> {
  const existing = await loadSavedGroups();
  return persistSavedGroups(existing.filter((group) => group.id !== id));
}
