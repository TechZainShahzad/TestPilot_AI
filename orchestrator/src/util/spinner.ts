/**
 * A minimal terminal spinner for long-running async steps (an LLM call
 * "thinking", a tool "doing" something, a full Playwright run) — no
 * dependency, the same "the need is genuinely this small" reasoning
 * `util/logger.ts` already states for itself.
 *
 * No-ops to a plain `await task()` whenever the terminal isn't actually
 * interactive (`isInteractiveTerminal` from `util/logger.ts` — the exact
 * same TTY/NO_COLOR check used for colour, reused here rather than
 * re-derived) so this never writes carriage-return control characters
 * into a captured log file, a pipe, or GitHub Actions' own log capture.
 */
import { isInteractiveTerminal } from './logger.js';

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const INTERVAL_MS = 80;

/** Runs `task`, animating `label` in place while it's pending. Always
 * clears the animated line afterwards (success or failure) — callers are
 * responsible for printing their own persistent result line once this
 * resolves, so the terminal keeps a readable trail instead of nothing but
 * a transient spinner. */
export async function withSpinner<T>(label: string, task: () => Promise<T>): Promise<T> {
  if (!isInteractiveTerminal) {
    return task();
  }

  let frame = 0;
  const render = (): void => {
    const glyph = FRAMES[frame % FRAMES.length] ?? '⠋';
    process.stdout.write(`\r${glyph} ${label}`);
    frame += 1;
  };
  render();
  const timer = setInterval(render, INTERVAL_MS);

  try {
    return await task();
  } finally {
    clearInterval(timer);
    process.stdout.write(`\r${' '.repeat(label.length + 2)}\r`);
  }
}
