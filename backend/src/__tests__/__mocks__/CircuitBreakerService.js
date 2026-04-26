// Stub for CircuitBreakerService — avoids loading opossum in unit tests
module.exports = {
  circuitBreakerService: {
    execute: async (_name, fn, fallback) => {
      try { return await fn(); } catch (e) { return fallback ? fallback() : Promise.reject(e); }
    },
    getStats: () => ({}),
  },
};
