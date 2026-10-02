# Connect Bitlink MCP

The endpoint comes exclusively from `BITLINK_MCP_URL` (Streamable HTTP).
Every MCP request requires `Authorization: Bearer <merchant-token>`.
Each user supplies their own raw token in the client's authentication settings.
There is no server-side default token or token in the deployment `.env`.

## Direct connection

Configure the URL and token in the client's MCP settings. See the
[README](../README.md#connect-an-agent) for environment setup and generation.
No App ID or plugin ID is required by the server or included in the package.

## ChatGPT

Before registration, verify that the deployment serves `/health` successfully
and that the reverse proxy reaches the running Node server. A `502` is a
deployment failure; plugin manifest changes cannot fix it.

The current server accepts user-provided merchant Bearer tokens, but does not
implement OAuth discovery, authorization, or token exchange. This direct
authentication is suitable for clients that can send user-configured headers.
It is not a complete authenticated ChatGPT integration: ChatGPT expects an
OAuth 2.1 authorization-code flow with PKCE and does not present custom API keys.
Implement that flow before registering an authenticated ChatGPT connection.
User credentials must remain user-specific, with no shared/default merchant token.

Once the deployment and OAuth flow work, register the endpoint supplied through
`BITLINK_MCP_URL` in ChatGPT developer mode. Copy the real `plugin_asdk_app_...`
connection ID from its management page URL. Bind that connection in `.app.json`
and reference the file from `extensions.com.openai.apps` in root `plugin.json`
and `apps` in `.codex-plugin/plugin.json`. App binding does not implement OAuth
or repair an unreachable server.

Installing listing metadata or a skill alone does not establish a connection.
The server's `.env` does not configure the ChatGPT connection.

## Configuration templates

`mcp.json`, `.mcp.json`, and `cursor.mcp.json` contain environment references.
Run `npm run mcp:config` to resolve URL references into local files in `.local/` before
using a client that does not expand references itself.
Portable Agent Plugins URLs and headers are literal; configure the generated
portable connection's Bearer credential in the host.
Compatibility JSON files keep `${BITLINK_API_TOKEN}` for the user's client
to resolve into an Authorization header. The generator never reads or writes
user tokens; users configure authentication separately.
