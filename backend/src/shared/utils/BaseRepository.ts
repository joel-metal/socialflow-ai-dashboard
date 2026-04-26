import { PrismaClient } from '@prisma/client';

/**
 * Base Repository class for Unit of Work pattern
 * Provides common CRUD operations within transaction context
 */
export abstract class BaseRepository {
  protected prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Get the Prisma client (transaction-scoped if in UoW context)
   */
  protected getClient(): PrismaClient {
    return this.prisma;
  }
}

/**
 * Example User Repository
 */
export class UserRepository extends BaseRepository {
  async findById(id: string) {
    return this.getClient().user.findUnique({
      where: { id },
    });
  }

  async create(data: any) {
    return this.getClient().user.create({
      data,
    });
  }

  async update(id: string, data: any) {
    return this.getClient().user.update({
      where: { id },
      data,
    });
  }

  async delete(id: string) {
    return this.getClient().user.delete({
      where: { id },
    });
  }
}

/**
 * Example Organization Repository
 */
export class OrganizationRepository extends BaseRepository {
  async findById(id: string) {
    return this.getClient().organization.findUnique({
      where: { id },
    });
  }

  async create(data: any) {
    return this.getClient().organization.create({
      data,
    });
  }

  async update(id: string, data: any) {
    return this.getClient().organization.update({
      where: { id },
      data,
    });
  }

  async delete(id: string) {
    return this.getClient().organization.delete({
      where: { id },
    });
  }
}

/**
 * Example Subscription Repository
 */
export class SubscriptionRepository extends BaseRepository {
  async findById(id: string) {
    return this.getClient().subscription.findUnique({
      where: { id },
    });
  }

  async create(data: any) {
    return this.getClient().subscription.create({
      data,
    });
  }

  async update(id: string, data: any) {
    return this.getClient().subscription.update({
      where: { id },
      data,
    });
  }

  async delete(id: string) {
    return this.getClient().subscription.delete({
      where: { id },
    });
  }
}
