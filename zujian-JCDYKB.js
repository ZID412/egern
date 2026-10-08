// ZID412 - Egern通用脚本小组件 - 机场订阅看板
// 支持可视化展示多个机场订阅的流量百分比、今日用量、剩余流量及套餐到期时间，汇总用量等.

// 环境变量配置说明
//【必填项】URL1 ~ URL5：订阅链接（至少配置 URL1）

//【选填项 - 基础信息】
// NAME1 ~ NAME5：订阅名称（不填默认显示 Sub 1、Sub 2...）
// PROTOCOL1 ~ PROTOCOL5：协议备注（超长自动缩写：如 SS / Hy2）
// NODES1 ~ NODES5：节点数量备注（只填纯数字如 20）
// RESET1 ~ RESET5：每月重置日（1~31，不填写脚本自动推算，但自动推算可能不准确）
// ACCENT1 ~ ACCENT5：专属主题色（脚本自动显示，可自定义如#46D66B、#58A6FF等HEX颜色代码）

//【选填项 - 全局设置】
// REFRESH_MINUTES：小组件刷新间隔（单位：分钟，默认 60）
// SHOW：筛选并指定排序（如填 1,3,4 或填名字，大组件最多展示 5 个）

//【协议/节点备注显示逻辑】
// - 仅填节点数 -> 显示「20节点丨今日...」
// - 仅填协议名 -> 显示「Trojan丨今日...」（超长如 Shadowsocks 自动缩为 SS）
// - 协议 + 节点同填 -> 显示协议缩写「hy2 20节点丨今日...」
// - 两者都不填 -> 保持整洁，直接显示「今日...」

// 原版地址：https://raw.githubusercontent.com/Harley0214/Egern-widgest-SUBTraffic-monitor/main/ModernSubTraffic-Egern-Generic.js
// ------------------------------------------

const DEFAULT_REFRESH_MINUTES = 60;
const MAX_ACCOUNTS = 5;

// 1. 定义可供随机抽取的 SF Symbols 图标池
const RANDOM_SYMBOL_POOL = [
  "sf-symbol:point.3.connected.trianglepath.dotted",
  "sf-symbol:network",
  "sf-symbol:globe",
  "sf-symbol:bolt.horizontal.circle.fill",
  "sf-symbol:antenna.radiowaves.left.and.right",
  "sf-symbol:cpu",
  "sf-symbol:externaldrive.connected.to.line.below",
  "sf-symbol:icloud",
  "sf-symbol:wifi"
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

  try {
    const info = await fetchSubscriptionInfo(ctx, account.url);
    const upload = Number(info.upload || 0);
    const download = Number(info.download || 0);
    const total = Number(info.total || 0);
    const used = upload + download;
    const history = updateUsageHistory(ctx, account, used);
    const data = {
      ...empty,
      upload,
      download,
      used,
      total,
      remain: Math.max(total - used, 0),
      todayUsed: history.todayUsed,
      expire: Number(info.expire || 0),
      ok: total > 0,
      cached: false,
      fetchedAt: Date.now(),
      error: "",
    };

    writeJSON(ctx, storageKey(account, "cache"), cacheShape(data));
    return data;
  } catch (error) {
    const cached = readJSON(ctx, storageKey(account, "cache"), null);
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
  const variants = buildUrlVariants(url);
  const userAgents = [
    { "User-Agent": "Quantumult%20X/1.5.2" },
    { "User-Agent": "clash-verge-rev/2.3.1", Accept: "application/x-yaml,text/plain,*/*" },
    { "User-Agent": "mihomo/1.19.3", Accept: "application/x-yaml,text/plain,*/*" },
  ];

  const deadline = Date.now() + 20000;

  for (const headers of userAgents) {
    for (const target of variants) {
      for (const method of ["head", "get"]) {
        if (Date.now() > deadline) throw new Error("Subscription fetch timeout");
        try {
          const response = await httpRequest(ctx, method, target, headers);
          const raw = headerValue(response && response.headers, "subscription-userinfo");
          const info = parseSubscriptionHeader(raw);
          if (info && info.total) return info;
        } catch (_) {}
      }
    }
  }

  throw new Error("Missing subscription-userinfo header");
}

async function httpRequest(ctx, method, url, headers) {
  if (!ctx.http) throw new Error("ctx.http is not available");
  const fn = ctx.http[method] || ctx.http.get;
  if (typeof fn !== "function") throw new Error(`ctx.http.${method} is not available`);
  return await fn.call(ctx.http, url, { headers, timeout: 9000 });
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

function buildUrlVariants(url) {
  const seen = new Set();
  const variants = [];
  const add = (item) => {
    if (item && !seen.has(item)) {
      seen.add(item);
      variants.push(item);
    }
  };

  add(url);
  add(withParam(url, "flag", "clash"));
  add(withParam(url, "flag", "meta"));
  add(withParam(url, "target", "clash"));
  return variants;
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
      padding: [15, 15, 14, 15],
      refreshAfter,
      children: [
        renderHeader([item], palette, { small: true }),
        spacer(8),
        divider(palette),
        spacer(8),
        renderTrafficSection(item, palette, { small: true, compact: true }),
        { type: "spacer" },
        renderFooter(results, palette),
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
        src: "sf-symbol:server.rack",
        width: options.compact ? 13 : 15,
        height: options.compact ? 13 : 15,
        color: palette.accent,
      },
      {
        type: "text",
        text: "Subs Dashboard",
        font: { size: options.compact ? 16 : 18, weight: "semibold" },
        textColor: palette.text,
        maxLines: 1,
      },
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
  const rightValue = options.small
    ? formatBytes(data.total)
    : `⬆️${formatBytes(data.upload)} ⬇️${formatBytes(data.download)}丨${formatBytes(data.total)}`;

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
            type: "text",
            text: rightValue,
            font: { size: profile.valueSize, weight: "medium", family: "Menlo" },
            textColor: accent,
            maxLines: 1,
            minScale: 0.72,
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
      progressHeight: 6,
      gapAfterHead: 6,
      gapAfterProgress: 5,
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
      { type: "text", text: `${percent(item.remain, item.total)}  ⬆️${formatBytes(item.upload)} ⬇️${formatBytes(item.download)}丨${formatBytes(item.total)}`, font: { size: 11, family: "Menlo" }, maxLines: 1, minScale: 0.7 },
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
  const nextDaily =
    !daily || daily.date !== today || Number(daily.baselineUsed || 0) > used
      ? { date: today, baselineUsed: used }
      : daily;

  const todayUsed = Math.max(used - Number(nextDaily.baselineUsed || 0), 0);
  writeJSON(ctx, dailyKey, nextDaily);

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
  return `${n.toFixed(digits)}${units[index]}`;
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
      return `到期${daysToExpire}天`;
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
    return `重置${daysLeft}天`;
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
