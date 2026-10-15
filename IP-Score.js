/*
ZID412 - Egern通用脚本小组件 - IP纯净度 v1.0.17 测试版
实时展示当前出口 IP、网络类型、人机流量比、地理位置，并评估 IP 风险值与欺诈等级。

【v1.0.17 测试版改动】人机流量比横条改用 SVG 画法（与和风天气组件一致），绿红对撞配色，其余与 v1.0.16 完全一致。

【环境变量配置说明】
【必填项】
名称：GROUP
值：你的策略组名称

【选填项】
名称：SHOW_FULL_IP
值：任意填写（如数字 1）；配置后显示完整 IP 地址，不填默认脱敏打码（IPv4 后两段、IPv6 后两段作 *）

名称：WIDGET_STYLE
值：glass（液态玻璃），不填默认黑色背景

名称：CF_TOKEN
值：你的 Cloudflare API Token（配置后才会显示「人机流量比」横条）

人机流量比数据来自 Cloudflare Radar，可以前往CF官网免费申请
按ASN统计过去 7 天的human / bot 请求占比，不是针对单个 IP

该组件代码为修改版，原版地址：https://raw.githubusercontent.com/Bf0rest/Egern/main/Widget/IPPure-emoji.js
----------------------------------------------------------
 */

// IP 脱敏函数：IPv4 后两段、IPv6 后两段作 *
function maskIp(ip) {
  if (!ip || typeof ip !== 'string') return ip;

  // IPv4
  if (ip.includes('.')) {
    const parts = ip.split('.');
    if (parts.length === 4) {
      const p3 = '*'.repeat(parts[2].length);
      const p4 = '*'.repeat(parts[3].length);
      return `${parts[0]}.${parts[1]}.${p3}.${p4}`;
    }
    return ip;
  }

  // IPv6：只保留前两段，后面统一显示 ****:****
  if (ip.includes(':')) {
    const firstColon = ip.indexOf(':');
    if (firstColon === -1) return ip;
    const secondColon = ip.indexOf(':', firstColon + 1);
    if (secondColon === -1) return ip + ':****:****';
    return ip.substring(0, secondColon) + ':****:****';
  }

  return ip;
}

// 人机流量比：Cloudflare Radar 按 ASN 统计（需 CF_TOKEN）
// Radar 是 7 天滚动统计，变化很慢，按 ASN 缓存 12 小时，命中则零额外耗时
const BOT_CACHE_TTL = 12 * 3600000;

async function fetchBotClass(ctx, asn, strategyGroup, token) {

  const key = 'ippure_cf_' + asn;

  try {
    const cached = ctx.storage.getJSON(key);
    if (cached && typeof cached === 'object') {
      const ts = Number(cached.ts) || 0;
      if (ts === 0 || (Date.now() - ts) <= BOT_CACHE_TTL) {
        const h = Number(cached.human);
        const b = Number(cached.bot);
        if (isFinite(h) && isFinite(b)) {
          return { human: h, bot: b, cached: true };
        }
      }
    }
  } catch(_) {}

  try {

    const resp = await ctx.http.get(
      'https://api.cloudflare.com/client/v4/radar/http/summary/bot_class?name=main&asn=' + asn + '&dateRange=7d',
      {
        headers: {
          Authorization: 'Bearer ' + token,
          Accept: 'application/json'
        },
        policy: strategyGroup,
        timeout: 3500
      }
    );

    const body = await resp.json();
    if (!body || body.success !== true || !body.result) return null;

    // 带 name=main 时 key 是 main，不带时是 summary_0，两种都兼容
    const s = body.result.main || body.result.summary_0;
    if (!s) return null;

    const human = Number(s.human);
    const bot = Number(s.bot);
    if (!isFinite(human) || !isFinite(bot)) return null;

    try {
      ctx.storage.setJSON(key, { human: human, bot: bot, ts: Date.now() });
    } catch(_) {}

    return { human: human, bot: bot, cached: false };

  } catch(_) {
    return null;
  }

}


// 玻璃皮肤开关：读取 WIDGET_STYLE 环境变量
//   glass  ：根容器不设置任何背景，交给 iOS 系统材质接管（iOS 26 = 液态玻璃，壁纸透出）
//   不填/其他：保留原深色渐变背景（黑色），与旧版完全一致，可随时回退
function styleMode(ctx) {
  const value = String((ctx.env && ctx.env.WIDGET_STYLE) || 'classic').trim().toLowerCase();
  return value === 'glass' ? 'glass' : 'classic';
}

// 生成根容器背景：玻璃模式返回空对象（不画背景 → 系统材质透出），否则返回原深色渐变。
// 仅影响背景，不动任何 IP / 文字 / 横条逻辑。
function rootBackground(mode, gradient) {
  if (mode === 'glass') return {};
  return { backgroundGradient: gradient };
}

export default async function(ctx) {

  const strategyGroup =
    ctx.env.GROUP || 'DIRECT';

  const widgetFamily =
    ctx.widgetFamily || 'systemLarge';

  // 玻璃皮肤开关：读取 WIDGET_STYLE（glass = 液态玻璃透壁纸；不填 = 黑色背景）
  const style = styleMode(ctx);

  // 可选：配置了 CF_TOKEN 才会去查人机流量比
  const cfToken = String(ctx.env.CF_TOKEN || '').trim();

  // IP 脱敏开关：默认打码；配置 SHOW_FULL_IP（任意非空值）才显示完整 IP 地址
  const showFullIp = String(ctx.env.SHOW_FULL_IP || '').trim() !== '';


  const C = {
    bgTop: '#0C0D0F',
    bgBottom: '#141619',

    borderColor: 'rgba(255, 255, 255, 0.06)',

    text: '#F8FAFC',
    secondary: '#94A3B8',
    muted: '#64748B',

    blue: '#60A5FA',

    // IPPure 6 档风险色（绿→红渐进）
    risk0: '#22C55E',  // 0-15    优质
    risk1: '#84CC16',  // 16-25   良好
    risk2: '#EAB308',  // 26-40   普通
    risk3: '#F59E0B',  // 41-50   低危
    risk4: '#F97316',  // 51-70   中危
    risk5: '#DC2626',  // 71-85   高危
    risk6: '#EF4444',  // 86-100  极高危（比 risk5 更亮：深色底上更深的红反而更糊）

    green: '#34D399',
    yellow: '#FACC15',
  };

  const premiumGradient = {
    type: 'linear',
    colors: [C.bgTop, C.bgBottom],
    startPoint: { x: 0.5, y: 0 },
    endPoint: { x: 0.5, y: 1 }
  };


  let data = null;
  let source = 'live';          // live | cache | ipasn | failed
  let latency = '--';
  const CACHE_TTL = 3600000;
  const cacheKey = 'ippure_' + strategyGroup;

  const t0 = Date.now();

  try {

    const resp = await ctx.http.get(
      'https://my.ippure.com/v1/info',
      {
        policy: strategyGroup,
        timeout: 8000
      }
    );

    const body = await resp.json();

    // 限流 / 错误页 / 空 JSON 都没有 ip 字段，一律按本次失败处理，避免渲染出一张空白卡
    if (!body || typeof body !== 'object' || !body.ip) {
      throw new Error('invalid payload');
    }

    data = body;
    data.ip = showFullIp ? data.ip : maskIp(data.ip);
    latency = (Date.now() - t0) + 'ms';

    try {
      ctx.storage.setJSON(cacheKey, { ...data, ts: Date.now() });
    } catch(_) {}

  } catch(e) {

    latency = (Date.now() - t0) + 'ms';

    try {
      const cached = ctx.storage.getJSON(cacheKey);
      if (cached && typeof cached === 'object') {
        // 老缓存没有 ts 字段：接纳，不做严格丢弃；只有拿到 ts 才校验新鲜度
        const ts = Number(cached.ts) || 0;
        if (ts === 0 || (Date.now() - ts) <= CACHE_TTL) {
          data = cached;
          source = 'cache';
          const ageMin = ts ? Math.round((Date.now() - ts) / 60000) : 0;
          latency = ageMin > 0 ? ageMin + 'min前' : '刚刚';
        }
      }
    } catch(_) {}

    if (!data) {
      try {
        const ipResp = await ctx.http.get(
          'https://httpbin.org/ip',
          { policy: strategyGroup, timeout: 5000 }
        );
        const ipBody = await ipResp.json();
        // 经过代理时 origin 可能是 "ip1, ip2"
        const rawOrigin = String((ipBody && ipBody.origin) || '');
        const ip = String(rawOrigin.split(',')[0] || '').trim() || '--';
        const asn = $utils.ipasn(ip);
        data = {
          ip: ip,
          asn: asn ? String(asn) : '---',
          asOrganization: 'IPASN',
          country: '--',
          region: '',
          city: '',
          // 拿不到风险数据就留空，不写死 0 —— 否则会显示成「优质」这种假安全结论
          fraudScore: undefined,
          isResidential: undefined,
          isBroadcast: undefined
        };
        latency = 'ipasn';
        source = 'ipasn';
      } catch(_) {}
    }

  }


  if (!data) {

    data = {
      ip: '请求失败',
      asn: '---',
      asOrganization: 'Network Error',
      country: 'Unknown',
      region: '',
      city: '',
      // 同理：连 IP 都没拿到时不编造分数（原来写死 99 显示「高危」，同样属于编造）
      fraudScore: undefined,
      isResidential: undefined,
      isBroadcast: undefined
    };
    source = 'failed';
    latency = '--';

  }


  // ---- 人机流量比（可选）----
  // 只在拿到有效 ASN 且配置了 CF_TOKEN 时才请求；失败一律静默降级为不显示横条
  let botClass = null;
  if (cfToken && data.asn && String(data.asn) !== '---' && String(data.asn) !== '--') {
    botClass = await fetchBotClass(ctx, String(data.asn), strategyGroup, cfToken);
  }


  // 关键：fraudScore 缺失 !== 0 分。接口不返回该字段时（IPv6 不评分、接口未返回、触发限流）
  // 一律显示「未检测」，不能再按 0 分渲染成绿色「优质」。
  const hasScore =
    data.fraudScore !== undefined &&
    data.fraudScore !== null &&
    data.fraudScore !== '' &&
    !isNaN(Number(data.fraudScore));

  const riskScore = hasScore ? Number(data.fraudScore) : null;
  const riskScoreText = hasScore ? String(riskScore) : '--';

  let riskText = '高危';
  let riskColor = C.risk5;

  if (!hasScore) {
    riskText = '未检测';
    riskColor = C.muted;
  } else if (riskScore <= 15) {
    riskText = '优质';
    riskColor = C.risk0;
  } else if (riskScore <= 25) {
    riskText = '良好';
    riskColor = C.risk1;
  } else if (riskScore <= 40) {
    riskText = '普通';
    riskColor = C.risk2;
  } else if (riskScore <= 50) {
    riskText = '低危';
    riskColor = C.risk3;
  } else if (riskScore <= 70) {
    riskText = '中危';
    riskColor = C.risk4;
  } else if (riskScore <= 85) {
    riskText = '高危';
    riskColor = C.risk5;
  } else {
    // 86-100：原来 71-100 一档太粗，51 分和 99 分被显示成同一个词，这里拆开
    riskText = '极高危';
    riskColor = C.risk6;
  }

  // isResidential 缺失时不能当 false（= 机房网络），同样按「未检测」处理
  const hasResidential = typeof data.isResidential === 'boolean';
  const isResidential = data.isResidential === true;

  const networkText = hasResidential
    ? (isResidential ? '住宅原生' : '机房网络')
    : '未检测';

  const networkColor = hasResidential
    ? (isResidential ? C.green : C.yellow)
    : C.muted;

  const hasBroadcast = typeof data.isBroadcast === 'boolean';
  const broadcastText = hasBroadcast
    ? (data.isBroadcast === true ? '是' : '否')
    : '未检测';

  // 底部状态栏：把原来永远绿勾的 Connection Active 换成真实来源 + 延迟
  const STATUS = {
    live:   { icon: 'sf-symbol:checkmark.circle.fill', color: C.green,  prefix: '实时 · ' },
    cache:  { icon: 'sf-symbol:clock.fill',            color: C.yellow, prefix: '缓存 · ' },
    ipasn:  { icon: 'sf-symbol:clock.fill',            color: C.yellow, prefix: '降级 · ' },
    failed: { icon: 'sf-symbol:xmark.circle.fill',     color: C.risk5,  prefix: '' }
  };
  const status = STATUS[source] || STATUS.live;
  const statusText = source === 'failed' ? '请求失败' : status.prefix + latency;


  const locationText = [
    data.country,
    data.region,
    data.city
  ]
  .filter(Boolean)
  .join(' · ');

  const shortLocation = [
    data.country,
    data.city
  ]
  .filter(Boolean)
  .join(' · ');


  function row(label, value, valueColor) {

    return {
      type: 'stack',
      direction: 'row',
      children: [

        {
          type: 'text',
          text: label,
          font: {
            size: 'caption1',
            weight: 'medium'
          },
          textColor: C.muted
        },

        {
          type: 'spacer'
        },

        {
          type: 'text',
          text: value,
          font: {
            size: 'caption1',
            weight: 'medium'
          },
          textColor: valueColor || C.secondary,
          textAlign: 'right'
        }

      ]
    };

  }

  // size 可选：不传 = caption2 + 圆点 7（中/大尺寸保持原样）；小尺寸传 10
  function badge(text, color, size) {

    return {
      type: 'stack',
      direction: 'row',
      gap: size ? 4 : 5,
      children: [

        {
          type: 'image',
          src: 'sf-symbol:circle.fill',
          width: size ? 6 : 7,
          height: size ? 6 : 7,
          color: color
        },

        {
          type: 'text',
          text: text,
          font: {
            size: size || 'caption2',
            weight: 'bold'
          },
          textColor: color
        }

      ]
    };

  }

  // v1.0.17：人机流量比横条改用 SVG 画法（同和风天气组件）
  // 底槽为 bot 红（C.risk5 #DC2626）整条铺满，human 绿（C.green #34D399）按 human% 从左铺开
  // 用 viewBox 相对坐标 + 外层 flex 拉伸，自适应容器宽度，不再依赖两段 flex 分配
  function humanBotBarSvg(humanPct, barH) {
    const barW = 300;
    const ratio = Math.max(0, Math.min(100, Number(humanPct) || 0)) / 100;
    const fillW = Math.round(barW * ratio);
    const r = barH / 2;
    return `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${barW} ${barH}' preserveAspectRatio='none'>` +
      `<rect x='0' y='0' width='${barW}' height='${barH}' rx='${r}' fill='%23DC2626'/>` +
      `<rect x='0' y='0' width='${fillW}' height='${barH}' rx='${r}' fill='%2334D399'/>` +
      `</svg>`;
  }

  // 小尺寸专用的人机流量比：标签 + ASN 在横条上方，human / bot 在横条下方
  // （中/大尺寸是「标签与 human/bot 同一行、都在横条上方」，布局不同，故单独写一份）
  function botClassRowsSmall(bc) {

    if (!bc) return [];

    const humanPct = Math.round(bc.human * 10) / 10;
    const botPct = Math.round(bc.bot * 10) / 10;

    // 三层收进一个 gap:2 的容器，让「标签 / 横条 / human-bot」成为一组；
    // 与外层的间距由小尺寸根容器的 gap 统一控制，三层之间不会被拉开
    return [

      {
        type: 'stack',
        direction: 'column',
        gap: 2,
        children: [

          // 包一层 row + spacer 让文字撑满宽度 —— column 容器里的窄元素默认会被居中，
          // alignItems:'start' 在本地示例中没有先例，不敢赌，用撑满宽度来实现左对齐
          {
            type: 'stack',
            direction: 'row',
            children: [
              {
                type: 'text',
                text: '人机流量比 · AS' + String(data.asn),
                font: { size: 10, weight: 'medium' },
                textColor: C.secondary
              },
              { type: 'spacer' }
            ]
          },

          {
            type: 'stack',
            direction: 'row',
            alignItems: 'center',
            height: 4,
            children: [
              {
                type: 'image',
                src: 'data:image/svg+xml,' + humanBotBarSvg(humanPct, 4),
                flex: 1,
                height: 4
              }
            ]
          },

          {
            type: 'stack',
            direction: 'row',
            children: [
              {
                type: 'text',
                text: 'human ' + humanPct + '%',
                font: { size: 10, weight: 'medium' },
                textColor: C.green
              },
              { type: 'spacer' },
              {
                type: 'text',
                text: 'bot ' + botPct + '%',
                font: { size: 10, weight: 'medium' },
                textColor: C.risk5,
                textAlign: 'right'
              }
            ]
          }

        ]
      }

    ];

  }

  // 人机流量比横条：human 绿 / bot 红，左右两段胶囊紧贴（同订阅看板进度条画法）
  // 未配置 CF_TOKEN 或取数失败时返回空数组，不影响任何既有布局
  // v1.0.3：标签行与横条收进同一个 gap:2 的 column 容器，两者间距不再受外层 widget 的 gap 影响
  // v1.0.5：标签色改成由调用方传入 —— 中尺寸底部（地区 + 风险值）用 C.secondary，
  //          大尺寸 row() 的标签用 C.muted，两处基准不同，必须各跟各的否则会暗一档
  function botClassRows(bc, labelColor) {

    if (!bc) return [];

    const humanPct = Math.round(bc.human * 10) / 10;
    const botPct = Math.round(bc.bot * 10) / 10;

    return [

      {
        type: 'stack',
        direction: 'column',
        gap: 2,
        children: [

          {
            type: 'stack',
            direction: 'row',
            alignItems: 'center',
            children: [

              {
                type: 'text',
                text: '人机流量比 · AS' + String(data.asn),
                font: { size: 'caption2', weight: 'medium' },
                textColor: labelColor || C.muted
              },

              { type: 'spacer' },

              {
                type: 'stack',
                direction: 'row',
                gap: 6,
                children: [

                  {
                    type: 'text',
                    text: 'human ' + humanPct + '%',
                    font: { size: 'caption2', weight: 'medium' },
                    textColor: C.green
                  },

                  {
                    type: 'text',
                    text: 'bot ' + botPct + '%',
                    font: { size: 'caption2', weight: 'medium' },
                    textColor: C.risk5
                  }

                ]
              }

            ]
          },

          {
            type: 'stack',
            direction: 'row',
            alignItems: 'center',
            height: 5,
            children: [
              {
                type: 'image',
                src: 'data:image/svg+xml,' + humanBotBarSvg(humanPct, 5),
                flex: 1,
                height: 5
              }
            ]
          }

        ]
      }

    ];

  }

  // ============================================
  // LOCK SCREEN: CIRCULAR
  // ============================================

  if (widgetFamily === 'accessoryCircular') {

    // v1.0.16：锁屏圆形改为直接显示风险值数字（原 emoji 图标整套已删除）
    // 注：锁屏上文字颜色会被系统统一渲染成锁屏文字色，textColor 仅作兜底
    return {
      type: 'widget',
      children: [

        { type: 'spacer' },

        {
          type: 'stack',
          direction: 'column',
          alignItems: 'center',
          children: [
            {
              type: 'text',
              text: riskScoreText,
              font: { size: 'title', weight: 'bold' },
              textColor: riskColor,
              textAlign: 'center',
              minScale: 0.5,
              maxLine: 1
            }
          ]
        },

        { type: 'spacer' }

      ]
    };

  }

  // ============================================
  // LOCK SCREEN: RECTANGULAR
  // ============================================

  if (widgetFamily === 'accessoryRectangular') {

    return {

      type: 'widget',
      padding: [6, 10],
      gap: 2,

      children: [

        // v1.0.13：第 1 行由原来的地区改为 IP 地址（地区下移到第 2 行）
        {
          type: 'text',
          text: data.ip || 'N/A',
          font: {
            size: 14,
            weight: 'semibold'
          },
          textColor: C.text,
          maxLine: 1
        },

        // v1.0.13：第 2 行改为地区（原来在第 1 行）
        {
          type: 'text',
          text: (data.countryCode || data.country || '--') + (data.city ? ' · ' + data.city : ''),
          font: {
            size: 11,
            weight: 'medium'
          },
          textColor: C.secondary,
          maxLine: 1
        },

        // v1.0.14：第 3 行 —— 左：网络类型·评分档位（去掉圆点，改成文案拼接）；右：风险值（标签与数字贴近）
        {
          type: 'stack',
          direction: 'row',
          gap: 6,
          children: [

            // 左：网络类型 · 评分档位（原来的两个圆点徽章改成纯文字拼接）
            {
              type: 'stack',
              direction: 'row',
              gap: 3,
              children: [
                {
                  type: 'text',
                  text: networkText,
                  font: { size: 10, weight: 'bold' },
                  textColor: networkColor,
                  maxLine: 1
                },
                {
                  type: 'text',
                  text: '·',
                  font: { size: 10, weight: 'bold' },
                  textColor: C.muted
                },
                {
                  type: 'text',
                  text: riskText,
                  font: { size: 10, weight: 'bold' },
                  textColor: riskColor,
                  maxLine: 1
                }
              ]
            },

            { type: 'spacer' },

            // 右：风险值（标签与数字收进同一容器，gap 收紧避免隔太宽）
            {
              type: 'stack',
              direction: 'row',
              gap: 3,
              children: [
                {
                  type: 'text',
                  text: '风险值',
                  font: { size: 11, weight: 'medium' },
                  textColor: C.secondary
                },
                {
                  type: 'text',
                  text: riskScoreText,
                  font: { size: 11, weight: 'bold' },
                  textColor: riskColor
                }
              ]
            }

          ]
        }

      ]

    };

  }

  // ============================================
  // LOCK SCREEN: INLINE
  // ============================================

  if (widgetFamily === 'accessoryInline') {

    return {

      type: 'widget',

      children: [

        {
          type: 'text',
          text: (data.countryCode || data.country || '--') + ' · ' + networkText,
          font: {
            size: 14,
            weight: 'semibold'
          },
          textColor: C.text,
          maxLine: 1
        }

      ]

    };

  }

  // ============================================
  // SMALL (小号尺寸) —— v1.0.7 新增，原来没有这个分支，小尺寸走的是大号布局会溢出
  // 只保留：IP / 住宅机房 / 评分档位 / 人机流量比 / 位置 / 风险值
  // 排版与中尺寸一致，字号整体缩小以适配 iOS 小尺寸
  // ============================================

  if (widgetFamily === 'systemSmall') {

    return {

      type: 'widget',
      ...rootBackground(style, premiumGradient),
      border: { width: 1, color: C.borderColor },
      padding: 12,
      gap: 2,

      children: [

        // --- 1. 图标 + 标题（策略组名在小尺寸里不显示）---
        {
          type: 'stack',
          direction: 'row',
          gap: 5,
          children: [
            {
              type: 'image',
              src: 'sf-symbol:leaf.fill',
              width: 16,
              height: 16,
              color: C.green
            },
            {
              type: 'text',
              text: 'IP Score',
              font: { size: 18, weight: 'bold' },
              textColor: C.text
            }
          ]
        },

        // 4 个弹性 spacer 把剩余高度均分到各块之间 —— 光调统一 gap 做不到，
        // 那会把「标签 / 横条 / 百分比」也一起拉开，必须用 spacer 定点分配
        { type: 'spacer' },

        // --- 2. IP ---
        // 字号 16pt 是宽度上限：小尺寸可用宽约 134pt，脱敏 IP 最长 15 字符，再大就会溢出
        {
          type: 'text',
          text: data.ip || 'N/A',
          font: { size: 16, weight: 'bold' },
          textColor: C.text,
          maxLine: 1
        },

        { type: 'spacer' },

        // --- 3. 徽章行：住宅/机房 + 评分档位 ---
        {
          type: 'stack',
          direction: 'row',
          gap: 8,
          children: [
            badge(networkText, networkColor, 10),
            badge(riskText, riskColor, 10)
          ]
        },

        { type: 'spacer' },

        // --- 4. 人机流量比（标签在上、human/bot 在下）---
        ...botClassRowsSmall(botClass),

        { type: 'spacer' },

        // --- 5. 位置 + 风险值（收进同一容器，内部 gap 2，成一组）---
        {
          type: 'stack',
          direction: 'column',
          gap: 2,
          children: [

            {
              type: 'stack',
              direction: 'row',
              children: [
                {
                  type: 'text',
                  text: shortLocation || 'Unknown',
                  font: { size: 10, weight: 'medium' },
                  textColor: C.secondary,
                  maxLine: 1
                },
                { type: 'spacer' }
              ]
            },

            // 数字紧跟在「风险值」后面，字号与「风险值」一致。
            // 末尾必须补一个 spacer 把整行撑满 —— 否则这个窄 row 在 column 容器里会被居中，
            // 和标签、位置是同一个坑（column 容器的窄子元素默认居中）。
            {
              type: 'stack',
              direction: 'row',
              gap: 4,
              children: [

                {
                  type: 'text',
                  text: '风险值',
                  font: { size: 10, weight: 'medium' },
                  textColor: C.secondary
                },

                {
                  type: 'text',
                  text: riskScoreText,
                  font: { size: 10, weight: 'bold' },
                  textColor: riskColor
                },

                { type: 'spacer' }

              ]
            }

          ]
        }

      ]

    };

  }

  // ============================================
  // SMALL (中号尺寸)
  // ============================================

    if (widgetFamily === 'systemMedium') {

    return {

      type: 'widget',
      ...rootBackground(style, premiumGradient),
      border: { width: 1, color: C.borderColor },
      padding: [16, 18, 16, 18], 

      children: [

        // --- 1. 顶部 Header (图标+标题 + 右侧图标) ---
        {
          type: 'stack',
          direction: 'row',
          children: [

            {
              type: 'stack',
              direction: 'row',
              gap: 6,
              children: [
                {
                  type: 'image',
                  src: 'sf-symbol:leaf.fill',
                  width: 17,
                  height: 17,
                  color: C.green
                },
                {
                  type: 'text',
                  text: 'IP Score',
                  font: {
                    size: 18,
                    weight: 'bold'
                  },
                  textColor: C.text
                }
              ]
            },

            { type: 'spacer' },

            {
              type: 'text',
              text: strategyGroup,
              font: {
                size: 15,
                weight: 'medium'
              },
              textColor: C.muted
            }

          ]
        },

        { type: 'spacer' },

        // --- 2. 中间主 IP (居中并加加大字号) ---
        {
          type: 'text',
          text: data.ip || 'N/A',
          font: {
            size: 30,
            weight: 'bold'
          },
          textColor: C.text
        },

        // --- 3. 标签行 ---
        {
          type: 'stack',
          direction: 'row',
          gap: 10,
          children: [
            badge(networkText, networkColor),
            badge(riskText, riskColor)
          ]
        },

        // 中尺寸：人机流量比块与上方徽章（住宅原生 / 风险等级）之间留一段固定间距，
        // 让它独立成一块；大尺寸本身就有 gap:14 / 16，不需要额外加。
        // 未配置 CF_TOKEN 时不插入，避免白白占掉高度。
        ...(botClass ? [{ type: 'stack', height: 8, children: [] }] : []),

        ...botClassRows(botClass, C.secondary),

        { type: 'spacer' },

        // --- 4. 底部栏 (左边位置 + 右边带有“风险值”的字样) ---
        {
          type: 'stack',
          direction: 'row',
          children: [

            {
              type: 'text',
              text: shortLocation || 'Unknown',
              font: {
                size: 13,
                weight: 'medium'
              },
              textColor: C.secondary
            },

            { type: 'spacer' },

            {
              type: 'stack',
              direction: 'row',
              gap: 4,
              children: [
                {
                  type: 'text',
                  text: '风险值',
                  font: {
                    size: 13,
                    weight: 'medium'
                  },
                  textColor: C.secondary
                },
                {
                  type: 'text',
                  text: riskScoreText,
                  font: {
                    size: 15,
                    weight: 'bold'
                  },
                  textColor: riskColor
                }
              ]
            }

          ]
        }

      ]

    };

  }

  // ============================================
  // EXTRA LARGE (iPad)
  // ============================================

  if (widgetFamily === 'systemExtraLarge') {

    return {

      type: 'widget',
      ...rootBackground(style, premiumGradient),
      border: { width: 1, color: C.borderColor },
      padding: 22,
      gap: 16,

      children: [

        {
          type: 'stack',
          direction: 'row',
          children: [

            {
              type: 'stack',
              direction: 'row',
              gap: 8,
              children: [

                {
                  type: 'image',
                  src: 'sf-symbol:leaf.fill',
                  width: 20,
                  height: 20,
                  color: C.green
                },

                {
                  type: 'text',
                  text: 'IP Score',
                  font: {
                    size: 'headline',
                    weight: 'bold'
                  },
                  textColor: C.text
                }

              ]
            },

            {
              type: 'spacer'
            },

            {
              type: 'text',
              text: strategyGroup,
              font: {
                size: 'caption1',
                weight: 'bold'
              },
              textColor: C.blue
            }

          ]
        },

        {
          type: 'text',
          text: 'CURRENT IP',
          font: {
            size: 'caption1',
            weight: 'bold'
          },
          textColor: C.muted
        },

        {
          type: 'text',
          text: data.ip || 'N/A',
          font: {
            size: 36,
            weight: 'bold'
          },
          textColor: C.text
        },

        {
          type: 'stack',
          direction: 'row',
          gap: 14,
          children: [

            badge(networkText, networkColor),

            badge(riskText, riskColor)

          ]
        },

        row(
          '位置',
          locationText || 'Unknown'
        ),

        row(
          '运营商',
          data.asOrganization || 'Unknown'
        ),

        row(
          'ASN',
          String(data.asn || '---')
        ),

        row(
          '广播IP',
          broadcastText
        ),

        ...botClassRows(botClass),

        row(
          '风险值',
          riskScoreText,
          riskColor
        ),

        {
          type: 'spacer'
        },

        {
          type: 'stack',
          direction: 'row',
          gap: 6,
          children: [

            {
              type: 'image',
              src: status.icon,
              width: 12,
              height: 12,
              color: status.color
            },

            {
              type: 'text',
              text: statusText,
              font: { size: 'caption2' },
              textColor: status.color
            }

          ]
        }

      ]

    };

  }

  // ============================================
  // LARGE (大号尺寸)
  // ============================================

  return {

    type: 'widget',
    ...rootBackground(style, premiumGradient),
    border: { width: 1, color: C.borderColor },
    padding: 20,
    gap: 14,

    children: [

      {
        type: 'stack',
        direction: 'row',
        children: [

          {
            type: 'stack',
            direction: 'row',
            gap: 8,
            children: [

              {
                type: 'image',
                src: 'sf-symbol:leaf.fill',
                width: 18,
                height: 18,
                color: C.green
              },

              {
                type: 'text',
                text: 'IP Score',
                font: {
                  size: 'headline',
                  weight: 'bold'
                },
                textColor: C.text
              }

            ]
          },

          {
            type: 'spacer'
          },

          {
            type: 'text',
            text: strategyGroup,
            font: {
              size: 'caption1',
              weight: 'bold'
            },
            textColor: C.blue
          }

        ]
      },

      {
        type: 'text',
        text: 'CURRENT IP',
        font: {
          size: 'caption1',
          weight: 'bold'
        },
        textColor: C.muted
      },

      {
        type: 'text',
        text: data.ip || 'N/A',
        font: {
          size: 32,
          weight: 'bold'
        },
        textColor: C.text
      },

      {
        type: 'stack',
        direction: 'row',
        gap: 14,
        children: [

          badge(networkText, networkColor),

          badge(riskText, riskColor)

        ]
      },

      row(
        '位置',
        locationText || 'Unknown'
      ),

      row(
        '运营商',
        data.asOrganization || 'Unknown'
      ),

      row(
        '广播IP',
        broadcastText
      ),

      ...botClassRows(botClass),

      {
        type: 'stack',
        direction: 'row',
        children: [

          {
            type: 'text',
            text: '风险值',
            font: {
              size: 'caption1',
              weight: 'medium'
            },
            textColor: C.muted
          },

          { type: 'spacer' },

          {
            type: 'text',
            text: riskScoreText,
            font: {
              size: 'caption1',
              weight: 'bold'
            },
            textColor: riskColor,
            textAlign: 'right'
          }

        ]
      },

      {
        type: 'spacer'
      },

      {
        type: 'stack',
        direction: 'row',
        gap: 6,
        children: [

          {
            type: 'image',
            src: status.icon,
            width: 12,
            height: 12,
            color: status.color
          },

          {
            type: 'text',
            text: statusText,
            font: { size: 'caption2' },
            textColor: status.color
          }

        ]
      }

    ]

  };

}
