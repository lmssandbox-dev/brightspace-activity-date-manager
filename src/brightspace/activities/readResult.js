'use strict';
function recordWarning(source, error, itemId) {
  return { source, code: error.code === 'INVALID_DATE' ? 'INVALID_DATE' : 'INVALID_RECORD',
    message: error.code === 'INVALID_DATE' ? 'An activity has an invalid timestamp and was excluded.' : 'An invalid activity record was excluded.',
    details: { ...(itemId != null ? { id: String(itemId) } : {}), ...(error.field ? { field: error.field } : {}) } };
}
function normalizeRows(rows, normalize, orgUnitId, source, getId) {
  const activities = [], warnings = [];
  for (const row of rows) {
    try { activities.push(normalize(row, orgUnitId)); }
    catch (error) { warnings.push(recordWarning(source, error, row && getId(row))); }
  }
  return { activities, warnings };
}
module.exports = { normalizeRows, recordWarning };
