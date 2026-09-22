'use strict';

const { id, normalizeAssignment, normalizeQuiz, normalizeDiscussionForum,
  normalizeDiscussionTopic, flattenToc, normalizeContent, reconcileContent } = require('./activityNormalizer');

// Orchestrates reads; API paths and authentication belong to the Brightspace layer.
function createActivityDiscovery({ assignments, quizzes, discussions, content: contentClient }) {
  const { getAssignments } = assignments;
  const { getQuizzes } = quizzes;
  const { getDiscussionForums, getDiscussionTopics } = discussions;
  const { getContentToc } = contentClient;
  return {
    async discover(orgUnitId, { includeRaw = false } = {}) {
      orgUnitId = id(orgUnitId);
      const raw = includeRaw ? [] : undefined;
      // Serial calls keep this exploratory spike gentle on tenant rate limits.
      // Any failed read aborts discovery, never masquerading as a complete list.
      const assignments = await getAssignments(orgUnitId, raw);
      const quizzes = await getQuizzes(orgUnitId, raw);
      const forums = await getDiscussionForums(orgUnitId, raw);
      const native = [
        ...assignments.map(row => normalizeAssignment(row, orgUnitId)),
        ...quizzes.map(row => normalizeQuiz(row, orgUnitId)),
        ...forums.map(row => normalizeDiscussionForum(row, orgUnitId))
      ];
      for (const forum of forums) {
        const topics = await getDiscussionTopics(orgUnitId, forum.ForumId, raw);
        native.push(...topics.map(row => normalizeDiscussionTopic({ ...row, ForumId: forum.ForumId }, orgUnitId)));
      }
      const toc = await getContentToc(orgUnitId, raw);
      const content = [];
      for (const entry of flattenToc(toc)) {
        // TOC alone omits due dates; details are necessary even for undated TOC rows.
        const detail = await (entry.kind === 'module' ? contentClient.getContentModule : contentClient.getContentTopic)(orgUnitId, entry.id, raw);
        if (!detail || typeof detail !== 'object' || Array.isArray(detail) || id(detail.Id) !== entry.id) {
          throw new Error('Invalid Brightspace content detail response');
        }
        content.push(normalizeContent(entry, orgUnitId, detail));
      }
      const result = reconcileContent(native, content);
      return {
        orgUnitId, ...result,
        warnings: result.contentLinks.filter(link => link.status !== 'matched').map(link =>
          `Content ${link.contentId}: ${link.status} native relationship; excluded as an independent activity.`),
        ...(includeRaw ? { raw } : {})
      };
    }
  };
}

module.exports = { createActivityDiscovery };
