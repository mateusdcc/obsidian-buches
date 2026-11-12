const { stripFrontmatter } = require('./intro-model');

function dividerLines(lines) {
  const markers = [];
  let fence = '';
  let math = false;
  let comment = false;
  for (const [index, line] of lines.entries()) {
    const code = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (fence) {
      if (code && code[1][0] === fence[0] && code[1].length >= fence.length && !code[2].trim()) fence = '';
    } else if (math) {
      if (line.includes('$$')) math = false;
    } else if (comment || line.includes('<!--')) {
      for (const marker of line.match(/<!--|-->/g) ?? []) comment = marker === '<!--';
    } else if (/^ {0,3}\$\$(?!.*\$\$)/.test(line)) {
      math = true;
    } else if (code) {
      fence = code[1];
    } else if (/^ {0,3}---[ \t]*$/.test(line)) {
      markers.push(index);
    }
  }

  return markers;
}

function splitResolutions(text) {
  const lines = stripFrontmatter(text, false).split(/\r?\n/);
  const markers = dividerLines(lines);
  const blocks = [];
  let cursor = 0;
  for (let i = 0; i + 1 < markers.length; i += 2) {
    const start = markers[i];
    const end = markers[i + 1];
    const proof = lines.slice(start + 1, end).join('\n');
    if (!proof.trim()) continue;
    blocks.push({ markdown: lines.slice(cursor, start).join('\n'), solution: false });
    blocks.push({ markdown: proof, solution: true });
    cursor = end + 1;
  }
  blocks.push({ markdown: lines.slice(cursor).join('\n'), solution: false });
  return blocks;
}

module.exports = { splitResolutions, dividerLines };
