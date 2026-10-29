import { loadSettings, PROVIDERS } from "./settings";
import { readTabSnapshot } from "./browser/tabs";
import { buildClassificationInput, truncate } from "./tabs";
import { requestClassification } from "./ai/client";
import { buildProposalFromResponse } from "./ai/validate";
import { buildLocalProposal } from "./grouping/methods";
import type { OrganizationMethod, Proposal } from "./types";

export async function organizeWindow(
  windowId: number,
  method: OrganizationMethod,
): Promise<Proposal> {
  const snapshot = await readTabSnapshot(windowId);
  if (snapshot.stats.eligible < 2) {
    throw new Error(
      "At least two eligible, ungrouped tabs are needed. Pinned tabs and existing groups are left untouched.",
    );
  }

  if (method === "lastAccess" || method === "alphabetical") {
    return buildLocalProposal(method, snapshot.tabs, windowId);
  }

  const settings = await loadSettings();
  const provider = settings.activeProvider;
  const credentials = settings.providers[provider];
  const providerName = PROVIDERS[provider].label;

  if (!credentials.apiKey.trim()) {
    throw new Error(
      `Add your ${providerName} API key in Settings, or choose Last access or A–Z for an on-device method.`,
    );
  }

  const activeTab = snapshot.tabs.find((tab) => tab.active && tab.eligible);
  const input = buildClassificationInput(snapshot.tabs);
  const content = await requestClassification({
    provider,
    apiKey: credentials.apiKey,
    model: credentials.model,
    input,
    context: {
      method,
      activeTab: activeTab
        ? {
            title: truncate(activeTab.title, 180),
            hostname: activeTab.hostname,
          }
        : undefined,
    },
  });

  return buildProposalFromResponse(content, {
    input,
    tabs: snapshot.tabs,
    windowId,
    provider,
    model: credentials.model,
    method,
  });
}
