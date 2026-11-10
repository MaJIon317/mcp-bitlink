# Laravel backend integration

The backend contract is maintained in the Laravel project's
`docs/development/oauth.md`. OAuth and REST can be served on different hosts:
`BITLINK_OAUTH_BASE_URL` points to the authorization server, while
`CRYPTO_API_BASE_URL` points to the merchant API. No production domain is hardcoded.

## Local setup

Run Laravel on `http://localhost:8311` and this server on port `3500`. Register
one public client for the MCP server in the **local** Laravel database:

```sh
php artisan passport:client --public --name="Bitlink MCP Local" \
  --redirect_uri="http://localhost:3500/oauth/callback" --no-interaction
```

Set the resulting client ID in the MCP server's `.env`:

```dotenv
AUTH_MODE=oauth
HOST=0.0.0.0
PORT=3500
BITLINK_MCP_URL=http://localhost:3500/mcp
CRYPTO_API_BASE_URL=http://localhost:8311/api/v1
BITLINK_OAUTH_BASE_URL=http://localhost:8311
BITLINK_OAUTH_CLIENT_ID=<local Passport client ID>
BITLINK_OAUTH_CLIENT_SECRET=
OAUTH_STORE_PATH=.local/oauth.sqlite
OAUTH_ENCRYPTION_KEY=<persistent base64-encoded 32-byte key>
OAUTH_CLIENTS_JSON={"postman":{"redirectUris":["https://oauth.pstmn.io/v1/callback","https://oauth.pstmn.io/v1/browser-callback"]}}
```

Generate an encryption key only for a new installation; retain an existing key
and its SQLite store. Never copy the Passport client secret, encryption key,
passwords or tokens into an agent configuration or commit them.

```sh
npm run typecheck
npm test
npm run build
npm run backend:check
npm start
```

The backend check verifies discovery, required grants/scopes and the API's 401
response without a token. It does not authenticate a user, issue tokens, or prove
that the configured client has the correct registered callback.

## Isolated real-backend contract test

After building, run `npm run test:backend`. Set `LARAVEL_PROJECT_PATH` if the
Laravel repository is not the sibling `../crypto`. The check starts an isolated
Laravel HTTP server with a temporary SQLite database, generated signing keys and
a fixture user/client. It approves consent for that disposable user through the
backend service, then tests actual Passport code/PKCE exchange, MCP tools and
serialized upstream refresh. It never uses the configured application database
or production signing keys, and removes its fixtures when finished. Browser
login/SSO remains a separate manual check.

## Postman verification

Use the MCP endpoints, rather than exchanging directly with Laravel:

| Field | Value |
| --- | --- |
| Grant type | Authorization Code (With PKCE) |
| Auth URL | `http://localhost:3500/oauth/authorize` |
| Token URL | `http://localhost:3500/oauth/token` |
| Callback | Exact callback selected in Postman and listed in `OAUTH_CLIENTS_JSON` |
| Client ID | `postman` |
| Client secret | Empty |
| Code challenge | SHA-256 |
| State | A fresh nonempty random value |
| Scope | `invoices.read` or `invoices.read invoices.create` |
| Client authentication | Send client credentials in body |
| Auth request custom parameter | `resource=http://localhost:3500/mcp` in request URL |
| Token/refresh request custom parameter | `resource=http://localhost:3500/mcp` in request body |

The browser is sent to Laravel's `/oauth/authorize`, using the separate Passport
client ID from the environment. Laravel owns password/2FA login and user consent.
Its callback is **MCP `/oauth/callback`**, not the Postman callback. MCP returns the
result to Postman using a separate code and PKCE verifier. The token returned by
MCP is used only on `/mcp`; it must not be sent to Laravel's REST API.

For ChatGPT or another remote host, localhost is not reachable from the host's
servers. Configure a publicly reachable HTTPS MCP URL and register its exact
callback in the same backend environment. Keep the persisted encryption key and
store across restarts. Backend login session cookies are not MCP credentials.

## Current API contract

- Calls use `/api/v1/me`, `/api/v1/merchants` and
  `/api/v1/merchants/{merchant}/invoices` with a private upstream bearer token.
- `merchantId` is selected per conversation; membership is checked by Laravel.
- Invoice country codes use ISO alpha-2 (`US`, `DE`), including filters.
- `cancelled` is a supported invoice status.
- New-wallet invoices require customer name and country. Existing-user wallets
  do not require or forward customer fields excluded by Laravel validation.
- Merchant addresses can be null. Success/error envelopes and pagination follow
  Laravel's API middleware.
- Upstream refresh is serialized per connection and never retried after a
  possibly consumed refresh token; replay revokes the backend connection.
