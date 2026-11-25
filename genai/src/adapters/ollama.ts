import type { DraftAdapter, DraftRequest } from './types.ts';

/**
 * Local open model served by Ollama (https://ollama.com) on localhost.
 * In CI the "GenAI (local model)" workflow installs Ollama and pulls a small
 * open-weights model at run time: no API key, no account.
 *
 *   OLLAMA_HOST   default http://127.0.0.1:11434
 *   OLLAMA_MODEL  default qwen2.5-coder:1.5b
 */
export class OllamaAdapter implements DraftAdapter {
  readonly name = 'ollama';
  readonly host = process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434';
  readonly model = process.env.OLLAMA_MODEL ?? 'qwen2.5-coder:1.5b';
  readonly description = `Ollama model ${this.model} (temperature 0, seed 42)`;

  async generate({ prompt }: DraftRequest): Promise<string> {
    const res = await fetch(`${this.host}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        prompt,
        stream: false,
        // Deterministic-ish decoding so reruns are comparable.
        options: { temperature: 0, seed: 42, num_predict: 1200, num_ctx: 4096 },
      }),
      signal: AbortSignal.timeout(10 * 60_000),
    });
    if (!res.ok) throw new Error(`Ollama returned ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { response?: string };
    return data.response ?? '';
  }
}
