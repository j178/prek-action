import { createDefaultEsmPreset } from 'ts-jest'

const preset = createDefaultEsmPreset({
  tsconfig: "./tsconfig.json",
})

export default {
  ...preset,
  clearMocks: true,
  moduleFileExtensions: ['ts', 'js', 'mjs'],
  roots: ['<rootDir>/test'],
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts'],
}
