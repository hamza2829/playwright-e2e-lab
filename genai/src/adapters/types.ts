import type { Story } from '../story.ts';

export interface DraftRequest {
  story: Story;
  prompt: string;
}

/** A "model" that turns a prompt (plus the parsed story) into raw text containing a ```ts block. */
export interface DraftAdapter {
  readonly name: string;
  /** Free-form description for reports, e.g. model id and settings. */
  readonly description: string;
  generate(request: DraftRequest): Promise<string>;
}
