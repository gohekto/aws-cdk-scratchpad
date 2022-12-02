const esModules = ['uuid'].join('|');
module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.(t)s$': '@swc/jest',
  },
  moduleNameMapper: {
    // Force module uuid to resolve with the CJS entry point, because Jest does not support package.json.exports. See https://github.com/uuidjs/uuid/issues/451
    "uuid": require.resolve('uuid'),
  },
  testMatch: ['**/*.test.ts'],
  globals: {
    CLOUD_SPEC_PROJECT_NAME: 'cdk-serverless-scratchpad',
  },
}