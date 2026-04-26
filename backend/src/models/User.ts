export interface User {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
  refreshTokens: string[];
}

// In-memory store (replace with a real DB in production)
const users = new Map<string, User>();

export const UserStore = {
  findByEmail: (email: string): User | undefined =>
    [...users.values()].find((u) => u.email === email),

  findById: (id: string): User | undefined => users.get(id),

  create: (user: User): User => {
    users.set(user.id, user);
    return user;
  },

  update: (id: string, patch: Partial<User>): User | undefined => {
    const user = users.get(id);
    if (!user) return undefined;
    const updated = { ...user, ...patch };
    users.set(id, updated);
    return updated;
  },

  /** Clear all users — intended for test teardown only. */
  clear: (): void => users.clear(),
};
