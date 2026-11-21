// 串行队列测试：顺序执行、并发提交的最终状态、前一个失败不阻断后续。
import { describe, expect, it } from 'vitest';

import { createSerialQueue } from '../src/official-features/queue.ts';

/** 让出一轮事件循环。 */
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('createSerialQueue', () => {
  it('按提交顺序执行，不重叠', async () => {
    const queue = createSerialQueue();
    const order: string[] = [];
    let active = 0;
    let maxActive = 0;
    const job = (name: string, delay: number) => async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      order.push(`${name}:start`);
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
      order.push(`${name}:end`);
      active -= 1;
      return name;
    };
    const results = await Promise.all([
      queue.run(job('a', 20)),
      queue.run(job('b', 1)),
      queue.run(job('c', 1)),
    ]);
    expect(order).toEqual(['a:start', 'a:end', 'b:start', 'b:end', 'c:start', 'c:end']);
    expect(maxActive).toBe(1);
    expect(results).toEqual(['a', 'b', 'c']);
  });

  it('并发提交时最终状态等于最后一次提交', async () => {
    const queue = createSerialQueue();
    let state = 'off';
    await Promise.all([
      queue.run(async () => {
        await tick();
        state = 'a';
      }),
      queue.run(async () => {
        state = 'b';
      }),
    ]);
    expect(state).toBe('b');
  });

  it('前一个任务失败不影响后续任务，各自拿到自己的结果', async () => {
    const queue = createSerialQueue();
    const first = queue.run(async () => {
      throw new Error('boom');
    });
    const second = queue.run(async () => 'ok');
    await expect(first).rejects.toThrow('boom');
    await expect(second).resolves.toBe('ok');
  });
});
