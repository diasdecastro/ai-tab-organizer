import type {
  ClassificationInput,
  ProviderId,
  TestConnectionResult,
} from "../types";
import { PROVIDERS } from "../settings";
import {
  buildClassificationMessages,
  type ChatMessage,
  type ClassificationContext,
} from "./prompt";

const REQUEST_TIMEOUT_MS = 60_000;
const CLASSIFICATION_MAX_TOKENS = 4096;
const TEST_MAX_TOKENS = 8;

export class AiRequestError extends Error {
  readonly status?: number;
  readonly providerDetail?: string;

  constructor(message: string, options?: { status?: number; detail?: string }) {
    super(message);
    this.name = "AiRequestError";
    this.status = options?.status;
    this.providerDetail = options?.detail;
  }
}

interface ChatCompletionOptions {
  provider: ProviderId;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  maxTokens: number;
  jsonMode: boolean;
}

interface RawChatResult {
  content: string;
  latencyMs: number;
}

export function buildRequestBody(
  model: string,
  messages: ChatMessage[],
  maxTokens: number,
  jsonMode: boolean,
): Record<string, unknown> {
  return {
    model,
    messages,
    temperature: 0.2,
    max_tokens: maxTokens,
    ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
  };
}

export async function requestChatCompletion(
  options: ChatCompletionOptions,
): Promise<RawChatResult> {
  try {
    return await requestOnce(options);
  } catch (error) {
    const canRetryWithoutJsonMode =
      options.jsonMode &&
      error instanceof AiRequestError &&
      (error.status === 400 || error.status === 422) &&
      /response_format|json mode|structured output/i.test(
        error.providerDetail ?? error.message,
      );

    if (!canRetryWithoutJsonMode) throw error;

    // Some OpenRouter models do not implement response_format. The prompt still
    // asks for JSON, so retry once without the optional parameter.
    return requestOnce({ ...options, jsonMode: false });
  }
}

async function requestOnce(
  options: ChatCompletionOptions,
): Promise<RawChatResult> {
  const provider = PROVIDERS[options.provider];
  const apiKey = options.apiKey.trim();
  const model = options.model.trim();

  if (!apiKey) {
    throw new AiRequestError(
      `Add your ${provider.label} API key in Settings before organizing tabs.`,
    );
  }
  if (!model) {
    throw new AiRequestError(
      `Choose a model for ${provider.label} in Settings.`,
    );
  }

  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  const startedAt = Date.now();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
  if (options.provider === "openrouter") {
    headers["X-Title"] = "AI Tab Organizer";
  }

  try {
    const response = await fetch(provider.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(
        buildRequestBody(
          model,
          options.messages,
          options.maxTokens,
          options.jsonMode,
        ),
      ),
      signal: controller.signal,
    });

    if (!response.ok) {
      const rawBody = await response.text().catch(() => "");
      // Defensive: never display a provider error that echoes the key back.
      const detail = extractProviderError(rawBody)?.replaceAll(
        apiKey,
        "[redacted]",
      );
      throw new AiRequestError(
        describeHttpError(response.status, provider.label, detail),
        { status: response.status, detail },
      );
    }

    const payload: unknown = await response.json().catch(() => null);
    const content = extractContent(payload);
    if (content === null) {
      throw new AiRequestError(
        `${provider.label} returned a response without any text. Please try again.`,
      );
    }

    return { content, latencyMs: Date.now() - startedAt };
  } catch (error) {
    if (error instanceof AiRequestError) throw error;

    if (timedOut) {
      throw new AiRequestError(
        `${provider.label} took too long to respond (60 second timeout). Please try again.`,
      );
    }
    if (controller.signal.aborted) {
      throw new AiRequestError("The AI request was cancelled.");
    }
    throw new AiRequestError(
      `Could not reach ${provider.label}. Check your network connection and try again.`,
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

function extractContent(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;

  const first = choices[0] as {
    message?: { content?: unknown };
  };
  const content = first?.message?.content;

  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const text = content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) {
          const value = (part as { text?: unknown }).text;
          return typeof value === "string" ? value : "";
        }
        return "";
      })
      .join("");
    return text || null;
  }

  return null;
}

function extractProviderError(rawBody: string): string | undefined {
  const trimmed = rawBody.trim();
  if (!trimmed) return undefined;

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object") {
      const error = (parsed as { error?: unknown }).error;
      if (typeof error === "string") return limitDetail(error);
      if (error && typeof error === "object") {
        const message = (error as { message?: unknown }).message;
        if (typeof message === "string") return limitDetail(message);
      }
      const message = (parsed as { message?: unknown }).message;
      if (typeof message === "string") return limitDetail(message);
    }
  } catch {
    // Fall back to the raw response body.
  }

  return limitDetail(trimmed);
}

function limitDetail(value: string): string {
  const singleLine = value.replace(/\s+/g, " ").trim();
  return singleLine.length > 300 ? `${singleLine.slice(0, 299)}…` : singleLine;
}

function describeHttpError(
  status: number,
  providerLabel: string,
  detail: string | undefined,
): string {
  switch (status) {
    case 401:
    case 403:
      return `${providerLabel} rejected the API key. Check it in Settings.`;
    case 402:
      return `${providerLabel} says the account has insufficient credits.`;
    case 404:
      return `${providerLabel} could not find that model. Check the model ID in Settings.`;
    case 429:
      return `${providerLabel} is rate limiting requests. Wait a moment and try again.`;
    default:
      if (status >= 500) {
        return `${providerLabel} is having server trouble (HTTP ${status}). Try again shortly.`;
      }
      return detail
        ? `${providerLabel} request failed (HTTP ${status}): ${detail}`
        : `${providerLabel} request failed (HTTP ${status}).`;
  }
}

export async function testProviderConnection(options: {
  provider: ProviderId;
  apiKey: string;
  model: string;
}): Promise<TestConnectionResult> {
  const result = await requestChatCompletion({
    provider: options.provider,
    apiKey: options.apiKey,
    model: options.model,
    messages: [
      {
        role: "user",
        content: "This is a connection test. Reply with exactly: OK",
      },
    ],
    maxTokens: TEST_MAX_TOKENS,
    jsonMode: false,
  });

  return {
    latencyMs: result.latencyMs,
    reply: result.content.trim().slice(0, 80) || "(empty response)",
  };
}

export async function requestClassification(options: {
  provider: ProviderId;
  apiKey: string;
  model: string;
  input: ClassificationInput;
  context?: ClassificationContext;
}): Promise<string> {
  const result = await requestChatCompletion({
    provider: options.provider,
    apiKey: options.apiKey,
    model: options.model,
    messages: buildClassificationMessages(options.input, options.context),
    maxTokens: CLASSIFICATION_MAX_TOKENS,
    jsonMode: true,
  });
  return result.content;
}
