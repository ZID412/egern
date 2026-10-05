/**
 * 🎬 流媒体解锁检测 — Egern 小组件（草稿 v0.2）
 *
 * 思路：对每个平台发一次「地区限定内容」的请求，看返回是正常内容页还是
 * “not available in your region” 这类拦截页，从而判断当前出口 IP 能不能解锁。
 *
 * 尺寸策略（平台变多了，所以用两列网格把版面压紧）：
 *   systemSmall          一个总数 + 状态点阵（每行 4 个）
 *   systemMedium         两列 × 4 行 = 8 个平台
 *   systemLarge          两列 × 8 行 = 16 个平台 + 汇总
 *   accessoryRectangular 一行摘要
 *
 * ⚠️ 草稿说明：探测地址与判定关键词都是按公开做法写的，接口会改版；
 *    所有地址都能用 env 覆盖（PROBE_<平台KEY>），方便真机上换地址验证。
 *
 * 环境变量（全部可选）：
 *   SERVICES   只检测哪些平台，逗号分隔；默认全部 16 个
 *   TIMEOUT    单个探测超时毫秒，默认 8000
 *   BATCH      并发批大小，默认 8（避免一次甩出十几个请求）
 *   LOCATION   手动指定落地地区
 *   PROBE_<KEY>  覆盖某个平台的探测地址，例如 PROBE_NETFLIX / PROBE_YOUTUBE
 *   TITLE / TAP_URL
 */

/** 平台清单：key / 显示名 / 网格里用的短名 / 图标（SF Symbol 字母方块）/ 品牌色 / 探测方式 */
const SERVICES = [
  { key: 'chatgpt', name: 'ChatGPT', short: 'ChatGPT', icon: 'c.square.fill', brand: { light: '#0E8A6B', dark: '#3BD9A8' }, kind: 'chatgpt', url: 'https://chatgpt.com/' },
  { key: 'claude', name: 'Claude', short: 'Claude', icon: 'l.square.fill', brand: { light: '#B4551F', dark: '#E08B57' }, kind: 'page', url: 'https://claude.ai/' },
  { key: 'gemini', name: 'Gemini', short: 'Gemini', icon: 'g.square.fill', brand: { light: '#1A63C7', dark: '#6FA8FF' }, kind: 'page', url: 'https://gemini.google.com/' },

  { key: 'netflix', name: 'Netflix', short: 'Netflix', icon: 'n.square.fill', brand: { light: '#C7362C', dark: '#FF453A' }, kind: 'netflix', url: 'https://www.netflix.com' },
  { key: 'disney', name: 'Disney+', short: 'Disney+', icon: 'd.square.fill', brand: { light: '#0A5FBF', dark: '#4A9DFF' }, kind: 'page', url: 'https://www.disneyplus.com/' },
  { key: 'prime', name: 'Prime Video', short: 'Prime', icon: 'p.square.fill', brand: { light: '#0A7FB8', dark: '#4FC3F7' }, kind: 'page', url: 'https://www.primevideo.com/' },
  { key: 'max', name: 'Max (HBO)', short: 'Max', icon: 'm.square.fill', brand: { light: '#5B3BC4', dark: '#9B7BFF' }, kind: 'page', url: 'https://www.max.com/', want: 'US' },
  { key: 'hulu', name: 'Hulu', short: 'Hulu', icon: 'h.square.fill', brand: { light: '#1DB954', dark: '#3BE07A' }, kind: 'page', url: 'https://www.hulu.com/', want: 'US' },
  { key: 'youtube', name: 'YouTube Premium', short: 'YouTube', icon: 'y.square.fill', brand: { light: '#CC0000', dark: '#FF453A' }, kind: 'page', url: 'https://www.youtube.com/premium' },

  { key: 'tiktok', name: 'TikTok', short: 'TikTok', icon: 't.square.fill', brand: { light: '#B3005A', dark: '#FF4D94' }, kind: 'page', url: 'https://www.tiktok.com/' },
  { key: 'crunchyroll', name: 'Crunchyroll', short: 'Crunchy', icon: 'r.square.fill', brand: { light: '#B84A00', dark: '#FF9F45' }, kind: 'page', url: 'https://www.crunchyroll.com/' },

  { key: 'abema', name: 'Abema', short: 'Abema', icon: 'a.square.fill', brand: { light: '#0F8A5F', dark: '#39D9A0' }, kind: 'page', url: 'https://abema.tv/' },
  { key: 'unext', name: 'U-NEXT', short: 'U-NEXT', icon: 'u.square.fill', brand: { light: '#22242B', dark: '#C9CBD4' }, kind: 'page', url: 'https://video.unext.jp/' },
  { key: 'bahamut', name: '巴哈姆特動畫瘋', short: '巴哈', icon: 'b.square.fill', brand: { light: '#1273B8', dark: '#4FB0F0' }, kind: 'page', url: 'https://ani.gamer.com.tw/', want: 'TW' },
  { key: 'iplayer', name: 'BBC iPlayer', short: 'BBC', icon: 'i.square.fill', brand: { light: '#B32B22', dark: '#FF6B60' }, kind: 'page', url: 'https://www.bbc.co.uk/iplayer', want: 'UK' },
  { key: 'paramount', name: 'Paramount+', short: 'Paramount', icon: 'q.square.fill', brand: { light: '#1A5FBF', dark: '#5FA0FF' }, kind: 'page', url: 'https://www.paramountplus.com/', want: 'US' },

  // ---- 第二批（补齐全球主要锁定区）----
  { key: 'apple', name: 'Apple TV+', short: 'Apple', icon: 'v.square.fill', brand: { light: '#3A3A44', dark: '#C7C7D2' }, kind: 'page', url: 'https://tv.apple.com/' },
  { key: 'grok', name: 'Grok', short: 'Grok', icon: 'o.square.fill', brand: { light: '#1C1C1E', dark: '#F2F2F7' }, kind: 'page', url: 'https://grok.com/' },
  { key: 'dmm', name: 'DMM TV', short: 'DMM', icon: 'j.square.fill', brand: { light: '#B02A6E', dark: '#FF6FB5' }, kind: 'page', url: 'https://tv.dmm.com/', want: 'JP' },
  { key: 'itvx', name: 'ITVX', short: 'ITVX', icon: 'x.square.fill', brand: { light: '#0F7BC4', dark: '#57B8F0' }, kind: 'page', url: 'https://www.itv.com/', want: 'UK' },
  { key: 'peacock', name: 'Peacock', short: 'Peacock', icon: 'k.square.fill', brand: { light: '#8A2BB0', dark: '#C77BFF' }, kind: 'page', url: 'https://www.peacocktv.com/', want: 'US' },
  { key: 'stan', name: 'Stan', short: 'Stan', icon: 's.square.fill', brand: { light: '#1F8A8A', dark: '#4FD1C5' }, kind: 'page', url: 'https://www.stan.com.au/', want: 'AU' },
  { key: 'crave', name: 'Crave', short: 'Crave', icon: 'z.square.fill', brand: { light: '#8A6D1F', dark: '#D6B25E' }, kind: 'page', url: 'https://www.crave.ca/', want: 'CA' },
  { key: 'viu', name: 'Viu', short: 'Viu', icon: 'w.square.fill', brand: { light: '#D4890A', dark: '#FFC24D' }, kind: 'page', url: 'https://www.viu.com/', want: 'HK' },
];

const C = {
  title: { light: '#1C1C1E', dark: '#FFFFFF' },
  sub: { light: '#8A8A8E', dark: '#9A9AA0' },
  main: { light: '#2C2C34', dark: '#F2F2F7' },
  accent: { light: '#5E5CE6', dark: '#8E8CFF' },
  barBg: { light: '#00000018', dark: '#FFFFFF22' },
};

/** 状态 → 文案 + 配色（tint 文字色 / bg 胶囊底 / dot 圆点） */
const STATUS = {
  full: {
    text: '全解锁',
    tint: { light: '#1F7A34', dark: '#30D158' },
    bg: { light: '#1F7A3422', dark: '#30D15833' },
    dot: { light: '#248A3D', dark: '#30D158' },
  },
  original: {
    text: '仅自制',
    tint: { light: '#B36A00', dark: '#FFB340' },
    bg: { light: '#B36A0022', dark: '#FFB34033' },
    dot: { light: '#C26A00', dark: '#FF9F0A' },
  },
  none: {
    text: '未解锁',
    tint: { light: '#B32B22', dark: '#FF6B60' },
    bg: { light: '#B32B2222', dark: '#FF453A33' },
    dot: { light: '#C7362C', dark: '#FF453A' },
  },
  fail: {
    text: '失败',
    tint: { light: '#8A8A8E', dark: '#9A9AA0' },
    bg: { light: '#8A8A8E22', dark: '#9A9AA033' },
    dot: { light: '#8A8A8E', dark: '#9A9AA0' },
  },
};

/** 被判定为「地区不支持」的页面特征 */
const LOCKED = /not available in your|unavailable in your|isn't available in your|unsupported_country|is not available in your|not available in this country|only available in|地区外|此内容在您所在的国家|在你所在的国家|ご利用いただけません|お住まいの地域/i;

/** 平台被拦截时的典型文案（错误处理时用得到） */
const notAvailable = (label) => `${label} 在当前地区不可用`;

async function probe(ctx, url, timeout) {
  const t0 = Date.now();
  try {
    const resp = await ctx.http.get(url, { timeout, redirect: 'follow' });
    const text = await resp.text();
    return { ok: true, status: resp.status, text, ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, status: 0, text: '', ms: Date.now() - t0, error: String((e && e.message) || e) };
  }
}

const isOpen = (res) => res.ok && res.status === 200 && !LOCKED.test(res.text);

/** 从页面里抠地区代码：Netflix 的 requestCountry、Cloudflare 的 loc= 等 */
function regionOf(text) {
  if (!text) return null;
  const m =
    /"(?:requestCountry|countryOfOrigin|countryCode|country)"\s*:\s*\{?[^{}]{0,40}?"(?:id|code)"\s*:\s*"([A-Za-z]{2})"/.exec(text) ||
    /\bloc=([A-Za-z]{2})\b/.exec(text) ||
    /"country"\s*:\s*"([A-Za-z]{2})"/.exec(text) ||
    /"countryCode"\s*:\s*"([A-Za-z]{2})"/.exec(text);
  return m ? m[1].toUpperCase() : null;
}

function flagOf(code) {
  if (!code || code.length !== 2) return '';
  return String.fromCodePoint(...code.toUpperCase().split('').map((c) => 127397 + c.charCodeAt(0)));
}

/** 分批发请求，避免一次甩出十几个连接 */
async function batched(items, size, worker) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    const chunk = await Promise.all(items.slice(i, i + size).map(worker));
    out.push(...chunk);
  }
  return out;
}

/** 探测单个平台 */
async function runProbe(svc, ctx, timeout, env, overrides) {
  const base = overrides[svc.key] || svc.url;

  // Netflix：限定剧 + 自制剧，能分出「全解锁 / 仅自制」两档
  if (svc.kind === 'netflix') {
    const [limited, original] = await Promise.all([
      probe(ctx, `${base}/title/81215567`, timeout),
      probe(ctx, `${base}/title/81280792`, timeout),
    ]);
    const ms = Math.max(limited.ms, original.ms);
    const region = regionOf(limited.text) || regionOf(original.text);
    if (isOpen(limited)) return { status: 'full', region, ms };
    if (isOpen(original)) return { status: 'original', region, ms };
    return { status: limited.ok ? 'none' : 'fail', region, ms, error: limited.error };
  }

  // ChatGPT：正文判定 + 用 Cloudflare trace 拿地区
  if (svc.kind === 'chatgpt') {
    const [res, trace] = await Promise.all([
      probe(ctx, base, timeout),
      probe(ctx, 'https://chat.openai.com/cdn-cgi/trace', timeout),
    ]);
    return {
      status: isOpen(res) ? 'full' : res.ok ? 'none' : 'fail',
      region: regionOf(trace.text) || regionOf(res.text),
      ms: Math.max(res.ms, trace.ms),
      error: res.error || trace.error,
    };
  }

  // 其余平台：一次请求定胜负
  const res = await probe(ctx, base, timeout);
  return {
    status: isOpen(res) ? 'full' : res.ok ? 'none' : 'fail',
    region: regionOf(res.text),
    ms: res.ms,
    error: res.error,
  };
}

export default async function (ctx) {
  const env = ctx.env || {};
  const family = ctx.widgetFamily || 'systemMedium';
  const timeout = Number(env.TIMEOUT) || 8000;
  const batchSize = Math.max(Number(env.BATCH) || 8, 1);
  const title = env.TITLE || '流媒体解锁';

  const only = String(env.SERVICES || '')
    .split(/[,\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const list = only.length ? SERVICES.filter((s) => only.includes(s.key)) : SERVICES.slice();

  const overrides = {};
  for (const svc of SERVICES) {
    const v = env[`PROBE_${svc.key.toUpperCase()}`];
    if (v) overrides[svc.key] = v;
  }

  const size = (t, sz, w, color, extra = {}) => ({
    type: 'text',
    text: t,
    font: { size: sz, weight: w },
    textColor: color,
    maxLines: 1,
    minScale: 0.55,
    ...extra,
  });

  const bg = {
    type: 'linear',
    colors: [{ light: '#FFFFFF', dark: '#141024' }, { light: '#F1EEFF', dark: '#241B3E' }],
    startPoint: { x: 0, y: 0 },
    endPoint: { x: 1, y: 1 },
  };

  // ---- 并发分批探测（顺便取落地 IP，跟平台探测并行）----
  const t0 = Date.now();
  const showIp = (env.SHOW_IP || 'true') !== 'false';
  const ipPromise = showIp
    ? probe(ctx, env.IP_URL || 'https://api64.ipify.org?format=json', timeout)
    : Promise.resolve(null);

  const results = await batched(list, batchSize, async (svc) => {
    try {
      const r = await runProbe(svc, ctx, timeout, env, overrides);
      return { ...svc, ...r };
    } catch (e) {
      return { ...svc, status: 'fail', region: null, ms: 0, error: String((e && e.message) || e) };
    }
  });
  const cost = Date.now() - t0;

  // 落地 IP + 归属（ctx.lookupIP 是 Egern 内置的，不用第三方接口）
  let ipInfo = null;
  try {
    const ipRes = await ipPromise;
    if (ipRes && ipRes.ok) {
      const ip = (JSON.parse(ipRes.text) || {}).ip;
      if (ip) ipInfo = { ip, geo: typeof ctx.lookupIP === 'function' ? ctx.lookupIP(ip) : null };
    }
  } catch (e) {
    ipInfo = null;
  }

  const count = (st) => results.filter((r) => r.status === st).length;
  const usable = count('full') + count('original');
  const region =
    env.LOCATION || (results.find((r) => r.region) || {}).region || (ipInfo && ipInfo.geo && ipInfo.geo.country) || null;
  const now = new Date();
  const timeText = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const refreshAfter = new Date(now.getTime() + 6 * 3600 * 1000).toISOString();

  const allFull = usable === results.length && results.length > 0;

  /** 没解锁的平台各自「缺哪个区」，用于给出换区建议 */
  const missingTally = (() => {
    const tally = {};
    for (const r of results) {
      if (r.status === 'full' || !r.want) continue;
      tally[r.want] = (tally[r.want] || 0) + 1;
    }
    return Object.entries(tally).sort((a, b) => b[1] - a[1]);
  })();
  const missingRegions = missingTally.map(([code, n]) => `${code} ×${n}`).join(' · ');
  const topMissing = missingTally.find(([, n]) => n >= 2) || null;

  /** 状态分布条：比一行纯文字更直观 */
  const distBar = (h) => {
    const segs = [
      { n: count('full'), c: STATUS.full.dot },
      { n: count('original'), c: STATUS.original.dot },
      { n: count('none'), c: STATUS.none.dot },
      { n: count('fail'), c: STATUS.fail.dot },
    ].filter((s) => s.n > 0);
    return {
      type: 'stack',
      direction: 'row',
      height: h,
      borderRadius: h / 2,
      backgroundColor: C.barBg,
      children: segs.map((s) => ({
        type: 'stack',
        flex: s.n,
        height: h,
        backgroundColor: s.c,
        children: [{ type: 'spacer' }],
      })),
    };
  };

  const legend = [
    `全解锁 ${count('full')}`,
    count('original') ? `仅自制 ${count('original')}` : null,
    `未解锁 ${count('none')}`,
    `失败 ${count('fail')}`,
  ]
    .filter(Boolean)
    .join(' · ');

  /** 状态胶囊（中/大尺寸用不上，留作列表样式备用） */
  const pill = (st) => ({
    type: 'stack',
    direction: 'row',
    backgroundColor: STATUS[st].bg,
    borderRadius: 6,
    padding: [1.5, 6, 1.5, 6],
    children: [size(STATUS[st].text, 10.5, 'bold', STATUS[st].tint)],
  });

  const dot = (st) => ({
    type: 'stack',
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: STATUS[st].dot,
    children: [{ type: 'spacer' }],
  });

  const header = {
    type: 'stack',
    direction: 'row',
    alignItems: 'center',
    gap: 6,
    children: [
      { type: 'image', src: 'sf-symbol:play.tv.fill', color: C.accent, width: 15, height: 15 },
      size(title, 13.5, 'heavy', C.title),
      { type: 'spacer' },
      // 地区用国旗就够，旁边再放文本代码在真机上会显得重复
      size(region ? flagOf(region) : '地区未知', 12.5, 'semibold', C.main),
      size(`${usable}/${results.length}`, 12, 'bold', allFull ? STATUS.full.tint : C.sub),
    ],
  };

  /** 小尺寸头部：宽度只有 130pt，放不下标题 + 地区 + 计数三样，只留前两样 */
  const headerNarrow = {
    type: 'stack',
    direction: 'row',
    alignItems: 'center',
    gap: 6,
    children: [
      { type: 'image', src: 'sf-symbol:play.tv.fill', color: C.accent, width: 14, height: 14 },
      size(title, 13, 'heavy', C.title, { flex: 1 }),
      size(region ? flagOf(region) : '', 12.5, 'semibold', C.main),
    ],
  };

  // ---- 锁屏尺寸 ----
  if (family === 'accessoryRectangular' || family === 'accessoryInline') {
    const bad = results.filter((r) => r.status === 'none' || r.status === 'fail');
    const summary = bad.length ? `不可用 ${bad.length} 个` : `全部解锁 ${results.length}`;
    if (family === 'accessoryInline') {
      return { type: 'widget', children: [size(`${region || '🌐'} 解锁 ${usable}/${results.length}`, 13, 'semibold', '#FFFFFF')] };
    }
    return {
      type: 'widget',
      padding: [2, 4, 2, 4],
      children: [
        {
          type: 'stack',
          direction: 'column',
          gap: 1,
          children: [
            size(`🎬 ${title}${region ? ' · ' + region : ''}`, 13, 'semibold', '#FFFFFF'),
            size(`${usable}/${results.length} 可用 · ${summary}`, 11, 'regular', '#FFFFFFCC'),
          ],
        },
      ],
    };
  }
  if (family === 'accessoryCircular') {
    return {
      type: 'widget',
      padding: 2,
      children: [
        {
          type: 'stack',
          direction: 'column',
          alignItems: 'center',
          flex: 1,
          gap: 0,
          children: [
            size(`${usable}/${results.length}`, 15, 'bold', '#FFFFFF', { textAlign: 'center' }),
            size('可用', 9, 'medium', '#FFFFFFCC', { textAlign: 'center' }),
          ],
        },
      ],
    };
  }

  // ---- 状态点阵：小尺寸竖向排，每行 perRow 个 ----
  // max 用来限制点阵数量：小尺寸最多显示 16 个点（2 行 × 8），再多只影响大尺寸
  const dotMatrix = (perRow, max) => {
    const items = max ? results.slice(0, max) : results;
    const rows = [];
    for (let i = 0; i < items.length; i += perRow) {
      rows.push({
        type: 'stack',
        direction: 'row',
        alignItems: 'center',
        gap: 4,
        children: items.slice(i, i + perRow).map((r) => dot(r.status)),
      });
    }
    return {
      type: 'stack',
      direction: 'column',
      alignItems: 'center',
      gap: 4,
      children: rows,
    };
  };

  // ---- systemSmall ----
  if (family === 'systemSmall') {
    return {
      type: 'widget',
      refreshAfter,
      padding: 13,
      gap: 4,
      backgroundGradient: bg,
      ...(env.TAP_URL ? { url: env.TAP_URL } : {}),
      children: [
        headerNarrow,
        { type: 'spacer', length: 2 },
        {
          type: 'stack',
          direction: 'row',
          alignItems: 'end',
          gap: 6,
          children: [
            size(`${usable}/${results.length}`, 26, 'black', allFull ? STATUS.full.tint : C.main),
            size('个可用', 10, 'semibold', C.sub),
          ],
        },
        dotMatrix(8, 16),
        { type: 'spacer' },
        size(`锁 ${count('none')} · 失败 ${count('fail')} · ${timeText}`, 9, 'regular', C.sub),
      ],
    };
  }

  // ---- medium / large：两列网格 ----
  const big = family === 'systemLarge' || family === 'systemExtraLarge';
  const maxRows = big ? 26 : 8;
  const perColumn = Math.ceil(Math.min(results.length, maxRows) / 2);
  const shown = results.slice(0, perColumn * 2);

  const cell = (r) => ({
    type: 'stack',
    direction: 'row',
    alignItems: 'center',
    gap: 5,
    children: [
      { type: 'image', src: `sf-symbol:${r.icon}`, color: r.brand, width: 12, height: 12 },
      size(r.short, 11, 'semibold', C.main, { flex: 1, minScale: 0.7 }),
      ...(big && r.region ? [size(r.region, 8.5, 'medium', C.sub)] : []),
      size(STATUS[r.status].text, 10, 'bold', STATUS[r.status].tint),
    ],
  });

  const column = (items) => ({
    type: 'stack',
    direction: 'column',
    gap: big ? 6 : 6,
    flex: 1,
    children: items.map(cell),
  });

  const grid = {
    type: 'stack',
    direction: 'row',
    alignItems: 'start',
    gap: 12,
    children: [column(shown.slice(0, perColumn)), column(shown.slice(perColumn))],
  };

  const children = [
    header,
    { type: 'spacer', length: big ? 6 : 5 },
    distBar(big ? 6 : 5),
    { type: 'spacer', length: 4 },
    // 时间和耗时并进图例里，省下底部一整行
    size(`${legend} · ${timeText} · ${(cost / 1000).toFixed(1)}s`, 9.5, 'regular', C.sub, { minScale: 0.8 }),
    { type: 'spacer', length: big ? 8 : 5 },
    grid,
  ];

  /** 底部信息行：图标 + 标签 + 右对齐的值 */
  const infoLine = (icon, label, value, valueColor) => ({
    type: 'stack',
    direction: 'row',
    alignItems: 'center',
    gap: 6,
    children: [
      { type: 'image', src: `sf-symbol:${icon}`, color: C.sub, width: 12, height: 12 },
      size(label, 10.5, 'regular', C.sub),
      { type: 'spacer' },
      size(value, 11, 'semibold', valueColor || C.main, { minScale: 0.75 }),
    ],
  });

  if (big) {
    const push = (line, gap = 4) => {
      if (!line) return;
      if (children.length) children.push({ type: 'spacer', length: gap });
      children.push(line);
    };

    // 探测延迟：能看出是节点慢还是平台本身慢
    const timed = results.filter((r) => r.status !== 'fail' && r.ms > 0).sort((a, b) => b.ms - a.ms);
    if (timed.length) {
      const avg = Math.round(timed.reduce((s, r) => s + r.ms, 0) / timed.length);
      push(
        infoLine(
          'speedometer',
          '探测延迟',
          `平均 ${avg}ms · 最慢 ${timed[0].short} ${timed[0].ms}ms`
        )
      );
    }

    if (ipInfo) {
      push(infoLine('globe', '落地 IP', ipInfo.ip), 5);
      if (ipInfo.geo) {
        const geoText = [ipInfo.geo.country, ipInfo.geo.asn ? `AS${ipInfo.geo.asn}` : null, ipInfo.geo.organization]
          .filter(Boolean)
          .join(' · ');
        if (geoText) {
          children.push({ type: 'spacer', length: 2 });
          children.push(size(geoText, 9, 'regular', C.sub));
        }
      }
    }
  }
  // 中尺寸不再加「另有 N 个」提示：图例里的总数已经说明了还有多少

  return {
    type: 'widget',
    refreshAfter,
    // 间距全部走显式 spacer：根容器再设 gap 会和它们叠加，把网格挤掉一行
    padding: 14,
    gap: 0,
    backgroundGradient: bg,
    ...(env.TAP_URL ? { url: env.TAP_URL } : {}),
    children: [...children, { type: 'spacer' }],
  };
}
