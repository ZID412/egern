# Egern DNS 泄露检测小组件
# 使用说明：将此文件内容配置到 Egern 中即可使用

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
      const response = await fetch(`https://${serverIp}/resolve?name=google.com`, {
        headers: { 
          'Accept': 'application/dns-json',
          'User-Agent': 'Egern-DnsDetector/1.0'
        }
      });
      
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const data = await response.json();
      return data.data?.answers?.[0]?.data || `dns-error-${serverIp}`;
    } catch (error) {
      throw error;
    }
  }

  render() {
    let html = `
<div class="dns-leak-detection">
  <div class="header">
    <div class="icon">🔍</div>
    <div class="title">DNS 泄露检测</div>
    <div class="time">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <polyline points="12,6 12,12 16,14"/>
      </svg>
      <span id="elapsed-time"></span>
    </div>
  </div>

  <div class="status" id="detection-status">
    <div class="action">🔍 检测中...</div>
    <div class="progress">
      <div class="progress-bar"></div>
      <span class="progress-text">50%</span>
    </div>
  </div>

  <div class="dns-results">
    ${this.dnsServers.map(server => `
      <div class="row" id="result-${server.name.replace(/\s+/g, '-')}">
        <div class="column">
          <div class="label">${server.symbol} ${server.name}</div>
        </div>
        <div class="value">
          <div class="dns-ip" id="ip-${server.name.replace(/\s+/g, '-')}"></div>
          <div class="status-indicator" id="status-${server.name.replace(/\s+/g, '-')}"></div>
        </div>
      </div>
    `).join('')}
  </div>

  <div class="summary">
    <div class="summary-title">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M22.5 2.8l-9.8 16.7-6.7-7.6-6 7.6L2.8 6.6 22.5 2.8zM15 2.8a1 1 0 0 1 1.7 0l7 17a1 1 0 0 1-.5 1.3 1 1 0 0 1-1.4-.4l-6.1-12.2-3.2 6.4-3.2-6.4-6.2 12.3a1 0 1 1-1.6.4l-1.6-2.5a1 1 0 0 1-.2-1.3l8.2-17.7z"/>
      </svg>
      检测结论
    </div>
    <div class="summary-content" id="summary-text">
      正在检测 DNS 泄露情况...
    </div>
  </div>

  <div class="footer">
    <div class="bottom-info">
      <span>Egern DNS Detector v1.0</span>
      <span id="total-time"></span>
    </div>
  </div>
</div>
<style>
  .dns-leak-detection {
    position: relative;
    width: 300px;
    background: linear-gradient(150deg, #1e1e2e 0%, #2d2d44 100%);
    border-radius: 16px;
    padding: 20px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: #f0f0f0;
    user-select: none;
  }
  
  .dns-leak-detection::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: radial-gradient(circle at 20% 20%, rgba(136, 94, 255, 0.15), transparent 30%),
                radial-gradient(circle at 80% 80%, rgba(244, 108, 108, 0.1), transparent 30%);
    border-radius: 16px;
    pointer-events: none;
  }
  
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
    position: relative;
    z-index: 1;
  }
  
  .icon {
    font-size: 24px;
  }
  
  .title {
    font-size: 18px;
    font-weight: 600;
    color: #f0f0f0;
  }
  
  .time {
    font-size: 12px;
    color: #999;
    display: flex;
    align-items: center;
    gap: 4px;
  }
  
  .status {
    margin-bottom: 20px;
    position: relative;
    z-index: 1;
  }
  
  .action {
    font-size: 14px;
    color: #999;
    text-align: center;
    margin-bottom: 8px;
  }
  
  .progress {
    height: 6px;
    background: #3a3a5a;
    border-radius: 3px;
    overflow: hidden;
  }
  
  .progress-bar {
    height: 100%;
    background: linear-gradient(90deg, #6a11cb 0%, #2575fc 100%);
    width: 50%;
    border-radius: 3px;
    animation: pulse 1.5s ease-in-out infinite;
  }
  
  @keyframes pulse {
    0%, 100% { transform: scaleX(1); }
    50% { transform: scaleX(1.3); }
  }
  
  .progress-text {
    display: block;
    text-align: center;
    font-size: 14px;
    color: #999;
    margin-top: 6px;
  }
  
  .dns-results {
    margin-bottom: 20px;
    position: relative;
    z-index: 1;
  }
  
  .row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 0;
    border-bottom: 1px solid #3a3a5a;
  }
  
  .row:last-child {
    border-bottom: none;
  }
  
  .column {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  
  .label {
    font-size: 14px;
    color: #ccc;
  }
  
  .value {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  
  .dns-ip {
    font-size: 13px;
    color: #fff;
    font-family: 'Monaco', monospace;
  }
  
  .status-indicator {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #555;
  }
  
  .summary {
    background: rgba(0, 0, 0, 0.2);
    border-radius: 12px;
    padding: 15px;
    margin-bottom: 15px;
    position: relative;
    z-index: 1;
  }
  
  .summary-title {
    font-size: 14px;
    font-weight: 600;
    color: #666;
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  
  .summary-content {
    font-size: 14px;
    line-height: 1.4;
  }
  
  .summary-content .safe {
    color: #4ade80;
  }
  
  .summary-content .warning {
    color: #fbbf24;
  }
  
  .summary-content .danger {
    color: #f87171;
  }
  
  .footer {
    position: relative;
    z-index: 1;
  }
  
  .bottom-info {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    color: #555;
  }
  
  .loading .progress-bar {
    width: 20%;
    animation: loading 1s ease-in-out infinite;
  }
  
  @keyframes loading {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
  }
</style>`;
    
    const elapsed = Date.now() - this.startTime;
    const progress = Math.min(elapsed / 800, 1) * 100;
    
    if (this.isDetecting) {
      html = html.replace('50%', `${Math.round(progress)}%`);
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
    if (progressBar) {
      progressBar.style.width = `${progress}%`;
    }
    if (progressText) {
      progressText.textContent = `${Math.round(progress)}%`;
    }
    requestAnimationFrame(() => this.updateProgressBar(progress));
  }

  updateResults() {
    this.dnsServers.forEach(server => {
      const result = this.currentIps[server.name];
      const ipElement = document.querySelector(`#ip-${server.name.replace(/\s+/g, '-')}`);
      const statusElement = document.querySelector(`#status-${server.name.replace(/\s+/g, '-')}`);
      
      if (ipElement && statusElement) {
        if (result && result.success) {
          ipElement.textContent = result.ip;
          ipElement.className = 'dns-ip safe';
          statusElement.style.background = '#4ade80';
        } else {
          ipElement.textContent = 'failed';
          ipElement.className = 'dns-ip danger';
          statusElement.style.background = '#f87171';
        }
      }
    });

    const uniqueIps = new Set(Object.values(this.currentIps).map(r => r.ip));
    const summaryElement = document.getElementById('summary-text');
    
    if (uniqueIps.size === 1 && !uniqueIps.has('error') && !uniqueIps.has('failed')) {
      summaryElement.innerHTML = '<span class="safe">✅ DNS 解析正常，未发现泄露</span> 所有公共 DNS 服务器返回相同 IP 地址';
    } else {
      summaryElement.innerHTML = '<span class="warning">⚠️ 检测到 DNS 解析差异</span> 不同 DNS 服务器返回不同的 IP 地址';
    }

    const totalTime = Date.now() - this.startTime;
    document.getElementById('total-time').textContent = `耗时: ${Math.min(totalTime, 5000)}ms`;
  }
}

window.onload = () => {
  const detector = new DnsLeakDetector();
  detector.detect();
};
