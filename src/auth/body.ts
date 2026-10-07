export class BodyTooLargeError extends Error {}

export async function readLimitedBody(request: Request | Response, maxBytes: number): Promise<string> {
    const reader = request.body?.getReader();
    if (!reader) return '';
    const chunks: Uint8Array[] = []; let length = 0;
    try {
        while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            length += chunk.value.length;
            if (length > maxBytes) { void reader.cancel(); throw new BodyTooLargeError(); }
            chunks.push(chunk.value);
        }
        return Buffer.concat(chunks).toString('utf8');
    } finally { reader.releaseLock(); }
}

