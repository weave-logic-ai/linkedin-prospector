import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/../tests'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // @noble/hashes ships ESM-only so Jest (CommonJS) cannot load it.
    // Redirect to a local shim that wraps Node's built-in crypto for the
    // test environment only. Hash tests are algorithm-agnostic.
    '^@noble/hashes/blake3(\\.js)?$': '<rootDir>/../tests/__mocks__/noble-blake3-shim.ts',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: 'tsconfig.json',
    }],
  },
  testMatch: ['**/*.test.ts'],
};

export default config;
