import { Router, Request, Response } from 'express';
import { dynamicConfigService, ConfigType } from '../services/DynamicConfigService';
import { authMiddleware, AuthRequest } from '../middleware/authMiddleware';
import { checkPermission } from '../middleware/checkPermission';
import { auditLogger } from '../services/AuditLogger';

const router = Router();

const adminOnly = [authMiddleware, checkPermission('settings:manage')];

/**
 * @openapi
 * /config:
 *   get:
 *     tags: [Config]
 *     summary: Get all dynamic configuration values (admin)
 *     responses:
 *       200:
 *         description: Configuration map
 *       401:
 *         description: Unauthorized
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
 * @openapi
 * /config/{key}:
 *   put:
 *     tags: [Config]
 *     summary: Update or create a configuration value (admin)
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [value]
 *             properties:
 *               value: {}
 *               type:
 *                 type: string
 *                 enum: [string, number, boolean, json]
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Configuration updated
 *       400:
 *         description: Value is required
 *       401:
 *         description: Unauthorized
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
