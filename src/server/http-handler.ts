import { createMcpHandler } from '@modelcontextprotocol/server';
import { extractBearerToken } from '../auth/bearer.js';
import type { Logger } from '../logging/index.js';
import { createServer } from './create-server.js';

// Discovery is public; invoice API requests still require a merchant token.
export function createInvoiceMcpHandler(logger: Logger) {
    return createMcpHandler(({ requestInfo }) => createServer({
        accessToken: requestInfo ? extractBearerToken(requestInfo) ?? '' : '',
        logger: logger.child({ component: 'mcp' }),
    }));
}
