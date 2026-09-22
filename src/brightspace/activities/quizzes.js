'use strict';

function createQuizzesClient({ list, coursePath }) {
  return { getQuizzes: (orgUnitId, raw) => list(coursePath(orgUnitId, 'quizzes/'), raw) };
}

module.exports = { createQuizzesClient };
