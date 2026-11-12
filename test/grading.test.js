const test = require('node:test');
const assert = require('node:assert/strict');
const { rubricFor, validateGrade, weightedGrade } = require('../src/grading');

test('rubrics compute a weighted grade and reject missing or out-of-range feedback', () => {
  const rubric = rubricFor({ grading: [
    { id: 'writing', label: 'Writing', weight: 2, criteria: 'Check clarity.' },
    { id: 'simplicity', label: 'Simplicity', weight: 3, criteria: 'Check directness.' },
    { id: 'correctness', label: 'Correctness', weight: 5, criteria: 'Check inferences.' },
  ] });
  const grade = {
    scores: [
      { id: 'correctness', score: 8, reason: 'Minor slip.' },
      { id: 'writing', score: 10, reason: 'Clear.' },
      { id: 'simplicity', score: 9, reason: 'Direct.' },
    ],
    comments: [{ line: 2, comment: 'Fix the sign here.' }],
  };
  const validated = validateGrade(JSON.stringify(grade), rubric, 3);
  assert.equal(weightedGrade(rubric, validated.scores), 8.7);
  assert.throws(() => validateGrade(JSON.stringify(grade), rubric, 1));
  grade.scores[0].score = 11;
  assert.throws(() => validateGrade(JSON.stringify(grade), rubric, 3));
  assert.deepEqual(rubricFor({ grading: [rubric[0], rubric[0]] }), []);
});
