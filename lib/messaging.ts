import { browser } from "wxt/browser";
import type { ApiResponse, ResponseMap, RuntimeRequest } from "./types";

export async function sendRequest<K extends keyof ResponseMap>(
  request: Extract<RuntimeRequest, { type: K }>,
): Promise<ResponseMap[K]> {
  const response = (await browser.runtime.sendMessage(request)) as
    ApiResponse<ResponseMap[K]> | undefined;

  if (!response) {
    throw new Error(
      "The extension background did not respond. Reopen the popup and try again.",
    );
  }
  if (!response.ok) {
    throw new Error(response.error);
  }
  return response.data;
}

/** Resolve the browser window that owns this popup. */
export async function getActiveWindowId(): Promise<number> {
  const [activeTab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });
  if (typeof activeTab?.windowId === "number") {
    return activeTab.windowId;
  }

  const window = await browser.windows.getLastFocused({
    windowTypes: ["normal"],
  });
  if (typeof window.id === "number") {
    return window.id;
  }

  throw new Error("Could not determine the current browser window.");
}

/** Open (or focus) the single pinned dashboard tab. */
export async function openDashboardTab(section = ""): Promise<void> {
  const baseUrl = browser.runtime.getURL("/dashboard.html");
  const url = `${baseUrl}${section}`;
  const tabs = await browser.tabs.query({});
  const existing = tabs.find((tab) => tab.url?.startsWith(baseUrl));

  if (existing?.id !== undefined) {
    await browser.tabs.update(existing.id, {
      url,
      active: true,
      pinned: true,
    });
    await browser.windows.update(existing.windowId, { focused: true });
    return;
  }

  await browser.tabs.create({ url, pinned: true, active: true });
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Something went wrong. Please try again.";
}
