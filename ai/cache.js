import { clamp } from "../rules.js";
import { boundedDelta, normalizeEvent, randInt } from "./shared.js";

const EVENT_CACHE_KEY_PREFIX = "lifemaker-event-cache-";
const EVENT_CACHE_MAX = 100;
const STATE_MIDPOINT = { money: 25000, happy: 50 };
const STATE_HALF_RANGE = { money: 25000, happy: 50 };

function loadEventCache(providerId) {
  try {
    const raw = localStorage.getItem(EVENT_CACHE_KEY_PREFIX + providerId);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveEventCache(providerId, events) {
  const trimmed = events.slice(-EVENT_CACHE_MAX);
  try {
    localStorage.setItem(EVENT_CACHE_KEY_PREFIX + providerId, JSON.stringify(trimmed));
  } catch {
    // quota exceeded - ignore
  }
}

export function cacheEvents(providerId, newEvents) {
  const existing = loadEventCache(providerId);
  const stripped = newEvents.map(({ id, ...rest }) => rest);
  saveEventCache(providerId, [...existing, ...stripped]);
}

function adaptDelta(delta, type, state) {
  const mFactor = 1.0 - 0.5 * clamp((state.money - STATE_MIDPOINT.money) / STATE_HALF_RANGE.money, -1, 1);
  const hFactor = 1.0 - 0.5 * clamp((state.happy - STATE_MIDPOINT.happy) / STATE_HALF_RANGE.happy, -1, 1);
  const money = Math.round((delta.money ?? 0) * mFactor);
  const happy = Math.round((delta.happy ?? 0) * hFactor);
  return boundedDelta(type, money, happy);
}

export function getCachedFallbackEvents(state, providerId) {
  const cache = loadEventCache(providerId);
  if (cache.length < 3) {
    return null;
  }

  const indices = [];
  const pool = [...cache.keys()];
  for (let i = 0; i < 3; i += 1) {
    const pick = pool.splice(randInt(0, pool.length - 1), 1)[0];
    indices.push(pick);
  }

  return indices.map((idx, i) => {
    const raw = structuredClone(cache[idx]);
    if (Array.isArray(raw.choices)) {
      raw.choices = raw.choices.map((choice) => ({
        ...choice,
        delta_hint: adaptDelta(choice.delta_hint ?? {}, raw.type, state),
      }));
    }
    return normalizeEvent(raw, i, state.day);
  });
}
