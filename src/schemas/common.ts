import { z } from 'zod';

export const invoiceIdSchema = z.preprocess(
    (value) => (typeof value === 'string' ? value.trim() : value),
    z.string().min(1).max(128),
);

export const amountSchema = z.number().min(1);

/** Accepts "usd", "USD ", etc. Normalizes to uppercase alphanumeric code. */
export const currencyCodeSchema = z.preprocess(
    (value) => (typeof value === 'string' ? value.trim().toUpperCase() : value),
    z
        .string()
        .min(2)
        .max(16)
        .regex(/^[A-Z0-9]+$/, 'Currency must be a code like USD or EUR'),
);

export const countryCodeSchema = z.preprocess(
    (value) => (typeof value === 'string' ? value.trim().toUpperCase() : value),
    z
        .string()
        .length(3)
        .regex(/^[A-Z]{3}$/, 'Country must be an ISO 3166-1 alpha-3 code like USA or DEU'),
);

/** Optional string fields: treat "" / null as omitted. */
export function optionalTrimmedString(schema: z.ZodType<string> = z.string().trim().min(1)) {
    return z.preprocess(
        (value) => (value === '' || value === null || value === undefined ? undefined : value),
        schema.optional(),
    );
}

export const optionalEmailSchema = z.preprocess(
    (value) => (value === '' || value === null || value === undefined ? undefined : value),
    z.email().optional(),
);
