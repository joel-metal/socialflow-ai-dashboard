module.exports = {
  LockService: { withLock: (_key, fn) => fn() },
};
