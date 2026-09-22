'use strict';

const { id } = require('../id');

function createContentClient({ read, coursePath }) {
  return {
    getContentToc: (orgUnitId, raw) => read(coursePath(orgUnitId, 'content/toc?ignoreDateRestrictions=true'), raw),
    getContentModule: (orgUnitId, moduleId, raw) => read(coursePath(orgUnitId, `content/modules/${id(moduleId)}`), raw),
    getContentTopic: (orgUnitId, topicId, raw) => read(coursePath(orgUnitId, `content/topics/${id(topicId)}`), raw)
  };
}

module.exports = { createContentClient };
