import { beforeEach, describe, expect, it } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import {
  SETTINGS_KEY,
  createDefaultSettings,
  hardenStorageAccess,
  loadSettings,
  normalizeSettings,
  saveSettings,
} from "../lib/settings";
import { clearUndo, loadJob, loadUndo, saveJob, saveUndo } from "../lib/state";
import type { UndoRecord } from "../lib/types";

beforeEach(() => {
  fakeBrowser.reset();
});

describe("normalizeSettings", () => {
  it("returns defaults for missing or malformed values", () => {
    expect(normalizeSettings(null)).toEqual(createDefaultSettings());
    expect(normalizeSettings("nope")).toEqual(createDefaultSettings());
    expect(normalizeSettings({ providers: "nope" })).toEqual(
      createDefaultSettings(),
    );
  });

  it("normalizes provider ids, trims keys, and repairs empty models", () => {
    const settings = normalizeSettings({
      version: 99,
      activeProvider: "deepseek",
      providers: {
        openrouter: { apiKey: "  sk-or  ", model: "  " },
        deepseek: { apiKey: 42, model: "  deepseek-chat  " },
        extra: { apiKey: "should-be-dropped" },
      },
    });

    expect(settings.version).toBe(1);
    expect(settings.activeProvider).toBe("deepseek");
    expect(settings.providers.openrouter).toEqual({
      apiKey: "sk-or",
      model: "google/gemini-2.5-flash",
    });
    expect(settings.providers.deepseek).toEqual({
      apiKey: "",
      model: "deepseek-chat",
    });
    expect(settings.providers).not.toHaveProperty("extra");
  });

  it("falls back to OpenRouter for unknown active providers", () => {
    expect(normalizeSettings({ activeProvider: "other" }).activeProvider).toBe(
      "openrouter",
    );
  });

  it("normalizes the default organization method", () => {
    expect(
      normalizeSettings({ defaultMethod: "alphabetical" }).defaultMethod,
    ).toBe("alphabetical");
    expect(normalizeSettings({ defaultMethod: "bogus" }).defaultMethod).toBe(
      "category",
    );
  });
});

describe("settings storage", () => {
  it("saves to extension-local storage, never sync storage", async () => {
    await saveSettings({
      version: 1,
      activeProvider: "openrouter",
      providers: {
        openrouter: { apiKey: "  sk-secret  ", model: "openai/gpt-4o-mini" },
        deepseek: { apiKey: "sk-deep", model: "deepseek-chat" },
      },
      defaultMethod: "category",
    });

    const local = await fakeBrowser.storage.local.get(SETTINGS_KEY);
    const sync = await fakeBrowser.storage.sync.get(null);

    expect(local[SETTINGS_KEY]).toMatchObject({
      activeProvider: "openrouter",
      providers: {
        openrouter: { apiKey: "sk-secret", model: "openai/gpt-4o-mini" },
      },
    });
    expect(sync).toEqual({});
  });

  it("loads and normalizes saved settings", async () => {
    await fakeBrowser.storage.local.set({
      [SETTINGS_KEY]: {
        activeProvider: "deepseek",
        providers: { deepseek: { apiKey: "sk-deep", model: "" } },
      },
    });

    const settings = await loadSettings();
    expect(settings.activeProvider).toBe("deepseek");
    expect(settings.providers.deepseek.model).toBe("deepseek-chat");
  });

  it("hardens storage access without throwing when unsupported", async () => {
    await expect(hardenStorageAccess()).resolves.toBeUndefined();
  });
});

describe("session state storage", () => {
  it("stores and restores the current job", async () => {
    expect(await loadJob()).toEqual({ status: "idle" });

    const job = { status: "organizing" as const, startedAt: 123 };
    await saveJob(job);
    expect(await loadJob()).toEqual(job);
  });

  it("stores, restores, and clears the undo record", async () => {
    const undo: UndoRecord = {
      id: "undo-1",
      createdAt: 456,
      windowId: 1,
      groups: [
        {
          groupId: 9,
          name: "Work",
          color: "blue",
          tabIds: [1, 2],
        },
      ],
      tabCount: 2,
    };

    await saveUndo(undo);
    expect(await loadUndo()).toEqual(undo);

    await clearUndo();
    expect(await loadUndo()).toBeNull();
  });

  it("ignores invalid stored state", async () => {
    await fakeBrowser.storage.session.set({
      "ato.job.v1": "broken",
      "ato.undo.v1": { groups: "nope" },
    });

    expect(await loadJob()).toEqual({ status: "idle" });
    expect(await loadUndo()).toBeNull();
  });

  it("rejects structurally incomplete jobs and undo records", async () => {
    await fakeBrowser.storage.session.set({
      "ato.job.v1": { status: "unknown" },
      "ato.undo.v1": {
        id: "u",
        createdAt: 1,
        windowId: 1,
        groups: [{ groupId: "x" }],
      },
    });

    expect(await loadJob()).toEqual({ status: "idle" });
    expect(await loadUndo()).toBeNull();
  });
});
