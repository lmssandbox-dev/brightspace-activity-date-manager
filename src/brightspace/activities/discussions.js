'use strict';

const { id } = require('../id');

function createDiscussionsClient({ list, coursePath }) {
  return {
    getDiscussionForums: (orgUnitId, raw) => list(coursePath(orgUnitId, 'discussions/forums/'), raw),
    getDiscussionTopics: (orgUnitId, forumId, raw) =>
      list(coursePath(orgUnitId, `discussions/forums/${id(forumId)}/topics/`), raw)
  };
}

module.exports = { createDiscussionsClient };
