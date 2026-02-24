import { EVENT_RULES, clamp } from "./rules.js";

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

const RELATIVE_SETUPS = [
  "饭桌刚开动，二姨把筷子一放，笑着问你今年升职了没，整桌人突然安静得只剩下汤勺声。",
  "你刚端起饮料，大伯就转身对全家宣布要听你讲职业规划，连小孩都停下了动画片。",
  "亲戚群当场语音连线，三姑把手机怼到你脸前，让你给表弟讲讲怎么才算有出息。",
  "年夜饭第二轮还没上，舅舅突然点名让你分享收入心得，隔壁桌都投来好奇眼神。",
];

const MONEY_EVENT_SETUPS = {
  RED_PACKET: [
    "表姐把两个熊孩子推到你面前：‘你最会发红包了吧？’ 两个二维码已经整齐排队。",
    "你刚坐下，亲戚就起哄让你发个‘技术岗标准红包’，小孩们一边拜年一边亮付款码。",
  ],
  BORROW_MONEY: [
    "堂哥把你拉到阳台，先夸你成熟稳重，再低声说周转一下就还，眼神里写满期待。",
    "饭后散步时，同学突然说银行卡临时冻结，开口借钱到初八，语气诚恳得让人难拒绝。",
  ],
  ACCIDENT_COST: [
    "家里热水器突然报警，维修师傅看完报价后全家同时看向你，像在等财政部拍板。",
    "你倒车时蹭到亲戚家门口花坛，物业阿姨拿着赔偿单走来，空气瞬间凝固。",
  ],
};

const RHYTHM_EVENT_SETUPS = {
  MAHJONG: [
    "晚上被拉去打麻将，大家默认你会算牌，还夸你‘看脸就会赢’，你汗都要下来了。",
    "亲戚局缺一人，所有人一致同意你上桌，说你年轻脑子快，退路当场被封死。",
  ],
  SMALL_BLESSING: [
    "楼下小卖部老板认出你小时候常去，塞给你一袋零食，还夸你‘看着就有福气’。",
    "邻居阿姨送来刚出锅的糖年糕，说你小时候最捧场，顺手还给你留了最好那一块。",
  ],
  CLASSMATE: [
    "同学会临时组局，老同桌一见面就问你现在混得怎么样，包厢里瞬间安静半秒。",
    "在商场偶遇高中班长，他热情邀请你加入临时饭局，话题已经默认会聊近况。",
  ],
};

const EVENT_TYPES = Object.keys(EVENT_RULES);
const DEBUG_MODE = new URLSearchParams(window.location.search).get("debug") === "1";

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(arr) {
  return arr[randInt(0, arr.length - 1)];
}

function boundedDelta(type, money, happy) {
  const rule = EVENT_RULES[type] ?? EVENT_RULES.RELATIVE_QUESTION;
  return {
    money: clamp(money, rule.money[0], rule.money[1]),
    happy: clamp(happy, rule.happy[0], rule.happy[1]),
  };
}

function buildRelativeQuestion(day) {
  const safeHappy = randInt(1, 8);
  const awkwardHappy = -randInt(4, 12);

  return {
    id: `${day}_1`,
    type: "RELATIVE_QUESTION",
    setup: pick(RELATIVE_SETUPS),
    choices: [
      {
        label: "硬聊职业前景",
        delta_hint: boundedDelta("RELATIVE_QUESTION", 0, safeHappy),
        tag: "FACE",
      },
      {
        label: "打哈哈糊弄",
        delta_hint: boundedDelta("RELATIVE_QUESTION", 0, awkwardHappy),
        tag: "HAPPY",
      },
      {
        label: "反问转移火力",
        delta_hint: boundedDelta("RELATIVE_QUESTION", 0, randInt(-2, 6)),
        tag: "RISK",
      },
    ],
  };
}

function buildMoneyEvent(day, type) {
  const setup = pick(MONEY_EVENT_SETUPS[type]);

  if (type === "RED_PACKET") {
    return {
      id: `${day}_2`,
      type,
      setup,
      choices: [
        {
          label: "大方发高配",
          delta_hint: boundedDelta(type, -randInt(1600, 3600), randInt(-2, 5)),
          tag: "FACE",
        },
        {
          label: "基础红包走起",
          delta_hint: boundedDelta(type, -randInt(200, 800), -randInt(2, 8)),
          tag: "MONEY",
        },
      ],
    };
  }

  if (type === "BORROW_MONEY") {
    return {
      id: `${day}_2`,
      type,
      setup,
      choices: [
        {
          label: "借足对方面子",
          delta_hint: boundedDelta(type, -randInt(2500, 6500), randInt(-3, 5)),
          tag: "FACE",
        },
        {
          label: "只借小额应急",
          delta_hint: boundedDelta(type, -randInt(300, 1500), -randInt(1, 6)),
          tag: "MONEY",
        },
        {
          label: "委婉拒绝借款",
          delta_hint: boundedDelta(type, 0, -randInt(3, 10)),
          tag: "HAPPY",
        },
      ],
    };
  }

  return {
    id: `${day}_2`,
    type,
    setup,
    choices: [
      {
        label: "咬牙全额维修",
        delta_hint: boundedDelta(type, -randInt(1800, 4500), randInt(-2, 2)),
        tag: "FACE",
      },
      {
        label: "讨价后再处理",
        delta_hint: boundedDelta(type, -randInt(500, 1600), -randInt(2, 8)),
        tag: "MONEY",
      },
    ],
  };
}

function buildRhythmEvent(day, type) {
  const setup = pick(RHYTHM_EVENT_SETUPS[type]);

  if (type === "MAHJONG") {
    return {
      id: `${day}_3`,
      type,
      setup,
      choices: [
        {
          label: "上桌搏一把",
          delta_hint: boundedDelta(type, randInt(-2500, 1800), randInt(0, 8)),
          tag: "RISK",
        },
        {
          label: "找借口开溜",
          delta_hint: boundedDelta(type, 0, randInt(-2, 6)),
          tag: "HAPPY",
        },
      ],
    };
  }

  if (type === "SMALL_BLESSING") {
    return {
      id: `${day}_3`,
      type,
      setup,
      choices: [
        {
          label: "热情回礼互动",
          delta_hint: boundedDelta(type, -randInt(120, 400), randInt(8, 18)),
          tag: "HAPPY",
        },
        {
          label: "简单道谢收下",
          delta_hint: boundedDelta(type, 0, randInt(5, 12)),
          tag: "MONEY",
        },
      ],
    };
  }

  return {
    id: `${day}_3`,
    type,
    setup,
    choices: [
      {
        label: "高调请客叙旧",
        delta_hint: boundedDelta(type, -randInt(800, 2800), randInt(1, 10)),
        tag: "FACE",
      },
      {
        label: "只喝茶不点菜",
        delta_hint: boundedDelta(type, -randInt(80, 500), -randInt(2, 8)),
        tag: "MONEY",
      },
      {
        label: "寒暄两句先撤",
        delta_hint: boundedDelta(type, 0, randInt(-3, 4)),
        tag: "RISK",
      },
    ],
  };
}

function localGenerateDailyEvents(state) {
  const moneyType = pick(["RED_PACKET", "BORROW_MONEY", "ACCIDENT_COST"]);
  const rhythmType = pick(["MAHJONG", "SMALL_BLESSING", "CLASSMATE"]);

  return {
    day: state.day,
    providerId: "local",
    providerLabel: "本地随机",
    events: [
      buildRelativeQuestion(state.day),
      buildMoneyEvent(state.day, moneyType),
      buildRhythmEvent(state.day, rhythmType),
    ],
  };
}

function buildPrompt(state, context = {}) {
  const history = Array.isArray(context.history) ? context.history.slice(-6) : [];
  const historyText =
    history.length > 0
      ? history
          .map(
            (item, idx) =>
              `${idx + 1}. [${item.type}] 选择:${item.choice} 金钱:${item.moneyDelta >= 0 ? "+" : ""}${item.moneyDelta} 快乐:${item.happyDelta >= 0 ? "+" : ""}${item.happyDelta}`
          )
          .join("\n")
      : "无";

  return [
    "你是一个春节生活模拟游戏的事件生成器。",
    "请只返回 JSON，不要包含 markdown。",
    "输出格式: {\"events\":[{\"type\":\"...\",\"setup\":\"...\",\"choices\":[{\"label\":\"...\",\"tag\":\"MONEY|HAPPY|FACE|RISK\",\"delta_hint\":{\"money\":number,\"happy\":number}}]}]}",
    "要求: 生成 3 个事件; 每个事件 2-3 个选项; 语气口语化中文。",
    `玩家状态: 职业=${state.job}, 金钱=${state.money}, 快乐=${state.happy}, 天数=${state.day}`,
    `可用事件类型: ${EVENT_TYPES.join(",")}`,
    `最近回合记录:\n${historyText}`,
  ].join("\n");
}

function stripCodeFence(text) {
  return text.replace(/```json/gi, "").replace(/```/g, "").trim();
}

function findFirstCompleteJsonObject(text) {
  let inString = false;
  let escaped = false;
  let start = -1;
  let depth = 0;

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

    if (ch === "{") {
      if (start < 0) {
        start = i;
      }
      depth += 1;
      continue;
    }

    if (ch === "}") {
      if (depth > 0) {
        depth -= 1;
      }

      if (start >= 0 && depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  return "";
}

function cleanupTrailingCommas(text) {
  return text.replace(/,\s*([}\]])/g, "$1");
}

function autoCloseJsonObject(text) {
  const start = text.indexOf("{");
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

  return raw + stack.reverse().join("");
}

function toTextContent(payload) {
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

function emitAiDebug(provider, phase, content) {
  if (!DEBUG_MODE) {
    return;
  }

  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent("lifemaker-ai-debug", {
      detail: { provider, phase, content },
    })
  );
}

function logAi(provider, label, payload) {
  if (!DEBUG_MODE) {
    return;
  }

  console.log(`[AI][${provider}] ${label}:`, payload);
}

function extractJson(text) {
  const clean = stripCodeFence(text);
  const complete = findFirstCompleteJsonObject(clean);
  const candidate = complete || autoCloseJsonObject(clean);
  const normalized = cleanupTrailingCommas(candidate);
  if (!normalized || normalized.indexOf("{") < 0) {
    throw new Error("model returned non-JSON content");
  }

  try {
    return JSON.parse(normalized);
  } catch (err) {
    const message = err instanceof Error ? err.message : "parse error";
    throw new Error(`model JSON parse failed: ${message}`);
  }
}

function inferMoneyDirection(eventType, label) {
  const text = `${eventType} ${label}`.toLowerCase();
  const mustSpend = [
    "发红包",
    "借钱",
    "请客",
    "花钱",
    "消费",
    "赔",
    "维修",
    "送礼",
    "付款",
    "全额",
  ];
  const shouldGain = [
    "收到",
    "赚",
    "进账",
    "回款",
    "奖金",
    "省下",
    "存下",
    "返现",
    "收入",
    "红包到手",
  ];

  if (mustSpend.some((kw) => text.includes(kw))) {
    return "negative";
  }

  if (shouldGain.some((kw) => text.includes(kw))) {
    return "positive";
  }

  return "any";
}

function normalizeChoice(rawChoice, eventType) {
  const label = typeof rawChoice?.label === "string" ? rawChoice.label.trim() : "保持沉默";
  const tag = typeof rawChoice?.tag === "string" ? rawChoice.tag.trim().toUpperCase() : "RISK";
  const delta = rawChoice?.delta_hint ?? {};
  let money = Number.isFinite(delta.money) ? delta.money : 0;
  const happy = Number.isFinite(delta.happy) ? delta.happy : 0;
  const direction = inferMoneyDirection(eventType, label);

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

function normalizeEvent(rawEvent, idx, day) {
  const type = EVENT_TYPES.includes(rawEvent?.type) ? rawEvent.type : pick(EVENT_TYPES);
  const setup = typeof rawEvent?.setup === "string" ? rawEvent.setup.trim() : "家里忽然来了新话题，所有人都看向你。";
  const rawChoices = Array.isArray(rawEvent?.choices) ? rawEvent.choices.slice(0, 3) : [];

  const choices = rawChoices.map((item) => normalizeChoice(item, type)).filter((item) => item.label.length > 0);

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
      },
    );
  }

  return {
    id: `${day}_${idx + 1}`,
    type,
    setup,
    choices: choices.slice(0, 3),
  };
}

function normalizeEvents(raw, state) {
  const events = Array.isArray(raw?.events) ? raw.events.slice(0, 3) : [];
  if (events.length === 0) {
    throw new Error("model returned empty events");
  }

  return events.map((event, idx) => normalizeEvent(event, idx, state.day));
}

async function generateWithOpenAICompatible(state, provider, context) {
  const endpoint = provider.endpoint || "https://api.openai.com/v1/chat/completions";
  const model = provider.model || "gpt-4o-mini";
  const prompt = buildPrompt(state, context);
  emitAiDebug("openai-compatible", "input", {
    endpoint,
    model,
    prompt,
    state: { job: state.job, money: state.money, happy: state.happy, day: state.day },
  });

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.9,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You output only JSON." },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`openai-compatible request failed: ${res.status}`);
  }

  const json = await res.json();
  logAi("openai-compatible", "raw response", json);
  emitAiDebug("openai-compatible", "raw", json);
  const content = toTextContent(json?.choices?.[0]?.message?.content);
  if (!content) {
    throw new Error("openai-compatible response missing content");
  }
  emitAiDebug("openai-compatible", "content", content);

  const normalized = normalizeEvents(extractJson(content), state);
  logAi("openai-compatible", "normalized events", normalized);
  emitAiDebug("openai-compatible", "normalized", normalized);
  return normalized;
}

async function generateWithAnthropic(state, provider, context) {
  const endpoint = provider.endpoint || "https://api.anthropic.com/v1/messages";
  const model = provider.model || "claude-3-5-haiku-latest";
  const prompt = buildPrompt(state, context);
  emitAiDebug("anthropic", "input", {
    endpoint,
    model,
    prompt,
    state: { job: state.job, money: state.money, happy: state.happy, day: state.day },
  });

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": provider.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      temperature: 0.9,
      max_tokens: 1200,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    throw new Error(`anthropic request failed: ${res.status}`);
  }

  const json = await res.json();
  logAi("anthropic", "raw response", json);
  emitAiDebug("anthropic", "raw", json);
  const content = toTextContent(json?.content);
  if (!content) {
    throw new Error("anthropic response missing content");
  }
  emitAiDebug("anthropic", "content", content);

  const normalized = normalizeEvents(extractJson(content), state);
  logAi("anthropic", "normalized events", normalized);
  emitAiDebug("anthropic", "normalized", normalized);
  return normalized;
}

async function generateWithMiniMax(state, provider, context) {
  const endpoint = provider.endpoint || "https://api.minimaxi.com/v1/text/chatcompletion_v2";
  const model = provider.model || "M2-her";
  const prompt = buildPrompt(state, context);
  emitAiDebug("minimax", "input", {
    endpoint,
    model,
    prompt,
    state: { job: state.job, money: state.money, happy: state.happy, day: state.day },
  });

  async function requestMiniMax(userContent, systemContent) {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: 1800,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            name: "MiniMax AI",
            content: systemContent,
          },
          {
            role: "user",
            name: "用户",
            content: userContent,
          },
        ],
      }),
    });

    if (!res.ok) {
      throw new Error(`minimax request failed: ${res.status}`);
    }

    const json = await res.json();
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

    return content;
  }

  const primaryContent = await requestMiniMax(
    prompt,
    "你只输出一个完整 JSON 对象，不要任何额外文字。JSON 必须可被 JSON.parse 解析。"
  );

  try {
    const normalized = normalizeEvents(extractJson(primaryContent), state);
    logAi("minimax", "normalized events", normalized);
    emitAiDebug("minimax", "normalized", normalized);
    return normalized;
  } catch (primaryErr) {
    const message = primaryErr instanceof Error ? primaryErr.message : "parse error";
    if (DEBUG_MODE) {
      console.warn("[AI][minimax] primary parse failed, retrying with repair prompt:", message);
    }

    const repairedContent = await requestMiniMax(
      [
        "请把下面内容修复为严格 JSON，仅输出 JSON 对象。",
        "必须满足格式: {\"events\":[{\"type\":\"...\",\"setup\":\"...\",\"choices\":[{\"label\":\"...\",\"tag\":\"MONEY|HAPPY|FACE|RISK\",\"delta_hint\":{\"money\":number,\"happy\":number}}]}]}",
        "不要解释，不要 markdown。",
        "待修复内容如下:",
        primaryContent,
      ].join("\n"),
      "你是 JSON 修复器，只输出修复后的 JSON。"
    );

    const normalized = normalizeEvents(extractJson(repairedContent), state);
    logAi("minimax", "normalized events (repaired)", normalized);
    emitAiDebug("minimax", "normalized(repaired)", normalized);
    return normalized;
  }
}

export async function getDailyEvents(state, provider = { id: "local" }, context = {}) {
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

  try {
    if (!provider.apiKey) {
      throw new Error("missing api key");
    }

    const events =
      provider.id === "anthropic"
        ? await generateWithAnthropic(state, provider, context)
        : provider.id === "minimax"
          ? await generateWithMiniMax(state, provider, context)
          : await generateWithOpenAICompatible(state, provider, context);

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
    return {
      ...localGenerateDailyEvents(state),
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
