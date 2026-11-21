#!/usr/bin/env node
'use strict';

/**
 * Restart launcher for the Restart Button plugin.
 *
 * Two modes, because the Host is a different animal in each one:
 *
 *   web     <logPath> <targetPid> <port> <cwd> <binPath> [...dshArgs]
 *     The Host is the `dsh` process the user started. Started detached by that
 *     Host, which then exits; waits for it to disappear and for its listening
 *     port to be free, then spawns the replacement `dsh` process and watches it
 *     until it actually owns the port.
 *
 *   desktop <logPath> <appPid> <appExe> <port> <stateDir> [-- ...appArgs]
 *     The Host is a child of the Electron shell, which owns the window and
 *     shows a native recovery dialog (not a restart) whenever that child goes
 *     away. A desktop restart therefore has to stop the shell itself and start
 *     it again. This launcher is started by explorer.exe through a generated
 *     .vbs, so it lives outside the shell's process tree and survives the stop.
 *
 * Log: the file named by the first argument (append mode).
 *
 * Written as CommonJS so it can be launched by path from any Node runtime.
 */
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');

const argv = process.argv.slice(2);
/**
 * `web` and `desktop` name the log file explicitly. Anything else is the
 * argument list of a Host that was loaded before that token existed (the desktop
 * application keeps running the plugin it booted with): such a Host passes the
 * old web arguments and the log path through DSH_RESTART_LOG.
 */
const MODE = argv[0] === 'desktop' || argv[0] === 'web' ? argv[0] : 'legacy-web';
const params = MODE === 'legacy-web' ? argv.slice() : argv.slice(1);
const logPath =
  MODE === 'legacy-web'
    ? (process.env.DSH_RESTART_LOG ?? path.join(os.tmpdir(), 'dsh-restart-launcher.log'))
    : params.shift();

let out;
try {
  out = fs.openSync(logPath, 'a');
} catch (error) {
  process.stderr.write(`restart launcher: cannot open log ${logPath}: ${String(error)}\n`);
  process.exit(1);
}

/** How long the old Host may take to exit after answering the restart request. */
const OLD_EXIT_TIMEOUT = 30000;
/** How long the old listener may linger after the process is gone. */
const PORT_FREE_TIMEOUT = 20000;
/** How long a replacement may take to listen before this helper stops watching. */
const LISTEN_GRACE = 180000;
/** A replacement that dies before listening is respawned this many times. */
const MAX_ATTEMPTS = 3;
const RETRY_DELAY = 1500;
const HEARTBEAT = 15000;
/** Time the Host gets to withdraw the request before the desktop shell is stopped. */
const DESKTOP_HANDSHAKE_GRACE = 2500;
/** How long the desktop shell may take to disappear after taskkill. */
const APP_EXIT_TIMEOUT = 30000;
/** How long a relaunched desktop shell must stay up to count as recovered. */
const APP_START_GRACE = 15000;
/** How long to wait for the old desktop Host port before relaunching anyway. */
const DESKTOP_PORT_GRACE = 10000;

function write(line) {
  fs.writeSync(out, `[${new Date().toISOString()}] ${line}\n`);
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Executable name of a PID, or '' when it cannot be resolved. */
function processName(pid) {
  try {
    const csv = execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 5000,
    });
    const first = csv.trim().split(/\r?\n/)[0] ?? '';
    if (first === '' || first.startsWith('INFO:')) return '';
    const match = first.match(/^"([^"]+)"/);
    return match === null ? '' : match[1];
  } catch {
    return '';
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

//#region web mode
/** True when nothing accepts a loopback connection on the restart port. */
function portFree(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' });
    let settled = false;
    const finish = (free) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(free);
    };
    socket.once('connect', () => finish(false));
    socket.once('error', () => finish(true));
    socket.setTimeout(800, () => finish(true));
  });
}

/** `{ pid, name }` of the process LISTENING on the restart port, or null. */
function portOwner(port) {
  try {
    const table = execFileSync('netstat', ['-ano'], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 8000,
    });
    for (const line of table.split(/\r?\n/)) {
      const columns = line.trim().split(/\s+/);
      if (columns.length < 5) continue;
      if (columns[0].toUpperCase() !== 'TCP') continue;
      if (columns[3].toUpperCase() !== 'LISTENING') continue;
      if (!columns[1].endsWith(`:${port}`)) continue;
      const pid = Number(columns[4]);
      if (!Number.isFinite(pid)) continue;
      const name = processName(pid);
      return { pid, name };
    }
  } catch {
    // Diagnostics only: a failed probe never blocks the restart.
  }
  return null;
}

function describeOwner(owner) {
  if (owner === null) return 'an unidentified process';
  return `pid=${owner.pid}${owner.name === '' ? '' : ` (${owner.name})`}`;
}

async function waitForOldProcess(targetPid) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < OLD_EXIT_TIMEOUT && alive(targetPid)) await sleep(150);
  if (alive(targetPid)) {
    write(
      `old process pid=${targetPid} is still alive after ${OLD_EXIT_TIMEOUT}ms; aborting without spawning`,
    );
    return false;
  }
  write(`old process exited after ${Date.now() - startedAt}ms`);
  return true;
}

async function waitForPortFree(port) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < PORT_FREE_TIMEOUT) {
    if (await portFree(port)) {
      write(`port ${port} released after ${Date.now() - startedAt}ms`);
      return true;
    }
    await sleep(200);
  }
  write(
    `port ${port} still busy after ${PORT_FREE_TIMEOUT}ms (held by ${describeOwner(portOwner(port))}); aborting without spawning`,
  );
  return false;
}

/**
 * Spawn one replacement and watch the port until that exact PID owns it.
 * @returns {'listening' | 'exited' | 'foreign' | 'timeout'}
 */
async function runAttempt(attempt, port, cwd, binPath, dshArgs) {
  const startedAt = Date.now();
  const child = spawn(process.execPath, [binPath, ...dshArgs], {
    cwd,
    detached: true,
    windowsHide: true,
    stdio: ['ignore', out, out],
    env: process.env,
  });
  let exit = null;
  child.once('exit', (code, signal) => {
    exit = { code, signal };
  });
  child.once('error', (error) => {
    write(`replacement spawn error: ${error && error.stack ? error.stack : String(error)}`);
    exit = { code: null, signal: null };
  });
  child.unref();
  write(`replacement spawned pid=${child.pid} attempt=${attempt}/${MAX_ATTEMPTS}`);

  let lastBeat = Date.now();
  for (;;) {
    if (exit !== null) {
      write(
        `replacement pid=${child.pid} exited before listening code=${exit.code} signal=${exit.signal} after ${Date.now() - startedAt}ms`,
      );
      return 'exited';
    }
    if (!(await portFree(port))) {
      const owner = portOwner(port);
      if (owner !== null && owner.pid === child.pid) {
        write(`replacement listening after ${Date.now() - startedAt}ms pid=${child.pid}`);
        return 'listening';
      }
      write(
        `port ${port} is owned by ${describeOwner(owner)}, not by replacement pid=${child.pid}; leaving it alone`,
      );
      return 'foreign';
    }
    if (Date.now() - startedAt > LISTEN_GRACE) {
      write(
        `replacement pid=${child.pid} still not listening after ${LISTEN_GRACE}ms; leaving it running`,
      );
      return 'timeout';
    }
    if (Date.now() - lastBeat > HEARTBEAT) {
      lastBeat = Date.now();
      write(
        `waiting for replacement pid=${child.pid} to listen (${Math.round((Date.now() - startedAt) / 1000)}s)`,
      );
    }
    await sleep(400);
  }
}

async function mainWeb() {
  const [targetPidArg, portArg, cwd, binPath, ...dshArgs] = params;
  const port = Number(portArg);
  const targetPid = Number(targetPidArg);
  write(
    `launcher start mode=${MODE} target=${targetPidArg} port=${portArg} bin=${binPath} cwd=${cwd} args=${JSON.stringify(dshArgs)}`,
  );
  if (!Number.isFinite(port) || port <= 0) {
    write(`invalid port ${JSON.stringify(portArg)}; aborting`);
    process.exit(1);
  }
  if (!(await waitForOldProcess(targetPid))) process.exit(1);
  if (!(await waitForPortFree(port))) process.exit(1);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const outcome = await runAttempt(attempt, port, cwd, binPath, dshArgs);
    if (outcome === 'listening' || outcome === 'foreign' || outcome === 'timeout') {
      write(`launcher done outcome=${outcome}`);
      process.exit(0);
    }
    // The replacement died before listening. Only retry while the port is still
    // free: a listener that appeared meanwhile is another Host, not ours.
    if (!(await portFree(port))) {
      write(`port ${port} is now owned by ${describeOwner(portOwner(port))}; not retrying`);
      process.exit(0);
    }
    if (attempt < MAX_ATTEMPTS) {
      write(`retrying in ${RETRY_DELAY}ms`);
      await sleep(RETRY_DELAY);
    } else {
      write(`giving up after ${MAX_ATTEMPTS} attempts`);
    }
  }
  process.exit(0);
}
//#endregion

//#region desktop mode
/** True when `name` is the executable file `exe` names. */
function sameImage(name, exe) {
  if (name === '') return false;
  return name.toLowerCase() === path.basename(exe).toLowerCase();
}

/** Environment for the relaunched shell: everything except the Node-mode switch. */
function appEnvironment() {
  const env = { ...process.env };
  // The helper itself runs the Electron binary in Node mode; the shell it
  // starts must not, or the window would never open.
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.DSH_DESKTOP_NODE_EXECUTABLE;
  return env;
}

/** Stop the desktop shell and everything it owns. */
function stopApplication(appPid) {
  try {
    execFileSync('taskkill', ['/PID', String(appPid), '/T', '/F'], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 20000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    // The console text of taskkill is localized and arrives in the OEM code page,
    // so the log keeps the exit status instead of the message.
    write(`taskkill pid=${appPid}: exit=0`);
    return true;
  } catch (error) {
    const detail = String(
      error && error.stderr ? error.stderr : error && error.message ? error.message : error,
    ).trim();
    // 128 means the process is already gone, which is the outcome we wanted.
    const status = error && typeof error.status === 'number' ? error.status : null;
    write(`taskkill pid=${appPid} failed status=${status}: ${detail}`);
    return status === 128;
  }
}

async function waitForApplicationExit(appPid) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < APP_EXIT_TIMEOUT && alive(appPid)) await sleep(120);
  if (alive(appPid)) {
    write(
      `desktop shell pid=${appPid} is still alive after ${APP_EXIT_TIMEOUT}ms; not relaunching`,
    );
    return false;
  }
  write(`desktop shell exited after ${Date.now() - startedAt}ms`);
  return true;
}

/**
 * Start one replacement shell and watch it for the recovery window.
 * @returns {'running' | 'exited'}
 */
async function runDesktopAttempt(attempt, appExe, appArgs) {
  const startedAt = Date.now();
  // No argument is replayed from the stopped shell: the relaunch stands for the
  // user opening the application again. In particular the updater's `--updated`
  // marker must not be passed on, or the fresh window would treat itself as an
  // update hand-off.
  const child = spawn(appExe, appArgs, {
    cwd: path.dirname(appExe),
    detached: true,
    windowsHide: false,
    stdio: 'ignore',
    env: appEnvironment(),
  });
  let exit = null;
  child.once('exit', (code, signal) => {
    exit = { code, signal };
  });
  child.once('error', (error) => {
    write(`desktop shell spawn error: ${error && error.stack ? error.stack : String(error)}`);
    exit = { code: null, signal: null };
  });
  child.unref();
  write(`desktop shell spawned pid=${child.pid} attempt=${attempt}/${MAX_ATTEMPTS}`);

  let lastBeat = Date.now();
  while (Date.now() - startedAt < APP_START_GRACE) {
    if (exit !== null) {
      write(
        `desktop shell pid=${child.pid} exited during startup code=${exit.code} signal=${exit.signal} after ${Date.now() - startedAt}ms`,
      );
      return 'exited';
    }
    if (Date.now() - lastBeat >= HEARTBEAT) {
      lastBeat = Date.now();
      write(
        `desktop shell pid=${child.pid} still running (${Math.round((Date.now() - startedAt) / 1000)}s)`,
      );
    }
    await sleep(250);
  }
  write(
    `desktop shell pid=${child.pid} up after ${Date.now() - startedAt}ms; the window should be back`,
  );
  return 'running';
}

function cleanup(stateDir) {
  try {
    fs.rmSync(stateDir, { recursive: true, force: true });
  } catch (error) {
    write(`cleanup of ${stateDir} failed: ${String(error)}`);
  }
}

async function mainDesktop() {
  const [appPidArg, appExe, portArg, stateDir, ...tail] = params;
  const appPid = Number(appPidArg);
  const port = Number(portArg);
  const appArgs = tail[0] === '--' ? tail.slice(1) : tail;
  write(
    `launcher start mode=desktop appPid=${appPidArg} exe=${appExe} port=${portArg} state=${stateDir} args=${JSON.stringify(appArgs)}`,
  );

  if (!Number.isFinite(appPid) || appPid <= 0 || appPid === process.pid) {
    write(`invalid desktop shell pid ${JSON.stringify(appPidArg)}; aborting`);
    process.exit(1);
  }

  // Handshake: the Host has to answer its HTTP request before the shell dies,
  // so announce ourselves and give it time to withdraw the request.
  try {
    fs.writeFileSync(path.join(stateDir, 'alive'), String(process.pid));
  } catch (error) {
    write(`cannot announce the handshake in ${stateDir}: ${String(error)}; aborting`);
    process.exit(1);
  }
  await sleep(DESKTOP_HANDSHAKE_GRACE);
  if (fs.existsSync(path.join(stateDir, 'abort'))) {
    write('host withdrew the restart request; nothing was stopped');
    cleanup(stateDir);
    process.exit(0);
  }

  // Only ever stop the process this restart was requested for.
  const name = processName(appPid);
  if (!sameImage(name, appExe)) {
    write(
      `refusing to stop pid=${appPid}: image=${JSON.stringify(name)} is not ${JSON.stringify(path.basename(appExe))}`,
    );
    cleanup(stateDir);
    process.exit(1);
  }

  if (!stopApplication(appPid)) {
    cleanup(stateDir);
    process.exit(1);
  }
  if (!(await waitForApplicationExit(appPid))) {
    cleanup(stateDir);
    process.exit(1);
  }

  // The Host dies with the shell, but its loopback port may linger for a
  // moment. The replacement picks a fresh port, so this only smooths the log.
  if (Number.isFinite(port) && port > 0) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < DESKTOP_PORT_GRACE && !(await portFree(port))) await sleep(200);
    const released = await portFree(port);
    write(
      `old host port ${port} ${released ? 'released' : 'still busy'} after ${Date.now() - startedAt}ms`,
    );
  }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const outcome = await runDesktopAttempt(attempt, appExe, appArgs);
    if (outcome === 'running') {
      write('launcher done outcome=running');
      cleanup(stateDir);
      process.exit(0);
    }
    if (attempt < MAX_ATTEMPTS) {
      write(`retrying the desktop shell in ${RETRY_DELAY}ms`);
      await sleep(RETRY_DELAY);
    } else {
      write(`giving up after ${MAX_ATTEMPTS} attempts; start the application manually`);
    }
  }
  cleanup(stateDir);
  process.exit(1);
}
//#endregion

const run = MODE === 'desktop' ? mainDesktop : mainWeb;

run().catch((error) => {
  write(`launcher failed: ${error && error.stack ? error.stack : String(error)}`);
  process.exit(1);
});
