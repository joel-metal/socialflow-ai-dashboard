import { GraphQLScalarType, Kind } from 'graphql';
import { prisma } from '../lib/prisma';
import { GraphQLContext } from './context';

const DateTimeScalar = new GraphQLScalarType({
  name: 'DateTime',
  description: 'ISO-8601 date-time string',
  serialize: (value) => (value instanceof Date ? value.toISOString() : String(value)),
  parseValue: (value) => new Date(String(value)),
  parseLiteral: (ast) => (ast.kind === Kind.STRING ? new Date(ast.value) : null),
});

/** Throw a standard unauthenticated error when there is no user in context. */
function requireAuth(ctx: GraphQLContext): string {
  if (!ctx.userId) throw new Error('UNAUTHENTICATED');
  return ctx.userId;
}

export const resolvers = {
  DateTime: DateTimeScalar,

  Query: {
    /** Return the currently authenticated user. */
    me: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      const userId = requireAuth(ctx);
      return prisma.user.findUnique({ where: { id: userId } });
    },

    /** Return a single user by ID. */
    user: async (_: unknown, { id }: { id: string }, ctx: GraphQLContext) => {
      requireAuth(ctx);
      return prisma.user.findUnique({ where: { id } });
    },

    /** Return all posts for an organisation, newest first. */
    posts: async (
      _: unknown,
      { organizationId }: { organizationId: string },
      ctx: GraphQLContext,
    ) => {
      requireAuth(ctx);
      return prisma.post.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
      });
    },

    /** Return a single post by ID. */
    post: async (_: unknown, { id }: { id: string }, ctx: GraphQLContext) => {
      requireAuth(ctx);
      return prisma.post.findUnique({ where: { id } });
    },
  },

  Mutation: {
    /** Create a new post for an organisation. */
    createPost: async (
      _: unknown,
      { input }: { input: { organizationId: string; content: string; platform: string; scheduledAt?: Date } },
      ctx: GraphQLContext,
    ) => {
      requireAuth(ctx);
      return prisma.post.create({ data: input });
    },

    /** Update an existing post. */
    updatePost: async (
      _: unknown,
      { id, input }: { id: string; input: { content?: string; platform?: string; scheduledAt?: Date } },
      ctx: GraphQLContext,
    ) => {
      requireAuth(ctx);
      return prisma.post.update({ where: { id }, data: input });
    },

    /** Delete a post. Returns true on success. */
    deletePost: async (_: unknown, { id }: { id: string }, ctx: GraphQLContext) => {
      requireAuth(ctx);
      await prisma.post.delete({ where: { id } });
      return true;
    },
  },
};
