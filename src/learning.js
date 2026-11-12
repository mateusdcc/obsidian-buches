const { stripFrontmatter } = require('./intro-model');
const { dividerLines } = require('./resolution');
const { flattenConcepts } = require('./buch-model');

const LEARNING_TYPES = new Set(['definition', 'theorem', 'lemma', 'proposition', 'corollary', 'example', 'exercise']);
const ADDED_SOLUTION = '<!-- buches-added-solution -->';
const SOLUTION_ENGINE = /^<!-- buches-math: (mathjax|typst) -->[ \t]*(?:\r?\n|$)/;

function sourceParts(text) {
  const body = stripFrontmatter(text, false);
  const lines = body.split(/(?<=\n)/);
  const offsets = [text.length - body.length];
  for (const line of lines) offsets.push(offsets.at(-1) + line.length);
  const dividers = dividerLines(lines.map(line => line.replace(/\r?\n$/, '')));
  const parts = [];
  let start = offsets[0];
  for (let index = 0; index + 1 < dividers.length; index += 2) {
    const open = dividers[index];
    const close = dividers[index + 1];
    parts.push({ start, end: offsets[open] });
    parts.push({ start: offsets[open + 1], end: offsets[close], type: 'solution' });
    start = offsets[close + 1];
  }
  parts.push({ start, end: text.length });
  return parts;
}

async function parsePage(text, metadata) {
  const units = [];
  for (const part of sourceParts(text)) {
    const source = text.slice(part.start, part.end);
    if (part.type === 'solution') {
      const added = source.startsWith(ADDED_SOLUTION + '\n') || source.startsWith(ADDED_SOLUTION + '\r\n');
      const body = added ? source.slice(source.indexOf('\n') + 1) : source;
      const engine = body.match(SOLUTION_ENGINE)?.[1];
      units.push({ ...part, source, engine, added, markdown: body.replace(SOLUTION_ENGINE, '') });
      continue;
    }
    if (!source.trim()) continue;
    const parsed = await metadata(source);
    if (!parsed?.sections?.length) {
      units.push({ ...part, source, markdown: source, type: 'text' });
      continue;
    }
    const firstLine = text.slice(0, part.start).split("\n").length - 1;
    for (const section of parsed.sections) {
      const { start, end } = section.position;
      const markdown = source.slice(start.offset, end.offset);
      const callout = markdown.match(/^ {0,3}>\s*\[!([\w-]+)\][-+]?[^\S\r\n]*(.*)/);
      const heading = parsed.headings?.find(item => item.position.start.offset === start.offset);
      units.push({
        start: part.start + start.offset, end: part.start + end.offset, source: markdown, markdown,
        anchor: section.id, type: section.type, callout: callout?.[1].toLowerCase(),
        title: heading?.heading ?? callout?.[2]?.trim(), level: heading?.level, line: firstLine + start.line,
      });
    }
  }

  const nodes = [];
  const occurrences = new Map();
  const legacyOccurrences = new Map();
  let prompt;
  let lastHeading;
  let hints = [];
  let solutionCount = 0;
  const count = (map, key) => {
    const value = (map.get(key) ?? 0) + 1;
    map.set(key, value);
    return value;
  };

  for (const unit of units) {
    if (unit.type === 'heading') {
      lastHeading = unit.level >= 2 ? unit.title : undefined;
      prompt = undefined;
      hints = [];
    }
    const type = LEARNING_TYPES.has(unit.callout) ? unit.callout
      : unit.type === 'heading' && /^Exercise\b/i.test(unit.title ?? '') ? 'exercise' : null;
    if (type) {
      const title = unit.title || unit.callout;
      const key = `${type}:${title}`;
      unit.node = { id: unit.anchor ? `^${unit.anchor}` : `${key}#${count(occurrences, key)}`, title, type, unit };
      nodes.push(unit.node);
      if (type === 'exercise') {
        prompt = unit.node;
        prompt.prompt = [];
        hints = [];
      }
    }
    if (unit.callout === 'hint') hints.push(unit);
    if (unit.type !== 'solution') {
      if (prompt && unit !== prompt.unit && !unit.callout && !hints.length) prompt.prompt.push(unit.markdown);
      continue;
    }
    // Added solutions already belong to a named exercise. Keep positional IDs in old books stable.
    if (unit.added && !prompt) continue;
    let legacyId;
    if (!unit.added) {
      solutionCount++;
      legacyId = lastHeading ? `${lastHeading}#${count(legacyOccurrences, lastHeading)}` : `solution-${solutionCount}`;
    }
    if (!prompt) {
      prompt = { id: legacyId, title: lastHeading ?? `Exercise ${solutionCount}`, type: 'exercise', unit };
      nodes.push(prompt);
    }
    prompt.legacyId = legacyId;
    unit.exercise = prompt;
    prompt.solution = unit;
    unit.hints = hints;
    for (const hint of hints) hint.inSolution = true;
    prompt = undefined;
    hints = [];
  }
  return { units, nodes };
}

class LearningIndex {
  constructor(app) { this.app = app; this.pages = new Map(); }

  async page(file, text) {
    const source = text ?? await this.app.vault.cachedRead(file);
    const cached = this.pages.get(file.path);
    if (cached?.source === source) return cached.page;
    const cache = this.app.metadataCache;
    const page = parsePage(source, chunk => cache.computeMetadataAsync?.(new TextEncoder().encode(chunk).buffer));
    this.pages.set(file.path, { source, page });
    return page;
  }

  async book(book) {
    const chapters = await Promise.all(flattenConcepts(book.concepts).map(async concept => ({
      ...concept, ...await this.page(concept.file), path: concept.file.path,
      dependencies: [],
    })));
    const byPath = new Map(chapters.map(chapter => [chapter.path, chapter]));
    const targets = new Map();
    for (const chapter of chapters) {
      chapter.key = chapter.path;
      targets.set(chapter.key, chapter);
      for (const node of chapter.nodes) targets.set(`${chapter.path}#${node.id}`, {
        ...node, key: `${chapter.path}#${node.id}`, path: chapter.path, file: chapter.file, dependencies: [],
      });
    }
    const issues = [];
    const add = (owner, links) => {
      const values = Array.isArray(links) ? links : links ? [links] : [];
      for (const value of values) {
        const link = typeof value === 'string' && value.trim().replace(/^\[\[([^|\]]+)(?:\|[^\]]*)?\]\]$/, '$1');
        const [path, fragment] = link ? link.split('#') : [];
        const dest = link && (path ? this.app.metadataCache.getFirstLinkpathDest(path, owner.path) : owner.file);
        const target = dest && targets.get(fragment ? `${dest.path}#${fragment}` : dest.path);
        if (!target) issues.push(`${owner.title ?? owner.name}: unresolved prerequisite ${String(value)}`);
        if (!target || !owner.dependencies.includes(target)) owner.dependencies.push(target || null);
      }
    };
    for (const chapter of chapters) {
      const fm = this.app.metadataCache.getFileCache(chapter.file)?.frontmatter;
      add(chapter, fm?.depends_on);
      for (const [id, links] of Object.entries(fm?.block_depends_on ?? {})) {
        const owner = targets.get(`${chapter.path}#^${id.replace(/^\^/, '')}`);
        if (owner) add(owner, links);
        else issues.push(`${chapter.name}: unknown block ${id}`);
      }
    }
    const active = new Set();
    const visited = new Set();
    const path = [];
    const visit = target => {
      if (active.has(target)) {
        const cycle = path.slice(path.indexOf(target)).concat(target);
        for (const item of cycle) item.cyclic = true;
        issues.push(`Prerequisite cycle: ${cycle.map(node => node.title ?? node.name).join(' → ')}`);
        return;
      }
      if (visited.has(target)) return;
      active.add(target);
      path.push(target);
      for (const dep of target.dependencies) if (dep) visit(dep);
      path.pop();
      active.delete(target);
      visited.add(target);
    };
    for (const target of targets.values()) visit(target);
    return { book, chapters, byPath, targets, issues };
  }
}

module.exports = { LearningIndex, parsePage, sourceParts, SOLUTION_ENGINE, ADDED_SOLUTION };
