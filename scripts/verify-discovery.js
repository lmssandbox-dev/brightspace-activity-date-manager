'use strict';

// Read-only live acceptance runner. Uses the same OAuth and API clients as the
// app; it neither starts ltijs/MongoDB nor prints raw API responses or secrets.
const { id } = require('../src/brightspace/id');
const { assessDiscovery } = require('./discovery-acceptance');
const { createBrightspaceAuth } = require('../src/brightspace/auth');
const { createBrightspaceClient, createBrightspaceGet } = require('../src/brightspace/client');
const { createAssignmentsClient } = require('../src/brightspace/activities/assignments');
const { createQuizzesClient } = require('../src/brightspace/activities/quizzes');
const { createDiscussionsClient } = require('../src/brightspace/activities/discussions');
const { createContentClient } = require('../src/brightspace/activities/content');
const { createActivityDiscovery } = require('../src/services/activityDiscovery');

async function main() {
  if (process.argv.length !== 4) throw new Error('usage');
  const offeringId = id(process.argv[2]);
  const sourceId = id(process.argv[3]);
  if (offeringId === sourceId) throw new Error('different contexts required');
  require('dotenv').config();
  const http = require('axios');
  const env = process.env;
  const required = ['BS_URL', 'D2L_LP_VERSION', 'D2L_LE_VERSION', 'D2L_OAUTH2_CLIENT_ID',
    'D2L_OAUTH2_PRIVATE_KEY', 'D2L_OAUTH2_KEY_ID', 'D2L_OAUTH2_SCOPES'];
  if (required.some(key => !env[key] || /replace|placeholder|your-tenant/i.test(env[key]))) throw new Error('configuration required');
  const oauth = createBrightspaceAuth({ http, clientId: env.D2L_OAUTH2_CLIENT_ID,
    scope: env.D2L_OAUTH2_SCOPES, kid: env.D2L_OAUTH2_KEY_ID,
    privateKeyPem: env.D2L_OAUTH2_PRIVATE_KEY, tokenEndpoint: env.D2L_OAUTH2_TOKEN_ENDPOINT });
  const api = createBrightspaceClient({
    get: createBrightspaceGet({ http, oauth, baseUrl: env.BS_URL }),
    leRoot: `${env.BS_URL}/d2l/api/le/${env.D2L_LE_VERSION}`,
    lpRoot: `${env.BS_URL}/d2l/api/lp/${env.D2L_LP_VERSION}`
  });
  const discovery = createActivityDiscovery({ assignments: createAssignmentsClient(api),
    quizzes: createQuizzesClient(api), discussions: createDiscussionsClient(api), content: createContentClient(api) });
  for (const [context, orgUnitId] of [['Course Offering', offeringId], ['Source Course', sourceId]]) {
    try {
      const result = await discovery.discover(orgUnitId);
      const assessment = assessDiscovery(result);
      if (!assessment.passed) process.exitCode = 1;
      console.log(JSON.stringify({ context, orgUnitId, status: assessment.passed ? 'passed' : 'incomplete',
        checks: assessment.checks, counts: result.counts, relationships: result.contentRelationships.length,
        warnings: result.warnings }, null, 2));
    } catch {
      console.log(JSON.stringify({ context, orgUnitId, status: 'failed',
        error: 'Discovery or canonical-identity check failed. Check versions, permissions, scopes and diagnostic output.' }));
      process.exitCode = 1;
    }
  }
}

main().catch(() => {
  console.error('Live verification could not start. Use: npm run verify:discovery -- <offeringOrgUnitId> <sourceOrgUnitId>, with installed dependencies and configured OAuth environment.');
  process.exitCode = 1;
});
