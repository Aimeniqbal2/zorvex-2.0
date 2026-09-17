#!/usr/bin/env node
/**
 * scripts/dev.js
 * Unified development process manager for Zorvex ERP 2.0.
 * Concurrently boots:
 *   1. Django REST Backend (0.0.0.0:8000 via local venv)
 *   2. Vite React 2.0 Frontend (http://localhost:5173/app/)
 * Handles graceful cross-platform tree-kill on SIGINT/SIGTERM.
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const rootDir = path.resolve(__dirname, '..');
const frontendDir = path.join(rootDir, 'frontend');
const isWin = process.platform === 'win32';

// 1. Detect Python within project virtual environment
const winVenv = path.join(rootDir, 'venv', 'Scripts', 'python.exe');
const unixVenv = path.join(rootDir, 'venv', 'bin', 'python');

let pythonBin = 'python';
if (isWin && fs.existsSync(winVenv)) {
  pythonBin = winVenv;
} else if (!isWin && fs.existsSync(unixVenv)) {
  pythonBin = unixVenv;
}

console.log('\x1b[36m%s\x1b[0m', '================================================');
console.log('\x1b[36m%s\x1b[0m', '   Zorvex ERP 2.0 — Unified Development Server  ');
console.log('\x1b[36m%s\x1b[0m', '================================================');
console.log(`[Zorvex] Python binary : ${pythonBin}`);
console.log(`[Zorvex] Backend root  : ${rootDir}`);
console.log(`[Zorvex] Frontend root : ${frontendDir}\n`);

// 2. Spawn Django Backend
console.log('\x1b[32m%s\x1b[0m', '-> Spawning Django REST Framework backend on port 8000...');
const djangoProcess = spawn(pythonBin, ['manage.py', 'runserver', '0.0.0.0:8000'], {
  cwd: rootDir,
  stdio: 'inherit',
  shell: isWin,
});

// 3. Spawn Vite Frontend
console.log('\x1b[34m%s\x1b[0m', '-> Spawning Vite React 2.0 development server on port 5173...\n');
const npmBin = isWin ? 'npm.cmd' : 'npm';
const viteProcess = spawn(npmBin, ['run', 'dev'], {
  cwd: frontendDir,
  stdio: 'inherit',
  shell: isWin,
});

// 4. Graceful termination handler
let isShuttingDown = false;
function shutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log('\n\x1b[33m%s\x1b[0m', '[Zorvex] Gracefully stopping all development services...');

  if (isWin) {
    if (djangoProcess.pid) {
      try { spawn('taskkill', ['/pid', String(djangoProcess.pid), '/f', '/t']); } catch (_) {}
    }
    if (viteProcess.pid) {
      try { spawn('taskkill', ['/pid', String(viteProcess.pid), '/f', '/t']); } catch (_) {}
    }
  } else {
    try { djangoProcess.kill('SIGINT'); } catch (_) {}
    try { viteProcess.kill('SIGINT'); } catch (_) {}
  }

  setTimeout(() => {
    process.exit(0);
  }, 1000);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

djangoProcess.on('exit', (code) => {
  if (!isShuttingDown && code !== 0 && code !== null) {
    console.error(`\x1b[31m[Zorvex] Django server terminated unexpectedly with code ${code}\x1b[0m`);
    shutdown();
  }
});

viteProcess.on('exit', (code) => {
  if (!isShuttingDown && code !== 0 && code !== null) {
    console.error(`\x1b[31m[Zorvex] Vite server terminated unexpectedly with code ${code}\x1b[0m`);
    shutdown();
  }
});
