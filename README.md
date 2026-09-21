# Brightspace LTI service-account migration

The original LTI shell is in `index.js`; `brightspace-auth.js` implements OAuth Client Credentials with RS256 Private Key JWT. MongoDB remains required by ltijs. Refresh-token persistence and the direct mongoose/qs imports are removed.

## Installation and migration

1. Use your existing deployment's package.json and lockfile, keeping its tested ltijs version. This attachment did not include either file. Ensure `axios`, `dotenv`, and `ltijs` are installed (`npm install axios dotenv ltijs` for a new project). Start with `node index.js`.
2. Generate a persistent signing key once: `openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out brightspace-private.pem`. Store it in your deployment's secret manager as `D2L_OAUTH2_PRIVATE_KEY` (actual newlines or literal `\n` both work). Do not regenerate on each startup. All instances must use the same key and key ID.
3. Copy `.env.example` to `.env` locally, or configure those variables in Render. Retain your existing BS_* LTI registration values, MongoDB URL, LTI key and supported API versions. The OAuth Client ID is separate from the LTI Client ID.
4. Deploy and make `https://YOUR-APP/.well-known/brightspace-jwks.json` publicly reachable. It exposes only the public key. The API scopes and client ID can initially be placeholders for this discovery step; replace them before testing a launch.
5. In Brightspace create a dedicated Service User with the roles, permissions and org-unit access needed for these API calls. In Admin Tools → Manage Extensibility → OAuth 2.0, register a new app with **Client Credentials**, this JWKS URL, the required space-separated API scopes, and the Service User. Set the desired access-token lifetime within Brightspace's supported range.
6. Set `D2L_OAUTH2_CLIENT_ID` to that new registration's ID and `D2L_OAUTH2_SCOPES` to the required registered scopes. Restart the app and launch from a test course. Verify course and TOC data load.
7. After verification, remove `D2L_OAUTH2_CLIENT_SECRET` and `D2L_OAUTH2_REFRESH_TOKEN` from this deployment. The old Mongo OAuth-token document is unused; no database records are deleted by this migration. Revoke the old OAuth grant only when no other integration depends on it.

The application signs a fresh, unique 60-second assertion for each token exchange. It caches access tokens in memory until shortly before expiration and combines simultaneous token requests. No interactive login or refresh token is needed for API authentication. OAuth token errors are sanitized to avoid logging signed assertions.

API access now uses the linked Service User's permissions, regardless of who launches LTI. This sample retains the original launch's course/TOC display; before exposing privileged data or adding date mutations, enforce which launching users may perform those operations. The original assumption that LTI context.id is the Brightspace numeric course ID is retained; verify that mapping in your deployment.

The JWKS route is separate from ltijs's LTI key endpoint. For planned signing-key rotation, publish both old and new public keys during the transition, switch signing to the new kid, and retire the old key after propagation. This sample publishes one active key, so a coordinated deployment is required if you replace it directly.

## Verification

Run `node --test brightspace-auth.test.js` and `node --check index.js`. These tests verify signatures, claims, caching, concurrent requests, renewal and failure recovery without accessing Brightspace. A live test additionally requires your tenant registration, secrets, MongoDB and an LTI launch.

## Official references

- [D2L OAuth protocol and JWT requirements](https://docs.valence.desire2learn.com/basic/oauth2.html)
- [D2L server-to-server registration and Service User permissions](https://community.d2l.com/brightspace/kb/articles/33526-register-an-oauth2-0-application-for-server-to-server-authentication)
- [ltijs provider and public-route configuration](https://github.com/Cvmcosta/ltijs/blob/master/docs/provider.md)
