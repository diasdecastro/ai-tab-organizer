import type { ClassificationInput, TabInfo } from "../lib/types";

export function makeTab(overrides: Partial<TabInfo> & { id: number }): TabInfo {
  return {
    windowId: 1,
    index: overrides.id,
    title: `Tab ${overrides.id}`,
    hostname: "example.com",
    pinned: false,
    groupId: -1,
    incognito: false,
    active: false,
    eligible: true,
    ...overrides,
  };
}

export function makeInput(tabs: TabInfo[]): ClassificationInput {
  const idMap: Record<string, number> = {};
  const promptTabs = tabs.map((tab, index) => {
    const id = `T${index + 1}`;
    idMap[id] = tab.id;
    return { id, title: tab.title, hostname: tab.hostname };
  });
  return { tabs: promptTabs, idMap };
}
