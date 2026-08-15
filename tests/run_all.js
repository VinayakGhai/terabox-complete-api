#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const { colors } = require('./harness');

const SUITES = [
  {
    tier: 1,
    name: 'Worker Proxy Architecture Test Suite',
    file: 'worker_proxy_tests.js',
    description: 'Unit and integration tests for Cloudflare Worker token proxy, Playwright removal, env, CLI, speedups',
  },
];

function printHeader() {
  console.log(`${colors.bold}${colors.cyan}================================================================================${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}       TeraBox Credential Extractor & CLI Integration — Test Runner             ${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}================================================================================${colors.reset}`);
  console.log(`${colors.gray}Environment: Node.js ${process.version} | OS: ${process.platform} ${process.arch}${colors.reset}\n`);
}

function parseCliArgs() {
  const args = process.argv.slice(2);
  let selectedTiers = [1, 2, 3, 4];
  let filter = '';
  let verbose = false;
  let bail = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--tier=')) {
      selectedTiers = arg.split('=')[1].split(',').map(Number);
    } else if (arg === '--tier' && args[i + 1]) {
      selectedTiers = args[++i].split(',').map(Number);
    } else if (arg.startsWith('--grep=') || arg.startsWith('--filter=')) {
      filter = arg.split('=')[1];
    } else if ((arg === '--grep' || arg === '--filter') && args[i + 1]) {
      filter = args[++i];
    } else if (arg === '--verbose' || arg === '-v') {
      verbose = true;
    } else if (arg === '--bail' || arg === '-b') {
      bail = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Usage: node tests/run_all.js [options]

Options:
  --tier=<1,2,3,4>    Run specific tiers (e.g. --tier=1,2 or --tier=3)
  --filter=<pattern>  Filter test names by regex or substring (alias: --grep)
  --verbose, -v       Show detailed diagnostic logs and error stacks
  --bail, -b          Abort test suite immediately on first failure
  --help, -h          Show this help message
      `);
      process.exit(0);
    }
  }

  return { selectedTiers, filter, verbose, bail };
}

async function main() {
  printHeader();
  const { selectedTiers, filter, verbose, bail } = parseCliArgs();

  let totalPassed = 0;
  let totalFailed = 0;
  let totalTests = 0;
  const suiteResults = [];
  const overallStartTime = Date.now();

  for (const suite of SUITES) {
    if (!selectedTiers.includes(suite.tier)) {
      continue;
    }

    const suiteFilePath = path.join(__dirname, suite.file);
    if (!fs.existsSync(suiteFilePath)) {
      console.log(`${colors.red}✕ Error: Suite file not found: ${suiteFilePath}${colors.reset}`);
      totalFailed++;
      suiteResults.push({
        tier: suite.tier,
        name: suite.name,
        passed: 0,
        failed: 1,
        total: 1,
        duration: 0,
        error: 'File not found',
      });
      if (bail) break;
      continue;
    }

    const suiteStart = Date.now();
    try {
      const suiteModule = require(suiteFilePath);
      const res = await suiteModule.run({ filter, verbose });
      const duration = Date.now() - suiteStart;

      totalPassed += res.passed || 0;
      totalFailed += res.failed || 0;
      totalTests += res.total || 0;

      suiteResults.push({
        tier: suite.tier,
        name: suite.name,
        passed: res.passed,
        failed: res.failed,
        total: res.total,
        duration,
        error: null,
      });

      if (bail && res.failed > 0) {
        console.log(`\n${colors.red}[BAIL] Aborting execution due to failure in Tier ${suite.tier}.${colors.reset}`);
        break;
      }
    } catch (err) {
      const duration = Date.now() - suiteStart;
      totalFailed++;
      suiteResults.push({
        tier: suite.tier,
        name: suite.name,
        passed: 0,
        failed: 1,
        total: 1,
        duration,
        error: err.message,
      });
      console.log(`${colors.red}✕ Suite execution error: ${err.message}${colors.reset}`);
      if (bail) break;
    }
  }

  const overallDuration = ((Date.now() - overallStartTime) / 1000).toFixed(2);

  // Print Summary Table
  console.log(`\n${colors.bold}${colors.cyan}================================================================================${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}                               TEST SUMMARY REPORT                              ${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}================================================================================${colors.reset}`);
  console.log(
    colors.bold +
    'Tier'.padEnd(8) +
    'Suite Name'.padEnd(46) +
    'Passed'.padEnd(10) +
    'Failed'.padEnd(10) +
    'Duration' +
    colors.reset
  );
  console.log('-'.repeat(80));

  for (const r of suiteResults) {
    const tierStr = `Tier ${r.tier}`.padEnd(8);
    const nameStr = (r.name.length > 44 ? r.name.slice(0, 41) + '...' : r.name).padEnd(46);
    const passStr = `${colors.green}${r.passed}${colors.reset}`.padEnd(19);
    const failStr = `${r.failed > 0 ? colors.red : colors.green}${r.failed}${colors.reset}`.padEnd(19);
    const durStr = `${(r.duration / 1000).toFixed(2)}s`;
    console.log(`${tierStr}${nameStr}${passStr}${failStr}${durStr}`);
  }

  console.log('-'.repeat(80));
  console.log(`Total Execution Time : ${overallDuration}s`);
  console.log(`Total Tests Run      : ${totalTests}`);
  console.log(`Total Passed         : ${colors.green}${totalPassed}${colors.reset}`);
  console.log(`Total Failed         : ${totalFailed > 0 ? colors.red : colors.green}${totalFailed}${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}================================================================================${colors.reset}`);

  if (totalFailed > 0) {
    console.log(`\n${colors.red}${colors.bold}✕ TEST SUITE FAILED (${totalFailed} failure(s))${colors.reset}\n`);
    process.exit(1);
  } else {
    console.log(`\n${colors.green}${colors.bold}✔ ALL TEST TIERS PASSED SUCCESSFULLY (100% PASS RATE)${colors.reset}\n`);
    process.exit(0);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main, SUITES };
