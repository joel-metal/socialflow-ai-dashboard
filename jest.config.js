/** @type {import('jest').Config} */
module.exports = {
  projects: [
    {
      displayName: 'frontend',
      preset: 'ts-jest',
      testEnvironment: 'jsdom',
      roots: ['<rootDir>/src'],
      testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
      setupFiles: ['<rootDir>/jest.setup.js'],
      transformIgnorePatterns: [
        'node_modules/(?!(@scure|@noble|@otplib|otplib)/)',
      ],
      transform: {
        '^.+\\.(ts|tsx)$': ['ts-jest', {
          tsconfig: {
            jsx: 'react',
            types: ['jest', 'node'],
            esModuleInterop: true,
          },
        }],
        '^.+\\.js$': ['babel-jest', {}],
      },
    },
    '<rootDir>/backend',
  ],
};
