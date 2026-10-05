class DnsLeakDetector {
  constructor() {
    this.dnsServers = [
      { name: 'Cloudflare', ip: '1.1.1.1', symbol: '☁️' },
      { name: 'Google DNS', ip: '8.8.8.8', symbol: '🔵' },
      { name: 'OpenDNS', ip: '208.67.222.222', symbol: '🔴' },
      { name: 'Quad9', ip: '9.9.9.9', symbol: '⚫' }
    ];
    this.currentIps = {};
    this.isDetecting = false;
    this.startTime = null;
    this.init();
  }

  async init() {
    this.startDetecting();
  }

  async startDetecting() {
    this.isDetecting = true;
    this.startTime = Date.now();
  }

  async detect() {
    this.isDetecting = true;
    this.startTime = Date.now();
    this.currentIps = {};

    const detectionPromises = this.dnsServers.map(async (server) => {
      try {
        const ip = await this.resolveDns(server.ip);
        const response = {
          server: server.name,
          ip: ip,
          success: true,
          time: Date.now() - this.startTime
        };
        this.currentIps[server.name] = response;
        return response;
      } catch (error) {
        const response = {
          server: server.name,
          ip: 'error',
          success: false,
          error: error.message,
          time: Date.now() - this.startTime
        };
        this.currentIps[server.name] = response;
        return response;
      }
    });

    await Promise.all(detectionPromises);
    this.isDetecting = false;
    this.render();
  }

  async resolveDns(serverIp) {
    try {
      const response = await fetch('https://' + serverIp + '/resolve?name=google.com', {
        headers: { 
          'Accept': 'application/dns-json',
          'User-Agent': 'EgernDnsDetector10'
        }
      });
      
      if (!response.ok) throw new Error('HTTP ' + response.status);
      
      const data = await response.json();
      return data.data?.answers?.[0]?.data || 'dns-error-' + serverIp;
    } catch (error) {
      throw error;
    }
  }

  render() {
    let html = '<div class="dns-leak-detection">';
    html += '<div class="header"><div class="icon">🔍</div><div class="title">DNS 泄露检测</div><div class="time"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg><span id="elapsed-time"></span></div></div>';
    html += '<div class="status" id="detection-status"><div class="action">🔍 检测中...</div><div class="progress"><div class="progress-bar"></div><span class="progress-text">50%</span></div></div>';
    html += '<div class="dns-results">';
    html += this.dnsServers.map(server => {
      let row = '<div class="row" id="' + server.name.replace(/\s+/g, '-') + '">';
      row += '<div class="column"><div class="label">' + server.symbol + ' ' + server.name + '</div></div>';
      row += '<div class="value"><div class="dns-ip" id="ip-' + server.name.replace(/\s+/g, '-') + '"></div>';
      row += '<div class="status-indicator" id="status-' + server.name.replace(/\s+/g, '-') + '"></div></div></div>';
      return row;
    }).join('');
    html += '</div>';
    html += '<div class="summary">';
    html += '<div class="summary-title">📋 检测结论</div>';
    html += '<div class="summary-content" id="summary-text">正在检测 DNS 泄露情况...</div>';
    html += '</div>';
    html += '<div class="footer"><div class="bottom-info"><span>Egern DNS Detector v1.0</span><span id="total-time"></span></div></div>';
    html += '</div>';
    
    html += '<style>';
    html += '.dns-leak-detection{position:relative;width:300px;background:linear-gradient(150deg,#1e1e2e,#2d2d44);border-radius:16px;padding:20px;box-shadow:0 8px 32px rgba(0,0,0,0.3);font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#f0f0f0;user-select:none}';
    html += '.header{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px}';
    html += '.icon{font-size:24px}';
    html += '.title{font-size:18px;font-weight:600}';
    html += '.time{font-size:12px;color:#999;display:flex;align-items:center;gap:4px}';
    html += '.status{margin-bottom:20px}';
    html += '.action{font-size:14px;color:#999;text-align:center;margin-bottom:8px}';
    html += '.progress{height:6px;background:#3a3a5a;border-radius:3px;overflow:hidden}';
    html += '.progress-bar{height:100%;background:linear-gradient(90deg,#6a11cb,#2575fc);width:50%;border-radius:3px;animation:pulse 1.5s ease-in-out infinite}';
    html += '@keyframes pulse{0%,100%{transform:scaleX(1)};50%{transform:scaleX(1.3)}}';
    html += '.progress-text{display:block;text-align:center;font-size:14px;color:#999;margin-top:6px}';
    html += '.dns-results{margin-bottom:20px}';
    html += '.row{display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid #3a3a5a}';
    html += '.row:last-child{border-bottom:none}';
    html += '.label{font-size:14px;color:#ccc}';
    html += '.value{display:flex;align-items:center;gap:8px}';
    html += '.dns-ip{font-size:13px;color:#fff;font-family:monospace}';
    html += '.status-indicator{width:8px;height:8px;border-radius:50%;background:#555}';
    html += '.summary{background:rgba(0,0,0,0.2);border-radius:12px;padding:15px;margin-bottom:15px}';
    html += '.summary-title{font-size:14px;font-weight:600;color:#666;margin-bottom:8px}';
    html += '.summary-content{font-size:14px;line-height:1.4}';
    html += '.summary-content .safe{color:#4ade80}';
    html += '.summary-content .warning{color:#fbbf24}';
    html += '.summary-content .danger{color:#f87171}';
    html += '.footer{display:flex;justify-content:space-between;font-size:11px;color:#555}';
    html += '</style>';
    
    const elapsed = Date.now() - this.startTime;
    const progress = Math.min(elapsed / 800, 1) * 100;

    if (this.isDetecting) {
      html = html.replace('50%', Math.round(progress) + '%');
    }

    document.open();
    document.write(html);
    document.close();

    if (this.isDetecting) {
      setTimeout(() => this.updateProgressBar(progress), 16);
    } else {
      this.updateResults();
    }
  }

  updateProgressBar(progress) {
    const progressBar = document.querySelector('.progress-bar');
    const progressText = document.querySelector('.progress-text');
    if (progressBar) progressBar.style.width = progress + '%';
    if (progressText) progressText.textContent = Math.round(progress) + '%';
    requestAnimationFrame(() => this.updateProgressBar(progress));
  }

  updateResults() {
    this.dnsServers.forEach(server => {
      const result = this.currentIps[server.name];
      const ipEl = document.querySelector('#ip-' + server.name.replace(/\s+/g, '-'));
      const statusEl = document.querySelector('#status-' + server.name.replace(/\s+/g, '-'));

      if (ipEl && statusEl) {
        if (result && result.success) {
          ipEl.textContent = result.ip;
          ipEl.className = 'dns-ip safe';
          statusEl.style.background = '#4ade80';
        } else {
          ipEl.textContent = 'failed';
          ipEl.className = 'dns-ip danger';
          statusEl.style.background = '#f87171';
        }
      }
    });

    const uniqueIps = new Set(Object.values(this.currentIps).map(r => r.ip));
    const summaryEl = document.getElementById('summary-text');

    if (uniqueIps.size === 1 && !uniqueIps.has('error') && !uniqueIps.has('failed')) {
      summaryEl.innerHTML = '<span class="safe">✅ DNS 解析正常，未发现泄露</span> 所有公共 DNS 服务器返回相同 IP 地址';
    } else {
      summaryEl.innerHTML = '<span class="warning">⚠️ 检测到 DNS 解析差异</span> 不同 DNS 服务器返回不同的 IP 地址';
    }

    const totalTime = Date.now() - this.startTime;
    document.getElementById('total-time').textContent = '耗时: ' + Math.min(totalTime, 5000) + 'ms';
  }
}

window.onload = () => {
  const detector = new DnsLeakDetector();
  detector.detect();
};
