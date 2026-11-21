/**
 * 前端字典与命名空间：清理会话、重启按钮与手机样式的全部文案。
 * 导出 NS、zh、en；中文字典是键集事实源。
 */

/** 前端字典命名空间，与插件名一致。 */
export const NS = 'dsh-plugin-practical-tool-bundle';

/** 中文字典。 */
export const zh = {
  'action.label': '清理会话',
  'panel.title': '清理会话',
  'scope.all': '全部会话',
  count: '未置顶 {unpinned} 个 · 已归档 {archived} 个',
  'count.waiting': '会话分组正在加载…',
  run: '清理',
  runConfirm: '确认清理？',
  busy: '清理中…',
  close: '关闭',
  hint: '清理会先把所有未置顶会话（含未分组的）归档，再永久删除全部已归档会话及其日志；正在运行或仍打开着的会话会跳过，不会被中断。删除不可恢复。',
  'result.archived': '已归档 {n} 个会话',
  'result.deleted': '已删除 {n} 个会话',
  'result.skipped': '跳过 {n} 个（当前打开中）',
  'result.deferred': '{n} 个已归档，日志待重启后删除',
  'result.failed': '{n} 个失败',
  'result.error': '清理请求失败',
  'result.empty': '没有可清理的会话',
  'result.notReady': '会话分组还没加载完，请稍后再试',
  'restart.label': '重启 DSH',
  'restart.confirmTitle': '确认重启 DSH？',
  'restart.confirmText': '当前进行中的对话会被中断；页面会在服务恢复后自动刷新。',
  'restart.cancel': '取消',
  'restart.ok': '确认重启',
  'restart.restarting': '正在重启 DSH…',
  'restart.restartingHint': '服务恢复后页面会自动刷新，请不要关闭此页面。',
  'restart.slowTitle': '重启时间较长',
  'restart.slowText':
    '服务尚未恢复（已等待 {seconds} 秒）。页面会继续等待并自动刷新；也可以立即手动刷新。',
  'restart.elapsed': '已等待 {seconds} 秒',
  'restart.reload': '刷新页面',
  'restart.failedTitle': '重启未完成',
  'restart.close': '关闭',
  'restart.retry': '重试',
  'restart.log': '日志：{path}',
  'restart.desktopLabel': '重启应用',
  'restart.desktopConfirmTitle': '重启 DeepSeek Harness？',
  'restart.desktopConfirmText':
    '应用会完整关闭再重新打开，进行中的对话会被中断；重启后窗口会自动回来。',
  'restart.desktopRestarting': '正在重新启动应用…',
  'restart.desktopRestartingHint':
    '应用会先关闭，随后自动重新打开；请不要手动结束进程，也不需要关闭此窗口。',
  'restart.desktopSlowTitle': '应用还没有重新打开',
  'restart.desktopSlowText':
    '已等待 {seconds} 秒。若窗口没有自行出现，请从开始菜单重新打开 DeepSeek Harness，日志里有完整的关闭与启动记录。',
  'restart.desktopStale':
    '当前应用仍在使用旧版 Host，按钮会在下次启动后生效。请先退出并重新打开 DeepSeek Harness 一次。',
} as const;

/** 英文字典，键集与中文一致。 */
export const en: Record<PracticalToolKey, string> = {
  'action.label': 'Sweep sessions',
  'panel.title': 'Sweep sessions',
  'scope.all': 'All sessions',
  count: '{unpinned} unpinned · {archived} archived',
  'count.waiting': 'Loading sessions…',
  run: 'Sweep',
  runConfirm: 'Confirm sweep?',
  busy: 'Sweeping…',
  close: 'Close',
  hint: 'Sweeping archives every unpinned session (ungrouped ones included) and then deletes every archived session with its logs; running sessions and ones still open are skipped and never interrupted. This cannot be undone.',
  'result.archived': 'Archived {n} sessions',
  'result.deleted': 'Deleted {n} sessions',
  'result.skipped': 'Skipped {n} (currently open)',
  'result.deferred': '{n} archived, logs deleted after restart',
  'result.failed': '{n} failed',
  'result.error': 'The sweep request failed',
  'result.empty': 'Nothing to sweep',
  'result.notReady': 'Sessions are still loading; try again in a moment',
  'restart.label': 'Restart DSH',
  'restart.confirmTitle': 'Restart DSH?',
  'restart.confirmText':
    'Running conversations will be interrupted. The page reloads once the service is back.',
  'restart.cancel': 'Cancel',
  'restart.ok': 'Restart',
  'restart.restarting': 'Restarting DSH…',
  'restart.restartingHint':
    'This page reloads automatically when the service is back. Do not close it.',
  'restart.slowTitle': 'The restart is taking longer',
  'restart.slowText':
    'The service has not come back yet ({seconds}s). This page keeps waiting and reloads automatically; a manual reload is also fine.',
  'restart.elapsed': 'Waited {seconds}s',
  'restart.reload': 'Reload page',
  'restart.failedTitle': 'Restart did not finish',
  'restart.close': 'Close',
  'restart.retry': 'Retry',
  'restart.log': 'Log: {path}',
  'restart.desktopLabel': 'Restart app',
  'restart.desktopConfirmTitle': 'Restart DeepSeek Harness?',
  'restart.desktopConfirmText':
    'The application closes completely and opens again. Running conversations are interrupted; the window comes back by itself.',
  'restart.desktopRestarting': 'Restarting the application…',
  'restart.desktopRestartingHint':
    'The application closes first and opens again by itself. Do not end the process manually or close this window.',
  'restart.desktopSlowTitle': 'The application has not come back',
  'restart.desktopSlowText':
    'Waited {seconds}s. If the window does not appear, open DeepSeek Harness from the Start menu; the log records the whole stop and start.',
  'restart.desktopStale':
    'This app instance still runs the previous Host. Quit and reopen DeepSeek Harness once; the button takes effect from the next launch.',
};

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** 本插件前端文案，键集取自中文字典。 */
    'dsh-plugin-practical-tool-bundle': PracticalToolKey;
  }
}

/** 本插件前端可用的字典键。 */
export type PracticalToolKey = keyof typeof zh;
