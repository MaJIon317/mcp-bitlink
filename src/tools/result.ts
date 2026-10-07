import { env } from '../config/env.js';
import {
    ApiError,
    ApiNetworkError,
    ApiTimeoutError,
    UnexpectedResponseError,
} from '../api/errors.js';
import type { Logger } from '../logging/index.js';

export function successResult(data: unknown) {
    return {
        content: [
            {
                type: 'text' as const,
                text: JSON.stringify(data, null, 2),
            },
        ],
        structuredContent: data as Record<string, unknown>,
    };
}

export function publicErrorMessage(error: unknown): string {
    if (error instanceof ApiTimeoutError) {
        return 'The payment API request timed out. Please try again.';
    }

    if (error instanceof ApiNetworkError) {
        return 'Unable to reach the payment API. Please try again later.';
    }

    if (error instanceof UnexpectedResponseError) {
        return 'The payment API returned an unexpected response.';
    }

    if (error instanceof ApiError) {
        if (error.status >= 500) {
            return 'The payment API is temporarily unavailable. Please try again later.';
        }

        if (error.status === 401) {
            return 'Authentication failed. Reconnect your Bitlink account.';
        }

        if (error.status === 403) {
            return 'Access denied for this account or merchant.';
        }

        if (error.status === 404) {
            return error.message || 'Requested resource was not found.';
        }

        if (error.status === 422 || error.status === 400) {
            return error.message || 'Request validation failed.';
        }

        return error.message || `Payment API request failed (HTTP ${error.status}).`;
    }

    return 'Unexpected error while processing the request.';
}

function serializeError(error: unknown): Record<string, unknown> {
    if (error instanceof ApiError) {
        return {
            name: error.name,
            message: error.message,
            status: error.status,
            code: error.code,
            details: error.details,
            stack: error.stack,
        };
    }

    if (error instanceof UnexpectedResponseError) {
        return {
            name: error.name,
            message: error.message,
            details: error.details,
            stack: error.stack,
        };
    }

    if (error instanceof Error) {
        return {
            name: error.name,
            message: error.message,
            stack: error.stack,
        };
    }

    return {
        message: String(error),
    };
}

export function errorResult(
    logger: Logger,
    error: unknown,
    context: Record<string, unknown> = {},
) {
    const message = publicErrorMessage(error);

    logger.error('Tool request failed', {
        ...context,
        publicMessage: message,
        error: serializeError(error),
    });

    return {
        isError: true,
        ...(error instanceof ApiError && error.status === 401 && env.AUTH_MODE === 'oauth' && env.BITLINK_MCP_URL
            ? { _meta: { 'mcp/www_authenticate': [
                `Bearer resource_metadata="${new URL('/.well-known/oauth-protected-resource/mcp', env.BITLINK_MCP_URL).href}", error="invalid_token", error_description="Please reconnect your Bitlink account"`,
            ] } } : {}),
        content: [
            {
                type: 'text' as const,
                text: message,
            },
        ],
    };
}
