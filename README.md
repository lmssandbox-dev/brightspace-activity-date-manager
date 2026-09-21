# Brightspace LTI service-account migration

The original LTI shell is in `index.js`; `brightspace-auth.js` implements OAuth Client Credentials with RS256 Private Key JWT. MongoDB remains required by ltijs. Refresh-token persistence and the direct mongoose/qs imports are removed.

## Installation and migration

### Shared Atlas cluster, separate database

Use the existing cluster hostname with `/brightspace_activity_date_manager` in the connection URL, before `?` options. Do not use `/lti-db`: that belongs to the other application. The startup guard refuses any other database name or an omitted database name. This app's collections will be created inside the dedicated database on first writes; no existing data is moved or deleted. Preserve your Atlas connection options, including `authSource` if present.

Example: `mongodb+srv://USER:URL_ENCODED_PASSWORD@YOUR_CLUSTER/brightspace_activity_date_manager?retryWrites=true&w=majority`.

For database-level permission isolation as well, create a separate Atlas database user with `readWrite` on `brightspace_activity_date_manager` only, and use that user's credentials here. Sharing a cluster still shares its capacity. The local changes do not modify your Atlas configuration.

1. Install dependencies with `npm install` and start with `npm start`. The included package.json uses ltijs 5.9.9 and Node 22. In Render, set Build Command to `npm install` and Start Command to `npm start`. The service Root Directory must contain package.json and index.js (leave it blank when these files are at the repository root). Commit package.json with the JavaScript source files; never commit render.env or private keys.
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

Initial LTI setup: leave BS_CLIENT_ID unset or empty and deploy. The server skips Brightspace platform registration while serving its key endpoints. Use `/keys` for the tool's LTI public keyset, `/login` for its OIDC login URL, and `/` for its target link URL, all under the deployed HTTPS domain. Once Brightspace provides the LTI Client ID, set BS_CLIENT_ID and restart. This only makes BS_CLIENT_ID optional during setup; the other required environment variables, including MongoDB and OAuth signing settings, must still be valid. The OAuth public key endpoint is separately located at `/.well-known/brightspace-jwks.json`.

- [D2L OAuth protocol and JWT requirements](https://docs.valence.desire2learn.com/basic/oauth2.html)
- [D2L server-to-server registration and Service User permissions](https://community.d2l.com/brightspace/kb/articles/33526-register-an-oauth2-0-application-for-server-to-server-authentication)
- [ltijs provider and public-route configuration](https://github.com/Cvmcosta/ltijs/blob/master/docs/provider.md)

## LTI deployment restriction

Set BS_DEPLOYMENT_ID in Render to the exact Deployment ID for this tool in Brightspace (not its Client ID). Restart after changes. The onConnect handler checks the validated ltijs token.deploymentId before any OAuth or course API request. Missing configuration returns HTTP 503; a missing or different launch Deployment ID returns HTTP 403. During initial setup, leave this variable empty: the server and public key endpoints remain available. Configure it after creating the deployment. Upload deployment-guard.js along with index.js. This restriction covers the current launch handler; future privileged routes must also enforce it and user/course authorization.
