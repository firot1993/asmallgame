import {
  toTextContent,
  normalizeEvents,
  extractJson,
  emitAiDebug,
  logAi,
  REQUEST_TIMEOUT_MS,
  extractTokenUsage,
  buildLlmMonitor,
  nowMs,
} from "./shared.js";

export async function generateWithMiniMax(state, provider, prompt, { signal } = {}) {
  const endpoint = provider.endpoint || "https://api.minimaxi.com/v1/text/chatcompletion_v2";
  const model = provider.model || "M2-her";
  const requestStartMs = nowMs();
  emitAiDebug("minimax", "input", {
    endpoint,
    model,
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
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${provider.apiKey}`,
      },
      signal: combinedSignal,
      body: JSON.stringify({
        model,
        max_tokens: 1000,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            name: "MiniMax AI",
            content: "你只输出一个完整 JSON 对象，不要任何额外文字。JSON 必须可被 JSON.parse 解析。",
          },
          {
            role: "user",
            name: "用户",
            content: prompt,
          },
        ],
      }),
    });

    if (!res.ok) {
      throw new Error(`minimax request failed: ${res.status}`);
    }
    const responseStartMs = nowMs();

    const json = await res.json();
    const responseDoneMs = nowMs();
    logAi("minimax", "raw response", json);
    emitAiDebug("minimax", "raw", json);
    const contentRaw =
      json?.choices?.[0]?.message?.content ??
      json?.choices?.[0]?.message ??
      json?.reply ??
      json?.output_text ??
      json?.content?.[0]?.text;
    const content = toTextContent(contentRaw);
    logAi("minimax", "content text", content);
    emitAiDebug("minimax", "content", content);
    if (!content) {
      throw new Error("minimax response missing content");
    }

    const normalized = normalizeEvents(extractJson(content), state);
    const parseDoneMs = nowMs();
    const usage = extractTokenUsage(json);
    const monitor = buildLlmMonitor({
      provider: "minimax",
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
    logAi("minimax", "normalized events", normalized);
    emitAiDebug("minimax", "normalized", normalized);
    emitAiDebug("minimax", "metrics", monitor);
    return { events: normalized, monitor };
  } finally {
    clearTimeout(timer);
  }
}
