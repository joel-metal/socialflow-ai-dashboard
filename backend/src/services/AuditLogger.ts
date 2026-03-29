import { createLogger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { AuditAction } from '../models/AuditLog';

const logger = createLogger('audit');

export interface AuditContext {
  actorId: string;
  action: AuditAction;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}

/**
 * AuditLogger — single entry point for recording audit events.
 *
 * Usage:
 *   auditLogger.log({ actorId: userId, action: 'post:delete', resourceType: 'post', resourceId: id });
 */
class AuditLogger {
  async log(ctx: AuditContext): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          userId: ctx.actorId,
          action: ctx.action,
          resource: ctx.resourceType,
          resourceId: ctx.resourceId,
          metadata: ctx.metadata ?? undefined,
          ipAddress: ctx.ip,
          userAgent: ctx.userAgent,
        },
      });
      logger.info('audit', {
        actorId: ctx.actorId,
        action: ctx.action,
        resourceType: ctx.resourceType,
        resourceId: ctx.resourceId,
      });
    } catch (err) {
      logger.error('audit:write:failed', { err });
    }
  }
}

export const auditLogger = new AuditLogger();
