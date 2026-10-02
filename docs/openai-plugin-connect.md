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

Register the endpoint supplied through `BITLINK_MCP_URL` using the custom MCP
connection workflow available in your account. The client must support Bearer
authentication. OAuth-only clients need an OAuth integration.
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
