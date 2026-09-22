'use strict';
const { normalizeAssignment } = require('./normalizers');
const { normalizeRows } = require('./readResult');
// Scope: dropbox:folders:read
function createAssignmentsClient({ list, coursePath }) {
  return { async getAssignments(orgUnitId, raw) {
    return normalizeRows(await list(coursePath(orgUnitId, 'dropbox/folders/'), raw), normalizeAssignment,
      orgUnitId, 'assignments', row => row.Id);
  } };
}
module.exports = { createAssignmentsClient };
