import { boundedDelta, pick, randInt } from "./shared.js";

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

export function localGenerateDailyEvents(state) {
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
