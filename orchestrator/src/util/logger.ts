/**
 * Minimal structured logger for the orchestrator CLI.
 *
 * Two audiences read orchestrator output: a human watching the pipeline move,
 * and whoever opens `runs/<timestamp>/run.log` afterwards. So every line is
 * written twice — once human-readable to the console, once as JSONL to a sink
 * the run recorder installs. No logging library, because the requirement is
 * genuinely this small and a dependency would be the more surprising choice.
 */

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

const LEVEL_RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/**
 * ANSI colours, suppressed when stdout is not a TTY or NO_COLOR is set.
 * Exported as `colour` so other modules that write directly to the
 * terminal (`util/spinner.ts`, `util/agents-meta.ts`) share this exact
 * TTY/NO_COLOR check rather than each re-deriving their own.
 */
export const isInteractiveTerminal = process.stdout.isTTY && !process.env.NO_COLOR;
const useColour = isInteractiveTerminal;
const ESC = '\u001b';
const paint = (code: number, text: string): string =>
  useColour ? `${ESC}[${String(code)}m${text}${ESC}[0m` : text;

const dim = (text: string): string => paint(2, text);
export const colour = {
  dim,
  bold: (text: string): string => paint(1, text),
};

const LEVEL_STYLE: Record<LogLevel, (text: string) => string> = {
  debug: (t) => paint(90, t),
  info: (t) => paint(36, t),
  warn: (t) => paint(33, t),
  error: (t) => paint(31, t),
};

export interface LogRecord {
  ts: string;
  level: LogLevel;
  /** Pipeline stage or agent name, e.g. `planner`. */
  scope: string;
  msg: string;
  /** Arbitrary structured detail; appears in the JSONL sink only. */
  data?: Record<string, unknown>;
}

export type LogSink = (record: LogRecord) => void;

const sinks = new Set<LogSink>();

/** Register a sink. Returns a detach function. */
export function addLogSink(sink: LogSink): () => void {
  sinks.add(sink);
  return () => sinks.delete(sink);
}

let threshold: LogLevel = (process.env.LOG_LEVEL as LogLevel | undefined) ?? 'info';

export function setLogLevel(level: LogLevel): void {
  threshold = level;
}

function emit(level: LogLevel, scope: string, msg: string, data?: Record<string, unknown>): void {
  const record: LogRecord = {
    ts: new Date().toISOString(),
    level,
    scope,
    msg,
    ...(data && { data }),
  };

  // Sinks always receive the record, even below the console threshold: the
  // on-disk log is the forensic artifact and should never be lossy.
  for (const sink of sinks) sink(record);

  if (LEVEL_RANK[level] < LEVEL_RANK[threshold]) return;

  const stamp = dim(record.ts.slice(11, 19));
  const tag = LEVEL_STYLE[level](level.toUpperCase().padEnd(5));
  const where = dim(`[${scope}]`);
  const line = `${stamp} ${tag} ${where} ${msg}`;

  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export interface Logger {
  debug(msg: string, data?: Record<string, unknown>): void;
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
  /** Derive a logger for a nested scope, e.g. `agent:healer`. */
  child(scope: string): Logger;
}

export function createLogger(scope: string): Logger {
  return {
    debug: (msg, data) => {
      emit('debug', scope, msg, data);
    },
    info: (msg, data) => {
      emit('info', scope, msg, data);
    },
    warn: (msg, data) => {
      emit('warn', scope, msg, data);
    },
    error: (msg, data) => {
      emit('error', scope, msg, data);
    },
    child: (nested) => createLogger(`${scope}:${nested}`),
  };
}

/** Headline used for stage transitions — easy to scan in a long run. */
export function banner(text: string): void {
  const rule = '─'.repeat(Math.max(0, 68 - text.length));
  console.log(`\n${paint(1, text)} ${dim(rule)}`);
}
