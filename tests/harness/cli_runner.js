const path = require('path');
const { ProcessSpawner } = require('./process_spawner');

/**
 * High-level CLI Execution and Test Helpers
 */
class CliRunner {
  /**
   * Executes a command via ProcessSpawner.
   * @param {string} command
   * @param {string[]} args
   * @param {Object} [options={}]
   * @returns {Promise<import('./process_spawner').ProcessResult>}
   */
  static async execute(command, args = [], options = {}) {
    return ProcessSpawner.run(command, args, options);
  }

  /**
   * Executes upload.js in the given directory or sandbox.
   * @param {string[]} [args=[]]
   * @param {Object} [options={}]
   * @returns {Promise<import('./process_spawner').ProcessResult>}
   */
  static async runUpload(args = [], options = {}) {
    const cwd = options.cwd || process.cwd();
    const scriptPath = path.join(cwd, 'upload.js');
    return ProcessSpawner.run(process.execPath, [scriptPath, ...args], options);
  }

  /**
   * Executes refresh_creds.js in the given directory or sandbox.
   * @param {string[]} [args=[]]
   * @param {Object} [options={}]
   * @returns {Promise<import('./process_spawner').ProcessResult>}
   */
  static async runRefresh(args = [], options = {}) {
    const cwd = options.cwd || process.cwd();
    const scriptPath = path.join(cwd, 'refresh_creds.js');
    return ProcessSpawner.run(process.execPath, [scriptPath, ...args], options);
  }

  /**
   * Executes a bash command string.
   * @param {string} commandString
   * @param {Object} [options={}]
   * @returns {Promise<import('./process_spawner').ProcessResult>}
   */
  static async runBash(commandString, options = {}) {
    return ProcessSpawner.run('bash', ['-c', commandString], options);
  }

  /**
   * Executes a zsh command string.
   * @param {string} commandString
   * @param {Object} [options={}]
   * @returns {Promise<import('./process_spawner').ProcessResult>}
   */
  static async runZsh(commandString, options = {}) {
    return ProcessSpawner.run('zsh', ['-c', commandString], options);
  }
}

module.exports = {
  CliRunner,
  executeCli: CliRunner.execute,
  runUpload: CliRunner.runUpload,
  runRefresh: CliRunner.runRefresh,
  runBash: CliRunner.runBash,
  runZsh: CliRunner.runZsh,
};
