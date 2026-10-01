# bitlink-invoices

MCP gateway for the **Bitlink** payment API. ChatGPT, Codex, and Cursor agents can create, list, and inspect invoices for the authenticated merchant.

The plugin does **not** store a global API key. Invoice tool calls must include a merchant Sanctum token, which is forwarded to Bitlink as `Authorization: Bearer …`.

## Tools

| Tool | Purpose |
|------|---------|
| `list_invoices` | Paginated invoice list with filters (`status`, `currency`, `country`, date range, sort) |
| `create_invoice` | Create an invoice and return its `paymentLink` |
| `get_invoice` | Fetch one invoice by id, including payment status |

### `create_invoice` example

```json
{
  "whichWallet": "new",
  "amount": 100,
  "currency": "EUR",
  "name": "John Doe",
  "country": "DEU",
  "email": "john@example.com",
  "object": "Order #1234"
}
```

`whichWallet` is only `new` or `user` (Bitlink `which_wallet`).  
If the user does not say who it is for, the agent should ask in plain language (new vs current user), then set `new` / `user` itself.

### `list_invoices` example

```json
{
  "page": 1,
  "perPage": 15,
  "status": "pending",
  "sortBy": "created_at",
  "sortDirection": "desc"
}
```

### `get_invoice` example

```json
{
  "invoiceId": "inv_01K..."
}
```

## Authentication

1. Obtain a merchant API token from Bitlink (Sanctum).
2. Send it on every MCP request:

```http
Authorization: Bearer <merchant-api-token>
```

3. The MCP server forwards that token to `CRYPTO_API_BASE_URL` when calling Bitlink REST endpoints (`/api/v1/invoices`, …).

Tokens are never read from `.env`. Only the Bitlink API base URL and server settings live there.

## Install (run the MCP server)

```bash
git clone <your-public-repo-url>
cd mcp-server
cp .env.example .env
npm install
npm run typecheck
npm test
npm run dev
```

Example `.env`:

```dotenv
NODE_ENV=development
HOST=0.0.0.0
PORT=3000
CRYPTO_API_BASE_URL=https://api.example.com/api
CRYPTO_API_TIMEOUT_MS=10000
MCP_SERVER_NAME=bitlink-invoices
MCP_SERVER_VERSION=0.1.0
LOG_LEVEL=info
```

`HOST=0.0.0.0` слушает на всех интерфейсах (нужно для доступа по домену/IP).  
Для только локального доступа: `HOST=127.0.0.1`.

Health check:

```bash
curl http://127.0.0.1:3000/health
```

MCP endpoint (local):

```text
http://127.0.0.1:3000/mcp
```

## Connect from Cursor

### Plugin / cursor.directory

This repo is a Cursor plugin:

- Manifest: `.cursor-plugin/plugin.json`
- MCP config: `.mcp.json` (URL + Bearer via plugin variables)

Configure when installing:

| Variable | Example |
|----------|---------|
| `BITLINK_MCP_URL` | `http://127.0.0.1:3000/mcp` (or your HTTPS deployment) |
| `BITLINK_API_TOKEN` | merchant Sanctum token |

Do **not** publish ephemeral tunnel URLs (`*.trycloudflare.com`) as the plugin homepage. Point the marketplace listing at this **public Git repository** so reviewers can inspect the source.

### Manual `mcp.json` (Cursor)

```json
{
  "mcpServers": {
    "bitlink-invoices": {
      "url": "https://mcp.dev.bitlink.ch/mcp",
      "headers": {
        "Authorization": "Bearer <merchant-api-token>"
      }
    }
  }
}
```

### Agent Plugins (`mcp.json`)

Portable config without secrets (auth remains client-managed):

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
  "mcpServers": {
    "bitlink-invoices": {
      "type": "streamable-http",
      "url": "https://mcp.dev.bitlink.ch/mcp"
    }
  }
}
```

## Upstream Bitlink API

Base path: `/api/v1` (set `CRYPTO_API_BASE_URL` to the `/api` prefix, e.g. `https://api.example.com/api`).

| Method | Path | MCP tool |
|--------|------|----------|
| `GET` | `/v1/invoices` | `list_invoices` |
| `POST` | `/v1/invoices` | `create_invoice` |
| `GET` | `/v1/invoices/{id}` | `get_invoice` |

OpenAPI source of truth in this repo: [`api.json`](./api.json).

## Logging

Structured JSON logs go to stdout/stderr. Level via `LOG_LEVEL` (`debug` \| `info` \| `warn` \| `error`). Tool handlers log full error details internally and return short, user-facing messages to the MCP client.

## Security notes

- Merchant tokens are request-scoped and not persisted by this server.
- Prefer HTTPS for any non-localhost MCP URL.
- Review this repository before connecting a production token.
- Ephemeral tunnels are fine for private testing only, not for marketplace homepage metadata.

## ChatGPT connection and deployment

The production endpoint is **https://mcp.dev.bitlink.ch/mcp**.
`initialize` and `tools/list` work without authentication; actual invoice calls
require a request-scoped merchant Bearer token. Anonymous calls never contact the
Bitlink API. Do not put tokens in plugin archives or source control.

In ChatGPT developer mode, add/connect the MCP server using this exact URL and
configure Bearer authentication in the client. A skills-only installation or a
connection without merchant authentication cannot retrieve invoices. After updating
the server, refresh the connection's tools and test “пришли список инвойсов”.
`list_invoices` accepts `{}`; all filters are optional and it is read-only.

Deploy with the existing process: install dependencies with `npm ci`, run
`npm test`, `npm run typecheck`, `npm run build`, then restart with `npm start`.
The compiled entry point is `dist/src/index.js`. Keep the existing
`CRYPTO_API_BASE_URL` and reverse proxy target. Verify production `initialize`,
`tools/list`, and an authenticated `tools/call` after restart.
