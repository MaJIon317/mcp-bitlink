import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().min(1).default('0.0.0.0'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    CRYPTO_API_BASE_URL: z.url().transform((value) => value.replace(/\/+$/, '')),
    CRYPTO_API_TIMEOUT_MS: z.coerce.number().int().positive().max(60_000).default(10_000),
    MCP_SERVER_NAME: z.string().min(1).default('bitlink'),
    MCP_SERVER_VERSION: z.string().min(1).default('0.1.0'),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    /** CORS Access-Control-Allow-Origin. Use * for any origin (Codex/ChatGPT/browser clients). */
    CORS_ORIGIN: z.string().min(1).default('*'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
    console.error(z.prettifyError(parsed.error));
    process.exit(1);
}

export const env = Object.freeze(parsed.data);
