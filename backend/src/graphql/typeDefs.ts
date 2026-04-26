import { parse } from 'graphql';

/**
 * GraphQL schema for SocialFlow.
 *
 * Covers the two core domains exposed to the frontend:
 *   - User  — account identity and role
 *   - Post  — organisation-scoped social content
 */
export const typeDefs = parse(`
  # ── Scalars ────────────────────────────────────────────────────────────────

  """ISO-8601 date-time string (e.g. "2026-03-28T16:00:00.000Z")"""
  scalar DateTime

  # ── Types ──────────────────────────────────────────────────────────────────

  """A registered user account."""
  type User {
    id: ID!
    email: String!
    role: String!
    createdAt: DateTime!
  }

  """A social-media post belonging to an organisation."""
  type Post {
    id: ID!
    organizationId: ID!
    content: String!
    platform: String!
    scheduledAt: DateTime
    createdAt: DateTime!
  }

  # ── Inputs ─────────────────────────────────────────────────────────────────

  """Fields required to create a new post."""
  input CreatePostInput {
    organizationId: ID!
    content: String!
    platform: String!
    scheduledAt: DateTime
  }

  """Fields that may be updated on an existing post."""
  input UpdatePostInput {
    content: String
    platform: String
    scheduledAt: DateTime
  }

  # ── Queries ────────────────────────────────────────────────────────────────

  type Query {
    """Return the currently authenticated user."""
    me: User

    """Return a single user by ID (admin only)."""
    user(id: ID!): User

    """Return all posts for an organisation, newest first."""
    posts(organizationId: ID!): [Post!]!

    """Return a single post by ID."""
    post(id: ID!): Post
  }

  # ── Mutations ──────────────────────────────────────────────────────────────

  type Mutation {
    """Create a new post for an organisation."""
    createPost(input: CreatePostInput!): Post!

    """Update an existing post. Returns the updated post."""
    updatePost(id: ID!, input: UpdatePostInput!): Post!

    """Delete a post. Returns true on success."""
    deletePost(id: ID!): Boolean!
  }
`);
