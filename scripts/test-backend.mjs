import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, randomBytes } from 'node:crypto';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';

// An isolated contract test: never uses the backend's configured database or keys.
const backend = resolve(process.env.LARAVEL_PROJECT_PATH ?? '../crypto');
assert(existsSync(join(backend, 'artisan')), 'Set LARAVEL_PROJECT_PATH to the Laravel project');
const folder = mkdtempSync(join(tmpdir(), 'bitlink-laravel-contract-'));
let php;
let mcp;
let store;
const originalNow = Date.now;
async function freePort() {
    const server = createServer();
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    await new Promise(resolve => server.close(resolve));
    return port;
}
function phpRun(args, env, cwd = backend) {
    const result = spawnSync('php', args, { env, cwd, encoding: 'utf8', timeout: 60_000 });
    if (result.status !== 0) throw new Error(`Isolated Laravel command failed: ${result.stderr || result.stdout}`);
    return result.stdout.trim();
}
async function json(response) {
    assert.equal(response.status, 200, `Unexpected HTTP ${response.status}`);
    return response.json();
}
try {
    const apiOrigin = `http://127.0.0.1:${await freePort()}`;
    const mcpPort = await freePort();
    const issuer = `http://127.0.0.1:${mcpPort}`;
    const resource = `${issuer}/mcp`;
    const callback = 'http://127.0.0.1:43210/callback';
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        publicKeyEncoding: { type: 'spki', format: 'pem' },
    });
    writeFileSync(join(folder, 'private.key'), privateKey, { mode: 0o600 });
    writeFileSync(join(folder, 'public.key'), publicKey, { mode: 0o600 });
    writeFileSync(join(folder, 'database.sqlite'), '');
    const phpEnv = {
        ...process.env,
        APP_ENV: 'testing', APP_DEBUG: 'false', APP_KEY: `base64:${randomBytes(32).toString('base64')}`,
        APP_URL: apiOrigin, APP_DOMAIN: '127.0.0.1', APP_AUTH_URL: apiOrigin, APP_API_URL: `${apiOrigin}/api`,
        APP_CONFIG_CACHE: join(folder, 'config.php'), APP_ROUTES_CACHE: join(folder, 'routes.php'),
        DB_CONNECTION: 'sqlite', DB_DATABASE: join(folder, 'database.sqlite'), DB_URL: '',
        PASSPORT_CONNECTION: 'sqlite', CLICKHOUSE_ENABLED: 'false',
        SESSION_DRIVER: 'array', CACHE_STORE: 'array', QUEUE_CONNECTION: 'sync', LOG_CHANNEL: 'stderr',
        SANDBOX_ENABLED: 'false', TELESCOPE_ENABLED: 'false', NIGHTWATCH_ENABLED: 'false', PULSE_ENABLED: 'false',
        PASSPORT_PRIVATE_KEY: `file://${join(folder, 'private.key')}`,
        PASSPORT_PUBLIC_KEY: `file://${join(folder, 'public.key')}`,
        CONTRACT_CALLBACK: `${issuer}/oauth/callback`, CONTRACT_FIXTURE: join(folder, 'fixture.json'),
    };
    phpRun(['artisan', 'migrate', '--force', '--no-interaction'], phpEnv);
    const bootstrap = String.raw`require ${JSON.stringify(join(backend, 'vendor/autoload.php'))}; $app = require ${JSON.stringify(join(backend, 'bootstrap/app.php'))}; $app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();`;
    const seedPath = join(folder, 'seed.php');
    writeFileSync(seedPath, String.raw`<?php
${bootstrap}
Illuminate\Support\Facades\Event::fake();
App\Modules\Platform\Models\Country::query()->create(['name' => 'Fixture country', 'iso_code' => 'DE', 'phone' => '+49', 'is_active' => true, 'is_default' => true]);
$user = App\Modules\Identity\Models\User::factory()->create(['email_verified_at' => now(), 'is_blocked' => false]);
$client = app(Laravel\Passport\ClientRepository::class)->createAuthorizationCodeGrantClient('Isolated MCP contract', [getenv('CONTRACT_CALLBACK')], false);
file_put_contents(getenv('CONTRACT_FIXTURE'), json_encode(['user' => $user->id, 'client' => $client->id]));
`);
    const seedOutput = phpRun([seedPath], phpEnv);
    assert(existsSync(phpEnv.CONTRACT_FIXTURE), seedOutput || "Laravel fixture was not created");
    const fixture = JSON.parse(readFileSync(phpEnv.CONTRACT_FIXTURE, 'utf8'));
    const approvePath = join(folder, 'approve.php');
    writeFileSync(approvePath, String.raw`<?php
${bootstrap}
$fixture = json_decode(file_get_contents(getenv('CONTRACT_FIXTURE')), true);
parse_str(parse_url($argv[1], PHP_URL_QUERY), $query);
$request = (new GuzzleHttp\Psr7\ServerRequest('GET', $argv[1]))->withQueryParams($query);
$auth = app(League\OAuth2\Server\AuthorizationServer::class)->validateAuthorizationRequest($request);
$auth->setUser(new Laravel\Passport\Bridge\User($fixture['user']));
$response = app(App\Modules\OAuth\Services\AuthorizationApprovalService::class)->approve($auth, new GuzzleHttp\Psr7\Response);
echo $response->getHeaderLine('Location');
`);
    const router = join(backend, 'vendor/laravel/framework/src/Illuminate/Foundation/resources/server.php');
    php = spawn('php', ['-S', apiOrigin.slice(7), router], { env: phpEnv, cwd: join(backend, 'public'), stdio: 'ignore' });
    let ready = false;
    for (let attempt = 0; attempt < 50; attempt++) {
        try {
            const response = await fetch(`${apiOrigin}/.well-known/oauth-authorization-server`);
            if (response.ok) { ready = true; break; }
        } catch { /* Wait for the local PHP process to bind its port. */ }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert(ready, 'Isolated Laravel HTTP server did not start');
    const metadata = await json(await fetch(`${apiOrigin}/.well-known/oauth-authorization-server`));
    assert.equal(metadata.issuer, apiOrigin);
    const { OAuthStore } = await import('../dist/src/auth/store.js');
    const { OAuthService } = await import('../dist/src/auth/oauth.js');
    store = new OAuthStore(join(folder, 'oauth.sqlite'), randomBytes(32));
    const oauth = new OAuthService({
        publicUrl: resource, upstreamUrl: apiOrigin, upstreamClientId: fixture.client,
        clients: { contract: { redirectUris: [callback] } }, store,
    });
    Object.assign(process.env, {
        AUTH_MODE: 'oauth', BITLINK_MCP_URL: resource, CRYPTO_API_BASE_URL: `${apiOrigin}/api/v1`,
        MCP_DISABLED_TOOLS: '', LOG_LEVEL: 'error',
    });
    const { createHttpServer } = await import('../dist/src/http.js');
    mcp = createHttpServer({ oauth });
    await new Promise(resolve => mcp.listen(mcpPort, '127.0.0.1', resolve));
    const verifier = randomBytes(32).toString('base64url');
    const query = new URLSearchParams({
        client_id: 'contract', redirect_uri: callback, resource, response_type: 'code', state: 'contract-state',
        code_challenge_method: 'S256', code_challenge: createHash('sha256').update(verifier).digest('base64url'),
        scope: 'invoices.read',
    });
    const authorization = await fetch(`${issuer}/oauth/authorize?${query}`, { redirect: 'manual' });
    assert.equal(authorization.status, 302);
    const upstreamAuthorization = authorization.headers.get('location');
    assert.equal(new URL(upstreamAuthorization).origin, apiOrigin);
    // Consent is approved only for the fixture user in the disposable database.
    const upstreamCallback = phpRun([approvePath, upstreamAuthorization], phpEnv);
    const callbackResponse = await fetch(upstreamCallback, { redirect: 'manual' });
    assert.equal(callbackResponse.status, 302);
    const downstream = new URL(callbackResponse.headers.get('location'));
    assert.equal(downstream.searchParams.get('state'), 'contract-state');
    const tokens = await json(await fetch(`${issuer}/oauth/token`, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: 'contract', resource, grant_type: 'authorization_code',
            code: downstream.searchParams.get('code'), redirect_uri: callback, code_verifier: verifier }),
    }));
    async function rpc(name, args = {}) {
        const response = await fetch(resource, {
            method: 'POST', headers: { Authorization: `Bearer ${tokens.access_token}`,
                'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-03-26' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
        });
        assert.equal(response.status, 200);
        const text = await response.text();
        const line = text.split('\n').find(value => value.startsWith('data:'));
        const result = JSON.parse(line ? line.slice(5) : text);
        assert(!result.result?.isError, 'MCP tool returned an error');
        assert(!result.error, 'MCP RPC returned an error');
        return result.result.structuredContent;
    }
    assert.equal((await rpc('get_me')).id, fixture.user);
    assert.deepEqual((await rpc('list_merchants')).merchants, []);
    const original = await oauth.authenticate(tokens.access_token);
    Date.now = () => originalNow() + 880_000;
    const refreshed = await Promise.all([oauth.authenticate(tokens.access_token), oauth.authenticate(tokens.access_token)]);
    assert(refreshed.every(value => value && value.upstreamToken !== original.upstreamToken));
    assert.equal(refreshed[0].upstreamToken, refreshed[1].upstreamToken);
    Date.now = originalNow;
    assert.equal((await rpc('get_me')).id, fixture.user);
    console.log('PASS: actual Laravel discovery, Passport code + PKCE exchange, MCP get_me/list_merchants, and serialized refresh.');
    console.log('All users, tokens, keys and databases used by this check were temporary.');
} finally {
    Date.now = originalNow;
    if (mcp) await new Promise(resolve => { mcp.close(resolve); mcp.closeAllConnections(); });
    if (php && php.exitCode === null) {
        php.kill('SIGTERM');
        await new Promise(resolve => php.once('exit', resolve));
    }
    store?.close();
    rmSync(folder, { recursive: true, force: true });
}
