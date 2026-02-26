import { generateWithMiniMax } from "./ai/minimax.js";
import { buildPrompt } from "./ai/prompt-builder.js";
import { EVENT_RULES } from "./rules.js";
import {
  REQUEST_TIMEOUT_MS,
  toTextContent,
  normalizeEvents,
  extractJson,
  emitAiDebug,
  logAi,
  extractTokenUsage,
  buildLlmMonitor,
  nowMs,
} from "./ai/shared.js";
import { localGenerateDailyEvents } from "./ai/local-events.js";
import { cacheEvents, getCachedFallbackEvents } from "./ai/cache.js";
import { appendAiSelectionLog, appendAiHttpErrorLog } from "./ai/log-store.js";

export const AI_PROVIDER_PRESETS = [
  {
    id: "local",
    label: "本地随机",
    defaultModel: "",
    defaultEndpoint: "",
    note: "无需网络，使用内置事件生成器。",
  },
  {
    id: "openai",
    label: "OpenAI 兼容",
    defaultModel: "gpt-4o-mini",
    defaultEndpoint: "https://api.openai.com/v1/chat/completions",
    note: "需要可用的 OpenAI 兼容 endpoint + API Key。",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    defaultModel: "x-ai/grok-4.1-fast",
    defaultEndpoint: "https://openrouter.ai/api/v1/chat/completions",
    note: "使用 OpenRouter API Key。模型名建议 provider/model，例如 x-ai/grok-4.1-fast。",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    defaultModel: "claude-3-5-haiku-latest",
    defaultEndpoint: "https://api.anthropic.com/v1/messages",
    note: "需要 Anthropic API Key。",
  },
  {
    id: "minimax",
    label: "MiniMax",
    defaultModel: "M2-her",
    defaultEndpoint: "https://api.minimaxi.com/v1/text/chatcompletion_v2",
    note: "需要 MiniMax Bearer Token。",
  },
];

const STRUCTURED_EVENT_RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "lifemaker_daily_events",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["events"],
      properties: {
        events: {
          type: "array",
          minItems: 3,
          maxItems: 3,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["type", "setup", "choices"],
            properties: {
              type: {
                type: "string",
                enum: Object.keys(EVENT_RULES),
              },
              setup: {
                type: "string",
                minLength: 8,
              },
              choices: {
                type: "array",
                minItems: 2,
                maxItems: 3,
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["label", "tag", "delta_hint"],
                  properties: {
                    label: {
                      type: "string",
                      minLength: 2,
                    },
                    tag: {
                      type: "string",
                      enum: ["MONEY", "HAPPY", "FACE", "RISK"],
                    },
                    delta_hint: {
                      type: "object",
                      additionalProperties: false,
                      required: ["money", "happy"],
                      properties: {
                        money: { type: "number" },
                        happy: { type: "number" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

function openAiCompatibleHeaders(provider) {
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${provider.apiKey}`,
  };

  if (provider.id === "openrouter") {
    headers["HTTP-Referer"] =
      typeof window !== "undefined" && window.location?.origin
        ? window.location.origin
        : "http://localhost:8000";
    headers["X-Title"] = "lifemaker-homecoming-simulator";
  }

  return headers;
}

async function generateWithOpenAICompatible(state, provider, prompt, { signal } = {}) {
  const endpoint =
    provider.endpoint ||
    (provider.id === "openrouter"
      ? "https://openrouter.ai/api/v1/chat/completions"
      : "https://api.openai.com/v1/chat/completions");
  const model =
    provider.model || (provider.id === "openrouter" ? "x-ai/grok-4.1-fast" : "gpt-4o-mini");
  const responseFormat =
    provider.id === "openrouter" ? STRUCTURED_EVENT_RESPONSE_FORMAT : { type: "json_object" };
  const plugins = provider.id === "openrouter" ? [{ id: "response-healing" }] : undefined;
  const providerRouting = provider.id === "openrouter" ? { require_parameters: true } : undefined;
  const requestStartMs = nowMs();

  emitAiDebug("openai-compatible", "input", {
    endpoint,
    model,
    responseFormat,
    plugins,
    providerRouting,
    prompt,
    state: { job: state.job, money: state.money, happy: state.happy, day: state.day },
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const combinedSignal = signal
    ? (AbortSignal.any ? AbortSignal.any([signal, controller.signal]) : controller.signal)
    : controller.signal;
  if (signal && !AbortSignal.any) {
    signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: openAiCompatibleHeaders(provider),
      signal: combinedSignal,
      body: JSON.stringify({
        model,
        temperature: 0.9,
        max_tokens: 800,
        response_format: responseFormat,
        ...(plugins ? { plugins } : {}),
        ...(providerRouting ? { provider: providerRouting } : {}),
        messages: [
          { role: "system", content: "You output only JSON." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!res.ok) {
      throw new Error(`openai-compatible request failed: ${res.status}`);
    }
    const responseStartMs = nowMs();

    const json = await res.json();
    const responseDoneMs = nowMs();
    logAi("openai-compatible", "raw response", json);
    emitAiDebug("openai-compatible", "raw", json);
    const content = toTextContent(json?.choices?.[0]?.message?.content);
    if (!content) {
      throw new Error("openai-compatible response missing content");
    }
    emitAiDebug("openai-compatible", "content", content);

    const normalized = normalizeEvents(extractJson(content), state);
    const parseDoneMs = nowMs();
    const usage = extractTokenUsage(json);
    const monitor = buildLlmMonitor({
      provider: provider.id,
      endpoint,
      model,
      requestStartMs,
      responseStartMs,
      responseDoneMs,
      parseDoneMs,
      usage,
      responseId: json?.id,
      httpStatus: res.status,
      eventCount: normalized.length,
    });
    logAi("openai-compatible", "normalized events", normalized);
    emitAiDebug("openai-compatible", "normalized", normalized);
    emitAiDebug("openai-compatible", "metrics", monitor);
    return { events: normalized, monitor };
  } finally {
    clearTimeout(timer);
  }
}

async function generateWithAnthropic(state, provider, prompt, { signal } = {}) {
  const endpoint = provider.endpoint || "https://api.anthropic.com/v1/messages";
  const model = provider.model || "claude-3-5-haiku-latest";
  emitAiDebug("anthropic", "input", {
    endpoint,
    model,
    prompt,
    state: { job: state.job, money: state.money, happy: state.happy, day: state.day },
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const requestStartMs = nowMs();
  const combinedSignal = signal
    ? (AbortSignal.any ? AbortSignal.any([signal, controller.signal]) : controller.signal)
    : controller.signal;
  if (signal && !AbortSignal.any) {
    signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": provider.apiKey,
        "anthropic-version": "2023-06-01",
      },
      signal: combinedSignal,
      body: JSON.stringify({
        model,
        temperature: 0.9,
        max_tokens: 800,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      throw new Error(`anthropic request failed: ${res.status}`);
    }
    const responseStartMs = nowMs();

    const json = await res.json();
    const responseDoneMs = nowMs();
    logAi("anthropic", "raw response", json);
    emitAiDebug("anthropic", "raw", json);
    const content = toTextContent(json?.content);
    if (!content) {
      throw new Error("anthropic response missing content");
    }
    emitAiDebug("anthropic", "content", content);

    const normalized = normalizeEvents(extractJson(content), state);
    const parseDoneMs = nowMs();
    const usage = extractTokenUsage(json);
    const monitor = buildLlmMonitor({
      provider: provider.id,
      endpoint,
      model,
      requestStartMs,
      responseStartMs,
      responseDoneMs,
      parseDoneMs,
      usage,
      responseId: json?.id,
      httpStatus: res.status,
      eventCount: normalized.length,
    });
    logAi("anthropic", "normalized events", normalized);
    emitAiDebug("anthropic", "normalized", normalized);
    emitAiDebug("anthropic", "metrics", monitor);
    return { events: normalized, monitor };
  } finally {
    clearTimeout(timer);
  }
}

function safeHistory(context) {
  return Array.isArray(context?.history) ? context.history.slice(-6) : [];
}

function providerRequestInfo(providerId, provider) {
  if (providerId === "openrouter") {
    return {
      endpoint: provider.endpoint || "https://openrouter.ai/api/v1/chat/completions",
      model: provider.model || "x-ai/grok-4.1-fast",
    };
  }

  if (providerId === "anthropic") {
    return {
      endpoint: provider.endpoint || "https://api.anthropic.com/v1/messages",
      model: provider.model || "claude-3-5-haiku-latest",
    };
  }

  if (providerId === "minimax") {
    return {
      endpoint: provider.endpoint || "https://api.minimaxi.com/v1/text/chatcompletion_v2",
      model: provider.model || "M2-her",
    };
  }

  return {
    endpoint: provider.endpoint || "https://api.openai.com/v1/chat/completions",
    model: provider.model || "gpt-4o-mini",
  };
}

function newLogId() {
  return `ai_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function serializeError(err) {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack || "",
    };
  }

  return {
    name: "UnknownError",
    message: String(err),
    stack: "",
  };
}

export async function getDailyEvents(state, provider = { id: "local" }, context = {}, { signal } = {}) {
  if (!provider || provider.id === "local") {
    return {
      ...localGenerateDailyEvents(state),
      meta: {
        usedProvider: "local",
        fallback: false,
        reason: "",
      },
    };
  }

  const prompt = buildPrompt(state, context);
  const requestInfo = providerRequestInfo(provider.id, provider);
  const requestState = { job: state.job, money: state.money, happy: state.happy, day: state.day };
  const history = safeHistory(context);
  const requestAt = new Date().toISOString();
  const requestStartMs = nowMs();

  try {
    if (!provider.apiKey) {
      throw new Error("missing api key");
    }

    const opts = { signal };
    const generated =
      provider.id === "anthropic"
        ? await generateWithAnthropic(state, provider, prompt, opts)
        : provider.id === "minimax"
          ? await generateWithMiniMax(state, provider, prompt, opts)
          : await generateWithOpenAICompatible(state, provider, prompt, opts);
    const events = Array.isArray(generated) ? generated : generated?.events || [];
    const monitor = !Array.isArray(generated) ? generated?.monitor || null : null;

    cacheEvents(provider.id, events);
    appendAiSelectionLog({
      id: newLogId(),
      provider: provider.id,
      source: "remote",
      requestAt,
      responseAt: new Date().toISOString(),
      request: {
        ...requestInfo,
        state: requestState,
        history,
        prompt,
      },
      response: {
        events,
      },
      monitor,
    });

    return {
      day: state.day,
      providerId: provider.id,
      providerLabel:
        AI_PROVIDER_PRESETS.find((item) => item.id === provider.id)?.label || provider.id,
      events,
      meta: {
        usedProvider: provider.id,
        fallback: false,
        reason: "",
      },
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "unknown error";
    const errorDetail = serializeError(err);
    const errorMonitor = buildLlmMonitor({
      provider: provider.id || "unknown",
      endpoint: requestInfo.endpoint,
      model: requestInfo.model,
      requestStartMs,
      responseStartMs: null,
      responseDoneMs: nowMs(),
      parseDoneMs: nowMs(),
      usage: null,
      responseId: "",
      httpStatus: null,
      eventCount: null,
      ttftKind: "n/a",
    });
    appendAiHttpErrorLog({
      id: newLogId(),
      provider: provider.id || "unknown",
      requestAt,
      responseAt: new Date().toISOString(),
      request: {
        ...requestInfo,
        state: requestState,
        history,
      },
      error: {
        ...errorDetail,
      },
      monitor: errorMonitor,
    });
    emitAiDebug(provider.id || "unknown", "error", {
      message: reason,
      day: state.day,
      state: requestState,
    });

    const cached = getCachedFallbackEvents(state, provider.id);
    if (cached) {
      appendAiSelectionLog({
        id: newLogId(),
        provider: provider.id || "unknown",
        source: "fallback-cached",
        requestAt,
        responseAt: new Date().toISOString(),
        request: {
          ...requestInfo,
          state: requestState,
          history,
          prompt,
        },
        response: {
          fallbackReason: reason,
          events: cached,
        },
        monitor: errorMonitor,
      });
      return {
        day: state.day,
        providerId: "cached",
        providerLabel: "本地缓存(降级)",
        events: cached,
        meta: { usedProvider: "cached", fallback: true, reason },
      };
    }

    const localFallback = localGenerateDailyEvents(state);
    appendAiSelectionLog({
      id: newLogId(),
      provider: provider.id || "unknown",
      source: "fallback-local",
      requestAt,
      responseAt: new Date().toISOString(),
      request: {
        ...requestInfo,
        state: requestState,
        history,
        prompt,
      },
      response: {
        fallbackReason: reason,
        events: localFallback.events,
      },
      monitor: errorMonitor,
    });

    return {
      ...localFallback,
      providerId: "local",
      providerLabel: "本地随机(降级)",
      meta: {
        usedProvider: "local",
        fallback: true,
        reason,
      },
    };
  }
}

export {
  REQUEST_TIMEOUT_MS,
  toTextContent,
  normalizeEvents,
  extractJson,
  emitAiDebug,
  logAi,
} from "./ai/shared.js";
