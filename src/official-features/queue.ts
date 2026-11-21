/**
 * 串行队列：同一时刻只执行一个任务，后到的任务按提交顺序排队。
 * 前一个任务失败不影响后续任务；每个提交者拿到自己的结果。
 */

/** 一个串行队列。 */
export interface SerialQueue {
  /** 排队执行一个任务；返回值是该任务的结果。 */
  run<T>(task: () => Promise<T>): Promise<T>;
}

/** 创建串行队列。 */
export function createSerialQueue(): SerialQueue {
  let tail: Promise<unknown> = Promise.resolve();

  return {
    run<T>(task: () => Promise<T>): Promise<T> {
      const result = tail.then(task, task);
      // 队列尾部只关心「上一个任务结束」，失败已由各自的调用者承担。
      tail = result.catch(() => undefined);
      return result;
    },
  };
}
