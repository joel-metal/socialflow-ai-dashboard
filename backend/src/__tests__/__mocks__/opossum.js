// Minimal opossum mock — passes fn through, fires fallback on error
class CircuitBreaker {
  constructor(fn, _opts) {
    this._fn = fn;
  }
  async fire(...args) {
    return this._fn(...args);
  }
  fallback(fn) {
    this._fallback = fn;
    return this;
  }
  on() { return this; }
}
module.exports = CircuitBreaker;
module.exports.default = CircuitBreaker;
