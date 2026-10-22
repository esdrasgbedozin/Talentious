/**
 * Jest du package @talentious/cv-render — autonome (hors Next).
 * ts-jest + jsdom : prêt pour les composants React extraits en M0-T08.
 * @type {import('ts-jest').JestConfigWithTsJest}
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.{spec,test}.{ts,tsx}'],
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts'],
};
