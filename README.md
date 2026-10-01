# bitlink-invoices

MCP gateway for the **Bitlink** payment API, packaged as an [OpenAI plugin](https://developers.openai.com/plugins/build/plugins) for ChatGPT / Codex (and optionally Cursor).

The package does **not** hardcode environment URLs. Dev/prod endpoints are registered in the client; the plugin maps a registered MCP app id.

## Tools

| Tool | Purpose |
|------|---------|
| `list_invoices` | Paginated invoice list with filters |
| `create_invoice` | Create an invoice and return `paymentLink` |
| `get_invoice` | Fetch one invoice by id |

`whichWallet` is only `new` \| `user`. If unclear, the agent asks «новому или текущему пользователю?» and maps the answer itself.

## Plugin layout (OpenAI)

```text
plugin.json                 # Agent Plugins manifest + extensions.com.openai
mcp.json                    # portable MCP config (empty servers — no hardcoded URLs)
.app.json                   # maps to registered ChatGPT/Codex MCP app id
.codex-plugin/plugin.json   # Codex compatibility overlay
.mcp.json                   # compatibility MCP file (empty servers)
skills/bitlink-invoices/    # workflow skill
.agents/plugins/marketplace.json
```

See [docs/openai-plugin-connect.md](./docs/openai-plugin-connect.md).

### Environments (ops)

| Env | Example MCP URL |
|-----|-----------------|
| Dev | `http://mcp.dev.bitlink.ch/mcp` |
| Prod | `http://dev.bitlink.ch/mcp` |

Put these only in ChatGPT/Codex connection settings (or infra), not in committed plugin MCP config.

## Run the MCP server

```bash
cp .env.example .env
npm install
npm run dev
```

```dotenv
HOST=0.0.0.0
PORT=3000
CORS_ORIGIN=*
CRYPTO_API_BASE_URL=https://api.example.com/api
```

- Health: `GET /health`
- MCP: `POST/GET /mcp` with `Authorization: Bearer <merchant-token>`
- Missing token → `401` + `WWW-Authenticate`

## Connect ChatGPT / Codex

1. Enable Developer mode
2. Register MCP with the **env URL** (`…/mcp`) + merchant auth
3. Copy `plugin_asdk_app…` / `asdk_app…` id into `.app.json`
4. Install from local marketplace **Bitlink local plugins**

Details: [docs/openai-plugin-connect.md](./docs/openai-plugin-connect.md).

## Connect Cursor

Cursor uses `.cursor-plugin/plugin.json` + `cursor.mcp.json` with variables:

- `BITLINK_MCP_URL` — e.g. `http://mcp.dev.bitlink.ch/mcp`
- `BITLINK_API_TOKEN` — merchant Sanctum token

## Auth model

Merchant Sanctum token per request → forwarded to Bitlink REST (`CRYPTO_API_BASE_URL`). No shared API key in the plugin.
