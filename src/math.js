const { MarkdownRenderer, loadMathJax, renderMath, finishRenderMath } = require('obsidian');

// Render placeholders after Markdown. Typst Mate intercepts Obsidian's regular
// math pipeline globally, so these formulas are routed per reader block.
const TOKENS = /^(?:[ \t]*> ?)*[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^(?:[ \t]*> ?)*[ \t]*\1[`~]*[ \t]*(?=\r?$)|(?![\s\S]))|<!--[^]*?-->|%%[^]*?%%|(`+)[\s\S]*?\2|\$\$([\s\S]+?)\$\$|\$((?:\\.|[^\r\n$\\])+?)\$|\\\[((?:\\(?!\])[\s\S]|[^\\])+?)\\\]|\\\(((?:\\(?!\))[^\r\n]|[^\\\r\n])+?)\\\)|\\[^\r\n]/gm;

function normalizeLatexDelimiters(source) {
  return source.replace(TOKENS, (match, _fence, _code, _display, _inline, latexDisplay, latexInline) => {
    if (latexDisplay !== undefined) return `$$${latexDisplay}$$`;
    if (latexInline !== undefined) return `$${latexInline.trim()}$`;
    return match;
  });
}

function extractMath(source, allowLatexDelimiters = true) {
  const formulas = [];
  const prefix = `buches-${Math.random().toString(36).slice(2)}-`;
  const markdown = source.replace(TOKENS, (match, _fence, _code, display, inline, latexDisplay, latexInline) => {
    const block = display ?? (allowLatexDelimiters ? latexDisplay : undefined);
    const math = block ?? inline ?? (allowLatexDelimiters ? latexInline : undefined);
    if (math === undefined) return match;
    const id = prefix + formulas.length;
    formulas.push({
      id, source: block === undefined ? math : math.replace(/^(?:[ \t]*> ?)+/gm, ''),
      display: block !== undefined, literal: match,
    });
    return `<span data-buches-formula="${id}"></span>`;
  });
  return { markdown, formulas };
}

function typstMate(app) {
  return app.plugins?.plugins?.['typst-mate'];
}

async function renderMarkdown(app, source, target, path, component, engine) {
  const { markdown, formulas } = extractMath(source, engine === 'mathjax');
  await MarkdownRenderer.render(app, markdown, target, path, component);
  if (!formulas.length) return;
  const mate = typstMate(app);
  let mathJaxUsed = false;
  if (engine === 'mathjax') await loadMathJax();
  for (const formula of formulas) {
    const slot = target.querySelector(`[data-buches-formula="${formula.id}"]`);
    if (!slot) continue;
    slot.addClass(formula.display ? 'buches-display-math' : 'buches-inline-math');
    try {
      if (engine === 'typst') {
        const manager = mate?.typstManager;
        if (!manager?.ready || typeof manager.render !== 'function') throw new Error('Typst Mate is unavailable');
        const el = target.ownerDocument.createElement('span');
        const directory = path.slice(0, path.lastIndexOf('/'));
        const rendered = manager.render(formula.source, el, formula.display ? 'display' : 'inline', directory, path);
        if (!rendered) throw new Error('Typst Mate did not return rendered math');
        slot.append(rendered);
      } else {
        const native = mate?.originalTex2chtml;
        const rendered = typeof native === 'function'
          ? native(formula.source, { display: formula.display })
          : renderMath(formula.source, formula.display);
        slot.append(rendered);
        mathJaxUsed = true;
      }
    } catch (error) {
      slot.addClass('buches-math-unavailable');
      slot.setText(formula.literal);
      slot.setAttribute('title', error.message);
    }
  }
  if (mathJaxUsed) finishRenderMath?.();
}

module.exports = { renderMarkdown, typstMate, extractMath, normalizeLatexDelimiters };
