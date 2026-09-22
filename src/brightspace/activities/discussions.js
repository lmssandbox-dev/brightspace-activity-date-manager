'use strict';
const { id } = require('../id');
const { normalizeDiscussionForum, normalizeDiscussionTopic } = require('./normalizers');
const { normalizeRows } = require('./readResult');
// Scopes: discussions:forums:readonly, discussions:topics:readonly.
// Topic DueDate is available from LE 1.90; absent fields remain null.
function createDiscussionsClient({ list, coursePath }) {
  return {
    async getDiscussionForums(orgUnitId, raw) {
      const rows = await list(coursePath(orgUnitId, 'discussions/forums/'), raw);
      const result = normalizeRows(rows, normalizeDiscussionForum, orgUnitId, 'discussionForums', row => row.ForumId);
      // Invalid forum dates must not prevent reading its children.
      return { ...result, forumIds: rows.flatMap(row => { try { return [id(row.ForumId)]; } catch { return []; } }) };
    },
    async getDiscussionTopics(orgUnitId, forumId, raw) {
      const rows = await list(coursePath(orgUnitId, `discussions/forums/${id(forumId)}/topics/`), raw);
      const result = normalizeRows(rows, row => normalizeDiscussionTopic({ ...row, ForumId: forumId }, orgUnitId),
        orgUnitId, 'discussionTopics', row => row.TopicId);
      return result;
    }
  };
}
module.exports = { createDiscussionsClient };
