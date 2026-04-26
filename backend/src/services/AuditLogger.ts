import { createLogger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { AuditAction, AuditLogStore } from '../models/AuditLog';

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
    // Always write to the in-memory store (used by tests and audit query endpoints)
    AuditLogStore.append({
      actorId: ctx.actorId,
      action: ctx.action,
      resourceType: ctx.resourceType,
      resourceId: ctx.resourceId,
      metadata: ctx.metadata,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });

    try {
      await prisma.auditLog.create({
        data: {
          userId: ctx.actorId,
          action: ctx.action,
          resource: ctx.resourceType ?? null,
          resourceId: ctx.resourceId ?? null,
          metadata: ctx.metadata ? (ctx.metadata as object) : undefined,
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
