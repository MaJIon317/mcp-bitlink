import { z } from 'zod';

export const invoiceIdSchema = z.string().trim().min(1).max(128);

export const amountSchema = z.number().min(1);

export const currencyCodeSchema = z
    .string()
    .trim()
    .min(2)
    .max(16)
    .regex(/^[A-Za-z0-9]+$/)
    .transform((value) => value.toUpperCase());

export const countryCodeSchema = z
    .string()
    .trim()
    .length(3)
    .regex(/^[A-Za-z]{3}$/)
    .transform((value) => value.toUpperCase());
