/**
 * 重启行：网页场景交给启动器换掉当前进程，桌面场景经 explorer 运行 VBS 重开应用。
 * 导出 name、apply，以及路由用到的计划生成、运行形态与重复窗口判定。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { RESTART_ACTION_PATH, RESTART_INFO_PATH } from '../rows.ts';
import type { Context } from '../types.ts';
import { jsonResponse } from '../utils.ts';

/** 行名，与 cordis.patch.yml 的 id 一致。 */
export const name = 'restart-button';

/** 本进程的启动时刻；页面比较它来判断进程代次是否变化。 */
const STARTED_AT = Date.now();

/** 启动器；dist/restart.mjs 与 assets/ 同级。 */
const LAUNCHER_PATH = fileURLToPath(new URL('../assets/launcher.cjs', import.meta.url));

/** 受理后留给响应离开的时间。 */
const EXIT_DELAY = 600;

/** 桌面场景的重复请求窗口：窗口外允许重试。 */
export const DUPLICATE_WINDOW = 15000;

/** 桌面启动器的握手超时。 */
const HELPER_TIMEOUT = 4000;

/** 重启路由的错误码，前端据此选择本地化文案。 */
export type RestartErrorCode = 'restart-pending' | 'helper-failed' | 'restart-failed';

/** 重复请求的说明，放在 message 字段。 */
const DUPLICATE_MESSAGE = 'a restart has already been requested';

/** 桌面启动器未能启动的说明，放在 message 字段。 */
const HELPER_MESSAGE =
  'the restart helper could not be started (Windows Script Host or explorer.exe may be unavailable)';

/**
 * 组装失败回答：错误码加原始说明。
 * @param error - 错误码。
 * @param message - 原始英文说明。
 * @param extra - 其他字段，例如日志路径。
 */
function failure(
  error: RestartErrorCode,
  message: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return { ok: false, error, message, ...extra };
}

/** 宿主 connection 服务里本行用到的部分。 */
export interface ConnectionLike {
  readonly fetch: {
    register(route: {
      readonly path: string;
      readonly methods: string[];
      readonly requestBody: 'buffered';
      readonly fetch: () => Response | Promise<Response>;
    }): () => void;
  };
}

/** 宿主 webServer 服务里本行用到的部分。 */
export interface WebServerLike {
  getOrigin(): string;
}

/** 注入 connection 与 webServer 之后的上下文。 */
type WebContext = Context & {
  readonly connection: ConnectionLike;
  readonly webServer: WebServerLike;
};

/** 判定桌面运行时所需的版本对象。 */
export interface RuntimeVersions {
  readonly electron?: string | undefined;
  readonly [name: string]: string | undefined;
}

/** 重启请求的受理状态：网页只受理一次，桌面窗口按时间过期。 */
export interface RestartState {
  /** 网页场景已受理。 */
  requested: boolean;
  /** 桌面场景最近一次受理的时间，0 表示未受理。 */
  desktopRequestedAt: number;
}

/** 重启计划：拉起同一实例所需的全部输入。 */
export interface RestartPlan {
  readonly binPath: string;
  readonly args: string[];
  readonly cwd: string;
  readonly port: number;
  readonly logPath: string;
}

/** 生成计划时可覆盖的输入，测试据此避开真实 argv 与日志目录。 */
export interface RestartPlanInput {
  readonly argv?: readonly string[];
  readonly cwd?: string;
  readonly logPath?: string;
}

/** 注册路由时可替换的依赖，测试据此避开真实进程与文件操作。 */
export interface RestartOptions {
  /** 运行形态；默认取当前进程环境。 */
  readonly desktop?: boolean;
  /** 当前时间；默认 Date.now。 */
  readonly now?: () => number;
  /** 生成重启计划；默认 restartPlan。 */
  readonly plan?: (webServer: WebServerLike) => RestartPlan;
  /** 拉起网页场景的启动器；默认 detached spawn。 */
  readonly startLauncher?: (plan: RestartPlan) => void;
  /** 受理后安排退出；默认 600ms 后 process.exit(0)。 */
  readonly scheduleExit?: (delayMs: number, exit: () => void) => void;
}

/**
 * 判断是否桌面运行时：Electron 版本与 Node 模式开关同时存在。
 * 桌面外壳给它的 Node 子进程设置 ELECTRON_RUN_AS_NODE。
 */
export function isDesktopRuntime(
  versions: RuntimeVersions = process.versions,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return typeof versions.electron === 'string' && env.ELECTRON_RUN_AS_NODE === '1';
}

/** 当前进程的运行形态，导入时确定一次。 */
export const IS_DESKTOP = isDesktopRuntime();

/** 本次请求是否落在重复窗口内。 */
export function isDuplicateRequest(
  state: RestartState,
  desktop: boolean,
  now: number = Date.now(),
): boolean {
  if (!desktop) return state.requested;
  if (state.desktopRequestedAt === 0) return false;
  return now - state.desktopRequestedAt < DUPLICATE_WINDOW;
}

/** 读取 webServer 的监听端口：显式端口优先，否则按协议取默认值。 */
export function listeningPort(webServer: WebServerLike): number {
  const url = new URL(webServer.getOrigin());
  if (url.port !== '') return Number(url.port);
  return url.protocol === 'https:' ? 443 : 80;
}

/** 本次重启的日志路径；先建目录，失败留给启动器上报。 */
function logPathForRestart(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const directory = path.join(os.homedir(), '.dsh', 'logs');
  try {
    fs.mkdirSync(directory, { recursive: true });
  } catch {
    // 目录缺失由启动器自己的失败行暴露。
  }
  return path.join(directory, `restart-${stamp}.log`);
}

/**
 * 生成重启计划：入口脚本、参数、cwd、端口与日志。
 * 请求到来时才读取，配置重载不会改变已生成的计划。
 */
export function restartPlan(webServer: WebServerLike, input: RestartPlanInput = {}): RestartPlan {
  const argv = input.argv ?? process.argv;
  const bin = argv[1];
  if (bin === undefined) throw new Error('process.argv has no entry script');
  return {
    binPath: path.resolve(bin),
    args: argv.slice(2),
    cwd: input.cwd ?? process.cwd(),
    port: listeningPort(webServer),
    logPath: input.logPath ?? logPathForRestart(),
  };
}

/** 把未知错误转成可读文本。 */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 用 detached 的启动器准备替换进程；父进程退出后启动器继续运行。 */
function spawnLauncher(plan: RestartPlan): void {
  const child = spawn(
    process.execPath,
    [
      LAUNCHER_PATH,
      'web',
      plan.logPath,
      String(process.pid),
      String(plan.port),
      plan.cwd,
      plan.binPath,
      ...plan.args,
    ],
    {
      cwd: plan.cwd,
      detached: true,
      windowsHide: true,
      stdio: 'ignore',
      env: process.env,
    },
  );
  child.on('error', (error: Error) => {
    try {
      fs.appendFileSync(
        plan.logPath,
        `[${new Date().toISOString()}] spawn failed: ${error.stack ?? error}\n`,
      );
    } catch {
      // HTTP 错误回答已经带上日志路径。
    }
  });
  child.unref();
}

/** 让响应先离开，再结束当前进程；定时器不阻止进程退出。 */
function exitLater(delayMs: number, exit: () => void): void {
  const timer = setTimeout(exit, delayMs);
  timer.unref();
}

/** 桌面重启计划：外壳进程、可执行文件与辅助脚本。 */
interface DesktopRestartPlan {
  readonly appPid: number;
  readonly appExe: string;
  readonly port: number;
  readonly logPath: string;
  readonly stateDir: string;
  readonly vbsPath: string;
}

/** 为一个命令行参数加上 VBS 字符串所需的引号。 */
function vbsArgument(value: string): string {
  return `"${String(value).replace(/"/g, '""')}"`;
}

/** explorer.exe 的路径；SystemRoot 缺失时退回默认盘符。 */
function explorerPath(): string {
  const root = process.env.SystemRoot ?? process.env.windir ?? 'C:\\Windows';
  return path.join(root, 'explorer.exe');
}

/** 写 VBS 助手：由 explorer 在交互会话里启动，脱离外壳的进程树。 */
function writeDesktopHelper(
  plan: Pick<DesktopRestartPlan, 'appExe' | 'appPid' | 'logPath' | 'port'>,
  stateDir: string,
): string {
  const vbsPath = path.join(stateDir, 'restart.vbs');
  const command = [
    plan.appExe,
    LAUNCHER_PATH,
    'desktop',
    plan.logPath,
    String(plan.appPid),
    plan.appExe,
    String(plan.port),
    stateDir,
  ]
    .map(vbsArgument)
    .join(' ');
  const script = [
    'Option Explicit',
    'Dim shell',
    'Set shell = CreateObject("WScript.Shell")',
    'shell.Environment("PROCESS")("ELECTRON_RUN_AS_NODE") = "1"',
    `shell.Run ${vbsArgument(command)}, 0, False`,
    '',
  ].join('\r\n');
  // UTF-16LE 带 BOM：Windows Script Host 读取 Unicode 脚本，非 ASCII 路径可原样保留。
  fs.writeFileSync(
    vbsPath,
    Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(script, 'utf16le')]),
  );
  return vbsPath;
}

/** 为一次桌面重启生成临时目录、VBS 与计划。 */
function desktopRestartPlan(webServer: WebServerLike): DesktopRestartPlan {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-restart-'));
  const plan = {
    // 外壳是当前进程的父进程：一个启动了这个 Node 子进程的 Electron 主进程。
    appPid: process.ppid,
    appExe: process.execPath,
    port: listeningPort(webServer),
    logPath: logPathForRestart(),
  };
  return { ...plan, stateDir, vbsPath: writeDesktopHelper(plan, stateDir) };
}

/** 把 VBS 交给 explorer.exe 执行。 */
function startDesktopHelper(plan: DesktopRestartPlan): void {
  const child = spawn(explorerPath(), [plan.vbsPath], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.on('error', (error: Error) => {
    try {
      fs.appendFileSync(
        plan.logPath,
        `[${new Date().toISOString()}] explorer hand-off failed: ${error.stack ?? error}\n`,
      );
    } catch {
      // HTTP 错误回答已经带上日志路径。
    }
  });
  child.unref();
}

/** 等助手写出 alive 标记，证明它已在外壳之外运行。 */
async function waitForHelper(stateDir: string, timeoutMs: number): Promise<boolean> {
  const marker = path.join(stateDir, 'alive');
  const startedAt = Date.now();
  for (;;) {
    try {
      if (fs.readFileSync(marker, 'utf8').trim() !== '') return true;
    } catch {
      // 标记还没写出。
    }
    if (Date.now() - startedAt >= timeoutMs) return false;
    await new Promise((resolve) => setTimeout(resolve, 60));
  }
}

/** 关闭外壳并重新打开；助手失联时撤回请求，让页面保留当前进程。 */
async function restartDesktop(
  webServer: WebServerLike,
  state: RestartState,
  now: () => number,
): Promise<Response> {
  let plan: DesktopRestartPlan;
  try {
    plan = desktopRestartPlan(webServer);
  } catch (error) {
    return jsonResponse(failure('restart-failed', messageOf(error)), 500);
  }
  state.desktopRequestedAt = now();
  try {
    startDesktopHelper(plan);
  } catch (error) {
    state.desktopRequestedAt = 0;
    return jsonResponse(failure('helper-failed', messageOf(error), { logPath: plan.logPath }), 500);
  }
  if (!(await waitForHelper(plan.stateDir, HELPER_TIMEOUT))) {
    // 助手停止任何东西之前会检查这个标记，晚启动的助手不会关掉已拒绝的页面。
    try {
      fs.writeFileSync(path.join(plan.stateDir, 'abort'), 'host withdrew the restart request');
    } catch {
      // 缺少状态目录时助手同样拒绝执行。
    }
    state.desktopRequestedAt = 0;
    return jsonResponse(
      failure('helper-failed', HELPER_MESSAGE, { logPath: plan.logPath, runtime: 'desktop' }),
      500,
    );
  }
  return jsonResponse({
    ok: true,
    pid: process.pid,
    startedAt: STARTED_AT,
    logPath: plan.logPath,
    runtime: 'desktop',
  });
}

/**
 * 注册 info 与 restart 两条路由。
 * @param connection - 宿主 connection 服务。
 * @param webServer - 宿主 webServer 服务，用来读取监听端口。
 * @param options - 可替换依赖，缺省使用真实进程。
 * @returns 卸载函数。
 */
export function registerRestartRoutes(
  connection: ConnectionLike,
  webServer: WebServerLike,
  options: RestartOptions = {},
): () => void {
  const desktop = options.desktop ?? IS_DESKTOP;
  const now = options.now ?? Date.now;
  const buildPlan = options.plan ?? restartPlan;
  const startLauncher = options.startLauncher ?? spawnLauncher;
  const scheduleExit = options.scheduleExit ?? exitLater;
  const state: RestartState = { requested: false, desktopRequestedAt: 0 };

  const disposers = [
    connection.fetch.register({
      path: RESTART_INFO_PATH,
      methods: ['GET'],
      requestBody: 'buffered',
      fetch: () =>
        jsonResponse({
          pid: process.pid,
          startedAt: STARTED_AT,
          runtime: desktop ? 'desktop' : 'web',
        }),
    }),
    connection.fetch.register({
      path: RESTART_ACTION_PATH,
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: async () => {
        if (desktop) {
          if (isDuplicateRequest(state, true, now())) {
            return jsonResponse(failure('restart-pending', DUPLICATE_MESSAGE), 409);
          }
          return restartDesktop(webServer, state, now);
        }
        if (isDuplicateRequest(state, false)) {
          return jsonResponse(failure('restart-pending', DUPLICATE_MESSAGE), 409);
        }
        let plan: RestartPlan;
        try {
          plan = buildPlan(webServer);
        } catch (error) {
          return jsonResponse(failure('restart-failed', messageOf(error)), 500);
        }
        state.requested = true;
        try {
          startLauncher(plan);
        } catch (error) {
          state.requested = false;
          return jsonResponse(failure('restart-failed', messageOf(error)), 500);
        }
        // 让响应先离开；启动器已 detached，并等待当前 pid 消失。
        scheduleExit(EXIT_DELAY, () => process.exit(0));
        return jsonResponse({
          ok: true,
          pid: process.pid,
          startedAt: STARTED_AT,
          logPath: plan.logPath,
          runtime: 'web',
        });
      },
    }),
  ];

  return () => {
    for (const dispose of disposers) void dispose();
  };
}

/**
 * 插件启用时注册重启路由。
 * @param ctx - 宿主上下文。
 */
export function apply(ctx: Context): void {
  ctx.inject(['connection', 'webServer'], (webCtx) => {
    const web = webCtx as WebContext;
    web.effect(
      () => registerRestartRoutes(web.connection, web.webServer),
      'dsh-plugin-practical-tool-bundle: restart routes',
    );
  });
}
