import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AiRequestError,
  buildRequestBody,
  requestChatCompletion,
  requestClassification,
  testProviderConnection,
} from "../lib/ai/client";
import { buildClassificationMessages } from "../lib/ai/prompt";
import type { ClassificationInput } from "../lib/types";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function chatResponse(content: string): Response {
  return jsonResponse({
    choices: [{ message: { role: "assistant", content } }],
  });
}

function captureBody(
  fetchMock: ReturnType<typeof vi.fn>,
  call = 0,
): Record<string, unknown> {
  const init = fetchMock.mock.calls[call]![1] as RequestInit;
  return JSON.parse(String(init.body)) as Record<string, unknown>;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buildRequestBody", () => {
  it("adds response_format only when JSON mode is requested", () => {
    const messages = [{ role: "user" as const, content: "hi" }];

    expect(buildRequestBody("model", messages, 100, true)).toMatchObject({
      model: "model",
      max_tokens: 100,
      response_format: { type: "json_object" },
    });
    expect(buildRequestBody("model", messages, 100, false)).not.toHaveProperty(
      "response_format",
    );
  });
});

describe("requestChatCompletion", () => {
  it("calls OpenRouter with the configured key and model", async () => {
    const fetchMock = vi.fn().mockResolvedValue(chatResponse("hello"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await requestChatCompletion({
      provider: "openrouter",
      apiKey: "  sk-or-test  ",
      model: "google/gemini-2.5-flash",
      messages: [{ role: "user", content: "hi" }],
      maxTokens: 64,
      jsonMode: true,
    });

    expect(result.content).toBe("hello");
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer sk-or-test",
    );
    expect((init.headers as Record<string, string>)["X-Title"]).toBe(
      "AI Tab Organizer",
    );
    expect(captureBody(fetchMock)).toMatchObject({
      model: "google/gemini-2.5-flash",
      max_tokens: 64,
      response_format: { type: "json_object" },
    });
  });

  it("calls DeepSeek at its OpenAI-compatible endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(chatResponse("ok"));
    vi.stubGlobal("fetch", fetchMock);

    await requestChatCompletion({
      provider: "deepseek",
      apiKey: "sk-test",
      model: "deepseek-chat",
      messages: [{ role: "user", content: "hi" }],
      maxTokens: 8,
      jsonMode: false,
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.deepseek.com/chat/completions");
    expect((init.headers as Record<string, string>)["X-Title"]).toBeUndefined();
  });

  it("does not call fetch without an API key", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      requestChatCompletion({
        provider: "openrouter",
        apiKey: "   ",
        model: "model",
        messages: [{ role: "user", content: "hi" }],
        maxTokens: 8,
        jsonMode: false,
      }),
    ).rejects.toThrow(/API key/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps auth, rate-limit, and model errors to useful messages", async () => {
    const cases: Array<[number, RegExp]> = [
      [401, /rejected the API key/i],
      [429, /rate limiting/i],
      [404, /could not find that model/i],
      [500, /server trouble/i],
    ];

    for (const [status, message] of cases) {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ error: { message: "provider detail" } }, status),
        );
      vi.stubGlobal("fetch", fetchMock);

      await expect(
        requestChatCompletion({
          provider: "deepseek",
          apiKey: "sk-test",
          model: "model",
          messages: [{ role: "user", content: "hi" }],
          maxTokens: 8,
          jsonMode: false,
        }),
      ).rejects.toThrow(message);
    }
  });

  it("redacts the API key if a provider echoes it in an error", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(
          { error: { message: "invalid key sk-secret-key for request" } },
          400,
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      requestChatCompletion({
        provider: "openrouter",
        apiKey: "sk-secret-key",
        model: "model",
        messages: [{ role: "user", content: "hi" }],
        maxTokens: 8,
        jsonMode: false,
      }),
    ).rejects.toThrow(/\[redacted\]/);

    try {
      await requestChatCompletion({
        provider: "openrouter",
        apiKey: "sk-secret-key",
        model: "model",
        messages: [{ role: "user", content: "hi" }],
        maxTokens: 8,
        jsonMode: false,
      });
    } catch (error) {
      expect(String(error)).not.toContain("sk-secret-key");
    }
  });

  it("retries once without response_format when a model rejects JSON mode", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          {
            error: {
              message: "response_format is not supported by this model",
            },
          },
          400,
        ),
      )
      .mockResolvedValueOnce(chatResponse('{"groups":[]}'));
    vi.stubGlobal("fetch", fetchMock);

    const result = await requestChatCompletion({
      provider: "openrouter",
      apiKey: "sk-test",
      model: "some/model",
      messages: [{ role: "user", content: "hi" }],
      maxTokens: 8,
      jsonMode: true,
    });

    expect(result.content).toBe('{"groups":[]}');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(captureBody(fetchMock, 0)).toHaveProperty("response_format");
    expect(captureBody(fetchMock, 1)).not.toHaveProperty("response_format");
  });

  it("does not retry unrelated 400 errors", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ error: { message: "invalid request" } }, 400),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      requestChatCompletion({
        provider: "openrouter",
        apiKey: "sk-test",
        model: "bad/model",
        messages: [{ role: "user", content: "hi" }],
        maxTokens: 8,
        jsonMode: true,
      }),
    ).rejects.toThrow(/HTTP 400/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("handles network failures and malformed responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    await expect(
      requestChatCompletion({
        provider: "openrouter",
        apiKey: "sk-test",
        model: "model",
        messages: [{ role: "user", content: "hi" }],
        maxTokens: 8,
        jsonMode: false,
      }),
    ).rejects.toThrow(/Could not reach OpenRouter/i);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ choices: [] })),
    );
    await expect(
      requestChatCompletion({
        provider: "openrouter",
        apiKey: "sk-test",
        model: "model",
        messages: [{ role: "user", content: "hi" }],
        maxTokens: 8,
        jsonMode: false,
      }),
    ).rejects.toThrow(AiRequestError);
  });

  it("supports content arrays returned by some OpenAI-compatible APIs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          choices: [
            {
              message: {
                content: [
                  { type: "text", text: '{"groups":' },
                  { type: "text", text: "[]}" },
                ],
              },
            },
          ],
        }),
      ),
    );

    const result = await requestChatCompletion({
      provider: "openrouter",
      apiKey: "sk-test",
      model: "model",
      messages: [{ role: "user", content: "hi" }],
      maxTokens: 8,
      jsonMode: false,
    });

    expect(result.content).toBe('{"groups":[]}');
  });
});

describe("testProviderConnection", () => {
  it("sends a minimal request and returns latency and reply", async () => {
    const fetchMock = vi.fn().mockResolvedValue(chatResponse("OK"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await testProviderConnection({
      provider: "deepseek",
      apiKey: "sk-test",
      model: "deepseek-chat",
    });

    expect(result.reply).toBe("OK");
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    const body = captureBody(fetchMock);
    expect(body.max_tokens).toBe(8);
    expect(body).not.toHaveProperty("response_format");
  });
});

describe("classification prompt", () => {
  it("contains only temporary ids, titles, and hostnames", () => {
    const input: ClassificationInput = {
      tabs: [
        { id: "T1", title: "Inbox", hostname: "mail.example.com" },
        { id: "T2", title: "Docs", hostname: "docs.example.com" },
      ],
      idMap: { T1: 1, T2: 2 },
    };

    const messages = buildClassificationMessages(input);
    const serialized = JSON.stringify(messages);

    expect(messages).toHaveLength(2);
    expect(messages[0]!.content).toContain("JSON");
    expect(messages[0]!.content).toContain("Development");
    expect(messages[0]!.content).toContain("NEVER use: Other");
    expect(messages[1]!.content).toContain('"T1"');
    expect(messages[1]!.content).toContain("mail.example.com");
    expect(serialized).not.toContain("https://");
    expect(serialized).not.toContain('"url"');
  });

  it("adds active-tab context for relevance grouping", () => {
    const messages = buildClassificationMessages(
      {
        tabs: [{ id: "T1", title: "Inbox", hostname: "mail.example.com" }],
        idMap: { T1: 1 },
      },
      {
        method: "relevance",
        activeTab: { title: "Pull request", hostname: "github.com" },
      },
    );

    expect(messages[0]!.content).toContain("focused on the active tab");
    expect(messages[1]!.content).toContain("Active tab");
    expect(messages[1]!.content).toContain("github.com");
    expect(messages[1]!.content).not.toContain("https://");
  });

  it("passes the prompt through requestClassification", async () => {
    const fetchMock = vi.fn().mockResolvedValue(chatResponse('{"groups":[]}'));
    vi.stubGlobal("fetch", fetchMock);

    const content = await requestClassification({
      provider: "openrouter",
      apiKey: "sk-test",
      model: "model",
      input: {
        tabs: [{ id: "T1", title: "Inbox", hostname: "mail.example.com" }],
        idMap: { T1: 1 },
      },
    });

    expect(content).toBe('{"groups":[]}');
    const body = captureBody(fetchMock);
    expect(body.max_tokens).toBe(4096);
  });
});
