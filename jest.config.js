/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
  preset: "ts-jest/presets/js-with-babel",
  testEnvironment: "node",
  testMatch: ["**/__tests__/**/*.test.ts"],
  transformIgnorePatterns: ["/node_modules/?!(p-limit)/"],
};
