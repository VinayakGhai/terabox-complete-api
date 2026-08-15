const assert = require('assert');
const { TestSandbox, withSandbox } = require('./sandbox');
const { MockTeraBoxServer, withMockServer } = require('./mock_server');
const { ProcessSpawner, InteractiveProcess } = require('./process_spawner');
const { CliRunner, executeCli, runUpload, runRefresh, runBash, runZsh } = require('./cli_runner');

/**
 * ANSI Color Helpers for Clean Terminal Output
 */
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
};

/**
 * Helper to run a test function with clean error trapping and timing
 */
async function testCase(name, fn) {
  const start = Date.now();
  try {
    await fn();
    const duration = Date.now() - start;
    return { name, passed: true, duration, error: null };
  } catch (err) {
    const duration = Date.now() - start;
    return { name, passed: false, duration, error: err };
  }
}

module.exports = {
  assert,
  TestSandbox,
  withSandbox,
  MockTeraBoxServer,
  withMockServer,
  ProcessSpawner,
  InteractiveProcess,
  CliRunner,
  executeCli,
  runUpload,
  runRefresh,
  runBash,
  runZsh,
  colors,
  testCase,
};
