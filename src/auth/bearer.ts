export function extractBearerToken(request: Request): string | null {
    const authorization = request.headers.get('authorization');

    if (!authorization) {
        return null;
    }

    // Bearer is the transport for OAuth access tokens and optional legacy API keys.
    // Reject whitespace and unresolved configuration placeholders.
    const match = authorization.match(/^Bearer +([^\s]+)$/i);

    const token = match?.[1];
    return token && !token.includes('${') ? token : null;
}
