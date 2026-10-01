import type { LogAttributes, LogLevel, Logger } from './types.js';

export function createNoopLogger(level: LogLevel = 'error'): Logger {
    const logger: Logger = {
        level,
        child() {
            return logger;
        },
        debug() {},
        info() {},
        warn() {},
        error(_message: string, _attributes?: LogAttributes) {},
    };

    return logger;
}
