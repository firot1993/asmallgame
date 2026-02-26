const AI_SELECTION_LOG_KEY = "lifemaker_ai_selection_logs_v1";
const AI_HTTP_ERROR_LOG_KEY = "lifemaker_ai_http_error_logs_v1";
const LLM_TOKEN_STATS_KEY = "lifemaker_llm_token_stats_v1";
const LEGACY_AI_LOG_KEY = "lifemaker_ai_logs_v1";
const AI_LOG_MAX = 200;
const STATS_VERSION = 2;

function loadLogsByKey(key) {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLogsByKey(key, logs) {
  try {
    localStorage.setItem(key, JSON.stringify(logs.slice(-AI_LOG_MAX)));
  } catch {
    // Ignore quota errors.
  }
}

function normalizeTokenStats(raw) {
  const base = raw && typeof raw === "object" ? raw : {};
  const updatedAt = typeof base.updatedAt === "string" ? base.updatedAt : "";
  const normalized = {
    version: STATS_VERSION,
    byKey: {},
    updatedAt,
  };

  const rawByKey = base.byKey;
  if (rawByKey && typeof rawByKey === "object") {
    Object.entries(rawByKey).forEach(([key, bucket]) => {
      const provider =
        typeof bucket?.provider === "string" && bucket.provider.trim() ? bucket.provider : "unknown";
      const model = typeof bucket?.model === "string" ? bucket.model : "";
      normalized.byKey[key] = {
        provider,
        model,
        count: Number.isFinite(bucket?.count) ? bucket.count : 0,
        sumPromptTokens: Number.isFinite(bucket?.sumPromptTokens) ? bucket.sumPromptTokens : 0,
        sumCompletionTokens: Number.isFinite(bucket?.sumCompletionTokens) ? bucket.sumCompletionTokens : 0,
        sumTotalTokens: Number.isFinite(bucket?.sumTotalTokens) ? bucket.sumTotalTokens : 0,
        updatedAt: typeof bucket?.updatedAt === "string" ? bucket.updatedAt : "",
      };
    });
    return normalized;
  }

  // Backward-compat: old schema had a single global counter.
  if (Number.isFinite(base.count) && base.count > 0) {
    normalized.byKey["all::all"] = {
      provider: "all",
      model: "all",
      count: base.count,
      sumPromptTokens: Number.isFinite(base.sumPromptTokens) ? base.sumPromptTokens : 0,
      sumCompletionTokens: Number.isFinite(base.sumCompletionTokens) ? base.sumCompletionTokens : 0,
      sumTotalTokens: Number.isFinite(base.sumTotalTokens) ? base.sumTotalTokens : 0,
      updatedAt,
    };
  }

  return normalized;
}

function loadTokenStats() {
  try {
    const raw = localStorage.getItem(LLM_TOKEN_STATS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return normalizeTokenStats(parsed);
  } catch {
    return normalizeTokenStats(null);
  }
}

function saveTokenStats(stats) {
  try {
    localStorage.setItem(LLM_TOKEN_STATS_KEY, JSON.stringify(stats));
  } catch {
    // Ignore quota errors.
  }
}

function metricBucketKey(provider, model) {
  const safeProvider = typeof provider === "string" && provider.trim() ? provider.trim() : "unknown";
  const safeModel = typeof model === "string" ? model.trim() : "";
  return `${safeProvider}::${safeModel}`;
}

function upsertBucket(stats, provider, model) {
  const key = metricBucketKey(provider, model);
  if (!stats.byKey[key]) {
    stats.byKey[key] = {
      provider: typeof provider === "string" && provider.trim() ? provider.trim() : "unknown",
      model: typeof model === "string" ? model.trim() : "",
      count: 0,
      sumPromptTokens: 0,
      sumCompletionTokens: 0,
      sumTotalTokens: 0,
      updatedAt: "",
    };
  }
  return stats.byKey[key];
}

function addTokenStatsFromMonitor(monitor) {
  if (!monitor || typeof monitor !== "object") {
    return;
  }

  const provider = typeof monitor.provider === "string" && monitor.provider.trim() ? monitor.provider.trim() : "unknown";
  const model = typeof monitor.model === "string" ? monitor.model.trim() : "";
  const promptTokens = Number.isFinite(monitor.promptTokens) ? monitor.promptTokens : null;
  const completionTokens = Number.isFinite(monitor.completionTokens) ? monitor.completionTokens : null;
  const totalTokens = Number.isFinite(monitor.totalTokens) ? monitor.totalTokens : null;
  if (totalTokens === null) {
    return;
  }

  const stats = loadTokenStats();
  const bucket = upsertBucket(stats, provider, model);
  bucket.count += 1;
  bucket.sumPromptTokens += promptTokens ?? 0;
  bucket.sumCompletionTokens += completionTokens ?? 0;
  bucket.sumTotalTokens += totalTokens;
  bucket.updatedAt = new Date().toISOString();
  stats.updatedAt = new Date().toISOString();
  saveTokenStats(stats);
}

function ensureTokenStatsFromLogsIfNeeded() {
  const current = loadTokenStats();
  const hasAny = Object.values(current.byKey).some((bucket) => bucket.count > 0);
  if (hasAny) {
    return;
  }

  const logs = loadLogsByKey(AI_SELECTION_LOG_KEY);
  if (!Array.isArray(logs) || logs.length === 0) {
    return;
  }

  const rebuilt = {
    version: STATS_VERSION,
    byKey: {},
    updatedAt: "",
  };

  logs.forEach((item) => {
    const monitor = item?.monitor;
    const provider = typeof monitor?.provider === "string" && monitor.provider.trim() ? monitor.provider.trim() : "unknown";
    const model = typeof monitor?.model === "string" ? monitor.model.trim() : "";
    const promptTokens = Number.isFinite(monitor?.promptTokens) ? monitor.promptTokens : null;
    const completionTokens = Number.isFinite(monitor?.completionTokens) ? monitor.completionTokens : null;
    const totalTokens = Number.isFinite(monitor?.totalTokens) ? monitor.totalTokens : null;
    if (totalTokens === null) {
      return;
    }
    const bucket = upsertBucket(rebuilt, provider, model);
    bucket.count += 1;
    bucket.sumPromptTokens += promptTokens ?? 0;
    bucket.sumCompletionTokens += completionTokens ?? 0;
    bucket.sumTotalTokens += totalTokens;
  });

  const hasRebuilt = Object.values(rebuilt.byKey).some((bucket) => bucket.count > 0);
  if (hasRebuilt) {
    const nowIso = new Date().toISOString();
    rebuilt.updatedAt = nowIso;
    Object.values(rebuilt.byKey).forEach((bucket) => {
      bucket.updatedAt = nowIso;
    });
    saveTokenStats(rebuilt);
  }
}

function migrateLegacyLogsIfNeeded() {
  const selectionLogs = loadLogsByKey(AI_SELECTION_LOG_KEY);
  if (selectionLogs.length > 0) {
    return;
  }

  const legacyLogs = loadLogsByKey(LEGACY_AI_LOG_KEY);
  if (legacyLogs.length === 0) {
    return;
  }

  saveLogsByKey(AI_SELECTION_LOG_KEY, legacyLogs);
}

function appendLogByKey(key, entry) {
  const logs = loadLogsByKey(key);
  logs.push(entry);
  saveLogsByKey(key, logs);
}

export function appendAiSelectionLog(entry) {
  migrateLegacyLogsIfNeeded();
  appendLogByKey(AI_SELECTION_LOG_KEY, entry);
  addTokenStatsFromMonitor(entry?.monitor);
}

export function getAiSelectionLogs() {
  migrateLegacyLogsIfNeeded();
  ensureTokenStatsFromLogsIfNeeded();
  return loadLogsByKey(AI_SELECTION_LOG_KEY);
}

export function appendAiHttpErrorLog(entry) {
  appendLogByKey(AI_HTTP_ERROR_LOG_KEY, entry);
}

export function getAiHttpErrorLogs() {
  return loadLogsByKey(AI_HTTP_ERROR_LOG_KEY);
}

export function getLlmTokenAverages() {
  ensureTokenStatsFromLogsIfNeeded();
  const stats = loadTokenStats();
  const avg = (sum, count) => (count > 0 ? Math.round((sum / count) * 10) / 10 : null);
  const entries = Object.values(stats.byKey);
  const total = entries.reduce(
    (acc, bucket) => {
      acc.count += bucket.count;
      acc.sumPromptTokens += bucket.sumPromptTokens;
      acc.sumCompletionTokens += bucket.sumCompletionTokens;
      acc.sumTotalTokens += bucket.sumTotalTokens;
      return acc;
    },
    { count: 0, sumPromptTokens: 0, sumCompletionTokens: 0, sumTotalTokens: 0 }
  );

  return {
    sampleCount: total.count,
    avgPromptTokens: avg(total.sumPromptTokens, total.count),
    avgCompletionTokens: avg(total.sumCompletionTokens, total.count),
    avgTotalTokens: avg(total.sumTotalTokens, total.count),
    provider: "all",
    model: "all",
    label: "全部模型",
    updatedAt: stats.updatedAt,
  };
}

export function getLlmTokenAveragesByProviderModel(provider, model) {
  ensureTokenStatsFromLogsIfNeeded();
  const stats = loadTokenStats();
  const providerKey = typeof provider === "string" && provider.trim() ? provider.trim() : "";
  const modelKey = typeof model === "string" ? model.trim() : "";
  const avg = (sum, count) => (count > 0 ? Math.round((sum / count) * 10) / 10 : null);

  if (providerKey && modelKey) {
    const key = metricBucketKey(providerKey, modelKey);
    const bucket = stats.byKey[key];
    const count = bucket?.count ?? 0;
    return {
      sampleCount: count,
      avgPromptTokens: avg(bucket?.sumPromptTokens ?? 0, count),
      avgCompletionTokens: avg(bucket?.sumCompletionTokens ?? 0, count),
      avgTotalTokens: avg(bucket?.sumTotalTokens ?? 0, count),
      provider: providerKey,
      model: modelKey,
      label: `${providerKey} / ${modelKey}`,
      updatedAt: bucket?.updatedAt || stats.updatedAt,
    };
  }

  if (providerKey) {
    const matched = Object.values(stats.byKey).filter((bucket) => bucket.provider === providerKey);
    const merged = matched.reduce(
      (acc, bucket) => {
        acc.count += bucket.count;
        acc.sumPromptTokens += bucket.sumPromptTokens;
        acc.sumCompletionTokens += bucket.sumCompletionTokens;
        acc.sumTotalTokens += bucket.sumTotalTokens;
        return acc;
      },
      { count: 0, sumPromptTokens: 0, sumCompletionTokens: 0, sumTotalTokens: 0 }
    );
    return {
      sampleCount: merged.count,
      avgPromptTokens: avg(merged.sumPromptTokens, merged.count),
      avgCompletionTokens: avg(merged.sumCompletionTokens, merged.count),
      avgTotalTokens: avg(merged.sumTotalTokens, merged.count),
      provider: providerKey,
      model: "",
      label: `${providerKey} / 全部模型`,
      updatedAt: stats.updatedAt,
    };
  }

  return getLlmTokenAverages();
}

export function clearAllLocalStorage() {
  localStorage.clear();
}

export function clearAiDebugStorage() {
  localStorage.removeItem(AI_SELECTION_LOG_KEY);
  localStorage.removeItem(AI_HTTP_ERROR_LOG_KEY);
  localStorage.removeItem(LLM_TOKEN_STATS_KEY);
  localStorage.removeItem(LEGACY_AI_LOG_KEY);
}
