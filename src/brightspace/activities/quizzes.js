'use strict';
const { normalizeQuiz } = require('./normalizers');
const { normalizeRows } = require('./readResult');
// Scope: quizzing:quizzes:read. Pagination is handled by the shared adapter.
function createQuizzesClient({ list, coursePath }) {
  return { async getQuizzes(orgUnitId, raw) {
    return normalizeRows(await list(coursePath(orgUnitId, 'quizzes/'), raw), normalizeQuiz,
      orgUnitId, 'quizzes', row => row.QuizId);
  } };
}
module.exports = { createQuizzesClient };
