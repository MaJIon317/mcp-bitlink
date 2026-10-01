import { createMcpHandler } from '@modelcontextprotocol/server';
import { extractBearerToken } from '../auth/bearer.js';
import type { Logger } from '../logging/index.js';
import { createServer } from './create-server.js';

export function createInvoiceHandler(logger: Logger) {
    return createMcpHandler(({ requestInfo }) => createServer({
        // Discovery has no merchant data. Enforce authentication at the API boundary.
        accessToken: (requestInfo ? extractBearerToken(requestInfo) : null) ?? '',
        logger: logger.child({ component: 'mcp' }),
    }), {
        onerror: (error) => logger.error('MCP request failed', {
            message: error instanceof Error ? error.message : String(error),
        }),
    });
}
