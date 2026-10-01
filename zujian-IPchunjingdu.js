// ZID412 - Egern通用脚本小组件 - ip纯净度
// ZID412 - Egern Universal Script Widget - IP Purity
// 实时展示当前出口 IP、网络类型（住宅原生/机房网络）、地理位置，并评估 IP 风险值与欺诈等级。

// 环境变量：
// 名称：GROUP
// 值：你的策略组名称

// IP 脱敏函数：IPv4 后两段按字符数动态替换成 *IPv6 只保留前两段，后面统一变成 ****:****
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

export default async function(ctx) {

  const strategyGroup =
    ctx.env.GROUP || 'DIRECT';

  const widgetFamily =
    ctx.widgetFamily || 'systemLarge';


  const C = {
    bgTop: '#0C0D0F',
    bgBottom: '#141619',

    borderColor: 'rgba(255, 255, 255, 0.06)',

    text: '#F8FAFC',
    secondary: '#94A3B8',
    muted: '#64748B',

    blue: '#60A5FA',

    // IPPure 6 档风险色（绿→红渐进）
    risk0: '#22C55E',  // 0-15   优质
    risk1: '#84CC16',  // 15-25  良好
    risk2: '#EAB308',  // 25-40  普通
    risk3: '#F59E0B',  // 40-50  低危
    risk4: '#F97316',  // 50-70  中危
    risk5: '#DC2626',  // 70-100 高危

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
  let fromCache = false;
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

    data = await resp.json();
    if (data && data.ip) data.ip = maskIp(data.ip);
    latency = (Date.now() - t0) + 'ms';

    try {
      ctx.storage.setJSON(cacheKey, { ...data, ts: Date.now() });
    } catch(_) {}

  } catch(e) {

    latency = (Date.now() - t0) + 'ms';

    try {
      const cached = ctx.storage.getJSON(cacheKey);
      if (cached) {
        data = cached;
        fromCache = true;
        const ageMin = Math.round((Date.now() - cached.ts) / 60000);
        latency = ageMin ? '缓存 ' + ageMin + 'min' : '缓存';
      }
    } catch(_) {}

    if (!data) {
      try {
        const ipResp = await ctx.http.get(
          'https://httpbin.org/ip',
          { policy: strategyGroup, timeout: 5000 }
        );
        const ipBody = await ipResp.json();
        const ip = ipBody.origin || '--';
        const asn = $utils.ipasn(ip);
        data = {
          ip: ip,
          asn: asn ? String(asn) : '---',
          asOrganization: 'IPASN',
          country: '--',
          region: '',
          city: '',
          fraudScore: 0,
          isResidential: false,
          isBroadcast: false
        };
        latency = 'ipasn';
        fromCache = true;
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
      fraudScore: 99,
      isResidential: false
    };

  }


  const riskScore =
    Number(data.fraudScore || 0);

  let riskText = '高危';
  let riskColor = C.risk5;

  if (riskScore <= 15) {
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
  }

  const riskIconMap = {
    risk0_house: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0NCA0NCI+CiAgPHBhdGggZD0iTTEuNzksMjIuNjlBMi42NSwyLjY1LDAsMCwxLC41NCwyMi40YTEsMSwwLDAsMS0uNTQtMSwxLjgsMS44LDAsMCwxLC42NS0xLjMyTDE4Ljk0LDJBNy43NCw3Ljc0LDAsMCwxLDIwLjUxLjcyYTMsMywwLDAsMSwzLDBBNy43NCw3Ljc0LDAsMCwxLDI1LjA2LDJMNDMuMzUsMjAuMDhBMS44LDEuOCwwLDAsMSw0NCwyMS40YTEuMDYsMS4wNiwwLDAsMS0uNTMsMSwyLjY2LDIuNjYsMCwwLDEtMS4yNi4yOUgzOC4wNkwyMiw2Ljg1LDUuOTQsMjIuNjlabS43My0xLjYzSDUuMjVMMjIsNC41LDM4Ljc1LDIxLjA2aDIuNzNhLjE3LjE3LDAsMCwwLC4xOS0uMTQuMzQuMzQsMCwwLDAtLjEzLS4yOUwyMy45LDMuMTlhOCw4LDAsMCwwLTEuMTItMSwxLjM0LDEuMzQsMCwwLDAtMS41NiwwLDgsOCwwLDAsMC0xLjEyLDFMMi40NiwyMC42M2EuMzQuMzQsMCwwLDAtLjEzLjI5QS4xNy4xNywwLDAsMCwyLjUyLDIxLjA2Wk05LjgzLDQwLjQ0Yy0uNCwwLS43OSwwLTEuMTYsMGwtMS4wNywwQTguMiw4LjIsMCwwLDEsNC42OCw0MCwxLjI2LDEuMjYsMCwwLDEsNCwzOC43N2E0LjU1LDQuNTUsMCwwLDEsMS0zLjA2LDMsMywwLDAsMSwyLjQyLTEuMTUsMy4xOCwzLjE4LDAsMCwxLDEuMzIuMjJBMi43LDIuNywwLDAsMCw5LjgzLDM1LDIuNjMsMi42MywwLDAsMCwxMSwzNC44MWEzLjIxLDMuMjEsMCwwLDEsMS4zMS0uMjMsNS4xOSw1LjE5LDAsMCwxLDEuOS40LDYsNiwwLDAsMSwxLjY2LDEsMS40OCwxLjQ4LDAsMCwxLC42OSwxdjMuNDZAbTUsMy4yM1Y0MC4zOGguMzJWMzguTS40NlYyMS43NWwxLjY2LTEuMjd2MTYuNEgzNy44N1YyMC40OGwxLjY3LDEuMjdWMzguNUgyOC44MXYxLjg4aC4zMnYzLjI5TTYuODEsMTUuMjdWNi43N0g2LjE5VjIuNjNsNS4yMSwwVjYuNzdoLS42M3Y0LjM4Wk04LjU2LDI3LjM1VjI1YS44Mi44MiwwLDAsMSwuODEtLjgxaDIuMzJ2My4xMlptLjgxLDQuNTlhLjgyLjgyLDAsMCwxLS44MS0uODFWMjguODFoMy4xM3YzLjEzWm0zLjczLTQuNTlWMjQuMjNoMi4zMmEuODIuODIsMCwwLDEsLjgxLjgxdjIuMzFabTAsNC41OVYyOC44MWgzLjEzdjIuMzJhLjgyLjgyLDAsMCwxLS44MS44MVpNMTYuNTQsNDJIMjcuNDZWNDAuODVIMTYuNTRabS4zMS0yLjM5aDEwLjNWMzguNUgxNi44NVptMS4yNS0yLjM2VjI2YTMuMjYsMy4yNiwwLDAsMSwxLjE5LTIuNTMsNCw0LDAsMCwxLDUuNDMsMEEzLjI5LDMuMjksMCwwLDEsMjUuOSwyNlYzNy4yOVptNi4xMS02LjQ2YS43MS43MSwwLDAsMCwuNTMtLjIyLjczLjczLDAsMCwwLC4yMi0uNTMuNzcuNzcsMCwwLDAtLjIyLS41My43NS43NSwwLDAsMC0uNTMtLjIyLjc1Ljc1LDAsMCwwLS43NS43NS43NS43NSwwLDAsMCwuNzUuNzVabTMuMjUsOS42MVYzN2ExLjQ4LDEuNDgsMCwwLDEsLjY5LTEsNiw2LDAsMCwxLDEuNjctMSw1LjE4LDUuMTgsMCwwLDEsMS44OS0uNCwzLjIxLDMuMjEsMCwwLDEsMS4zMS4yMywyLjYzLDIuNjMsMCwwLDAsMS4xNS4yMywyLjcyLDIuNzIsMCwwLDAsMS4xNy0uMjQsMy4wOCwzLjA4LDAsMCwxLDEuMy0uMjQsMywzLDAsMCwxLDIuNDQsMS4xNSw0LjYsNC42LDAsMCwxLDEsMy4wNkExLjI1LDEuMjUsMCwwLDEsMzkuMzMsNDBhOC4yMiw4LjIyLDAsMCwxLTIuOTQuMzRsLTEuMDYsMGMtLjM3LDAtLjc2LDAtMS4xNiwwWm0uMzEtMTMuMDlWMjVhLjgyLjgyLDAsMCwxLC44MS0uODFIMzAuOXYzLjEyWm0uODEsNC41OWEuODIuODIsMCwwLDEtLjgxLS44MVYyOC44MUgzMC45djMuMTNabTMuNzMtNC41OVYyNC4yM2gyLjMyYS44Mi44MiwwLDAsMSwuODEuODF2Mi4zMVptMCw0LjU5VjI4LjgxaDMuMTN2Mi4zMmEuODIuODIsMCwwLDEtLjgxLjgxWiIgZmlsbD0iI2ZmZiIvPgo8L3N2Zz4K',
    risk1_sparkles: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0NCA0NCI+CiAgPHBhdGggZD0iTTcuMzUsNDEuMDdsLS42LTNBMjAuODcsMjAuODcsMCwwLDAsNiwzNS4yMiwzLjcxLDMuNzEsMCwwLDAsNC45LDMzLjZhNS40LDUuNCwwLDAsMC0y-.OTEsMEwwLDMyVjMwLjIxbDIuOS0uNzhhNS45Miw1LjkyLDAsMCwwLDItLjkzQTMuNzMsMy43MywwLDAsMCw2LDI2Ljg5LDE5LjkxLDE5LjkxLDAsMCwwLDYuNzUsMjRsLjYtM0g5LjJsLjU5LDNhMTguNjcsMTguNjcsMCwwLDAsLjc2LDIuODcsMy41OCwzLjU4LDAsMCwwLDEuMSwxLjYxLDUuODksNS44OSwwLDAsMCwyLC45M2wyLjg4Ljc4djEuNzFsLTIuODguNzdhNS4zOCw1LjM4LDAsMCwwLTIsLjkxLDMuNTYsMy41NiwwLDAsMC0xLjEsMS42MiwxOS41NCwxOS41NCwwLDAsMC0uNzYsMjktLjU5LDMrdjNaOC4yMSwzOUEyNy40LDI3LjQsMCwwLDEsOSwzNS40NGE2LjQsNi40LDAsMCwxLDEuMDktMi4yNyw0LjQyLDQuNDIsMCwwLDEsMS44LTEuMzVBMTMuNDQsMTMuNDQsMCwwLDEsMTQuNzYsMzF2LjExATE0LjA5LDE0LjA5LDAsMCwxLDIuOTEtLjgxQTQuNTgsNC41OCwwLDAsMSwxMC4wNSwyOSw2LjMyLDYuMzIsMCwwLDEsOSwyNi42OWEyNy4yLDI3LjIsMCwwLDEtLjc1LDIuNTVoLjExYTI5LjQsMjkuNCwwLDAsMS0uNzMsMy41NUE2LjQ5LDYuNDksMCwwLDEsNi41MSwyOSw0LjYyLDQuNjIsMCwwLDEsNC43LDMwLjNhMTQuMTYsMTQuMTYsMCwwLDEtMi45LjgxVjMxYTEzLjUsMTMuNSwwLDAsMSwyLjkuODIsNC40NSw0LjQ1LDAsMCwxLDEuODEsMS4zNSw2LjU3LDYuNTcsMCwwLDEsMS4wOCwyLjI3QTI5LjYxLDI5LjYxLDAsMCwxLDguMzIsMzlabTIuMTEtMjAuNDUtLjQ0LTIuMzJhOS41LDkuNSwwLDAsMC0uNjktMi4zN0EyLjY2LDIuNjYsMCwwLDAsOCwxMi42MmE5LjI1LDkuMjUsMCwwLDAsMi4yMy0uNzJsLTEuNDMtLjMxVjkuOWwxLjQzLS4zM0E5LjYsOS42LDAsMCwwLDgsOC44MywyLjY4LDIuNjgsMCwwLDAsOS4xOSw3LjZhOS4yMSw5LjIxLDAsMCwwLC42OS0yLjM0bC40NC0yLjMzaDEuNzZsLjQ2LDIuMzNhMTAuNTYsMTAuNTYsMCwwLDAsLjcsMi4zNEEyLjU1LDIuNTUsMCwwLDAsMTQuNCw4LjgyYTEwLDEwLDAsMCwwLDIuMjMuNzVsMTguOSw5diAxLjY5bC0xLjQxLjMxYTguNzgsOC43OCwwLDAsMC0yLjIzLjczLDIuNjMsMi42MywwLDAsMC0xLjE2LDEuMjQsMTAuNjEsMTAuNjEsMCwwLDAsLS43LDIuMzZsLS40NiwyLjMyWm0uODEtMS44M2ExOS41MiwxOS41MiwwLDAsMSwuNjQtMi44LDQuNDQsNC40NCwwLDAsMSwuOS0xLjY1LDMsMywwLDAsMSwxLjQ1LS45NCwxNC42OCwxNC42OCwwLDAsMSwyLjI5LS42NHYuMTExOC43NywxOC43NywwLDAsMS0yLjI5LS42NSwzLjYsMy42LDAsMCwxLTEuNDUtMSw0LjQxLDQuNDEsMCwwLDEtLjktMS42NiwxOSwxOSwwLDAsMS0uNjQtMi43OWguMTVhMTguODYsMTguODYsMCwwLDEtLjY1LDIuNzlBNC41NSw0LjU1LDAsMCwxLDkuNzQsOS4yYTMuNTYsMy41NiwwLDAsMS0xLjQ0LDEsMTguMjYsMTguMjYsMCwwLDEsNiwxMC44di0uMTFhMTQuMzcsMTQuMzcsMCwwLDEsMi4yOS42NCwzLjc2LDMsNzYsMCwwLDEsMS40NC45NCw0LjU4LDQuNTgsMCwwLDEsLjg5LDEuNjUsMTkuMzUsMTkuMzUsMCwwLDEsLjY1LDIuOFpNMjcuNTcsNDEuMDdsLS43My01Yy0uMjksMi0uNi0zLjYzLS45My01YTEyLjQsMTIuNCwwLDAsMC0xLjIxLTMuMjcsNi4xMSw2LjExLDAsMCwwLTEuODUtMi4wNSwxMCwxMCwwLDAsMC0yLjgtMS4yOWMtMS4xMi0uMzUtMi40OS0uNjgtNC4xLTFsLTMtLjYzdi0xLjdsMy0uNjJjMS42MS0uMzMsMy0uNjcsNC4xLTFhMTAuMjYsMTAuMjYsMCwwLDAsMi44LTEuMyw2LjE3LDYuMTcsMCwwLDAsMS44NS0yLDEyLjE5LDEyLjE5LDAsMCwwLDEuMjEtMy4yNmMuMzMtMS4zNC42NC0zLC45My01bC43My01aDEuOGwuNzEsNWMuMjksMiwuNTksMy42My45MSw1YTEyLjc1LDEyLjc1LDAsMCwwLDEuMjIsMy4yNyw2LjI0LDYuMjQsMCwwLDAsMS44NiwyLjA1LDEwLDEwLDAsMCwwLDIuODEsMS4yOWMxLjEyLjMzLDIuNDgsNjcsNC4xLDFsMywuNjJ2MS43bC0zLC42M2MtMS42Mi4zMy0zLC42Ni00LjEsMWExMCwxMCwwLDAsMC0yLjgxLDEuMjksNi4yNCw2LjI0LDAsMCwwLTEuODYsMi4wNUExMi43NSwxMi43NSwwLDAsMCwzMSwzMS4wOWMtLjMyLDEuMzQtLjYyLDMtLjkxLDVsLS43MSw1Wm0uODMtMy41MnEuNDItMy4xMi44NS01LjM2YTIzLjUsMjMuNSwwLDAsMSwxLTMuNzgsOC41Miw4LjUyLDAsMCwxLDEuNDUtMi41Nyw3LjI5LDcuMjksMCwwLDEsMi4xMi0xLjdBMTYuMywxNi4zLDAsMCwxLDMuOSwyMy4xOWMxLjE5LS4zNCwyLjYtLjY4LDQuMjQtMXYuMTRjLTEuNjQtLjM1LTMtLjctNC4yNC0xYTE1LjY2LDE1LjY2LDAsMCwxLTMuMDYtMS4xOCw3LjI5LDcuMjksMCwwLDEtMi4xMi0xLjcsOC41Miw4LjUyLDAsMCwxLTEuNDUtMi41NywyMy41LDIzLjUsMCwwLDEsMS0zLjc4cS0uNDMtMi4yNC0uODUtNS4zNmguMTNxLS40MiwzLjEyLS44Niw1LjM2YTIyLjU4LDIyLjU4LDAsMCwxLTEsMy43OCw4LjczLDguNzMsMCwwLDEtMS40NSwyLjU3LDcuNDIsNy40MiwwLDAsMS0yLjEyLDEuNywxNS40NCwxNS40NCwwLDAsMS0zLDEuMThjLTEuMTkuMzMtMi42MS42OC00LjI1LDEsdi0uMTRjMS42NC4zNCwzLjA2LjY4LDQuMjUsMWExNC44MywxNC44MywwLDAsMSwzLDEuMTksNy4yMyw3LjIzLDAsMCwxLDIuMTIsMS42OSw4Ljg2LDguODYsMCwwLDEsMS40NSwyLjU3LDIyLjU4LDIyLjU4LDAsMCwxLDEsMy43OHEuNDMsMi4yNS44Niw1LjM4WiIgZmlsbD0iI2ZmZiIvPgo8L3N2Zz4K',
    risk2_neutral: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0NCA0NCI+CiAgPHBhdGggZD0iTTIyLDQ0YTIxLjY1LDIxLjY1LDAsMCwxLTguNTYtMS43QTIyLjE4LDIyLjE4LDAsMCwxLDEuNywzMC41NiwyMS42NSwyMS42NSwwLDAsMSwwLDIyYTIxLjY1LDIxLjY1LDAsMCwxLDEuNy04LjU2QTIyLjE4LDIyLjE4LDAsMCwxLDEzLjQ0LDEuNywyMS42NSwyMS42NSwwLDAsMSwyMiwwYTIxLjYzLDIxLjYzLDAsMCwxLDguNTQsMS43LDIyLjI0LDIyLjI0LDAsMCwxLDcsNC43MywyMi42MSwyMi42MSwwLDAsMSw0Ljc0LDdBMjEuNDksMjEuNDksMCwwLDEsNDQsMjJhMjEuNDksMjEuNDksMCwwLDEtMS43MSw4LjU2LDIyLjQ5LDIyLjQ5LDAsMCwxLTQuNzQsNywyMi4yNCwyMi4yNCwwLDAsMS03LDQuNzNBMjEuNjMsMjEuNjMsMCwwLDEsMjIsNDRabTAtMS42OWExOS44MiwxOS44MiwwLDAsMCw3Ljg5LTEuNThBMjAuNTMsMjAuNTMsMCwwLDAsNDAuNzMsMjkuODksMTkuODIsMTkuODIsMCwwLDAsNDIuMzEsMjJhMTkuODIsMTkuODIsMCwwLDAtMS41OC03Ljg5QTIwLjUzLDIwLjUzLDAsMCwwLDI5Ljg5LDMuMjcsMTkuODIsMTkuODIsMCwwLDAsMjIsMS42OWExOS44MiwxOS44MiwwLDAsMC03Ljg5LDEuNThBMjAuNTMsMjAuNTMsMCwwLDAsMy4yNywxNC4xMSwxOS44MiwxOS44MiwwLDAsMCwxLjY5LDIyYTE5LjgyLDE5LjgyLDAsMCwwLDEuNTgsNy44OUEyMC41MywyMC41MywwLDAsMCwxNC4xMSw0MC43MywxOS44MiwxOS44MiwwLDAsMCwyMiw0Mi4zMVpNMTQuNTUsMjIuNDJhMi4zNSwyLjM1LDAsMCwxLTEuODYtLjk0LDMuNTksMy41OSwwLDAsMSwwLTQuNDcsMi4zNCwyLjM0LDAsMCwxLDMuNzMsMCwzLjU5LDMuNTksMCwwLDEsMCw0LjQ3QTIuMzcsMi4zNywwLDAsMSwxNC41NSwyMi40MlptLTIuMzcsOC40NlYyOS4xOUgzMS44MnYxLjY5Wm0xNy4yNy04LjQ2YTIuMzcsMi4zNywwLDAsMS0xLjg3LS45NCwzLjU5LDMuNTksMCwwLDEsMC00LjQ3LDIuMzksMi4zOSwwLDAsMSwxLjg3LS45MywyLjM2LDIuMzYsMCwwLDEsMS44Ni45MywzLjU5LDMuNTksMCwwLDEsMCw0LjQ3QTIuMzQsMi4zNCwwLDAsMSwyOS40NSwyMi40MloiIGZpbGw9IiNmZmYiLz4KPC9zdmc+Cg==',
    risk3_thinking: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0NCA0NCI+CiAgPHBhdGggZD0iTTkuNDgsNDRhOCw4LDAsMCwxLTYtMi4xLDcuODIsNy44MiwwLDAsMS0yLTUuNzEsOS4yMSw5LjIxLDAsMCwxLC4xOC0xLjg1LDcuMjgsNy4yOCwwLDAsMCwuMTktMS41OCw0LjY3LDQuNjcsMCwwLDAtLjI5LTEuNjccLS4xOS0uNS0uNC0xLS42Mi0xLjQ0YTEzLjc4LDEzLjc4LDAsMCwxLS41Ny0xLjM0QTMuOTEsMy45MSwwLDAsMSwuMTIsMjdhMi40NiwyLjQ2LDAsMCwxLC43MS0xLjgyLDIuNTksMi41OSwwLDAsMSwxLjk0LS43LDQsNCwwLDAsMSwyLjMzLjc0LDUsNSwwLDAsMSwxLjYzLDJsLjE3LjM2YTcuNDcsNy40NywwLDAsMCwuNjcsMS4yMy44My44MywwLDAsMCwuNjkuMzQsMi40NCwyLjQ0LDAsMCwwLC44My0uMTksOC44Niw4Ljg2LDAsMCwwLDEuMTYtLjU4LDIyLjk0LDIyLjk0LDAsMCwxLDIuMjMtMS4wNiwxNy42MiwxNy42MiwwLDAsMSwzLjExLTEsMTcuODMsMTcuODMsMCwwLDEsMy44Ny0uNCw1LjI0LDUuMjQsMCwwLDEsMi42Ny41NywxLjg2LDEuODYsMCwwLDEsMSwxLjcxLDIuMDYsMi4wNiwwLDAsMS0uMzUsMS4yLDMuMjYsMy4yNiwwLDAsMS0xLjMyLDEsMjIuMjgsMjIuMjgsMCwwLDEtMi44MywxbC0uNDkuMTRhMTUuODEsMTUuODEsMCwwLDAtMi41NCwxLDE0LjQ0LDE0LjQ0LDAsMCwwLTIuNzksMS45M2wtLjg1LTFBMTUuNTMsMTUuNTMsMCwwLDEsMTUsMzEuMTlhMTMuNTgsMTMuNTgsMCwwLDEsMi43LTEuMDVsLjQtLjFhMTksMTksMCwwLDAsMi43LS44NnEuODEtLjM2LjgxLS44NGEuNzcuNzcsMCwwLDAtLjU1LS43Myw0LjI2LDQuMjYsMCwwLDAtMS42NC0uMjQsMTUuNiwxNS42LDAsMCwwLTQuODUuNzEsMjQuODYsMjQuODYsMCwwLDAtMy42OCwxLjUyLDEzLjg3LDEzLjg3LDAsMCwxLTEuNjQuNzUsMy43MywzLjczLDAsMCwxLTEuMTkuMjIsMS44NCwxLjg0LDAsMCwxLTEuMy0uNSw2LjU5LDYuNTksMCwwLDEtMS4yLTEuOTNsLS4xNy0uMzZBMy41MiwzLjUyLDAsMCwwLDQuMzcsMjYuNGEyLjM2LDIuMzYsMCwwLDAtMS40NC0uNTIsMS40NiwxLjQ2LDAsMCwwLTEsLjMzLDEuMjIsMS4yMiwwLDAsMC0uMzksMSwyLjYzLDIuNjMsMCwwLDAsLjIsMSwxMC42MywxMC42MywwLDAsMCwuNDYsMS4wNmMuMjUuNTEuNDksMS4wNi43MSwxLjY1YTUuMjEsNS4yMSwwLDAsMSwuMzQsMS45QTcuODIsNy44MiwwLDAsMSwzLjEsMzQuNWE3LjE2LDcuMTYsMCwwLDAtLjE5LDEuNzMsNi4yOCw2LjI4LDAsMCwwLDEuNyw0LjYsNi41Miw2LjUyLDAsMCwwLDQuODcsMS43MiwxMy44NCwxMy44NCwwLDAsMCwzLS4zM0ExMC42NywxMC42NywwLDAsMCwxNSw0MS4zNmMugetKeyscHV0cy0uMzYsMS0uNzUsMS0xLjE2YTIuNTIsMi41MiwwLDAsMCwwLS40MywxLjQzLDEuNDMsMCwwLDAtLjIxLS40NGwuOTMtMS4wOWEyLjY4LDIuNjgsMCwwLDEsLjc2LDIsMi4xNCwyLjE0LDAsMCwxLS42OCwxLmlhNS43NSw1Ljc1LDAsMCwxLDE0LjkxLDQzYTEyLjM5LDEyLjM5LDAsMCwxLTIuNTYuNzdBMTUuMSwxNS4xLDAsMCwxLDkuNDgsNDRabTEyLjkxLTFhMjEsMjEsMCwwLDEtNi43MS0xLjA4bC45My0xLjQyQTIwLDIwLDAsMCwwLDEyLjAzLDMuNSwxOS41MSwxOS41MSwwLDAsMCwxOS43NCwzLjA0YTIwLjEsMjAuMSwwLDAsMCw2LjMyLTQuMjcsMTkuNzksMTkuNzksMCwwLDAsNC4yNi02LjMyLDE5LjM0LDEuMzQsMCwwLDAsMS41NC03LjcxLDE5LjI5LDE5LjI5LDAsMCwwLTEuNTQtNy43LDE5Ljc5LDE5Ljc5LDAsMCwwLTQuMjYtNi4zMkEyMC4xLDIwLjEsMCwwLDAsMzAuMSwzLjE5YTE5LjUxLDE5LjUxLDAsMCwwLTcuNzEtMS41NCwxOS40MywxOS40MywwLDAsMC03LjcsMS41NEEyMC4wNywyMC4wNywwLDAsMCw0LjEsMTMuNzhhMTkuMjksMTkuMjksMCwwLDAtMS41NCw3LjdBMjAuNzgsMjAuNzgsMCwwLDAsMywyNS41N0wxLjM4LDI2Yy0uMTUtLjczLS4yNy0xLjQ3LS4zNS0yLjIyYTIxLjUzLDIxLjUzLDAsMCwxLS4xMi0yLjI5LDIxLDIxLDAsMCwxLDEuNjYtOC4zNUEyMS42NSwyMS42NSwwLDAsMSwxNCwxLjY2LDIxLDIxLDAsMCwxLDIyLjM5LDBhMjEsMjEsMCwwLDEsOC4zNCwxLjY2QTIxLjY1LDIxLjY1LDAsMCwxLDQyLDEzLjEzYTIwLjgzLDIwLjgzLDAsMCwxLDEuNjgsOC4zNSwyMC44OCwyMC44OCwwLDAsMS0xLjY4LDguMzYsMjEuNzMsMjEuNzMsMCwwLDEtNC42Miw2Ljg1LDIxLjQ4LDIxLjQ4LDAsMCwxLTYuODUsNC42MUEyMSwyMSwwLDAsMSwyMi4zOSw0MlpNMTUuODIsMTIuODFhMi4zMywyLjMzLDAsMCwxLDE0LDExLjlhMy4zLDMuMywwLDAsMS0uNzYtMi4xOUEzLjMzLDMuMzMsMCwwLDEsMTQsNy41MWEyLjMsMi4zLDAsMCwxLDMuNjgsMCwzLjMzLDMuMzMsMCwwLDEsLjc3LDIuMiwzLjM0LDMuMzQsMCwwLDEtLjc2LDIuMThBMi4zMSwyLjMxLDAsMCwxLDE1LjgyLDEyLjgxWk0yMC45LDUuMjNhMTAuNDEsMTAuNDEsMCwwLDAtMy40Ni0yLjQyLDEwLjksMTwuOSwwLDAsMC00LjEtLjdWLjQ1YTEyLjU5LDEyLjU5LDAsMCwxLDQuNzYuODQsMTIsMTIsMCwwLDEsNCwyLjc4Wk0xMy42MSwzNy40OWwtLjItMS4yNGEzLjgsMy44LDAsMCwwLDEuNzgtLjY1LDEuMywxLjMsMCwwLDAsLjU5LTEsMS4yNywxLjI3LDAsMCwwLS4zOC0uOTMsMi4xNywyLjE3LDAsMCwwLTEuMTEtLjUyLgzMS0xLjI0YTIuOSwyLjksMCwwLDEsMS43OS44OSwyLjUxLDIuNTEsMCwwLDEsLjczLDEuOCwyLjQyLDIuNDIsMCwwLDEtLjksMS45MUE1LDUsMCwwLDEsMTMuNjEsMzcuNDlaTTI3LjQzLDI0LjMxQTEwLjQ2LDEwLjQ2LDAsMCwwLDIwLDIxYTEzLjU0LDEzLjU0LDAsMCwwLTUuNjgsMS4zOGwtLjctMS40OEExNS4xNCwxNS4xNCwwLDAsMSwyMCwxOS4zNmExMi4wOCwxMi4wOCwwLDAsMSw4LjYyLDMuNzZaTTE0LjA3LDQwLjIsMTMuODgsMzljMS40Ny0uMjksMi4yMS0uODQsMi4yMS0xLjY1YTEuNDMsMS40MywwLDAsMC0uMzktMWwuNy0xLjE3YTIuNDQsMi40NCwwLDAsMSwuNzUuOTUsMywzLDAsMCwxLC4yOCwxLjI2LDIuMzgsMi4zOCwwLDAsMS0uODQsMS44N0E1LjE2LDUuMTYsMCwwLDEsMTQuMDcsNDBaTTMzLjM0LDguOTJhMTAuODUsMTAuODUsMCwwLDAtNS40NS0xLjUsMTIuMTMsMTIuMTMsMCwwLDAtMS4zOC4wNyw5Ljg3LDkuODcsMCwwLDAtMS4yNS4yMmwtLjM3LTEuNjJhMTIuODMsMTIuODMsMCwwLDEsMS40OS0uMjQsMTIuNjIsMTIuNjIsMCwwLDEsMS41MS0uMDlBMTIuMjgsMTIuMjgsMCwwLDEsMzQuMTcsNy41Wm0tNC41LDcuNEEyLjMxLDIuMzEsMCwwLDEsMjcsMTUuNDE0LDMuMjksMy4yOSwwLDAsMS0uNzctMi4xOUEzLjMzLDMuMzMsMCwwLDEsMjcsMTFhMi4zLDIuMywwLDAsMSwzLjY4LDAsMy4zMywzLjMzLDAsMCwxLC43NiwyLjIsMy4zNCwzLjzNCwwLDAsMS0uNzUsMi4xOUEyLjMzLDIuMzMsMCwwLDEsMjguODQsMTYuMzJaIgogZmlsbD0iI2ZmZiIvPgo8L3N2Zz4K',
    risk4_warning: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0NCA0NCI+CiAgPHBhdGggZD0iTTMuNzksNDRBMy40OSwzLjQ5LDAsMCwxLC4yMSw0MC40MmE0LjkyLDQuOTIsMCwwLDEsLjUzLTIuMTNMMTguNDksMi40M2EzLjc1LDMuNzUsMCwwLDEsNywwTDQzLjI2LDM4LjI5YTQuOTIsNC45MiwwLDAsMSwuNTMsMi4xMywzLjQ4LDMuNDgsMCwwLDEtMSwyLjU2LDMuNDQsMy40NCwwLDAsMS0yLjU3LDFbam0tMS42OUg0MC4yMWExLjksMS45LDAsMCwwLDEuMzgtLjUsMS43OSwxLjc5LDAsMCwwLC41MS0xLjM0LDMsMywwLDAsMC0uMzYtMS40MkwyNCwzLjE3YTIuMjEsMi4yMSwwLDAsMC0yLTEuNDgsMi4yNCwyLjI0LDAsMCwwLTIsMS41TDIuMjYsMzlhMy4yLDMuMiwwLDAsMC0uMzYsMS40NCwxLjgsMS44LDAsMCwwLC41MiwxLjMzQTEuODcsMS44NywwLDAsMCwzLjc5LDQyLjMxWk0yMiwzMmExLDEsMCwwLDEtLjcyLS4yNywxLDEsMCwwLDEtLjM0LS42NkwxOS42MywxNC45MWEyLjksMi45LDAsMCwxLC41Ny0yLjE0LDIuMzUsMi4zNSwwLDAsMSwzLjYxLDAsMi45NCwyLjk0LDAsMCwxLC41NiwyLjEzTDIzLjA2LDMxLjFhLjk0Ljk0LDAsMCwxLS4zMy42NkExLjA2LDEuMDYsMCwwLDEsMjIsMzJabTAsNS43N2ExLjc3LDEuNzcsMCwwLDEtMS4zLS41NCwxLjg0LDEuODQsMCwxLDEsMi42LDBBMS43NywxLjc3LDAsMCwxLDIyLDM3LjhaIiBmaWxsPSIjZmZmIi8+Cjwvc3ZnPgo=',
    risk5_poop: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0NCA0NCI+CiAgPHBhdGggZD0iTTIyLDQ0YTMzLjA5LDMzLjA5LDAsMCwxLTguNjQtMS4wNiwyMywyMywwLDAsMS02Ljg0LTNBMTQuNDksMTQuNDksMCwwLDEsMiwzNS40нгаWExMC44LDEwLjgsMCwwLDEtMS42LTUuNzIsNy42Myw3LjYzLDAsMCwxLDEuNzQtNS4xM0ExMC43MywxMC43MywwLDAsMSw3LDIxLjQ5YTEyLjMsMTIuMywwLDAsMS0uMTUtMS44OCw4LjM3LDguMzcsMCwwLDEsMS41MS0uMDksOC4wNyw4LjA3LDAsMCwxLDQuMzUtMi44OXYtLjQxMy4xMSwxMy4xMSwwLDAsMSwuODQtNSw4LjEyLDguMTIsMCwwLDEsMi44Ni0zLjQ5QTIyLjcxLDIyLjcxLDAsMCwxLDIyLDBhMTYuNjksMTYuNjksMCwwLDAsLjMzLDMuNzMsMy42NCwzLjY0LDAsMCwwLDEuMTgsMi4wOCw1LjU5LDUuNTksMCwwLDAsMi40MiwxTDI3LDdBMTEuMjMsMTEuMjMsMCwwLDEsMzIuNCw5LjI0LDUuMjgsNS4yOCwwLDAsMSwzNC42LDE0LjA5YTYsNiwwLDAsMS0uMSwxLjA1LDEwLjE3LDEwLjE3LDAsMCwxLS4yNCwxLjE1LDcsNywwLDAsMSwzLjIsMi4zOCw3LjEsNy4xLDAsMCwxLDEuMjYsMy45NCwxMCwxMCwwLDAsMSw0LDMuMjgsNy44OCw3Ljg4LDAsMCwxLDEuNDMsNC41OUExMC44LDEwLjgsMCwwLDEsNDIsMzUuNDQsMTQuNjMsMTQuNjMsMCwwLDEsMzcuNDcsNDBhMjMsMjMsMCwwLDEtNi44NSwzQTMzLDMzLDAsMCwxLDIyLDQ0Wk0xNiwyOC43NWE0LjUsNC41LDAsMCwwLDIuMzgtLjY1LDQuOTQsNC45NCwwLDAsMCwxLjcxLTEuNzIsNC42Niw0LjY2LDAsMCwwLDAtNC43NSw1LDUsMCwwLDAsLTEuNzEtMS43MSw0LjY2LDQuNjYsMCwwLDAtNC43NSwwLDQuOTQsNC45NCwwLDAsMC0xLjcyLDEuNzEsNC42Niw0LjY2LDAsMCwwLDAsNC43NUE0Ljg5LDQuODksMCwwLDAsMTMuNiwyOC4xLDQuNTQsNC41NCwwLDAsMCwxNiwyOC43NVptMC0yLjU0YTIuMiwyLjIsMCwwLDEsMC00LjQsMi4xNiwyLjE2LDAsMCwxLDEuNTYuNjQsMi4yMSwyLjIxLDAsMCwxLDAsMy4xMkExLjE5LDIuMTksMCwwLDEsMTYsMjYuMjFabTYsMTIuMzVBOC44NSw4Ljg1LDAsMCwwLDI1LDM4LjA1YTkuODcsOS44NywwLDAsMCwyLjYxLTEuMzksNy4yLDcuMjMsMCwwLDAsMS44NS0xLjk0LDMuOSwzLjksMCwwLDAsLjY5LTIuMTQsMS40NywxLjQ3LDAsMCwwLS4yNi0uOTElLjg5Ljg5LDAsMCwwLS44OC0uMjZjLTEuNDUuMTktMi42OS4zMi0zLjcyLjQxcy0yLjExLjEyLTMuMjQuMTItMi4xOSwwLTMuMjMtLjEyLTIuMjgtLjIyLTMuNzMtLjQxYS44OS44OSwwLDAsMC0uODguMjYsMS40NywxLjQ3LDAsMCwwLS4yNi45MSwzLjksMy45LDAsMCwwLC42OSwyLjE0LDcuMiw3LjIsMCwwLDAsMS44NSwxLjk0LDkuODcsOS44NywwLDAsMCwyLjYxLDEuMzlBOC44NSw4Ljg1LDAsMCwwLDIyLDM4LjU2Wm02LTkuODFhNC41Myw0LjUzLDAsMCwwLDIuMzgtLjY1LDQuOTQsNC45NCwwLDAsMCwxLjcxLTEuNzIsNC42Niw0LjY2LDAsMCwwLDAtNC43NSw1LDUsMCwwLDAsLTEuNzEtMS43MSw0LjY2LDQuNjYsMCwwLDAtNC43NSwwLDQuOTQsNC45NCwwLDAsMC0xLjcyLDEuNzEsNC42Niw0LjY2LDAsMCwwLDAsNC43NSw0Ljg5LDQuODksMCwwLDAsMS43MiwxLjcyQTQuNTQsNC41NCwwLDAsMCwyOCwyOC43NVptMC0yLjU0YTIuMTksMi4xOSwwLDAsMS0xLjU1LS42NCwyLjIsMi4yLDAsMSwxLDEuNTUuNjRaIiBmaWxsPSIjZmZmIi8+Cjwvc3ZnPg=='
  };

  let riskIcon = riskIconMap.risk5_poop;
  if      (riskScore <= 15) riskIcon = riskIconMap.risk0_house;
  else if (riskScore <= 25) riskIcon = riskIconMap.risk1_sparkles;
  else if (riskScore <= 40) riskIcon = riskIconMap.risk2_neutral;
  else if (riskScore <= 50) riskIcon = riskIconMap.risk3_thinking;
  else if (riskScore <= 70) riskIcon = riskIconMap.risk4_warning;

  const networkText =
    data.isResidential === true
      ? '住宅原生'
      : '机房网络';

  const networkColor =
    data.isResidential === true
      ? C.green
      : C.yellow;


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

  function badge(text, color) {

    return {
      type: 'stack',
      direction: 'row',
      gap: 5,
      children: [

        {
          type: 'image',
          src: 'sf-symbol:circle.fill',
          width: 7,
          height: 7,
          color: color
        },

        {
          type: 'text',
          text: text,
          font: {
            size: 'caption2',
            weight: 'bold'
          },
          textColor: color
        }

      ]
    };

  }

  // ============================================
  // LOCK SCREEN: CIRCULAR
  // ============================================

  if (widgetFamily === 'accessoryCircular') {

    return {
      type: 'image',
      src: riskIcon,
      width: 40,
      height: 40
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

        {
          type: 'text',
          text: (data.countryCode || data.country || '--') + (data.city ? ' · ' + data.city : ''),
          font: {
            size: 14,
            weight: 'semibold'
          },
          textColor: C.text,
          maxLine: 1
        },

        {
          type: 'text',
          text: data.asOrganization || 'Unknown',
          font: {
            size: 11,
            weight: 'medium'
          },
          textColor: C.secondary,
          maxLine: 1
        },

        {
          type: 'text',
          text: networkText,
          font: {
            size: 11,
            weight: 'medium'
          },
          textColor: networkColor,
          maxLine: 1
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
  // SMALL (中号尺寸)
  // ============================================

    if (widgetFamily === 'systemMedium') {

    return {

      type: 'widget',
      backgroundGradient: premiumGradient,
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
                  text: 'IPPure',
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
          text: maskIp(data.ip) || 'N/A',
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
                  text: String(riskScore),
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
      backgroundGradient: premiumGradient,
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
                  text: 'IPPure',
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
          data.isBroadcast === true ? '是' : '否'
        ),

        row(
          '风险值',
          String(riskScore),
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
              src: 'sf-symbol:checkmark.circle.fill',
              width: 12,
              height: 12,
              color: C.green
            },

            {
              type: 'text',
              text: 'Connection Active',
              font: { size: 'caption2' },
              textColor: C.secondary
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
    backgroundGradient: premiumGradient,
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
                text: 'IPPure',
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
        text: maskIp(data.ip) || 'N/A',
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
        data.isBroadcast === true ? '是' : '否'
      ),

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
            text: String(riskScore),
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
            src: 'sf-symbol:checkmark.circle.fill',
            width: 12,
            height: 12,
            color: C.green
          },

          {
            type: 'text',
            text: 'Connection Active',
            font: { size: 'caption2' },
            textColor: C.secondary
          }

        ]
      }

    ]

  };

}
