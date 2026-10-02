# Bitlink MCP

Standard MCP server for the Bitlink payment API, using Streamable HTTP.
An agent connects directly with a URL and a merchant Bearer token.
No OpenAI App ID or plugin ID is required by the server or package.
Plugin manifests and skills are optional client packaging.

## Tools

| Tool | Purpose |
|------|---------|
| `list_invoices` | Paginated invoice list with filters |
| `create_invoice` | Create an invoice and return `paymentLink` |
| `get_invoice` | Fetch one invoice by id |

`whichWallet` accepts `new` or `user`.

## Connect an agent

All connection addresses come from environment variables; no deployment URL
is embedded in the source configuration.

Set in `.env` or the client process environment:

```dotenv
BITLINK_MCP_URL=
```

Supply the complete MCP endpoint in `BITLINK_MCP_URL`.
Each user supplies their own raw merchant token in the client's authentication
settings. There is no default or shared token in the server environment.
The transport is Streamable HTTP.

`mcp.json`, `.mcp.json`, and `cursor.mcp.json` are connection templates.
Clients that support expansion can read the compatibility templates directly.
For clients that expect literal URLs and headers, generate local configurations:

```bash
npm run mcp:config
```

The command reads `.env` and process environment (process values take priority),
fails when the URL is missing, and writes `.local/`, which is ignored by Git.
It only substitutes the URL: it never reads or embeds user tokens.
Compatibility JSON files retain `${BITLINK_API_TOKEN}` for expansion by the
user's client. Clients without that feature require user authentication settings.
Portable `.local/mcp.json` contains the resolved endpoint; configure its Bearer
credential in the host's connection settings. Portable Agent Plugins headers
and URLs are literal and do not expand environment variables themselves.
For Claude Code, use its native transport value `http` when importing a config.

### Codex

`.codex/config.toml.template` is a source template. The generator writes
`.local/codex.toml` with the URL resolved from `BITLINK_MCP_URL` and
`bearer_token_env_var = "BITLINK_API_TOKEN"`. Copy or merge this generated
configuration into the client's active config. A local `.codex/config.toml`
is ignored by Git. Each user sets their own `BITLINK_API_TOKEN` in the Codex process environment;
Codex does not load this project's `.env` automatically.

### Cursor

Set plugin variables `BITLINK_MCP_URL` and `BITLINK_API_TOKEN` at installation,
or import the generated `.local/cursor.mcp.json` into the client's settings.

### ChatGPT

See [connection notes](docs/openai-plugin-connect.md). The connection URL comes
from `BITLINK_MCP_URL`; client account setup and credentials remain host-managed.

## Run the server

```bash
cp .env.example .env
npm install
npm run dev
```

Set `CRYPTO_API_BASE_URL` to the Bitlink REST API for your environment.
Default listen address: `0.0.0.0:3000`.

- Health: `GET /health`
- MCP endpoint: `/mcp`
- Missing merchant token: `401` with `WWW-Authenticate`

Merchant tokens are forwarded per request to the Bitlink REST API. No shared
merchant API key is included in the package. Remote deployments should use HTTPS.

## Optional plugin files

```text
plugin.json                 # portable manifest and optional OpenAI listing metadata
mcp.json                    # Streamable HTTP template; render before portable use
.codex-plugin/plugin.json   # compatibility manifest
.mcp.json                   # compatibility connection with client-expanded Bearer token
.cursor-plugin/plugin.json  # Cursor packaging and variables
cursor.mcp.json             # Cursor connection template
skills/bitlink/             # optional workflow instructions
```

There is no default endpoint. Set BITLINK_MCP_URL and configure authentication
in the client; no merchant token is embedded in the source manifests.
