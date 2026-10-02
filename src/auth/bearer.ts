export function extractBearerToken(request: Request): string | null {
    const authorization = request.headers.get('authorization');

    if (!authorization) {
        return null;
    }

    // Sanctum tokens are opaque (and can contain `|`), but cannot contain
    // whitespace or unresolved configuration placeholders.
    const match = authorization.match(/^Bearer +([^\s]+)$/i);

    const token = match?.[1];
    return token && !token.includes('${') ? token : null;
}
