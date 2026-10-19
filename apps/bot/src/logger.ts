const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Level = keyof typeof LEVELS;

export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  child(scope: string): Logger;
}

export function createLogger(level: string = 'info', scope = 'bot'): Logger {
  const threshold = LEVELS[(level as Level) in LEVELS ? (level as Level) : 'info'];
  const write = (severity: Level, message: string, args: unknown[], childScope: string): void => {
    if (LEVELS[severity] < threshold) return;
    const line = `${new Date().toISOString()} [${severity.toUpperCase()}] [${childScope}] ${message}`;
    if (severity === 'error') console.error(line, ...args);
    else if (severity === 'warn') console.warn(line, ...args);
    else console.log(line, ...args);
  };
  return {
    debug: (message, ...args) => write('debug', message, args, scope),
    info: (message, ...args) => write('info', message, args, scope),
    warn: (message, ...args) => write('warn', message, args, scope),
    error: (message, ...args) => write('error', message, args, scope),
    child: (childScope: string) => createLogger(level, `${scope}:${childScope}`),
  };
}
