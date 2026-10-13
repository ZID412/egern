/*
ZID412 - Egern通用脚本小组件 - 解锁检测 v1.0.10
按分组检测当前出口 IP 对流媒体 / AI 服务 / 各地区平台的解锁情况。

【环境变量配置说明】
【必填项】
名称：GROUP
值：你的策略组名称

【选填项】
名称：CATEGORY
值：分组名，用 | 分隔，可多选。不填默认 streaming

streaming：Netflix / Disney+ / YouTube /  Prime Video / HBO Max / Spotify
ai：ChatGPT / Gemini / Claude / Copilot / Grok / Perplexity
jp：Abema / niconico / TVer / U-NEXT / FOD / DMM
hk：myTV SUPER / Viu / TVB / now E / encoreTVB / ViuTV
tw：B站台湾 / 4GTV / LINE TV / MyVideo / KKTV / Hami Video
us：Hulu / Peacock / FuboTV / AppleTV / Tubi / Starz

名称：REFRESH_MINUTES
值：小组件刷新间隔（单位：分钟，默认 30）

名称：TIMEOUT
值：单个请求超时（单位：毫秒，默认 1800）

名称：WIDGET_STYLE
值：glass（液态玻璃透壁纸），不填默认黑色背景

【状态含义】
- 解锁：该服务在当前出口可用，右侧显示地区码
- 未解锁：服务可达，但当前地区不支持
- 受限：部分可用（Netflix 仅自制剧 / ChatGPT 限流 / Abema 海外限定）
- 封锁：IP 被服务方拉黑（Netflix 403 / OpenAI VPN 拦截）
- 未知：探测失败（超时、网络错误、接口变更）

----------------------------------------------------------
 */

// ============================================================
// 常量区
// ============================================================

// 探测请求统一伪装成桌面 Chrome。
// 这些服务会校验请求头，缺少 sec-ch-ua / sec-fetch-* 等指纹头时可能直接返回异常页，
// 导致误判成「未解锁」。整套头与 MediaUnlockTest 的 GET() 保持一致。
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36';

// Abema 走安卓客户端接口，必须用 Dalvik UA，用浏览器头会被拒
const DALVIK_UA = 'Dalvik/2.1.0 (Linux; U; Android 9; ALP-AL00 Build/HUAWEIALP-AL00)';

const BROWSER_HEADERS = {
  'user-agent': BROWSER_UA,
  accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
  'cache-control': 'no-cache',
  dnt: '1',
  pragma: 'no-cache',
  'sec-ch-ua': '"Chromium";v="106", "Google Chrome";v="106", "Not;A=Brand";v="99"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': 'Windows',
  'sec-fetch-dest': 'document',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-site': 'none',
  'sec-fetch-user': '?1',
  'upgrade-insecure-requests': '1'
};

// Disney+ 设备令牌（公开流传值，失效后 Disney+ 会显示「未知」）
const DISNEY_AUTH =
  'Bearer ZGlzbmV5JmJyb3dzZXImMS4wLjA.Cu56AgSfBTDag5NiRA81oLHkDZfu5L3CKadnefEAY84';

const DISNEY_REFRESH =
  'eyJ6aXAiOiJERUYiLCJraWQiOiJLcTYtNW1Ia3BxOXdzLUtsSUUyaGJHYkRIZFduRjU3UjZHY1h6aFlvZi04IiwiY3R5IjoiSldUIiwiZW5jIjoiQzIwUCIsImFsZyI6ImRpciJ9..OdwL8TEIFZouLDJe.wLz6zEC3PlPAGxx4X4qyP837lUbFrI_DQGnrJDMtEaQd5gsjHwaYshscoDXCYjMioU8JvsH_HKZga3fzSDEoWuMA5lgv4dyJpoB4Cqi91JjPSkqsRHKZ1I-nRoTmnSkcW3RHE-0coAqDWgK7IZ5cPiHQ-9KVRqqZkmTbEHynBdgH2y-FJP8zK0-dAynzR2krlUahhcykp7J7VqhZj_l5HVZZkPylZ6eKoK4J8fQvuGJoqMaRZTzrIH4Yk9J3GMbKnYqEG3SKRp5qAuWTtqLDOoGN0wWsUE5VRuCZxRKpxayJWABq2u4ABkAtIqUx8CPx77ZXxZVlcjRN1Xa8F2-e2mTxZq_1FgzmWECFg6onkDj_TpfBdeFoxDzhnRNceoQ-iyyNf3sgxJ_nz_bwztVZf0Vt3OR8yBnXfbkuEY7GQ4pvCuy-peW0mwJJCd2eJ9ADwDEGmoY4F47W-8rxdBhgna-0hu0FuLxt9MlmH_tGCmM_T-61xsxymLO9tlkwBnxNw4u6T9X2hcvC7-4uzr5cJiaJ3sGPMNo_ixTrP8SG9zCIse-X6_Lq0v3Uo-QOKhcD4N3gIfwZFYEvf-HVGWzFpU683q9CJfTTEXhsufj1URhSis7GdAa3nLZVt7CScsMPcYrMI317PmU-Brdvl_Ic4QeHTeF8-57kzD3mm5mrlQ7kQIXQzzQPqHYt70MzxL_scfT90cpYaSOBQnB1l--226h7X51XxSbrOcO-25zS7OSyedya8eMG6zAmgkk1zvZUzdCHZyzYD8-t0KYcfA5AwiLIFHxgqL4ni9fVy-SpYTKRwCmkp_pZOPaFwJh8zkhw8QaSLHq7ubko7H1kjJZxzsG1l4Bla1QRlj_-FVoY8GZ6okFk3Ts6A2qOK6v8UT7sL_w2zaHDQH1q2o05vsLwqIOxg3Xyey0tahzPbl-In_i1JGGvqGXOiPcKL5uOcTOo1luk32AbCS9i5mkopTS401YYYMH-Sx_krW_VJd2czpFefc0dlagtzBytqlcyscscFwq6IE6VHwG2Ij-WfO44G5hGDJFkZMZLeDUnTIyNrLe9hcfJp73koOSFnURsFWFjM2lgUIayiREAl02oh2alUyqnG09gdXufT_2W0DjA4i7qYuv6ol5NIVc389dF3x4a_7dPBvsMU3ppA1rlV04FlK6_fRv-Dk_jclXRZiQ5ul2ZO2CQ96LmrzmkdeNxFxcwaNXCJGBiRWXfMunoddIRg_LrVGuqWRgxj4DEnngZ2-qI_dliGiYraIehsHvtWeXIUWNF_FQSnQgZLg4WPekcluCecE4Iv7Sz36k9GUDqqs8hRWddirhufYem6RC84PyNqafCnwczrx5pOacmVzDl9Oi8OIhdDasdJa7gvsDoFzf6bv5st7EvbORkgPs6MK46mDMlwkL7TqjrJnSJzozCX4zLbYeyiWK6EXCehOpImMN262KLYQxnf5ugvk11gIA4NXpTbzyo4hp2LS7u8UMs5_w3t02vizxSQGokp-3qkEWmViy3pup1IXMPrcpS6KWHX0AYi1oRDZB5B8vM04pRHwYjsgMp2L-w4PMaDC4QDRU81IdvQ5VRkyLT7CL5hDlq5smXw_7wSFTWxs9vc5PmnrykSAkwFPocORC2j4T96uiu3z4gNoBu_dwKNcPi-dV7myC4iRRTmpm0V5A9IW510RGTyso_b-1hUeGvToYl9VwNgN7Impt3PjEQO2HXMU3p96tdulDEA_8bbyPdEGfxxVK3k2n_dxj_GzPKA8V4ESoNMRrV1vCuxPnrzfAOhqmNOEewTHqlxENSsZFGvfzVj1KemR7zLky14JMVslILnvxl6vuX7SbfIQ5JDktq9qKtTKo1mFrA-mBS3n00FacjPi364nnugiWQN7EwhNdEDH_KtWXGZVh-u2NM5cdoS1kAsOKSLxFTnTDG738LhoB3i_ZOjHFASKiZcsX6yD5csIP21jG5nFF9Qw2qsnqmxRuDLilIoGczEMt2Pfo180CG8Dyr7XtOYNeVU7__h9zBm9CvaAHDoQQhU4KlXM4LsljFeajw5f2wn08OmsdfkSYYl45O718QgzR_RRqwDpQH2pyKDJZ9yZt5OCyxcbnCgepjUyp6S-Pigfw73ASoCknhLLheb2mqkWIC-s3NmClpMoK-IyE57AiHHCatZfPGPnNofVioN5SbVR08mV7pdyQEhQGxGFM_LTAFFpwC48gOFTq-FWdV58muDULTqO3ImbGG6X3vV-PVbher1oJx0CFnelGGIx9lwM-yHbpVZGq9IXnKqoblCHiwuaJgbCKBnTjia2gYPNlN0Ql1ia3vQc7bybDVHyLePAVbOk10MdwHprwMGE__wsXqagElQCGJpU3ytPDktncRPCSQBQ3mw94CCIOQYEyhnA1Vik127AznwbR10Xm59diGBtix0Ao-VIrjKzQNw2hXqC_H-IgY46OT5ZndZ02SAe6AVyipq6kTui_ZyuQhy-zAOiat4t6qh-LyL1xImBuOZ7e79737LYiLHEIgHOIQ68DKcSmsIuA.gwrRhM5AiYUQ6iAbRZhxlw';

// ChatGPT 官方支持的地区码集合（与 MediaUnlockTest 的 GPT_SUPPORT_COUNTRY 一致）
const GPT_SUPPORT = new Set([
  'AL', 'DZ', 'AD', 'AO', 'AG', 'AR', 'AM', 'AU', 'AT', 'AZ', 'BS', 'BD', 'BB', 'BE',
  'BZ', 'BJ', 'BT', 'BA', 'BW', 'BR', 'BG', 'BF', 'CV', 'CA', 'CL', 'CO', 'KM', 'CR',
  'HR', 'CY', 'DK', 'DJ', 'DM', 'DO', 'EC', 'SV', 'EE', 'FJ', 'FI', 'FR', 'GA', 'GM',
  'GE', 'DE', 'GH', 'GR', 'GD', 'GT', 'GN', 'GW', 'GY', 'HT', 'HN', 'HU', 'IS', 'IN',
  'ID', 'IQ', 'IE', 'IL', 'IT', 'JM', 'JP', 'JO', 'KZ', 'KE', 'KI', 'KW', 'KG', 'LV',
  'LB', 'LS', 'LR', 'LI', 'LT', 'LU', 'MG', 'MW', 'MY', 'MV', 'ML', 'MT', 'MH', 'MR',
  'MU', 'MX', 'MC', 'MN', 'ME', 'MA', 'MZ', 'MM', 'NA', 'NR', 'NP', 'NL', 'NZ', 'NI',
  'NE', 'NG', 'MK', 'NO', 'OM', 'PK', 'PW', 'PA', 'PG', 'PE', 'PH', 'PL', 'PT', 'QA',
  'RO', 'RW', 'KN', 'LC', 'VC', 'WS', 'SM', 'ST', 'SN', 'RS', 'SC', 'SL', 'SG', 'SK',
  'SI', 'SB', 'ZA', 'ES', 'LK', 'SR', 'SE', 'CH', 'TH', 'TG', 'TO', 'TT', 'TN', 'TR',
  'TV', 'UG', 'AE', 'US', 'UY', 'VU', 'ZM', 'BO', 'BN', 'CG', 'CZ', 'VA', 'FM', 'MD',
  'PS', 'KR', 'TW', 'TZ', 'TL', 'GB'
]);

// TVer / encoreTVB 都走 Brightcove 播放接口，需要在 Accept 里带各自的公钥
const TVER_ACCEPT =
  'application/json;pk=BCpkADawqM0_rzsjsYbC1k1wlJLU4HiAtfzjxdUmfvvLUQB-Ax6VA-p-9wOEZbCEm3u95qq2Y1CQQW1K9tPaMma9iAqUqhpISCmyXrgnlpx9soEmoVNuQpiyGsTpePGumWxSs1YoKziYB6Wz';

const ENCORE_ACCEPT =
  'application/json;pk=BCpkADawqM2Gpjj8SlY2mj4FgJJMfUpxTNtHWXOItY1PvamzxGstJbsgc-zFOHkCVcKeeOhPUd9MNHEGJoVy1By1Hrlh9rOXArC5M5MTcChJGU6maC8qhQ4Y8W-QYtvi8Nq34bUb9IOvoKBLeNF4D9Avskfe9rtMoEjj6ImXu_i4oIhYS0dx7x1AgHvtAaZFFhq3LBGtR-ZcsSqxNzVg-4PRUI9zcytQkk_YJXndNSfhVdmYmnxkgx1XXisGv1FG5GOmEK4jZ_Ih0riX5icFnHrgniADr4bA2G7TYh4OeGBrYLyFN_BDOvq3nFGrXVWrTLhaYyjxOr4rZqJPKK2ybmMsq466Ke1ZtE-wNQ';

// 状态枚举
const ST = {
  OK: 'ok',
  NO: 'no',
  RESTRICTED: 'restricted',
  BANNED: 'banned',
  UNKNOWN: 'unknown'
};

// ============================================================
// 服务与分组
// ============================================================

const SERVICES = [
  // ---- streaming ----
  { key: 'nf',     label: 'Netflix',      symbol: 'sf-symbol:tv.fill' },
  { key: 'dis',    label: 'Disney+',      symbol: 'sf-symbol:sparkles' },
  { key: 'yt',     label: 'YouTube',      symbol: 'sf-symbol:play.rectangle.fill' },
  { key: 'pv',     label: 'Prime',        symbol: 'sf-symbol:play.circle.fill' },
  { key: 'hbo',    label: 'HBO Max',      symbol: 'sf-symbol:film.fill' },
  { key: 'sp',     label: 'Spotify',      symbol: 'sf-symbol:music.note' },
  // ---- ai ----
  { key: 'gpt',    label: 'ChatGPT',      symbol: 'sf-symbol:bubble.left.fill' },
  { key: 'gemini', label: 'Gemini',       symbol: 'sf-symbol:sparkle' },
  { key: 'claude', label: 'Claude',       symbol: 'sf-symbol:bubble.left.and.bubble.right.fill' },
  { key: 'copilot',label: 'Copilot',      symbol: 'sf-symbol:laptopcomputer' },
  { key: 'grok',   label: 'Grok',         symbol: 'sf-symbol:bolt.fill' },
  { key: 'pplx',   label: 'Pplx',         symbol: 'sf-symbol:magnifyingglass' },
  // ---- jp ----
  { key: 'abema',  label: 'Abema',        symbol: 'sf-symbol:antenna.radiowaves.left.and.right' },
  { key: 'nico',   label: 'niconico',     symbol: 'sf-symbol:video.fill' },
  { key: 'tver',   label: 'TVer',         symbol: 'sf-symbol:rectangle.on.rectangle' },
  { key: 'unext',  label: 'U-NEXT',       symbol: 'sf-symbol:square.stack' },
  { key: 'fod',    label: 'FOD',          symbol: 'sf-symbol:film' },
  { key: 'dmm',    label: 'DMM',          symbol: 'sf-symbol:bag.fill' },
  // ---- hk ----
  { key: 'mytv',   label: 'myTV',         symbol: 'sf-symbol:desktopcomputer' },
  { key: 'viu',    label: 'Viu',          symbol: 'sf-symbol:tv' },
  { key: 'tvb',    label: 'TVB',          symbol: 'sf-symbol:tv.inset.filled' },
  { key: 'nowe',   label: 'now E',        symbol: 'sf-symbol:circle.grid.2x2' },
  { key: 'encore', label: 'encore',       symbol: 'sf-symbol:repeat' },
  { key: 'viutv',  label: 'ViuTV',        symbol: 'sf-symbol:play.rectangle' },
  // ---- tw ----
  { key: 'bilitw', label: 'B站 台湾',      symbol: 'sf-symbol:play.square.fill' },
  { key: '4gtv',   label: '4GTV',         symbol: 'sf-symbol:square.grid.2x2' },
  { key: 'linetv', label: 'LINE',         symbol: 'sf-symbol:message.fill' },
  { key: 'myvideo',label: 'MyVideo',      symbol: 'sf-symbol:play.rectangle' },
  { key: 'kktv',   label: 'KKTV',         symbol: 'sf-symbol:play.square' },
  { key: 'hami',   label: 'Hami',         symbol: 'sf-symbol:antenna.radiowaves.left.and.right' },
  // ---- us ----
  { key: 'hulu',   label: 'Hulu',         symbol: 'sf-symbol:display' },
  { key: 'peacock',label: 'Peacock',      symbol: 'sf-symbol:leaf.fill' },
  { key: 'fubo',   label: 'FuboTV',       symbol: 'sf-symbol:sportscourt.fill' },
  { key: 'atv',    label: 'AppleTV',      symbol: 'sf-symbol:airplay.video.fill' },
  { key: 'tubi',   label: 'Tubi',         symbol: 'sf-symbol:play.circle' },
  { key: 'starz',  label: 'Starz',        symbol: 'sf-symbol:star.fill' }
];

// 分组 → 服务 key 列表（每项恰好 6 个）
const GROUPS = {
  streaming: ['nf', 'dis', 'yt', 'pv', 'hbo', 'sp'],
  ai: ['gpt', 'gemini', 'claude', 'copilot', 'grok', 'pplx'],
  jp: ['abema', 'nico', 'tver', 'unext', 'fod', 'dmm'],
  hk: ['mytv', 'viu', 'tvb', 'nowe', 'encore', 'viutv'],
  tw: ['bilitw', '4gtv', 'linetv', 'myvideo', 'kktv', 'hami'],
  us: ['hulu', 'peacock', 'fubo', 'atv', 'tubi', 'starz']
};

const GROUP_LABELS = {
  streaming: '流媒体',
  ai: 'AI 服务',
  jp: '日本',
  hk: '香港',
  tw: '台湾',
  us: '美国'
};

const DEFAULT_GROUP = 'streaming';

// ============================================================
// 工具函数
// ============================================================

function styleMode(ctx) {
  const value = String((ctx && ctx.env && ctx.env.WIDGET_STYLE) || 'classic').trim().toLowerCase();
  return value === 'glass' ? 'glass' : 'classic';
}

function rootBackground(mode, gradient) {
  if (mode === 'glass') return {};
  return { backgroundGradient: gradient };
}

// 读取响应头：兼容 Headers 对象与测试用的普通对象
function readHeader(headers, name) {
  if (!headers) return '';
  try {
    if (typeof headers.get === 'function') {
      const v = headers.get(name);
      return v === null || v === undefined ? '' : String(v);
    }
    const lower = String(name).toLowerCase();
    for (const k of Object.keys(headers)) {
      if (String(k).toLowerCase() === lower) return String(headers[k] || '');
    }
  } catch (_) {}
  return '';
}

// 从 set-cookie 里取指定 cookie 的值
function readCookie(headers, name) {
  const raw = readHeader(headers, 'set-cookie');
  if (!raw) return '';
  try {
    const re = new RegExp('(?:^|[;,\\s])' + name + '=([^;,]*)');
    const m = String(raw).match(re);
    if (m && m[1]) return String(m[1]).trim();
  } catch (_) {}
  return '';
}

async function readText(resp) {
  try {
    if (resp && typeof resp.text === 'function') return String((await resp.text()) || '');
  } catch (_) {}
  return '';
}

async function readJson(resp) {
  try {
    if (resp && typeof resp.json === 'function') return await resp.json();
  } catch (_) {}
  return null;
}

function readStatus(resp) {
  const n = Number(resp && resp.status);
  return isFinite(n) ? n : 0;
}

function result(status, region, info) {
  return {
    status: status || ST.UNKNOWN,
    region: region ? String(region) : '',
    info: info ? String(info) : ''
  };
}

// 统一 GET：默认浏览器头 + 跟随重定向，extra 可覆盖
async function httpGet(ctx, url, policy, timeoutMs, extra) {
  const opt = Object.assign(
    { policy: policy, timeout: timeoutMs, headers: BROWSER_HEADERS },
    extra || {}
  );
  return ctx.http.get(url, opt);
}

// 统一 POST
async function httpPost(ctx, url, policy, timeoutMs, body, headers, redirect) {
  return ctx.http.post(url, {
    policy: policy,
    timeout: timeoutMs,
    headers: headers || BROWSER_HEADERS,
    body: body,
    redirect: redirect || 'follow'
  });
}

function jsonHeaders() {
  return { 'user-agent': BROWSER_UA, 'content-type': 'application/json' };
}

function formHeaders() {
  return { 'user-agent': BROWSER_UA, 'content-type': 'application/x-www-form-urlencoded' };
}

// 任何探测异常一律降级为「未知」，绝不渲染成「未解锁」
async function safeCheck(fn) {
  try {
    const r = await fn();
    if (r && r.status) return r;
    return result(ST.UNKNOWN, '', 'empty');
  } catch (_) {
    return result(ST.UNKNOWN, '', 'error');
  }
}

// ============================================================
// streaming 组
// ============================================================

// ---- Netflix ----
// 判定链：片源页 200/301 → 试探页读 location 地区（常见解锁路径只要 2 个请求）；
// 只有第一个片源页 404/403 时才去请求第二个，用来区分「仅自制剧 / IP 被封」。
// 必须 redirect:'manual' —— 跟随重定向就拿不到 location 了。
async function checkNetflix(ctx, policy, timeoutMs) {
  const opt = { redirect: 'manual' };

  const r1 = await httpGet(ctx, 'https://www.netflix.com/title/81280792', policy, timeoutMs, opt);
  const s1 = readStatus(r1);

  let s2 = 0;
  if (!(s1 === 200 || s1 === 301)) {
    const r2 = await httpGet(ctx, 'https://www.netflix.com/title/70143836', policy, timeoutMs, opt);
    s2 = readStatus(r2);

    if (s1 === 404 && s2 === 404) return result(ST.RESTRICTED, '', '仅自制剧');
    if (s1 === 403 && s2 === 403) return result(ST.BANNED, '', 'IP 被封');
    if (!(s2 === 200 || s2 === 301)) return result(ST.UNKNOWN, '', 'unexpected ' + s1 + '/' + s2);
  }

  const resp3 = await httpGet(ctx, 'https://www.netflix.com/title/80018499', policy, timeoutMs, opt);
  const loc = readHeader(resp3 && resp3.headers, 'location');

  if (!loc) return result(ST.OK, 'us', '');

  // location 形如 https://www.netflix.com/hk-en/title/... → 取第 4 段再截掉 -xx 后缀
  const parts = String(loc).split('/');
  if (parts.length < 5) return result(ST.UNKNOWN, '', 'bad location');
  const seg = String(parts[3] || '').split('-')[0];
  if (!seg) return result(ST.UNKNOWN, '', 'bad region');
  return result(ST.OK, seg.toLowerCase(), '');
}

// ---- Disney+ ----
// 先向官网 POST 设备令牌拿 Location / x-dss-country cookie 判断地区，
// 再向 bamgrid 令牌端点验证令牌在当前地区是否可用。
async function checkDisney(ctx, policy, timeoutMs) {
  const body =
    'grant_type=refresh_token' +
    '&refresh_token=' + encodeURIComponent(DISNEY_REFRESH) +
    '&subject_token_type=' + encodeURIComponent('urn:bamtech:params:oauth:token-type:device');

  const headers = {
    'user-agent': BROWSER_UA,
    authorization: DISNEY_AUTH,
    'content-type': 'application/x-www-form-urlencoded'
  };

  const q = await httpPost(ctx, 'https://www.disneyplus.com', policy, timeoutMs, body, headers, 'manual');
  const location = readHeader(q && q.headers, 'location');

  let queryRegion = '';
  if (!location) {
    queryRegion = readCookie(q && q.headers, 'x-dss-country').toLowerCase();
  } else if (location === 'https://disneyplus.disney.co.jp/') {
    queryRegion = 'jp';
  } else if (location === 'https://preview.disneyplus.com/unavailable/') {
    return result(ST.NO, '', '地区不支持');
  } else {
    return result(ST.NO, '', '地区不支持');
  }

  const v = await httpPost(
    ctx, 'https://disney.api.edge.bamgrid.com/token', policy, timeoutMs, body, headers, 'manual'
  );

  const vb = await readText(v);
  if (!vb) return result(ST.UNKNOWN, queryRegion, 'empty body');
  if (vb.indexOf('unauthorized') !== -1) return result(ST.UNKNOWN, queryRegion, '令牌失效');
  if (vb.indexOf('403 ERROR') !== -1 || vb.indexOf('forbidden-location') !== -1) {
    return result(ST.NO, queryRegion, '地区不支持');
  }

  return result(ST.OK, queryRegion, '');
}

// ---- YouTube ----
// 标签显示为 YouTube，检测的是 Premium 区域可用性（普通播放几乎全区可用，测了没意义）
async function checkYouTube(ctx, policy, timeoutMs) {
  const resp = await httpGet(ctx, 'https://www.youtube.com/premium', policy, timeoutMs);

  const s = await readText(resp);
  if (!s) return result(ST.UNKNOWN, '', 'empty body');

  if (s.indexOf('www.google.cn') !== -1) return result(ST.NO, 'cn', '中国大陆');
  if (s.indexOf('Premium is not available in your country') !== -1) {
    return result(ST.NO, '', '地区不支持');
  }

  // 从冒号处向后取一小段再正则匹配两位地区码。
  // 不按固定偏移截取 —— 页面里偶尔会写成 "countryCode": "JP"（冒号后带空格），
  // 定长截取会把空格和引号一起截进来，得到 "J 这种残缺值。
  const i = s.indexOf('"countryCode":');
  if (i !== -1) {
    const after = s.slice(i + 13, i + 40);
    const m = after.match(/^[:\s"]*([A-Za-z]{2})/);
    if (m && m[1]) return result(ST.OK, m[1].toLowerCase(), '');
  }

  if (
    s.indexOf('premiumPurchaseButton') !== -1 ||
    s.indexOf('manageSubscriptionButton') !== -1 ||
    s.indexOf('/月') !== -1 ||
    s.indexOf('/month') !== -1
  ) {
    return result(ST.OK, '', '');
  }

  return result(ST.NO, '', '');
}

// ---- Prime Video ----
async function checkPrimeVideo(ctx, policy, timeoutMs) {
  const resp = await httpGet(ctx, 'https://www.primevideo.com', policy, timeoutMs);
  const s = await readText(resp);
  if (!s) return result(ST.UNKNOWN, '', 'empty body');

  const i = s.indexOf('"currentTerritory":');
  if (i === -1) return result(ST.NO, '', '');

  const code = s.slice(i + 20, i + 22).replace(/[^A-Za-z]/g, '').toLowerCase();
  if (!code) return result(ST.UNKNOWN, '', 'bad region');
  return result(ST.OK, code, '');
}

// ---- Spotify ----
// 访问 spotify.com 主页，通过地区跳转 / 页面文案判断可用性。
// 旧注册接口（spclient.wg.spotify.com）写死了固定 token，已被风控/失效，所有节点都被误判为未解锁。
async function checkSpotify(ctx, policy, timeoutMs) {
  const resp = await httpGet(ctx, 'https://www.spotify.com/', policy, timeoutMs);

  const st = readStatus(resp);
  const body = await readText(resp);
  const hay = String(body).toLowerCase();
  const loc = readHeader(resp && resp.headers, 'location');

  // 地区限制提示语
  const block = [
    'not available',
    'is not available in',
    'unavailable in',
    'unsupported region',
    'unsupported_country',
    'spotify is currently not available'
  ];
  for (const kw of block) {
    if (hay.indexOf(kw) !== -1) return result(ST.NO, '', '');
  }

  if (st !== 200 && st !== 301 && st !== 302 && st !== 0) {
    return result(ST.UNKNOWN, '', 'status ' + st);
  }

  // 尝试从重定向地址解析地区码，例如 /hk-en/ /us/ 等
  const m = String(loc || '').match(/spotify\.com\/([a-z]{2})[-_\/]/i)
    || String(loc || '').match(/spotify\.com\/([a-z]{2})$/i)
    || hay.match(/spotify\.com\/([a-z]{2})[-_\/]/i);
  if (m) return result(ST.OK, m[1].toLowerCase(), '');

  return result(ST.OK, '', '');
}

// ---- HBO Max ----
// 访问 max.com 新域名。HBO Max 已合并为 Max，继续检测 hbomax.com 会误判。
async function checkHBOMax(ctx, policy, timeoutMs) {
  const resp = await httpGet(ctx, 'https://www.max.com/', policy, timeoutMs);

  const st = readStatus(resp);
  const body = await readText(resp);
  const hay = String(body).toLowerCase();
  const loc = readHeader(resp && resp.headers, 'location');

  const block = [
    'not available',
    'is not available in',
    'unavailable in',
    'unsupported region',
    'geo-availability',
    'max is not available'
  ];
  for (const kw of block) {
    if (hay.indexOf(kw) !== -1) return result(ST.NO, '', '');
  }

  if (st !== 200 && st !== 301 && st !== 302 && st !== 0) {
    return result(ST.UNKNOWN, '', 'status ' + st);
  }

  // 尝试从跳转地址解析地区码，例如 max.com/xx/ 或 play.max.com/xx/
  const m = String(loc || '').match(/(?:www\.|play\.)?max\.com\/([a-z]{2})([\/_\-]|$)/i);
  if (m) return result(ST.OK, m[1].toUpperCase(), '');

  return result(ST.OK, '', '');
}

// ============================================================
// ai 组
// ============================================================

// ---- 出口地区查询 ----
// 读 Cloudflare trace 拿出口地区码。与各服务检测并行执行，
// 给所有自身不带地区信息的解锁结果（AI 组 / B站等）做展示兜底。
async function getExitRegion(ctx, policy, timeoutMs) {
  const trace = await httpGet(ctx, 'https://chat.openai.com/cdn-cgi/trace', policy, timeoutMs);
  const ts = await readText(trace);
  const i = ts.indexOf('loc=');
  if (i === -1) return result(ST.UNKNOWN, '', 'no loc');

  const rest = ts.slice(i + 4);
  const nl = rest.indexOf('\n');
  const loc = (nl === -1 ? rest : rest.slice(0, nl)).trim().toUpperCase();
  if (!loc) return result(ST.UNKNOWN, '', 'empty loc');

  return result(ST.OK, loc, '');
}

// ---- ChatGPT（可靠性高）----
// 先读 cdn-cgi/trace 的 loc 拿到出口地区，再查 OpenAI 官方支持国家列表
async function checkChatGPT(ctx, policy, timeoutMs) {
  const trace = await httpGet(ctx, 'https://chat.openai.com/cdn-cgi/trace', policy, timeoutMs);

  const ts = await readText(trace);
  const i = ts.indexOf('loc=');
  if (i === -1) return result(ST.UNKNOWN, '', 'no loc');

  const rest = ts.slice(i + 4);
  const nl = rest.indexOf('\n');
  const loc = (nl === -1 ? rest : rest.slice(0, nl)).trim().toUpperCase();
  if (!loc) return result(ST.UNKNOWN, '', 'empty loc');

  const home = await httpGet(ctx, 'https://chat.openai.com', policy, timeoutMs);
  const body = await readText(home);

  if (body && body.indexOf('VPN') !== -1) return result(ST.BANNED, loc, 'VPN 拦截');
  if (readStatus(home) === 429) return result(ST.RESTRICTED, loc, '限流');

  if (GPT_SUPPORT.has(loc)) return result(ST.OK, loc, '');
  return result(ST.NO, loc, '地区不支持');
}

// ---- AI 服务通用检测（启发式，可靠性较低）----
// MediaUnlockTest 里没有这些服务的实现，这里用「地区限制关键词匹配」的启发式方法：
// 请求服务主页，若响应体或跳转地址里出现地区限制文案 → 未解锁；正常返回 200/3xx → 解锁。
// 关键词来自各家公开的地区限制提示语，未经多地区真实验证，可能误判或显示未知。
async function checkAIByKeywords(ctx, url, policy, timeoutMs, keywords) {
  const resp = await httpGet(ctx, url, policy, timeoutMs);

  const body = await readText(resp);
  const loc = readHeader(resp && resp.headers, 'location');
  const hay = (String(body) + ' ' + String(loc)).toLowerCase();

  for (const kw of keywords) {
    if (hay.indexOf(String(kw).toLowerCase()) !== -1) {
      return result(ST.NO, '', '地区不支持');
    }
  }

  const st = readStatus(resp);
  if (st === 200 || st === 301 || st === 302 || st === 0) return result(ST.OK, '', '');

  return result(ST.UNKNOWN, '', 'status ' + st);
}

function checkGemini(ctx, policy, timeoutMs) {
  return checkAIByKeywords(ctx, 'https://gemini.google.com/', policy, timeoutMs, [
    'unsupported_country',
    'not available in your country',
    'unsupported region',
    'is not available in your region'
  ]);
}

function checkClaude(ctx, policy, timeoutMs) {
  return checkAIByKeywords(ctx, 'https://claude.ai/', policy, timeoutMs, [
    'unavailable in region',
    'not available in your country',
    'region not supported',
    'is not available in your region'
  ]);
}

function checkCopilot(ctx, policy, timeoutMs) {
  return checkAIByKeywords(ctx, 'https://copilot.microsoft.com/', policy, timeoutMs, [
    'not available in your region',
    'unsupported region',
    'not available in your country'
  ]);
}

function checkGrok(ctx, policy, timeoutMs) {
  return checkAIByKeywords(ctx, 'https://grok.x.ai/', policy, timeoutMs, [
    'not available in your region',
    'unsupported region',
    'not available in your country'
  ]);
}

function checkPerplexity(ctx, policy, timeoutMs) {
  return checkAIByKeywords(ctx, 'https://www.perplexity.ai/', policy, timeoutMs, [
    'not available in your region',
    'unsupported region',
    'not available in your country'
  ]);
}

// ============================================================
// jp 组
// ============================================================

// ---- Abema（日本）----
async function checkAbema(ctx, policy, timeoutMs) {
  const resp = await httpGet(
    ctx, 'https://api.abema.io/v1/ip/check?device=android', policy, timeoutMs,
    { headers: { 'user-agent': DALVIK_UA } }
  );

  const b = await readJson(resp);
  if (!b) return result(ST.UNKNOWN, '', 'bad json');

  const code = String(b.isoCountryCode || b.IsoCountryCode || '').toUpperCase();
  if (code === 'JP') return result(ST.OK, 'jp', '');
  if (!code) return result(ST.UNKNOWN, '', 'no code');

  // 非日本：Abema 仍有部分海外可看内容，按受限处理而不是直接判未解锁
  return result(ST.RESTRICTED, code, '海外限定');
}

// ---- niconico（日本）----
async function checkNiconico(ctx, policy, timeoutMs) {
  const resp = await httpGet(ctx, 'https://www.nicovideo.jp/watch/so40278367', policy, timeoutMs);
  const s = await readText(resp);
  if (!s) return result(ST.UNKNOWN, '', 'empty body');

  if (s.indexOf('同じ地域') !== -1) return result(ST.NO, '', '');
  return result(ST.OK, 'jp', '');
}

// ---- TVer（日本）----
// Brightcove 播放接口，需要在 Accept 里带 TVer 的公钥
async function checkTVer(ctx, policy, timeoutMs) {
  const resp = await httpGet(
    ctx,
    'https://edge.api.brightcove.com/playback/v1/accounts/5102072605001/videos/ref%3Akaguyasama_01',
    policy,
    timeoutMs,
    { headers: { 'user-agent': BROWSER_UA, accept: TVER_ACCEPT } }
  );

  const s = await readText(resp);
  if (!s) return result(ST.UNKNOWN, '', 'empty body');

  if (s.indexOf('error_subcode') !== -1) return result(ST.NO, '', '');
  return result(ST.OK, 'jp', '');
}

// ---- U-NEXT（日本）----
// result_status：475 / 200 = 可播放，467 = 地区限制
async function checkUNext(ctx, policy, timeoutMs) {
  const resp = await httpGet(
    ctx,
    'https://video-api.unext.jp/api/1/player?entity%5B%5D=playlist_url&episode_code=ED00148814&title_code=SID0028118&keyonly_flg=0&play_mode=caption&bitrate_low=1500',
    policy,
    timeoutMs
  );

  const b = await readJson(resp);
  if (!b) return result(ST.UNKNOWN, '', 'bad json');

  const st = Number(
    b && b.data && b.data.entities_data && b.data.entities_data.playlist_url
      ? b.data.entities_data.playlist_url.result_status
      : NaN
  );

  if (st === 475 || st === 200) return result(ST.OK, 'jp', '');
  if (st === 467) return result(ST.NO, '', '地区限制');
  return result(ST.UNKNOWN, '', 'status ' + st);
}

// ---- FOD（日本，富士台）----
// 返回 XML，含 true = 可看，false = 地区限制
async function checkFOD(ctx, policy, timeoutMs) {
  const resp = await httpGet(
    ctx, 'https://geocontrol1.stream.ne.jp/fod-geo/check.xml?time=1624504256', policy, timeoutMs
  );

  const s = await readText(resp);
  if (!s) return result(ST.UNKNOWN, '', 'empty body');

  if (s.indexOf('true') !== -1) return result(ST.OK, 'jp', '');
  if (s.indexOf('false') !== -1) return result(ST.NO, '', '');
  return result(ST.UNKNOWN, '', 'unknown');
}

// ---- DMM（日本）----
async function checkDMM(ctx, policy, timeoutMs) {
  const resp = await httpGet(ctx, 'https://bitcoin.dmm.com', policy, timeoutMs);
  const s = await readText(resp);
  if (!s) return result(ST.UNKNOWN, '', 'empty body');

  if (s.indexOf('This page is not available in your area') !== -1) return result(ST.NO, '', '');
  if (s.indexOf('暗号資産') !== -1) return result(ST.OK, 'jp', '');
  return result(ST.NO, '', '');
}

// ============================================================
// hk 组
// ============================================================

// ---- myTV SUPER（香港）----
async function checkMyTvSuper(ctx, policy, timeoutMs) {
  const resp = await httpGet(
    ctx, 'https://www.mytvsuper.com/api/auth/getSession/self/', policy, timeoutMs,
    { headers: { 'user-agent': BROWSER_UA, 'content-type': 'application/json' } }
  );

  const b = await readJson(resp);
  if (!b) return result(ST.UNKNOWN, '', 'bad json');

  if (Number(b.region) === 1) return result(ST.OK, 'hk', '');
  return result(ST.NO, '', '');
}

// ---- Viu（香港/东南亚）----
// 原实现用 split('/')[4] 按固定段索引取地区码，太脆弱：跳转地址只要多一段或少一段
// 就会取空，直接掉进「未知」。v1.0.2 改为先判 no-service 关键字，再用正则从路径里
// 抠两位地区码（/hk/、/sg/ 之类），对格式变化不敏感。
async function checkViu(ctx, policy, timeoutMs) {
  const resp = await httpGet(ctx, 'https://www.viu.com', policy, timeoutMs, { redirect: 'manual' });
  const loc = readHeader(resp && resp.headers, 'location');

  if (!loc) return result(ST.NO, '', '');

  if (String(loc).indexOf('no-service') !== -1) return result(ST.NO, '', '');

  const m = String(loc).match(/\/([a-z]{2})(?:[/-]|$)/i);
  if (m && m[1]) return result(ST.OK, m[1].toLowerCase(), '');

  // 拿不到地区码但也没被拦，按解锁处理（不编造地区）
  return result(ST.OK, '', '');
}

// ---- TVB Anywhere（香港）----
async function checkTVB(ctx, policy, timeoutMs) {
  const resp = await httpGet(
    ctx, 'https://uapisfm.tvbanywhere.com.sg/geoip/check/platform/android', policy, timeoutMs
  );

  const b = await readJson(resp);
  if (!b) return result(ST.UNKNOWN, '', 'bad json');

  if (b.allow_in_this_country) {
    return result(ST.OK, String(b.country || '').toLowerCase(), '');
  }
  return result(ST.NO, '', '');
}

// ---- now E（香港）----
// responseCode：PRODUCT_INFORMATION_INCOMPLETE = 可看，GEO_CHECK_FAIL = 地区限制
async function checkNowE(ctx, policy, timeoutMs) {
  const body =
    '{"contentId":"202105121370235","contentType":"Vod","pin":"",' +
    '"deviceId":"W-60b8d30a-9294-d251-617b-c12f9d0c","deviceType":"WEB"}';

  const resp = await httpPost(
    ctx, 'https://webtvapi.nowe.com/16/1/getVodURL', policy, timeoutMs, body, jsonHeaders()
  );

  const b = await readJson(resp);
  if (!b) return result(ST.UNKNOWN, '', 'bad json');

  const code = String(b.responseCode || b.ResponseCode || '');
  if (code === 'PRODUCT_INFORMATION_INCOMPLETE') return result(ST.OK, 'hk', '');
  if (code === 'GEO_CHECK_FAIL') return result(ST.NO, '', '');
  return result(ST.UNKNOWN, '', code || 'unknown');
}

// ---- encoreTVB（香港）----
async function checkEncoreTVB(ctx, policy, timeoutMs) {
  const resp = await httpGet(
    ctx,
    'https://edge.api.brightcove.com/playback/v1/accounts/5324042807001/videos/6005570109001',
    policy,
    timeoutMs,
    {
      headers: {
        'user-agent': BROWSER_UA,
        accept: ENCORE_ACCEPT,
        origin: 'https://www.encoretvb.com'
      }
    }
  );

  const b = await readJson(resp);
  if (!b) return result(ST.UNKNOWN, '', 'bad json');

  if (b.error_subcode === 'CLIENT_GEO') return result(ST.NO, '', '');
  if (b.account_id && String(b.account_id) !== '0') return result(ST.OK, 'hk', '');
  return result(ST.UNKNOWN, '', 'unknown');
}

// ---- ViuTV（香港）----
async function checkViuTV(ctx, policy, timeoutMs) {
  const body =
    '{"callerReferenceNo":"20210726112323","contentId":"099","contentType":"Channel",' +
    '"channelno":"099","mode":"prod","deviceId":"29b3cb117a635d5b56","deviceType":"ANDROID_WEB"}';

  const resp = await httpPost(
    ctx, 'https://api.viu.now.com/p8/3/getLiveURL', policy, timeoutMs, body, jsonHeaders()
  );

  const b = await readJson(resp);
  if (!b) return result(ST.UNKNOWN, '', 'bad json');

  const code = String(b.responseCode || b.ResponseCode || '');
  if (code === 'SUCCESS') return result(ST.OK, 'hk', '');
  if (code === 'GEO_CHECK_FAIL') return result(ST.NO, '', '');
  return result(ST.UNKNOWN, '', code || 'unknown');
}

// ============================================================
// tw 组
// ============================================================

// ---- B站 台湾 ----
async function checkBiliTW(ctx, policy, timeoutMs) {
  const resp = await httpGet(
    ctx,
    'https://api.bilibili.com/pgc/player/web/playurl?avid=50762638&cid=100279344&qn=0&type=&otype=json&ep_id=268176&fourk=1&fnver=0&fnval=16&module=bangumi',
    policy,
    timeoutMs
  );

  const b = await readJson(resp);
  if (!b) return result(ST.UNKNOWN, '', 'bad json');

  const code = Number(b.code);
  if (code === -10403) return result(ST.NO, '', '地区限制');
  if (code === 0) return result(ST.OK, 'tw', '');
  return result(ST.UNKNOWN, '', 'code ' + code);
}

// ---- 4GTV（台湾）----
async function check4GTV(ctx, policy, timeoutMs) {
  const body =
    'value=D33jXJ0JVFkBqV%2BZSi1mhPltbejAbPYbDnyI9hmfqjKaQwRQdj7ZKZRAdb16%2FRUrE8vGXLFfNKBLKJv%2BfDSiD%2BZJlUa5Msps2P4IWuTrUP1%2BCnS255YfRadf%2BKLUhIPj';

  const resp = await httpPost(
    ctx, 'https://api2.4gtv.tv//Vod/GetVodUrl3', policy, timeoutMs, body, formHeaders()
  );

  const b = await readJson(resp);
  if (!b) return result(ST.UNKNOWN, '', 'bad json');

  if (b.success === true) return result(ST.OK, 'tw', '');
  if (b.success === false) return result(ST.NO, '', '');
  return result(ST.UNKNOWN, '', 'unknown');
}

// ---- LINE TV（台湾）----
// countryCode 228 = 台湾
async function checkLineTV(ctx, policy, timeoutMs) {
  const resp = await httpGet(
    ctx, 'https://www.linetv.tw/api/part/11829/eps/1/part?chocomemberId=', policy, timeoutMs
  );

  const b = await readJson(resp);
  if (!b) return result(ST.UNKNOWN, '', 'bad json');

  if (Number(b.countryCode) === 228) return result(ST.OK, 'tw', '');
  return result(ST.NO, '', '');
}

// ---- MyVideo（台湾）----
async function checkMyVideo(ctx, policy, timeoutMs) {
  const resp = await httpGet(ctx, 'https://www.myvideo.net.tw/login.do', policy, timeoutMs);
  const s = await readText(resp);
  if (!s) return result(ST.UNKNOWN, '', 'empty body');

  if (s.indexOf('serviceAreaBlock') !== -1) return result(ST.NO, '', '');
  return result(ST.OK, 'tw', '');
}

// ---- KKTV（台湾）----
async function checkKKTV(ctx, policy, timeoutMs) {
  const resp = await httpGet(ctx, 'https://api.kktv.me/v3/ipcheck', policy, timeoutMs);

  const b = await readJson(resp);
  if (!b || !b.data) return result(ST.UNKNOWN, '', 'bad json');

  const country = String(b.data.country || '').toUpperCase();
  if (country === 'TW' && b.data.is_allowed) return result(ST.OK, 'tw', '');
  return result(ST.NO, '', '');
}

// ---- Hami Video（台湾，中华电信）----
async function checkHamiVideo(ctx, policy, timeoutMs) {
  const resp = await httpGet(
    ctx, 'https://hamivideo.hinet.net/api/play.do?id=OTT_VOD_0000249064&freeProduct=1', policy, timeoutMs
  );

  const b = await readJson(resp);
  if (!b) return result(ST.UNKNOWN, '', 'bad json');

  if (String(b.code) === '06001-107') return result(ST.OK, 'tw', '');
  return result(ST.NO, '', '');
}

// ============================================================
// us 组
// ============================================================

// ---- Hulu（美区）----
async function checkHulu(ctx, policy, timeoutMs) {
  const resp = await httpGet(ctx, 'https://www.hulu.com', policy, timeoutMs);
  if (readStatus(resp) === 403) return result(ST.NO, '', '');
  return result(ST.OK, 'us', '');
}

// ---- Peacock（美区）----
async function checkPeacock(ctx, policy, timeoutMs) {
  const resp = await httpGet(ctx, 'https://www.peacocktv.com/', policy, timeoutMs, { redirect: 'manual' });
  const loc = readHeader(resp && resp.headers, 'location');

  if (String(loc).indexOf('unavailable') !== -1) return result(ST.NO, '', '');
  return result(ST.OK, 'us', '');
}

// ---- FuboTV（美区）----
async function checkFuboTV(ctx, policy, timeoutMs) {
  const resp = await httpGet(ctx, 'https://www.fubo.tv/welcome', policy, timeoutMs, { redirect: 'manual' });
  const loc = readHeader(resp && resp.headers, 'location');
  if (readStatus(resp) === 403 || String(loc).indexOf('unavailable') !== -1) return result(ST.NO, '', '');
  return result(ST.OK, 'us', '');
}

// ---- Apple TV+（显示 AppleTV，美区）----
async function checkAppleTV(ctx, policy, timeoutMs) {
  const resp = await httpGet(ctx, 'https://tv.apple.com/us', policy, timeoutMs, { redirect: 'manual' });
  const loc = readHeader(resp && resp.headers, 'location');
  if (readStatus(resp) === 403 || String(loc).indexOf('unavailable') !== -1) return result(ST.NO, '', '');
  return result(ST.OK, 'us', '');
}

// ---- Tubi（美区）----
async function checkTubi(ctx, policy, timeoutMs) {
  const resp = await httpGet(ctx, 'https://tubitv.com', policy, timeoutMs, { redirect: 'manual' });
  const loc = readHeader(resp && resp.headers, 'location');
  if (readStatus(resp) === 403 || String(loc).indexOf('unavailable') !== -1) return result(ST.NO, '', '');
  return result(ST.OK, 'us', '');
}

// ---- Starz（美区）----
async function checkStarz(ctx, policy, timeoutMs) {
  const resp = await httpGet(ctx, 'https://www.starz.com/us/en', policy, timeoutMs, { redirect: 'manual' });
  const loc = readHeader(resp && resp.headers, 'location');
  if (readStatus(resp) === 403 || String(loc).indexOf('unavailable') !== -1) return result(ST.NO, '', '');
  return result(ST.OK, 'us', '');
}

// ============================================================
// 超时兜底：按出口地区推断支持状态
// ============================================================

// 地区型服务的支持地区白名单（小写两位地区码）。
// 检测超时/失败时，用出口地区查这张表给出推断结论，避免整卡「未知」。
const SUPPORT_LISTS = {
  abema: ['jp'], nico: ['jp'], tver: ['jp'], unext: ['jp'], fod: ['jp'], dmm: ['jp'],
  mytv: ['hk'],
  viu: ['hk', 'mo', 'sg', 'my', 'th', 'ph', 'id', 'in', 'kh', 'vn'],
  tvb: ['hk', 'mo', 'tw', 'sg', 'my', 'au', 'gb', 'us'],
  nowe: ['hk'],
  encore: ['hk', 'mo', 'tw', 'sg', 'my', 'au'],
  viutv: ['hk'],
  bilitw: ['tw'], '4gtv': ['tw'], linetv: ['tw'], myvideo: ['tw'], kktv: ['tw'], hami: ['tw'],
  hulu: ['us'], peacock: ['us'], fubo: ['us'], atv: ['us'], tubi: ['us'], starz: ['us']
};

// 全球型流媒体的排除表：不在表内即视为支持
const GLOBAL_BLOCK = ['cn', 'kp', 'sy', 'cu', 'ir'];

// AI 组 5 项没有各自可靠的官方名单，用 OpenAI 的支持列表近似（都不含中国大陆/香港等）
const AI_FALLBACK = ['gemini', 'claude', 'copilot', 'grok', 'pplx'];

// 返回 'ok' | 'no' | null（null = 无从推断，保持未知）
function fallbackVerdict(key, region) {
  const r = String(region).toLowerCase();
  if (!r) return null;

  if (key === 'gpt' || AI_FALLBACK.indexOf(key) !== -1) {
    return GPT_SUPPORT.has(r.toUpperCase()) ? 'ok' : 'no';
  }

  const list = SUPPORT_LISTS[key];
  if (list) return list.indexOf(r) !== -1 ? 'ok' : 'no';

  // 全球型流媒体（nf / dis / yt / pv / hbo / sp 等）按排除表
  return GLOBAL_BLOCK.indexOf(r) === -1 ? 'ok' : 'no';
}

// ============================================================
// 检测函数分发表
// ============================================================

const CHECKERS = {
  nf: checkNetflix,
  dis: checkDisney,
  yt: checkYouTube,
  pv: checkPrimeVideo,
  hbo: checkHBOMax,
  sp: checkSpotify,
  gpt: checkChatGPT,
  gemini: checkGemini,
  claude: checkClaude,
  copilot: checkCopilot,
  grok: checkGrok,
  pplx: checkPerplexity,
  abema: checkAbema,
  nico: checkNiconico,
  tver: checkTVer,
  unext: checkUNext,
  fod: checkFOD,
  dmm: checkDMM,
  mytv: checkMyTvSuper,
  viu: checkViu,
  tvb: checkTVB,
  nowe: checkNowE,
  encore: checkEncoreTVB,
  viutv: checkViuTV,
  bilitw: checkBiliTW,
  '4gtv': check4GTV,
  linetv: checkLineTV,
  myvideo: checkMyVideo,
  kktv: checkKKTV,
  hami: checkHamiVideo,
  hulu: checkHulu,
  peacock: checkPeacock,
  fubo: checkFuboTV,
  atv: checkAppleTV,
  tubi: checkTubi,
  starz: checkStarz
};

// ============================================================
// 主流程
// ============================================================

export default async function (ctx = {}) {
  const strategyGroup = (ctx.env && ctx.env.GROUP) || 'DIRECT';
  const widgetFamily = ctx.widgetFamily || 'systemMedium';
  const style = styleMode(ctx);

  const refreshMinutes = (function () {
    const n = Number((ctx.env && ctx.env.REFRESH_MINUTES) || 30);
    return isFinite(n) && n > 0 ? n : 30;
  })();

  // 默认 1800ms：两段串行（Netflix / Disney）也控制在 4 秒预算内
  const timeoutMs = (function () {
    const n = Number((ctx.env && ctx.env.TIMEOUT) || 1800);
    return isFinite(n) && n > 0 ? n : 1800;
  })();

  const refreshAfter = new Date(Date.now() + refreshMinutes * 60000).toISOString();

  // ---- 解析 CATEGORY：分组名可多选，按书写顺序去重 ----
  const tokens = String((ctx.env && ctx.env.CATEGORY) || '')
    .split('|')
    .map(function (s) { return s.trim().toLowerCase(); })
    .filter(Boolean);

  const groups = [];
  let keys = [];

  if (tokens.length) {
    for (const t of tokens) {
      if (!GROUPS[t]) continue;
      if (groups.indexOf(t) === -1) groups.push(t);
      for (const k of GROUPS[t]) {
        // 跨分组重复的服务只保留一次，位置以首次出现为准
        if (keys.indexOf(k) === -1) keys.push(k);
      }
    }
  }

  if (!keys.length) {
    groups.push(DEFAULT_GROUP);
    keys = GROUPS[DEFAULT_GROUP].slice();
  }

  // 只检测当前尺寸能显示的项（小 6 / 中 12 / 大 24）。
  // v1.0.3 是全量检测再按尺寸截断显示，小尺寸也得跟着发 24 个服务的请求。
  const displayLimit = limitForFamily(widgetFamily);
  if (keys.length > displayLimit) keys = keys.slice(0, displayLimit);

  const list = keys.map(function (k) {
    return SERVICES.find(function (s) { return s.key === k; });
  }).filter(Boolean);

  // ---- 出口地区先单独拿到 ----
  // 必须先于 36 个服务请求、独占代理跑完：否则代理被服务请求淹没时，
  // cdn-cgi/trace 也抢不到连接、跟着超时，exitRegion 为空，下面「按地区推断」整段失效 → 大尺寸全灰。
  // 这是 v1.0.8 大尺寸全部显示未知的根因。
  let exitRegion = '';
  try {
    const loc = await safeCheck(function () { return getExitRegion(ctx, strategyGroup, timeoutMs); });
    exitRegion = String((loc && loc.region) || '').toLowerCase();
  } catch (_) {}

  // ---- 并发探测 ----
  // 全部服务并发探测，整体预算统一 4 秒：超预算的按上面拿到的出口地区推断，保证刷新够快。
  // 单请求 TIMEOUT 默认 1800ms，两段串行（Netflix / Disney）也能在 4 秒内收口。
  const TOTAL_BUDGET_MS = 4000;
  const deadline = Date.now() + TOTAL_BUDGET_MS;

  const tasks = keys.map(function (key) {
    const fn = CHECKERS[key];
    return safeCheck(function () { return fn(ctx, strategyGroup, timeoutMs); }).then(function (r) {
      // 预算耗尽后仍未返回的，标记「未知」，后续按出口地区推断
      if (Date.now() > deadline) return result(ST.UNKNOWN, '', 'budget');
      return r;
    });
  });

  const settled = await Promise.all(tasks);

  const results = {};
  keys.forEach(function (k, idx) {
    const r = settled[idx];

    // 解锁但自身不带地区（AI 组 / B站等）→ 用出口地区兜底，保证每行都显示地区
    if (r.status === ST.OK && !r.region && exitRegion) {
      results[k] = result(ST.OK, exitRegion, r.info);
      return;
    }

    // 检测失败/超时 → 按出口地区查支持名单推断。
    // 只接受「推断为支持」；推断为不支持的一律保持未知 ——
    // 「未解锁」只留给真正按出口 IP 检测出来的结果，不拿推断冒充实测。
    if (r.status === ST.UNKNOWN && exitRegion) {
      const verdict = fallbackVerdict(k, exitRegion);
      if (verdict === 'ok') {
        results[k] = result(ST.OK, exitRegion, '按地区推断');
        return;
      }
      results[k] = r;
      return;
    }

    results[k] = r;
  });

  // ---- 渲染 ----
  return render({
    family: widgetFamily,
    style: style,
    refreshAfter: refreshAfter,
    list: list,
    results: results,
    group: strategyGroup,
    categories: groups,
    exitRegion: exitRegion
  });
}

// 右上角刷新时间（HH:MM），与订阅看板一致
function timeText() {
  const d = new Date();
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return h + ':' + m;
}

// 解锁比例横条：绿段 = 解锁，红段 = 未解锁 + 未知。
// 沿用订阅看板 renderProgress 的 flex 分段 + borderRadius 99 写法。
function unlockBar(okCount, total, okColor, noColor, height) {
  const ratio = total > 0 ? okCount / total : 0;
  const safe = Math.min(Math.max(ratio, 0), 1);

  let filled, empty;
  if (okCount <= 0) {
    filled = 0;
    empty = 100;
  } else if (okCount >= total) {
    filled = 100;
    empty = 0;
  } else {
    filled = Math.max(Math.round(safe * 1000) / 10, 1);
    empty = Math.max(100 - filled, 1);
  }

  return {
    type: 'stack',
    flex: 1,
    direction: 'row',
    alignItems: 'center',
    gap: 0,
    children: [
      { type: 'stack', flex: filled, height: height, backgroundColor: okColor, borderRadius: 99, children: [] },
      { type: 'stack', flex: empty, height: height, backgroundColor: noColor, borderRadius: 99, children: [] }
    ]
  };
}

// ============================================================
// 渲染
// ============================================================

// 各尺寸最多显示几行（受卡片物理高度限制）
function limitForFamily(family) {
  if (family === 'systemSmall') return 6;
  if (family === 'systemMedium') return 12;
  if (family === 'systemLarge' || family === 'systemExtraLarge') return 36;
  return 6;
}

function render(opts) {
  const family = opts.family;
  const style = opts.style;
  const results = opts.results;
  const group = opts.group;
  const exitRegion = opts.exitRegion || '';

  const list = opts.list.slice(0, limitForFamily(family));
  const big = family === 'systemLarge' || family === 'systemExtraLarge';

  const C = {
    bgTop: '#0C0D0F',
    bgBottom: '#141619',
    borderColor: 'rgba(255, 255, 255, 0.06)',
    text: '#F8FAFC',
    secondary: '#94A3B8',
    muted: '#64748B',
    ok: '#34D399',
    no: '#EF4444',
    warn: '#FACC15',
    banned: '#DC2626',
    unknown: '#64748B'
  };

  const gradient = {
    type: 'linear',
    colors: [C.bgTop, C.bgBottom],
    startPoint: { x: 0.5, y: 0 },
    endPoint: { x: 0.5, y: 1 }
  };

  function meta(r) {
    const st = (r && r.status) || ST.UNKNOWN;
    if (st === ST.OK) return { color: C.ok, symbol: 'sf-symbol:checkmark.circle.fill', label: '解锁' };
    if (st === ST.NO) return { color: C.no, symbol: 'sf-symbol:xmark.circle.fill', label: '未解锁' };
    if (st === ST.RESTRICTED) return { color: C.warn, symbol: 'sf-symbol:exclamationmark.triangle.fill', label: '受限' };
    if (st === ST.BANNED) return { color: C.banned, symbol: 'sf-symbol:exclamationmark.octagon.fill', label: '封锁' };
    return { color: C.unknown, symbol: 'sf-symbol:questionmark.circle.fill', label: '未知' };
  }

  const rows = list.map(function (s) {
    const r = results[s.key] || result(ST.UNKNOWN, '', '');
    return { service: s, r: r, m: meta(r) };
  });

  const total = opts.list.length;
  const okCount = opts.list.filter(function (s) {
    return (results[s.key] || {}).status === ST.OK;
  }).length;

  // 标题：单分组显示分组名，多分组显示「解锁检测」
  const titleText = opts.categories.length === 1
    ? (GROUP_LABELS[opts.categories[0]] || 'Unlock Check')
    : 'Unlock Check';

  function tail(x) {
    if (x.r.status === ST.OK) {
      // 解锁但没拿到地区 → 用出口地区兜底，避免显示 --
      const region = x.r.region || exitRegion;
      return region ? String(region).toUpperCase() : '--';
    }
    if (x.r.status === ST.RESTRICTED || x.r.status === ST.BANNED) {
      return x.r.info || x.m.label;
    }
    if (x.r.status === ST.NO) {
      return x.r.region ? String(x.r.region).toUpperCase() : x.m.label;
    }
    return x.m.label;
  }

  // 大尺寸两列：三列会把标签挤到换行截断（v1.0.5 实机问题），恒用两列
  const perColumn = Math.ceil(rows.length / 2);
  const columns = [rows.slice(0, perColumn), rows.slice(perColumn)];

  // 两列布局通用构建（medium / large 共用）；底部区域已整体移除
  function columnNode(list, labelSize, tailSize, iconSize, gap) {
    return {
      type: 'stack',
      direction: 'column',
      gap: gap,
      children: list.map(function (x) { return rowNode(x, labelSize, tailSize, iconSize, true); })
    };
  }

  // 单行：图标 + 名称 + 状态。wide 控制是否显示服务自身图标
  function rowNode(x, labelSize, tailSize, iconSize, showServiceIcon) {
    const children = [];

    if (showServiceIcon) {
      children.push({
        type: 'image',
        src: x.service.symbol,
        width: iconSize,
        height: iconSize,
        color: C.secondary
      });
    }

    children.push({
      type: 'text',
      text: x.service.label,
      font: { size: labelSize, weight: 'medium' },
      textColor: C.text,
      maxLines: 1
    });

    children.push({ type: 'spacer' });
    children.push({
      type: 'image',
      src: x.m.symbol,
      width: iconSize - 2,
      height: iconSize - 2,
      color: x.m.color
    });
    children.push({
      type: 'text',
      text: tail(x),
      font: { size: tailSize, weight: 'bold' },
      textColor: x.m.color,
      maxLines: 1
    });

    return { type: 'stack', direction: 'row', gap: 6, children: children };
  }

  // ---- accessoryInline ----
  if (family === 'accessoryInline') {
    const brief = rows.map(function (x) {
      return x.service.label + ' ' + tail(x);
    }).join(' · ');
    return {
      type: 'widget',
      refreshAfter: opts.refreshAfter,
      children: [{ type: 'text', text: brief || '解锁检测' }]
    };
  }

  // ---- accessoryCircular ----
  // 刻意不用 gauge 节点 —— 该类型未经实测。改用 IP 纯净度组件里已验证过的
  // stack + text 写法，锁屏上文字颜色由系统统一接管，textColor 仅作兜底。
  if (family === 'accessoryCircular') {
    return {
      type: 'widget',
      refreshAfter: opts.refreshAfter,
      children: [
        { type: 'spacer' },
        {
          type: 'stack',
          direction: 'column',
          alignItems: 'center',
          children: [
            {
              type: 'text',
              text: okCount + '/' + total,
              font: { size: 'title', weight: 'bold' },
              textColor: okCount === total ? C.ok : C.secondary,
              textAlign: 'center',
              minScale: 0.5,
              maxLines: 1
            },
            {
              type: 'text',
              text: '解锁',
              font: { size: 'caption2' },
              textColor: C.secondary,
              textAlign: 'center',
              maxLines: 1
            }
          ]
        },
        { type: 'spacer' }
      ]
    };
  }

  // ---- accessoryRectangular ----
  if (family === 'accessoryRectangular') {
    const first = rows.slice(0, 3).map(function (x) {
      return {
        type: 'stack',
        direction: 'row',
        gap: 4,
        children: [
          { type: 'image', src: x.m.symbol, width: 11, height: 11, color: x.m.color },
          {
            type: 'text',
            text: x.service.label,
            font: { size: 12, weight: 'medium' },
            textColor: C.text,
            maxLines: 1
          },
          { type: 'spacer' },
          {
            type: 'text',
            text: tail(x),
            font: { size: 12, weight: 'bold' },
            textColor: x.m.color,
            maxLines: 1
          }
        ]
      };
    });

    return {
      type: 'widget',
      refreshAfter: opts.refreshAfter,
      children: [
        {
          type: 'text',
          text: titleText + ' ' + okCount + '/' + total,
          font: { size: 13, weight: 'bold' },
          textColor: C.secondary,
          maxLines: 1
        },
        { type: 'stack', direction: 'column', gap: 2, children: first }
      ]
    };
  }

  // ---- systemSmall（6 行）----
  if (family === 'systemSmall') {
    return {
      type: 'widget',
      ...rootBackground(style, gradient),
      border: { width: 1, color: C.borderColor },
      padding: 12,
      gap: 2,
      children: [
        {
          type: 'stack',
          direction: 'row',
          gap: 5,
          children: [
            { type: 'image', src: 'sf-symbol:play.tv.fill', width: 15, height: 15, color: C.ok },
            { type: 'spacer' },
            { type: 'text', text: timeText(), font: { size: 11, weight: 'medium' }, textColor: C.muted, maxLines: 1 }
          ]
        },
        {
          type: 'stack',
          direction: 'column',
          gap: 3,
          flex: 1,
          children: rows.map(function (x) { return rowNode(x, 12, 11, 12, false); })
        }
      ]
    };
  }

  // ---- systemMedium（12 项，两列各 6 行）----
  // 布局：标题 / 列表(flex:1 占满中间) / 横条贴底。
  // 不用弹性 spacer 推横条——内容一多 spacer 被压成负值就会重叠（v1.0.7 实机问题）；
  // 改为列表 flex:1 吃满剩余高度，横条紧贴末位永远贴底且与列表不重叠。
  // 行距与字号按两列各 6 行压缩，确保总高不超组件。
  if (family === 'systemMedium') {
    return {
      type: 'widget',
      ...rootBackground(style, gradient),
      border: { width: 1, color: C.borderColor },
      padding: 13,
      gap: 2,
      children: [
        {
          type: 'stack',
          direction: 'row',
          gap: 6,
          alignItems: 'center',
          children: [
            { type: 'image', src: 'sf-symbol:play.tv.fill', width: 14, height: 14, color: C.ok },
            { type: 'text', text: titleText, font: { size: 14, weight: 'bold' }, textColor: C.text },
            { type: 'spacer' },
            { type: 'text', text: timeText(), font: { size: 11, weight: 'medium' }, textColor: C.muted, maxLines: 1 }
          ]
        },
        {
          type: 'stack',
          direction: 'row',
          gap: 14,
          flex: 1,
          children: columns.map(function (col) {
            return { ...columnNode(col, 11, 10, 11, 3), flex: 1 };
          })
        },
        {
          type: 'stack',
          direction: 'row',
          alignItems: 'center',
          gap: 8,
          children: [
            unlockBar(okCount, total, C.ok, C.no, 5),
            { type: 'text', text: okCount + '/' + total, font: { size: 10, weight: 'bold' }, textColor: C.text, maxLines: 1 }
          ]
        }
      ]
    };
  }

  // ---- systemLarge / systemExtraLarge（上限 36 项，两列各 18 行）----
  // 与 medium 同构：标题 / 列表(flex:1 占满中间) / 横条贴底。
  // 行距与字号按两列各 18 行压缩，确保总高不超组件（large 实测曾因 18 行超高而重叠）。
  return {
    type: 'widget',
    ...rootBackground(style, gradient),
    border: { width: 1, color: C.borderColor },
    padding: 15,
    gap: 2,
    children: [
      {
        type: 'stack',
        direction: 'row',
        gap: 6,
        alignItems: 'center',
        children: [
          { type: 'image', src: 'sf-symbol:play.tv.fill', width: 15, height: 15, color: C.ok },
          { type: 'text', text: titleText, font: { size: 15, weight: 'bold' }, textColor: C.text },
          { type: 'spacer' },
          { type: 'text', text: timeText(), font: { size: 11, weight: 'medium' }, textColor: C.muted, maxLines: 1 }
        ]
      },
      {
        type: 'stack',
        direction: 'row',
        gap: 16,
        flex: 1,
          children: columns.map(function (col) {
            return { ...columnNode(col, 10, 9, 10, 3), flex: 1 };
          })
        },
      {
        type: 'stack',
        direction: 'row',
        alignItems: 'center',
        gap: 8,
        children: [
          unlockBar(okCount, total, C.ok, C.no, 6),
          { type: 'text', text: okCount + '/' + total, font: { size: 11, weight: 'bold' }, textColor: C.text, maxLines: 1 }
        ]
      }
    ]
  };
}
