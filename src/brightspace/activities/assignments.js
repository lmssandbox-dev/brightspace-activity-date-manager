'use strict';

function createAssignmentsClient({ list, coursePath }) {
  return { getAssignments: (orgUnitId, raw) => list(coursePath(orgUnitId, 'dropbox/folders/'), raw) };
}

module.exports = { createAssignmentsClient };
