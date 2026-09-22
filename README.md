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

## Spike 01B: read-only discovery

The old 01A course/TOC API test display is removed. The launch now opens a minimal diagnostic form; no course API requests happen until you submit an OrgUnitId. LTI registration, ltijs/MongoDB, the deployment guard, and the existing server-to-server OAuth token exchange are unchanged. No date writes or bulk operations are implemented.

### Setup and use

1. Configure the tool's LTI installation in Brightspace so only the intended users or roles (for example, administrators) can launch it. Every user with a valid launch from the configured deployment can access discovery, including optional raw responses, for any OrgUnitId accessible to the service account. No per-user environment variable is required.
2. Retain your API versions supported by the tenant. Source Course current/all re-offering routes require LP 1.53+; discussion topic due dates require LE 1.90+. Use a supported LE version with these fields for complete date discovery. TOC date-restriction bypass requires LE 1.67+.
3. Register/request these read scopes, retaining any other scopes your deployment needs:
   `dropbox:folders:read quizzing:quizzes:read discussions:forums:readonly discussions:topics:readonly content:toc:read content:modules:readonly content:topics:readonly orgunits:sourcecourses:read`
4. Give the service user the corresponding tool permissions and access to the source/target courses, including hidden activities. Launch through Brightspace, enter the actual numeric OrgUnitId, and choose **Read activities**. Raw responses and JSON output are optional checkboxes.

The protected endpoint is `GET /diagnostics/activities?orgUnitId=12345`. Add `format=json` for JSON and `raw=1` to include original API response bodies. A valid ltijs session (`ltik`) is required; the launch form carries it automatically. Do not share session URLs. Responses use `Cache-Control: no-store`. Raw output can contain quiz passwords and other sensitive tool settings; it is accessible to authorized tool launchers and is omitted by default.

### Discovery and Activity contract

`src/brightspace/client.js` exports `createBrightspaceClient({ get, leRoot, lpRoot })` for shared read-only transport and pagination. The activity clients use it to read their respective APIs. `src/services/activityDiscovery.js` exports `createActivityDiscovery({ assignments, quizzes, discussions, content })`, which takes those clients. `discover(orgUnitId, { includeRaw: false })` returns `{ orgUnitId, activities, contentLinks, warnings }`, with `raw` added only when requested. Reads cover Assignments (Dropbox folders), every quiz page, all discussion forums and their topics, and recursive Content TOC modules/topics. Content details are read for every TOC entry because the TOC alone omits due dates. TOC retrieval includes `ignoreDateRestrictions=true` so scheduled items are not omitted merely because their dates hide them.

Each Activity has `type`, string `id`, nullable string `parentId`, `name`, string `orgUnitId`, nullable `startDate`, `dueDate`, `endDate`, and `metadata`. Types are `assignment`, `quiz`, `discussionForum`, `discussionTopic`, `contentModule`, and `contentTopic`. Identity is `(orgUnitId, type, id)`; IDs from different tools can collide. Parents are assignment/quiz category IDs, discussion forum IDs, or Content module IDs as applicable. Only activities with at least one non-null primary date appear in `activities`. Undated parents are still traversed.

Dates retain their original strings, timezone and precision. Missing dates normalize to null. Metadata preserves returned date-related fields, exact availability types (including zero/string/null), calendar/visibility flags, category/forum IDs, and activity/tool identifiers. Assignment availability metadata remains nested and its type fields are also exposed at the metadata root. Omitted metadata fields remain omitted. Legacy discussion posting/unlock dates and pacing dates are retained as metadata, not substituted for primary activity dates. Normalized metadata excludes unrelated fields such as quiz passwords.

Content native references (ActivityType 3/4/5/6) are excluded as independent activities even when the native item cannot be matched. `contentLinks` retains every such occurrence, including undated/repeated/broken links, its Content dates and metadata, and the exact `ActivityId`, `ActivityType`, `ToolId`, and `ToolItemId` values. Matching uses ActivityId or ActivityType plus ToolItemId; numeric IDs alone and titles are never enough. Unknown activity types can also be matched by ActivityId. Unresolved or ambiguous references have `nativeActivity: null` and a warning. Native dates remain authoritative; Content dates never overwrite them. Other Content items remain independently eligible.

Reads are sequential to limit request bursts. Pagination follows same-tenant HTTPS API URLs and rejects cycles and malformed responses. Any failed API read fails discovery instead of presenting a partial list as complete. A diagnostic failure returns HTTP 502; invalid IDs return 400; unauthorized access returns 403. Results are limited to what the service user's permissions expose; an empty API list cannot prove that no hidden activities exist. Source Course helpers are independent so lack of Source Courses support does not block ordinary discovery.

### Source Course helpers

All three helpers return the original LP response and accept an optional sub-organization ID as the second argument:

- `getCurrentReofferedCourse(sourceOrgUnitId, subOrganizationOrgUnitId)`
- `getAllReofferedCourses(sourceOrgUnitId, subOrganizationOrgUnitId)`
- `getSourceCourse(courseOfferingId, subOrganizationOrgUnitId)`

They use `/sourceCourses/{id}/currentReofferedCourse`, `/sourceCourses/{id}/reofferedCourses`, and `/sourceCourses/courseOfferings/{id}` respectively. The first two take a **source** course ID; the third takes a **course offering** ID. They do not create or re-offer courses. HTTP errors, including 403/404/429, remain failures rather than empty results.

### Fixtures and live verification

`test/fixtures/*.json` contains synthetic API-shaped examples, not captured tenant data. Tests cover each normalizer, nested/null/omitted dates, due-only Content, availability types, native-link deduplication, multiple quiz pages, empty courses, unsafe pagination, failed reads, Source Course paths, and protected HTML/JSON diagnostics. Run `npm test` and `npm run check` using Node 22.

A live acceptance check still requires the configured Brightspace tenant: compare a course containing dated and undated native activities, nested Content, repeated native links, and future/expired items against the diagnostic; then exercise the three Source Course helpers with known relationships. API visibility and fields depend on tenant version and service-user permissions. Per-user special-access dates and unrelated tools are outside this spike.

API contracts: [Assignments](https://docs.valence.desire2learn.com/res/dropbox.html), [Quizzes](https://docs.valence.desire2learn.com/res/quiz.html), [Discussions](https://docs.valence.desire2learn.com/res/discuss.html), [Content and TOC](https://docs.valence.desire2learn.com/res/content.html), [Source Courses](https://docs.valence.desire2learn.com/res/course.html), [pagination](https://docs.valence.desire2learn.com/basic/apicall.html).

### Code organization

```text
index.js                          # LTI setup and dependency wiring
src/
  brightspace/
    auth.js                       # Existing Private Key JWT OAuth and token cache
    deploymentGuard.js            # Validated Brightspace LTI deployment check
    client.js                     # Authenticated GET, URL guards and pagination
    id.js                         # Shared Brightspace ID validation
    activities/
      assignments.js              # Assignment API reads
      quizzes.js                  # Quiz API reads
      discussions.js              # Forum and topic API reads
      content.js                  # TOC and Content detail reads
    sourceCourses.js              # Source Course relationship reads
  config/
    database.js                   # Dedicated MongoDB database configuration
  routes/
    discoveryDiagnostics.js       # Diagnostic form, handlers and user access
  services/
    activityDiscovery.js          # Read orchestration and diagnostic result
    activityNormalizer.js         # Pure Activity mapping and Content reconciliation
```

`src/routes/discoveryDiagnostics.js` is the HTTP presentation/access layer. Test files in `test/` and fixtures in `test/fixtures/` exercise the modules through their new paths. Deploy the entire `src/` directory along with `index.js` and `package.json`.

Source Course helpers are created separately with `createSourceCoursesClient(brightspaceClient)` from `src/brightspace/sourceCourses.js`; activity discovery does not depend on them. `createBrightspaceGet({ http, oauth, baseUrl })` in the shared client module supplies the existing authenticated GET transport. Tests can inject a mock GET without loading axios, ltijs or tenant secrets.
