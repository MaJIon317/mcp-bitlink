---
name: bitlink-invoices
description: >
  Create, list, and inspect Bitlink payment invoices via the connected Bitlink
  MCP tools. Use when the user asks to create an invoice, check payment status,
  or list invoices.
---

# Bitlink invoices

## Tools

Use the connected Bitlink MCP tools:

- `list_invoices` — paginated list with filters
- `create_invoice` — create an invoice and return `paymentLink`
- `get_invoice` — fetch one invoice by id

## Creating an invoice

Required fields for `create_invoice`:

- `whichWallet`: only `new` or `user`
- `amount` (number ≥ 1)
- `currency` (e.g. `USD`, `EUR`)
- `name`
- `country`

Optional: `email`, `address`, `object`

If the user did not say who the wallet is for, ask in plain language:

> Для нового пользователя или для текущего?

Then set:

- new user/customer → `whichWallet: "new"`
- current/existing user → `whichWallet: "user"`

Do not ask the user to type API field names like `which_wallet`.

## Auth

The MCP connection already carries the merchant Bearer token. Do not invent tokens or URLs.
