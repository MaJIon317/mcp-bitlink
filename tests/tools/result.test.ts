import { describe, expect, it, vi } from 'vitest';
import {
    ApiError,
    ApiNetworkError,
    UnexpectedResponseError,
} from '../../src/api/errors.js';
import { createNoopLogger } from '../../src/logging/index.js';
import { errorResult, publicErrorMessage } from '../../src/tools/result.js';

describe('publicErrorMessage', () => {
    it('keeps validation messages from the API', () => {
        expect(
            publicErrorMessage(
                new ApiError('The amount field is required.', 422, 'VALIDATION_ERROR'),
            ),
        ).toBe('The amount field is required.');
    });

    it('hides internal unexpected errors', () => {
        expect(
            publicErrorMessage(new TypeError("Cannot read properties of undefined (reading 'map')")),
        ).toBe('Unexpected error while processing the request.');
    });

    it('maps infrastructure failures to clear messages', () => {
        expect(publicErrorMessage(new ApiNetworkError('connect ECONNREFUSED'))).toBe(
            'Unable to reach the payment API. Please try again later.',
        );
        expect(
            publicErrorMessage(new UnexpectedResponseError('bad shape', { foo: 1 })),
        ).toBe('The payment API returned an unexpected response.');
        expect(publicErrorMessage(new ApiError('boom', 503))).toBe(
            'The payment API is temporarily unavailable. Please try again later.',
        );
    });
});

describe('errorResult', () => {
    it('logs internals and returns only the public message', () => {
        const logger = createNoopLogger();
        const errorSpy = vi.spyOn(logger, 'error');

        const result = errorResult(
            logger,
            new TypeError("Cannot read properties of undefined (reading 'map')"),
            { tool: 'list_invoices' },
        );

        expect(result.isError).toBe(true);
        expect(result.content[0]?.text).toBe(
            'Unexpected error while processing the request.',
        );
        expect(errorSpy).toHaveBeenCalledWith(
            'Tool request failed',
            expect.objectContaining({
                tool: 'list_invoices',
                publicMessage: 'Unexpected error while processing the request.',
                error: expect.objectContaining({
                    name: 'TypeError',
                    message: "Cannot read properties of undefined (reading 'map')",
                }),
            }),
        );
    });
});
