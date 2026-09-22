'use strict';
const { id } = require('../brightspace/id');
const { hasDates } = require('./activityNormalizer');
const { resolveContentRelationships } = require('./contentRelationshipResolver');
const { apiWarning } = require('../brightspace/errors');

function createActivityDiscovery({ assignments, quizzes, discussions, content }) {
  return { async discover(orgUnitId, { includeRaw = false, includeUndated = true } = {}) {
    orgUnitId = id(orgUnitId);
    const raw = includeRaw ? [] : undefined;
    const warnings = [], sources = {};
    let successfulReads = 0;
    async function attempt(source, read, collection = true) {
      try {
        const result = await read();
        successfulReads++;
        warnings.push(...result.warnings);
        sources[source] = { status: result.warnings.length ? 'partial' : 'complete' };
        return result;
      } catch (error) {
        // Authentication, throttling, transport outages and invalid org-unit
        // collection requests must not become a misleading partial success.
        if (error.fatal || (collection && [400, 404].includes(error.status))) throw error;
        warnings.push(apiWarning(source, error));
        sources[source] = { status: 'failed' };
        return null;
      }
    }
    const a = await attempt('assignments', () => assignments.getAssignments(orgUnitId, raw));
    const q = await attempt('quizzes', () => quizzes.getQuizzes(orgUnitId, raw));
    const f = await attempt('discussionForums', () => discussions.getDiscussionForums(orgUnitId, raw));
    const native = [...(a?.activities ?? []), ...(q?.activities ?? []), ...(f?.activities ?? [])];
    for (const forumId of f?.forumIds ?? []) {
      const topics = await attempt(`discussionTopics:${forumId}`, () => discussions.getDiscussionTopics(orgUnitId, forumId, raw), false);
      native.push(...(topics?.activities ?? []));
    }
    const c = await attempt('content', () => content.getContent(orgUnitId, raw));
    if (!successfulReads) throw new Error('All discovery sources failed');
    const nativeByKey = new Map();
    for (const activity of native) {
      if (nativeByKey.has(activity.key)) warnings.push({ source: 'activities', code: 'DUPLICATE_IDENTITY',
        message: 'A native activity occurred more than once; the first record was retained.', details: { key: activity.key } });
      else nativeByKey.set(activity.key, activity);
    }
    const result = resolveContentRelationships([...nativeByKey.values()], c?.items ?? []);
    warnings.push(...result.warnings);
    // Repeated list records must not create duplicate UI selection identities.
    const unique = new Map();
    for (const activity of result.activities) {
      if (unique.has(activity.key)) {
        warnings.push({ source: 'activities', code: 'DUPLICATE_IDENTITY',
          message: 'An activity identity occurred more than once; the first record was retained.', details: { key: activity.key } });
      } else unique.set(activity.key, activity);
    }
    const all = [...unique.values()];
    const activities = includeUndated ? all : all.filter(hasDates);
    return { schemaVersion: 2, orgUnitId, complete: Object.values(sources).every(s => s.status === 'complete') &&
        !warnings.some(w => w.code === 'DUPLICATE_IDENTITY'),
      sources, activities, contentRelationships: result.contentRelationships, contentStructure: result.contentStructure,
      counts: { allActivities: all.length, datedActivities: all.filter(hasDates).length, returnedActivities: activities.length },
      warnings, ...(includeRaw ? { raw } : {}) };
  } };
}
module.exports = { createActivityDiscovery };
