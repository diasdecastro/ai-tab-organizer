import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";
import { organizeWindow } from "@/lib/organizer";
import {
  createNativeGroups,
  rollbackAppliedGroups,
  ungroupLastOperation,
} from "@/lib/browser/groups";
import {
  hardenStorageAccess,
  PROVIDERS,
  saveSettings,
  setDefaultMethod,
} from "@/lib/settings";
import { testProviderConnection } from "@/lib/ai/client";
import { getPopupState } from "@/lib/popup-state";
import { readDashboardState } from "@/lib/browser/dashboard";
import {
  scheduleActionIconUpdate,
  updateActionIcon,
} from "@/lib/browser/action-icon";
import {
  closeTabsByIds,
  deleteSavedGroup,
  mergeOtherWindows,
  moveTabsToNewWindow,
  renameTabGroup,
  restoreSavedGroup,
  saveGroupToLibrary,
  toggleGroupsCollapsed,
  ungroupAllTabs,
} from "@/lib/browser/tab-actions";
import { clearUndo, loadJob, loadUndo, saveJob, saveUndo } from "@/lib/state";
import { isOrganizationMethod } from "@/lib/methods";
import type {
  ApiResponse,
  DashboardActionResult,
  OrganizationMethod,
  ProviderId,
  TabGroupColor,
  UndoResponse,
} from "@/lib/types";

let operationLocked = false;

export default defineBackground(() => {
  const ready = initialize();
  const refreshIcon = () => scheduleActionIconUpdate();
  const listen = (event: unknown) => {
    try {
      (event as { addListener: (listener: () => void) => void }).addListener(
        refreshIcon,
      );
    } catch {
      // Some test or older-browser environments do not implement every event.
    }
  };

  listen(browser.tabs.onCreated);
  listen(browser.tabs.onRemoved);
  listen(browser.tabs.onMoved);
  listen(browser.tabs.onAttached);
  listen(browser.tabs.onDetached);
  listen(browser.tabs.onUpdated);
  listen(browser.tabs.onActivated);
  listen(browser.tabGroups.onCreated);
  listen(browser.tabGroups.onUpdated);
  listen(browser.tabGroups.onRemoved);
  listen(browser.windows.onCreated);
  listen(browser.windows.onRemoved);
  listen(browser.windows.onFocusChanged);
  listen(browser.runtime.onInstalled);
  listen(browser.runtime.onStartup);

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    void ready
      .then(() => dispatch(message))
      .then(sendResponse)
      .catch(() => undefined);
    // Returning true keeps the message channel open for the async response.
    // This also keeps the MV3 service worker alive while an AI request runs.
    return true;
  });
});

async function initialize(): Promise<void> {
  await hardenStorageAccess();
  await updateActionIcon();

  // A fresh service worker cannot have an operation running in memory. Any
  // stored "running" job is therefore interrupted and should be recoverable.
  try {
    const job = await loadJob();
    if (job.status === "organizing" || job.status === "applying") {
      await saveJob({
        status: "error",
        phase: job.status === "organizing" ? "organize" : "apply",
        message:
          job.status === "organizing"
            ? "The AI request was interrupted before it finished. Please try again."
            : "The grouping operation was interrupted. Some tabs may already be grouped. Check the window and use Undo if it is available.",
      });
    }
  } catch {
    // Storage failures are surfaced when an operation is requested.
  }
}

async function dispatch(message: unknown): Promise<ApiResponse<unknown>> {
  try {
    if (!isRecord(message) || typeof message.type !== "string") {
      throw new Error("Invalid extension request.");
    }

    switch (message.type) {
      case "GET_STATE":
        return ok(await getPopupState(readWindowId(message.windowId)));
      case "ORGANIZE":
        return ok(
          await handleOrganize(
            readWindowId(message.windowId),
            readMethod(message.method),
          ),
        );
      case "SET_METHOD":
        return ok(await setDefaultMethod(readMethod(message.method)));
      case "DISMISS":
        return ok(await handleDismiss(readWindowId(message.windowId)));
      case "UNDO":
        return ok(await handleUndo(readWindowId(message.windowId)));
      case "UNGROUP_ALL": {
        const windowId = readWindowId(message.windowId);
        return ok(
          await handleDashboardAction(windowId, () => ungroupAllTabs(windowId)),
        );
      }
      case "TOGGLE_GROUPS_COLLAPSED": {
        const windowId = readWindowId(message.windowId);
        return ok(
          await handleDashboardAction(windowId, () =>
            toggleGroupsCollapsed(windowId),
          ),
        );
      }
      case "SAVE_SETTINGS":
        return ok(await handleSaveSettings(message.settings));
      case "TEST_CONNECTION":
        return ok(await handleTestConnection(message));
      case "GET_DASHBOARD":
        return ok(await readDashboardState(readWindowId(message.windowId)));
      case "MERGE_WINDOWS": {
        const targetWindowId = readWindowId(message.targetWindowId);
        return ok(
          await handleDashboardAction(targetWindowId, () =>
            mergeOtherWindows(targetWindowId),
          ),
        );
      }
      case "CLOSE_TABS": {
        const windowId = readWindowId(message.windowId);
        const tabIds = readTabIds(message.tabIds);
        return ok(
          await handleDashboardAction(windowId, () => closeTabsByIds(tabIds)),
        );
      }
      case "MOVE_TABS_NEW_WINDOW": {
        const windowId = readWindowId(message.windowId);
        const tabIds = readTabIds(message.tabIds);
        return ok(
          await handleDashboardAction(windowId, () =>
            moveTabsToNewWindow(tabIds),
          ),
        );
      }
      case "SAVE_GROUP": {
        const windowId = readWindowId(message.windowId);
        const groupId = readGroupId(message.groupId);
        return ok(
          await handleDashboardAction(windowId, () =>
            saveGroupToLibrary(groupId),
          ),
        );
      }
      case "RESTORE_GROUP": {
        const windowId = readWindowId(message.windowId);
        const savedGroupId = readString(message.savedGroupId);
        return ok(
          await handleDashboardAction(windowId, () =>
            restoreSavedGroup(savedGroupId, windowId),
          ),
        );
      }
      case "DELETE_SAVED_GROUP": {
        const windowId = readWindowId(message.windowId);
        const savedGroupId = readString(message.savedGroupId);
        return ok(
          await handleDashboardAction(windowId, () =>
            deleteSavedGroup(savedGroupId),
          ),
        );
      }
      case "RENAME_GROUP": {
        const windowId = readWindowId(message.windowId);
        const groupId = readGroupId(message.groupId);
        const title = readString(message.title);
        const color =
          typeof message.color === "string"
            ? (message.color as TabGroupColor)
            : undefined;
        return ok(
          await handleDashboardAction(windowId, () =>
            renameTabGroup(groupId, title, color),
          ),
        );
      }
      default:
        throw new Error("Unknown extension request.");
    }
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

async function handleOrganize(windowId: number, method: OrganizationMethod) {
  return withOperationLock(async () => {
    const existing = await loadJob();
    if (existing.status === "organizing" || existing.status === "applying") {
      throw new Error("Another organization operation is already running.");
    }

    await setDefaultMethod(method);
    await saveJob({ status: "organizing", startedAt: Date.now() });

    let proposal;
    try {
      proposal = await organizeWindow(windowId, method);
    } catch (error) {
      await saveJob({
        status: "error",
        phase: "organize",
        message: errorMessage(error),
      });
      return getPopupState(windowId);
    }

    await saveJob({ status: "applying", startedAt: Date.now() });

    try {
      const outcome = await createNativeGroups(proposal);
      try {
        await saveUndo(outcome.undo);
      } catch {
        await rollbackAppliedGroups(windowId, outcome.result.groups);
        throw new Error(
          "Could not save the undo record, so no changes were kept. Please try again.",
        );
      }

      await saveJob({
        status: "applied",
        proposal,
        result: outcome.result,
      });
    } catch (error) {
      await saveJob({
        status: "error",
        phase: "apply",
        message: errorMessage(error),
      });
    }

    return getPopupState(windowId);
  });
}

async function handleDismiss(windowId: number) {
  const job = await loadJob();
  if (job.status === "organizing" || job.status === "applying") {
    throw new Error(
      "Wait for the current operation to finish before dismissing.",
    );
  }

  await saveJob({ status: "idle" });
  return getPopupState(windowId);
}

async function handleUndo(windowId: number): Promise<UndoResponse> {
  return withOperationLock(async () => {
    const undo = await loadUndo();
    if (!undo) {
      throw new Error("There is no organization operation to undo.");
    }
    if (undo.windowId !== windowId) {
      throw new Error(
        "The last grouping operation was in a different browser window.",
      );
    }

    const job = await loadJob();
    if (job.status === "organizing" || job.status === "applying") {
      throw new Error(
        "Wait for the current operation to finish before undoing.",
      );
    }

    const result = await ungroupLastOperation(undo);
    await clearUndo();
    await saveJob({ status: "idle" });

    return { state: await getPopupState(windowId), result };
  });
}

async function handleSaveSettings(value: unknown) {
  const settings = await saveSettings(value);
  await hardenStorageAccess();
  return settings;
}

async function handleDashboardAction(
  windowId: number,
  operation: () => Promise<string>,
): Promise<DashboardActionResult> {
  return withOperationLock(async () => {
    const job = await loadJob();
    if (job.status === "organizing" || job.status === "applying") {
      throw new Error("Wait for the current organization operation to finish.");
    }

    const message = await operation();
    return { message, state: await readDashboardState(windowId) };
  });
}

async function handleTestConnection(message: Record<string, unknown>) {
  const provider = readProvider(message.provider);
  const apiKey = typeof message.apiKey === "string" ? message.apiKey : "";
  const model = typeof message.model === "string" ? message.model : "";
  if (!model.trim()) {
    throw new Error("Enter a model ID before testing the connection.");
  }

  return testProviderConnection({ provider, apiKey, model });
}

async function withOperationLock<T>(operation: () => Promise<T>): Promise<T> {
  if (operationLocked) {
    throw new Error("Another operation is already running. Please wait.");
  }
  operationLocked = true;
  try {
    return await operation();
  } finally {
    operationLocked = false;
  }
}

function readWindowId(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(
      "Could not determine the current browser window. Reopen the popup.",
    );
  }
  return value;
}

function readTabIds(value: unknown): number[] {
  if (!Array.isArray(value)) throw new Error("Invalid tab selection.");
  const ids = value.filter(
    (id): id is number =>
      typeof id === "number" && Number.isInteger(id) && id > 0,
  );
  if (ids.length === 0) throw new Error("No tabs selected.");
  if (ids.length > 500) throw new Error("Too many tabs selected.");
  return [...new Set(ids)];
}

function readGroupId(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error("Invalid tab group.");
  }
  return value;
}

function readString(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 300) {
    throw new Error("Invalid value.");
  }
  return value;
}

function readMethod(value: unknown): OrganizationMethod {
  if (isOrganizationMethod(value)) return value;
  throw new Error("Choose a valid organization method.");
}

function readProvider(value: unknown): ProviderId {
  if (value === "openrouter" || value === "deepseek") {
    return value;
  }
  throw new Error(
    `Unknown AI provider. Choose one of: ${Object.values(PROVIDERS)
      .map((provider) => provider.label)
      .join(", ")}.`,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function ok<T>(data: T): ApiResponse<T> {
  return { ok: true, data };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Something went wrong. Please try again.";
}
