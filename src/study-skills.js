const { stripFrontmatter } = require('./intro-model');

module.exports = {
  proofTutor: stripFrontmatter(require('../skills/buches-proof-tutor/SKILL.md')),
  proofReviewer: stripFrontmatter(require('../skills/buches-proof-reviewer/SKILL.md')),
};
