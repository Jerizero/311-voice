type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function getLevel(): number {
  const env = (process.env.LOG_LEVEL || 'info').toLowerCase() as LogLevel;
  return LEVELS[env] ?? LEVELS.info;
}

function log(level: LogLevel, ...args: unknown[]): void {
  if (LEVELS[level] >= getLevel()) {
    const prefix = level === 'debug' ? '[DEBUG]' : level === 'warn' ? '[WARN]' : level === 'error' ? '[ERROR]' : '';
    if (prefix) {
      console.log(prefix, ...args);
    } else {
      console.log(...args);
    }
  }
}

export const logger = {
  debug: (...args: unknown[]) => log('debug', ...args),
  info: (...args: unknown[]) => log('info', ...args),
  warn: (...args: unknown[]) => log('warn', ...args),
  error: (...args: unknown[]) => log('error', ...args),
};
