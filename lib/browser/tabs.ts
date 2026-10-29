import { browser } from "wxt/browser";
import { buildTabSnapshot, toTabInfo, type RawTabGroup } from "../tabs";
import type { TabSnapshot } from "../types";

export async function readTabSnapshot(windowId: number): Promise<TabSnapshot> {
  const [tabs, groups] = await Promise.all([
    browser.tabs.query({ windowId }),
    browser.tabGroups.query({ windowId }),
  ]);

  const groupsById = new Map<number, RawTabGroup>(
    groups.map((group) => [
      group.id,
      {
        id: group.id,
        title: group.title,
        color: group.color,
      },
    ]),
  );

  const tabInfos = tabs
    .map((tab) => toTabInfo(tab, groupsById))
    .sort((a, b) => a.index - b.index);

  return buildTabSnapshot(windowId, tabInfos);
}
