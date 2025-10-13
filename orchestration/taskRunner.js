const { spawn, exec } = require('child_process');
const path = require('path');
const logger = require('../logger/winstonConfig');

/**
 * Task Runner for orchestrating yazhitite C++ processes
 * Provides utilities to spawn, monitor, and manage external processes
 */
class TaskRunner {
  constructor() {
    this.activeTasks = new Map(); // taskId -> process info
    this.taskIdCounter = 0;
  }

  /**
   * Spawn a yazhitite process with specified arguments
   * @param {Object} options
   * @param {string} options.command - Command to run (default: yazhitite binary)
   * @param {Array} options.args - Command arguments
   * @param {Object} options.env - Environment variables
   * @param {Function} options.onStdout - Callback for stdout
   * @param {Function} options.onStderr - Callback for stderr
   * @param {Function} options.onExit - Callback for exit
   * @returns {Promise<Object>} Task info with taskId and process
   */
  async spawnTask(options = {}) {
    const {
      command = path.join(__dirname, '../../yazhitite/build/libation_server'),
      args = [],
      env = {},
      onStdout,
      onStderr,
      onExit,
      cwd,
    } = options;

    const taskId = ++this.taskIdCounter;

    return new Promise((resolve, reject) => {
      logger.info('Spawning task', { taskId, command, args });

      const childProcess = spawn(command, args, {
        env: { ...process.env, ...env },
        cwd: cwd || process.cwd(),
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const taskInfo = {
        taskId,
        command,
        args,
        process: childProcess,
        startTime: Date.now(),
        status: 'running',
        stdout: [],
        stderr: [],
      };

      this.activeTasks.set(taskId, taskInfo);

      // Handle stdout
      childProcess.stdout.on('data', (data) => {
        const output = data.toString();
        taskInfo.stdout.push(output);
        
        logger.debug(`Task ${taskId} stdout`, { output });
        
        if (onStdout) {
          onStdout(output, taskId);
        }
      });

      // Handle stderr
      childProcess.stderr.on('data', (data) => {
        const output = data.toString();
        taskInfo.stderr.push(output);
        
        logger.debug(`Task ${taskId} stderr`, { output });
        
        if (onStderr) {
          onStderr(output, taskId);
        }
      });

      // Handle exit
      childProcess.on('exit', (code, signal) => {
        taskInfo.status = code === 0 ? 'completed' : 'failed';
        taskInfo.exitCode = code;
        taskInfo.signal = signal;
        taskInfo.endTime = Date.now();
        taskInfo.duration = taskInfo.endTime - taskInfo.startTime;

        logger.info(`Task ${taskId} exited`, { 
          code, 
          signal, 
          duration: taskInfo.duration 
        });

        if (onExit) {
          onExit(code, signal, taskId);
        }

        // Keep task info for a while for debugging
        setTimeout(() => {
          this.activeTasks.delete(taskId);
        }, 60000); // Remove after 1 minute
      });

      // Handle spawn errors
      childProcess.on('error', (error) => {
        logger.error(`Task ${taskId} spawn error`, { error: error.message });
        taskInfo.status = 'error';
        taskInfo.error = error.message;
        reject(error);
      });

      // Resolve with task info once spawned
      childProcess.on('spawn', () => {
        resolve(taskInfo);
      });
    });
  }

  /**
   * Run a yazhitite command and wait for completion
   * @param {Object} options
   * @returns {Promise<Object>} Result with stdout, stderr, exitCode
   */
  async runCommand(options = {}) {
    const taskInfo = await this.spawnTask(options);

    return new Promise((resolve, reject) => {
      taskInfo.process.on('exit', (code) => {
        resolve({
          taskId: taskInfo.taskId,
          exitCode: code,
          stdout: taskInfo.stdout.join(''),
          stderr: taskInfo.stderr.join(''),
          duration: Date.now() - taskInfo.startTime,
        });
      });

      taskInfo.process.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Run a batch processing job
   * @param {Object} options
   * @param {Array} options.data - Data to process
   * @param {string} options.inputFile - Path to input JSON file
   * @param {string} options.outputFile - Path to output JSON file
   * @returns {Promise<Object>} Result
   */
  async runBatchJob(options = {}) {
    const {
      data,
      inputFile = `/tmp/yazhitite-input-${Date.now()}.json`,
      outputFile = `/tmp/yazhitite-output-${Date.now()}.json`,
    } = options;

    const fs = require('fs').promises;

    // Write input data to file
    if (data) {
      await fs.writeFile(inputFile, JSON.stringify(data, null, 2));
    }

    // Run command with input/output files
    const result = await this.runCommand({
      args: ['--batch', '--input', inputFile, '--output', outputFile],
      ...options,
    });

    // Read output file
    try {
      const outputData = await fs.readFile(outputFile, 'utf8');
      result.output = JSON.parse(outputData);
    } catch (error) {
      logger.warn('Failed to read batch output', { error: error.message });
      result.output = null;
    }

    // Cleanup temp files
    try {
      await fs.unlink(inputFile);
      await fs.unlink(outputFile);
    } catch (error) {
      logger.warn('Failed to cleanup temp files', { error: error.message });
    }

    return result;
  }

  /**
   * Kill a running task
   * @param {number} taskId
   * @param {string} signal - Signal to send (default: SIGTERM)
   * @returns {boolean} Success
   */
  killTask(taskId, signal = 'SIGTERM') {
    const taskInfo = this.activeTasks.get(taskId);

    if (!taskInfo) {
      logger.warn(`Task ${taskId} not found`);
      return false;
    }

    if (taskInfo.status !== 'running') {
      logger.warn(`Task ${taskId} is not running`);
      return false;
    }

    logger.info(`Killing task ${taskId}`, { signal });
    taskInfo.process.kill(signal);
    taskInfo.status = 'killed';

    return true;
  }

  /**
   * Get task info
   * @param {number} taskId
   * @returns {Object|null} Task info
   */
  getTask(taskId) {
    return this.activeTasks.get(taskId) || null;
  }

  /**
   * Get all active tasks
   * @returns {Array} Array of task info
   */
  getActiveTasks() {
    return Array.from(this.activeTasks.values()).filter(
      task => task.status === 'running'
    );
  }

  /**
   * Get all tasks (including completed)
   * @returns {Array} Array of task info
   */
  getAllTasks() {
    return Array.from(this.activeTasks.values());
  }

  /**
   * Kill all running tasks
   * @param {string} signal - Signal to send
   */
  killAll(signal = 'SIGTERM') {
    logger.info('Killing all tasks', { 
      count: this.activeTasks.size, 
      signal 
    });

    this.activeTasks.forEach((taskInfo, taskId) => {
      if (taskInfo.status === 'running') {
        this.killTask(taskId, signal);
      }
    });
  }

  /**
   * Execute a shell command (for simple operations)
   * @param {string} command
   * @returns {Promise<Object>} Result with stdout, stderr
   */
  async exec(command) {
    return new Promise((resolve, reject) => {
      logger.info('Executing command', { command });

      exec(command, (error, stdout, stderr) => {
        if (error) {
          logger.error('Command execution failed', { 
            command, 
            error: error.message 
          });
          return reject(error);
        }

        resolve({ stdout, stderr });
      });
    });
  }

  /**
   * Check if yazhitite binary exists
   * @returns {Promise<boolean>}
   */
  async checkBinaryExists() {
    const fs = require('fs').promises;
    const binaryPath = path.join(__dirname, '../../yazhitite/build/libation_server');

    try {
      await fs.access(binaryPath, fs.constants.X_OK);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get yazhitite version
   * @returns {Promise<string>} Version string
   */
  async getVersion() {
    try {
      const result = await this.runCommand({
        args: ['--version'],
      });

      return result.stdout.trim();
    } catch (error) {
      logger.error('Failed to get version', { error: error.message });
      return 'unknown';
    }
  }
}

// Singleton instance
const taskRunner = new TaskRunner();

// Cleanup on exit
process.on('exit', () => {
  taskRunner.killAll();
});

process.on('SIGTERM', () => {
  taskRunner.killAll();
  process.exit(0);
});

process.on('SIGINT', () => {
  taskRunner.killAll();
  process.exit(0);
});

module.exports = taskRunner;

