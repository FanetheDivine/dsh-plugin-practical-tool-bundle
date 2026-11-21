// 实机测试 mock provider：无网络，固定回复一条文本。
// 模型：mock-model。用途：让 GUI 能完成一次模型回合，不调用任何工具。
// 每次请求都追加到 profile 目录的 requests.jsonl，供事后核对请求内容。
import { execSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** profile 目录。脚本复制到 profile 目录后运行，env 可覆盖。 */
const root = process.env.RDT_PROFILE_DIR ?? dirname(fileURLToPath(import.meta.url));
const dshPkg =
  process.env.RDT_DSH_PKG ??
  join(execSync('npm root -g', { encoding: 'utf8' }).trim(), '@deepseek-ai', 'dsh', 'package.json');
const require = createRequire(dshPkg);
const { LlmAdapter } = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-llm')));

export const name = 'rdt-mock';
export const inject = ['llm'];

/** 从消息的 text 块拼出纯文本。 */
function textOf(messages) {
  return (messages ?? [])
    .flatMap((message) => message?.content ?? [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text ?? '')
    .join('\n');
}

export function apply(ctx) {
  class Mock extends LlmAdapter {
    providerInfo(id) {
      return { id, name: 'Real device test mock' };
    }
    async listModels(provider) {
      return [{ provider, id: 'mock-model', name: 'mock-model', inputModalities: ['text'] }];
    }
    async resolveModel(provider, model) {
      return { provider, id: model, name: model, inputModalities: ['text'] };
    }
    async *stream(o) {
      if (o.signal?.aborted) {
        yield {
          type: 'finish',
          reason: { kind: 'aborted', failure: { message: 'aborted', code: 'ABORTED' } },
        };
        return;
      }
      try {
        appendFileSync(
          join(root, 'requests.jsonl'),
          `${JSON.stringify(o, (k, v) => (k === 'signal' ? undefined : v))}\n`,
        );
      } catch {
        // 记录失败不影响响应
      }
      const text = 'mock：已收到';
      yield { type: 'block-end', index: 0, block: { type: 'text', text } };
      yield {
        type: 'usage',
        usage: {
          inputTokens: Math.ceil(textOf(o.messages).length / 4) + 1,
          outputTokens: text.length,
        },
      };
      yield { type: 'finish', reason: { kind: 'stop' } };
    }
  }
  const adapter = new Mock();
  ctx.llm.registerAdapter(['mock'], adapter);
}
