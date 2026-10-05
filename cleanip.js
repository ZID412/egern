// Egern 小组件脚本（generic 类型）—— IP 纯净度 / 风险 原生文本组件
// 数据源：proxycheck.io（免费、无需 API Key，JSON，支持指定 IP）
//   免费额度：每个来源 IP 每天 100 次；到 proxycheck.io 免费注册可提到 1000 次/天
//
// 用法：工具 → 脚本 → + → 类型 generic，粘入本文件内容；
//       再到「分析 → 小组件画廊 → +」新建小组件并关联该脚本（大号/中号都行）。
//
// env（都可省略）：
//   IP           要查的 IP；留空 = 查询当前出口 IP（在 Egern 里即代理节点出口）
//   POLICY       该请求使用的代理策略（策略组名 / 节点名 / DIRECT / REJECT）；不填按默认路由
//   REFRESH_MIN  本地缓存分钟数，默认 15

export default async function (ctx) {
  const ip = (ctx.env.IP || '').trim();
  const TTL = Number(ctx.env.REFRESH_MIN || 15) * 60 * 1000;
  const now = Date.now();
  const CACHE_KEY = 'proxycheck|' + ip;

  const cached = ctx.storage.getJSON(CACHE_KEY);
  let info = cached && cached.at && now - cached.at < TTL ? cached.info : null;

  if (!info) {
    const options = { timeout: 15000 };
    if (ctx.env.POLICY) options.policy = ctx.env.POLICY;

    const url = 'https://proxycheck.io/v2/' + encodeURIComponent(ip) + '?vpn=1&asn=1&risk=1';
    const resp = await ctx.http.get(url, options);
    const json = await resp.json();

    const key = ip || Object.keys(json).find((k) => k !== 'status' && k !== 'node');
    const d = json[key] || {};
    info = {
      ip: key,
      status: json.status,
      message: json.message || '',
      risk: typeof d.risk === 'number' ? d.risk : null,
      proxy: d.proxy || null,          // yes / no
      type: d.type || null,            // VPN / Business / Hosting ...
      asn: d.asn || null,
      provider: d.provider || null,
      country: d.country || null,
      city: d.city || null,
      vpn: d.operator && d.operator.name ? d.operator.name : null,
    };
    ctx.storage.setJSON(CACHE_KEY, { at: now, info: info });
  }

  const risk = info.risk;
  const riskColor = risk === null ? '#8A8F98' : risk >= 60 ? '#EF4444' : risk >= 25 ? '#F59E0B' : '#22C55E';

  const accent = { light: '#111827', dark: '#F9FAFB' };
  const subtle = { light: '#6B7280', dark: '#9CA3AF' };

  const row = (label, value, color) => ({
    type: 'stack',
    direction: 'row',
    alignItems: 'center',
    gap: 8,
    children: [
      { type: 'text', text: label, font: { size: 'caption1' }, textColor: subtle },
      { type: 'spacer' },
      {
        type: 'text',
        text: value,
        font: { size: 'caption1', weight: 'semibold' },
        textColor: color || accent,
        maxLines: 1,
        minScale: 0.6,
      },
    ],
  });

  // 风险条：用一个横向 stack + flex 分配比例画出来（不需要额外资源）
  const bar =
    risk === null
      ? null
      : {
          type: 'stack',
          direction: 'row',
          height: 6,
          borderRadius: 3,
          backgroundColor: { light: '#E5E7EB', dark: '#374151' },
          children: [
            { type: 'stack', height: 6, borderRadius: 3, flex: Math.max(risk, 2), backgroundColor: riskColor },
            { type: 'stack', height: 6, flex: Math.max(100 - risk, 1), backgroundColor: { light: '#E5E7EB', dark: '#374151' } },
          ],
        };

  const children = [
    {
      type: 'stack',
      direction: 'row',
      alignItems: 'center',
      gap: 8,
      children: [
        { type: 'text', text: 'IP 纯净度', font: { size: 'footnote', weight: 'bold' }, textColor: accent },
        { type: 'spacer' },
        { type: 'text', text: 'proxycheck.io', font: { size: 'caption2' }, textColor: subtle },
      ],
    },
    {
      type: 'text',
      text: info.ip || '—',
      font: { size: 'title3', weight: 'bold' },
      textColor: accent,
      maxLines: 1,
      minScale: 0.5,
    },
    {
      type: 'text',
      text:
        [[info.country, info.city].filter(Boolean).join(' · '), info.asn].filter(Boolean).join(' · ') || '—',
      font: { size: 'caption1' },
      textColor: subtle,
      maxLines: 1,
      minScale: 0.6,
    },
    { type: 'spacer', length: 4 },
    row('风险分', risk === null ? '—' : risk + ' / 100', riskColor),
  ];
  if (bar) children.push(bar);
  children.push({ type: 'spacer' });
  children.push(row('类型', info.type || '—'));
  children.push(row('代理 / VPN', info.proxy === 'yes' ? '是' : info.proxy === 'no' ? '否' : '—', info.proxy === 'yes' ? '#EF4444' : undefined));
  if (info.vpn) children.push(row('VPN 运营商', info.vpn));
  children.push(row('运营商', info.provider || '—'));
  if (info.status && info.status !== 'ok') {
    children.push({
      type: 'text',
      text: '查询失败：' + (info.message || info.status),
      font: { size: 'caption2' },
      textColor: '#EF4444',
      maxLines: 2,
    });
  }

  return {
    type: 'widget',
    padding: 16,
    gap: 6,
    backgroundColor: { light: '#FFFFFF', dark: '#1C1C1E' },
    url: 'https://proxycheck.io/',
    refreshAfter: new Date(now + TTL).toISOString(),
    children: children,
  };
}
