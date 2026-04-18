import type { Config } from "jest"

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/__tests__/**/*.test.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: "./tsconfig.test.json",
        // Do not block test execution on TS type errors – the source types
        // are checked by the main build; here we care about runtime behaviour.
        diagnostics: false,
      },
    ],
  },
}

export default config