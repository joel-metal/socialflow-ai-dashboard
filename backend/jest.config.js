// Jest resolves this file in preference to jest.config.json.
// Top-level keys (preset, testEnvironment, etc.) are intentionally omitted
// here because Jest ignores them when `projects` is defined — each project
// carries its own settings.

const sharedModuleNameMapper = {
  '^uuid$': '<rootDir>/src/__tests__/integration/__mocks__/uuid.js',
  '^.*/services/geminiService$':
    '<rootDir>/src/__tests__/integration/__mocks__/geminiService.js',
};

/** @type {import('jest').Config} */
module.exports = {
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/server.ts',
    '!src/tracing.ts',
  ],
  coverageReporters: ['text', 'lcov', 'html', 'json-summary'],
  coverageDirectory: 'coverage',
  coverageThreshold: {
    global: { lines: 80, statements: 80, functions: 80, branches: 70 },
  },
  projects: [
    {
      displayName: 'unit',
      preset: 'ts-jest',
      testEnvironment: 'node',
      roots: ['<rootDir>/src'],
      testMatch: [
        '**/__tests__/*.test.ts',
        '**/tests/**/*.test.ts',
        '**/services/__tests__/**/*.test.ts',
      ],
      moduleNameMapper: {
        ...sharedModuleNameMapper,
        '^opossum$': '<rootDir>/src/__tests__/__mocks__/opossum.js',
        '^.*/lib/prisma$': '<rootDir>/src/__tests__/__mocks__/prisma.js',
        '^.*/lib/logger$': '<rootDir>/src/__tests__/__mocks__/logger.js',
        '^.*/CircuitBreakerService$': '<rootDir>/src/__tests__/__mocks__/CircuitBreakerService.js',
        '^.*/utils/LockService$': '<rootDir>/src/__tests__/__mocks__/LockService.js',
      },
      setupFiles: ['<rootDir>/src/__tests__/unitSetup.ts'],
      setupFilesAfterEnv: ['<rootDir>/src/__tests__/otelTeardown.ts'],
      transform: { '^.+\\.tsx?$': ['ts-jest', { diagnostics: false }] },
    },
    {
      displayName: 'e2e',
      preset: 'ts-jest',
      testEnvironment: 'node',
      roots: ['<rootDir>/src'],
      testMatch: ['**/__tests__/integration/*.e2e.test.ts'],
      moduleNameMapper: sharedModuleNameMapper,
      transform: { '^.+\\.tsx?$': ['ts-jest', { diagnostics: false }] },
      testTimeout: 15000,
    },
    {
      displayName: 'db',
      preset: 'ts-jest',
      testEnvironment: 'node',
      roots: ['<rootDir>/src'],
      testMatch: ['**/__tests__/database/*.db.test.ts'],
      moduleNameMapper: { '^uuid$': sharedModuleNameMapper['^uuid$'] },
      transform: { '^.+\\.tsx?$': ['ts-jest', { diagnostics: false }] },
      testTimeout: 30000,
    },
    {
      displayName: 'mocks',
      preset: 'ts-jest',
      testEnvironment: 'node',
      roots: ['<rootDir>/src'],
      testMatch: ['**/__tests__/mocks/*.mock.test.ts'],
      moduleNameMapper: { '^uuid$': sharedModuleNameMapper['^uuid$'] },
      transform: { '^.+\\.tsx?$': ['ts-jest', { diagnostics: false }] },
      testTimeout: 10000,
    },
  ],
};
