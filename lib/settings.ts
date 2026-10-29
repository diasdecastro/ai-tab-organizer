import { browser } from "wxt/browser";
import type { AppSettings, OrganizationMethod, ProviderId } from "./types";
import { isOrganizationMethod } from "./methods";

export const SETTINGS_KEY = "ato.settings.v1";

export interface ProviderDefinition {
  id: ProviderId;
  label: string;
  endpoint: string;
  defaultModel: string;
  keyPlaceholder: string;
  modelHint: string;
  modelsUrl: string;
}

export const PROVIDERS: Record<ProviderId, ProviderDefinition> = {
  openrouter: {
    id: "openrouter",
    label: "OpenRouter",
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    defaultModel: "google/gemini-2.5-flash",
    keyPlaceholder: "sk-or-v1-…",
    modelHint:
      "Any JSON-capable model; stronger models produce better categories",
    modelsUrl: "https://openrouter.ai/models",
  },
  deepseek: {
    id: "deepseek",
    label: "DeepSeek",
    endpoint: "https://api.deepseek.com/chat/completions",
    defaultModel: "deepseek-chat",
    keyPlaceholder: "sk-…",
    modelHint:
      "deepseek-chat is recommended for grouping; deepseek-reasoner also works",
    modelsUrl: "https://api-docs.deepseek.com/quick_start/pricing",
  },
};

export function createDefaultSettings(): AppSettings {
  return {
    version: 1,
    activeProvider: "openrouter",
    providers: {
      openrouter: {
        apiKey: "",
        model: PROVIDERS.openrouter.defaultModel,
      },
      deepseek: {
        apiKey: "",
        model: PROVIDERS.deepseek.defaultModel,
      },
    },
    defaultMethod: "category",
  };
}

function normalizeMethod(value: unknown): OrganizationMethod {
  return isOrganizationMethod(value) ? value : "category";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeProviderId(value: unknown): ProviderId {
  return value === "deepseek" ? "deepseek" : "openrouter";
}

function normalizeProviderSettings(
  value: unknown,
  fallbackModel: string,
): { apiKey: string; model: string } {
  const record = isRecord(value) ? value : {};
  const apiKey = typeof record.apiKey === "string" ? record.apiKey.trim() : "";
  const model =
    typeof record.model === "string" && record.model.trim()
      ? record.model.trim()
      : fallbackModel;
  return { apiKey, model };
}

/** Pure, defensive normalization for values read from storage or messages. */
export function normalizeSettings(value: unknown): AppSettings {
  const defaults = createDefaultSettings();
  const record = isRecord(value) ? value : {};
  const providers = isRecord(record.providers) ? record.providers : {};

  return {
    version: 1,
    activeProvider: normalizeProviderId(record.activeProvider),
    providers: {
      openrouter: normalizeProviderSettings(
        providers.openrouter,
        defaults.providers.openrouter.model,
      ),
      deepseek: normalizeProviderSettings(
        providers.deepseek,
        defaults.providers.deepseek.model,
      ),
    },
    defaultMethod: normalizeMethod(record.defaultMethod),
  };
}

export async function loadSettings(): Promise<AppSettings> {
  try {
    const stored = await browser.storage.local.get(SETTINGS_KEY);
    return normalizeSettings(stored[SETTINGS_KEY]);
  } catch {
    return createDefaultSettings();
  }
}

export async function saveSettings(value: unknown): Promise<AppSettings> {
  const settings = normalizeSettings(value);
  await browser.storage.local.set({ [SETTINGS_KEY]: settings });
  return settings;
}

export async function setDefaultMethod(
  method: OrganizationMethod,
): Promise<AppSettings> {
  const settings = await loadSettings();
  return saveSettings({ ...settings, defaultMethod: method });
}

/** API keys should never be readable by content scripts. */
export async function hardenStorageAccess(): Promise<void> {
  try {
    const storageLocal = browser.storage
      .local as typeof browser.storage.local & {
      setAccessLevel?: (options: {
        accessLevel: "TRUSTED_CONTEXTS";
      }) => Promise<void>;
    };
    await storageLocal.setAccessLevel?.({ accessLevel: "TRUSTED_CONTEXTS" });
  } catch {
    // Older Chromium versions do not support setAccessLevel. The extension
    // has no content scripts, so storage is still extension-only in practice.
  }
}
