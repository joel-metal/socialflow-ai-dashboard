const stub = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), http: jest.fn() };
module.exports = { createLogger: () => stub, logger: stub };
