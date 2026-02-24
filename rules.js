export const EVENT_RULES = {
  RELATIVE_QUESTION: { money: [-1000, 0], happy: [-15, 10] },
  RED_PACKET: { money: [-5000, -200], happy: [-10, 5] },
  CLASSMATE: { money: [-4000, 1000], happy: [-10, 10] },
  MAHJONG: { money: [-3000, 3000], happy: [-5, 8] },
  FAMILY_TASK: { money: [-1000, 0], happy: [-8, 8] },
  ACCIDENT_COST: { money: [-5000, -500], happy: [-10, 0] },
  SMALL_BLESSING: { money: [-500, 0], happy: [5, 20] },
  BORROW_MONEY: { money: [-8000, 0], happy: [-10, 5] },
};

export function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

export function clampByEventRule(type, delta) {
  const rule = EVENT_RULES[type];
  if (!rule) {
    return { money: 0, happy: 0 };
  }

  return {
    money: clamp(delta.money ?? 0, rule.money[0], rule.money[1]),
    happy: clamp(delta.happy ?? 0, rule.happy[0], rule.happy[1]),
  };
}

export function applyChoice(choice, type, state) {
  const clamped = clampByEventRule(type, choice.delta_hint ?? {});
  let moneyDelta = clamped.money;
  let happyDelta = clamped.happy;

  if (state.money < 3000 && moneyDelta < 0) {
    moneyDelta *= 1.3;
  }

  if (state.happy < 20 && happyDelta < 0) {
    happyDelta *= 1.5;
  }

  state.money += Math.round(moneyDelta);
  state.happy += Math.round(happyDelta);

  return {
    moneyDelta: Math.round(moneyDelta),
    happyDelta: Math.round(happyDelta),
  };
}

export function checkEnding(state) {
  if (state.happy <= 0) {
    return "breakdown";
  }

  if (state.money < 0) {
    return "debt";
  }

  if (state.day > 5) {
    if (state.happy >= 80 && state.money > 0) {
      return "hidden_social_king";
    }

    if (state.money > 0 && state.happy > 30) {
      return "survive";
    }

    return "calculate";
  }

  return null;
}
