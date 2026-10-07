# Bitlink MCP

Standard MCP server for the Bitlink payment API, using Streamable HTTP.
An agent connects directly with a URL and a user Bearer token.
No OpenAI App ID or plugin ID is required by the server or package.
Plugin manifests and skills are optional client packaging.

## Tools

| Tool | Purpose |
|------|---------|
| `get_me` | Authenticated user profile |
| `list_merchants` | Accessible merchants with pagination |
| `get_merchant` | Merchant details by ID |
| `list_invoices` | Paginated invoice list with filters |
| `create_invoice` | Create an invoice and return `paymentLink` |
| `get_invoice` | Fetch one invoice by id |

All invoice tools require `merchantId` and use `/v1/merchants/{merchant}/invoices`.
The agent asks which merchant to use before the first invoice operation, remembers
the choice in the conversation, and reuses it until the user asks to switch.
The server is stateless: the agent sends the selected ID with each call; there is
no shared merchant selection across users or conversations. A new conversation
requires a new choice. Checkout and Webhook are outside this server’s scope.

`whichWallet` accepts `new` or `user`.

## Connect an agent

OAuth is enabled by default. The agent opens Bitlink's login and consent page,
obtains a dedicated MCP token, and refreshes it automatically. Passwords and
Bitlink access tokens are never passed to the model or embedded in client configs.

Configure the public `BITLINK_MCP_URL`, Bitlink Passport client, exact agent callback
URLs and persistent encryption key. See the complete
[OAuth deployment and ChatGPT connection guide](docs/openai-plugin-connect.md).
The backend must already expose Passport `/oauth/authorize` and `/oauth/token`.

`mcp.json`, `.mcp.json`, `cursor.mcp.json` and `.codex/config.toml.template` contain
endpoint configuration only. Generate resolved configurations with:

```sh
npm run mcp:config
```

Merge the generated endpoint into the client's settings and use its OAuth login.
For Codex, the generated `.local/codex.toml` has no static Bearer token.
The server's `.env` configures deployment; each user's OAuth authorization is
managed by the host. Each invoice call still includes the selected `merchantId`.

## Run the server

Use Node.js 22.13 or later:

```sh
cp .env.example .env
npm install
# Fill OAuth variables following the deployment guide.
npm run build
npm start
```

Set `CRYPTO_API_BASE_URL` to the Bitlink REST API (`/api` or `/api/v1`).
Default listen address: `0.0.0.0:3000`.

- Health: `GET /health`
- MCP endpoint: `/mcp`
- OAuth resource discovery: `/.well-known/oauth-protected-resource/mcp`
- OAuth issuer discovery: `/.well-known/oauth-authorization-server`
- Login, callback, exchange and revoke: `/oauth/authorize`, `/oauth/callback`, `/oauth/token`, `/oauth/revoke`
- Missing, expired or revoked MCP token: HTTP 401 with OAuth discovery challenge
- Insufficient invoice permissions: HTTP 403 with required scope

Run one server process with a persistent encrypted SQLite store. Shared hosting
with multiple workers needs distributed token-refresh coordination. See the
[deployment guide](docs/openai-plugin-connect.md) for lifecycle and proxy setup.

For migration only, explicitly select `AUTH_MODE=bearer` and configure a personal
API key in the client. This mode has no OAuth login and is not the default.

## Optional plugin files

```text
plugin.json                 # portable manifest and optional OpenAI listing metadata
mcp.json                    # Streamable HTTP template; render before portable use
.codex-plugin/plugin.json   # compatibility manifest
.mcp.json                   # compatibility OAuth endpoint configuration
.cursor-plugin/plugin.json  # Cursor packaging and variables
cursor.mcp.json             # Cursor connection template
skills/bitlink/             # optional workflow instructions
```

There is no default endpoint. Set BITLINK_MCP_URL and configure authentication
in the client; no user token is embedded in the source manifests.
