import 'reflect-metadata';
import { Router } from 'express';
import {
  getHealthService,
  getHealthMonitor,
  getAlertConfigService,
} from '../services/serviceFactory';

const router = Router();

/**
 * GET /api/health/status
 * Get current system health status
 */
router.get('/status', async (req, res) => {
  try {
    const healthService = getHealthService();
    const status = await healthService.getSystemStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Health check failed',
    });
  }
});

/**
 * GET /api/health/metrics
 * Get detailed health metrics for all services
 */
router.get('/metrics', (req, res) => {
  try {
    const monitor = getHealthMonitor();
    const metrics = monitor.getMetrics();
    res.json({ metrics });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to retrieve metrics',
    });
  }
});

/**
 * GET /api/health/metrics/:service
 * Get health metrics for a specific service
 */
router.get('/metrics/:service', (req, res) => {
  try {
    const monitor = getHealthMonitor();
    const metrics = monitor.getMetrics(req.params.service);
    if (metrics.length === 0) {
      return res.status(404).json({ error: 'Service not found' });
    }
    res.json({ metrics });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to retrieve metrics',
    });
  }
});

/**
 * GET /api/health/config
 * Get alert configuration
 */
router.get('/config', (req, res) => {
  try {
    const alertConfigService = getAlertConfigService();
    const services = ['database', 'redis', 's3', 'twitter', 'youtube', 'facebook'];
    const config = Object.fromEntries(
      services.map((service) => [service, alertConfigService.getConfig(service)]),
    );
    res.json(config);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to retrieve config',
    });
  }
});

/**
 * PUT /api/health/config/:service
 * Update alert configuration for a service
 */
router.put('/config/:service', (req, res) => {
  try {
    const alertConfigService = getAlertConfigService();
    const { service } = req.params;
    const config = req.body;

    alertConfigService.setConfig(service, config);
    res.json({ message: 'Configuration updated', config });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to update config',
    });
  }
});

export default router;
