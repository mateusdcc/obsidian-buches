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

const ROUTER_TAG = Symbol('buchesTex2chtmlRouter');

function typstMate(app) {
  return app.plugins?.plugins?.['typst-mate'];
}

function directoryFor(path) {
  const slash = path.lastIndexOf('/');
  return slash < 0 ? '/' : `/${path.slice(0, slash + 1)}`;
}

function renderFormula(app, source, display, path, engine, doc, containerTag = 'span') {
  const mate = typstMate(app);
  if (engine === 'typst') {
    const manager = mate?.typstManager;
    if (!manager?.ready || typeof manager.render !== 'function') throw new Error('Typst Mate is unavailable');
    const el = doc.createElement(containerTag);
    if (containerTag === 'mjx-container') {
      el.className = 'Mathjax';
      el.setAttribute('jax', 'CHTML');
    }
    const rendered = manager.render(source, el, display ? 'display' : 'inline', directoryFor(path), path);
    if (!rendered) throw new Error('Typst Mate did not return rendered math');
    return rendered;
  }
  const native = mate?.originalTex2chtml;
  return typeof native === 'function' ? native(source, { display }) : renderMath(source, display);
}

// Route Obsidian Live Preview and embed math calls to the owning solution note's engine.
class SolutionMathRouter {
  constructor(app, getWin = () => (typeof window !== 'undefined' ? window : null)) {
    this.app = app;
    this.getWin = getWin;
    this.scopes = new Set();
    this.stack = [];
    this.activeScope = null;
    this.loading = new Map();
    this.delegate = null;
    this.wrapper = (source, options) => this.renderTex2chtml(source, options);
    this.wrapper[ROUTER_TAG] = true;
  }

  ensureInstalled() {
    const mathJax = this.getWin()?.MathJax;
    if (typeof mathJax?.tex2chtml !== 'function' || mathJax.tex2chtml[ROUTER_TAG]) return;
    this.delegate = mathJax.tex2chtml;
    mathJax.tex2chtml = this.wrapper;
  }

  unload() {
    const mathJax = this.getWin()?.MathJax;
    if (mathJax?.tex2chtml === this.wrapper && this.delegate) mathJax.tex2chtml = this.delegate;
    this.delegate = null;
    this.scopes.clear();
    this.stack = [];
    this.activeScope = null;
    this.loading.clear();
  }

  registerScope(scope) {
    this.scopes.add(scope);
    return () => {
      this.scopes.delete(scope);
      this.loading.delete(scope);
      if (this.activeScope === scope) this.activeScope = null;
    };
  }

  activate(scope) {
    this.ensureInstalled();
    this.activeScope = scope;
  }

  async withLoading(scope, fn) {
    this.activate(scope);
    this.loading.set(scope, (this.loading.get(scope) ?? 0) + 1);
    try {
      return await fn();
    } finally {
      const next = (this.loading.get(scope) ?? 1) - 1;
      if (next > 0) this.loading.set(scope, next);
      else this.loading.delete(scope);
    }
  }

  withScope(scope, fn) {
    this.activate(scope);
    this.stack.push(scope);
    try {
      return fn();
    } finally {
      this.stack.pop();
    }
  }

  resolveScope() {
    if (this.stack.length) return this.stack[this.stack.length - 1];
    const activeEl = this.getWin()?.document?.activeElement;
    for (const scope of this.scopes) {
      if (scope.host?.isConnected && scope.host.contains?.(activeEl)) return scope;
    }
    const candidate = this.activeScope;
    if (!candidate?.host?.isConnected) return null;
    if (!candidate.isEditing?.() && !this.loading.has(candidate)) return null;
    if (activeEl) {
      const leaf = activeEl.closest?.('.workspace-leaf-content');
      const type = leaf?.dataset?.type;
      if ((type === 'markdown' || type === 'buches-reader') && !leaf.contains?.(candidate.host)) return null;
      const editor = activeEl.closest?.('.cm-editor');
      if (editor && !candidate.host.contains?.(editor)) return null;
    }
    return candidate;
  }

  renderTex2chtml(source, options) {
    const scope = this.resolveScope();
    if (!scope) return this.delegate?.(source, options);
    const display = Boolean(options?.display);
    const engine = scope.getEngine();
    const doc = scope.host?.ownerDocument ?? this.getWin()?.document;
    try {
      if (engine === 'typst') {
        const manager = typstMate(this.app)?.typstManager;
        if (!manager?.ready || typeof manager.render !== 'function') return this.delegate?.(source, options);
        return renderFormula(this.app, source, display, scope.getPath(), 'typst', doc, 'mjx-container');
      }
      const native = typstMate(this.app)?.originalTex2chtml;
      if (typeof native === 'function') return native(source, { display });
    } catch (error) {
      console.error('Buches embed math:', error);
    }
    return this.delegate?.(source, options);
  }
}

async function renderMarkdown(app, source, target, path, component, engine) {
  const { markdown, formulas } = extractMath(source, engine === 'mathjax');
  await MarkdownRenderer.render(app, markdown, target, path, component);
  if (!formulas.length) return;
  let mathJaxUsed = false;
  if (engine === 'mathjax') await loadMathJax();
  for (const formula of formulas) {
    const slot = target.querySelector(`[data-buches-formula="${formula.id}"]`);
    if (!slot) continue;
    slot.addClass(formula.display ? 'buches-display-math' : 'buches-inline-math');
    try {
      slot.append(renderFormula(app, formula.source, formula.display, path, engine, target.ownerDocument));
      if (engine !== 'typst') mathJaxUsed = true;
    } catch (error) {
      slot.addClass('buches-math-unavailable');
      slot.setText(formula.literal);
      slot.setAttribute('title', error.message);
    }
  }
  if (mathJaxUsed) finishRenderMath?.();
}

module.exports = { renderMarkdown, typstMate, extractMath, normalizeLatexDelimiters, renderFormula, SolutionMathRouter };
