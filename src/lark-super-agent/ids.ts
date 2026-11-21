import { randomBytes } from 'node:crypto';

/** 把本机时间格式化为标识中的时间戳。 */
export function idTimestamp(date: Date = new Date()): string {
  if (Number.isNaN(date.getTime())) throw new Error('id timestamp needs a valid date');
  const pad = (value: number, width = 2) => String(value).padStart(width, '0');
  return [
    pad(date.getFullYear(), 4),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('');
}

/** 可注入的随机十六进制来源，便于确定性测试。 */
export type RandomHex = (bytes: number) => string;

const randomHex: RandomHex = (bytes) => randomBytes(bytes).toString('hex');
const issuedIds = new Set<string>();

/** 生成带本机时间戳的唯一标识；同进程内发生碰撞时重新取随机数。 */
function createId(prefix: 'task' | 'report', bytes: number, date: Date, random: RandomHex): string {
  const stamp = idTimestamp(date);
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const suffix = random(bytes);
    if (!new RegExp(`^[0-9a-f]{${bytes * 2}}$`).test(suffix)) {
      throw new Error(`id random source must return ${bytes * 2} lowercase hexadecimal characters`);
    }
    const id = `${prefix}-${stamp}-${suffix}`;
    if (!issuedIds.has(id)) {
      issuedIds.add(id);
      return id;
    }
  }
  throw new Error(`could not generate a unique ${prefix} id`);
}

/** 生成 task-yyyyMMddHHmmss-4hex。 */
export function createTaskId(date: Date = new Date(), random: RandomHex = randomHex): string {
  return createId('task', 2, date, random);
}

/** 生成 report-yyyyMMddHHmmss-6hex。 */
export function createReportId(date: Date = new Date(), random: RandomHex = randomHex): string {
  return createId('report', 3, date, random);
}

export const generateTaskId = createTaskId;
export const generateReportId = createReportId;
