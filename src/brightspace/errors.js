'use strict';
class ApiReadError extends Error {
  constructor(status, fatal = false) {
    super('Brightspace API read failed');
    this.code = 'API_READ_FAILED';
    this.status = Number.isInteger(status) ? status : null;
    this.fatal = fatal || status === 401 || status === 403 || status === 429 || status === 503 || status == null;
  }
}
function apiWarning(source, error, details = {}) {
  return { source, code: 'API_READ_FAILED', message: `Unable to read ${source}; discovery is incomplete.`,
    details: { ...details, ...(Number.isInteger(error.status) ? { httpStatus: error.status } : {}) } };
}
module.exports = { ApiReadError, apiWarning };
