import { Router, Request, Response } from 'express';
import { dynamicConfigService, ConfigType } from '../services/DynamicConfigService';
import { authMiddleware, AuthRequest } from '../middleware/authMiddleware';
import { checkPermission } from '../middleware/checkPermission';
import { auditLogger } from '../services/AuditLogger';

const router = Router();

const adminOnly = [authMiddleware, checkPermission('settings:manage')];

/**
 * @route GET /api/config
 * @desc Get all configuration values from cache
 * @access Admin
 */
router.get('/', adminOnly, async (_req: Request, res: Response) => {
  try {
    const status = dynamicConfigService.getStatus();
    const configs: Record<string, unknown> = {};
    for (const key of status.cachedKeys) {
      configs[key] = dynamicConfigService.get(key);
    }
    res.json({ success: true, status, configs });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
});

/**
 * @route POST /api/config/refresh
 * @desc Manually refresh the configuration cache from the database
 * @access Admin
 */
router.post('/refresh', adminOnly, async (req: AuthRequest, res: Response) => {
  try {
    await dynamicConfigService.refreshCache();
    auditLogger.log({
      actorId: req.userId!,
      action: 'org:settings:update',
      resourceType: 'config',
      resourceId: 'cache',
      metadata: { operation: 'refresh' },
      ip: req.ip,
    });
    res.json({ success: true, message: 'Configuration cache refreshed successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
});

/**
 * @route PUT /api/config/:key
 * @desc Update or create a configuration value
 * @access Admin
 */
router.put('/:key', adminOnly, async (req: AuthRequest, res: Response) => {
  const { key } = req.params;
  const { value, type, description } = req.body;

  if (value === undefined) {
    res.status(400).json({ success: false, message: 'Value is required' });
    return;
  }

  try {
    await dynamicConfigService.set(key, value, type as ConfigType, description);
    auditLogger.log({
      actorId: req.userId!,
      action: 'org:settings:update',
      resourceType: 'config',
      resourceId: key,
      metadata: { value, type, description },
      ip: req.ip,
    });
    res.json({ success: true, message: `Configuration "${key}" updated successfully` });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
});

export default router;
