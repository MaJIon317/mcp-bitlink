import {
    isLogLevelEnabled,
    type LogAttributes,
    type LogLevel,
    type Logger,
} from './types.js';

export interface ConsoleLoggerOptions {
    name?: string;
    level?: LogLevel;
    bindings?: LogAttributes;
    destination?: Pick<Console, 'debug' | 'info' | 'warn' | 'error'>;
}

export function createConsoleLogger(
    options: ConsoleLoggerOptions = {},
): Logger {
    const name = options.name ?? 'mcp-server';
    const level = options.level ?? 'info';
    const bindings = options.bindings ?? {};
    const destination = options.destination ?? console;

    const write = (
        attempted: LogLevel,
        message: string,
        attributes?: LogAttributes,
    ): void => {
        if (!isLogLevelEnabled(level, attempted)) {
            return;
        }

        const entry = {
            time: new Date().toISOString(),
            level: attempted,
            name,
            msg: message,
            ...bindings,
            ...(attributes ?? {}),
        };

        const line = JSON.stringify(entry);

        switch (attempted) {
            case 'debug':
                destination.debug(line);
                break;
            case 'info':
                destination.info(line);
                break;
            case 'warn':
                destination.warn(line);
                break;
            case 'error':
                destination.error(line);
                break;
        }
    };

    return {
        level,
        child(childBindings) {
            return createConsoleLogger({
                name,
                level,
                destination,
                bindings: {
                    ...bindings,
                    ...childBindings,
                },
            });
        },
        debug(message, attributes) {
            write('debug', message, attributes);
        },
        info(message, attributes) {
            write('info', message, attributes);
        },
        warn(message, attributes) {
            write('warn', message, attributes);
        },
        error(message, attributes) {
            write('error', message, attributes);
        },
    };
}
