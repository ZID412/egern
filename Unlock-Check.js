/*
ZID412 - Egern通用脚本小组件 - 解锁检测 v1.1.8
按分组检测当前出口 IP 对流媒体 / AI 服务的解锁情况。

【环境变量配置说明】
【必填项】
名称：GROUP
值：你的策略组名称

【选填项】
- 名称：CATEGORY
值：分组名，可多选（如OTT|AI），不填默认 OTT

OTT：AppleTV、Disney+、Netflix、Spotify、TikTok、YouTube
AI：ChatGPT、Claude、Copilot、Gemini、Grok、MetaAI
NSFW：E-Hentai、Hanime1、JavDB、JKForum、MissAV、Nhentai

CATEGORY 的填写顺序直接决定小 / 中 / 大尺寸的显示顺序

- 名称：REFRESH_MINUTES
值：小组件刷新间隔（单位：分钟，默认 30）

- 名称：TIMEOUT
值：单个请求超时（单位：毫秒，默认 1800）

- 名称：WIDGET_STYLE
值：glass（液态玻璃），不填默认黑色背景

【状态含义】
- 解锁（绿）：该服务在当前出口可用，右侧显示地区码
- 未解锁（红）：服务可达，但当前地区不支持
- 受限（黄）：部分可用（Netflix 仅自制剧 / ChatGPT 限流 / Abema 海外限定）
- 封锁（红）：IP 被服务方拉黑（Netflix 403 / OpenAI VPN 拦截）
- 未知（灰）：探测失败（超时、网络错误、接口变更）

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
  // ---- streaming（按服务名首字母排序）----
  { key: 'atv',    label: 'AppleTV',      symbol: 'sf-symbol:appletv.fill' },
  { key: 'dis',    label: 'Disney+',      symbol: 'sf-symbol:sparkles' },
  { key: 'nf',     label: 'Netflix',      symbol: 'sf-symbol:tv.fill' },
  { key: 'sp',     label: 'Spotify',      symbol: 'sf-symbol:music.note' },
  { key: 'tt',     label: 'TikTok',       symbol: 'sf-symbol:video.fill' },
  { key: 'yt',     label: 'YouTube',      symbol: 'sf-symbol:play.rectangle.fill' },
  // ---- ai（按服务名首字母排序）----
  { key: 'gpt',    label: 'ChatGPT',      symbol: 'sf-symbol:bubble.left.fill' },
  { key: 'claude', label: 'Claude',       symbol: 'sf-symbol:bubble.left.and.bubble.right.fill' },
  { key: 'copilot',label: 'Copilot',      symbol: 'sf-symbol:laptopcomputer' },
  { key: 'gemini', label: 'Gemini',       symbol: 'sf-symbol:sparkle' },
  { key: 'grok',   label: 'Grok',         symbol: 'sf-symbol:bolt.fill' },
  { key: 'meta',   label: 'MetaAI',       symbol: 'sf-symbol:infinity' },
  // ---- nsfw（按服务名首字母排序）----
  { key: 'eh',     label: 'E-Hentai',     symbol: 'sf-symbol:book.fill' },
  { key: 'hanime', label: 'Hanime1',      symbol: 'sf-symbol:play.square.fill' },
  { key: 'javdb',  label: 'JavDB',        symbol: 'sf-symbol:list.bullet.rectangle' },
  { key: 'jkf',    label: 'JKForum',      symbol: 'sf-symbol:text.bubble.fill' },
  { key: 'missav', label: 'MissAV',       symbol: 'sf-symbol:play.rectangle' },
  { key: 'nh',     label: 'Nhentai',      symbol: 'sf-symbol:book.closed.fill' }
];

// 分组 → 服务 key 列表（每项恰好 6 个）
const GROUPS = {
  OTT: ['atv', 'dis', 'nf', 'sp', 'tt', 'yt'],
  AI: ['gpt', 'claude', 'copilot', 'gemini', 'grok', 'meta'],
  NSFW: ['eh', 'hanime', 'javdb', 'jkf', 'missav', 'nh']
};

const GROUP_LABELS = {
  OTT: '流媒体',
  AI: 'AI 服务',
  NSFW: 'NSFW'
};

const DEFAULT_GROUP = 'OTT';

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

// 从 Netflix 跳转地址抽地区码：https://www.netflix.com/hk-en/title/… → 第 4 段截掉 -xx 后缀
function regionFromLocation(loc) {
  const parts = String(loc || '').split('/');
  if (parts.length < 5) return '';
  const seg = String(parts[3] || '').split('-')[0].toLowerCase();
  return /^[a-z]{2}$/.test(seg) ? seg : '';
}

// ---- Netflix ----
// 判定链：片源页 301 的跳转地址里就带地区段，直接读出即完成（v1.1.0 提速：常见非美区 3 请求 → 1 请求）；
// 读不出才补一个试探页；404/403 才请求第二个片源页区分「仅自制剧 / IP 被封」。
// 必须 redirect:'manual' —— 跟随重定向就拿不到 location 了。
async function checkNetflix(ctx, policy, timeoutMs) {
  // v1.1.6：timeoutMs 语义 = 本服务检测的预算，后续每段请求只用剩余时间
  const deadline = Date.now() + timeoutMs;
  const left = function () { return Math.max(deadline - Date.now(), 300); };
  const opt = { redirect: 'manual' };

  const r1 = await httpGet(ctx, 'https://www.netflix.com/title/81280792', policy, timeoutMs, opt);
  const s1 = readStatus(r1);
  const loc1 = readHeader(r1 && r1.headers, 'location');

  let s2 = 0;
  let loc2 = '';
  if (!(s1 === 200 || s1 === 301)) {
    const r2 = await httpGet(ctx, 'https://www.netflix.com/title/70143836', policy, left(), opt);
    s2 = readStatus(r2);
    loc2 = readHeader(r2 && r2.headers, 'location');

    if (s1 === 404 && s2 === 404) return result(ST.RESTRICTED, '', '仅自制剧');
    if (s1 === 403 && s2 === 403) return result(ST.BANNED, '', 'IP 被封');
    if (!(s2 === 200 || s2 === 301)) return result(ST.UNKNOWN, '', 'unexpected ' + s1 + '/' + s2);
  }

  const direct = regionFromLocation(s1 === 301 ? loc1 : (s2 === 301 ? loc2 : ''));
  if (direct) return result(ST.OK, direct, '');

  const resp3 = await httpGet(ctx, 'https://www.netflix.com/title/80018499', policy, left(), opt);
  const loc = readHeader(resp3 && resp3.headers, 'location');

  if (!loc) return result(ST.OK, 'us', '');

  const seg = regionFromLocation(loc);
  if (!seg) return result(ST.UNKNOWN, '', 'bad region');
  return result(ST.OK, seg, '');
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

  // 官网查询与令牌验证互不依赖，并行发（v1.1.0 提速：串行两跳 → 并排一跳）
  const pair = await Promise.all([
    httpPost(ctx, 'https://www.disneyplus.com', policy, timeoutMs, body, headers, 'manual'),
    httpPost(ctx, 'https://disney.api.edge.bamgrid.com/token', policy, timeoutMs, body, headers, 'manual')
  ]);

  const q = pair[0];
  const location = readHeader(q && q.headers, 'location');

  let queryRegion = '';
  if (!location) {
    queryRegion = readCookie(q && q.headers, 'x-dss-country').toLowerCase();
  } else if (location === 'https://disneyplus.disney.co.jp/') {
    queryRegion = 'jp';
  } else {
    return result(ST.NO, '', '地区不支持');
  }

  const v = pair[1];
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

// ---- TikTok ----
// 解析 www.tiktok.com 主页 HTML 内嵌的 region 字段（社区脚本同款方法，单请求）。
// 受限地区该字段位置会变成 #TikTokTraditions / This LIVE 文案 → 未解锁；解析不到 → 未知。
async function checkTikTok(ctx, policy, timeoutMs) {
  const resp = await httpGet(ctx, 'https://www.tiktok.com/', policy, timeoutMs);
  const body = await readText(resp);

  const i = body.indexOf('region":"');
  if (i === -1) return result(ST.UNKNOWN, '', 'no region');

  const rest = body.slice(i + 9);
  const q = rest.indexOf('"');
  const val = (q === -1 ? rest : rest.slice(0, q)).trim();
  if (!val) return result(ST.UNKNOWN, '', 'empty region');

  if (val.indexOf('The #TikTokTraditions') === 0 || val.indexOf("This LIVE isn't available") === 0) {
    return result(ST.NO, '', '');
  }

  const m = val.match(/^([A-Za-z]{2})$/);
  if (!m) return result(ST.UNKNOWN, '', 'bad region');
  return result(ST.OK, m[1].toLowerCase(), '');
}

// ============================================================
// ai 组
// ============================================================

// ---- 出口地区查询 ----
// 读 Cloudflare trace 拿出口地区码。与各服务检测并行执行，
// 给所有自身不带地区信息的解锁结果（AI 组等）做展示兜底。
// 主端点失败自动换备用 trace 端点重试一次（v1.1.4），尽量不出现解锁行显示 --。
const EXIT_TRACE_URLS = [
  'https://chat.openai.com/cdn-cgi/trace',
  'https://www.cloudflare.com/cdn-cgi/trace'
];
async function getExitRegion(ctx, policy, timeoutMs) {
  for (const url of EXIT_TRACE_URLS) {
    try {
      const ts = await readText(await httpGet(ctx, url, policy, timeoutMs));
      const i = ts.indexOf('loc=');
      if (i === -1) continue;

      const rest = ts.slice(i + 4);
      const nl = rest.indexOf('\n');
      const loc = (nl === -1 ? rest : rest.slice(0, nl)).trim().toUpperCase();
      if (loc) return result(ST.OK, loc, '');
    } catch (_) {}
  }
  return result(ST.UNKNOWN, '', 'no loc');
}

// ---- ChatGPT（可靠性高）----
// v1.1.7：地区复用前置「出口地区查询」的 trace 结果（同源同值，不再重复请求）；
// 主页请求已移除（它只为「VPN 拦截 / 限流」两个附加状态，却是最重的请求之一）——
// 现仅按出口地区 + OpenAI 支持名单判定：常见路径零请求、瞬时出结果。
async function checkChatGPT(ctx, policy, timeoutMs, exitRegionIn) {
  let loc = String(exitRegionIn || '').trim().toUpperCase();

  // 前置查询失败（exitRegion 为空）→ 自取一次 trace 兜底
  if (!loc) {
    const trace = await httpGet(ctx, 'https://chat.openai.com/cdn-cgi/trace', policy, timeoutMs);
    const ts = await readText(trace);
    const i = ts.indexOf('loc=');
    if (i === -1) return result(ST.UNKNOWN, '', 'no loc');

    const rest = ts.slice(i + 4);
    const nl = rest.indexOf('\n');
    loc = (nl === -1 ? rest : rest.slice(0, nl)).trim().toUpperCase();
    if (!loc) return result(ST.UNKNOWN, '', 'empty loc');
  }

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

// ---- MetaAI ----
// 判定移植自 oneclickvirt/UnlockTests（transnation/MetaAI.go）：
// 请求 www.meta.ai/ajax —— 400/404 = 区域支持（可访问）；200 = 被地区页接管 → 未解锁；
// 403 或其它状态码再看主页：GeoBlockedErrorRoot → 未解锁，Abra 主页标记 → 解锁（尝试从 code 取地区）。
async function checkMetaAI(ctx, policy, timeoutMs) {
  // v1.1.6：timeoutMs 语义 = 本服务检测的预算，第二段请求只用剩余时间
  const deadline = Date.now() + timeoutMs;
  const headers = Object.assign({}, BROWSER_HEADERS, { 'accept-language': 'en-US,en;q=0.9' });

  const resp = await httpGet(ctx, 'https://www.meta.ai/ajax', policy, timeoutMs, { headers: headers });
  const st = readStatus(resp);

  if (st === 400 || st === 404) return result(ST.OK, '', '');
  if (st === 200) return result(ST.NO, '', '');

  const home = await httpGet(ctx, 'https://www.meta.ai/', policy, Math.max(deadline - Date.now(), 300), { headers: headers });
  const hs = readStatus(home);
  if (hs === 0) return result(ST.UNKNOWN, '', 'network');

  const hb = await readText(home);
  if (st === 403) return result(ST.OK, regionFromMetaCode(hb), '');

  if (hb.indexOf('GeoBlockedErrorRoot') !== -1) return result(ST.NO, '', 'GeoBlocked');
  if (
    hb.indexOf('AbraHomeRoot.react') !== -1 ||
    hb.indexOf('AbraHomeRootConversationQuery') !== -1 ||
    hb.indexOf('HomeRootQuery') !== -1 ||
    hb.indexOf('AbraRateLimitedErrorRoot') !== -1 ||
    hb.indexOf('KadabraRootContainer') !== -1
  ) {
    return result(ST.OK, regionFromMetaCode(hb), '');
  }
  if (hs === 200) return result(ST.OK, '', '');
  return result(ST.UNKNOWN, '', 'http ' + st + '/' + hs);
}

// 从 Meta 页面 "code":"xx_YY" 里取地区（en_US → us）；取不到返回空
function regionFromMetaCode(body) {
  const m = String(body).match(/"code"\s*:\s*"([^"]*)"/);
  if (!m) return '';
  const code = m[1];
  if (code.indexOf('_') !== -1) {
    const parts = code.split('_');
    if (parts.length >= 2 && /^[A-Za-z]{2}$/.test(parts[1])) return parts[1].toLowerCase();
    return '';
  }
  return code.length < 10 && /^[A-Za-z]{2}$/.test(code) ? code.toLowerCase() : '';
}

// ---- Apple TV+（显示 AppleTV）----
// v1.1.7：tv.apple.com 系页面已全面 404 失效（旧判定实际从未真正工作，此前靠推断遮掩）。
// 首选 Apple 定位服务接口 gcc：响应仅 2 字节，直接返回请求出口对应的商店地区码（TW/HK/CN…）。
// 中国大陆等不提供 Apple TV+ 的地区判未解锁；gcc 失败才回退旧的 tv.apple.com/us 探测。
const APPLE_TV_BLOCK = ['cn', 'kp', 'sy', 'cu', 'ir', 'ru'];
async function checkAppleTV(ctx, policy, timeoutMs) {
  // timeoutMs 语义 = 本服务检测的预算（v1.1.6 起），两段请求共享
  const deadline = Date.now() + timeoutMs;
  const left = function () { return Math.max(deadline - Date.now(), 300); };

  const gcc = await httpGet(ctx, 'https://gspe1-ssl.ls.apple.com/pep/gcc', policy, left());
  const code = String(await readText(gcc)).trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(code)) {
    const region = code.toLowerCase();
    if (APPLE_TV_BLOCK.indexOf(region) !== -1) return result(ST.NO, region, '');
    return result(ST.OK, region, '');
  }

  // gcc 拿不到地区码 → 回退旧探测（多为 404，仅保留 403 封锁 / 跳转地区 等信号）
  const resp = await httpGet(ctx, 'https://tv.apple.com/us', policy, left(), { redirect: 'manual' });
  const st = readStatus(resp);
  const loc = String(readHeader(resp && resp.headers, 'location'));

  if (st === 403 || loc.indexOf('unavailable') !== -1) return result(ST.NO, '', '');
  if (st !== 200 && st !== 301 && st !== 302) return result(ST.UNKNOWN, '', 'http ' + st);

  const m =
    loc.match(/tv\.apple\.com\/([a-z]{2})(?:[/?#]|$)/i) ||
    loc.match(/^\/([a-z]{2})(?:[/?#]|$)/i);
  return result(ST.OK, m ? m[1].toLowerCase() : '', '');
}

// ============================================================
// nsfw 组
// ============================================================

// 可访问性检测（启发式）：这些站点没有官方地区接口，判定的是「当前出口能否正常访问」——
// 403/451 或已知封锁页 → 未解锁；正常 200/3xx → 解锁（地区用出口地区兜底）。
// 已知边界：Cloudflare 人机校验可能把机房 IP 挡成 403，会误判为未解锁。
async function checkNSFWByAccess(ctx, policy, timeoutMs, url, keywords) {
  const resp = await httpGet(ctx, url, policy, timeoutMs);
  const st = readStatus(resp);
  const body = await readText(resp);
  const hay = String(body).toLowerCase();

  for (const kw of keywords) {
    if (hay.indexOf(kw) !== -1) return result(ST.NO, '', '');
  }
  if (st === 403 || st === 451) return result(ST.NO, '', '');
  if (st === 200 || st === 301 || st === 302) return result(ST.OK, '', '');
  return result(ST.UNKNOWN, '', 'http ' + st);
}

// ---- E-Hentai ----
// 被封 IP / 封锁时返回 Sad Panda 提示页
function checkEHentai(ctx, policy, timeoutMs) {
  return checkNSFWByAccess(ctx, policy, timeoutMs, 'https://e-hentai.org/', ['sad panda']);
}

// ---- Hanime1 ----
function checkHanime1(ctx, policy, timeoutMs) {
  return checkNSFWByAccess(ctx, policy, timeoutMs, 'https://hanime1.me/', []);
}

// ---- JavDB ----
function checkJavDB(ctx, policy, timeoutMs) {
  return checkNSFWByAccess(ctx, policy, timeoutMs, 'https://javdb.com/', []);
}

// ---- JKForum ----
function checkJKForum(ctx, policy, timeoutMs) {
  return checkNSFWByAccess(ctx, policy, timeoutMs, 'https://jkforum.net/', []);
}

// ---- MissAV ----
function checkMissAV(ctx, policy, timeoutMs) {
  return checkNSFWByAccess(ctx, policy, timeoutMs, 'https://missav.ws/', []);
}

// ---- Nhentai ----
function checkNhentai(ctx, policy, timeoutMs) {
  return checkNSFWByAccess(ctx, policy, timeoutMs, 'https://nhentai.net/', []);
}

// ============================================================
// 超时兜底：按出口地区推断支持状态（v1.1.6 起暂时停用：超时不再推断）
// ============================================================

// 地区型服务的支持地区白名单。地区分组已移除，此表暂不使用；
// v1.1.6 起超时不再推断，本段（含 GLOBAL_BLOCK / fallbackVerdict）暂时停用。
const SUPPORT_LISTS = {};

// 全球型流媒体的排除表：不在表内即视为支持
const GLOBAL_BLOCK = ['cn', 'kp', 'sy', 'cu', 'ir'];

// AI 组 5 项没有各自可靠的官方名单，用 OpenAI 的支持列表近似（都不含中国大陆/香港等）
const AI_FALLBACK = ['gemini', 'claude', 'copilot', 'grok', 'meta'];

// 返回 'ok' | 'no' | null（null = 无从推断，保持未知）
function fallbackVerdict(key, region) {
  const r = String(region).toLowerCase();
  if (!r) return null;

  if (key === 'gpt' || AI_FALLBACK.indexOf(key) !== -1) {
    return GPT_SUPPORT.has(r.toUpperCase()) ? 'ok' : 'no';
  }

  const list = SUPPORT_LISTS[key];
  if (list) return list.indexOf(r) !== -1 ? 'ok' : 'no';

  // 全球型流媒体（nf / dis / yt / tt / atv / sp 等）按排除表
  return GLOBAL_BLOCK.indexOf(r) === -1 ? 'ok' : 'no';
}

// ============================================================
// 检测函数分发表
// ============================================================

const CHECKERS = {
  nf: checkNetflix,
  dis: checkDisney,
  yt: checkYouTube,
  tt: checkTikTok,
  atv: checkAppleTV,
  sp: checkSpotify,
  gpt: checkChatGPT,
  gemini: checkGemini,
  claude: checkClaude,
  copilot: checkCopilot,
  grok: checkGrok,
  meta: checkMetaAI,
  eh: checkEHentai,
  hanime: checkHanime1,
  javdb: checkJavDB,
  jkf: checkJKForum,
  missav: checkMissAV,
  nh: checkNhentai
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

  // v1.1.6：检测请求不再设独立超时（统一用整体预算，见下方 BUDGET_MS）；
  // 出口地区查询是整体流程的前置一小步，保留一个短超时，避免它拖住全部检测。
  const EXIT_TIMEOUT_MS = 1800;

  const refreshAfter = new Date(Date.now() + refreshMinutes * 60000).toISOString();

  // ---- 解析 CATEGORY：分组名可多选，按书写顺序决定展示顺序 ----
  // 分组：OTT / AI / NSFW（全大写），用 | 分隔；展示顺序跟随书写（OTT|AI → OTT 在前，AI|OTT → AI 在前）。
  // 组内按服务名首字母排序；旧写法一律无效。
  const tokens = String((ctx.env && ctx.env.CATEGORY) || '')
    .split('|')
    .map(function (s) { return s.trim(); })
    .filter(Boolean);

  const groups = [];
  let keys = [];

  if (tokens.length) {
    // 按 CATEGORY 书写顺序收集（v1.1.1），组内保持首字母排序；重复分组只保留首次
    for (const t of tokens) {
      if (!GROUPS[t]) continue;
      if (groups.indexOf(t) === -1) groups.push(t);
      for (const k of GROUPS[t]) {
        if (keys.indexOf(k) === -1) keys.push(k);
      }
    }
  }

  if (!keys.length) {
    groups.push(DEFAULT_GROUP);
    keys = GROUPS[DEFAULT_GROUP].slice();
  }

  // 只检测当前尺寸能显示的项（小 6 / 中 12 / 大 36）。
  // v1.0.3 是全量检测再按尺寸截断显示，小尺寸也得跟着发全部服务的请求。
  const displayLimit = limitForFamily(widgetFamily);
  if (keys.length > displayLimit) keys = keys.slice(0, displayLimit);

  const list = keys.map(function (k) {
    return SERVICES.find(function (s) { return s.key === k; });
  }).filter(Boolean);

  // ---- 出口地区先单独拿到 ----
  // 必须先于全部服务请求、独占代理跑完：否则代理被服务请求淹没时，
  // cdn-cgi/trace 也抢不到连接、跟着超时，exitRegion 为空，
  // 所有「解锁但服务自身不带地区」的行都会没有地区可显示（v1.0.8 全灰事故的根因）。
  let exitRegion = '';
  try {
    const loc = await safeCheck(function () { return getExitRegion(ctx, strategyGroup, EXIT_TIMEOUT_MS); });
    exitRegion = String((loc && loc.region) || '').toLowerCase();
  } catch (_) {}

  // 统一应用出口地区兜底（v1.1.6 起：超时/失败不再按地区推断解锁，未知保持未知）
  function applyInference(r) {
    // 解锁但自身不带地区（AI 组等）→ 用出口地区兜底，保证每行都显示地区
    if (r.status === ST.OK && !r.region && exitRegion) {
      return result(ST.OK, exitRegion, r.info);
    }
    return r;
  }

  const isLarge = widgetFamily === 'systemLarge' || widgetFamily === 'systemExtraLarge';
  const results = {};

  // ---- v1.1.6：所有检测请求全并发；单项不设独立超时，统一以整体预算为上限 ----
  // 小/中尺寸预算 5 秒、大尺寸 10 秒：预算内返回的按真实结果，超预算未返回的按「未知」，
  // 不再按出口地区推断解锁（推断已暂时停用）。
  // 注：Netflix / MetaAI 是内部串联多段请求的服务，其后续请求只从剩余预算里扣时间。
  const BUDGET_MS = isLarge ? 10000 : 5000;
  const tasks = keys.map(function (key) {
    const fn = CHECKERS[key];
    // 第 4 参 = 前置拿到的出口地区（只有 ChatGPT 会用：复用 trace、零额外请求）
    return safeCheck(function () { return fn(ctx, strategyGroup, BUDGET_MS, exitRegion); });
  });

  const settled = await Promise.all(tasks);
  keys.forEach(function (k, idx) {
    results[k] = applyInference(settled[idx]);
  });

  // ---- 结果缓存（v1.1.8）----
  // 每个策略组一份（键含策略组名）；单条结果各记时间、12 小时内有效。
  // 本轮未测出的行（未知，多为超时/失败）→ 用缓存里该服务上一次的结果兜底显示（不提前获取：
  // 只有出现未知行才会被替换使用）；本轮的有效结果写回缓存；未知不写入、不覆盖旧值。
  const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
  const CACHE_KEY = 'unlock_cache_v1_' + String(strategyGroup || 'default');
  const nowTs = Date.now();

  const cacheItems = {};
  try {
    const cached = ctx.storage.getJSON(CACHE_KEY);
    if (cached && cached.items) {
      for (const ck in cached.items) {
        const o = cached.items[ck];
        if (o && o.st && o.st !== ST.UNKNOWN && (nowTs - Number(o.t || 0)) <= CACHE_TTL_MS) {
          cacheItems[ck] = o;
        }
      }
    }
  } catch (_) {}

  for (const k of keys) {
    const r = results[k];
    if (r && r.status !== ST.UNKNOWN) {
      const prev = cacheItems[k];
      cacheItems[k] = {
        st: r.status,
        rg: r.region || (prev && prev.rg) || '',
        nf: r.info || '',
        t: nowTs
      };
    } else if (cacheItems[k]) {
      results[k] = result(cacheItems[k].st, cacheItems[k].rg, cacheItems[k].nf);
    }
  }

  try {
    ctx.storage.setJSON(CACHE_KEY, { items: cacheItems });
  } catch (_) {}

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

// ---- 地区码 → 完整地区名（v1.1.6）----
// 仅影响展示（解锁行右侧文案），不参与判定；未收录的码原样显示。
const REGION_NAMES = {
  CN: '中国大陆', HK: '中国香港', TW: '中国台湾', MO: '中国澳门',
  JP: '日本', KR: '韩国', SG: '新加坡', MY: '马来西亚', TH: '泰国',
  VN: '越南', PH: '菲律宾', ID: '印度尼西亚', IN: '印度', PK: '巴基斯坦',
  BD: '孟加拉国', LK: '斯里兰卡', NP: '尼泊尔', KH: '柬埔寨', MM: '缅甸',
  LA: '老挝', MN: '蒙古', KZ: '哈萨克斯坦', UZ: '乌兹别克斯坦',
  US: '美国', CA: '加拿大', MX: '墨西哥', BR: '巴西', AR: '阿根廷',
  CL: '智利', CO: '哥伦比亚', PE: '秘鲁', VE: '委内瑞拉', EC: '厄瓜多尔',
  GB: '英国', UK: '英国', DE: '德国', FR: '法国', IT: '意大利', ES: '西班牙',
  PT: '葡萄牙', NL: '荷兰', BE: '比利时', CH: '瑞士', AT: '奥地利',
  SE: '瑞典', NO: '挪威', DK: '丹麦', FI: '芬兰', IE: '爱尔兰',
  PL: '波兰', CZ: '捷克', HU: '匈牙利', RO: '罗马尼亚', GR: '希腊',
  RU: '俄罗斯', UA: '乌克兰', TR: '土耳其', BG: '保加利亚', HR: '克罗地亚',
  SK: '斯洛伐克', SI: '斯洛文尼亚', RS: '塞尔维亚', LT: '立陶宛',
  LV: '拉脱维亚', EE: '爱沙尼亚', IS: '冰岛', LU: '卢森堡',
  IL: '以色列', SA: '沙特阿拉伯', AE: '阿联酋', QA: '卡塔尔', KW: '科威特',
  EG: '埃及', ZA: '南非', NG: '尼日利亚', KE: '肯尼亚', MA: '摩洛哥',
  AU: '澳大利亚', NZ: '新西兰'
};

function regionLabel(code) {
  const c = String(code || '').toUpperCase();
  return REGION_NAMES[c] || c;
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
      return region ? regionLabel(region) : '--';
    }
    if (x.r.status === ST.RESTRICTED || x.r.status === ST.BANNED) {
      return x.r.info || x.m.label;
    }
    if (x.r.status === ST.NO) {
      return x.r.region ? regionLabel(x.r.region) : x.m.label;
    }
    return x.m.label;
  }

  // medium 两列：三列会把标签挤到换行截断（v1.0.5 实机问题），恒用两列
  const perColumn = Math.ceil(rows.length / 2);
  const columns = [rows.slice(0, perColumn), rows.slice(perColumn)];

  // 列布局通用构建（medium 两列 / large 单列共用）
  function columnNode(list, labelSize, tailSize, iconSize, gap) {
    return {
      type: 'stack',
      direction: 'column',
      gap: gap,
      children: list.map(function (x) { return rowNode(x, labelSize, tailSize, iconSize, true); })
    };
  }

  // 单行：图标 + 名称 + 状态图标 + 地区/状态文案。
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

  // ---- systemLarge / systemExtraLarge（单列版，v1.1.2）----
  // 单列最多容纳 18 行（三组全选 6+6+6 正好放满）：字号按 18 行收敛（v1.1.5 再缩 1pt，
  // 消除末行与底部横条重叠），标题行保持大字号不变。
  return {
    type: 'widget',
    ...rootBackground(style, gradient),
    border: { width: 1, color: C.borderColor },
    padding: 16,
    gap: 3,
    children: [
      {
        type: 'stack',
        direction: 'row',
        gap: 6,
        alignItems: 'center',
        children: [
          { type: 'image', src: 'sf-symbol:play.tv.fill', width: 18, height: 18, color: C.ok },
          { type: 'text', text: titleText, font: { size: 18, weight: 'bold' }, textColor: C.text },
          { type: 'spacer' },
          { type: 'text', text: timeText(), font: { size: 11, weight: 'medium' }, textColor: C.muted, maxLines: 1 }
        ]
      },
      { ...columnNode(rows, 12, 11, 12, 2), flex: 1 },
      {
        type: 'stack',
        direction: 'row',
        alignItems: 'center',
        gap: 8,
        children: [
          unlockBar(okCount, total, C.ok, C.no, 7),
          { type: 'text', text: okCount + '/' + total, font: { size: 12, weight: 'bold' }, textColor: C.text, maxLines: 1 }
        ]
      }
    ]
  };
}
