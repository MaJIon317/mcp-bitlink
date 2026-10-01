# Bitlink invoices MCP

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

- Transport: **Streamable HTTP**
- Development endpoint: `https://mcp.dev.bitlink.ch/mcp`
- Authentication: `Authorization: Bearer <merchant-token>`

Set these values in the agent's MCP settings. The client must support
Streamable HTTP and sending a Bearer token. OAuth-only or stdio-only clients
need a compatible authentication flow or transport bridge. Configuration-file
syntax varies between clients.

For clients accepting JSON `mcpServers` configuration:

```json
{
  "mcpServers": {
    "bitlink-invoices": {
      "url": "https://mcp.dev.bitlink.ch/mcp",
      "headers": {
        "Authorization": "Bearer <merchant-token>"
      }
    }
  }
}
```

Replace the token locally; never commit it. Some clients require an additional
transport field (`http` or `streamable-http`); use their documented syntax.
For another deployment, change the connection URL.

### Codex

Configure a direct connection in `.codex/config.toml`:

```toml
[mcp_servers.bitlink-invoices]
url = "https://mcp.dev.bitlink.ch/mcp"
bearer_token_env_var = "BITLINK_API_TOKEN"
```

Set `BITLINK_API_TOKEN` in the Codex process environment.
See the [Codex MCP documentation](https://developers.openai.com/codex/mcp/).

### Cursor

`cursor.mcp.json` uses Cursor plugin variables `BITLINK_MCP_URL` and
`BITLINK_API_TOKEN`. Set them when installing the Cursor plugin.
For a direct connection, use the JSON example in the client's MCP settings.

### ChatGPT

See [connection notes](docs/openai-plugin-connect.md). Client account setup
is separate from the portable server and package.

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
mcp.json                    # portable Streamable HTTP declaration
.codex-plugin/plugin.json   # compatibility manifest
.mcp.json                   # compatibility server declaration
.cursor-plugin/plugin.json  # Cursor packaging and variables
cursor.mcp.json             # Cursor connection template
skills/bitlink-invoices/    # optional workflow instructions
```

The packaged endpoint defaults to development. Configure authentication in
the client; no merchant token is embedded in the manifests.
