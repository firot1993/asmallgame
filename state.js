const STORAGE_KEY = "lifemaker_save_v1";
const AI_CONFIG_KEY = "lifemaker_ai_config_v1";

const JOBS = {
  程序员: { money: 20000, happy: 60 },
  销售: { money: 50000, happy: 50 },
  自由职业: { money: 8000, happy: 70 },
};

export { JOBS };

export const gameState = {
  state: null,
  dailyEvents: [],
  eventIndex: 0,
  recentHistory: [],
  roundSourceLabel: "本地随机",
  roundSourceDetail: "",
  isInputLocked: false,
  sceneStep: 0,
};

export let aiConfig = { id: "local", endpoint: "", model: "", apiKey: "" };

export function resetGameState(job) {
  gameState.state = {
    job,
    money: JOBS[job].money,
    happy: JOBS[job].happy,
    day: 0,
  };
  gameState.dailyEvents = [];
  gameState.eventIndex = 0;
  gameState.recentHistory = [];
  gameState.sceneStep = 0;
  gameState.roundSourceLabel = "本地随机";
  gameState.roundSourceDetail = "";
  gameState.isInputLocked = false;
}

export function advanceDay() {
  gameState.state.day += 1;
}

export function applyDailyPayload(payload) {
  gameState.dailyEvents = payload.events;
  gameState.eventIndex = 0;
  gameState.roundSourceLabel = payload.providerLabel || "本地随机";
  gameState.roundSourceDetail =
    payload.meta?.fallback && payload.meta?.reason
      ? `降级: ${payload.meta.reason}`
      : payload.meta?.fallback
        ? "降级"
        : "";
}

export function advanceEvent() {
  gameState.eventIndex += 1;
}

export function addHistory(entry) {
  gameState.recentHistory.push(entry);
  gameState.recentHistory = gameState.recentHistory.slice(-20);
}

export function setInputLocked(locked) {
  gameState.isInputLocked = locked;
}

export function saveGame() {
  const payload = {
    state: gameState.state,
    dailyEvents: gameState.dailyEvents,
    eventIndex: gameState.eventIndex,
    recentHistory: gameState.recentHistory,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return false;
    }

    const parsed = JSON.parse(raw);
    if (!parsed.state || !Array.isArray(parsed.dailyEvents)) {
      return false;
    }

    gameState.state = parsed.state;
    gameState.dailyEvents = parsed.dailyEvents;
    gameState.eventIndex = parsed.eventIndex ?? 0;
    gameState.recentHistory = Array.isArray(parsed.recentHistory) ? parsed.recentHistory : [];
    return true;
  } catch (_err) {
    return false;
  }
}

export function clearSave() {
  localStorage.removeItem(STORAGE_KEY);
}

export function saveAiConfig() {
  localStorage.setItem(AI_CONFIG_KEY, JSON.stringify(aiConfig));
}

export function loadAiConfig() {
  try {
    const raw = localStorage.getItem(AI_CONFIG_KEY);
    if (!raw) {
      return;
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return;
    }

    aiConfig = {
      id: parsed.id || "local",
      endpoint: parsed.endpoint || "",
      model: parsed.model || "",
      apiKey: parsed.apiKey || "",
    };
  } catch (_err) {
    aiConfig = { id: "local", endpoint: "", model: "", apiKey: "" };
  }
}
