/**
 * Health Monitoring and Alerting Examples
 * 
 * This file demonstrates how to use the health monitoring and alerting system
 */

// Example 1: Check System Health Status
async function checkSystemHealth() {
  const response = await fetch('http://localhost:3001/api/health/status');
  const status = await response.json();
  
  console.log('System Health Status:');
  console.log(`Overall Status: ${status.overallStatus}`);
  console.log('\nService Details:');
  
  Object.entries(status.dependencies).forEach(([service, details]: [string, any]) => {
    console.log(`\n${service}:`);
    console.log(`  Status: ${details.status}`);
    console.log(`  Latency: ${details.latency}ms`);
    console.log(`  Error Rate: ${details.errorRate.toFixed(2)}%`);
    console.log(`  Last Checked: ${details.lastChecked}`);
  });
}

// Example 2: Get Detailed Metrics
async function getDetailedMetrics() {
  const response = await fetch('http://localhost:3001/api/health/metrics');
  const { metrics } = await response.json();
  
  console.log('Detailed Health Metrics:');
  metrics.forEach((metric: any) => {
    console.log(`\n${metric.service}:`);
    console.log(`  Status: ${metric.status}`);
    console.log(`  Latency: ${metric.latency}ms`);
    console.log(`  Error Rate: ${metric.errorRate.toFixed(2)}%`);
    console.log(`  Consecutive Failures: ${metric.consecutiveFailures}`);
    console.log(`  Last Checked: ${metric.lastChecked}`);
  });
}

// Example 3: Get Metrics for Specific Service
async function getServiceMetrics(service: string) {
  const response = await fetch(`http://localhost:3001/api/health/metrics/${service}`);
  
  if (!response.ok) {
    console.error(`Service ${service} not found`);
    return;
  }
  
  const { metrics } = await response.json();
  const metric = metrics[0];
  
  console.log(`Metrics for ${service}:`);
  console.log(`  Status: ${metric.status}`);
  console.log(`  Latency: ${metric.latency}ms`);
  console.log(`  Error Rate: ${metric.errorRate.toFixed(2)}%`);
  console.log(`  Consecutive Failures: ${metric.consecutiveFailures}`);
}

// Example 4: Get Current Alert Configuration
async function getAlertConfig() {
  const response = await fetch('http://localhost:3001/api/health/config');
  const config = await response.json();
  
  console.log('Current Alert Configuration:');
  Object.entries(config).forEach(([service, settings]: [string, any]) => {
    if (settings) {
      console.log(`\n${service}:`);
      console.log(`  Enabled: ${settings.enabled}`);
      console.log(`  Error Rate Threshold: ${settings.thresholds.errorRatePercent}%`);
      console.log(`  Response Time Threshold: ${settings.thresholds.responseTimeMs}ms`);
      console.log(`  Consecutive Failures Threshold: ${settings.thresholds.consecutiveFailures}`);
      console.log(`  Cooldown Period: ${settings.cooldownMs}ms`);
    }
  });
}

// Example 5: Update Alert Configuration for a Service
async function updateAlertConfig(service: string) {
  const newConfig = {
    enabled: true,
    thresholds: {
      errorRatePercent: 15,
      responseTimeMs: 6000,
      consecutiveFailures: 5,
    },
    cooldownMs: 600000,
  };
  
  const response = await fetch(`http://localhost:3001/api/health/config/${service}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(newConfig),
  });
  
  const result = await response.json();
  console.log(`Updated configuration for ${service}:`, result);
}

// Example 6: Monitor Health Over Time
async function monitorHealthOverTime(intervalMs: number = 60000) {
  console.log('Starting health monitoring...');
  
  setInterval(async () => {
    try {
      const response = await fetch('http://localhost:3001/api/health/status');
      const status = await response.json();
      
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] Overall Status: ${status.overallStatus}`);
      
      Object.entries(status.dependencies).forEach(([service, details]: [string, any]) => {
        if (details.status !== 'healthy') {
          console.warn(`  ⚠️  ${service} is ${details.status}`);
        }
      });
    } catch (error) {
      console.error('Failed to check health:', error);
    }
  }, intervalMs);
}

// Example 7: Generate Health Report
async function generateHealthReport() {
  const response = await fetch('http://localhost:3001/api/health/metrics');
  const { metrics } = await response.json();
  
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      totalServices: metrics.length,
      healthyServices: metrics.filter((m: any) => m.status === 'healthy').length,
      unhealthyServices: metrics.filter((m: any) => m.status === 'unhealthy').length,
    },
    services: metrics.map((m: any) => ({
      name: m.service,
      status: m.status,
      latency: `${m.latency}ms`,
      errorRate: `${m.errorRate.toFixed(2)}%`,
      consecutiveFailures: m.consecutiveFailures,
    })),
    averageLatency: (
      metrics.reduce((sum: number, m: any) => sum + m.latency, 0) / metrics.length
    ).toFixed(2),
    averageErrorRate: (
      metrics.reduce((sum: number, m: any) => sum + m.errorRate, 0) / metrics.length
    ).toFixed(2),
  };
  
  console.log('Health Report:');
  console.log(JSON.stringify(report, null, 2));
  
  return report;
}

export {
  checkSystemHealth,
  getDetailedMetrics,
  getServiceMetrics,
  getAlertConfig,
  updateAlertConfig,
  monitorHealthOverTime,
  generateHealthReport,
};
