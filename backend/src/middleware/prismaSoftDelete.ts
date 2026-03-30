// Prisma v7 removed Prisma.Middleware from the public API; define params locally.
type MiddlewareParams = {
  model?: string;
  action: string;
  args: any;
  dataPath: string[];
  runInTransaction: boolean;
};

type Next = (params: MiddlewareParams) => Promise<any>;

// Models that support soft delete (have a deletedAt field)
const SOFT_DELETE_MODELS = new Set(['User', 'Listing']);

const FIND_ACTIONS = new Set([
  'findFirst',
  'findUnique',
  'findMany',
  'findFirstOrThrow',
  'findUniqueOrThrow',
]);

export const softDeleteMiddleware = async (params: MiddlewareParams, next: Next): Promise<any> => {
  if (!params.model || !SOFT_DELETE_MODELS.has(params.model)) {
    return next(params);
  }

  if (params.action === 'delete') {
    params.action = 'update';
    params.args.data = { deletedAt: new Date() };
    return next(params);
  }

  if (params.action === 'deleteMany') {
    params.action = 'updateMany';
    params.args.data = { deletedAt: new Date() };
    return next(params);
  }

  if (FIND_ACTIONS.has(params.action)) {
    if (params.action === 'findUnique') {
      params.action = 'findFirst';
    } else if (params.action === 'findUniqueOrThrow') {
      params.action = 'findFirstOrThrow';
    }
    params.args ??= {};
    params.args.where ??= {};
    params.args.where.deletedAt = null;
    return next(params);
  }

  return next(params);
};
