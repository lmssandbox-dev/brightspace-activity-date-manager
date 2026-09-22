# Brightspace Activity Date Manager — Spike 01B

The original LTI shell is in `index.js`; `src/brightspace/auth.js` implements OAuth Client Credentials with RS256 Private Key JWT. MongoDB remains required by ltijs. Refresh-token persistence and the direct mongoose/qs imports are removed.

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
6. Set `D2L_OAUTH2_CLIENT_ID` to that new registration's ID and `D2L_OAUTH2_SCOPES` to the required registered scopes. Restart the app and launch from a test course. Configure launch access in the Brightspace LTI installation, then verify normalized activity discovery.
7. After verification, remove `D2L_OAUTH2_CLIENT_SECRET` and `D2L_OAUTH2_REFRESH_TOKEN` from this deployment. The old Mongo OAuth-token document is unused; no database records are deleted by this migration. Revoke the old OAuth grant only when no other integration depends on it.

The application signs a fresh, unique 60-second assertion for each token exchange. It caches access tokens in memory until shortly before expiration and combines simultaneous token requests. No interactive login or refresh token is needed for API authentication. OAuth token errors are sanitized to avoid logging signed assertions.

API access now uses the linked Service User's permissions, regardless of who launches LTI. Brightspace controls who may launch the tool through the LTI installation. The diagnostic requires a validated LTI session from the configured deployment; the app does not maintain a user allowlist or independently filter LTI roles. It takes an explicit OrgUnitId rather than assuming the LTI context ID is a Brightspace numeric course ID.

The JWKS route is separate from ltijs's LTI key endpoint. For planned signing-key rotation, publish both old and new public keys during the transition, switch signing to the new kid, and retire the old key after propagation. This sample publishes one active key, so a coordinated deployment is required if you replace it directly.

## Verification

Run `npm test` and `npm run check`. The fixture and mock tests cover normalizers, discovery, pagination, Content relationships, diagnostics authorization, and existing authentication/deployment/database guards without accessing Brightspace. A live test additionally requires your tenant registration, secrets, MongoDB and an LTI launch.

## Official references

Initial LTI setup: leave BS_CLIENT_ID unset or empty and deploy. The server skips Brightspace platform registration while serving its key endpoints. Use `/keys` for the tool's LTI public keyset, `/login` for its OIDC login URL, and `/` for its target link URL, all under the deployed HTTPS domain. Once Brightspace provides the LTI Client ID, set BS_CLIENT_ID and restart. This only makes BS_CLIENT_ID optional during setup; the other required environment variables, including MongoDB and OAuth signing settings, must still be valid. The OAuth public key endpoint is separately located at `/.well-known/brightspace-jwks.json`.

- [D2L OAuth protocol and JWT requirements](https://docs.valence.desire2learn.com/basic/oauth2.html)
- [D2L server-to-server registration and Service User permissions](https://community.d2l.com/brightspace/kb/articles/33526-register-an-oauth2-0-application-for-server-to-server-authentication)
- [ltijs provider and public-route configuration](https://github.com/Cvmcosta/ltijs/blob/master/docs/provider.md)

## LTI deployment restriction

Set BS_DEPLOYMENT_ID in Render to the exact Deployment ID for this tool in Brightspace (not its Client ID). Restart after changes. The launch and diagnostic handlers check the validated ltijs token.deploymentId before any OAuth or course API request. Missing configuration returns HTTP 503; a missing or different launch Deployment ID returns HTTP 403. During initial setup, leave this variable empty: the server and public key endpoints remain available. Configure it after creating the deployment. Deploy the entire src/ directory along with index.js. The diagnostic requires a validated LTI session; it is not a public or whitelisted route.

## Spike 01B discovery contract (schemaVersion 2)

The LTI launch displays a developer diagnostic form. Enter an explicit OrgUnitId; choose **Include undated activities**, optional redacted raw API responses, or JSON output. No course API reads happen until submission. Access is controlled by the LMS LTI installation, validated ltijs session and configured deployment, with no app user allowlist.

`GET /diagnostics/activities?orgUnitId=12345` defaults to dated activities. Add `includeUndated=1`, `raw=1`, or `format=json` as needed. A valid ltijs session is required. The form carries it automatically; responses are not cached.

The underlying `discover(orgUnitId, { includeUndated: true, includeRaw: false })` service returns all supported activities by default. Its response contains `schemaVersion`, `orgUnitId`, `complete`, `sources`, `activities`, `contentRelationships`, `contentStructure`, `counts`, `warnings`, and optional `raw`. Source Course and Course Offering IDs use the same readers. Source Course lifecycle reads remain separate.

See [the normalized contract](docs/discovery-contract.md), [future update considerations](docs/future-writes.md), and [acceptance matrix and live verification](docs/acceptance.md).

### API scopes and versions

Configure only the read scopes needed by these adapters. The service user's roles and org-unit permissions must also allow the reads, including hidden activities.

| Adapter | OAuth scopes |
|---|---|
| Assignments | `dropbox:folders:read` |
| Quizzes | `quizzing:quizzes:read` |
| Discussion forums/topics | `discussions:forums:readonly discussions:topics:readonly` |
| Content TOC and details | `content:toc:read content:modules:readonly content:topics:readonly` |
| Source Course helpers | `orgunits:sourcecourses:read` |

LP and LE versions come from `D2L_LP_VERSION` and `D2L_LE_VERSION`. Discovery requires a tenant-supported **LE 1.90 or later**, validated centrally by `src/brightspace/apiVersions.js` before any reads; older versions are rejected so Discussion Topic due dates are not silently lost. Source Course helpers require LP 1.53+. Availability fields absent from responses remain explicitly `missing`. No write scopes are requested.

### Code organization

```text
index.js                          # LTI startup and composition
src/
  config/database.js              # Dedicated MongoDB validation
  brightspace/
    auth.js                       # Private Key JWT OAuth and token cache
    client.js                     # GET, pagination, URL checks, redacted debug data
    errors.js                     # Sanitized upstream errors
    deploymentGuard.js            # Validated LTI deployment check
    id.js                         # Brightspace numeric IDs
    availability.js               # AVAILABILITY_T mapping
    activities/
      assignments.js              # Assignment reads and mapping
      quizzes.js                  # Quiz reads and mapping
      discussions.js              # Forum/topic reads and mapping
      content.js                  # TOC/detail reads and partial-read handling
      normalizers.js              # All Brightspace-native field mappings
      readResult.js               # Per-record normalization warnings
    sourceCourses.js              # Independent source/re-offering reads
  services/
    activityNormalizer.js         # Domain objects and strict UTC instant parsing
    contentRelationshipResolver.js # Canonical matching and hierarchy
    activityDiscovery.js          # Orchestration, filtering, completeness and warnings
  routes/discoveryDiagnostics.js  # Temporary diagnostic HTML/JSON handlers
scripts/
  verify-discovery.js             # Read-only live acceptance command
  discovery-acceptance.js         # Domain acceptance matrix checks
```

Tests and synthetic JSON fixtures live in `test/`. Run `npm test` and `npm run check` with Node 22. Deploy `src/`, `index.js` and `package.json`; deploy `scripts/` too if you want to run the acceptance command there. Authentication and LTI architecture are unchanged. No activity writes, bulk operations, date shifting or final UI are implemented.

### Source Course helpers

`createSourceCoursesClient(brightspaceClient)` provides:

- `getCurrentReofferedCourse(sourceOrgUnitId, subOrganizationOrgUnitId)`
- `getAllReofferedCourses(sourceOrgUnitId, subOrganizationOrgUnitId)`
- `getSourceCourse(courseOfferingId, subOrganizationOrgUnitId)`

The optional second argument filters by sub-organization. These helpers return their LP responses and are deliberately independent of activity discovery; lack of Source Course functionality does not block discovery for another valid OrgUnitId.

API references: [Assignments](https://docs.valence.desire2learn.com/res/dropbox.html), [Quizzes](https://docs.valence.desire2learn.com/res/quiz.html), [Discussions](https://docs.valence.desire2learn.com/res/discuss.html), [Content](https://docs.valence.desire2learn.com/res/content.html), [Source Courses](https://docs.valence.desire2learn.com/res/course.html), [pagination](https://docs.valence.desire2learn.com/basic/apicall.html).
