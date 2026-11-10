import 'dotenv/config';

function required(name) {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`${name} is required`);
    return value;
}

async function jsonRequest(url) {
    const response = await fetch(url, {
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
        headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`Backend discovery returned HTTP ${response.status}`);
    return response.json();
}

try {
    const issuer = new URL(required('BITLINK_OAUTH_BASE_URL')).origin;
    const publicUrl = new URL(required('BITLINK_MCP_URL'));
    required('BITLINK_OAUTH_CLIENT_ID');
    const metadata = await jsonRequest(new URL('/.well-known/oauth-authorization-server', issuer));
    if (metadata.issuer !== issuer
        || metadata.authorization_endpoint !== `${issuer}/oauth/authorize`
        || metadata.token_endpoint !== `${issuer}/oauth/token`
        || !metadata.response_types_supported?.includes('code')
        || !metadata.code_challenge_methods_supported?.includes('S256')
        || !['authorization_code', 'refresh_token'].every(grant => metadata.grant_types_supported?.includes(grant))
        || !['invoices.read', 'invoices.create'].every(scope => metadata.scopes_supported?.includes(scope))) {
        throw new Error('Backend OAuth metadata does not match the MCP Passport configuration');
    }
    console.log('Backend OAuth discovery and required scopes: OK');
    const api = required('CRYPTO_API_BASE_URL').replace(/\/+$/, '');
    const me = `${api}${api.endsWith('/v1') ? '' : '/v1'}/me`;
    const response = await fetch(me, {
        redirect: 'error', signal: AbortSignal.timeout(10_000), headers: { Accept: 'application/json' },
    });
    if (response.status !== 401) throw new Error(`Unauthenticated API /me returned HTTP ${response.status}, expected 401`);
    console.log('Backend API route and authentication challenge: OK');
    console.log(`Passport client callback must be: ${publicUrl.origin}/oauth/callback`);
    console.log('This checks connectivity and metadata; a browser login is still needed to verify the registered client and consent.');
} catch (error) {
    console.error(error instanceof Error ? error.message : 'Backend check failed');
    process.exitCode = 1;
}
