const { spawn } = require('child_process');

/**
 * Process Result Interface
 * @typedef {Object} ProcessResult
 * @property {number} exitCode
 * @property {string} stdout
 * @property {string} stderr
 * @property {boolean} timedOut
 * @property {number} durationMs
 */

/**
 * Subprocess Spawner and Interactive Process Controller
 */
class ProcessSpawner {
  static activeProcesses = new Set();
  static hooksInstalled = false;

  static installExitHooks() {
    if (ProcessSpawner.hooksInstalled) return;
    ProcessSpawner.hooksInstalled = true;

    const killAll = () => {
      for (const cp of ProcessSpawner.activeProcesses) {
        try {
          cp.kill('SIGKILL');
        } catch (_) {}
      }
      ProcessSpawner.activeProcesses.clear();
    };

    process.on('exit', killAll);
    process.on('SIGINT', () => {
      killAll();
      process.exit(130);
    });
    process.on('SIGTERM', () => {
      killAll();
      process.exit(143);
    });
  }

  /**
   * Runs a command to completion and returns the result.
   * @param {string} command
   * @param {string[]} args
   * @param {Object} [options={}]
   * @returns {Promise<ProcessResult>}
   */
  static async run(command, args = [], options = {}) {
    ProcessSpawner.installExitHooks();
    return new Promise((resolve, reject) => {
      const timeoutMs = options.timeout || 15000;
      const startTime = Date.now();
      let stdout = '';
      let stderr = '';
      let isSettled = false;

      const cp = spawn(command, args, {
        cwd: options.cwd || process.cwd(),
        env: options.env || process.env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      ProcessSpawner.activeProcesses.add(cp);

      const timer = setTimeout(() => {
        if (!isSettled) {
          isSettled = true;
          ProcessSpawner.activeProcesses.delete(cp);
          try {
            cp.kill('SIGKILL');
          } catch (_) {}
          resolve({
            exitCode: -1,
            stdout,
            stderr: stderr + '\n[TIMEOUT EXCEEDED]',
            timedOut: true,
            durationMs: Date.now() - startTime,
          });
        }
      }, timeoutMs);

      cp.stdout.on('data', chunk => { stdout += chunk.toString(); });
      cp.stderr.on('data', chunk => { stderr += chunk.toString(); });

      cp.on('close', code => {
        if (!isSettled) {
          isSettled = true;
          clearTimeout(timer);
          ProcessSpawner.activeProcesses.delete(cp);
          resolve({
            exitCode: code === null ? -1 : code,
            stdout,
            stderr,
            timedOut: false,
            durationMs: Date.now() - startTime,
          });
        }
      });

      cp.on('error', err => {
        if (!isSettled) {
          isSettled = true;
          clearTimeout(timer);
          ProcessSpawner.activeProcesses.delete(cp);
          reject(err);
        }
      });

      if (options.input !== undefined && options.input !== null) {
        if (options.inputDelay) {
          setTimeout(() => {
            try {
              cp.stdin.write(options.input);
              cp.stdin.end();
            } catch (_) {}
          }, options.inputDelay);
        } else {
          try {
            cp.stdin.write(options.input);
            cp.stdin.end();
          } catch (_) {}
        }
      } else if (options.closeStdin !== false) {
        try {
          cp.stdin.end();
        } catch (_) {}
      }
    });
  }

  /**
   * Spawns an interactive process with real-time stream control.
   * @param {string} command
   * @param {string[]} args
   * @param {Object} [options={}]
   * @returns {InteractiveProcess}
   */
  static spawnInteractive(command, args = [], options = {}) {
    ProcessSpawner.installExitHooks();
    return new InteractiveProcess(command, args, options);
  }
}

class InteractiveProcess {
  constructor(command, args, options = {}) {
    this.command = command;
    this.args = args;
    this.options = options;
    this.startTime = Date.now();
    this.stdout = '';
    this.stderr = '';
    this.isSettled = false;
    this.exitCode = null;
    this.listeners = [];

    this.cp = spawn(command, args, {
      cwd: options.cwd || process.cwd(),
      env: options.env || process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    ProcessSpawner.activeProcesses.add(this.cp);

    this.cp.stdout.on('data', chunk => {
      const str = chunk.toString();
      this.stdout += str;
      this.notifyListeners('stdout', str);
    });

    this.cp.stderr.on('data', chunk => {
      const str = chunk.toString();
      this.stderr += str;
      this.notifyListeners('stderr', str);
    });

    this.cp.on('close', code => {
      this.isSettled = true;
      this.exitCode = code;
      ProcessSpawner.activeProcesses.delete(this.cp);
      this.notifyListeners('close', code);
    });

    this.cp.on('error', err => {
      ProcessSpawner.activeProcesses.delete(this.cp);
      this.notifyListeners('error', err);
    });
  }

  notifyListeners(event, data) {
    for (const listener of this.listeners) {
      if (listener.event === event) {
        listener.callback(data);
      }
    }
  }

  getStdout() {
    return this.stdout;
  }

  getStderr() {
    return this.stderr;
  }

  /**
   * Waits until stdout contains the specified string or matches regex.
   * @param {string|RegExp} pattern
   * @param {number} [timeoutMs=8000]
   * @returns {Promise<string>} Current stdout
   */
  async waitForStdout(pattern, timeoutMs = 8000) {
    const start = Date.now();
    return new Promise((resolve, reject) => {
      const check = () => {
        const matched = typeof pattern === 'string'
          ? this.stdout.includes(pattern)
          : pattern.test(this.stdout);

        if (matched) {
          return resolve(this.stdout);
        }
        if (this.isSettled) {
          return reject(new Error(`Process terminated (code ${this.exitCode}) before stdout matched pattern "${pattern}". Stdout: ${this.stdout}\nStderr: ${this.stderr}`));
        }
        if (Date.now() - start > timeoutMs) {
          return reject(new Error(`Timeout (${timeoutMs}ms) waiting for stdout pattern "${pattern}". Current stdout: ${this.stdout}\nStderr: ${this.stderr}`));
        }
        setTimeout(check, 40);
      };
      check();
    });
  }

  /**
   * Writes string data to child process stdin.
   * @param {string} input
   */
  writeStdin(input) {
    if (this.cp.stdin && !this.cp.stdin.destroyed) {
      this.cp.stdin.write(input);
    }
  }

  /**
   * Closes the stdin stream.
   */
  closeStdin() {
    if (this.cp.stdin && !this.cp.stdin.destroyed) {
      this.cp.stdin.end();
    }
  }

  /**
   * Sends POSIX signal to child process.
   * @param {string|number} [signal='SIGTERM']
   */
  kill(signal = 'SIGTERM') {
    try {
      this.cp.kill(signal);
    } catch (_) {}
  }

  /**
   * Waits for child process to exit.
   * @param {number} [timeoutMs=15000]
   * @returns {Promise<ProcessResult>}
   */
  async waitCompletion(timeoutMs = 15000) {
    return new Promise(resolve => {
      if (this.isSettled) {
        return resolve({
          exitCode: this.exitCode,
          stdout: this.stdout,
          stderr: this.stderr,
          timedOut: false,
          durationMs: Date.now() - this.startTime,
        });
      }

      const timer = setTimeout(() => {
        this.kill('SIGKILL');
        resolve({
          exitCode: -1,
          stdout: this.stdout,
          stderr: this.stderr + '\n[TIMEOUT EXCEEDED]',
          timedOut: true,
          durationMs: Date.now() - this.startTime,
        });
      }, timeoutMs);

      this.cp.on('close', code => {
        clearTimeout(timer);
        resolve({
          exitCode: code === null ? -1 : code,
          stdout: this.stdout,
          stderr: this.stderr,
          timedOut: false,
          durationMs: Date.now() - this.startTime,
        });
      });
    });
  }
}

module.exports = { ProcessSpawner, InteractiveProcess };
