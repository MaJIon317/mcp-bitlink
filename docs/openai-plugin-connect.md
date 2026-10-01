# Connecting Bitlink MCP (no hardcoded URLs in the plugin)

Per https://developers.openai.com/plugins/build/plugins the plugin package
does **not** embed environment MCP URLs. You register the live endpoint in
ChatGPT / Codex developer mode, then map the resulting app id into `.app.json`.

## Deployed endpoints (ops only)

| Environment | MCP base (example) | MCP path |
|-------------|--------------------|----------|
| Dev | `http://mcp.dev.bitlink.ch` | `/mcp` |
| Prod | `http://dev.bitlink.ch` | `/mcp` |

Full URL examples:

- Dev: `http://mcp.dev.bitlink.ch/mcp`
- Prod: `http://dev.bitlink.ch/mcp`

These values belong in ChatGPT/Codex connection settings (or reverse-proxy
config), **not** in committed `mcp.json`.

## Register MCP (ChatGPT)

1. Settings → Security and login → enable **Developer mode**
2. ChatGPT Plugins → **+** → create connection
3. Server URL: your env URL ending in `/mcp`
4. Auth: Bearer / no OAuth unless you added OAuth later
5. Copy the technical id from the browser URL (`plugin_asdk_app…`)

## Wire the plugin

Edit `.app.json`:

```json
{
  "apps": {
    "bitlink-invoices": {
      "id": "asdk_app_REPLACE_ME",
      "optional": false
    }
  }
}
```

Use the id ChatGPT shows (format validated as `asdk_app_…`, `connector_…`, or
`templated_apps_…`). Root `plugin.json` / `.codex-plugin/plugin.json` already
point `apps` at `./.app.json`.

`mcp.json` stays with empty `mcpServers` on purpose so the package is
environment-agnostic.

## Local marketplace test

1. Restart ChatGPT desktop / Codex
2. Open Plugins Directory → marketplace **Bitlink local plugins**
3. Install **Bitlink Invoices**
4. New chat → try: “Создай инвойс на 100 USD”
