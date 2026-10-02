import 'dotenv/config';
import { mkdir, readFile, writeFile, chmod } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

try {
    const url = process.env.BITLINK_MCP_URL?.trim();
    if (!url) throw new Error('BITLINK_MCP_URL is required');
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.hash) {
        throw new Error('BITLINK_MCP_URL must be an HTTP(S) URL without credentials or a fragment');
    }
    // Resolve deployment addresses only. User credentials belong to the client
    // and must never be read or embedded by this generator.
    function expand(value) {
        if (typeof value === 'string') {
            return value.replace(/\$\{BITLINK_MCP_URL\}/g, () => url);
        }
        if (Array.isArray(value)) return value.map(expand);
        if (value && typeof value === 'object') {
            return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, expand(entry)]));
        }
        return value;
    }

    const output = resolve(process.argv[2] ?? resolve(root, '.local'));
    await mkdir(output, { recursive: true, mode: 0o700 });
    for (const name of ['mcp.json', '.mcp.json', 'cursor.mcp.json']) {
        const config = expand(JSON.parse(await readFile(resolve(root, name), 'utf8')));
        const target = resolve(output, name);
        await writeFile(target, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
        await chmod(target, 0o600);
    }
    const template = await readFile(resolve(root, '.codex/config.toml.template'), 'utf8');
    await writeFile(resolve(output, 'codex.toml'), template.replace('"${BITLINK_MCP_URL}"', JSON.stringify(url)), { mode: 0o600 });
    console.log('MCP URL configurations generated; user authentication is configured in the client.');
} catch (error) {
    // Do not print URL parsing errors, which can echo supplied credentials.
    console.error(error instanceof TypeError ? 'Invalid BITLINK_MCP_URL' : error.message);
    process.exitCode = 1;
}
