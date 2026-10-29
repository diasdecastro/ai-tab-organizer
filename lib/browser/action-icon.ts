import { browser } from "wxt/browser";
import { overloadZone, type OverloadZone } from "../overload";

const STATUS_ICONS: Record<
  OverloadZone,
  { 16: string; 32: string; 48: string; 128: string }
> = {
  green: {
    16: "icon/status-green-16.png",
    32: "icon/status-green-32.png",
    48: "icon/status-green-48.png",
    128: "icon/status-green-128.png",
  },
  amber: {
    16: "icon/status-amber-16.png",
    32: "icon/status-amber-32.png",
    48: "icon/status-amber-48.png",
    128: "icon/status-amber-128.png",
  },
  red: {
    16: "icon/status-red-16.png",
    32: "icon/status-red-32.png",
    48: "icon/status-red-48.png",
    128: "icon/status-red-128.png",
  },
};

let updateTimer: ReturnType<typeof setTimeout> | undefined;
let updating = false;
let pending = false;

export function scheduleActionIconUpdate(): void {
  if (updateTimer) clearTimeout(updateTimer);
  updateTimer = setTimeout(() => {
    updateTimer = undefined;
    void updateActionIcon();
  }, 250);
}

export async function updateActionIcon(): Promise<void> {
  if (updating) {
    pending = true;
    return;
  }

  updating = true;
  try {
    const window = await browser.windows.getLastFocused({
      windowTypes: ["normal"],
    });
    if (window?.id === undefined) return;

    const tabs = await browser.tabs.query({ windowId: window.id });
    const extensionOrigin = browser.runtime.getURL("");
    const looseTabs = tabs.filter(
      (tab) =>
        !tab.pinned &&
        !tab.incognito &&
        (tab.groupId ?? -1) === -1 &&
        !(tab.url?.startsWith(extensionOrigin) ?? false),
    ).length;

    const zone = overloadZone(looseTabs);
    await browser.action.setIcon({ path: STATUS_ICONS[zone] });
    await browser.action.setBadgeText({ text: "" });
  } catch {
    // The action icon is best-effort and can be unavailable in some contexts.
  } finally {
    updating = false;
    if (pending) {
      pending = false;
      scheduleActionIconUpdate();
    }
  }
}
