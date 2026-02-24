import { AI_PROVIDER_PRESETS } from "./ai.js";

const DAY_LABELS = ["除夕", "初一", "初二", "初三", "初五", "初七"];

const SCENE_POINTS = [
  { x: 10, y: 72 },
  { x: 28, y: 38 },
  { x: 46, y: 68 },
  { x: 62, y: 30 },
  { x: 78, y: 62 },
  { x: 90, y: 28 },
];

const DEBUG_MODE = new URLSearchParams(window.location.search).get("debug") === "1";

const el = {
  startPanel: document.getElementById("start-panel"),
  gamePanel: document.getElementById("game-panel"),
  endPanel: document.getElementById("end-panel"),
  statusJob: document.getElementById("status-job"),
  statusMoney: document.getElementById("status-money"),
  statusHappy: document.getElementById("status-happy"),
  statusDay: document.getElementById("status-day"),
  eventType: document.getElementById("event-type"),
  eventSetup: document.getElementById("event-setup"),
  choices: document.getElementById("choices"),
  hint: document.getElementById("hint"),
  endTitle: document.getElementById("end-title"),
  endBody: document.getElementById("end-body"),
  lastDelta: document.getElementById("last-delta"),
  continueBtn: document.getElementById("continue-btn"),
  restartBtn: document.getElementById("restart-btn"),
  restartBtn2: document.getElementById("restart-btn-2"),
  jobButtons: document.querySelectorAll("[data-job]"),
  providerSelect: document.getElementById("provider-select"),
  providerEndpoint: document.getElementById("provider-endpoint"),
  providerModel: document.getElementById("provider-model"),
  providerApiKey: document.getElementById("provider-api-key"),
  saveProviderBtn: document.getElementById("save-provider-btn"),
  providerNote: document.getElementById("provider-note"),
  modelStatus: document.getElementById("model-status"),
  modelStatusTitle: document.getElementById("model-status-title"),
  modelStatusText: document.getElementById("model-status-text"),
  scene: document.getElementById("scene"),
  sceneCaption: document.getElementById("scene-caption"),
  monitorMoney: document.getElementById("monitor-money"),
  monitorHappy: document.getElementById("monitor-happy"),
  monitorPressure: document.getElementById("monitor-pressure"),
  monitorMoneyFill: document.getElementById("monitor-money-fill"),
  monitorHappyFill: document.getElementById("monitor-happy-fill"),
  monitorPressureFill: document.getElementById("monitor-pressure-fill"),
};

let actor = null;
let sceneTimer = null;
let debugPanelEl = null;
let debugNote = "";
let lastModelRequestDebug = "-";
let lastModelResponseDebug = "-";

export function dayLabel(day) {
  return DAY_LABELS[day] ?? `第${day + 1}天`;
}

function providerLabelById(id) {
  return AI_PROVIDER_PRESETS.find((item) => item.id === id)?.label || id || "本地随机";
}

export function setModelStatus(kind, text) {
  if (!el.modelStatus) {
    return;
  }

  el.modelStatus.className = `model-status ${kind}`;
  el.modelStatusTitle.textContent = "模型状态";
  el.modelStatusText.textContent = text;
}

export function refreshIdleModelStatus(aiConfig) {
  if (aiConfig.id === "local") {
    setModelStatus("neutral", "本地模式");
    return;
  }

  setModelStatus("neutral", `${providerLabelById(aiConfig.id)} 待连接`);
}

function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}

function ensureDebugPanel() {
  if (!DEBUG_MODE || debugPanelEl) {
    return;
  }

  debugPanelEl = document.createElement("aside");
  debugPanelEl.id = "debug-panel";
  debugPanelEl.className = "debug-panel";
  document.body.appendChild(debugPanelEl);
}

export function updateDebugPanel(note, debugData) {
  if (!DEBUG_MODE) {
    return;
  }

  ensureDebugPanel();
  if (!debugPanelEl) {
    return;
  }

  if (note) {
    debugNote = note;
  }

  const {
    aiConfig,
    state,
    eventIndex,
    dailyEventsLength,
    isInputLocked,
    roundSourceLabel,
    roundSourceDetail,
    cachedDays,
    queuedDays,
    generationEpoch,
  } = debugData || {};

  const cachedStr = cachedDays ? Array.from(cachedDays).sort((a, b) => a - b).join(",") : "";
  const queuedStr = queuedDays ? Array.from(queuedDays).sort((a, b) => a - b).join(",") : "";
  const stateDay = state ? state.day : "-";
  const stateMoney = state ? state.money : "-";
  const stateHappy = state ? state.happy : "-";
  const source = `${roundSourceLabel || "-"}${roundSourceDetail ? ` | ${roundSourceDetail}` : ""}`;
  const requestDebug =
    typeof lastModelRequestDebug === "string" && lastModelRequestDebug.length > 360
      ? `${lastModelRequestDebug.slice(0, 360)}...`
      : lastModelRequestDebug;
  const responseDebug =
    typeof lastModelResponseDebug === "string" && lastModelResponseDebug.length > 360
      ? `${lastModelResponseDebug.slice(0, 360)}...`
      : lastModelResponseDebug;

  debugPanelEl.textContent = [
    "DEBUG=1",
    `note: ${debugNote || "-"}`,
    `provider: ${aiConfig?.id || "-"}`,
    `state: day=${stateDay} money=${stateMoney} happy=${stateHappy}`,
    `eventIndex: ${eventIndex ?? "-"}/${dailyEventsLength ?? 0}`,
    `inputLocked: ${isInputLocked ?? "-"}`,
    `cacheDays: [${cachedStr}]`,
    `queuedDays: [${queuedStr}]`,
    `epoch: ${generationEpoch ?? "-"}`,
    `source: ${source}`,
    `modelRequest: ${requestDebug}`,
    `modelResp: ${responseDebug}`,
  ].join("\n");
}

export function setDebugModelRequest(line) {
  lastModelRequestDebug = line;
}

export function setDebugModelResponse(line) {
  lastModelResponseDebug = line;
}

export function summarizeDebugContent(content) {
  if (typeof content === "string") {
    return content;
  }

  if (!content || typeof content !== "object") {
    return String(content);
  }

  const keys = Object.keys(content).slice(0, 8);
  const parts = keys.map((key) => {
    const value = content[key];
    if (value === null) {
      return `${key}=null`;
    }
    if (Array.isArray(value)) {
      return `${key}=[${value.length}]`;
    }
    if (typeof value === "object") {
      return `${key}={...}`;
    }
    return `${key}=${String(value)}`;
  });

  return `{${parts.join(", ")}}`;
}

export function setGameInputLocked(locked) {
  el.restartBtn.disabled = locked;
  el.choices.querySelectorAll("button").forEach((button) => {
    button.disabled = locked;
  });
}

export function showRoundLoadingState(message = "正在生成下一轮事件...") {
  el.eventType.textContent = "载入中";
  el.eventSetup.textContent = message;
  el.hint.textContent = "请稍候";
  el.choices.innerHTML = "";
}

function renderMonitor(fillEl, ratio) {
  fillEl.style.width = `${Math.round(clamp01(ratio) * 100)}%`;
}

export function updateMonitoring(gs) {
  const state = gs.state;
  if (!state) {
    return;
  }

  const moneyRatio = clamp01((state.money + 5000) / 65000);
  const happyRatio = clamp01(state.happy / 100);
  const pressureScore = clamp01((1 - happyRatio) * 0.6 + (1 - moneyRatio) * 0.25 + (state.day / 6) * 0.15);

  el.monitorMoney.textContent = `¥${state.money}`;
  el.monitorHappy.textContent = `${state.happy}`;
  el.monitorPressure.textContent = `${Math.round(pressureScore * 100)}`;

  renderMonitor(el.monitorMoneyFill, moneyRatio);
  renderMonitor(el.monitorHappyFill, happyRatio);
  renderMonitor(el.monitorPressureFill, pressureScore);
}

export function updateStatus(gs) {
  const state = gs.state;
  el.statusJob.textContent = state.job;
  el.statusMoney.textContent = state.money;
  el.statusHappy.textContent = state.happy;
  el.statusDay.textContent = `${dayLabel(state.day)} (${state.day}/5)`;
  updateMonitoring(gs);
}

function ensureScene() {
  if (!el.scene || actor) {
    return;
  }

  SCENE_POINTS.forEach((point, idx) => {
    const dot = document.createElement("span");
    dot.className = "scene-node";
    dot.textContent = idx + 1;
    dot.style.left = `${point.x}%`;
    dot.style.top = `${point.y}%`;
    el.scene.appendChild(dot);
  });

  actor = document.createElement("div");
  actor.className = "walker";
  actor.innerHTML = "<b></b>";
  el.scene.appendChild(actor);
}

export function moveActor(gs) {
  const state = gs.state;
  if (!state || !actor) {
    return;
  }

  gs.sceneStep += 1;
  const base = (state.day * 2 + gs.eventIndex + gs.sceneStep) % SCENE_POINTS.length;
  const point = SCENE_POINTS[base];
  actor.style.left = `${point.x}%`;
  actor.style.top = `${point.y}%`;
  el.sceneCaption.textContent = `第 ${state.day + 1} 天 · 事件 ${gs.eventIndex + 1}/${gs.dailyEvents.length || 3}`;
}

export function startSceneAnimation(gs) {
  ensureScene();
  clearInterval(sceneTimer);
  moveActor(gs);
  sceneTimer = setInterval(() => moveActor(gs), 1800);
}

export function stopSceneAnimation() {
  clearInterval(sceneTimer);
  sceneTimer = null;
}

export function showPanel(name) {
  el.startPanel.hidden = name !== "start";
  el.gamePanel.hidden = name !== "game";
  el.endPanel.hidden = name !== "end";
}

export function renderEvent(gs, onChoicePick) {
  const evt = gs.dailyEvents[gs.eventIndex];
  if (!evt) {
    return;
  }

  updateStatus(gs);
  moveActor(gs);
  el.eventType.textContent = evt.type;
  el.eventSetup.textContent = evt.setup;
  el.choices.innerHTML = "";
  el.hint.textContent = `今日事件 ${gs.eventIndex + 1}/3 · ${gs.roundSourceLabel}${gs.roundSourceDetail ? ` · ${gs.roundSourceDetail}` : ""}`;

  evt.choices.forEach((choice) => {
    const button = document.createElement("button");
    button.className = "choice";
    button.type = "button";
    button.innerHTML = `<span>${choice.label}</span><small>${choice.tag}</small>`;
    button.addEventListener("click", () => onChoicePick(choice, evt.type));
    el.choices.appendChild(button);
  });
}

export function showEnding(ending, state) {
  const copy = endingCopy(ending, state);
  el.endTitle.textContent = copy.title;
  el.endBody.textContent = copy.body;
}

function endingCopy(ending, s) {
  if (ending === "breakdown") {
    return {
      title: "精神崩溃",
      body: "你微笑着吃完最后一顿饭，第二天买了最早的车票。你发誓明年不回来了。",
    };
  }

  if (ending === "debt") {
    return {
      title: "财政崩溃",
      body: "面子保住了，花呗没有。",
    };
  }

  if (ending === "hidden_social_king") {
    return {
      title: "隐藏结局: 社交王者",
      body: `你成功把春节过成了个人秀场。余额 ${s.money}，快乐 ${s.happy}，亲戚群都在转发表情包夸你。`,
    };
  }

  if (ending === "survive") {
    return {
      title: "存活结局",
      body: `你成功撑到初七。余额 ${s.money}，快乐 ${s.happy}，可以安心回血了。`,
    };
  }

  return {
    title: "春节总结",
    body: `你熬到了初七，但这趟回家像一场压力测试。余额 ${s.money}，快乐 ${s.happy}。`,
  };
}

export function showLastDelta(delta) {
  el.lastDelta.textContent = `本次变化: 金钱 ${delta.moneyDelta >= 0 ? "+" : ""}${delta.moneyDelta} / 快乐 ${delta.happyDelta >= 0 ? "+" : ""}${delta.happyDelta}`;
}

export function clearLastDelta() {
  el.lastDelta.textContent = "";
}

export function showContinueBtn(visible) {
  el.continueBtn.hidden = !visible;
}

export function initProviderSelect(presets, aiConfig, callbacks) {
  el.providerSelect.innerHTML = "";
  presets.forEach((preset) => {
    const option = document.createElement("option");
    option.value = preset.id;
    option.textContent = preset.label;
    el.providerSelect.appendChild(option);
  });

  updateProviderInputs(aiConfig);

  el.providerSelect.addEventListener("change", () => {
    const newConfig = readProviderInputs();
    callbacks.onChange(newConfig);
  });

  el.saveProviderBtn.addEventListener("click", () => {
    const newConfig = readProviderInputs();
    callbacks.onSave(newConfig);
  });
}

export function updateProviderInputs(aiConfig) {
  const preset = AI_PROVIDER_PRESETS.find((item) => item.id === aiConfig.id) || AI_PROVIDER_PRESETS[0];
  const isLocal = aiConfig.id === "local";

  el.providerSelect.value = aiConfig.id;
  el.providerEndpoint.value = aiConfig.endpoint || preset.defaultEndpoint;
  el.providerModel.value = aiConfig.model || preset.defaultModel;
  el.providerApiKey.value = aiConfig.apiKey;
  el.providerEndpoint.disabled = isLocal;
  el.providerModel.disabled = isLocal;
  el.providerApiKey.disabled = isLocal;
  el.providerNote.textContent = preset.note;
}

export function showProviderSavedNote(aiConfig) {
  const preset = AI_PROVIDER_PRESETS.find((item) => item.id === aiConfig.id) || AI_PROVIDER_PRESETS[0];
  el.providerNote.textContent = `${preset.note} 设置已保存。`;
}

function readProviderInputs() {
  return {
    id: el.providerSelect.value,
    endpoint: el.providerEndpoint.value.trim(),
    model: el.providerModel.value.trim(),
    apiKey: el.providerApiKey.value.trim(),
  };
}

export function onJobButtonClick(callback) {
  el.jobButtons.forEach((button) => {
    button.addEventListener("click", () => {
      callback(button.dataset.job);
    });
  });
}

export function onContinueClick(callback) {
  el.continueBtn.addEventListener("click", callback);
}

export function onRestartClick(callback) {
  el.restartBtn.addEventListener("click", callback);
}

export function onRestartClick2(callback) {
  el.restartBtn2.addEventListener("click", callback);
}

export { DEBUG_MODE };
