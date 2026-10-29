import {
  type OrganizationMethod,
  type Proposal,
  type ProposedGroup,
  type ProposedTab,
  type TabGroupColor,
  type TabInfo,
} from "../types";

const DAY_MS = 24 * 60 * 60 * 1000;

interface Bucket {
  name: string;
  color: TabGroupColor;
  tabs: TabInfo[];
}

function toProposedTab(tab: TabInfo): ProposedTab {
  return {
    tabId: tab.id,
    title: tab.title,
    hostname: tab.hostname,
    faviconUrl: tab.faviconUrl,
  };
}

export function buildLocalProposal(
  method: OrganizationMethod,
  tabs: TabInfo[],
  windowId: number,
  options: { now?: number; proposalId?: string } = {},
): Proposal {
  if (method !== "lastAccess" && method !== "alphabetical") {
    throw new Error("That organization method requires AI.");
  }

  const eligible = tabs.filter((tab) => tab.eligible);
  if (eligible.length < 2) {
    throw new Error(
      "At least two eligible, ungrouped tabs are needed. Pinned tabs and existing groups are left untouched.",
    );
  }

  const buckets =
    method === "lastAccess"
      ? buildLastAccessBuckets(eligible, options.now ?? Date.now())
      : buildAlphabeticalBuckets(eligible);

  const groups: ProposedGroup[] = buckets.map((bucket, index) => ({
    key: `g${index + 1}`,
    name: bucket.name,
    color: bucket.color,
    tabs: bucket.tabs.map(toProposedTab),
  }));

  const groupedIds = new Set(
    groups.flatMap((group) => group.tabs.map((tab) => tab.tabId)),
  );

  return {
    id: options.proposalId ?? crypto.randomUUID(),
    createdAt: options.now ?? Date.now(),
    windowId,
    provider: "local",
    model: "On-device",
    method,
    source: "local",
    groups,
    ungrouped: eligible
      .filter((tab) => !groupedIds.has(tab.id))
      .map(toProposedTab),
  };
}

function buildLastAccessBuckets(tabs: TabInfo[], now: number): Bucket[] {
  const buckets: Bucket[] = [
    { name: "Today", color: "green", tabs: [] },
    { name: "This week", color: "blue", tabs: [] },
    { name: "This month", color: "purple", tabs: [] },
    { name: "Earlier", color: "grey", tabs: [] },
  ];

  for (const tab of tabs) {
    const lastAccessed = tab.lastAccessed ?? 0;
    const age = now - lastAccessed;
    if (lastAccessed > 0 && age <= DAY_MS) buckets[0]!.tabs.push(tab);
    else if (lastAccessed > 0 && age <= 7 * DAY_MS) buckets[1]!.tabs.push(tab);
    else if (lastAccessed > 0 && age <= 30 * DAY_MS) buckets[2]!.tabs.push(tab);
    else buckets[3]!.tabs.push(tab);
  }

  return mergeSingletonBuckets(
    buckets.filter((bucket) => bucket.tabs.length > 0),
  );
}

function buildAlphabeticalBuckets(tabs: TabInfo[]): Bucket[] {
  const sorted = [...tabs].sort((a, b) => {
    const aKey = sortKey(a);
    const bKey = sortKey(b);
    return aKey.localeCompare(bKey, undefined, { sensitivity: "base" });
  });

  const ranges: Array<{
    name: string;
    color: TabGroupColor;
    matches: (letter: string) => boolean;
  }> = [
    {
      name: "A–F",
      color: "blue",
      matches: (letter) => letter >= "A" && letter <= "F",
    },
    {
      name: "G–M",
      color: "purple",
      matches: (letter) => letter >= "G" && letter <= "M",
    },
    {
      name: "N–S",
      color: "green",
      matches: (letter) => letter >= "N" && letter <= "S",
    },
    {
      name: "T–Z",
      color: "orange",
      matches: (letter) => letter >= "T" && letter <= "Z",
    },
    { name: "#", color: "grey", matches: (letter) => !/^[A-Z]$/.test(letter) },
  ];

  const buckets: Bucket[] = ranges.map((range) => ({
    name: range.name,
    color: range.color,
    tabs: [],
  }));

  for (const tab of sorted) {
    const letter = firstLetter(tab);
    const index = ranges.findIndex((range) => range.matches(letter));
    buckets[index === -1 ? buckets.length - 1 : index]!.tabs.push(tab);
  }

  return mergeSingletonBuckets(
    buckets.filter((bucket) => bucket.tabs.length > 0),
  );
}

function sortKey(tab: TabInfo): string {
  return `${tab.hostname.replace(/^www\./, "")} ${tab.title}`.toLocaleLowerCase();
}

function firstLetter(tab: TabInfo): string {
  const source = tab.hostname.replace(/^www\./, "") || tab.title;
  const match = /[a-z0-9]/i.exec(source);
  return match ? match[0].toUpperCase() : "#";
}

/**
 * Merge one-tab buckets into their nearest neighbor. This avoids creating a
 * separate native group for every tiny time/letter bucket.
 */
function mergeSingletonBuckets(input: Bucket[]): Bucket[] {
  const buckets = input.map((bucket) => ({
    ...bucket,
    tabs: [...bucket.tabs],
  }));

  while (buckets.length > 1) {
    const index = buckets.findIndex((bucket) => bucket.tabs.length === 1);
    if (index === -1) break;

    let targetIndex = -1;
    for (let distance = 1; distance < buckets.length; distance += 1) {
      const before = index - distance;
      const after = index + distance;
      const candidates = [before, after].filter(
        (candidate) => candidate >= 0 && candidate < buckets.length,
      );
      if (candidates.length === 0) continue;
      targetIndex = candidates.sort(
        (a, b) => buckets[b]!.tabs.length - buckets[a]!.tabs.length,
      )[0]!;
      break;
    }

    if (targetIndex === -1) break;
    buckets[targetIndex]!.tabs.push(...buckets[index]!.tabs);
    buckets.splice(index, 1);
  }

  return buckets;
}
