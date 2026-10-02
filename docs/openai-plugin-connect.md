# Connect Bitlink MCP

Endpoint: `https://mcp.dev.bitlink.ch/mcp` (Streamable HTTP).
Every MCP request requires `Authorization: Bearer <merchant-token>`.

## Direct connection

Configure the URL and token in the client's MCP settings. See the
[README](../README.md#connect-an-agent) for JSON and Codex examples.
No App ID or plugin ID is required by the server or included in the package.

## ChatGPT

Register the endpoint using the custom MCP connection workflow available in
your account. The client must support the server's Bearer authentication.
If the client only supports OAuth, the current static Bearer authentication
is insufficient and an OAuth integration is needed.

Any internal connection identifier belongs to the client and must not become
a dependency of the portable package. Installing listing metadata or a skill
alone does not verify an active MCP connection.

## Optional plugin package

`mcp.json` declares the development Streamable HTTP endpoint; its authentication
must be configured in the host. Portable remote headers are literal values,
not environment-variable references.

`.mcp.json` additionally sends `Authorization: Bearer ${BITLINK_API_TOKEN}`
for clients that support expansion in HTTP headers. Supply the raw token in
the client process environment and reconnect. This is a client-specific
compatibility configuration, not a portable ChatGPT credential mechanism.
The server's `.env` does not configure the ChatGPT connection.

Manifests do not declare an App dependency. Direct MCP clients can connect
without installing a plugin or skill.
