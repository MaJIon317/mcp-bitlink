import { describe, expect, it, vi } from 'vitest';
import { createConsoleLogger } from '../../src/logging/index.js';

describe('createConsoleLogger', () => {
    it('respects log level and supports child bindings', () => {
        const destination = {
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        };

        const logger = createConsoleLogger({
            name: 'test',
            level: 'info',
            destination,
        }).child({ component: 'mcp' });

        logger.debug('hidden');
        logger.info('visible', { tool: 'list_invoices' });

        expect(destination.debug).not.toHaveBeenCalled();
        expect(destination.info).toHaveBeenCalledTimes(1);

        const payload = JSON.parse(destination.info.mock.calls[0]?.[0] as string);

        expect(payload).toMatchObject({
            level: 'info',
            name: 'test',
            msg: 'visible',
            component: 'mcp',
            tool: 'list_invoices',
        });
    });
});
