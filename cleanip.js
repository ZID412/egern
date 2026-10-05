// Egern 小组件脚本（generic 类型）—— 显示 CleanIP.io 的 IP 综合报告卡片
//
// 用法：工具 → 脚本 → + → 类型 generic，粘入本文件内容；
//       再到「分析 → 小组件画廊 → +」新建小组件并关联该脚本，尺寸选【大号】。
//
// 可配置的 env（全部可省略）：
//   CARD_URL     cleanip.io「图片地址」标签页给出的 /c/xxxx.svg 链接
//                默认 report + clean + auto + 480 + 中文，已验证可用
//   FORMAT       'svg'（默认，矢量清晰、只用官方接口）或 'png'
//   IP           固定显示某个 IP，例如 1.1.1.1；留空 = 显示当前出口 IP
//   REFRESH_MIN  本地缓存分钟数，默认 15
//   POLICY       该请求使用的代理策略；填 DIRECT 可强制直连（这样卡片显示的才是本机 IP）

export default async function (ctx) {
  const CARD_URL = ctx.env.CARD_URL || 'https://cleanip.io/c/1jD7.svg';
  const FORMAT = (ctx.env.FORMAT || 'svg').toLowerCase();
  const FIXED_IP = (ctx.env.IP || '').trim();
  const TTL = Number(ctx.env.REFRESH_MIN || 15) * 60 * 1000;

  const now = Date.now();
  const CACHE_KEY = ['cleanip', CARD_URL, FORMAT, FIXED_IP].join('|');

  const cached = ctx.storage.getJSON(CACHE_KEY);
  let dataUri = cached && cached.at && now - cached.at < TTL ? cached.dataUri : null;

  if (!dataUri) {
    const options = { timeout: 20000 };
    if (ctx.env.POLICY) options.policy = ctx.env.POLICY;

    if (FORMAT === 'png') {
      // 备用方案：借第三方把 SVG 光栅化成 PNG 再内嵌（PNG 是 Egern 必然支持的位图格式）
      let ip = FIXED_IP;
      if (!ip) {
        const probe = await ctx.http.get('https://api.ipify.org', options);
        ip = (await probe.text()).trim();
      }
      const target = cardUrlFor(CARD_URL, ip, now);
      const proxy = 'https://images.weserv.nl/?url=' + encodeURIComponent(target) + '&output=png&w=720';
      const resp = await ctx.http.get(proxy, options);
      dataUri = 'data:image/png;base64,' + toBase64(new Uint8Array(await resp.arrayBuffer()));
    } else {
      const resp = await ctx.http.get(cardUrlFor(CARD_URL, FIXED_IP, now), options);
      dataUri = 'data:image/svg+xml;base64,' + toBase64(new Uint8Array(await resp.arrayBuffer()));
    }

    ctx.storage.setJSON(CACHE_KEY, { at: now, dataUri: dataUri });
  }

  return {
    type: 'widget',
    padding: 0,
    backgroundColor: { light: '#FFFFFF', dark: '#111827' },
    url: 'https://cleanip.io/',
    refreshAfter: new Date(now + TTL).toISOString(),
    children: [
      {
        type: 'image',
        src: dataUri,
        resizeMode: 'contain', // 完整显示整张卡片，不裁切（大号组件上下各留白约 21pt）
        flex: 1,
      },
    ],
  };
}

// ---- 工具函数 ----

// 拼出 https://cleanip.io/c/<hash>[/<ip>].svg?fresh=1&v=<ts>
function cardUrlFor(base, ip, ts) {
  const [path, query] = base.split('?');
  let url = ip ? path.replace(/\.svg$/, '/' + ip + '.svg') : path;
  const parts = [];
  if (query) parts.push(query);
  parts.push('fresh=1', 'v=' + ts);
  return url + '?' + parts.join('&');
}

// 纯 JS 的 base64 编码，不依赖 btoa
function toBase64(bytes) {
  const TABLE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const parts = [];
  let chunk = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : undefined;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : undefined;
    chunk += TABLE[b0 >> 2];
    chunk += TABLE[((b0 & 3) << 4) | (b1 === undefined ? 0 : b1 >> 4)];
    chunk += b1 === undefined ? '=' : TABLE[((b1 & 15) << 2) | (b2 === undefined ? 0 : b2 >> 6)];
    chunk += b2 === undefined ? '=' : TABLE[b2 & 63];
    if (chunk.length >= 8192) { parts.push(chunk); chunk = ''; }
  }
  parts.push(chunk);
  return parts.join('');
}
