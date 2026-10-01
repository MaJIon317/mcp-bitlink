export function extractBearerToken(request: Request): string | null {
    const authorization = request.headers.get('authorization');

    if (!authorization) {
        return null;
    }

    const match = authorization.match(/^Bearer\s+(.+)$/i);

    return match?.[1]?.trim() || null;
}
