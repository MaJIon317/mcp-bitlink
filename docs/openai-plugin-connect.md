# OAuth connection to Bitlink MCP

The default `AUTH_MODE=oauth` supports MCP protected-resource discovery (RFC 9728),
authorization-server metadata (RFC 8414), Authorization Code with S256 PKCE
(RFC 7636), resource binding (RFC 8707), issuer identification (RFC 9207), Bearer
challenges (RFC 6750), rotating refresh tokens and token revocation (RFC 7009).

## How login works

1. ChatGPT or another MCP client discovers the authorization server from
   `GET /.well-known/oauth-protected-resource/mcp` (the root alias also works).
2. The client opens `/oauth/authorize` with its registered client ID, exact
   redirect URI, `state`, `resource`, requested scopes and S256 PKCE challenge.
3. MCP redirects to the existing Bitlink Passport `/oauth/authorize`. Bitlink
   authenticates the user and asks for consent. MCP uses an independent state
   and PKCE verifier for this upstream flow.
4. Bitlink returns to MCP `/oauth/callback`. MCP exchanges the upstream code,
   stores the Bitlink tokens encrypted, and returns a separate single-use code
   plus `state` and `iss` to the MCP client's registered callback.
5. The client exchanges this code at MCP `/oauth/token` with its own verifier
   and the same `resource`. It receives MCP access and refresh tokens.
6. Each MCP request carries `Authorization: Bearer <MCP-access-token>`.
   MCP checks its persisted grant, resource binding, expiry, revocation and
   operation scopes. Only the server uses the private Bitlink access token.

The MCP resource is exactly `BITLINK_MCP_URL`, including `/mcp`. Bitlink tokens,
personal keys and access tokens issued for another MCP resource are rejected in
OAuth mode. The identity is a user; merchant choice remains in the conversation
and is passed as `merchantId`. API membership checks stay in Bitlink.

## Deployment configuration

Node.js 22.13 or later is required (the store uses built-in `node:sqlite`). Run
one Node process per store; SQLite and upstream refresh serialization here are
not a distributed multi-worker deployment. Keep the database and encryption key
persistent, private and backed up together. Losing either requires users to
connect again. Never commit the key, database, client secrets or user tokens.

Set these server variables:

```dotenv
AUTH_MODE=oauth
BITLINK_MCP_URL=https://mcp.example.com/mcp
CRYPTO_API_BASE_URL=https://bitlink.example.com/api/v1
BITLINK_OAUTH_BASE_URL=https://bitlink.example.com
BITLINK_OAUTH_CLIENT_ID=<client registered in Bitlink>
# Optional, only for a confidential Bitlink client:
BITLINK_OAUTH_CLIENT_SECRET=
OAUTH_STORE_PATH=.local/oauth.sqlite
OAUTH_ENCRYPTION_KEY=<persistent 32-byte key encoded in base64>
OAUTH_CLIENTS_JSON={"chatgpt":{"redirectUris":["https://chatgpt.com/connector/oauth/EXACT_CALLBACK_ID"]}}
```

The example hosts and callback above are placeholders. Use the real deployed
addresses. MCP derives its issuer and callback from `BITLINK_MCP_URL`, never
from an untrusted Host or forwarding header. HTTPS is required; HTTP is allowed
only on loopback for local tests. The upstream base must be an origin without
`/api/v1`. The configured REST API must belong to the same Bitlink environment
and accept the tokens issued by this Passport application.

Generate the encryption key once, then save it in the deployment's secret store:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

### Register MCP with Bitlink Passport

In the existing Bitlink backend, register a public OAuth client with the exact
callback `https://mcp.example.com/oauth/callback`:

```sh
php artisan passport:client --public
```

Use its generated client ID as `BITLINK_OAUTH_CLIENT_ID`. Public clients have no
secret; PKCE is mandatory for both OAuth legs. Bitlink login, consent, Passport
signing keys and migrations must already be deployed. This repository does not
modify the Bitlink backend or implement a password-login form.

### Register the agent with MCP

Agent clients are explicitly pre-registered in `OAUTH_CLIENTS_JSON`. For ChatGPT,
select OAuth when configuring the MCP connection and supply client ID `chatgpt`
(or another ID you put in that JSON), without a client secret. Copy the exact
callback URI displayed by ChatGPT into `redirectUris`. This server advertises
issuer identification, so use the callback shown for this connection rather
than assuming a fixed callback pattern. Each additional agent needs its own
client entry and exact callback URI. Wildcards and arbitrary redirects are not
accepted. Public dynamic registration and CIMD are not advertised or implemented;
pre-registration is one of the supported MCP registration mechanisms.

For Codex, render the endpoint configuration with `npm run mcp:config`, merge
`.local/codex.toml` into the client's configuration and run its OAuth login for
`bitlink`. The templates contain no API-token environment variable or static
Authorization header. Clients obtain and refresh tokens themselves; the AI
model should never request a password or an access token in chat.

## Permissions and lifecycle

- `invoices.read`: list and inspect invoices.
- `invoices.create`: create invoices. It does not automatically grant read access.
- User profile and merchant discovery require an authenticated connection.

Initial authorization defaults to read access. A create operation without the
create scope returns HTTP 403 with an `insufficient_scope` challenge specifying
`invoices.create`; the client can request new consent. Tools also declare their
OAuth schemes in `_meta.securitySchemes` for host compatibility.

MCP access tokens last up to 15 minutes. Authorization codes expire after five
minutes; pending login state expires after ten. Connections expire after at most
30 days. Refresh rotates the MCP refresh token; reuse revokes the connection and
all access tokens. Refresh may reduce scopes but cannot expand them. Revoke an
MCP access or refresh token at `POST /oauth/revoke` with `client_id` and `token`.
This revokes the local connection. To revoke Bitlink's upstream consent as well,
use Bitlink's OAuth connections dashboard; its documented API has no revocation
endpoint. All actual API operations continue to enforce upstream revocation.

When upstream tokens need renewal, the server serializes refresh per connection
and saves the new pair. It does not retry potentially consumed upstream refresh
tokens after a network failure; reconnection may be required. An upstream 401
also returns a tool OAuth challenge to prompt reconnection.

OAuth responses use `no-store` and `no-referrer`. Secrets are encrypted with
AES-256-GCM; local credentials are looked up by SHA-256 hashes. OAuth form bodies
are limited to 16 KiB and endpoints have a bounded per-peer rate limiter.
Configure proxy-level limits for the real client IP when deploying behind a
reverse proxy. Do not log Authorization headers, OAuth bodies, callback query
strings or redirect Location headers at the proxy. The server trusts no forwarded
IP header. Multi-process hosting requires a shared store with distributed refresh
coordination before scaling out.

## Verification

```sh
npm run build
npm test
```

Tests cover both OAuth legs with a simulated Bitlink server, HTTP challenges,
PKCE/client/redirect/resource binding, expired and reused codes, refresh replay,
revocation, encryption, persistence, concurrency and scope enforcement. Before
production, complete the flow against the real Bitlink deployment and the actual
ChatGPT connection, including token renewal and user revocation.

Use MCP Inspector's OAuth settings to inspect discovery and the complete flow.
A `502` from the reverse proxy is a deployment issue; changing plugin metadata
cannot fix an unreachable Node server.

## Explicit legacy compatibility

`AUTH_MODE=bearer` retains the old personal-key integration for existing clients
that configure their own Authorization header. It provides no OAuth discovery,
no browser login and no MCP token validation; the Bitlink API validates its key.
It is an opt-in migration mode, not the default ChatGPT integration.

## References

- [OpenAI authentication](https://developers.openai.com/plugins/build/auth)
- [MCP authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)
- [MCP security practices](https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/security_best_practices)
