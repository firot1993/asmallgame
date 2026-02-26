import { EVENT_RULES } from "../rules.js";

const EVENT_TYPES = Object.keys(EVENT_RULES);
const TYPE_GUIDE = {
  RELATIVE_QUESTION: "亲戚盘问/比较，重点是社交压力，不要写成收到红包或赚钱场景",
  RED_PACKET: "你给别人发红包，money 应该 <= 0，不要写成你收红包",
  BORROW_MONEY: "别人向你借钱，money 应该 <= 0，不要写成别人借给你",
  ACCIDENT_COST: "突发维修/赔偿，你需要掏钱，money 应该 <= 0",
  MAHJONG: "打牌有输有赢，money 可正可负",
  SMALL_BLESSING: "小确幸，快乐应偏正，money 通常不大额变化",
  CLASSMATE: "同学局开销与社交并存，money 可正可负",
  FAMILY_TASK: "家庭跑腿/帮忙，money 常为 0 或小额支出",
};

function formatTypeRules() {
  return EVENT_TYPES.map((type) => {
    const rule = EVENT_RULES[type];
    const guide = TYPE_GUIDE[type] || "";
    return `${type}: money[${rule.money[0]},${rule.money[1]}], happy[${rule.happy[0]},${rule.happy[1]}]，${guide}`;
  }).join("\n");
}

export function buildPrompt(state, context = {}) {
  const history = Array.isArray(context.history) ? context.history.slice(-6) : [];
  const historyText =
    history.length > 0
      ? history
          .map(
            (item, idx) =>
              `${idx + 1}.[${item.type}]${item.choice} ¥${item.moneyDelta >= 0 ? "+" : ""}${item.moneyDelta} ☺${item.happyDelta >= 0 ? "+" : ""}${item.happyDelta}`
          )
          .join("; ")
      : "无";

  return [
    "你是《回家过年模拟器》事件编剧。只返回一个可 JSON.parse 的 JSON 对象，不要 markdown、解释、注释。",
    "玩家视角固定为“你”。money>0 表示你拿到钱；money<0 表示你掏钱/借出/赔付。必须让文字语义与数值方向一致。",
    "输出格式:",
    "{\"events\":[{\"type\":\"...\",\"setup\":\"...\",\"choices\":[{\"label\":\"...\",\"tag\":\"MONEY|HAPPY|FACE|RISK\",\"delta_hint\":{\"money\":N,\"happy\":N}}]}]}",
    "硬性约束:",
    "1) 恰好 3 个事件；每个事件 2-3 个选项；只用口语中文。",
    "2) setup 为 1-2 句具体场景；choice.label 为短句动词短语。",
    "3) tag 只能是 MONEY|HAPPY|FACE|RISK。",
    "4) 所有 delta_hint 必须符合对应事件类型的数值区间。",
    "事件类型与区间:",
    formatTypeRules(),
    "语义一致性检查(输出前自检):",
    "A) 文本出现“收到红包/被转账/到账/回款/报销/退款/赢了” => money 不能为负。",
    "B) 文本出现“发红包/借给/请客/买单/赔偿/维修/垫付” => money 不能为正。",
    "C) RED_PACKET 只能写“你给红包”，禁止写“别人给你红包”。",
    "D) BORROW_MONEY 只能写“别人向你借钱”，禁止写“别人借给你钱”。",
    "如果语义和数值冲突，优先改写文本使其和数值区间一致，不要硬凑。",
    `当前状态: 职业=${state.job}, money=${state.money}, happy=${state.happy}, day=${state.day}`,
    `最近记录: ${historyText}`,
  ].join("\n");
}
