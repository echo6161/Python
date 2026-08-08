export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogContext = Readonly<Record<string, boolean | number | string | null>>;

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, error?: unknown, context?: LogContext): void;
}

function serializeError(error: unknown): LogContext {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessage: error.message,
    };
  }

  return { errorMessage: String(error) };
}

export function createConsoleLogger(scope: string): Logger {
  const write = (level: LogLevel, message: string, context?: LogContext): void => {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      scope,
      message,
      ...(context ? { context } : {}),
    };

    const output = JSON.stringify(entry);
    if (level === 'error') {
      console.error(output);
      return;
    }
    if (level === 'warn') {
      console.warn(output);
      return;
    }
    if (level === 'debug') {
      console.debug(output);
      return;
    }
    console.info(output);
  };

  return {
    debug: (message, context) => write('debug', message, context),
    info: (message, context) => write('info', message, context),
    warn: (message, context) => write('warn', message, context),
    error: (message, error, context) =>
      write('error', message, {
        ...serializeError(error),
        ...context,
      }),
  };
}
