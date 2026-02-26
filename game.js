import { AI_PROVIDER_PRESETS, getDailyEvents } from "./ai.js";
import { applyChoice, checkEnding } from "./rules.js";
import {
  gameState,
  aiConfig,
  resetGameState,
  advanceDay,
  applyDailyPayload,
  advanceEvent,
  addHistory,
  setInputLocked,
  saveGame,
  loadGame,
  clearSave,
  saveAiConfig,
  loadAiConfig,
} from "./state.js";
import {
  getAiSelectionLogs,
  getAiHttpErrorLogs,
  getLlmTokenAveragesByProviderModel,
  clearAiDebugStorage,
  clearAllLocalStorage,
} from "./ai/log-store.js";
import * as render from "./render.js";

let dayEventCache = new Map();
let queuedDays = new Set();
let queuedDayPromises = new Map();
let generationQueue = Promise.resolve();
let generationEpoch = 0;
let generationAbort = new AbortController();

function debugData() {
  return {
    aiConfig,
    state: gameState.state,
    eventIndex: gameState.eventIndex,
    dailyEventsLength: gameState.dailyEvents.length,
    isInputLocked: gameState.isInputLocked,
    roundSourceLabel: gameState.roundSourceLabel,
    roundSourceDetail: gameState.roundSourceDetail,
    cachedDays: dayEventCache.keys(),
    queuedDays,
    generationEpoch,
  };
}

function updateDebug(note) {
  render.updateDebugPanel(note, debugData());
}

function setGameInputLocked(locked) {
  setInputLocked(locked);
  render.setGameInputLocked(locked);
  updateDebug("setGameInputLocked");
}

function showRoundLoadingState(message) {
  render.showRoundLoadingState(message);
  updateDebug(`loading:${message || "default"}`);
}

function clearQueuedGeneration() {
  generationEpoch += 1;
  generationAbort.abort();
  generationAbort = new AbortController();
  dayEventCache = new Map();
  queuedDays = new Set();
  queuedDayPromises = new Map();
  generationQueue = Promise.resolve();
  updateDebug("clearQueuedGeneration");
}

function enqueueDayGeneration(targetDay, sourceState, sourceHistory) {
  if (!sourceState || targetDay > 5 || targetDay < 0) {
    return;
  }

  if (dayEventCache.has(targetDay) || queuedDays.has(targetDay)) {
    return;
  }

  const epoch = generationEpoch;
  const requestState = {
    job: sourceState.job,
    money: sourceState.money,
    happy: sourceState.happy,
    day: targetDay,
  };
  const basedOnDay = sourceState.day;
  const requestHistory = Array.isArray(sourceHistory) ? sourceHistory.slice(-20) : [];
  const abortSignal = generationAbort.signal;

  queuedDays.add(targetDay);
  updateDebug(`enqueue day ${targetDay}`);
  const dayPromise = generationQueue
    .then(async () => {
      if (epoch !== generationEpoch) {
        return;
      }

      const payload = await getDailyEvents(requestState, aiConfig, { history: requestHistory }, { signal: abortSignal });
      if (epoch !== generationEpoch) {
        return;
      }

      dayEventCache.set(targetDay, { payload, basedOnDay });
      updateDebug(`cached day ${targetDay} from day ${basedOnDay}`);
    })
    .catch(() => {})
    .finally(() => {
      queuedDays.delete(targetDay);
      queuedDayPromises.delete(targetDay);
      updateDebug(`queue settled day ${targetDay}`);
    });
  queuedDayPromises.set(targetDay, dayPromise);
  generationQueue = dayPromise;
}

function scheduleFutureDays() {
  if (!gameState.state) {
    return;
  }

  const snapshotState = {
    job: gameState.state.job,
    money: gameState.state.money,
    happy: gameState.state.happy,
    day: gameState.state.day,
  };
  const snapshotHistory = gameState.recentHistory.slice(-20);

  const hasCurrentDayLoaded = gameState.dailyEvents.length > 0 && gameState.eventIndex < gameState.dailyEvents.length;
  if (!hasCurrentDayLoaded) {
    enqueueDayGeneration(gameState.state.day, snapshotState, snapshotHistory);
  }
  enqueueDayGeneration(gameState.state.day + 1, snapshotState, snapshotHistory);
  enqueueDayGeneration(gameState.state.day + 2, snapshotState, snapshotHistory);
  updateDebug(
    hasCurrentDayLoaded
      ? `schedule [${gameState.state.day + 1},${gameState.state.day + 2}] (skip current)`
      : `schedule [${gameState.state.day},${gameState.state.day + 1},${gameState.state.day + 2}]`
  );
}

async function resolveDayPayloadFromQueue(targetDay) {
  const cached = dayEventCache.get(targetDay);
  const canUseCached = cached && (targetDay < 2 || cached.basedOnDay <= targetDay - 2);
  if (canUseCached) {
    dayEventCache.delete(targetDay);
    updateDebug(`use cached day ${targetDay}`);
    return cached.payload;
  }

  if (queuedDays.has(targetDay)) {
    const targetPromise = queuedDayPromises.get(targetDay);
    if (targetPromise) {
      await targetPromise;
    }
    const afterQueue = dayEventCache.get(targetDay);
    const canUseAfterQueue =
      afterQueue && (targetDay < 2 || afterQueue.basedOnDay <= targetDay - 2);
    if (canUseAfterQueue) {
      dayEventCache.delete(targetDay);
      updateDebug(`use queued day ${targetDay}`);
      return afterQueue.payload;
    }
  }

  updateDebug(`fallback fetch day ${targetDay}`);
  return getDailyEvents(gameState.state, aiConfig, { history: gameState.recentHistory }, { signal: generationAbort.signal });
}

function handleDayPayload(payload) {
  applyDailyPayload(payload);

  if (payload.meta?.fallback) {
    render.setModelStatus("fallback", `降级本地: ${payload.meta.reason || "请求失败"}`);
  } else if ((payload.meta?.usedProvider || "local") === "local") {
    render.setModelStatus("neutral", "本地模式");
  } else {
    render.setModelStatus("connected", `${payload.providerLabel || "远程模型"} 已连接`);
  }

  saveGame();
  render.renderEvent(gameState, onPick);
  setGameInputLocked(false);
  scheduleFutureDays();
  updateDebug("applyDayPayload");
}

function providerLabelById(id) {
  return AI_PROVIDER_PRESETS.find((item) => item.id === id)?.label || id || "本地随机";
}

function ensureProviderProfiles() {
  if (!aiConfig.profiles || typeof aiConfig.profiles !== "object") {
    aiConfig.profiles = {};
  }
}

function providerDefaultsById(id) {
  const preset = AI_PROVIDER_PRESETS.find((item) => item.id === id);
  return {
    endpoint: preset?.defaultEndpoint || "",
    model: preset?.defaultModel || "",
    apiKey: "",
  };
}

function upsertProviderProfile(id, values) {
  if (!id) {
    return;
  }

  ensureProviderProfiles();
  aiConfig.profiles[id] = {
    endpoint: values.endpoint || "",
    model: values.model || "",
    apiKey: values.apiKey || "",
  };
}

function loadProviderProfile(id) {
  ensureProviderProfiles();
  return aiConfig.profiles[id] || providerDefaultsById(id);
}

async function startDay() {
  showRoundLoadingState();

  if (aiConfig.id === "local") {
    render.setModelStatus("neutral", "本地模式");
  } else {
    render.setModelStatus("connecting", `${providerLabelById(aiConfig.id)} 连接中...`);
  }

  const payload = await resolveDayPayloadFromQueue(gameState.state.day);
  handleDayPayload(payload);
  updateDebug("startDay fetched");
}

function finishGame(ending) {
  render.showEnding(ending, gameState.state);
  clearSave();
  render.showPanel("end");
  render.stopSceneAnimation();
}

async function onPick(choice, type) {
  if (gameState.isInputLocked) {
    return;
  }

  setGameInputLocked(true);
  updateDebug(`picked:${choice.label}`);
  const delta = applyChoice(choice, type, gameState.state);
  addHistory({
    day: gameState.state.day,
    type,
    choice: choice.label,
    moneyDelta: delta.moneyDelta,
    happyDelta: delta.happyDelta,
  });
  render.showLastDelta(delta);

  const instantEnding = checkEnding(gameState.state);
  if (instantEnding) {
    setGameInputLocked(false);
    finishGame(instantEnding);
    return;
  }

  advanceEvent();

  if (gameState.eventIndex < gameState.dailyEvents.length) {
    saveGame();
    render.renderEvent(gameState, onPick);
    setGameInputLocked(false);
    updateDebug("renderEvent");
    return;
  }

  advanceDay();
  const dayEnding = checkEnding(gameState.state);
  if (dayEnding) {
    clearQueuedGeneration();
    setGameInputLocked(false);
    finishGame(dayEnding);
    return;
  }

  showRoundLoadingState();
  if (aiConfig.id === "local") {
    render.setModelStatus("neutral", "本地模式");
  } else {
    render.setModelStatus("connecting", `${providerLabelById(aiConfig.id)} 队列取数中...`);
  }
  const nextPayload = await resolveDayPayloadFromQueue(gameState.state.day);
  handleDayPayload(nextPayload);
}

function newGame(job) {
  resetGameState(job);
  render.clearLastDelta();
  clearQueuedGeneration();
  setGameInputLocked(true);
  showRoundLoadingState("正在准备开局事件...");
  scheduleFutureDays();

  render.showPanel("game");
  render.startSceneAnimation(gameState);
  startDay();
}

function initStartPanel() {
  const hasSave = loadGame();
  if (hasSave && gameState.state && checkEnding(gameState.state) === null && gameState.dailyEvents.length > 0) {
    render.showContinueBtn(true);
  } else {
    render.showContinueBtn(false);
  }

  render.showPanel("start");
  render.stopSceneAnimation();
}

render.onJobButtonClick((job) => {
  newGame(job);
});

render.onContinueClick(() => {
  const canContinue = loadGame();
  if (!canContinue) {
    initStartPanel();
    return;
  }

  render.showPanel("game");
  render.startSceneAnimation(gameState);
  setGameInputLocked(false);
  render.renderEvent(gameState, onPick);
  scheduleFutureDays();
});

render.onRestartClick(() => {
  clearSave();
  clearQueuedGeneration();
  initStartPanel();
});

render.onRestartClick2(() => {
  clearSave();
  clearQueuedGeneration();
  initStartPanel();
});

render.onExportAiSelectionLogsClick(() => {
  const logs = getAiSelectionLogs();
  if (logs.length === 0) {
    render.showProviderNote("暂无 AI 生成日志可导出。");
    return;
  }

  render.exportAiSelectionLogs(logs);
  render.showProviderNote(`已导出 ${logs.length} 条生成日志。`);
});

render.onExportAiHttpErrorLogsClick(() => {
  const logs = getAiHttpErrorLogs();
  if (logs.length === 0) {
    render.showProviderNote("暂无 AI 请求错误日志可导出。");
    return;
  }

  render.exportAiHttpErrorLogs(logs);
  render.showProviderNote(`已导出 ${logs.length} 条请求错误日志。`);
});

render.onClearDebugInfoClick(() => {
  const confirmed = window.confirm("确定清空调试信息吗？这会删除 AI 生成日志、请求错误日志和 LLM token 统计。");
  if (!confirmed) {
    return;
  }

  clearAiDebugStorage();
  render.updateLlmMonitor(null, getLlmTokenAveragesByProviderModel(aiConfig.id, aiConfig.model));
  render.showProviderNote("调试信息已清空。");
});

render.onClearLocalStorageClick(() => {
  const confirmed = window.confirm("确定清空全部本地存储吗？这会删除存档、AI配置、缓存和日志。");
  if (!confirmed) {
    return;
  }

  clearAllLocalStorage();
  window.location.reload();
});

function handleProviderChange(newConfig) {
  const prevId = aiConfig.id;
  if (newConfig.id !== prevId) {
    // The onChange payload still contains the old provider fields. Keep them in-memory.
    upsertProviderProfile(prevId, {
      endpoint: newConfig.endpoint,
      model: newConfig.model,
      apiKey: newConfig.apiKey,
    });
    const next = loadProviderProfile(newConfig.id);
    aiConfig.id = newConfig.id;
    aiConfig.endpoint = next.endpoint;
    aiConfig.model = next.model;
    aiConfig.apiKey = next.apiKey;
  } else {
    Object.assign(aiConfig, newConfig);
    upsertProviderProfile(aiConfig.id, aiConfig);
  }
  render.updateProviderInputs(aiConfig);
  clearQueuedGeneration();
  render.refreshIdleModelStatus(aiConfig);
  render.updateLlmMonitor(null, getLlmTokenAveragesByProviderModel(aiConfig.id, aiConfig.model));
}

loadAiConfig();
render.initProviderSelect(AI_PROVIDER_PRESETS, aiConfig, {
  onChange: handleProviderChange,
  onSave: (newConfig) => {
    Object.assign(aiConfig, newConfig);
    upsertProviderProfile(aiConfig.id, aiConfig);
    saveAiConfig();
    render.updateProviderInputs(aiConfig);
    render.showProviderSavedNote(aiConfig);
    clearQueuedGeneration();
    render.refreshIdleModelStatus(aiConfig);
    render.updateLlmMonitor(null, getLlmTokenAveragesByProviderModel(aiConfig.id, aiConfig.model));
  },
});
render.refreshIdleModelStatus(aiConfig);
render.updateLlmMonitor(null, getLlmTokenAveragesByProviderModel(aiConfig.id, aiConfig.model));

window.addEventListener("lifemaker-ai-debug", (evt) => {
  const detail = evt?.detail ?? {};

  if (detail.phase === "metrics") {
    // Metrics are emitted before logs are persisted; defer average refresh one tick.
    render.updateLlmMonitor(
      detail.content,
      getLlmTokenAveragesByProviderModel(detail.content?.provider, detail.content?.model)
    );
    setTimeout(() => {
      render.updateLlmMonitor(
        detail.content,
        getLlmTokenAveragesByProviderModel(detail.content?.provider, detail.content?.model)
      );
    }, 0);
  }

  if (render.DEBUG_MODE) {
    const providerText = detail.provider ? `[${detail.provider}]` : "[ai]";
    const phaseText = detail.phase ? ` ${detail.phase}` : "";
    const target = detail.phase === "input" ? "request" : "response";
    const line = `${providerText}${phaseText} ${render.summarizeDebugContent(detail.content)}`;
    if (target === "request") {
      render.setDebugModelRequest(line);
    } else {
      render.setDebugModelResponse(line);
    }
    updateDebug("ai-debug");
  }
});
updateDebug("init");
initStartPanel();
