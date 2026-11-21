/**
 * 前端字典与命名空间：清理会话、重启按钮与官方功能开关的全部文案。
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
  'count.waiting': '正在读取会话…',
  run: '清理',
  runConfirm: '再点一次确认',
  busy: '清理中…',
  close: '关闭',
  hint: '未置顶的会话会被归档，已归档的会话会被永久删除。运行中和打开着的会话会跳过。删除后无法恢复。',
  'result.archived': '已归档 {n} 个',
  'result.deleted': '已删除 {n} 个',
  'result.skipped': '跳过 {n} 个打开中的会话',
  'result.deferred': '{n} 个将在重启后删除',
  'result.failed': '{n} 个失败',
  'result.error': '清理失败，请稍后重试',
  'result.empty': '没有需要清理的会话',
  'result.notReady': '会话还在加载，请稍后再试',
  'restart.label': '重启 DSH',
  'restart.confirmTitle': '重启 DSH？',
  'restart.confirmText': '进行中的对话会中断。服务恢复后页面自动刷新。',
  'restart.cancel': '取消',
  'restart.ok': '重启',
  'restart.restarting': '正在重启…',
  'restart.restartingHint': '服务恢复后页面自动刷新，请保持此页打开。',
  'restart.slowTitle': '重启比平时慢',
  'restart.slowText': '已等待 {seconds} 秒。页面会继续等待，也可以手动刷新。',
  'restart.elapsed': '已等待 {seconds} 秒',
  'restart.reload': '刷新页面',
  'restart.failedTitle': '重启失败',
  'restart.close': '关闭',
  'restart.retry': '重试',
  'restart.log': '日志：{path}',
  'restart.error.duplicate': '已经在重启中。',
  'restart.error.helper': '无法启动重启程序。',
  'restart.error.unknown': '重启请求失败，请稍后重试。',
  'restart.desktopLabel': '重启应用',
  'restart.desktopConfirmTitle': '重启 DeepSeek Harness？',
  'restart.desktopConfirmText': '应用会关闭并自动重新打开。进行中的对话会中断。',
  'restart.desktopRestarting': '正在重启应用…',
  'restart.desktopRestartingHint': '应用会自动重新打开，请不要手动结束进程。',
  'restart.desktopSlowTitle': '应用还没有重新打开',
  'restart.desktopSlowText':
    '已等待 {seconds} 秒。窗口没有出现时，请从开始菜单打开 DeepSeek Harness。',
  'restart.desktopStale': '重启按钮在下次启动后可用。请先手动退出并重新打开应用。',
  'officialFeatures.title': '官方功能开关',
  'officialFeatures.hint': '更改只影响之后新建的会话，已有数据保留。',
  'officialFeatures.summary': '逐项开关五个官方功能',
  'officialFeatures.loading': '正在读取…',
  'officialFeatures.loadFailed': '读取功能状态失败',
  'officialFeatures.busy': '正在切换…',
  'officialFeatures.retry': '重试',
  'officialFeatures.error.store': '切换失败：设置没有保存。',
  'officialFeatures.error.apply': '切换失败：DSH 没有接受这次更改。',
  'officialFeatures.error.unknown': '切换失败，请稍后重试。',
  'officialFeatures.feature.schedule': '自动化任务',
  'officialFeatures.feature.goal': '目标',
  'officialFeatures.feature.task': '任务清单',
  'officialFeatures.feature.plan': '计划模式',
  'officialFeatures.feature.present': '交付文件',
  'officialFeatures.detail.schedule': '关闭后定时任务停止运行，任务页面隐藏。已有任务保留。',
  'officialFeatures.detail.goal': '关闭后不能使用 /goal，输入框上方的目标条隐藏。',
  'officialFeatures.detail.task': '关闭后模型不再维护任务清单。',
  'officialFeatures.detail.plan': '关闭后不能使用 /plan 进入计划模式。',
  'officialFeatures.detail.present': '关闭后模型不再以文件卡片交付成果。变更文件卡片保留。',
} as const;

/** 英文字典，键集与中文一致。 */
export const en: Record<PracticalToolKey, string> = {
  'action.label': 'Sweep sessions',
  'panel.title': 'Sweep sessions',
  'scope.all': 'All sessions',
  count: '{unpinned} unpinned · {archived} archived',
  'count.waiting': 'Loading sessions…',
  run: 'Sweep',
  runConfirm: 'Click again to confirm',
  busy: 'Sweeping…',
  close: 'Close',
  hint: 'Unpinned sessions are archived and archived sessions are permanently deleted. Running and open sessions are skipped. Deleted sessions cannot be restored.',
  'result.archived': 'Archived {n}',
  'result.deleted': 'Deleted {n}',
  'result.skipped': 'Skipped {n} open',
  'result.deferred': '{n} deleted after restart',
  'result.failed': '{n} failed',
  'result.error': 'Sweep failed. Try again later.',
  'result.empty': 'Nothing to sweep',
  'result.notReady': 'Sessions are still loading. Try again in a moment.',
  'restart.label': 'Restart DSH',
  'restart.confirmTitle': 'Restart DSH?',
  'restart.confirmText':
    'Running conversations will stop. The page reloads when the service is back.',
  'restart.cancel': 'Cancel',
  'restart.ok': 'Restart',
  'restart.restarting': 'Restarting…',
  'restart.restartingHint': 'The page reloads when the service is back. Keep this page open.',
  'restart.slowTitle': 'Restart is taking longer',
  'restart.slowText': 'Waited {seconds}s. The page keeps waiting, or you can reload now.',
  'restart.elapsed': 'Waited {seconds}s',
  'restart.reload': 'Reload page',
  'restart.failedTitle': 'Restart failed',
  'restart.close': 'Close',
  'restart.retry': 'Retry',
  'restart.log': 'Log: {path}',
  'restart.error.duplicate': 'A restart is already in progress.',
  'restart.error.helper': "Couldn't start the restart helper.",
  'restart.error.unknown': 'The restart request failed. Try again later.',
  'restart.desktopLabel': 'Restart app',
  'restart.desktopConfirmTitle': 'Restart DeepSeek Harness?',
  'restart.desktopConfirmText': 'The app closes and opens again. Running conversations will stop.',
  'restart.desktopRestarting': 'Restarting the app…',
  'restart.desktopRestartingHint': "The app opens again by itself. Don't end the process manually.",
  'restart.desktopSlowTitle': "The app hasn't reopened yet",
  'restart.desktopSlowText':
    "Waited {seconds}s. If the window doesn't appear, open DeepSeek Harness from the Start menu.",
  'restart.desktopStale':
    'The restart button works after the next launch. Quit and reopen the app once.',
  'officialFeatures.title': 'Official feature switches',
  'officialFeatures.hint': 'Changes apply to new sessions. Existing data is kept.',
  'officialFeatures.summary': 'Turn five official features on or off',
  'officialFeatures.loading': 'Loading…',
  'officialFeatures.loadFailed': "Couldn't load feature status",
  'officialFeatures.busy': 'Switching…',
  'officialFeatures.retry': 'Retry',
  'officialFeatures.error.store': "Switch failed: the setting wasn't saved.",
  'officialFeatures.error.apply': "Switch failed: DSH didn't accept the change.",
  'officialFeatures.error.unknown': 'Switch failed. Try again later.',
  'officialFeatures.feature.schedule': 'Schedule',
  'officialFeatures.feature.goal': 'Goal',
  'officialFeatures.feature.task': 'Task list',
  'officialFeatures.feature.plan': 'Plan mode',
  'officialFeatures.feature.present': 'Present files',
  'officialFeatures.detail.schedule':
    'When off, scheduled tasks stop running and the Schedule page is hidden. Existing tasks are kept.',
  'officialFeatures.detail.goal': 'When off, /goal and the goal bar above the composer are gone.',
  'officialFeatures.detail.task': 'When off, the model no longer keeps a task list.',
  'officialFeatures.detail.plan': 'When off, /plan and plan mode are gone.',
  'officialFeatures.detail.present':
    'When off, the model no longer hands over files as cards. Changed-file cards stay.',
};

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** 本插件前端文案，键集取自中文字典。 */
    'dsh-plugin-practical-tool-bundle': PracticalToolKey;
  }
}

/** 本插件前端可用的字典键。 */
export type PracticalToolKey = keyof typeof zh;
