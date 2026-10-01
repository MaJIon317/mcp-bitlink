export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogAttributes = Record<string, unknown>;

export interface Logger {
    readonly level: LogLevel;
    child(bindings: LogAttributes): Logger;
    debug(message: string, attributes?: LogAttributes): void;
    info(message: string, attributes?: LogAttributes): void;
    warn(message: string, attributes?: LogAttributes): void;
    error(message: string, attributes?: LogAttributes): void;
}

export const LOG_LEVELS: readonly LogLevel[] = [
    'debug',
    'info',
    'warn',
    'error',
] as const;

export function isLogLevelEnabled(
    configured: LogLevel,
    attempted: LogLevel,
): boolean {
    return LOG_LEVELS.indexOf(attempted) >= LOG_LEVELS.indexOf(configured);
}
