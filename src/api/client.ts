import { ApiError, ApiNetworkError, ApiTimeoutError } from './errors.js';
import type { ApiErrorBody } from './types.js';
import type { Logger } from '../logging/index.js';
import { createNoopLogger } from '../logging/index.js';

export interface ApiClientConfig {
    baseUrl: string;
    accessToken: string;
    timeoutMs: number;
    logger?: Logger;
}

export type QueryParams = Record<
    string,
    string | number | boolean | undefined | null
>;

export class ApiClient {
    private readonly logger: Logger;

    public constructor(private readonly config: ApiClientConfig) {
        this.logger = config.logger ?? createNoopLogger();
    }

    public get<T>(path: string, query?: QueryParams): Promise<T> {
        return this.request<T>('GET', this.withQuery(path, query));
    }

    public post<T>(path: string, body: unknown): Promise<T> {
        return this.request<T>('POST', path, body);
    }

    private withQuery(path: string, query?: QueryParams): string {
        if (!query) {
            return path;
        }

        const params = new URLSearchParams();

        for (const [key, value] of Object.entries(query)) {
            if (value === undefined || value === null || value === '') {
                continue;
            }

            params.set(key, String(value));
        }

        const serialized = params.toString();

        if (!serialized) {
            return path;
        }

        return `${path}${path.includes('?') ? '&' : '?'}${serialized}`;
    }

    private async request<T>(
        method: 'GET' | 'POST',
        path: string,
        body?: unknown,
    ): Promise<T> {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
        const url = `${this.config.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;

        this.logger.debug('API request started', { method, path });

        try {
            const response = await fetch(url, {
                method,
                signal: controller.signal,
                headers: {
                    Accept: 'application/json',
                    Authorization: `Bearer ${this.config.accessToken}`,
                    ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
                },
                ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            });

            const payload = await this.parseJson(response);

            if (!response.ok) {
                const error = payload as ApiErrorBody | null;

                this.logger.warn('API request failed', {
                    method,
                    path,
                    status: response.status,
                    code: error?.error?.code,
                    message: error?.message,
                });

                throw new ApiError(
                    error?.message ?? `API returned HTTP ${response.status}`,
                    response.status,
                    error?.error?.code,
                    error?.errors,
                );
            }

            this.logger.debug('API request succeeded', {
                method,
                path,
                status: response.status,
            });

            return payload as T;
        } catch (error) {
            if (error instanceof ApiError) {
                throw error;
            }

            if (error instanceof DOMException && error.name === 'AbortError') {
                this.logger.error('API request timed out', { method, path });
                throw new ApiTimeoutError();
            }

            this.logger.error('API request network error', {
                method,
                path,
                message: error instanceof Error ? error.message : String(error),
            });

            throw new ApiNetworkError(
                error instanceof Error ? error.message : undefined,
            );
        } finally {
            clearTimeout(timeout);
        }
    }

    private async parseJson(response: Response): Promise<unknown> {
        const text = await response.text();

        if (!text) {
            return null;
        }

        try {
            return JSON.parse(text);
        } catch {
            throw new ApiError(
                'API returned invalid JSON',
                response.status,
                'INVALID_JSON',
            );
        }
    }
}
