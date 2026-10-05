/**
 * CleanIP 综合报告 —— Egern 小组件（generic 脚本）
 * ===========================================================================
 * 数据来源：cleanip.io 官方公开 API
 *   GET  /api/v2/me          当前出口 IP 的完整报告（受 policy / policyDescriptor 影响）
 *   GET  /api/v2/{ip}        指定 IP / 域名的完整报告
 *   GET  /api/v2/challenge   获取反爬 challenge（seed + difficulty）
 *   POST /api/v2/token       用 SHA-256 工作量证明换取 X-Anti-Bot-Token
 *
 * 关键实现说明
 *   1. cleanip 的 /api/v2/* 需要 X-Anti-Bot-Token，token 由 SHA-256 PoW 换取。
 *      Egern 的 JS 环境没有内置哈希，因此脚本内置了一份纯 JS SHA-256。
 *   2. 实测服务端校验的前导零位数（16）高于 challenge 返回的 difficulty（4），
 *      脚本按 max(difficulty, 16) 求解；token 若被拒会自动加深（最多 22 位）。
 *   3. 所有请求都经 ctx.http 发出并附带 POLICY，
 *      因此「出口 IP」= 该策略组的出口 → 换策略组即换 IP。
 *
 * Env
 *   IP            指定查询的 IP / 域名；留空 = 当前出口 IP。（默认空）
 *   POLICY        代理策略，如 "PROXY"、"DIRECT" 或某个策略组名。（默认空 = 全局路由）
 *   LANGUAGE      卡片语言 zh / en。（默认 zh）
 *   REFRESH_MIN   刷新间隔（分钟，最小 5）。（默认 15）
 */

'use strict';

const API_BASE = 'https://cleanip.io';

// 与 cleanip.io 卡片一致的配色
const C = {
  bg: '#ffffff',
  line: '#e5e7eb',
  card: '#f8f9fa',
  ink: '#111827',
  muted: '#6b7280',
  green: '#16a34a',
  red: '#dc2626',
  amber: '#ca8a04',
  lime: '#65a30d',
  orange: '#ea580c',
  brand: '#35a952',
};

/**
 * 精确布局常量（单位 pt）。按 iOS medium 小组件 364×170 设计。
 * 注意：Egern 的 text 元素没有 height 属性，行高由「数字字号」决定，
 *      所以下面的 fs* 同时是字号与行高，垂直间距全部用 spacer 控制。
 */
const L = {
  rootPad: 8,
  rootGap: 3,
  panelPad: 6,
  // 字号 / 行高
  fsKicker: 6,     // 你的 IP · IPv6
  fsIP: 10,        // IP 地址
  fsGeo: 6.5,      // 国家 · 省份 · 城市
  fsASN: 6.5,      // ASxxxx · 组织
  fsBadge: 5.5,    // 类型徽章
  fsSection: 6.5,  // 分区标题
  fsGauge: 6,      // 综合评分
  fsPurity: 6.5,   // 纯净度 xx
  fsBar: 6.5,      // 评分构成
  fsRisk: 6.5,     // 风险检测
  fsRiskSub: 6,    // 风险结论
  fsPlat: 6.5,     // 场景适配
  fsFooter: 6,     // 页脚
  // 间距
  sp1: 1,
  sp2: 2,
  spTitle: 3,
  spAfterTrack: 4,
  // 尺寸
  badgeH: 10,
  gauge: 22,
  trackH: 2.5,
  headerH: 35,
  barBarH: 10,
  barsH: 34,
  riskCellH: 12,
  riskH: 26,
  platCellH: 19,
  platH: 35,
  barCol: 140,
  barGap: 12,
};

const POW_FLOOR = 16;
const POW_MAX = 22;

// ============================ 纯 JS SHA-256 ===============================
const SHA_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
const SHA_W = new Uint32Array(64);
const rotr = (x, n) => ((x >>> n) | (x << (32 - n))) >>> 0;

/** SHA-256 的前两个大端字（PoW 只关心前导零位数）。 */
function sha256Head(bytes, len) {
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a,
      h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  const total = (((len + 9) + 63) >> 6) << 6;
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) {
      const p = off + i * 4;
      const b0 = p     < len ? bytes[p]     : (p     === len ? 0x80 : 0);
      const b1 = p + 1 < len ? bytes[p + 1] : (p + 1 === len ? 0x80 : 0);
      const b2 = p + 2 < len ? bytes[p + 2] : (p + 2 === len ? 0x80 : 0);
      const b3 = p + 3 < len ? bytes[p + 3] : (p + 3 === len ? 0x80 : 0);
      SHA_W[i] = ((b0 << 24) | (b1 << 16) | (b2 << 8) | b3) >>> 0;
    }
    if (off + 64 === total) {
      SHA_W[14] = Math.floor((len * 8) / 4294967296) >>> 0;
      SHA_W[15] = (len * 8) >>> 0;
    }
    for (let i = 16; i < 64; i++) {
      const x = SHA_W[i - 15], y = SHA_W[i - 2];
      const s0 = (rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3)) >>> 0;
      const s1 = (rotr(y, 17) ^ rotr(y, 19) ^ (y >>> 10)) >>> 0;
      SHA_W[i] = (SHA_W[i - 16] + s0 + SHA_W[i - 7] + s1) >>> 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const t1 = (h + S1 + ch + SHA_K[i] + SHA_W[i]) >>> 0;
      const S0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0;
      const mj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const t2 = (S0 + mj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }
  return { hi: h0, lo: h1 };
}

/** 运行环境若暴露 WebCrypto 就用它加速；否则回退纯 JS。 */
async function sha256HeadAsync(bytes, len) {
  const subtle = typeof crypto !== 'undefined' && crypto && crypto.subtle;
  if (subtle && typeof subtle.digest === 'function') {
    try {
      const buf = await subtle.digest('SHA-256', bytes.slice(0, len));
      const v = new DataView(buf);
      return { hi: v.getUint32(0, false), lo: v.getUint32(4, false) };
    } catch (err) { /* 回退 */ }
  }
  return sha256Head(bytes, len);
}

/** 暴力搜索 nonce，使 sha256(seed + ':' + nonce) 的前导零位数 >= bits。 */
async function solvePow(seed, bits, budgetMs) {
  const base = seed.length + 1;
  const buf = new Uint8Array(base + 20);
  for (let i = 0; i < seed.length; i++) buf[i] = seed.charCodeAt(i) & 255;
  buf[seed.length] = 0x3a; // ':'
  const t0 = Date.now();
  for (let i = 0; i < 30000000; i++) {
    const s = String(i);
    for (let k = 0; k < s.length; k++) buf[base + k] = s.charCodeAt(k) & 255;
    const { hi, lo } = await sha256HeadAsync(buf, base + s.length);
    const zeros = hi === 0 ? 32 + Math.clz32(lo) : Math.clz32(hi);
    if (zeros >= bits) return String(i);
    if ((i & 8191) === 8191 && Date.now() - t0 > budgetMs) return null;
  }
  return null;
}

// ============================== 工具 ======================================
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const t = (lang, zh, en) => (lang === 'en' ? en : zh);
const nil = (v) => v === null || v === undefined || v === '';

/** 综合评分色带（与 cleanip.io 前端一致） */
function bandColor(score) {
  const s = clamp(Number(score) || 0, 0, 100);
  if (s >= 95) return C.brand;
  if (s >= 85) return '#22c55e';
  if (s >= 70) return C.lime;
  if (s >= 50) return '#eab308';
  if (s >= 25) return C.orange;
  return C.red;
}

const SAFETY = {
  safe: { zh: '适合', en: 'Good', color: C.green },
  caution: { zh: '可试', en: 'Caution', color: C.amber },
  risk: { zh: '不宜', en: 'Avoid', color: C.red },
  danger: { zh: '不宜', en: 'Avoid', color: C.red },
  unknown: { zh: '待评估', en: 'Unknown', color: C.muted },
};
const safetyOf = (v) => SAFETY[String(v || '').toLowerCase()] || SAFETY.unknown;

const PLATFORMS = [
  { key: 'ai_subscription', zh: 'AI 应用', en: 'AI' },
  { key: 'youtube', zh: '流媒体', en: 'Streaming' },
  { key: 'tiktok', zh: 'TikTok', en: 'TikTok' },
  { key: 'twitter', zh: 'X', en: 'X' },
  { key: 'facebook', zh: 'Facebook', en: 'Facebook' },
  { key: 'ecommerce', zh: '跨境电商', en: 'E-commerce' },
  { key: 'payment', zh: '支付', en: 'Payment' },
  { key: 'gaming', zh: '游戏', en: 'Gaming' },
];

const PART_LABELS = {
  reputation: { zh: '信誉记录', en: 'Reputation' },
  neighborhood: { zh: '邻居号段', en: 'Neighbors' },
  provenance: { zh: '归属来源', en: 'Provenance' },
  asn_profile: { zh: '网络画像', en: 'ASN' },
};

const RISK_SLOTS = [
  { zh: 'VPN', en: 'VPN', flag: 'is_vpn', check: 'vpn' },
  { zh: '代理', en: 'Proxy', flag: 'is_proxy', check: 'proxy' },
  { zh: 'Tor', en: 'Tor', flag: 'is_tor', check: 'tor' },
  { zh: '中继', en: 'Relay', flag: 'is_relay', check: null },
];

// ============================== HTTP ======================================
function headerIndex(headers) {
  const map = Object.create(null);
  if (!headers) return map;
  const put = (k, v) => { map[String(k).toLowerCase()] = v; };
  if (typeof headers.forEach === 'function' && typeof headers.get === 'function') {
    headers.forEach((v, k) => put(k, v));
  } else if (Array.isArray(headers)) {
    headers.forEach((p) => { if (p && p.length >= 2) put(p[0], p[1]); });
  } else if (typeof headers === 'object') {
    Object.keys(headers).forEach((k) => put(k, headers[k]));
  }
  return map;
}

async function readJson(resp) {
  try {
    if (resp && typeof resp.json === 'function') return await resp.json();
    if (resp && typeof resp.text === 'function') return JSON.parse(await resp.text());
  } catch (err) { /* ignore */ }
  return null;
}

function makeHttp(ctx, policy) {
  // token 保存在闭包里，getJson 时自动带上 X-Anti-Bot-Token
  let token = null;
  const call = (path, init) => {
    const headers = Object.assign({}, init.headers || {});
    if (token && !headers['X-Anti-Bot-Token']) headers['X-Anti-Bot-Token'] = token;
    const opts = { headers, timeout: 25000 };
    if (init.method) opts.method = init.method;
    if (init.body !== undefined) opts.body = init.body;
    // 关键：把策略交给 Egern，出口即该策略的出口
    if (policy && policy.toUpperCase() !== 'DIRECT') opts.policy = policy;
    return ctx.http.get(API_BASE + path, opts);
  };
  return {
    setToken: (v) => { token = v; },
    getJson: async (path) => {
      const r = await call(path, { method: 'GET', headers: { accept: 'application/json' } });
      return { status: r.status, headers: headerIndex(r.headers), json: await readJson(r) };
    },
    postJson: async (path, body) => {
      const r = await call(path, {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body,
      });
      return { status: r.status, headers: headerIndex(r.headers), json: await readJson(r) };
    },
  };
}

// ============================ Token =======================================
const TOKEN_SLOT = 'cleanip.token.v1';

async function getToken(http, ctx, forceNew) {
  const now = Date.now();
  if (!forceNew) {
    let cached = null;
    try { cached = ctx.storage.getJSON(TOKEN_SLOT); } catch (err) { cached = null; }
    if (cached && cached.token && cached.exp && cached.exp - now > 60000) {
      http.setToken(cached.token);
      return cached.token;
    }
  }
  let bits = POW_FLOOR;
  for (let attempt = 0; attempt < 3; attempt++) {
    const chRes = await http.getJson('/api/v2/challenge');
    const ch = chRes.json;
    if (!ch || !ch.seed) return null;
    const nonce = await solvePow(ch.seed, Math.max(Number(ch.difficulty) || 0, bits), 12000);
    if (nonce === null) { bits = Math.min(bits + 2, POW_MAX); continue; }
    const tkRes = await http.postJson('/api/v2/token', { seed: ch.seed, nonce });
    const tk = tkRes.json;
    if (tk && tk.token) {
      http.setToken(tk.token);
      try { ctx.storage.setJSON(TOKEN_SLOT, { token: tk.token, exp: tk.exp || now + 300000 }); } catch (err) { /* ignore */ }
      return tk.token;
    }
    bits = Math.min(bits + 2, POW_MAX);
  }
  return null;
}

/** 拉取报告；命中 401 时自动重取 token 后重试一次。 */
async function fetchReport(http, ctx, path) {
  let last = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await http.getJson(path);
    last = res;
    if (res.status !== 401 && !(res.json && res.json.code === 'need_token')) return res;
    if (attempt >= 2) return res;                       // 连续失败：把服务端错误原样抛出
    const token = await getToken(http, ctx, attempt > 0);
    if (!token) return res;                             // 拿不到 token：不再空转
  }
  return last || { status: 0, json: null };
}

// ============================== DSL 辅助 ==================================
// 注意：Egern 的 text 不支持 height，行高由数字字号决定，因此字号即行高。
const txt = (text, size, color, extra) => Object.assign({
  type: 'text', text: String(text), font: { size }, textColor: color,
}, extra || {});
const box = (extra) => Object.assign({ type: 'stack', direction: 'column', alignItems: 'start', children: [] }, extra || {});
const row = (children, extra) => Object.assign({ type: 'stack', direction: 'row', alignItems: 'center', gap: 0, children }, extra || {});
const col = (children, extra) => Object.assign({ type: 'stack', direction: 'column', alignItems: 'start', gap: 0, children }, extra || {});
const sp = (n) => ({ type: 'spacer', length: n });
const fill = () => ({ type: 'spacer' });

/** 白底圆角面板 */
const panel = (children, extra) => Object.assign({
  type: 'stack', direction: 'column', alignItems: 'start', gap: 0,
  backgroundColor: C.card, borderRadius: 5, padding: L.panelPad, children,
}, extra || {});

/** 分区标题（绿色竖条 + 文字） */
const sectionTitle = (title) => row([
  box({ width: 1.5, height: 6.5, backgroundColor: C.brand, borderRadius: 1 }),
  sp(4),
  txt(title, L.fsSection, C.ink, { weight: 'bold' }),
], { width: '100%' });

/** 进度条 */
function progress(value, color, width, filled) {
  const track = box({ width, height: L.trackH, backgroundColor: C.line, borderRadius: 1.5 });
  if (filled) {
    track.children = [box({
      width: Math.round(width * clamp(value, 0, 100)) / 100,
      height: L.trackH, backgroundColor: color, borderRadius: 1.5,
    })];
  }
  return track;
}

/** 评分构成一栏（标签 + 数值 + 进度条） */
function scoreBar(part, lang) {
  const meta = PART_LABELS[part && part.key] || { zh: (part && part.key) || '—', en: (part && part.key) || '—' };
  const has = part && !nil(part.score);
  const value = has ? Math.round(part.score) : null;
  const color = has ? bandColor(value) : C.muted;
  const shown = has ? String(value) : t(lang, '未测', 'N/A');
  return col([
    row([
      txt(t(lang, meta.zh, meta.en), L.fsBar, C.ink, { maxLines: 1, minScale: 0.7 }),
      fill(),
      txt(shown, L.fsBar, color, { weight: 'bold' }),
    ], { width: '100%' }),
    sp(L.sp1),
    progress(value === null ? 0 : value, color, L.barCol, has),
  ], { width: L.barCol });
}

/** 风险检测一栏（勾选 + 名称 + 结论） */
function riskCell(slot, hit, lang) {
  return col([
    row([
      txt(hit ? '\u2715' : '\u2713', L.fsRisk, hit ? C.red : C.green, { weight: 'bold' }),
      sp(2.5),
      txt(t(lang, slot.zh, slot.en), L.fsRisk, C.ink, { weight: 'semibold', maxLines: 1, minScale: 0.7 }),
    ], { width: '100%' }),
    txt(hit ? t(lang, '已检出', 'Detected') : t(lang, '未检出', 'Not found'),
      L.fsRiskSub, hit ? C.red : C.muted, { maxLines: 1, minScale: 0.7 }),
  ], { flex: 1, alignItems: 'start' });
}

/** 场景适配一栏（名称 + 结论 + 色条） */
function platformCell(p, lang) {
  const st = safetyOf(p.state);
  return col([
    txt(t(lang, p.zh, p.en), L.fsPlat, C.ink, { maxLines: 1, minScale: 0.45, textAlign: 'center', width: '100%' }),
    txt(t(lang, st.zh, st.en), L.fsPlat, st.color, { weight: 'bold', textAlign: 'center', width: '100%' }),
    sp(2),
    box({ width: 14, height: 1.8, backgroundColor: st.color, borderRadius: 1 }),
  ], { flex: 1, alignItems: 'center' });
}

/** 环形评分仪表盘（内联 SVG，分数与等级画在环心） */
function gaugeSvg(score, color, grade, gradeColor) {
  const pct = clamp(Number(score) || 0, 0, 100) / 100;
  const r = 60, circumference = 2 * Math.PI * r;
  const drawn = pct >= 1 ? circumference : circumference * pct;
  const label = nil(score) ? '' : String(score);
  const gradeText = grade ? String(grade) : '';
  return `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 140 140'>` +
    `<circle cx='70' cy='70' r='${r}' fill='none' stroke='${C.line}' stroke-width='11'/>` +
    `<circle cx='70' cy='70' r='${r}' fill='none' stroke='${color}' stroke-width='11' ` +
    `stroke-linecap='round' stroke-dasharray='${drawn.toFixed(1)} ${(circumference + 2).toFixed(1)}' ` +
    `transform='rotate(-90 70 70)'/>` +
    (gradeText
      ? `<text x='70' y='50' text-anchor='middle' font-family='-apple-system,Helvetica,Arial,sans-serif' ` +
        `font-size='26' font-weight='600' fill='${gradeColor || C.muted}'>${gradeText}</text>`
      : '') +
    (label
      ? `<text x='70' y='${gradeText ? 96 : 88}' text-anchor='middle' ` +
        `font-family='-apple-system,Helvetica,Arial,sans-serif' font-size='46' font-weight='700' ` +
        `fill='${color}'>${label}</text>`
      : '') +
    `</svg>`;
}

// ============================== 主入口 ====================================
export default async function (ctx) {
  const env = ctx.env || {};
  const lang = String(env.LANGUAGE || 'zh').toLowerCase().startsWith('en') ? 'en' : 'zh';
  const policy = String(env.POLICY || '').trim();
  const ipInput = String(env.IP || '').trim();
  const refreshMin = Math.max(5, Number(env.REFRESH_MIN) || 15);
  const refreshAfter = new Date(Date.now() + refreshMin * 60000).toISOString();

  const http = makeHttp(ctx, policy);
  // 先用缓存里的 token 武装第一次请求，避免多打一次 401
  try {
    const cached = ctx.storage.getJSON(TOKEN_SLOT);
    if (cached && cached.token && cached.exp && cached.exp - Date.now() > 60000) http.setToken(cached.token);
  } catch (err) { /* ignore */ }

  let data = null;
  let error = null;
  try {
    const res = await fetchReport(http, ctx, ipInput ? `/api/v2/${encodeURIComponent(ipInput)}` : '/api/v2/me');
    if (res.json && res.json.ok && res.json.ip) data = res.json;
    else error = (res.json && (res.json.error || res.json.code)) || `HTTP ${res.status}`;
  } catch (err) {
    error = String((err && err.message) || err);
  }

  if (!data) return errorView(lang, error, refreshAfter, policy, ipInput);
  return reportView(data, lang, refreshAfter, policy);
}

// ------------------------------ 错误态 ------------------------------------
function errorView(lang, error, refreshAfter, policy, ipInput) {
  return {
    type: 'widget', refreshAfter, padding: L.panelPad, gap: 0, backgroundColor: C.bg,
    children: [panel([
      sectionTitle(t(lang, 'IP 综合报告', 'IP Report')),
      sp(6),
      txt(t(lang, '数据获取失败', 'Failed to load'), 11, C.red, { weight: 'semibold' }),
      sp(3),
      txt(String(error || 'unknown'), 8, C.muted, { maxLines: 2 }),
      sp(4),
      txt((policy ? `POLICY=${policy}` : t(lang, '策略：全局', 'POLICY: global')) + (ipInput ? ` · IP=${ipInput}` : ''),
        7, C.muted, { maxLines: 1, minScale: 0.5 }),
    ], { flex: 1, width: '100%' })],
  };
}

// ------------------------------ 报告态 ------------------------------------
function reportView(d, lang, refreshAfter, policy) {
  const geo = d.geo || {};
  const net = d.network || {};
  const risk = d.risk || {};
  const purity = d.purity || {};
  const envInfo = d.ip_environment || {};
  const parts = Array.isArray(envInfo.parts) ? envInfo.parts : [];

  const rawScore = !nil(envInfo.score) ? envInfo.score : purity.score;
  const hasScore = !nil(rawScore);
  const score = hasScore ? Math.round(Number(rawScore) || 0) : null;
  const scoreColor = bandColor(hasScore ? score : 0);
  const grade = envInfo.grade || purity.grade || '';
  const version = Number(d.ip_version) === 6 ? 'IPv6' : 'IPv4';

  // 定位：国家 · 省/州 · 城市（与 cleanip 卡片一致，不含区）
  const locParts = [geo.country || geo.country_en].concat(
    [geo.region, geo.city].filter((x) => x && String(x).trim() && x !== geo.country)
  ).filter(Boolean);
  const location = locParts.length ? locParts.join(' · ') : '—';

  // 类型徽章
  const ipType = String(purity.ip_type || net.network_type || '');
  const isResidential = /residential|isp|fixed|mobile/i.test(ipType) && !/hosting|datacenter|idc/i.test(ipType);
  const isHosting = /hosting|datacenter|idc/i.test(ipType);
  const typeZh = isResidential ? '住宅 IP' : isHosting ? '机房 IP' : (ipType || '未知');
  const typeEn = isResidential ? 'Residential' : isHosting ? 'Datacenter' : (ipType || 'Unknown');
  const nativeLabel = String(purity.native_label || '');
  const nativeZh = purity.is_native ? '原生 IP'
    : /broadcast/i.test(nativeLabel) ? '广播 IP'
    : /unannounce/i.test(nativeLabel) ? '未通告' : (nativeLabel || '非原生');
  const nativeEn = purity.is_native ? 'Native'
    : /broadcast/i.test(nativeLabel) ? 'Broadcast'
    : /unannounce/i.test(nativeLabel) ? 'Unannounced' : (nativeLabel || 'Non-native');

  const badge = (label, color, w) => box({
    direction: 'row', alignItems: 'center', width: w, height: L.badgeH,
    backgroundColor: '#f1f2f4', borderRadius: 3, children: [
      fill(), txt(label, L.fsBadge, color, { weight: 'semibold', maxLines: 1, minScale: 0.6 }), fill(),
    ],
  });

  const asnOrg = net.asn_org || net.asn_name || net.isp || '';

  // ---- 左栏 ----
  const leftCol = col([
    txt(t(lang, '你的 IP', 'Your IP') + ` · ${version}`, L.fsKicker, C.muted),
    sp(L.sp1),
    txt(String(d.ip || '—'), L.fsIP, C.ink, { weight: 'bold', maxLines: 1, minScale: 0.4 }),
    sp(L.sp1),
    row([
      txt(geo.flag_emoji || '', L.fsGeo, C.ink),
      txt(location, L.fsGeo, C.ink, { weight: 'medium', maxLines: 1, minScale: 0.45, flex: 1 }),
    ], { width: '100%' }),
    sp(L.sp1),
    row([
      txt(net.asn ? `AS${net.asn}` : 'AS—', L.fsASN, C.brand, { weight: 'bold' }),
      txt(asnOrg ? ` · ${asnOrg}` : '', L.fsASN, C.muted, { maxLines: 1, minScale: 0.45, flex: 1 }),
    ], { width: '100%' }),
    sp(L.sp1),
    row([
      badge(version, C.muted, 26),
      sp(3),
      badge(t(lang, nativeZh, nativeEn), purity.is_native ? C.green : C.muted, 46),
      sp(3),
      badge(t(lang, typeZh, typeEn), isResidential ? C.green : C.muted, 44),
    ], { width: '100%' }),
  ], { flex: 1, alignItems: 'start' });

  // ---- 右栏（评分环） ----
  const rightCol = col([
    box({
      type: 'image',
      src: gaugeSvg(score, scoreColor, hasScore ? grade : '', scoreColor),
      width: L.gauge, height: L.gauge,
    }),
    txt(t(lang, '综合评分', 'Score'), L.fsGauge, C.muted, { textAlign: 'center', width: '100%' }),
    txt(t(lang, `纯净度 ${!nil(purity.score) ? purity.score : '—'}`, `Purity ${!nil(purity.score) ? purity.score : '—'}`),
      L.fsPurity, C.muted, { weight: 'semibold', textAlign: 'center', width: '100%' }),
  ], { width: L.gauge + 20, alignItems: 'center' });

  const headerRow = row([leftCol, rightCol], { width: '100%', height: L.headerH, alignItems: 'end' });

  // ---- 评分构成 ----
  const order = ['reputation', 'neighborhood', 'provenance', 'asn_profile'];
  const byKey = {};
  parts.forEach((p) => { byKey[p.key] = p; });
  const ordered = order.map((k) => byKey[k]).filter(Boolean)
    .concat(parts.filter((p) => order.indexOf(p.key) < 0));

  const barRows = [];
  for (let i = 0; i < ordered.length; i += 2) {
    if (i > 0) barRows.push(sp(L.spAfterTrack));
    barRows.push(row([
      scoreBar(ordered[i], lang),
      sp(L.barGap),
      ordered[i + 1] ? scoreBar(ordered[i + 1], lang)
        : col([txt(t(lang, '未测', 'N/A'), L.fsBar, C.muted)], { width: L.barCol }),
    ], { width: '100%', height: L.barBarH, alignItems: 'start' }));
  }
  if (!barRows.length) barRows.push(txt(t(lang, '暂无数据', 'No data'), L.fsBar, C.muted));

  const barsSection = col([sectionTitle(t(lang, '评分构成', 'Score Breakdown')), sp(L.spTitle)]
    .concat(barRows), { width: '100%', height: L.barsH });

  // ---- 风险检测 ----
  const checkMap = {};
  (Array.isArray(d.checks) ? d.checks : []).forEach((c) => { checkMap[c.key] = c; });
  const riskCells = [];
  RISK_SLOTS.forEach((slot, i) => {
    if (i > 0) riskCells.push(sp(4));
    const c = slot.check ? checkMap[slot.check] : null;
    const hit = c ? c.status !== 'pass' : !!risk[slot.flag];
    riskCells.push(riskCell(slot, hit, lang));
  });

  const factorList = Array.isArray(purity.risk_factors) ? purity.risk_factors : [];
  const factorCount = factorList.length;
  riskCells.push(sp(4));
  riskCells.push(col([
    row([
      txt(factorCount > 0 ? '!' : '\u2713', L.fsRisk, factorCount > 0 ? C.red : C.green, { weight: 'bold' }),
      sp(2.5),
      txt(t(lang, '风险因素', 'Risks'), L.fsRisk, C.ink,
        { weight: 'semibold', maxLines: 1, minScale: 0.55 }),
    ], { width: '100%' }),
    txt(factorCount > 0 ? t(lang, `${factorCount} 项`, `${factorCount} item(s)`) : t(lang, '无', 'None'),
      L.fsRiskSub, factorCount > 0 ? C.red : C.green, { weight: factorCount > 0 ? 'bold' : 'regular' }),
  ], { flex: 1, alignItems: 'start' }));

  const riskSection = panel([
    sectionTitle(t(lang, '风险检测', 'Risk Checks')),
    sp(L.spTitle),
    row(riskCells, { width: '100%', height: L.riskCellH, alignItems: 'start' }),
  ], { width: '100%', height: L.riskH });

  // ---- 场景适配 ----
  const safety = purity.platform_safety || {};
  const cells = [];
  PLATFORMS.forEach((p, i) => {
    if (i > 0) cells.push(sp(2));
    cells.push(platformCell({ zh: p.zh, en: p.en, state: safety[p.key] }, lang));
  });

  const platformSection = panel([
    sectionTitle(t(lang, '场景适配', 'Scenario Fit')),
    sp(L.spTitle),
    row(cells, { width: '100%', height: L.platCellH, alignItems: 'start' }),
  ], { width: '100%', height: L.platH });

  // ---- 页脚 ----
  const footer = txt(t(lang, '完整报告 ', 'Full report ') + 'cleanip.io/' + String(d.ip || ''),
    L.fsFooter, C.muted, { maxLines: 1, minScale: 0.4, width: '100%' });

  return {
    type: 'widget',
    refreshAfter,
    padding: L.rootPad,
    gap: L.rootGap,
    backgroundColor: C.bg,
    // IPv6 里的冒号要保留，cleanip.io 的路径本身支持，不做 percent-encoding
    url: `https://cleanip.io/${String(d.ip || '')}`,
    // 只在「头部」与「评分构成」之间放弹性 spacer：多余空间集中在这里，
    // 下方各面板都给了固定 height，因此布局可预测、不会互相挤压。
    children: [
      headerRow,
      fill(),
      barsSection,
      riskSection,
      platformSection,
      footer,
    ],
  };
}
