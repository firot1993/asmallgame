import { EVENT_RULES, clamp } from "../rules.js";

export const REQUEST_TIMEOUT_MS = 20_000;

const EVENT_TYPES = Object.keys(EVENT_RULES);
const DEBUG_MODE = new URLSearchParams(window.location.search).get("debug") === "1";

export function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function pick(arr) {
  return arr[randInt(0, arr.length - 1)];
}

export function boundedDelta(type, money, happy) {
  const rule = EVENT_RULES[type] ?? EVENT_RULES.RELATIVE_QUESTION;
  return {
    money: clamp(money, rule.money[0], rule.money[1]),
    happy: clamp(happy, rule.happy[0], rule.happy[1]),
  };
}

function stripCodeFence(text) {
  return text.replace(/```json/gi, "").replace(/```/g, "").trim();
}

function findFirstCompleteJsonValue(text) {
  let inString = false;
  let escaped = false;
  let start = -1;
  const stack = [];

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (inString) {
      if (!escaped && ch === "\\") {
        escaped = true;
        continue;
      }

      if (!escaped && ch === "\"") {
        inString = false;
      }

      escaped = false;
      continue;
    }

    if (ch === "\"") {
      inString = true;
      continue;
    }

    if (start < 0) {
      if (ch === "{") {
        start = i;
        stack.push("}");
      } else if (ch === "[") {
        start = i;
        stack.push("]");
      }
      continue;
    }

    if (ch === "{") {
      stack.push("}");
      continue;
    }

    if (ch === "[") {
      stack.push("]");
      continue;
    }

    if ((ch === "}" || ch === "]") && stack.length > 0) {
      if (ch === stack[stack.length - 1]) {
        stack.pop();
      }
      if (start >= 0 && stack.length === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  return "";
}

function cleanupTrailingCommas(text) {
  return text.replace(/,\s*([}\]])/g, "$1");
}

function autoCloseJsonValue(text) {
  const objectStart = text.indexOf("{");
  const arrayStart = text.indexOf("[");
  const startCandidates = [objectStart, arrayStart].filter((idx) => idx >= 0);
  const start = startCandidates.length > 0 ? Math.min(...startCandidates) : -1;
  if (start < 0) {
    return text;
  }

  const raw = text.slice(start);
  const stack = [];
  let inString = false;
  let escaped = false;

  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];

    if (inString) {
      if (!escaped && ch === "\\") {
        escaped = true;
        continue;
      }

      if (!escaped && ch === "\"") {
        inString = false;
      }

      escaped = false;
      continue;
    }

    if (ch === "\"") {
      inString = true;
      continue;
    }

    if (ch === "{") {
      stack.push("}");
    } else if (ch === "[") {
      stack.push("]");
    } else if ((ch === "}" || ch === "]") && stack.length > 0) {
      stack.pop();
    }
  }

  const stringCloser = inString ? "\"" : "";
  return raw + stringCloser + stack.reverse().join("");
}

function repairSetupStringFragments(text) {
  let output = text;

  // Repair patterns like:
  // "setup":"A", "B", "C",
  // -> "setup":"A B C",
  const triplePattern = /("setup"\s*:\s*"[^"]*)"\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"/g;
  const singlePattern = /("setup"\s*:\s*"[^"]*)"\s*,\s*"([^"]*)"\s*(?=,)/g;
  output = output.replace(triplePattern, "$1 $2 $3\"");
  output = output.replace(singlePattern, "$1 $2\"");

  return output;
}

export function toTextContent(payload) {
  if (typeof payload === "string") {
    return payload;
  }

  if (Array.isArray(payload)) {
    return payload
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }
        if (item && typeof item === "object") {
          return item.text ?? item.content ?? "";
        }
        return "";
      })
      .join("\n");
  }

  if (payload && typeof payload === "object") {
    return JSON.stringify(payload);
  }

  return "";
}

function toFiniteNumber(value) {
  return Number.isFinite(value) ? value : null;
}

function pickNumber(...candidates) {
  for (const value of candidates) {
    const n = toFiniteNumber(value);
    if (n !== null) {
      return n;
    }
  }
  return null;
}

function roundMetric(value) {
  const n = toFiniteNumber(value);
  return n === null ? null : Math.round(n * 10) / 10;
}

export function nowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

export function extractTokenUsage(payload) {
  const usage = payload?.usage ?? {};
  const promptTokens = pickNumber(usage.prompt_tokens, usage.input_tokens);
  const completionTokens = pickNumber(usage.completion_tokens, usage.output_tokens);
  const totalTokens =
    pickNumber(usage.total_tokens) ??
    (promptTokens !== null && completionTokens !== null ? promptTokens + completionTokens : null);

  return { promptTokens, completionTokens, totalTokens };
}

export function buildLlmMonitor({
  provider,
  endpoint,
  model,
  requestStartMs,
  responseStartMs,
  responseDoneMs,
  parseDoneMs,
  usage,
  responseId,
  httpStatus,
  eventCount,
  ttftKind = "headers",
}) {
  const ttftMs =
    toFiniteNumber(requestStartMs) !== null && toFiniteNumber(responseStartMs) !== null
      ? responseStartMs - requestStartMs
      : null;
  const latencyMs =
    toFiniteNumber(requestStartMs) !== null && toFiniteNumber(responseDoneMs) !== null
      ? responseDoneMs - requestStartMs
      : null;
  const parseMs =
    toFiniteNumber(responseDoneMs) !== null && toFiniteNumber(parseDoneMs) !== null
      ? parseDoneMs - responseDoneMs
      : null;
  const generationMs =
    toFiniteNumber(latencyMs) !== null && toFiniteNumber(ttftMs) !== null ? latencyMs - ttftMs : null;

  const promptTokens = toFiniteNumber(usage?.promptTokens);
  const completionTokens = toFiniteNumber(usage?.completionTokens);
  const totalTokens = toFiniteNumber(usage?.totalTokens);
  const tpotMs =
    completionTokens !== null && completionTokens > 1 && toFiniteNumber(generationMs) !== null
      ? generationMs / (completionTokens - 1)
      : null;
  const outputTps =
    completionTokens !== null && completionTokens > 0 && toFiniteNumber(generationMs) !== null && generationMs > 0
      ? completionTokens / (generationMs / 1000)
      : null;

  return {
    provider,
    endpoint,
    model,
    httpStatus: toFiniteNumber(httpStatus),
    responseId: typeof responseId === "string" ? responseId : "",
    ttftKind,
    ttftMs: roundMetric(ttftMs),
    latencyMs: roundMetric(latencyMs),
    generationMs: roundMetric(generationMs),
    parseMs: roundMetric(parseMs),
    tpotMs: roundMetric(tpotMs),
    outputTps: roundMetric(outputTps),
    promptTokens,
    completionTokens,
    totalTokens,
    eventCount: toFiniteNumber(eventCount),
  };
}

export function emitAiDebug(provider, phase, content) {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent("lifemaker-ai-debug", {
      detail: { provider, phase, content },
    })
  );
}

export function logAi(provider, label, payload) {
  if (!DEBUG_MODE) {
    return;
  }

  console.log(`[AI][${provider}] ${label}:`, payload);
}

export function extractJson(text) {
  const clean = stripCodeFence(text);
  const complete = findFirstCompleteJsonValue(clean);
  const candidate = complete || autoCloseJsonValue(clean);
  const normalized = cleanupTrailingCommas(candidate);
  if (!normalized || !/[\[{]/.test(normalized)) {
    throw new Error("model returned non-JSON content");
  }

  const attempts = [normalized, repairSetupStringFragments(normalized)];
  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt);
    } catch (_err) {
      // try next repair path
    }
  }

  try {
    return JSON.parse(normalized);
  } catch (err) {
    const message = err instanceof Error ? err.message : "parse error";
    throw new Error(`model JSON parse failed: ${message}`);
  }
}

function normalizeTag(rawTag) {
  if (typeof rawTag !== "string") {
    return "RISK";
  }

  const upper = rawTag.toUpperCase();
  const matched = upper.match(/MONEY|HAPPY|FACE|RISK/);
  return matched?.[0] || "RISK";
}

function inferMoneyDirection(eventType, label, setup = "") {
  const text = `${eventType} ${setup} ${label}`.toLowerCase();
  const mustSpendKeywords = [
    "发红包",
    "包红包",
    "借给",
    "借出",
    "请客",
    "买单",
    "花钱",
    "消费",
    "赔偿",
    "维修",
    "送礼",
    "付款",
    "垫付",
    "随礼",
  ];
  const shouldGainKeywords = [
    "收到",
    "收下",
    "赚",
    "进账",
    "回款",
    "到账",
    "奖金",
    "返现",
    "报销",
    "退款",
    "收入",
    "赢了",
  ];

  const spendPatterns = [/给(他|她|亲戚|晚辈|小孩|孩子|别人).{0,8}红包/, /发.{0,6}红包/];
  const gainPatterns = [/给(我|你).{0,8}红包/, /收(到|下).{0,8}红包/];

  if (spendPatterns.some((re) => re.test(text)) || mustSpendKeywords.some((kw) => text.includes(kw))) {
    return "negative";
  }

  if (gainPatterns.some((re) => re.test(text)) || shouldGainKeywords.some((kw) => text.includes(kw))) {
    return "positive";
  }

  return "any";
}

function fallbackChoiceLabel(type, tag) {
  if (type === "RED_PACKET") {
    if (tag === "FACE") {
      return "按辈分发红包";
    }
    if (tag === "MONEY") {
      return "发基础金额红包";
    }
    if (tag === "HAPPY") {
      return "笑着少发一点";
    }
    return "借口手机没电躲一波";
  }

  if (type === "BORROW_MONEY") {
    if (tag === "FACE") {
      return "借一点保全面子";
    }
    if (tag === "MONEY") {
      return "只借小额应急";
    }
    if (tag === "HAPPY") {
      return "委婉拒绝借款";
    }
    return "先拖到明天再说";
  }

  if (type === "ACCIDENT_COST") {
    if (tag === "FACE") {
      return "直接付款息事宁人";
    }
    if (tag === "MONEY") {
      return "先砍价再处理";
    }
    return "找亲戚一起分摊";
  }

  if (tag === "FACE") {
    return "顾全面子处理";
  }
  if (tag === "MONEY") {
    return "尽量少花钱处理";
  }
  if (tag === "HAPPY") {
    return "优先照顾情绪";
  }
  return "赌一把试试看";
}

function sanitizeSetupForType(type, setupText) {
  if (typeof setupText !== "string") {
    return "家里忽然来了新话题，所有人都看向你。";
  }

  const setup = setupText.trim();
  if (!setup) {
    return "家里忽然来了新话题，所有人都看向你。";
  }

  if (type === "RED_PACKET" && /(收到|收下|给我|给了我|给你).{0,8}红包/.test(setup)) {
    return "亲戚起哄让你给晚辈发红包，几个小孩已经排队给你拜年。";
  }

  if (type === "BORROW_MONEY" && /(借给你|还你钱|转给你|给你转账)/.test(setup)) {
    return "亲戚把你拉到一边，说手头周转不开，想找你借点钱过几天就还。";
  }

  if (type === "ACCIDENT_COST" && /(赔给你|报销到账|收到赔偿|退你钱)/.test(setup)) {
    return "家里突然有设备故障，需要马上维修付款，大家都在等你拿主意。";
  }

  return setup;
}

function sanitizeChoiceLabel(label, eventType, tag, setup) {
  const rule = EVENT_RULES[eventType] ?? EVENT_RULES.RELATIVE_QUESTION;
  const direction = inferMoneyDirection(eventType, label, setup);
  const onlyNegative = rule.money[1] <= 0;
  const onlyPositive = rule.money[0] >= 0;

  if (direction === "positive" && onlyNegative) {
    return fallbackChoiceLabel(eventType, tag);
  }

  if (direction === "negative" && onlyPositive) {
    return "当场收下这笔钱";
  }

  return label;
}

function normalizeChoice(rawChoice, eventType, setup) {
  const rawLabel = typeof rawChoice?.label === "string" ? rawChoice.label.trim() : "保持沉默";
  const tag = normalizeTag(rawChoice?.tag);
  const label = sanitizeChoiceLabel(rawLabel, eventType, tag, setup);
  const delta = rawChoice?.delta_hint ?? {};
  let money = Number.isFinite(delta.money) ? delta.money : 0;
  const happy = Number.isFinite(delta.happy) ? delta.happy : 0;
  const direction = inferMoneyDirection(eventType, label, setup);

  if (direction === "negative" && money > 0) {
    money = -Math.abs(money);
  }

  if (direction === "positive" && money < 0) {
    money = Math.abs(money);
  }

  return {
    label,
    tag,
    delta_hint: boundedDelta(eventType, Math.round(money), Math.round(happy)),
  };
}

export function normalizeEvent(rawEvent, idx, day) {
  const type = EVENT_TYPES.includes(rawEvent?.type) ? rawEvent.type : pick(EVENT_TYPES);
  const setup = sanitizeSetupForType(type, rawEvent?.setup);
  const rawChoices = Array.isArray(rawEvent?.choices) ? rawEvent.choices.slice(0, 3) : [];

  const choices = rawChoices
    .map((item) => normalizeChoice(item, type, setup))
    .filter((item) => item.label.length > 0);

  if (choices.length < 2) {
    choices.push(
      {
        label: "顺势应对",
        tag: "RISK",
        delta_hint: boundedDelta(type, 0, randInt(-2, 6)),
      },
      {
        label: "低调退场",
        tag: "MONEY",
        delta_hint: boundedDelta(type, 0, randInt(-4, 2)),
      }
    );
  }

  return {
    id: `${day}_${idx + 1}`,
    type,
    setup,
    choices: choices.slice(0, 3),
  };
}

export function normalizeEvents(raw, state) {
  function isEventShape(node) {
    return !!node && typeof node === "object" && (typeof node.type === "string" || Array.isArray(node.choices));
  }

  function findEvents(node, depth = 0) {
    if (depth > 6 || node == null) {
      return [];
    }

    if (Array.isArray(node?.events)) {
      return node.events;
    }

    if (isEventShape(node)) {
      return [node];
    }

    if (Array.isArray(node)) {
      const wrapped = node.find((item) => Array.isArray(item?.events));
      if (wrapped) {
        return wrapped.events;
      }

      const directEvents = node.filter((item) => isEventShape(item));
      if (directEvents.length > 0) {
        return directEvents;
      }

      for (const item of node) {
        const nested = findEvents(item, depth + 1);
        if (nested.length > 0) {
          return nested;
        }
      }
      return [];
    }

    if (typeof node === "object") {
      for (const value of Object.values(node)) {
        const nested = findEvents(value, depth + 1);
        if (nested.length > 0) {
          return nested;
        }
      }
    }

    return [];
  }

  const events = findEvents(raw).slice(0, 3);
  if (events.length === 0) {
    throw new Error("model returned empty events");
  }

  const normalized = events.map((event, idx) => normalizeEvent(event, idx, state.day));
  while (normalized.length < 3) {
    normalized.push(normalizeEvent({}, normalized.length, state.day));
  }
  return normalized.slice(0, 3);
}
