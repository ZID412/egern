/*
ZID412 - Egern通用脚本小组件 - 机场订阅看板 v3.3.3
支持可视化展示多个机场订阅的流量百分比、今日用量、剩余流量及套餐到期时间，汇总用量等

环境变量配置说明
推荐：URL+NAME+RESET 即可

【必填项】
URL1 ~ URL5：订阅链接（至少配置 URL1）

【选填项 - 基础信息】
NAME1 ~ NAME5：订阅名称（不填默认显示 Sub 1、Sub 2...）
PROTOCOL1 ~ PROTOCOL5：协议备注（超长自动缩写：如 SS / Hy2）
NODES1 ~ NODES5：节点数量备注（只填纯数字如 20）
RESET1 ~ RESET5：每月重置日（1~31，不填写脚本自动推算，但自动推算可能不准确）
ACCENT1 ~ ACCENT5：专属主题色（脚本自动显示，可自定义如#46D66B、#58A6FF等HEX颜色代码）

【选填项 - 全局设置】
REFRESH_MINUTES：小组件刷新间隔（单位：分钟，默认 60）
SHOW：筛选并指定排序（如填 1,3,4 或填名字，大组件最多展示 5 个）

【协议/节点备注显示逻辑】
- 仅填节点数 -> 显示「20节点丨今日...」
- 仅填协议名 -> 显示「Trojan丨今日...」（超长如 Shadowsocks 自动缩为 SS）
- 协议 + 节点同填 -> 显示「hy2 20节点丨今日...」（中/大尺寸默认显示缩写，小尺寸显示完整协议名，超长自动缩写）
- 两者都不填 -> 保持整洁，直接显示「今日...」

已知小bug：需要每日0:00手动刷新
该组件代码为修改版，原版地址：https://raw.githubusercontent.com/Harley0214/Egern-widgest-SUBTraffic-monitor/main/ModernSubTraffic-Egern-Generic.js
----------------------------------------------------------
 */

const DEFAULT_REFRESH_MINUTES = 60;
const MAX_ACCOUNTS = 5;

// 脏数据（已用量异常归零）沿用上次有效值的最长保护时长
// 超过该时长后强制接受归零，避免套餐重置时数据被无限期冻结在上一个周期
const DIRTY_HOLD_MS = 24 * 60 * 60 * 1000;

// 判定「到期时间已推进」时允许的最大跨度，用于过滤秒/毫秒单位切换等异常值
const MAX_RENEW_GAP_MS = 400 * 24 * 60 * 60 * 1000;

// 1. 定义可供随机抽取的 SF Symbols 图标池
const RANDOM_SYMBOL_POOL = [
  "sf-symbol:cloud.drizzle",
  "sf-symbol:cloud.rain",
  "sf-symbol:cloud.heavyrain",
  "sf-symbol:cloud.fog",
  "sf-symbol:cloud.hail",
  "sf-symbol:cloud.snow",
  "sf-symbol:cloud.sleet",
  "sf-symbol:cloud.bolt",
  "sf-symbol:cloud.bolt.rain"
];

// 2. Fisher-Yates 洗牌算法：用于随机打乱数组且保证不重复
function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export default async function (ctx = {}) {
  const family = normalizeFamily(ctx.widgetFamily);
  const refreshAfter = new Date(Date.now() + refreshMinutes(ctx) * 60 * 1000).toISOString();
  const accounts = collectAccounts(ctx, MAX_ACCOUNTS).slice(0, limitForFamily(family));

  if (!accounts.length) {
    return renderEmpty(family, refreshAfter);
  }

  const results = await Promise.all(accounts.map((account) => loadTraffic(ctx, account)));

  if (family === "accessoryInline") {
    return {
      type: "widget",
      refreshAfter,
      children: [{ type: "text", text: inlineText(results) }],
    };
  }

  if (family === "accessoryCircular") {
    const item = results[0];
    return {
      type: "widget",
      refreshAfter,
      padding: 4,
      children: [
        { type: "spacer" },
        { type: "text", text: percent(item.remain, item.total), font: { size: 22, weight: "bold" }, textAlign: "center" },
        { type: "text", text: item.name || "Traffic", font: { size: 11, weight: "medium" }, textAlign: "center", opacity: 0.7, maxLines: 1 },
        { type: "spacer" },
      ],
    };
  }

  if (family === "accessoryRectangular") {
    return renderAccessoryRectangular(results, refreshAfter);
  }

  return renderWidget(family, results, refreshAfter);
}

function normalizeFamily(value) {
  return String(value || "systemMedium");
}

function limitForFamily(family) {
  if (family === "systemSmall" || family.startsWith("accessory")) return 1;
  if (family === "systemMedium") return 2;
  return 5;
}

function refreshMinutes(ctx) {
  const env = ctx.env || {};
  const raw = envValue(env, ["REFRESH_MINUTES", "refreshMinutes", "REFRESH", "refresh"]);
  const value = Number(raw || DEFAULT_REFRESH_MINUTES);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_REFRESH_MINUTES;
}

function collectAccounts(ctx, max) {
  const env = ctx.env || {};
  const accounts = [];
  const accents = ["#46D66B", "#7A84E8", "#58A6FF", "#FFB800", "#FF6B6B"];

  const shuffledSymbols = shuffleArray(RANDOM_SYMBOL_POOL);

  for (let i = 1; i <= max; i++) {
    const url = envText(env, [`URL${i}`, `url${i}`]);
    if (!url) continue;
    accounts.push({
      slot: i,
      name: envText(env, [`NAME${i}`, `name${i}`]) || `Sub ${i}`,
      url,
      protocol: envText(env, [`PROTOCOL${i}`, `protocol${i}`]),
      resetDay: parseResetDay(envText(env, [`RESET${i}`, `reset${i}`])),
      nodes: envText(env, [`NODES${i}`, `nodes${i}`, `NODE${i}`, `node${i}`]),
      accent: envText(env, [`ACCENT${i}`, `accent${i}`]) || accents[i - 1] || accents[0],
      symbol: shuffledSymbols[i - 1] || "sf-symbol:network",
    });
  }

  const aliases = [
    ["Sub 1", "SUB1_URL", "SUB1_PROTOCOL", accents[0], "SUB1_NODES"],
    ["Sub 2", "SUB2_URL", "SUB2_PROTOCOL", accents[1], "SUB2_NODES"],
    ["Sub 3", "SUB3_URL", "SUB3_PROTOCOL", accents[2], "SUB3_NODES"],
    ["Sub 4", "SUB4_URL", "SUB4_PROTOCOL", accents[3], "SUB4_NODES"],
    ["Sub 5", "SUB5_URL", "SUB5_PROTOCOL", accents[4], "SUB5_NODES"],
  ];

  const usedSlots = new Set(accounts.map((item) => item.slot));
  for (let idx = 0; idx < aliases.length; idx++) {
    const [name, key, protoKey, accent, aliasNodeKey] = aliases[idx];
    const url = envText(env, [key]);
    if (!url || accounts.some((item) => item.url === url)) continue;
    let nextSlot = 1;
    while (usedSlots.has(nextSlot)) nextSlot++;
    usedSlots.add(nextSlot);
    accounts.push({
      slot: nextSlot,
      name,
      url,
      protocol: envText(env, [protoKey, `PROTOCOL${nextSlot}`, `protocol${nextSlot}`]),
      resetDay: null,
      nodes: envText(env, [aliasNodeKey, `NODES${nextSlot}`, `nodes${nextSlot}`, `NODE${nextSlot}`, `node${nextSlot}`]),
      accent,
      symbol: shuffledSymbols[nextSlot - 1] || "sf-symbol:network"
    });
  }

  const show = envText(env, ["SHOW", "show"]);
  if (show) {
    const picked = show
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((key) => findAccount(accounts, key))
      .filter(Boolean);
    if (picked.length) return picked.slice(0, max);
  }

  return accounts.slice(0, max);
}

// 两个都填时使用的最短缩写
function shortestProtocol(val) {
  if (!val) return "";
  const v = String(val).trim();
  const lower = v.toLowerCase();
  const map = {
    shadowsocks: "ss",
    "shadowsocks-2022": "ss",
    ss2022: "ss",
    ss: "ss",
    shadowsocksr: "ssr",
    ssr: "ssr",
    vless: "vl",
    vl: "vl",
    vmess: "vm",
    vm: "vm",
    trojan: "tr",
    tr: "tr",
    hysteria2: "hy2",
    "hysteria 2": "hy2",
    hy2: "hy2",
    hysteria: "hy",
    hy: "hy",
    wireguard: "wg",
    wg: "wg",
    tuic: "tuic",
    tuic5: "tuic",
    naiveproxy: "naive",
    naive: "naive",
    snell: "snell",
  };
  return map[lower] || v;
}

// 仅填协议时使用：超长协议转缩写，普通长度保留完整名称
function smartProtocol(val) {
  if (!val) return "";
  const v = String(val).trim();
  const lower = v.toLowerCase();
  const longMap = {
    shadowsocks: "SS",
    "shadowsocks-2022": "SS-2022",
    ss2022: "SS-2022",
    shadowsocksr: "SSR",
    wireguard: "WG",
    naiveproxy: "Naive",
    hysteria2: "Hy2",
    "hysteria 2": "Hy2",
  };
  if (longMap[lower]) return longMap[lower];
  if (v.length > 8 && shortestProtocol(v) !== v) {
    return shortestProtocol(v).toUpperCase();
  }
  return v;
}

function formatPrefix(protocol, nodes) {
  const rawP = String(protocol || "").trim();
  const rawN = String(nodes || "").trim();
  const pureN = rawN.replace(/节点$/, "");

  if (rawP && pureN) {
    return `${shortestProtocol(rawP)} ${pureN}节点`;
  }
  if (rawP) {
    return smartProtocol(rawP);
  }
  if (pureN) {
    return `${pureN}节点`;
  }
  return "";
}

// 小尺寸组件完整协议映射
function fullProtocol(val) {
  if (!val) return "";
  const v = String(val).trim();
  const lower = v.toLowerCase();
  const map = {
    shadowsocks: "Shadowsocks",
    "shadowsocks-2022": "Shadowsocks-2022",
    ss2022: "Shadowsocks-2022",
    ss: "Shadowsocks",
    shadowsocksr: "ShadowsocksR",
    ssr: "ShadowsocksR",
    vless: "Vless",
    vl: "Vless",
    vmess: "Vmess",
    vm: "Vmess",
    trojan: "Trojan",
    tr: "Trojan",
    hysteria2: "Hysteria2",
    "hysteria 2": "Hysteria2",
    hy2: "Hysteria2",
    hysteria: "Hysteria",
    hy: "Hysteria",
    wireguard: "WireGuard",
    wg: "WireGuard",
    tuic: "TUIC",
    tuic5: "TUIC",
    naiveproxy: "NaiveProxy",
    naive: "NaiveProxy",
    snell: "Snell",
  };
  return map[lower] || v;
}

// 估算文本在 Menlo 10pt 下的渲染宽度（pt）
function estimateTextWidth(text, fontSize = 10) {
  let width = 0;
  for (const ch of String(text || "")) {
    if (ch.charCodeAt(0) > 255) {
      width += fontSize * 1.05; // 中文全角字符
    } else {
      width += fontSize * 0.6; // ASCII / 等宽字符
    }
  }
  return width;
}

// 小尺寸组件协议/节点显示逻辑：优先完整协议，超长自动降级缩写
function formatPrefixSmall(protocol, nodes, maxWidth = 124) {
  const rawP = String(protocol || "").trim();
  const rawN = String(nodes || "").trim();
  const pureN = rawN.replace(/节点$/, "");

  if (rawP && pureN) {
    const full = `${fullProtocol(rawP)} ${pureN}节点`;
    if (estimateTextWidth(full, 10) <= maxWidth) {
      return full;
    }
    const smart = `${smartProtocol(rawP)} ${pureN}节点`;
    if (estimateTextWidth(smart, 10) <= maxWidth) {
      return smart;
    }
    return `${shortestProtocol(rawP)} ${pureN}节点`;
  }
  if (rawP) {
    const full = fullProtocol(rawP);
    if (estimateTextWidth(full, 10) <= maxWidth) {
      return full;
    }
    return smartProtocol(rawP);
  }
  if (pureN) {
    return `${pureN}节点`;
  }
  return "";
}

function envText(env, keys) {
  const value = envValue(env, keys);
  return String(value == null ? "" : value).trim();
}

function envValue(env, keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(env, key)) return env[key];
  }
  return "";
}

function parseResetDay(value) {
  const day = parseInt(value || "", 10);
  return day >= 1 && day <= 31 ? day : null;
}

function findAccount(list, key) {
  const index = Number(key);
  if (Number.isInteger(index) && index >= 1 && index <= list.length && list[index - 1]) return list[index - 1];
  return list.find((item) => item.name === key);
}

async function loadTraffic(ctx, account) {
  const empty = {
    ...account,
    protocol: account.protocol || "",
    nodes: account.nodes || "",
    upload: 0,
    download: 0,
    used: 0,
    total: 0,
    remain: 0,
    todayUsed: 0,
    expire: 0,
    ok: false,
    cached: false,
    fetchedAt: Date.now(),
    error: "No data",
  };

  // 提前读取缓存，供脏数据校验与故障回退
  const cached = readJSON(ctx, storageKey(account, "cache"), null);

  try {
    const info = await fetchSubscriptionInfo(ctx, account.url);
    const upload = Number(info.upload || 0);
    const download = Number(info.download || 0);
    const total = Number(info.total || 0);
    const used = upload + download;

    // 机制二（修复版）：脏数据防冲刷校验
    // 已用量归零有两种成因，必须区分：
    //   1) 真实套餐重置 —— 命中重置日窗口或到期时间已推进，应当接受归零
    //   2) 接口或订阅转换未透传用量 —— 平滑继承上次有效值
    // 沿用时记录归零起始时间，超过 DIRTY_HOLD_MS 后强制接受归零，避免数据被无限期冻结
    const now = Date.now();
    const cachedUsed = Number((cached && cached.used) || 0);
    let finalUpload = upload;
    let finalDownload = download;
    let finalUsed = used;
    let isDirtyData = false;
    let zeroSince = 0;

    if (used === 0 && cachedUsed > 0) {
      const prevZeroAt = Number((cached && cached.zeroSince) || 0);
      zeroSince = prevZeroAt > 0 ? prevZeroAt : now;
      const heldTooLong = now - zeroSince > DIRTY_HOLD_MS;
      const realReset = isRealReset(account, cached, info, now);

      if (!realReset && !heldTooLong) {
        finalUpload = Number((cached && cached.upload) || 0);
        finalDownload = Number((cached && cached.download) || 0);
        finalUsed = cachedUsed;
        isDirtyData = true;
      } else {
        zeroSince = 0;
      }
    }

    let history;
    if (isDirtyData) {
      // 沿用上次有效画面，但缓存若来自前一天，今日用量必须归零，不能显示昨天的用量
      const cachedDay = todayKey(new Date(Number((cached && cached.fetchedAt) || now)));
      history = { todayUsed: cachedDay === todayKey(new Date(now)) ? Number((cached && cached.todayUsed) || 0) : 0 };
    } else {
      history = updateUsageHistory(ctx, account, finalUsed);
    }

    const data = {
      ...empty,
      upload: finalUpload,
      download: finalDownload,
      used: finalUsed,
      total,
      remain: Math.max(total - finalUsed, 0),
      todayUsed: history.todayUsed,
      expire: Number(info.expire || 0) || (cached && cached.expire) || 0,
      ok: total > 0,
      cached: isDirtyData,
      fetchedAt: now,
      zeroSince,
      error: "",
    };

    writeJSON(ctx, storageKey(account, "cache"), cacheShape(data));
    return data;
  } catch (error) {
    if (cached) {
      return {
        ...empty,
        ...cached,
        name: account.name || cached.name,
        protocol: account.protocol || cached.protocol || "",
        resetDay: account.resetDay !== null ? account.resetDay : cached.resetDay,
        nodes: account.nodes || cached.nodes || "",
        accent: account.accent || cached.accent,
        symbol: account.symbol || cached.symbol,
        // 机制一：补全今日用量回退
        // 与成功分支保持一致：缓存若来自前一天，今日用量必须归零，不能显示昨天的用量
        todayUsed:
          Number(cached.fetchedAt || 0) > 0 &&
          todayKey(new Date(Number(cached.fetchedAt))) === todayKey(new Date())
            ? Number(cached.todayUsed || 0)
            : 0,
        cached: true,
        fetchedAt: cached.fetchedAt || Date.now(),
        error: shortError(error),
      };
    }

    return {
      ...empty,
      error: shortError(error),
    };
  }
}

async function fetchSubscriptionInfo(ctx, url) {
  const deadline = Date.now() + 15000;

  // 机制三：精简请求链路，只用 GET 避免 HEAD 拦截，给备用 UA 留足充足时间
  const requestPlans = [
    {
      headers: { "User-Agent": "Quantumult%20X/1.5.2" },
      urls: [url],
    },
    {
      headers: { "User-Agent": "clash-verge-rev/2.3.1", Accept: "application/x-yaml,text/plain,*/*" },
      urls: [url, withParam(url, "flag", "clash"), withParam(url, "target", "clash")],
    },
    {
      headers: { "User-Agent": "mihomo/1.19.3", Accept: "application/x-yaml,text/plain,*/*" },
      urls: [url, withParam(url, "flag", "meta")],
    },
  ];

  for (const plan of requestPlans) {
    for (const target of plan.urls) {
      if (Date.now() > deadline) throw new Error("Subscription fetch timeout");
      try {
        const response = await httpRequest(ctx, "get", target, plan.headers);
        const raw = headerValue(response && response.headers, "subscription-userinfo");
        const info = parseSubscriptionHeader(raw);
        if (info && info.total) return info;
      } catch (_) {}
    }
  }

  throw new Error("Missing subscription-userinfo header");
}

// 判断是否处于用户声明的每月重置日窗口：重置日当天或次日
// 只信任显式配置的 RESET，不用到期日反推，避免长期套餐每月被误判一次
function inResetWindow(account, now) {
  const resetDay = Number(account && account.resetDay);
  if (!resetDay || resetDay < 1 || resetDay > 31) return false;
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const day = Math.min(resetDay, daysInMonth);
  const today = now.getDate();
  const nextDay = day >= daysInMonth ? 1 : day + 1;
  return today === day || today === nextDay;
}

// 统一到期时间为毫秒，兼容秒 / 毫秒两种单位
function expireToMs(value) {
  const n = Number(value || 0);
  if (!n) return 0;
  return n > 1e12 ? n : n * 1000;
}

// 判断已用量归零属于「真实重置」还是「接口脏数据」
// 信号一：用户显式配置了重置日，且今天落在重置窗口内
// 信号二：本次返回的到期时间比缓存中的更晚，说明套餐确实已续期
// 两条都不满足时按脏数据处理，由 DIRTY_HOLD_MS 兜底
function isRealReset(account, cached, info, nowMs) {
  if (inResetWindow(account, new Date(nowMs))) return true;

  const cur = expireToMs(info && info.expire);
  const prev = expireToMs(cached && cached.expire);
  if (cur <= 0 || prev <= 0) return false;

  const gap = cur - prev;
  return gap > 0 && gap <= MAX_RENEW_GAP_MS;
}

async function httpRequest(ctx, method, url, headers) {
  if (!ctx.http) throw new Error("ctx.http is not available");
  const fn = ctx.http[method] || ctx.http.get;
  if (typeof fn !== "function") throw new Error(`ctx.http.${method} is not available`);
  // 机制三：单次请求超时设置为 5000ms（5秒）
  return await fn.call(ctx.http, url, { headers, timeout: 5000 });
}

function headerValue(headers, name) {
  if (!headers) return "";
  if (typeof headers.get === "function") {
    return headers.get(name) || "";
  }
  const target = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === target) return String(headers[key] || "");
  }
  return "";
}

function parseSubscriptionHeader(header) {
  if (!header) return null;
  const pairs = String(header).match(/\w+=[\d.eE+-]+/g) || [];
  if (!pairs.length) return null;
  return Object.fromEntries(
    pairs.map((pair) => {
      const [key, value] = pair.split("=");
      return [key.toLowerCase(), Number(value)];
    })
  );
}

function withParam(url, key, value) {
  return `${url}${url.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(value)}`;
}

function renderWidget(family, results, refreshAfter) {
  const compact = family === "systemMedium";
  const small = family === "systemSmall";
  const dense = !small && results.length >= 3;
  const isFive = results.length >= 5;
  const palette = makePalette(results[0] && results[0].accent);

  if (small) {
    const item = results[0];
    return {
      type: "widget",
      backgroundGradient: palette.backgroundGradient,
      padding: [13, 15, 12, 15],
      refreshAfter,
      children: [
        renderHeader([item], palette, { small: true }),
        spacer(5),
        divider(palette),
        spacer(5),
        renderTrafficSection(item, palette, { small: true, compact: true }),
        { type: "spacer" },
      ],
    };
  }

  const padding = compact
    ? [12, 15, 11, 15]
    : isFive
      ? [12, 16, 10, 16]
      : [16, 18, 14, 18];

  const gap = compact ? 5 : isFive ? 4 : dense ? 6 : 8;

  return {
    type: "widget",
    backgroundGradient: palette.backgroundGradient,
    padding,
    refreshAfter,
    children: [
      renderHeader(results, palette, { compact, dense }),
      spacer(gap),
      divider(palette),
      spacer(gap),
      ...interleaveSections(results, palette, { compact, dense, count: results.length }),
      ...(family === "systemLarge" || family === "systemExtraLarge"
        ? [spacer(gap), divider(palette), spacer(gap), renderFooter(results, palette)]
        : []),
    ],
  };
}

function interleaveSections(results, palette, options) {
  const out = [];
  const gap = options.compact ? 4 : options.count >= 5 ? 3 : options.dense ? 5 : 7;
  results.forEach((item, index) => {
    out.push(renderTrafficSection(item, palette, { ...options, index, count: results.length }));
    if (index < results.length - 1) {
      out.push(spacer(gap), divider(palette), spacer(gap));
    }
  });
  return out;
}

function renderHeader(results, palette, options = {}) {
  return {
    type: "stack",
    direction: "row",
    alignItems: "center",
    gap: options.compact ? 6 : 8,
    children: [
      {
        type: "image",
        src: "sf-symbol:smoke",
        width: options.compact ? 13 : 15,
        height: options.compact ? 13 : 15,
        color: palette.accent,
      },
      ...(options.small
        ? []
        : [
            {
              type: "text",
              text: "Subs Dashboard",
              font: { size: options.compact ? 16 : 18, weight: "semibold" },
              textColor: palette.text,
              maxLines: 1,
            },
          ]),
      { type: "spacer" },
      {
        type: "text",
        text: timeText(newestResult(results).fetchedAt),
        font: { size: options.compact ? 10 : 12, weight: "medium", family: "Menlo" },
        textColor: palette.dim,
        maxLines: 1,
      },
    ],
  };
}

function renderTrafficSection(data, palette, options = {}) {
  const profile = sectionProfile(options);
  const accent = data.ok ? data.accent || palette.accent : palette.warning;

  if (options.small) {
    const prefix = formatPrefixSmall(data.protocol, data.nodes);
    const todayText = `今日${formatBytes(data.todayUsed)} 剩余${formatBytes(data.remain)}`;

    const resetText = expireDaysText(data);
    const expireText = data.expire
      ? `距离到期${dateText(data.expire)}`
      : resetText
        ? resetText
        : data.cached
          ? "缓存"
          : statusText(data);

    const showResetLine = Boolean(data.expire && resetText);

    const metaChildren = [];

    // 今日使用
    metaChildren.push({
      type: "stack",
      direction: "row",
      alignItems: "center",
      children: [
        {
          type: "text",
          text: todayText,
          font: { size: profile.metaSize, weight: "medium", family: "Menlo" },
          textColor: accent,
          maxLines: 1,
          minScale: 0.7,
        },
        { type: "spacer" },
      ],
    });

    // 协议/节点备注移动至今日使用和距离到期之间一行
    if (prefix) {
      metaChildren.push(spacer(3));
      metaChildren.push({
        type: "stack",
        direction: "row",
        alignItems: "center",
        children: [
          {
            type: "text",
            text: prefix,
            font: { size: profile.metaSize, weight: "medium", family: "Menlo" },
            textColor: accent,
            maxLines: 1,
            minScale: 0.7,
          },
          { type: "spacer" },
        ],
      });
    }

    // 距离到期
    metaChildren.push(spacer(3));
    metaChildren.push({
      type: "stack",
      direction: "row",
      alignItems: "center",
      children: [
        {
          type: "text",
          text: expireText,
          font: { size: profile.metaSize, weight: "medium", family: "Menlo" },
          textColor: data.ok ? accent : palette.warning,
          maxLines: 1,
          minScale: 0.7,
        },
        { type: "spacer" },
      ],
    });

    // 距离重置下移一行
    if (showResetLine) {
      metaChildren.push(spacer(3));
      metaChildren.push({
        type: "stack",
        direction: "row",
        alignItems: "center",
        children: [
          {
            type: "text",
            text: resetText,
            font: { size: profile.metaSize, weight: "medium", family: "Menlo" },
            textColor: data.ok ? accent : palette.warning,
            maxLines: 1,
            minScale: 0.7,
          },
          { type: "spacer" },
        ],
      });
    }

    return {
      type: "stack",
      direction: "column",
      gap: 0,
      children: [
        {
          type: "stack",
          direction: "row",
          alignItems: "center",
          gap: 6,
          children: [
            {
              type: "image",
              src: data.symbol || "sf-symbol:network",
              width: profile.icon,
              height: profile.icon,
              color: accent,
            },
            {
              type: "text",
              text: data.name || "Proxy",
              font: { size: profile.nameSize, weight: "semibold" },
              textColor: palette.text,
              maxLines: 1,
              minScale: 0.72,
            },
            {
              type: "text",
              text: percent(data.remain, data.total),
              font: { size: profile.percentSize, weight: "semibold" },
              textColor: accent,
              maxLines: 1,
            },
            { type: "spacer" },
          ],
        },
        spacer(4),
        {
          type: "stack",
          direction: "row",
          alignItems: "center",
          gap: 2,
          children: [
            {
              type: "image",
              src: "sf-symbol:icloud.and.arrow.up",
              width: profile.valueSize,
              height: profile.valueSize,
              color: accent,
            },
            {
              type: "text",
              text: formatBytes(data.upload),
              font: { size: profile.valueSize, weight: "medium", family: "Menlo" },
              textColor: accent,
              maxLines: 1,
              minScale: 0.72,
            },
            {
              type: "image",
              src: "sf-symbol:icloud.and.arrow.down",
              width: profile.valueSize,
              height: profile.valueSize,
              color: accent,
            },
            {
              type: "text",
              text: `${formatBytes(data.download)}丨${formatBytes(data.total)}`,
              font: { size: profile.valueSize, weight: "medium", family: "Menlo" },
              textColor: accent,
              maxLines: 1,
              minScale: 0.72,
            },
            { type: "spacer" },
          ],
        },
        spacer(profile.gapAfterHead),
        renderProgress(ratio(data.remain, data.total), accent, palette, profile.progressHeight),
        spacer(profile.gapAfterProgress),
        ...metaChildren,
      ],
    };
  }

  const rightChildren = [
    {
      type: "image",
      src: "sf-symbol:icloud.and.arrow.up",
      width: profile.valueSize,
      height: profile.valueSize,
      color: accent,
    },
    {
      type: "text",
      text: formatBytes(data.upload),
      font: { size: profile.valueSize, weight: "medium", family: "Menlo" },
      textColor: accent,
      maxLines: 1,
      minScale: 0.72,
    },
    {
      type: "image",
      src: "sf-symbol:icloud.and.arrow.down",
      width: profile.valueSize,
      height: profile.valueSize,
      color: accent,
    },
    {
      type: "text",
      text: `${formatBytes(data.download)}丨${formatBytes(data.total)}`,
      font: { size: profile.valueSize, weight: "medium", family: "Menlo" },
      textColor: accent,
      maxLines: 1,
      minScale: 0.72,
    },
  ];

  const resetText = expireDaysText(data);
  const meta = data.expire
    ? `到期${dateText(data.expire)}${resetText ? ' ' + resetText : ''}`
    : resetText
      ? resetText
      : data.cached
        ? "缓存"
        : statusText(data);

  const prefix = formatPrefix(data.protocol, data.nodes);
  const leftMeta = `${prefix ? prefix + "丨" : ""}今日${formatBytes(data.todayUsed)} 剩余${formatBytes(data.remain)}`;

  return {
    type: "stack",
    direction: "column",
    gap: 0,
    children: [
      {
        type: "stack",
        direction: "row",
        alignItems: "center",
        gap: 6,
        children: [
          {
            type: "image",
            src: data.symbol || "sf-symbol:network",
            width: profile.icon,
            height: profile.icon,
            color: accent,
          },
          {
            type: "text",
            text: data.name || "Proxy",
            font: { size: profile.nameSize, weight: "semibold" },
            textColor: palette.text,
            maxLines: 1,
            minScale: 0.72,
          },
          {
            type: "text",
            text: percent(data.remain, data.total),
            font: { size: profile.percentSize, weight: "semibold" },
            textColor: accent,
            maxLines: 1,
          },
          { type: "spacer" },
          {
            type: "stack",
            direction: "row",
            alignItems: "center",
            gap: 2,
            children: rightChildren,
          },
        ],
      },
      spacer(profile.gapAfterHead),
      renderProgress(ratio(data.remain, data.total), accent, palette, profile.progressHeight),
      spacer(profile.gapAfterProgress),
      {
        type: "stack",
        direction: "row",
        alignItems: "center",
        children: [
          {
            type: "text",
            text: leftMeta,
            font: { size: profile.metaSize, weight: "medium", family: "Menlo" },
            textColor: accent,
            maxLines: 1,
            minScale: 0.7,
          },
          { type: "spacer" },
          {
            type: "text",
            text: meta,
            font: { size: profile.metaSize, weight: "medium", family: "Menlo" },
            textColor: data.ok ? accent : palette.warning,
            maxLines: 1,
            minScale: 0.7,
          },
        ],
      },
    ],
  };
}

function sectionProfile(options) {
  if (options.small) {
    return {
      icon: 17,
      nameSize: 17,
      percentSize: 17,
      valueSize: 10,
      metaSize: 10,
      progressHeight: 5,
      gapAfterHead: 5,
      gapAfterProgress: 4,
    };
  }

  if (options.compact) {
    return {
      icon: 16,
      nameSize: 16,
      percentSize: 16,
      valueSize: 11,
      metaSize: 10,
      progressHeight: 4,
      gapAfterHead: 4,
      gapAfterProgress: 4,
    };
  }

  if (options.dense) {
    if (options.count >= 5) {
      return {
        icon: 15,
        nameSize: 16,
        percentSize: 16,
        valueSize: 11,
        metaSize: 10,
        progressHeight: 4,
        gapAfterHead: 2,
        gapAfterProgress: 2,
      };
    }
    return {
      icon: 16,
      nameSize: 16,
      percentSize: 16,
      valueSize: 11,
      metaSize: 10,
      progressHeight: 5,
      gapAfterHead: 5,
      gapAfterProgress: 5,
    };
  }

  return {
    icon: 18,
    nameSize: 18,
    percentSize: 18,
    valueSize: 12,
    metaSize: 11,
    progressHeight: 5,
    gapAfterHead: 6,
    gapAfterProgress: 6,
  };
}

// 进度条：父 stack 固定高度，两个子 stack 用 flex 按比例分配宽度，恢复满宽展示
function renderProgress(value, accent, palette, height) {
  const safe = Math.min(Math.max(value, 0), 1);
  // 已满/近乎为空时保留极小的一段，避免整条消失
  const filled = safe >= 1 ? 100 : Math.max(Math.round(safe * 1000) / 10, 1);
  const empty = 100 - filled;

  return {
    type: "stack",
    direction: "row",
    alignItems: "center",
    gap: 0,
    children: [
      { type: "stack", flex: filled, height, backgroundColor: accent, borderRadius: 99, children: [] },
      { type: "stack", flex: empty, height, backgroundColor: palette.track, borderRadius: 99, children: [] },
    ],
  };
}

function renderFooter(results, palette) {
  const total = results.reduce(
    (sum, item) => {
      sum.used += item.used || 0;
      sum.total += item.total || 0;
      return sum;
    },
    { used: 0, total: 0 }
  );

  return {
    type: "stack",
    direction: "row",
    alignItems: "center",
    children: [
      {
        type: "text",
        text: `${results.length} Subscription${results.length > 1 ? "s" : ""}`,
        font: { size: 12, weight: "semibold" },
        textColor: palette.dim,
      },
      { type: "spacer" },
      {
        type: "text",
        text: `Used ${formatBytes(total.used)}丨${formatBytes(total.total)}`,
        font: { size: 12, weight: "medium", family: "Menlo" },
        textColor: palette.dim,
        maxLines: 1,
        minScale: 0.72,
      },
    ],
  };
}

function renderAccessoryRectangular(results, refreshAfter) {
  const item = results[0];
  const resetText = expireDaysText(item);
  const expireText = item.expire
    ? `到期 ${dateText(item.expire)}${resetText ? ' ' + resetText : ''}`
    : resetText
      ? resetText
      : statusText(item);

  return {
    type: "widget",
    refreshAfter,
    gap: 2,
    children: [
      {
        type: "stack",
        direction: "row",
        alignItems: "center",
        gap: 4,
        children: [
          { type: "image", src: item.symbol || "sf-symbol:network", width: 11, height: 11 },
          { type: "text", text: item.name || "Traffic", font: { size: 17, weight: "bold" }, maxLines: 1 },
        ],
      },
      {
        type: "stack",
        direction: "row",
        alignItems: "center",
        gap: 2,
        children: [
          { type: "text", text: `${percent(item.remain, item.total)} `, font: { size: 11, family: "Menlo" } },
          { type: "image", src: "sf-symbol:icloud.and.arrow.up", width: 10, height: 10 },
          { type: "text", text: formatBytes(item.upload), font: { size: 11, family: "Menlo" } },
          { type: "image", src: "sf-symbol:icloud.and.arrow.down", width: 10, height: 10 },
          { type: "text", text: `${formatBytes(item.download)}丨${formatBytes(item.total)}`, font: { size: 11, family: "Menlo" } },
        ],
      },
      { type: "text", text: `今日 ${formatBytes(item.todayUsed)} 剩余 ${formatBytes(item.remain)}  ${expireText}`, font: { size: 11, family: "Menlo" }, opacity: 0.7, maxLines: 1, minScale: 0.7 },
    ],
  };
}

function renderEmpty(family, refreshAfter) {
  const palette = makePalette("#7A84E8");
  if (family.startsWith("accessory")) {
    return {
      type: "widget",
      refreshAfter,
      children: [{ type: "text", text: "Configure url1" }],
    };
  }

  return {
    type: "widget",
    padding: 16,
    gap: 10,
    backgroundGradient: palette.backgroundGradient,
    refreshAfter,
    children: [
      renderHeader([{ fetchedAt: Date.now() }], palette),
      { type: "spacer" },
      {
        type: "text",
        text: "Configure URL1 in Env",
        font: { size: 12, weight: "medium" },
        textColor: palette.warning,
        textAlign: "center",
      },
      { type: "spacer" },
    ],
  };
}

function makePalette(accent) {
  const accentColor = accent || "#7A84E8";
  return {
    accent: accentColor,
    text: "#F3F6FB",
    dim: "#8C95A8",
    divider: "#2C34438A",
    track: "#2B3440C2",
    warning: "#FF6B6B",
    backgroundGradient: {
      type: "linear",
      colors: ["#090D15FA", "#0D121DFA", "#111725FA"],
      stops: [0, 0.55, 1],
      startPoint: { x: 0, y: 0 },
      endPoint: { x: 1, y: 1 },
    },
  };
}

function divider(palette) {
  return {
    type: "stack",
    direction: "row",
    height: 1,
    backgroundColor: palette.divider,
    children: [],
  };
}

function spacer(length) {
  return { type: "spacer", length: Math.max(Math.round(length), 0) };
}

// 用 ctx.storage 记录每日基线；文档：ctx.storage.getJSON / setJSON
function updateUsageHistory(ctx, account, used) {
  const now = new Date();
  const dailyKey = storageKey(account, "daily");
  const today = todayKey(now);

  const daily = readJSON(ctx, dailyKey, null);
  const value = Number(used || 0);

  // 机制四（修复版）：基线延迟锚定 + 防归零保护
  // baselineUsed 为 null 表示当天基线尚未锚定（当天首个观测值为 0，可能是重置日也可能是脏数据）。
  // 未锚定时不参与增量计算，等出现第一个有效非零用量再锚定，
  // 这样既不会把累计用量误算成今日用量，也不会出现基线被写成 0 后今日用量永久停留在 0 的问题。
  let baseline = null;
  let nextDaily;

  if (!daily || daily.date !== today) {
    // 跨天：以当天首个有效观测值作为新基线；观测值为 0 时保持未锚定，今日用量按 0 处理
    baseline = value > 0 ? value : null;
    nextDaily = { date: today, baselineUsed: baseline };
  } else {
    const legacy = Number(daily.baselineUsed || 0);
    baseline = legacy > 0 ? legacy : null;

    if (value > 0 && (baseline === null || baseline > value)) {
      // 基线尚未锚定，或已用量低于基线（套餐重置 / 流量回退），重新锚定
      baseline = value;
    } else if (value === 0 && baseline !== null) {
      // 当天用量归零：判定为套餐重置，基线失效并等待重新锚定
      baseline = null;
    }

    nextDaily = { date: today, baselineUsed: baseline };
  }

  // 基线未锚定时不沿用昨日数据，今日用量按 0 处理
  const todayUsed = baseline !== null && value > baseline ? value - baseline : 0;

  writeJSON(ctx, dailyKey, { ...nextDaily, todayUsed });

  return { todayUsed };
}

function readJSON(ctx, key, fallback) {
  try {
    const storage = ctx.storage;
    if (!storage) return fallback;
    const value = storage.getJSON(key);
    return value == null ? fallback : value;
  } catch (_) {
    return fallback;
  }
}

function writeJSON(ctx, key, value) {
  try {
    const storage = ctx.storage;
    if (!storage) return;
    storage.setJSON(key, value);
  } catch (_) {}
}

function storageKey(account, type) {
  return `modern.subtraffic.${type}.${account.slot || encodeURIComponent(account.name || "default")}`;
}

function cacheShape(data) {
  return {
    name: data.name,
    protocol: data.protocol,
    resetDay: data.resetDay,
    nodes: data.nodes,
    accent: data.accent,
    symbol: data.symbol,
    upload: data.upload,
    download: data.download,
    used: data.used,
    total: data.total,
    remain: data.remain,
    todayUsed: data.todayUsed || 0, // 机制一：补全今日用量缓存
    zeroSince: data.zeroSince || 0, // 记录归零起始时间，供脏数据保护超时判定
    expire: data.expire,
    ok: data.ok,
    fetchedAt: data.fetchedAt,
  };
}

function newestResult(results) {
  const items = results.filter(Boolean);
  if (!items.length) return { fetchedAt: Date.now() };
  return items.reduce((latest, item) => (Number(item.fetchedAt || 0) > Number(latest.fetchedAt || 0) ? item : latest), items[0]);
}

function ratio(a, b) {
  if (!b) return 0;
  return Math.min(Math.max(a / b, 0), 1);
}

function percent(a, b) {
  if (!b) return "0%";
  return `${Math.round(ratio(a, b) * 100)}%`;
}

function statusText(data) {
  if (!data || !data.error) return "一次性流量 长期有效";
  return data.error.length > 18 ? `${data.error.slice(0, 18)}...` : data.error;
}

function shortError(error) {
  return String(error && error.message ? error.message : error);
}

function inlineText(results) {
  const item = results[0];
  if (!item) return "Traffic";
  return `${item.name} ${percent(item.remain, item.total)} ⬆️${formatBytes(item.upload)} ⬇️${formatBytes(item.download)}丨${formatBytes(item.total)}`;
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (value <= 0) return "0KB";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let n = value;
  let index = 0;
  while (n >= 1024 && index < units.length - 1) {
    n /= 1024;
    index++;
  }
  const digits = n >= 100 || index === 0 ? 0 : n >= 10 ? 1 : 2;
  // 小数部分为 0 时自动隐藏小数点：60.0GB → 60GB，5.50GB → 5.5GB，4.66GB 保持原样
  const text = n.toFixed(digits);
  const trimmed = text.indexOf(".") < 0 ? text : text.replace(/0+$/, "").replace(/\.$/, "");
  return `${trimmed}${units[index]}`;
}

function dateText(expire) {
  if (!expire) return "no expiry";
  const d = new Date(expire > 1e12 ? expire : expire * 1000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}.${m}.${day}`;
}

function expireDaysText(data) {
  if (!data) return "";

  let resetDay = null;
  let expire = null;

  if (typeof data === "number" || typeof data === "string") {
    expire = Number(data);
  } else if (typeof data === "object") {
    resetDay = data.resetDay || null;
    expire = data.expire || null;
  }

  if (expire) {
    const expireMs = expire > 1e12 ? expire : expire * 1000;
    const diffMs = expireMs - Date.now();

    if (diffMs <= 0) {
      return "已到期";
    }

    const daysToExpire = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (daysToExpire <= 30) {
      return `距离到期${daysToExpire}天`;
    }
  }

  if (!resetDay && expire) {
    const d = new Date(expire > 1e12 ? expire : expire * 1000);
    if (!isNaN(d.getTime())) {
      resetDay = d.getDate();
    }
  }

  if (resetDay && resetDay >= 1 && resetDay <= 31) {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const today = now.getDate();

    let targetYear = year;
    let targetMonth = month;

    if (today >= resetDay) {
      targetMonth += 1;
    }

    const maxDays = new Date(targetYear, targetMonth + 1, 0).getDate();
    const actualResetDay = Math.min(resetDay, maxDays);

    const targetDate = new Date(targetYear, targetMonth, actualResetDay);
    const todayZero = new Date(year, month, today);

    const daysLeft = Math.round((targetDate.getTime() - todayZero.getTime()) / (1000 * 60 * 60 * 24));
    return `距离重置${daysLeft}天`;
  }

  return "";
}

function timeText(timestamp) {
  const d = new Date(timestamp || Date.now());
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function todayKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
