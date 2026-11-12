var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// src/storage.js
var require_storage = __commonJS({
  "src/storage.js"(exports2, module2) {
    var ROOT = "Buches";
    function validateName(value, label = "Name") {
      const name = typeof value === "string" ? value : "";
      if (!name || name.trim() !== name || name === "." || name === ".." || /[\\/:*?"<>|\x00-\x1f\x7f#^[\]]/.test(name) || /[.]$/.test(name) || /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(name)) {
        throw new Error(`${label} is invalid. Avoid leading/trailing spaces, path separators, and reserved characters or names.`);
      }
      return name;
    }
    function isFolder(entry) {
      return !!entry && Array.isArray(entry.children);
    }
    async function ensureFolder(vault, path) {
      const existing = vault.getAbstractFileByPath(path);
      if (existing) {
        if (!isFolder(existing)) throw new Error(`A file exists where a folder is required: ${path}`);
        return existing;
      }
      try {
        await vault.createFolder(path);
      } catch (error) {
        if (!isFolder(vault.getAbstractFileByPath(path))) throw error;
      }
      return vault.getAbstractFileByPath(path);
    }
    async function ensureRoot2(vault) {
      return ensureFolder(vault, ROOT);
    }
    function buchPath(title) {
      return `${ROOT}/${validateName(title, "Buch title")}`;
    }
    function validBuchPath(path) {
      if (typeof path !== "string" || !path.startsWith(`${ROOT}/`)) throw new Error("Invalid Buch path.");
      const name = path.slice(ROOT.length + 1);
      if (validateName(name, "Buch title") !== name) throw new Error("Invalid Buch path.");
      return path;
    }
    async function createBuch2(vault, title) {
      const name = validateName(title, "Buch title");
      const directory = buchPath(name);
      await ensureRoot2(vault);
      if (vault.getAbstractFileByPath(directory)) throw new Error(`A Buch named \u201C${name}\u201D already exists.`);
      await vault.createFolder(directory);
      await vault.createFolder(`${directory}/concepts`);
      return vault.create(`${directory}/_index.md`, `---
title: ${JSON.stringify(name)}
type: buch
created: ${(/* @__PURE__ */ new Date()).toISOString()}
---
`);
    }
    function folderOrder(vault, filePath, cache) {
      const directory = vault.getAbstractFileByPath(filePath.slice(0, filePath.lastIndexOf("/")));
      const siblings = directory?.children?.filter((child) => child.extension === "md") ?? [];
      const orders = siblings.map((file) => cache?.getFileCache(file)?.frontmatter?.order).filter(Number.isFinite);
      return 1 + Math.max(siblings.length, ...orders);
    }
    async function createConcept2(vault, path, value, cache) {
      const name = validateName(value, "Concept name");
      const directory = validBuchPath(path);
      if (!isFolder(vault.getAbstractFileByPath(directory)) || !vault.getAbstractFileByPath(`${directory}/_index.md`)) {
        throw new Error("Buch does not exist.");
      }
      const folder = `${directory}/concepts`;
      await ensureFolder(vault, folder);
      const filePath = `${folder}/${name}.md`;
      if (vault.getAbstractFileByPath(filePath)) throw new Error(`A concept named \u201C${name}\u201D already exists.`);
      return vault.create(filePath, `---
name: ${JSON.stringify(name)}
description: ""
category: ""
order: ${folderOrder(vault, filePath, cache)}
depends_on: []
---
`);
    }
    async function createSubconcept2(vault, parentPath, value, cache) {
      const name = validateName(value, "Concept name");
      const segments = typeof parentPath === "string" ? parentPath.split("/") : [];
      if (segments.length < 4 || segments[0] !== ROOT || segments[2] !== "concepts" || !segments[segments.length - 1].endsWith(".md")) {
        throw new Error("Invalid parent concept path.");
      }
      try {
        validateName(segments[1], "Buch title");
        for (const segment of segments.slice(3, -1)) validateName(segment, "Concept name");
        validateName(segments[segments.length - 1].slice(0, -3), "Concept name");
      } catch (_) {
        throw new Error("Invalid parent concept path.");
      }
      const parent = vault.getAbstractFileByPath(parentPath);
      const index = vault.getAbstractFileByPath(`${ROOT}/${segments[1]}/_index.md`);
      if (!parent || isFolder(parent) || !index || isFolder(index)) throw new Error("Parent concept or Buch does not exist.");
      const childFolder = parentPath.slice(0, -3);
      await ensureFolder(vault, childFolder);
      const filePath = `${childFolder}/${name}.md`;
      if (vault.getAbstractFileByPath(filePath)) throw new Error(`A concept named \u201C${name}\u201D already exists.`);
      return vault.create(filePath, `---
name: ${JSON.stringify(name)}
description: ""
category: ""
order: ${folderOrder(vault, filePath, cache)}
depends_on: []
---
`);
    }
    module2.exports = { ROOT, validateName, ensureRoot: ensureRoot2, ensureFolder, createBuch: createBuch2, createConcept: createConcept2, createSubconcept: createSubconcept2, buchPath };
  }
});

// src/name-modal.js
var require_name_modal = __commonJS({
  "src/name-modal.js"(exports2, module2) {
    var { Modal, Notice: Notice2 } = require("obsidian");
    var NameModal2 = class extends Modal {
      constructor(app, { title, placeholder, submitText, onSubmit, initialValue = "", required = true }) {
        super(app);
        this.options = { title, placeholder, submitText, onSubmit, initialValue, required };
        this.submitting = false;
      }
      onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl("h2", { text: this.options.title });
        const form = contentEl.createEl("form", { cls: "buches-name-form" });
        const input = form.createEl("input", { type: "text", placeholder: this.options.placeholder });
        input.setAttribute("aria-label", this.options.placeholder);
        input.required = this.options.required;
        input.value = this.options.initialValue;
        const actions = form.createDiv({ cls: "buches-modal-actions" });
        const cancel = actions.createEl("button", { text: "Cancel", type: "button" });
        cancel.addEventListener("click", () => this.close());
        const submit = actions.createEl("button", { text: this.options.submitText, type: "submit", cls: "mod-cta" });
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          if (this.submitting) return;
          this.submitting = true;
          submit.disabled = true;
          try {
            await this.options.onSubmit(input.value);
            this.close();
          } catch (error) {
            new Notice2(error instanceof Error ? error.message : String(error));
            input.focus();
          } finally {
            this.submitting = false;
            submit.disabled = false;
          }
        });
        input.focus();
      }
      onClose() {
        this.contentEl.empty();
      }
    };
    module2.exports = { NameModal: NameModal2 };
  }
});

// src/icons.js
var require_icons = __commonJS({
  "src/icons.js"(exports2, module2) {
    function iconFor2(app, file) {
      const value = app.metadataCache.getFileCache(file)?.frontmatter?.icon;
      return typeof value === "string" ? value.trim() : "";
    }
    async function setFileIcon2(app, file, value) {
      const icon = typeof value === "string" ? value.trim() : "";
      if (icon.length > 80 || /[\r\n\x00-\x1f]/.test(icon)) throw new Error("Invalid icon. Use a Lucide icon name or emoji.");
      await app.fileManager.processFrontMatter(file, (frontmatter) => {
        if (icon) frontmatter.icon = icon;
        else delete frontmatter.icon;
      });
    }
    function renderFileIcon(el, icon, setIcon) {
      if (!icon) return false;
      const name = icon.replace(/^lucide:/i, "");
      if (/^[a-z0-9-]+$/i.test(name)) setIcon(el, name);
      else if (/\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20e3/u.test(icon)) el.textContent = icon;
      else return false;
      return true;
    }
    module2.exports = { iconFor: iconFor2, setFileIcon: setFileIcon2, renderFileIcon };
  }
});

// src/order-model.js
var require_order_model = __commonJS({
  "src/order-model.js"(exports2, module2) {
    function sortConcepts(app, siblings) {
      return siblings.map((concept, index) => {
        const value = app.metadataCache.getFileCache(concept.file)?.frontmatter?.order;
        return { concept, index, order: typeof value === "number" && Number.isFinite(value) ? value : null };
      }).sort((a, b) => {
        if (a.order !== null && b.order === null) return -1;
        if (a.order === null && b.order !== null) return 1;
        if (a.order !== null && b.order !== null && a.order !== b.order) return a.order < b.order ? -1 : 1;
        return a.concept.name.localeCompare(b.concept.name, void 0, { sensitivity: "base", numeric: true }) || a.index - b.index;
      }).map((item) => item.concept);
    }
    function getPagination(app, book, currentPath) {
      const pages = [{ file: book.index, name: book.title }];
      function visit(siblings) {
        for (const concept of sortConcepts(app, siblings)) {
          pages.push(concept);
          visit(concept.children);
        }
      }
      visit(book.concepts);
      const index = pages.findIndex((page) => page.file.path === currentPath);
      if (index < 0) return null;
      return { previous: pages[index - 1] ?? null, next: pages[index + 1] ?? null, index, total: pages.length - 1 };
    }
    async function reorderSiblings(app, book, sourcePath, targetPath, position) {
      if (typeof book?.path !== "string" || !/^Buches\/[^/]+$/.test(book.path) || [".", ".."].includes(book.path.slice("Buches/".length)) || book.index?.path !== `${book.path}/_index.md` || !Array.isArray(book.concepts) || typeof sourcePath !== "string" || typeof targetPath !== "string" || sourcePath === targetPath || !["before", "after"].includes(position)) return false;
      const seen = /* @__PURE__ */ new Set([book.index.path]);
      let sourceGroup = null, targetGroup = null;
      function inspect(siblings, directory) {
        if (!Array.isArray(siblings)) return false;
        for (const item of siblings) {
          const path = item?.file?.path;
          if (typeof path !== "string" || !path.startsWith(`${directory}/`)) return false;
          const filename = path.slice(directory.length + 1);
          const stem = filename.slice(0, -3);
          if (!filename.endsWith(".md") || !stem || stem === "." || stem === ".." || filename.includes("/") || filename.includes("\\") || seen.has(path) || typeof item.name !== "string") return false;
          seen.add(path);
          if (path === sourcePath) sourceGroup = siblings;
          if (path === targetPath) targetGroup = siblings;
          if (!inspect(item.children, `${directory}/${stem}`)) return false;
        }
        return true;
      }
      if (!inspect(book.concepts, `${book.path}/concepts`) || !sourceGroup || sourceGroup !== targetGroup) return false;
      const group = sourceGroup;
      const sorted = sortConcepts(app, group);
      const reordered = sorted.slice();
      const sourceIndex = reordered.findIndex((item) => item.file.path === sourcePath);
      const [source] = reordered.splice(sourceIndex, 1);
      const targetIndex = reordered.findIndex((item) => item.file.path === targetPath);
      reordered.splice(targetIndex + (position === "after" ? 1 : 0), 0, source);
      if (reordered.every((item, index) => item === sorted[index])) return false;
      for (let index = 0; index < reordered.length; index++) {
        await app.fileManager.processFrontMatter(reordered[index].file, (frontmatter) => {
          frontmatter.order = index;
        });
      }
      return true;
    }
    module2.exports = { sortConcepts, getPagination, reorderSiblings };
  }
});

// src/catalog.js
var require_catalog = __commonJS({
  "src/catalog.js"(exports2, module2) {
    var { ROOT } = require_storage();
    var { iconFor: iconFor2 } = require_icons();
    var { sortConcepts } = require_order_model();
    function isFolder(entry) {
      return !!entry && Array.isArray(entry.children);
    }
    function metadataName(app, file, property, fallback) {
      const value = app.metadataCache.getFileCache(file)?.frontmatter?.[property];
      return typeof value === "string" && value.trim() ? value : fallback;
    }
    function compare(a, b) {
      return a.localeCompare(b, void 0, { sensitivity: "base", numeric: true });
    }
    function listConcepts(app, directory, inheritedCategory = "Uncategorized") {
      if (!isFolder(directory)) return [];
      const folders = new Map(directory.children.filter(isFolder).map((folder) => [folder.name, folder]));
      const concepts = directory.children.filter((item) => !isFolder(item) && item.extension === "md").map((file) => {
        const basename = file.name.slice(0, -3);
        const category = metadataName(app, file, "category", inheritedCategory);
        return {
          file,
          name: metadataName(app, file, "name", metadataName(app, file, "title", basename)),
          description: metadataName(app, file, "description", ""),
          category,
          icon: iconFor2(app, file),
          children: listConcepts(app, folders.get(basename), category)
        };
      });
      return sortConcepts(app, concepts);
    }
    function listBuches(app) {
      const root = app.vault.getAbstractFileByPath(ROOT);
      if (!isFolder(root)) return [];
      const result = [];
      for (const folder of root.children.filter(isFolder)) {
        const index = folder.children.find((item) => item.name === "_index.md" && !isFolder(item));
        if (!index) continue;
        const title = metadataName(app, index, "title", folder.name);
        const conceptFolder = folder.children.find((item) => item.name === "concepts" && isFolder(item));
        const concepts = listConcepts(app, conceptFolder);
        result.push({ path: folder.path, index, title, icon: iconFor2(app, index), concepts });
      }
      return result.sort((a, b) => compare(a.title, b.title));
    }
    module2.exports = { listBuches };
  }
});

// src/buch-model.js
var require_buch_model = __commonJS({
  "src/buch-model.js"(exports2, module2) {
    var { listBuches } = require_catalog();
    function flattenConcepts2(concepts) {
      return concepts.flatMap((concept) => [concept, ...flattenConcepts2(concept.children)]);
    }
    function findBuchContext2(app, file) {
      if (!file || typeof file.path !== "string" || !file.path.startsWith("Buches/")) return null;
      const book = listBuches(app).find((item) => file.path.startsWith(`${item.path}/`));
      if (!book) return null;
      if (file.path === book.index.path) return { book, file: book.index, isIndex: true, name: book.title };
      const concept = flattenConcepts2(book.concepts).find((item) => item.file.path === file.path);
      if (concept) return { book, file: concept.file, isIndex: false, name: concept.name, concept };
      const path = file.path;
      if (path === `${book.path}/_progress.md` || path.startsWith(`${book.path}/_solutions/`)) return null;
      if (!path.toLowerCase().endsWith(".md")) return null;
      const basename = path.slice(path.lastIndexOf("/") + 1, -3);
      const value = app.metadataCache.getFileCache(file)?.frontmatter?.name;
      const name = typeof value === "string" && value.trim() ? value : basename;
      return { book, file, isIndex: false, name };
    }
    function dependencyLink(value) {
      if (typeof value !== "string") return null;
      let link = value.trim();
      if (link.startsWith("[[") && link.endsWith("]]")) link = link.slice(2, -2);
      return link.split("|")[0].split("#")[0].trim() || null;
    }
    function buildGraph(app, book) {
      const nodes = flattenConcepts2(book.concepts).map((concept) => ({ file: concept.file, path: concept.file.path, name: concept.name }));
      const paths = new Set(nodes.map((node) => node.path));
      const edges = [];
      function addHierarchy(concepts) {
        for (const concept of concepts) {
          for (const child of concept.children) edges.push({ source: concept.file.path, target: child.file.path, type: "hierarchy" });
          addHierarchy(concept.children);
        }
      }
      addHierarchy(book.concepts);
      for (const node of nodes) {
        const frontmatter = app.metadataCache.getFileCache(node.file)?.frontmatter;
        const declared = frontmatter?.depends_on;
        const values = Array.isArray(declared) ? declared : declared ? [declared] : [];
        const dependencies = /* @__PURE__ */ new Set();
        for (const value of values) {
          const link = dependencyLink(value);
          const dest = link && app.metadataCache.getFirstLinkpathDest(link, node.path);
          if (dest && paths.has(dest.path) && dest.path !== node.path) dependencies.add(dest.path);
        }
        const links = Object.keys(app.metadataCache.resolvedLinks?.[node.path] ?? {});
        for (const target of /* @__PURE__ */ new Set([...dependencies, ...links])) {
          if (!paths.has(target) || target === node.path) continue;
          edges.push({ source: node.path, target, type: dependencies.has(target) ? "dependency" : "link" });
        }
      }
      return { nodes, edges };
    }
    module2.exports = { flattenConcepts: flattenConcepts2, findBuchContext: findBuchContext2, buildGraph };
  }
});

// src/progress.js
var require_progress = __commonJS({
  "src/progress.js"(exports2, module2) {
    var { parseYaml, stringifyYaml } = require("obsidian");
    var PROGRESS_NAME = "_progress.md";
    var FRONTMATTER = /^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?=\r?\n|$)/;
    var initialNote = "---\nbuches_progress: 1\nchapters: {}\n---\n\n# Reading progress\n";
    var relative = (book, path) => path.slice(book.path.length + 1);
    function readProgress(text) {
      const match = text.match(FRONTMATTER);
      const yaml = match && parseYaml(match[1]);
      if (yaml?.buches_progress !== 1 || !yaml.chapters || typeof yaml.chapters !== "object" || Array.isArray(yaml.chapters)) {
        throw new Error("The book progress note has invalid frontmatter.");
      }
      return { match, yaml };
    }
    function updateProgress(text, update) {
      const { match, yaml } = readProgress(text);
      update(yaml);
      return `---
${stringifyYaml(yaml).trimEnd()}
---${text.slice(match[0].length)}`;
    }
    function statusFor2(model, chapters, target) {
      const row = chapters[relative(model.book, target.path)];
      if (target.type !== "exercise") return (row?.read ?? row?.mastered) === true;
      return Array.isArray(row?.solved) && row.solved.includes(target.id);
    }
    function countsFor(model, chapters, selected = model.chapters) {
      const counts = { chapters: selected.length, read: 0, exercises: 0, solved: 0 };
      for (const chapter of selected) {
        if (statusFor2(model, chapters, chapter)) counts.read++;
        for (const node of chapter.nodes) {
          if (node.type !== "exercise") continue;
          counts.exercises++;
          if (statusFor2(model, chapters, { ...node, path: chapter.path })) counts.solved++;
        }
      }
      return counts;
    }
    var BookProgress2 = class {
      constructor(app, legacy) {
        this.app = app;
        this.legacy = legacy;
        this.pending = /* @__PURE__ */ new Map();
      }
      queue(path, operation) {
        const result = (this.pending.get(path) ?? Promise.resolve()).catch(() => {
        }).then(operation);
        this.pending.set(path, result);
        const clean = () => {
          if (this.pending.get(path) === result) this.pending.delete(path);
        };
        result.then(clean, clean);
        return result;
      }
      async read(model) {
        const path = `${model.book.path}/${PROGRESS_NAME}`;
        await this.pending.get(path)?.catch(() => {
        });
        const vault = this.app.vault;
        const file = vault.getAbstractFileByPath(path);
        const state = file ? readProgress(await vault.cachedRead(file)).yaml : { chapters: {} };
        if (state.legacy_imported) return state.chapters;
        if (!model.chapters.some((chapter) => this.legacy[chapter.path]?.length)) return state.chapters;
        const migrated = await this.write(model.book, (yaml) => this.importLegacy(model, yaml));
        return migrated.chapters;
      }
      importLegacy(model, yaml) {
        if (yaml.legacy_imported) return;
        for (const chapter of model.chapters) {
          const key = relative(model.book, chapter.path);
          const existing = yaml.chapters[key];
          if (existing && Object.hasOwn(existing, "solved")) continue;
          const old = this.legacy[chapter.path];
          if (!Array.isArray(old)) continue;
          const solved = chapter.nodes.filter((node) => node.legacyId && old.includes(node.legacyId)).map((node) => node.id);
          if (solved.length) yaml.chapters[key] = { ...existing, solved };
        }
        yaml.legacy_imported = true;
      }
      write(book, update) {
        const path = `${book.path}/${PROGRESS_NAME}`;
        return this.queue(path, async () => {
          const vault = this.app.vault;
          let file = vault.getAbstractFileByPath(path);
          if (!file) {
            try {
              file = await vault.create(path, initialNote);
            } catch (error) {
              file = vault.getAbstractFileByPath(path);
              if (!file) throw error;
            }
          }
          let state;
          await vault.process(file, (text) => updateProgress(text, (yaml) => {
            update(yaml);
            state = yaml;
          }));
          return state;
        });
      }
      setRead(model, paths, read) {
        return this.write(model.book, (yaml) => {
          var _a;
          this.importLegacy(model, yaml);
          for (const path of paths) {
            const key = relative(model.book, path);
            const row = (_a = yaml.chapters)[key] ?? (_a[key] = {});
            row.read = read;
          }
        });
      }
      set(model, target, done) {
        if (target.type !== "exercise") return this.setRead(model, [target.path], done);
        return this.write(model.book, (yaml) => {
          var _a;
          this.importLegacy(model, yaml);
          const key = relative(model.book, target.path);
          const row = (_a = yaml.chapters)[key] ?? (_a[key] = {});
          const entries = new Set(Array.isArray(row.solved) ? row.solved : []);
          if (done) entries.add(target.id);
          else entries.delete(target.id);
          row.solved = [...entries];
        });
      }
      rename(file, oldPath) {
        const book = oldPath.match(/^(Buches\/[^/]+)\/(concepts\/.*)$/);
        if (!book || !file.path.startsWith(`${book[1]}/concepts/`)) return;
        const path = `${book[1]}/${PROGRESS_NAME}`;
        const note = this.app.vault.getAbstractFileByPath(path);
        const oldKey = book[2];
        const newKey = relative({ path: book[1] }, file.path);
        for (const key of Object.keys(this.legacy)) {
          if (key !== oldPath && !key.startsWith(`${oldPath}/`)) continue;
          const next = file.path + key.slice(oldPath.length);
          this.legacy[next] = [.../* @__PURE__ */ new Set([...this.legacy[next] ?? [], ...this.legacy[key]])];
          delete this.legacy[key];
        }
        if (!note) return;
        return this.queue(path, () => this.app.vault.process(note, (text) => updateProgress(text, (yaml) => {
          for (const [key, value] of Object.entries(yaml.chapters)) {
            if (key !== oldKey && !key.startsWith(`${oldKey}/`)) continue;
            const next = newKey + key.slice(oldKey.length);
            const existing = yaml.chapters[next];
            yaml.chapters[next] = { ...value, ...existing };
            for (const field of ["solved", "understood"]) {
              if (Array.isArray(value[field]) && Array.isArray(existing?.[field])) {
                yaml.chapters[next][field] = [.../* @__PURE__ */ new Set([...value[field], ...existing[field]])];
              }
            }
            delete yaml.chapters[key];
          }
        })));
      }
    };
    module2.exports = { BookProgress: BookProgress2, PROGRESS_NAME, countsFor, statusFor: statusFor2 };
  }
});

// src/view.js
var require_view = __commonJS({
  "src/view.js"(exports2, module2) {
    var { ItemView, setIcon, Menu, Notice: Notice2 } = require("obsidian");
    var { renderFileIcon } = require_icons();
    var { reorderSiblings } = require_order_model();
    var { listBuches } = require_catalog();
    var { flattenConcepts: flattenConcepts2 } = require_buch_model();
    var { statusFor: statusFor2 } = require_progress();
    var VIEW_TYPE2 = "buches-navigator";
    function iconButton(parent, icon, label, callback, extraClass = "") {
      const button = parent.createEl("button", { cls: `buches-icon-button ${extraClass}` });
      button.setAttribute("aria-label", label);
      button.setAttribute("title", label);
      setIcon(button, icon);
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        return callback();
      });
      return button;
    }
    var BuchesView2 = class extends ItemView {
      constructor(leaf, plugin) {
        super(leaf);
        this.plugin = plugin;
        this.expansion = /* @__PURE__ */ new Map();
        this.renderRevision = 0;
        this.renderTimer = null;
      }
      getViewType() {
        return VIEW_TYPE2;
      }
      getDisplayText() {
        return "Buches";
      }
      getIcon() {
        return "library";
      }
      async onOpen() {
        this.contentEl.addClass("buches-view");
        const schedule = (file) => {
          if (!file || file.path === "Buches" || file.path.startsWith("Buches/")) this.scheduleRender();
        };
        for (const event of ["create", "delete", "modify"]) this.registerEvent(this.app.vault.on(event, schedule));
        this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
          if (oldPath === "Buches" || oldPath.startsWith("Buches/")) this.scheduleRender();
          else schedule(file);
        }));
        this.registerEvent(this.app.metadataCache.on("changed", schedule));
        this.registerEvent(this.app.workspace.on("file-open", () => this.scheduleRender()));
        this.render();
      }
      async onClose() {
        if (this.renderTimer !== null) clearTimeout(this.renderTimer);
        this.renderTimer = null;
        this.renderRevision += 1;
      }
      scheduleRender() {
        if (this.renderTimer !== null) clearTimeout(this.renderTimer);
        this.renderTimer = setTimeout(() => {
          this.renderTimer = null;
          this.render();
        }, 100);
      }
      render() {
        const container = this.contentEl;
        this.renderRevision += 1;
        container.empty();
        const toolbar = container.createDiv({ cls: "buches-toolbar" });
        toolbar.createEl("h4", { text: "Buches" });
        iconButton(toolbar, "plus", "Create Buch", () => this.plugin.promptCreateBuch());
        const books = listBuches(this.app);
        if (!books.length) {
          container.createEl("p", { cls: "buches-empty", text: "No Buches yet. Create one with the + button." });
          return;
        }
        const list = container.createDiv({ cls: "buches-list" });
        for (const book of books) this.renderBook(list, book);
      }
      renderToggle(row, path, name, defaultExpanded = false) {
        const expanded = this.expansion.get(path) ?? defaultExpanded;
        const toggle = iconButton(row, expanded ? "chevron-down" : "chevron-right", `${expanded ? "Collapse" : "Expand"} ${name}`, () => {
          this.expansion.set(path, !expanded);
          this.render();
        }, "buches-toggle");
        toggle.setAttribute("aria-expanded", String(expanded));
        return expanded;
      }
      renderTitle(row, file, name, icon, cls, ariaLabel) {
        const button = row.createEl("button", { cls });
        button.setAttribute("aria-label", ariaLabel);
        button.setAttribute("title", name);
        const view = this.app.workspace?.getMostRecentLeaf?.()?.view;
        if (!view?.sheet && this.app.workspace?.getActiveFile?.()?.path === file.path) button.setAttribute("aria-current", "page");
        if (icon) {
          const iconEl = button.createEl("span", { cls: "buches-file-icon" });
          iconEl.setAttribute("aria-hidden", "true");
          renderFileIcon(iconEl, icon, setIcon);
        }
        button.createEl("span", { cls: "buches-file-name", text: name });
        button.addEventListener("click", () => this.plugin.openFile(file));
        button.addEventListener("contextmenu", (event) => {
          event.preventDefault();
          const menu = new Menu();
          menu.addItem((item) => item.setTitle("Set icon").setIcon("smile").onClick(() => this.plugin.promptIcon(file)));
          menu.showAtMouseEvent(event);
        });
        return button;
      }
      renderExerciseButton(row, file, name) {
        const button = iconButton(
          row,
          "clipboard-list",
          `Exercises for ${name}`,
          () => this.plugin.openExercises(file),
          "buches-exercises"
        );
        const view = this.app.workspace?.getMostRecentLeaf?.()?.view;
        if (view?.sheet && view.file?.path === file.path) button.setAttribute("aria-current", "page");
      }
      renderBook(parent, book) {
        const section = parent.createDiv({ cls: "buches-book" });
        const row = section.createDiv({ cls: "buches-tree-row buches-book-row" });
        const expanded = this.renderToggle(row, book.path, book.title, true);
        const bookmarkPath = this.plugin.lastRead?.get(book.path);
        const bookmark = bookmarkPath && flattenConcepts2(book.concepts).find((item) => item.file.path === bookmarkPath);
        const title = this.renderTitle(row, book.index, book.title, book.icon, "buches-title", `Open ${book.title}`);
        if (!expanded && bookmark) this.markReadingPosition(row, title, bookmark);
        iconButton(row, "plus", `New concept in ${book.title}`, () => {
          if (!expanded) {
            this.expansion.set(book.path, true);
            this.render();
          }
          this.plugin.promptCreateConcept(book.path);
        }, "buches-add");
        this.renderExerciseButton(row, book.index, book.title);
        if (!expanded) return;
        const concepts = section.createDiv({ cls: "buches-children" });
        if (!book.concepts.length) concepts.createDiv({ cls: "buches-empty-concepts", text: "No concepts yet" });
        const rows = /* @__PURE__ */ new Map();
        for (const concept of book.concepts) this.renderConcept(concepts, concept, book, bookmark, rows, true);
        if (rows.size && this.plugin.progress) void this.renderProgress(book, rows, this.renderRevision);
      }
      async renderProgress(book, rows, revision) {
        const model = { book, chapters: [] };
        let progress;
        try {
          progress = await this.plugin.progress.read(model);
        } catch (error) {
          console.error("Could not load B\xFCcher reading progress:", error);
          return;
        }
        if (revision !== this.renderRevision) return;
        const measure = (concept) => {
          const read = statusFor2(model, progress, { path: concept.file.path });
          let done = read ? 1 : 0;
          let total = 1;
          if (concept.children.length) {
            done = 0;
            total = 0;
            for (const child of concept.children) {
              const count = measure(child);
              done += count.done;
              total += count.total;
            }
          }
          const row = rows.get(concept);
          if (row) this.decorateProgress(row, book, concept, read, done, total);
          return { done, total };
        };
        for (const concept of book.concepts) measure(concept);
      }
      decorateProgress(row, book, concept, read, done, total) {
        const complete = done === total;
        const addReadingAction = (next, icon, label2) => {
          const button = iconButton(row, icon, label2, async () => {
            const actions = row.querySelectorAll(".buches-reading-action");
            actions.forEach((action) => {
              action.disabled = true;
            });
            try {
              await this.plugin.setConceptRead(book, concept, next);
              this.scheduleRender();
            } catch (error) {
              new Notice2(error.message || "Could not update reading progress.");
            } finally {
              actions.forEach((action) => {
                action.disabled = false;
              });
            }
          }, "buches-reading-action");
          row.insertBefore(button, row.querySelector(".buches-exercises"));
        };
        const scope = concept.name + (concept.children.length ? " and its subtopics" : "");
        if (read || done) addReadingAction(false, "circle-minus", `Mark ${scope} as unread`);
        if (!complete || !read) addReadingAction(true, "check", `Mark ${scope} as done`);
        if (!done) return;
        const badge = row.createEl("span", { cls: "buches-tree-progress" });
        const percentage = complete ? 100 : Math.min(99, Math.max(1, Math.round(done / total * 100)));
        const label = `${concept.name}: ${percentage}% done`;
        badge.setAttribute("title", label);
        badge.setAttribute("role", "img");
        badge.setAttribute("aria-label", label);
        if (complete) setIcon(badge, "check");
        else {
          badge.addClass("buches-tree-progress-partial");
          badge.style.setProperty("--buches-completion", `${done / total * 100}%`);
        }
      }
      markReadingPosition(row, title, bookmark) {
        const label = `\xDAltima leitura: ${bookmark.name}`;
        row.addClass("buches-last-read");
        title.setAttribute("title", label);
        title.setAttribute("aria-description", label);
      }
      renderConcept(parent, concept, book, bookmark, rows, topLevel = false) {
        const section = parent.createDiv({ cls: "buches-node" });
        const row = section.createDiv({ cls: "buches-tree-row buches-concept-row" });
        rows.set(concept, row);
        row.setAttribute("draggable", "true");
        row.addEventListener("dragstart", (event) => {
          event.stopPropagation();
          event.dataTransfer?.setData("text/plain", concept.file.path);
          if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
          row.addClass("is-dragging");
        });
        row.addEventListener("dragend", () => {
          row.removeClass("is-dragging");
          this.contentEl.querySelectorAll(".buches-tree-row").forEach((el) => {
            el.removeClass("drag-over-before", "drag-over-after");
          });
        });
        row.addEventListener("dragover", (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
          const rect = row.getBoundingClientRect();
          const isBefore = event.clientY < rect.top + rect.height / 2;
          row.toggleClass("drag-over-before", isBefore);
          row.toggleClass("drag-over-after", !isBefore);
        });
        row.addEventListener("dragleave", () => {
          row.removeClass("drag-over-before", "drag-over-after");
        });
        row.addEventListener("drop", async (event) => {
          event.preventDefault();
          event.stopPropagation();
          row.removeClass("drag-over-before", "drag-over-after");
          const sourcePath = event.dataTransfer?.getData("text/plain");
          const targetPath = concept.file.path;
          if (!sourcePath || sourcePath === targetPath) return;
          const rect = row.getBoundingClientRect();
          const position = event.clientY < rect.top + rect.height / 2 ? "before" : "after";
          const reordered = await reorderSiblings(this.app, book, sourcePath, targetPath, position);
          if (reordered) {
            this.render();
            this.plugin.scheduleRefresh();
          }
        });
        const hasChildren = concept.children.length > 0;
        const expanded = hasChildren && this.renderToggle(row, concept.file.path, concept.name);
        if (!hasChildren) row.createEl("span", { cls: "buches-toggle-spacer" });
        const icon = topLevel ? concept.icon || "book-open" : null;
        const title = this.renderTitle(row, concept.file, concept.name, icon, "buches-title buches-concept", `Open concept ${concept.name}`);
        const path = concept.file.path;
        if (bookmark && (bookmark.file.path === path || !expanded && bookmark.file.path.startsWith(`${path.slice(0, -3)}/`))) {
          this.markReadingPosition(row, title, bookmark);
        }
        iconButton(row, "plus", `New subconcept in ${concept.name}`, () => {
          this.expansion.set(concept.file.path, true);
          if (hasChildren && !expanded) this.render();
          this.plugin.promptCreateSubconcept(concept.file.path);
        }, "buches-add");
        this.renderExerciseButton(row, concept.file, concept.name);
        if (!hasChildren || !expanded) return;
        const children = section.createDiv({ cls: "buches-children" });
        for (const child of concept.children) this.renderConcept(children, child, book, bookmark, rows);
      }
    };
    module2.exports = { BuchesView: BuchesView2, VIEW_TYPE: VIEW_TYPE2 };
  }
});

// src/graph-layout.js
var require_graph_layout = __commonJS({
  "src/graph-layout.js"(exports2, module2) {
    function graphLayout(nodes, width, height) {
      const positions = /* @__PURE__ */ new Map();
      const count = nodes.length;
      const cx = width / 2, cy = height / 2;
      for (let i = 0; i < count; i++) {
        if (count === 1) {
          positions.set(nodes[i].path, { x: cx, y: cy });
          continue;
        }
        const angle = i * Math.PI * (3 - Math.sqrt(5));
        const radius = Math.sqrt((i + 0.7) / count) * 0.83;
        const width2 = Math.max(0, cx - 14), height2 = Math.max(0, cy - 14);
        positions.set(nodes[i].path, {
          x: cx + Math.cos(angle) * radius * width2,
          y: cy + Math.sin(angle) * radius * height2
        });
      }
      return positions;
    }
    module2.exports = { graphLayout };
  }
});

// src/graph-view.js
var require_graph_view = __commonJS({
  "src/graph-view.js"(exports2, module2) {
    var { graphLayout } = require_graph_layout();
    var SVG = "http://www.w3.org/2000/svg";
    function renderGraph(container, graph, currentPath, openFile, isDone = () => false) {
      if (!graph.nodes.length) {
        container.createEl("p", { cls: "buches-context-empty", text: "No concepts yet." });
        return;
      }
      const doc = container.ownerDocument;
      const svg = doc.createElementNS(SVG, "svg");
      svg.setAttribute("viewBox", "0 0 320 165");
      svg.setAttribute("class", "buches-graph");
      svg.setAttribute("role", "group");
      svg.setAttribute("aria-label", "Concept dependency graph");
      const positions = graphLayout(graph.nodes, 320, 165);
      for (const edge of graph.edges) {
        const source = positions.get(edge.source), target = positions.get(edge.target);
        if (!source || !target) continue;
        const line = doc.createElementNS(SVG, "line");
        for (const [key, value] of Object.entries({ x1: source.x, y1: source.y, x2: target.x, y2: target.y })) line.setAttribute(key, String(value));
        line.setAttribute("class", `buches-graph-edge is-${edge.type}`);
        const tooltip = doc.createElementNS(SVG, "title");
        const sourceName = graph.nodes.find((node) => node.path === edge.source)?.name ?? edge.source;
        const targetName = graph.nodes.find((node) => node.path === edge.target)?.name ?? edge.target;
        tooltip.textContent = edge.type === "dependency" ? `${sourceName} depends on ${targetName}` : edge.type === "hierarchy" ? `${targetName} is nested under ${sourceName}` : `${sourceName} links to ${targetName}`;
        line.appendChild(tooltip);
        svg.appendChild(line);
      }
      for (const node of graph.nodes) {
        const point = positions.get(node.path);
        const group = doc.createElementNS(SVG, "g");
        group.setAttribute("class", `buches-graph-node${node.path === currentPath ? " is-current" : ""}${isDone(node) ? " is-mastered" : ""}`);
        group.setAttribute("role", "button");
        group.setAttribute("tabindex", "0");
        group.setAttribute("aria-label", `Open concept ${node.name}`);
        const title = doc.createElementNS(SVG, "title");
        title.textContent = node.name;
        group.appendChild(title);
        const circle = doc.createElementNS(SVG, "circle");
        circle.setAttribute("cx", String(point.x));
        circle.setAttribute("cy", String(point.y));
        circle.setAttribute("r", "4.5");
        group.appendChild(circle);
        group.addEventListener("click", () => openFile(node.file));
        group.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openFile(node.file);
          }
        });
        svg.appendChild(group);
      }
      container.appendChild(svg);
    }
    module2.exports = { renderGraph };
  }
});

// src/outline-model.js
var require_outline_model = __commonJS({
  "src/outline-model.js"(exports2, module2) {
    function outlineFor(app, file) {
      return (app.metadataCache.getFileCache(file)?.headings ?? []).map((heading) => ({ text: heading.heading, level: heading.level, line: heading.position?.start?.line ?? 0 }));
    }
    module2.exports = { outlineFor };
  }
});

// src/dashboard.js
var require_dashboard = __commonJS({
  "src/dashboard.js"(exports2, module2) {
    var { countsFor, statusFor: statusFor2 } = require_progress();
    var { renderGraph } = require_graph_view();
    function label(target) {
      return target.title ?? target.name;
    }
    function chapterLink(parent, target, open) {
      const button = parent.createEl("button", { cls: "buches-dashboard-link", text: label(target) });
      button.addEventListener("click", () => open(target));
      return button;
    }
    function exerciseMeter(parent, title, counts) {
      const row = parent.createDiv({ cls: "buches-meter" });
      row.createEl("strong", { text: title });
      if (!counts.exercises) {
        row.createEl("span", { text: "No exercises yet" });
        return;
      }
      row.createEl("progress", { attr: { max: counts.exercises, value: counts.solved, "aria-label": `${title} exercises solved` } });
      row.createEl("span", { text: `${counts.solved} solved \xB7 ${counts.exercises - counts.solved} left` });
    }
    function progressButton(parent, text, checked, update, cls = "buches-reader-action") {
      const button = parent.createEl("button", { cls });
      const paint = (value) => {
        button.setAttribute("aria-pressed", String(value));
        button.setAttribute("aria-label", text);
        button.textContent = value ? `\u2713 ${text.replace(/^Mark /, "")}` : text;
      };
      paint(checked);
      button.addEventListener("click", async () => {
        button.disabled = true;
        const next = button.getAttribute("aria-pressed") !== "true";
        try {
          if (await update(next)) paint(next);
        } finally {
          button.disabled = false;
        }
      });
      return button;
    }
    function unmet(model, progress, target) {
      return target.dependencies.filter((dep) => !dep || !statusFor2(model, progress, dep));
    }
    function renderDependencies(parent, model, progress, target, open) {
      if (!target.dependencies.length) return;
      const list = parent.createEl("ul", { cls: "buches-prerequisites", attr: { "aria-label": "Prerequisites" } });
      for (const dep of target.dependencies) {
        const li = list.createEl("li");
        if (!dep) {
          li.setText("Unresolved prerequisite");
          continue;
        }
        const done = statusFor2(model, progress, dep);
        li.createSpan({ text: done ? "\u2713" : "\u25CB", attr: { "aria-label": done ? "Complete" : "Remaining" } });
        chapterLink(li, dep, open);
      }
    }
    function renderBookProgress(header, model, progress) {
      const totals = countsFor(model, progress);
      const row = header.createDiv({ cls: "buches-book-overview" });
      row.createSpan({ text: `${totals.read} / ${totals.chapters} chapters read` });
      row.createSpan({ text: `${totals.solved} / ${totals.exercises} exercises solved` });
    }
    function expandable(parent, key, title) {
      const details = parent.createEl("details", { cls: "buches-dashboard-section" });
      details.dataset.stateKey = key;
      details.createEl("summary", { text: title });
      return details;
    }
    function renderDashboard(host, model, progress, open) {
      if (!model.chapters.length) {
        host.createEl("p", { cls: "buches-context-empty", text: "Create a concept to start the curriculum." });
        return;
      }
      const categories = /* @__PURE__ */ new Map();
      for (const chapter of model.chapters) {
        if (!categories.has(chapter.category)) categories.set(chapter.category, []);
        categories.get(chapter.category).push(chapter);
      }
      const byCategory = host.createEl("section");
      byCategory.createEl("h2", { text: "By category" });
      const groups = byCategory.createDiv({ cls: "buches-category-grid" });
      for (const [name, chapters] of categories) {
        const group = groups.createDiv({ cls: "buches-category" });
        group.createEl("h3", { text: name });
        const count = countsFor(model, progress, chapters);
        group.createEl("p", { text: `${count.read} / ${count.chapters} chapters read` });
        if (count.exercises) group.createEl("p", { text: `${count.solved} / ${count.exercises} exercises solved` });
      }
      const curriculum = expandable(host, "curriculum", "Curriculum");
      function renderChapters(parent, concepts) {
        if (!concepts.length) return;
        const list = parent.createEl("ol", { cls: "buches-curriculum" });
        for (const concept of concepts) {
          const chapter = model.byPath.get(concept.file.path);
          const li = list.createEl("li");
          const link = chapterLink(li, chapter, open);
          if (chapter.description) link.setAttribute("title", chapter.description);
          if (statusFor2(model, progress, chapter)) li.createSpan({ cls: "buches-read-check", text: "\u2713", attr: { "aria-label": "Read" } });
          renderChapters(li, chapter.children);
        }
      }
      renderChapters(curriculum, model.book.concepts);
      const tree = expandable(host, "skill-tree", "Skill tree");
      const edges = model.chapters.flatMap((chapter) => chapter.dependencies.filter((dep) => dep && dep.path !== chapter.path).map((dep) => ({ source: chapter.path, target: dep.path, type: "dependency" })));
      renderGraph(
        tree.createDiv({ cls: "buches-graph-wrap" }),
        { nodes: model.chapters, edges },
        "",
        (file) => open(model.byPath.get(file.path)),
        (chapter) => statusFor2(model, progress, chapter)
      );
      for (const chapter of model.chapters) {
        const item = expandable(tree, `skill:${chapter.path}`, chapter.name);
        const remaining = unmet(model, progress, chapter).length;
        const done = statusFor2(model, progress, chapter);
        chapterLink(item, chapter, open);
        item.createDiv({
          cls: "buches-curriculum-meta",
          text: done ? "Read" : remaining ? `${remaining} prerequisite${remaining === 1 ? "" : "s"} left` : "Ready to read"
        });
        renderDependencies(item, model, progress, chapter, open);
        if (!chapter.nodes.length) continue;
        const list = item.createEl("ul", { cls: "buches-skill-blocks" });
        for (const node of chapter.nodes) {
          const target = model.targets.get(`${chapter.path}#${node.id}`);
          const li = list.createEl("li");
          chapterLink(li, target, open);
          renderDependencies(li, model, progress, target, open);
        }
      }
      if (model.issues.length) {
        const diagnostics = expandable(tree, "prerequisite-issues", `${model.issues.length} prerequisite issues`);
        const list = diagnostics.createEl("ul");
        for (const issue of model.issues) list.createEl("li", { text: issue });
      }
    }
    module2.exports = { renderDashboard, renderBookProgress, renderDependencies, chapterLink, exerciseMeter, progressButton };
  }
});

// src/settings.js
var require_settings = __commonJS({
  "src/settings.js"(exports2, module2) {
    var { PluginSettingTab, Setting } = require("obsidian");
    var WIDGETS = { progress: "Progress", outline: "Outline", dependencies: "Dependencies" };
    var ENGINES = { mathjax: "MathJax", typst: "Typst Mate" };
    var DEFAULTS = { readerMath: "mathjax", solutionMath: "typst" };
    function readSettings2(saved) {
      const widgets = [];
      for (const entry of Array.isArray(saved?.widgets) ? saved.widgets : []) {
        if (entry && Object.hasOwn(WIDGETS, entry.id) && !widgets.some((widget) => widget.id === entry.id)) {
          widgets.push({ id: entry.id, visible: entry.visible !== false });
        }
      }
      for (const id of Object.keys(WIDGETS)) if (!widgets.some((widget) => widget.id === id)) widgets.push({ id, visible: true });
      const engine = (key) => Object.hasOwn(ENGINES, saved?.[key]) ? saved[key] : DEFAULTS[key];
      return { readerMath: engine("readerMath"), solutionMath: engine("solutionMath"), widgets };
    }
    var BuchSettings2 = class extends PluginSettingTab {
      constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
      }
      display() {
        const { containerEl: root, plugin } = this;
        root.empty();
        for (const [key, name] of [["readerMath", "Reader math"], ["solutionMath", "Solution math"]]) {
          new Setting(root).setName(name).addDropdown((input) => input.addOptions(ENGINES).setValue(plugin.settings[key]).onChange((value) => plugin.changeSettings({ [key]: value })));
        }
        new Setting(root).setName("Right sidebar").setHeading();
        renderWidgetControls(root, plugin, () => this.display());
      }
    };
    function renderWidgetControls(host, plugin, redraw) {
      plugin.settings.widgets.forEach((widget, index, widgets) => {
        const row = host.createDiv({ cls: "buches-widget-control" });
        const label = row.createEl("label");
        const check = label.createEl("input", { attr: { type: "checkbox" } });
        check.checked = widget.visible;
        label.createSpan({ text: WIDGETS[widget.id] });
        const commit = (next) => {
          plugin.changeSettings({ widgets: next });
          redraw?.();
        };
        check.addEventListener("change", () => commit(widgets.map((item) => item.id === widget.id ? { ...item, visible: check.checked } : item)));
        for (const [delta, arrow, direction] of [[-1, "\u2191", "up"], [1, "\u2193", "down"]]) {
          const button = row.createEl("button", { text: arrow, attr: { "aria-label": `Move ${WIDGETS[widget.id]} ${direction}` } });
          button.disabled = !widgets[index + delta];
          button.addEventListener("click", () => {
            const next = widgets.slice();
            [next[index], next[index + delta]] = [next[index + delta], next[index]];
            commit(next);
          });
        }
      });
    }
    module2.exports = { BuchSettings: BuchSettings2, readSettings: readSettings2, renderWidgetControls, WIDGETS, ENGINES };
  }
});

// src/context-view.js
var require_context_view = __commonJS({
  "src/context-view.js"(exports2, module2) {
    var { ItemView } = require("obsidian");
    var { findBuchContext: findBuchContext2, buildGraph } = require_buch_model();
    var { renderGraph } = require_graph_view();
    var { outlineFor } = require_outline_model();
    var { exerciseMeter, chapterLink, renderDependencies } = require_dashboard();
    var { countsFor } = require_progress();
    var { renderWidgetControls, WIDGETS } = require_settings();
    var CONTEXT_VIEW2 = "buches-context";
    var ContextView2 = class extends ItemView {
      constructor(leaf, plugin) {
        super(leaf);
        this.plugin = plugin;
        this.revision = 0;
      }
      getViewType() {
        return CONTEXT_VIEW2;
      }
      getDisplayText() {
        return "Buch context";
      }
      getIcon() {
        return "network";
      }
      async onOpen() {
        this.contentEl.addClass("buches-context");
        await this.render();
      }
      async onClose() {
        this.revision++;
      }
      async render() {
        const root = this.contentEl;
        const plugin = this.plugin;
        const revision = ++this.revision;
        const file = plugin.getContextFile();
        const context = findBuchContext2(this.app, file);
        if (!context) {
          this.signature = null;
          root.empty();
          root.createEl("p", { cls: "buches-context-empty", text: "Open a Buch or concept to see its progress and outline." });
          return;
        }
        try {
          const model = await plugin.learning.book(context.book);
          let progress = {};
          let progressError;
          try {
            progress = await plugin.progress.read(model);
          } catch (error) {
            progressError = error.message;
          }
          if (revision !== this.revision) return;
          const chapter = model.byPath.get(file.path);
          const page = chapter ?? await plugin.learning.page(file);
          if (revision !== this.revision) return;
          const headings = page.units.some((unit) => unit.type !== "text") ? page.units.filter((unit) => unit.level).map((unit) => ({ text: unit.title, level: unit.level, line: unit.line })) : outlineFor(this.app, file);
          const widgets = plugin.settings.widgets;
          const signature = JSON.stringify([
            file.path,
            context.name,
            widgets,
            headings,
            progress,
            progressError,
            model.issues,
            model.chapters.map((ch) => [
              ch.path,
              ch.name,
              ch.nodes.map((node) => [node.id, node.title]),
              ch.dependencies.map((dep) => dep?.key),
              ch.nodes.map((node) => model.targets.get(`${ch.path}#${node.id}`).dependencies.map((dep) => dep?.key))
            ])
          ]);
          if (signature === this.signature) return;
          this.signature = signature;
          const wasOpen = root.querySelector?.(".buches-widget-settings")?.open;
          root.empty();
          root.createEl("h3", { cls: "buches-context-title", text: context.name });
          const controls = root.createEl("details", { cls: "buches-widget-settings" });
          controls.open = Boolean(wasOpen);
          controls.createEl("summary", { text: "Customize sidebar" });
          renderWidgetControls(controls, plugin);
          if (progressError) root.createEl("p", { cls: "buches-edit-error", text: progressError });
          const open = (target) => plugin.openTarget(target);
          for (const widget of widgets) {
            if (!widget.visible) continue;
            const section = root.createEl("section", { cls: `buches-context-widget buches-widget-${widget.id}` });
            section.createEl("h4", { cls: "buches-context-label", text: WIDGETS[widget.id] });
            if (widget.id === "progress") {
              if (chapter) exerciseMeter(section, "This chapter", countsFor(model, progress, [chapter]));
              exerciseMeter(section, "Book", countsFor(model, progress));
            } else if (widget.id === "outline") {
              this.renderOutline(section, file, headings, chapter, open);
            } else {
              this.renderGraph(section, file, model, progress, chapter, open);
            }
          }
        } catch (error) {
          if (revision !== this.revision) return;
          this.signature = null;
          root.empty();
          root.createEl("p", { cls: "buches-edit-error", text: error.message });
        }
      }
      renderOutline(section, file, headings, chapter, open) {
        if (!headings.length && !chapter?.nodes.length) {
          section.createEl("p", { cls: "buches-context-empty", text: "No headings yet." });
          return;
        }
        const list = section.createDiv({ cls: "buches-outline" });
        const minLevel = Math.min(...headings.map((item) => item.level));
        for (const heading of headings) {
          const button = list.createEl("button", { cls: `buches-outline-link buches-outline-level-${Math.min(6, heading.level - minLevel)}`, text: heading.text });
          button.setAttribute("aria-label", `Go to ${heading.text}`);
          button.addEventListener("click", () => this.plugin.goToHeading(file, heading));
        }
        for (const node of chapter?.nodes ?? []) {
          if (!node.unit.anchor) continue;
          chapterLink(list, { ...node, file }, open);
        }
      }
      renderGraph(section, file, model, progress, chapter, open) {
        const graph = buildGraph(this.app, model.book);
        const declared = model.chapters.flatMap((node) => node.dependencies.filter((dep) => dep && dep.path !== node.path).map((dep) => ({ source: node.path, target: dep.path, type: "dependency" })));
        graph.edges = [...graph.edges.filter((edge) => edge.type !== "dependency" && !declared.some((dep) => dep.source === edge.source && dep.target === edge.target)), ...declared];
        renderGraph(section.createDiv({ cls: "buches-graph-wrap" }), graph, file.path, (target) => open({ file: target }));
        section.createEl("p", { cls: "buches-graph-caption", text: "Solid prerequisites \xB7 Dashed links \xB7 Faint nesting" });
        if (chapter) {
          renderDependencies(section, model, progress, chapter, open);
          for (const node of chapter.nodes) {
            const target = model.targets.get(`${chapter.path}#${node.id}`);
            if (!target.dependencies.length) continue;
            chapterLink(section, target, open);
            renderDependencies(section, model, progress, target, open);
          }
        }
        if (model.issues.length) section.createEl("p", {
          cls: "buches-context-empty",
          text: `${model.issues.length} prerequisite issues \xB7 See the book index`
        });
      }
    };
    module2.exports = { ContextView: ContextView2, CONTEXT_VIEW: CONTEXT_VIEW2 };
  }
});

// node_modules/monkey-around/index.js
var require_monkey_around = __commonJS({
  "node_modules/monkey-around/index.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.serialize = exports2.after = exports2.dedupe = exports2.around = void 0;
    function around(obj, factories) {
      const removers = Object.keys(factories).map((key) => around1(obj, key, factories[key]));
      return removers.length === 1 ? removers[0] : function() {
        removers.forEach((r) => r());
      };
    }
    exports2.around = around;
    function around1(obj, method, createWrapper) {
      const original = obj[method], hadOwn = obj.hasOwnProperty(method);
      let current = createWrapper(original);
      if (original)
        Object.setPrototypeOf(current, original);
      Object.setPrototypeOf(wrapper, current);
      obj[method] = wrapper;
      return remove;
      function wrapper(...args) {
        if (current === original && obj[method] === wrapper)
          remove();
        return current.apply(this, args);
      }
      function remove() {
        if (obj[method] === wrapper) {
          if (hadOwn)
            obj[method] = original;
          else
            delete obj[method];
        }
        if (current === original)
          return;
        current = original;
        Object.setPrototypeOf(wrapper, original || Function);
      }
    }
    function dedupe(key, oldFn, newFn) {
      check[key] = key;
      return check;
      function check(...args) {
        return (oldFn[key] === key ? oldFn : newFn).apply(this, args);
      }
    }
    exports2.dedupe = dedupe;
    function after(promise, cb) {
      return promise.then(cb, cb);
    }
    exports2.after = after;
    function serialize(asyncFunction) {
      let lastRun = Promise.resolve();
      function wrapper(...args) {
        return lastRun = new Promise((res, rej) => {
          after(lastRun, () => {
            asyncFunction.apply(this, args).then(res, rej);
          });
        });
      }
      wrapper.after = function() {
        return lastRun = new Promise((res, rej) => {
          after(lastRun, res);
        });
      };
      return wrapper;
    }
    exports2.serialize = serialize;
  }
});

// src/tab-titles.js
var require_tab_titles = __commonJS({
  "src/tab-titles.js"(exports2, module2) {
    var { around } = require_monkey_around();
    var { setIcon } = require("obsidian");
    var { findBuchContext: findBuchContext2 } = require_buch_model();
    var { iconFor: iconFor2, renderFileIcon } = require_icons();
    function leafFile(app, leaf) {
      const view = leaf.view;
      if (view?.file) return view.file;
      const state = leaf.getViewState?.();
      if (state?.type !== "markdown" || !state.state?.file) return null;
      return app.vault.getAbstractFileByPath(state.state.file);
    }
    function titleForLeaf(app, leaf) {
      return findBuchContext2(app, leafFile(app, leaf))?.name ?? null;
    }
    function patchLeafTitle(app, leaf) {
      return around(leaf, {
        getDisplayText: (next) => function(...args) {
          return titleForLeaf(app, this) ?? next.apply(this, args);
        }
      });
    }
    var TabTitles2 = class {
      constructor(app) {
        this.app = app;
        this.patched = /* @__PURE__ */ new Map();
      }
      refresh() {
        const leaves = [];
        this.app.workspace.iterateAllLeaves((leaf) => {
          leaves.push(leaf);
        });
        for (const [leaf, undo] of this.patched) {
          if (!leaves.includes(leaf)) {
            undo();
            if (leaf._origIcon && leaf.tabHeaderInnerIconEl) leaf.tabHeaderInnerIconEl.innerHTML = leaf._origIcon;
            delete leaf._origIcon;
            this.patched.delete(leaf);
          }
        }
        for (const leaf of leaves) {
          if (typeof leaf.getDisplayText !== "function" || typeof leaf.updateHeader !== "function") continue;
          const file = leafFile(this.app, leaf);
          const currentTitle = titleForLeaf(this.app, leaf);
          if (currentTitle && !this.patched.has(leaf)) this.patched.set(leaf, patchLeafTitle(this.app, leaf));
          if (this.patched.has(leaf) && leaf.tabHeaderInnerTitleEl?.textContent !== (currentTitle ?? leaf.getDisplayText())) leaf.updateHeader();
          if (leaf.tabHeaderInnerIconEl) {
            const icon = file ? iconFor2(this.app, file) : "";
            if (icon) {
              if (!leaf._origIcon) leaf._origIcon = leaf.tabHeaderInnerIconEl.innerHTML;
              renderFileIcon(leaf.tabHeaderInnerIconEl, icon, setIcon);
            } else if (leaf._origIcon) {
              leaf.tabHeaderInnerIconEl.innerHTML = leaf._origIcon;
              delete leaf._origIcon;
            }
          }
        }
      }
      unload() {
        for (const [leaf, undo] of this.patched) {
          undo();
          if (leaf._origIcon && leaf.tabHeaderInnerIconEl) leaf.tabHeaderInnerIconEl.innerHTML = leaf._origIcon;
          delete leaf._origIcon;
          leaf.updateHeader?.();
        }
        this.patched.clear();
      }
    };
    module2.exports = { titleForLeaf, patchLeafTitle, TabTitles: TabTitles2 };
  }
});

// src/intro-model.js
var require_intro_model = __commonJS({
  "src/intro-model.js"(exports2, module2) {
    function stripFrontmatter(text, trim = true) {
      const body = text.replace(/^\uFEFF?---\s*\r?\n[\s\S]*?\r?\n---\s*(?:\r?\n|$)/, "");
      return trim ? body.trim() : body;
    }
    function getIntroduction(app, file, text) {
      const value = app.metadataCache.getFileCache(file)?.frontmatter?.description;
      return { description: typeof value === "string" ? value.trim() : "", hasBody: !!stripFrontmatter(text) };
    }
    module2.exports = { stripFrontmatter, getIntroduction };
  }
});

// src/introduction.js
var require_introduction = __commonJS({
  "src/introduction.js"(exports2, module2) {
    var { findBuchContext: findBuchContext2 } = require_buch_model();
    var { getIntroduction } = require_intro_model();
    var { iconFor: iconFor2, renderFileIcon } = require_icons();
    var { setIcon } = require("obsidian");
    var IntroductionRenderer2 = class {
      constructor(app) {
        this.app = app;
        this.rendered = /* @__PURE__ */ new Map();
        this.revision = 0;
      }
      async refresh() {
        const token = ++this.revision;
        const leaves = [];
        this.app.workspace.iterateAllLeaves((leaf) => {
          if (leaf.view?.getViewType?.() === "markdown") leaves.push(leaf);
        });
        const activeViews = new Set(leaves.map((leaf) => leaf.view));
        for (const [view, el] of this.rendered) {
          if (!activeViews.has(view)) {
            el.remove();
            this.rendered.delete(view);
          }
        }
        for (const leaf of leaves) {
          const view = leaf.view;
          const context = findBuchContext2(this.app, view.file);
          const previous = this.rendered.get(view);
          if (!context?.isIndex) {
            if (previous) previous.remove();
            this.rendered.delete(view);
            continue;
          }
          if (!view.file || !view.contentEl) continue;
          const path = view.file.path;
          const text = await this.app.vault.cachedRead(view.file);
          if (token !== this.revision || view.file?.path !== path) return;
          const intro = getIntroduction(this.app, view.file, text);
          if (previous) previous.remove();
          const el = view.contentEl.ownerDocument.createElement("section");
          el.className = "buches-introduction";
          el.setAttribute("aria-label", `Introduction to ${context.name}`);
          const eyebrow = el.createEl("div", { cls: "buches-intro-eyebrow", text: "BUCH" });
          eyebrow.setAttribute("aria-hidden", "true");
          const title = el.createEl("h2", { cls: "buches-intro-title" });
          const icon = iconFor2(this.app, view.file);
          if (icon) {
            const iconEl = title.createEl("span", { cls: "buches-page-icon" });
            iconEl.setAttribute("aria-hidden", "true");
            renderFileIcon(iconEl, icon, setIcon);
          }
          title.createEl("span", { text: context.name });
          if (intro.description) el.createEl("p", { cls: "buches-intro-description", text: intro.description });
          else if (!intro.hasBody) el.createEl("p", { cls: "buches-intro-placeholder", text: "Add a description in the properties or write an introduction below." });
          view.contentEl.insertBefore(el, view.contentEl.firstChild);
          this.rendered.set(view, el);
        }
      }
      unload() {
        this.revision++;
        for (const el of this.rendered.values()) el.remove();
        this.rendered.clear();
      }
    };
    module2.exports = { IntroductionRenderer: IntroductionRenderer2 };
  }
});

// src/pagination.js
var require_pagination = __commonJS({
  "src/pagination.js"(exports2, module2) {
    var { findBuchContext: findBuchContext2 } = require_buch_model();
    var { getPagination } = require_order_model();
    var { iconFor: iconFor2, renderFileIcon } = require_icons();
    var { setIcon } = require("obsidian");
    function renderPagination(parent, pagination, openFile) {
      const el = parent.createEl("nav", { cls: "buches-pagination", attr: { "aria-label": "Chapter navigation" } });
      for (const [direction, page, arrow] of [
        ["prev", pagination?.previous, "\u2190"],
        ["next", pagination?.next, "\u2192"]
      ]) {
        if (!page) continue;
        const button = el.createEl("button", { cls: `buches-page-button buches-page-${direction}` });
        button.setAttribute("aria-label", `${direction === "prev" ? "Previous" : "Next"} note: ${page.name}`);
        if (direction === "prev") button.createSpan({ cls: "buches-page-arrow", text: arrow, attr: { "aria-hidden": "true" } });
        button.createSpan({ cls: "buches-page-nav-title", text: page.name });
        if (direction === "next") button.createSpan({ cls: "buches-page-arrow", text: arrow, attr: { "aria-hidden": "true" } });
        button.addEventListener("click", () => openFile(page.file, direction));
      }
      return el;
    }
    var PaginationRenderer2 = class {
      constructor(app, plugin) {
        this.app = app;
        this.plugin = plugin;
        this.rendered = /* @__PURE__ */ new Map();
        this.noteIcons = /* @__PURE__ */ new Map();
        this.revision = 0;
      }
      async refresh() {
        const token = ++this.revision;
        const leaves = [];
        this.app.workspace.iterateAllLeaves((leaf) => {
          if (leaf.view?.getViewType?.() === "markdown") leaves.push(leaf);
        });
        const activeViews = new Set(leaves.map((leaf) => leaf.view));
        for (const [view, el] of this.rendered) {
          if (!activeViews.has(view)) {
            el.remove();
            this.rendered.delete(view);
          }
        }
        for (const [view, el] of this.noteIcons) {
          if (!activeViews.has(view)) {
            el.remove();
            this.noteIcons.delete(view);
          }
        }
        for (const leaf of leaves) {
          const view = leaf.view;
          if (!view.file || !view.contentEl) continue;
          const context = findBuchContext2(this.app, view.file);
          const prevEl = this.rendered.get(view);
          const prevIcon = this.noteIcons.get(view);
          if (!context) {
            view.containerEl?.removeClass?.("buches-is-index");
            view.containerEl?.removeClass?.("buches-is-concept");
            if (prevEl) {
              prevEl.remove();
              this.rendered.delete(view);
            }
            if (prevIcon) {
              prevIcon.remove();
              this.noteIcons.delete(view);
            }
            continue;
          }
          if (context.isIndex) {
            view.containerEl?.addClass?.("buches-is-index");
            view.containerEl?.removeClass?.("buches-is-concept");
            if (prevIcon) {
              prevIcon.remove();
              this.noteIcons.delete(view);
            }
          } else {
            view.containerEl?.removeClass?.("buches-is-index");
            view.containerEl?.addClass?.("buches-is-concept");
            const icon = iconFor2(this.app, view.file);
            const inlineTitle = view.contentEl.querySelector(".inline-title");
            if (icon && inlineTitle && inlineTitle.parentElement) {
              if (prevIcon) prevIcon.remove();
              const iconEl = view.contentEl.ownerDocument.createElement("div");
              iconEl.className = "buches-note-icon";
              iconEl.setAttribute("aria-hidden", "true");
              renderFileIcon(iconEl, icon, setIcon);
              inlineTitle.parentElement.insertBefore(iconEl, inlineTitle);
              this.noteIcons.set(view, iconEl);
            } else if (prevIcon) {
              prevIcon.remove();
              this.noteIcons.delete(view);
            }
          }
          const pagination = getPagination(this.app, context.book, view.file.path);
          if (token !== this.revision) return;
          if (prevEl) prevEl.remove();
          const el = view.contentEl.createDiv({ cls: "buches-editor-navigation" });
          const read = el.createEl("button", { cls: "buches-reader-action", text: "Read book" });
          read.addEventListener("click", () => this.plugin.openFile(context.file, leaf));
          renderPagination(el, withFinish(pagination, context), (file, direction) => this.plugin.turnPage ? this.plugin.turnPage(context, leaf, file, direction) : this.plugin.openFile(file, leaf));
          this.rendered.set(view, el);
        }
      }
      unload() {
        this.revision++;
        for (const el of this.rendered.values()) el.remove();
        this.rendered.clear();
        for (const el of this.noteIcons.values()) el.remove();
        this.noteIcons.clear();
        this.app.workspace.iterateAllLeaves((leaf) => {
          leaf.view?.containerEl?.removeClass?.("buches-is-index");
          leaf.view?.containerEl?.removeClass?.("buches-is-concept");
        });
      }
    };
    function withFinish(pagination, context) {
      if (!pagination || pagination.next || !context?.concept) return pagination;
      return { ...pagination, next: { file: context.book.index, name: "Finish book" } };
    }
    module2.exports = { PaginationRenderer: PaginationRenderer2, renderPagination, withFinish };
  }
});

// src/math.js
var require_math = __commonJS({
  "src/math.js"(exports2, module2) {
    var { MarkdownRenderer, loadMathJax, renderMath, finishRenderMath } = require("obsidian");
    var TOKENS = /^(?:[ \t]*> ?)*[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^(?:[ \t]*> ?)*[ \t]*\1[`~]*[ \t]*(?=\r?$)|(?![\s\S]))|<!--[^]*?-->|%%[^]*?%%|(`+)[\s\S]*?\2|\$\$([\s\S]+?)\$\$|\$((?:\\.|[^\r\n$\\])+?)\$|\\\[((?:\\(?!\])[\s\S]|[^\\])+?)\\\]|\\\(((?:\\(?!\))[^\r\n]|[^\\\r\n])+?)\\\)|\\[^\r\n]/gm;
    function normalizeLatexDelimiters(source) {
      return source.replace(TOKENS, (match, _fence, _code, _display, _inline, latexDisplay, latexInline) => {
        if (latexDisplay !== void 0) return `$$${latexDisplay}$$`;
        if (latexInline !== void 0) return `$${latexInline.trim()}$`;
        return match;
      });
    }
    function extractMath(source, allowLatexDelimiters = true) {
      const formulas = [];
      const prefix = `buches-${Math.random().toString(36).slice(2)}-`;
      const markdown = source.replace(TOKENS, (match, _fence, _code, display, inline, latexDisplay, latexInline) => {
        const block = display ?? (allowLatexDelimiters ? latexDisplay : void 0);
        const math = block ?? inline ?? (allowLatexDelimiters ? latexInline : void 0);
        if (math === void 0) return match;
        const id = prefix + formulas.length;
        formulas.push({
          id,
          source: block === void 0 ? math : math.replace(/^(?:[ \t]*> ?)+/gm, ""),
          display: block !== void 0,
          literal: match
        });
        return `<span data-buches-formula="${id}"></span>`;
      });
      return { markdown, formulas };
    }
    function typstMate(app) {
      return app.plugins?.plugins?.["typst-mate"];
    }
    async function renderMarkdown(app, source, target, path, component, engine) {
      const { markdown, formulas } = extractMath(source, engine === "mathjax");
      await MarkdownRenderer.render(app, markdown, target, path, component);
      if (!formulas.length) return;
      const mate = typstMate(app);
      let mathJaxUsed = false;
      if (engine === "mathjax") await loadMathJax();
      for (const formula of formulas) {
        const slot = target.querySelector(`[data-buches-formula="${formula.id}"]`);
        if (!slot) continue;
        slot.addClass(formula.display ? "buches-display-math" : "buches-inline-math");
        try {
          if (engine === "typst") {
            const manager = mate?.typstManager;
            if (!manager?.ready || typeof manager.render !== "function") throw new Error("Typst Mate is unavailable");
            const el = target.ownerDocument.createElement("span");
            const directory = path.slice(0, path.lastIndexOf("/"));
            const rendered = manager.render(formula.source, el, formula.display ? "display" : "inline", directory, path);
            if (!rendered) throw new Error("Typst Mate did not return rendered math");
            slot.append(rendered);
          } else {
            const native = mate?.originalTex2chtml;
            const rendered = typeof native === "function" ? native(formula.source, { display: formula.display }) : renderMath(formula.source, formula.display);
            slot.append(rendered);
            mathJaxUsed = true;
          }
        } catch (error) {
          slot.addClass("buches-math-unavailable");
          slot.setText(formula.literal);
          slot.setAttribute("title", error.message);
        }
      }
      if (mathJaxUsed) finishRenderMath?.();
    }
    module2.exports = { renderMarkdown, typstMate, extractMath, normalizeLatexDelimiters };
  }
});

// src/resolution.js
var require_resolution = __commonJS({
  "src/resolution.js"(exports2, module2) {
    var { stripFrontmatter } = require_intro_model();
    function dividerLines(lines) {
      const markers = [];
      let fence = "";
      let math = false;
      let comment = false;
      for (const [index, line] of lines.entries()) {
        const code = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
        if (fence) {
          if (code && code[1][0] === fence[0] && code[1].length >= fence.length && !code[2].trim()) fence = "";
        } else if (math) {
          if (line.includes("$$")) math = false;
        } else if (comment || line.includes("<!--")) {
          for (const marker of line.match(/<!--|-->/g) ?? []) comment = marker === "<!--";
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
        const proof = lines.slice(start + 1, end).join("\n");
        if (!proof.trim()) continue;
        blocks.push({ markdown: lines.slice(cursor, start).join("\n"), solution: false });
        blocks.push({ markdown: proof, solution: true });
        cursor = end + 1;
      }
      blocks.push({ markdown: lines.slice(cursor).join("\n"), solution: false });
      return blocks;
    }
    module2.exports = { splitResolutions, dividerLines };
  }
});

// src/learning.js
var require_learning = __commonJS({
  "src/learning.js"(exports2, module2) {
    var { stripFrontmatter } = require_intro_model();
    var { dividerLines } = require_resolution();
    var { flattenConcepts: flattenConcepts2 } = require_buch_model();
    var LEARNING_TYPES = /* @__PURE__ */ new Set(["definition", "theorem", "lemma", "proposition", "corollary", "example", "exercise"]);
    var ADDED_SOLUTION = "<!-- buches-added-solution -->";
    var SOLUTION_ENGINE = /^<!-- buches-math: (mathjax|typst) -->[ \t]*(?:\r?\n|$)/;
    function sourceParts(text) {
      const body = stripFrontmatter(text, false);
      const lines = body.split(/(?<=\n)/);
      const offsets = [text.length - body.length];
      for (const line of lines) offsets.push(offsets.at(-1) + line.length);
      const dividers = dividerLines(lines.map((line) => line.replace(/\r?\n$/, "")));
      const parts = [];
      let start = offsets[0];
      for (let index = 0; index + 1 < dividers.length; index += 2) {
        const open = dividers[index];
        const close = dividers[index + 1];
        parts.push({ start, end: offsets[open] });
        parts.push({ start: offsets[open + 1], end: offsets[close], type: "solution" });
        start = offsets[close + 1];
      }
      parts.push({ start, end: text.length });
      return parts;
    }
    async function parsePage(text, metadata) {
      const units = [];
      for (const part of sourceParts(text)) {
        const source = text.slice(part.start, part.end);
        if (part.type === "solution") {
          const added = source.startsWith(ADDED_SOLUTION + "\n") || source.startsWith(ADDED_SOLUTION + "\r\n");
          const body = added ? source.slice(source.indexOf("\n") + 1) : source;
          const engine = body.match(SOLUTION_ENGINE)?.[1];
          units.push({ ...part, source, engine, added, markdown: body.replace(SOLUTION_ENGINE, "") });
          continue;
        }
        if (!source.trim()) continue;
        const parsed = await metadata(source);
        if (!parsed?.sections?.length) {
          units.push({ ...part, source, markdown: source, type: "text" });
          continue;
        }
        const firstLine = text.slice(0, part.start).split("\n").length - 1;
        for (const section of parsed.sections) {
          const { start, end } = section.position;
          const markdown = source.slice(start.offset, end.offset);
          const callout = markdown.match(/^ {0,3}>\s*\[!([\w-]+)\][-+]?[^\S\r\n]*(.*)/);
          const heading = parsed.headings?.find((item) => item.position.start.offset === start.offset);
          units.push({
            start: part.start + start.offset,
            end: part.start + end.offset,
            source: markdown,
            markdown,
            anchor: section.id,
            type: section.type,
            callout: callout?.[1].toLowerCase(),
            title: heading?.heading ?? callout?.[2]?.trim(),
            level: heading?.level,
            line: firstLine + start.line
          });
        }
      }
      const nodes = [];
      const occurrences = /* @__PURE__ */ new Map();
      const legacyOccurrences = /* @__PURE__ */ new Map();
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
        if (unit.type === "heading") {
          lastHeading = unit.level >= 2 ? unit.title : void 0;
          prompt = void 0;
          hints = [];
        }
        const type = LEARNING_TYPES.has(unit.callout) ? unit.callout : unit.type === "heading" && /^Exercise\b/i.test(unit.title ?? "") ? "exercise" : null;
        if (type) {
          const title = unit.title || unit.callout;
          const key = `${type}:${title}`;
          unit.node = { id: unit.anchor ? `^${unit.anchor}` : `${key}#${count(occurrences, key)}`, title, type, unit };
          nodes.push(unit.node);
          if (type === "exercise") {
            prompt = unit.node;
            prompt.prompt = [];
            hints = [];
          }
        }
        if (unit.callout === "hint") hints.push(unit);
        if (unit.type !== "solution") {
          if (prompt && unit !== prompt.unit && !unit.callout && !hints.length) prompt.prompt.push(unit.markdown);
          continue;
        }
        if (unit.added && !prompt) continue;
        let legacyId;
        if (!unit.added) {
          solutionCount++;
          legacyId = lastHeading ? `${lastHeading}#${count(legacyOccurrences, lastHeading)}` : `solution-${solutionCount}`;
        }
        if (!prompt) {
          prompt = { id: legacyId, title: lastHeading ?? `Exercise ${solutionCount}`, type: "exercise", unit };
          nodes.push(prompt);
        }
        prompt.legacyId = legacyId;
        unit.exercise = prompt;
        prompt.solution = unit;
        unit.hints = hints;
        for (const hint of hints) hint.inSolution = true;
        prompt = void 0;
        hints = [];
      }
      return { units, nodes };
    }
    var LearningIndex2 = class {
      constructor(app) {
        this.app = app;
        this.pages = /* @__PURE__ */ new Map();
      }
      async page(file, text) {
        const source = text ?? await this.app.vault.cachedRead(file);
        const cached = this.pages.get(file.path);
        if (cached?.source === source) return cached.page;
        const cache = this.app.metadataCache;
        const page = parsePage(source, (chunk) => cache.computeMetadataAsync?.(new TextEncoder().encode(chunk).buffer));
        this.pages.set(file.path, { source, page });
        return page;
      }
      async book(book) {
        const chapters = await Promise.all(flattenConcepts2(book.concepts).map(async (concept) => ({
          ...concept,
          ...await this.page(concept.file),
          path: concept.file.path,
          dependencies: []
        })));
        const byPath = new Map(chapters.map((chapter) => [chapter.path, chapter]));
        const targets = /* @__PURE__ */ new Map();
        for (const chapter of chapters) {
          chapter.key = chapter.path;
          targets.set(chapter.key, chapter);
          for (const node of chapter.nodes) targets.set(`${chapter.path}#${node.id}`, {
            ...node,
            key: `${chapter.path}#${node.id}`,
            path: chapter.path,
            file: chapter.file,
            dependencies: []
          });
        }
        const issues = [];
        const add = (owner, links) => {
          const values = Array.isArray(links) ? links : links ? [links] : [];
          for (const value of values) {
            const link = typeof value === "string" && value.trim().replace(/^\[\[([^|\]]+)(?:\|[^\]]*)?\]\]$/, "$1");
            const [path2, fragment] = link ? link.split("#") : [];
            const dest = link && (path2 ? this.app.metadataCache.getFirstLinkpathDest(path2, owner.path) : owner.file);
            const target = dest && targets.get(fragment ? `${dest.path}#${fragment}` : dest.path);
            if (!target) issues.push(`${owner.title ?? owner.name}: unresolved prerequisite ${String(value)}`);
            if (!target || !owner.dependencies.includes(target)) owner.dependencies.push(target || null);
          }
        };
        for (const chapter of chapters) {
          const fm = this.app.metadataCache.getFileCache(chapter.file)?.frontmatter;
          add(chapter, fm?.depends_on);
          for (const [id, links] of Object.entries(fm?.block_depends_on ?? {})) {
            const owner = targets.get(`${chapter.path}#^${id.replace(/^\^/, "")}`);
            if (owner) add(owner, links);
            else issues.push(`${chapter.name}: unknown block ${id}`);
          }
        }
        const active = /* @__PURE__ */ new Set();
        const visited = /* @__PURE__ */ new Set();
        const path = [];
        const visit = (target) => {
          if (active.has(target)) {
            const cycle = path.slice(path.indexOf(target)).concat(target);
            for (const item of cycle) item.cyclic = true;
            issues.push(`Prerequisite cycle: ${cycle.map((node) => node.title ?? node.name).join(" \u2192 ")}`);
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
    };
    module2.exports = { LearningIndex: LearningIndex2, parsePage, sourceParts, SOLUTION_ENGINE, ADDED_SOLUTION };
  }
});

// src/solution-notes.js
var require_solution_notes = __commonJS({
  "src/solution-notes.js"(exports2, module2) {
    var { ensureFolder } = require_storage();
    var { ADDED_SOLUTION } = require_learning();
    var EMBED = /^!\[\[([^\]|#]+)(?:\|[^\]]*)?\]\]$/;
    var TAB = /^<!-- buches-solution-tab: (manual|ai) -->\r?\n(!\[\[[^\r\n]+\]\])[ \t]*\r?$/gm;
    function solutionTabs(unit) {
      return [...unit.markdown.matchAll(TAB)].flatMap((match) => {
        const path = match[2].match(EMBED)?.[1];
        return path ? [{ kind: match[1], path, offset: match.index }] : [];
      });
    }
    function primarySolution(unit) {
      return unit.markdown.slice(0, solutionTabs(unit)[0]?.offset ?? unit.markdown.length).trim();
    }
    function isSolutionEmbed(unit) {
      return EMBED.test(primarySolution(unit));
    }
    function resolveEmbed(app, chapter, unit) {
      const path = primarySolution(unit).match(EMBED)?.[1];
      if (!path) return null;
      return app.metadataCache.getFirstLinkpathDest(path, chapter.path) ?? app.vault.getAbstractFileByPath(path.endsWith(".md") ? path : `${path}.md`);
    }
    async function writeSolution(plugin, chapter, book, unit, kind, engine) {
      const { vault } = plugin.app;
      const key = chapter.path;
      const previous = plugin.solutionWrites.get(key) ?? Promise.resolve();
      const operation = previous.catch(() => {
      }).then(async () => {
        const latest = await vault.read(chapter);
        const page = await plugin.learning.page(chapter, latest);
        const exercise = page.nodes.find((node) => node.type === "exercise" && node.id === unit.exercise.id);
        let current = exercise?.solution;
        if (!kind && current && isSolutionEmbed(current)) return resolveEmbed(plugin.app, chapter, current);
        if (!exercise || !current && !unit.virtual || current && !kind && current.source !== unit.source) {
          throw new Error("The solution changed. Reopen it to load the latest version.");
        }
        const addingSection = !current;
        if (addingSection) {
          const next = page.units.slice(page.units.indexOf(exercise.unit) + 1).find((item) => item.node || item.type === "heading" || item.type === "solution" || item.callout && item.callout !== "hint");
          const at = next?.start ?? latest.length;
          current = { start: at, end: at, source: "", markdown: "" };
        }
        const openNotes = ["markdown", "buches-reader"].flatMap((type) => plugin.app.workspace.getLeavesOfType(type));
        if (openNotes.some(({ view }) => view.file === chapter && view.getViewData?.() !== latest && view.dirty)) {
          throw new Error("Save the chapter edits before opening its solution.");
        }
        const folder = `${book.path}/_solutions`;
        await ensureFolder(vault, folder);
        const renderer = kind === "ai" || (current.engine ?? engine) === "mathjax" ? "latex" : "typst";
        const body = kind ? "" : current.markdown.slice(0, solutionTabs(current)[0]?.offset ?? current.markdown.length);
        const content = `---
renderer: ${renderer}
---

${body}`;
        const note = await vault.create(`${folder}/${crypto.randomUUID()}.md`, content);
        try {
          await vault.process(chapter, (text) => {
            if (text !== latest) throw new Error("The chapter changed. Try again.");
            const newline = text.includes("\r\n") ? "\r\n" : "\n";
            const link = `![[${note.path}]]${newline}`;
            const tabOffset = solutionTabs(current)[0]?.offset;
            const suffix = tabOffset === void 0 ? "" : current.markdown.slice(tabOffset);
            const separator = current.source && !current.source.endsWith("\n") ? newline : "";
            const prefix = current.added ? ADDED_SOLUTION + newline : "";
            let replacement = kind ? current.source + separator + `<!-- buches-solution-tab: ${kind} -->${newline}` + link : prefix + link + suffix;
            if (addingSection) {
              replacement = [
                newline,
                newline,
                "---",
                newline,
                ADDED_SOLUTION,
                newline,
                replacement,
                "---",
                newline,
                newline
              ].join("");
            }
            return text.slice(0, current.start) + replacement + text.slice(current.end);
          });
        } catch (error) {
          if (await vault.read(note) === content) await vault.delete(note);
          throw error;
        }
        return note;
      });
      plugin.solutionWrites.set(key, operation);
      try {
        return await operation;
      } finally {
        if (plugin.solutionWrites.get(key) === operation) plugin.solutionWrites.delete(key);
      }
    }
    function materializeSolution(plugin, chapter, book, unit, engine) {
      if (isSolutionEmbed(unit)) return resolveEmbed(plugin.app, chapter, unit);
      return writeSolution(plugin, chapter, book, unit, null, engine);
    }
    function appendSolutionTab(plugin, chapter, book, unit, kind, engine) {
      return writeSolution(plugin, chapter, book, unit, kind, engine);
    }
    module2.exports = { isSolutionEmbed, resolveEmbed, materializeSolution, appendSolutionTab, solutionTabs, primarySolution };
  }
});

// src/study-context.js
var require_study_context = __commonJS({
  "src/study-context.js"(exports2, module2) {
    var { listBuches } = require_catalog();
    var { flattenConcepts: flattenConcepts2 } = require_buch_model();
    var { statusFor: statusFor2 } = require_progress();
    var stopwords = new Set("como qual quais quando sobre para pode esse essa isso este esta isto nota livro definicao the that with what when from this does about".split(" "));
    function terms(text) {
      return new Set(text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().match(/[\p{L}\p{N}]{4,}/gu)?.filter((word) => !stopwords.has(word)) ?? []);
    }
    function overlap(query, text) {
      const words = terms(text);
      return [...query].filter((word) => words.has(word)).length;
    }
    var excerpt = (text, length) => text.length <= length ? text : text.slice(0, length) + "\u2026";
    async function relatedReading(plugin, model, file, focus, question) {
      const query = terms([question, focus?.title, model.byPath.get(file.path)?.name].filter(Boolean).join(" "));
      const target = focus && model.targets.get(`${file.path}#${focus.id}`);
      const direct = [...target?.dependencies ?? [], ...model.byPath.get(file.path)?.dependencies ?? []].filter(Boolean);
      const prerequisites = new Set(direct.map((dep) => dep.key));
      const books = listBuches(plugin.app);
      const matches = [];
      for (const book of books) {
        const chapters = flattenConcepts2(book.concepts);
        const progress = await plugin.progress.read(book.path === model.book.path ? model : { book, chapters: [] }).catch(() => ({}));
        for (const { file: note, name } of chapters) {
          const path = note.path;
          const sameChapter = path === file.path;
          const read = statusFor2({ book }, progress, { path });
          if (!read && !direct.some((dep) => dep.path === path)) continue;
          const page = await plugin.learning.page(note).catch(() => null);
          if (!page) continue;
          const candidates = page.nodes.filter((node) => node.type !== "exercise");
          if (!candidates.length) {
            const prose = page.units.filter((unit) => unit.type !== "solution" && !unit.inSolution).map((unit) => unit.markdown).join("\n\n");
            candidates.push({ title: name, unit: { markdown: prose } });
          }
          for (const node of candidates) {
            const ref = path + (node.id?.startsWith("^") ? "#" + node.id : "");
            const explicit = prerequisites.has(ref) || prerequisites.has(path);
            if (sameChapter && (!focus || node.id === focus.id || !explicit)) continue;
            if (!explicit && !read) continue;
            const score = 4 * overlap(query, node.title) + overlap(query, node.unit.markdown) + overlap(query, name);
            if (!explicit && !score) continue;
            matches.push({ ref, path, title: node.title, read, explicit, score, text: excerpt(node.unit.markdown, 650) });
          }
        }
      }
      matches.sort((a, b) => Number(b.explicit) - Number(a.explicit) || b.score - a.score);
      const seen = /* @__PURE__ */ new Set();
      return matches.filter((match) => {
        if (seen.has(match.path)) return false;
        seen.add(match.path);
        return true;
      }).slice(0, 5);
    }
    function chapterExcerpt(page, focus) {
      if (focus?.unit.type !== "solution" && focus?.unit.markdown) {
        return [focus.unit.markdown, ...focus.prompt ?? []].join("\n\n");
      }
      return excerpt(page.units.filter((unit) => unit.type !== "solution" && !unit.inSolution).map((unit) => unit.markdown).join("\n\n"), 4800);
    }
    module2.exports = { relatedReading, chapterExcerpt };
  }
});

// src/claudian.js
var require_claudian = __commonJS({
  "src/claudian.js"(exports2, module2) {
    var { Modal, Notice: Notice2, setIcon } = require("obsidian");
    var { stripFrontmatter } = require_intro_model();
    var { isSolutionEmbed, resolveEmbed, primarySolution } = require_solution_notes();
    var { relatedReading, chapterExcerpt } = require_study_context();
    var CLAUDIAN = "realclaudian";
    function claudian(app) {
      return app.plugins?.getPlugin?.(CLAUDIAN);
    }
    function inlineEdit(app) {
      return app.commands?.commands?.[`${CLAUDIAN}:inline-edit`]?.editorCallback;
    }
    async function openChat(app, plugin) {
      if (typeof plugin.views?.activateView === "function") return plugin.views.activateView();
      const leaf = app.workspace.getLeavesOfType("claudian-view")[0];
      if (leaf) await app.workspace.revealLeaf(leaf);
      else app.commands?.executeCommandById?.(`${CLAUDIAN}:open-view`);
    }
    async function handOff(app, prompt) {
      const plugin = claudian(app);
      if (!plugin) throw new Error("Enable Claudian to continue.");
      await openChat(app, plugin);
      const api = claudian(app)?.api;
      const session = api?.version === 1 && api.getActiveSessionId?.();
      if (session) {
        const status = await api.send(session, { text: prompt, mode: "queue" });
        new Notice2(status === "queued" ? "Question queued in Claudian." : "Sent to Claudian.");
        return session;
      }
      const chat = plugin.views?.getView?.() ?? app.workspace.getLeavesOfType("claudian-view")[0]?.view;
      if (chat?.appendToActiveInput?.(prompt)) {
        new Notice2("Draft ready in Claudian. Send it when you are ready.");
        return;
      }
      await navigator.clipboard.writeText(prompt);
      new Notice2("Prompt copied. Paste it into your Claudian chat.");
    }
    function claudianButton(parent, icon, label, action) {
      const button = parent.createEl("button", {
        cls: "buches-claudian-button",
        attr: { "aria-label": label, title: label, type: "button" }
      });
      setIcon(button, icon);
      button.addEventListener("click", async () => {
        button.disabled = true;
        try {
          await action();
        } catch (error) {
          new Notice2(error.message ?? String(error));
        } finally {
          button.disabled = false;
        }
      });
      return button;
    }
    async function readAttempt(reader, file, exercise, selectedSolution) {
      await reader.flushEmbeds();
      const selected = selectedSolution?.();
      if (selected) return stripFrontmatter(await reader.app.vault.read(selected));
      const plugin = reader.plugin;
      const page = await plugin.learning.page(file, await reader.app.vault.read(file));
      const solution = page.nodes.find((node) => node.id === exercise.id)?.solution;
      if (!solution) return "";
      if (!isSolutionEmbed(solution)) return primarySolution(solution);
      const note = resolveEmbed(reader.app, file, solution);
      return note ? stripFrontmatter(await reader.app.vault.read(note)) : "";
    }
    var StudyQuestion = class extends Modal {
      constructor(reader, state, focus, review, selectedSolution) {
        super(reader.app);
        Object.assign(this, { reader, state, focus, review, selectedSolution });
      }
      onOpen() {
        const { contentEl, reader, state, focus, review } = this;
        const chapter = state.model.byPath.get(state.file.path);
        const title = focus?.title ?? chapter?.name ?? state.model.book.title;
        contentEl.createEl("h2", { text: review ? "Review my solution" : "Ask Claudian" });
        contentEl.createEl("p", { cls: "buches-claudian-scope", text: title });
        const form = contentEl.createEl("form", { cls: "buches-name-form" });
        const label = review ? "What would you like checked? (optional)" : "Your question";
        const input = form.createEl("textarea", { attr: { "aria-label": label, placeholder: label, rows: 3 } });
        input.required = !review;
        const attempt = review && form.createEl("textarea", {
          attr: { "aria-label": "Attempt to review", placeholder: "Paste an attempt or use the saved solution", rows: 3 }
        });
        const contextLabel = form.createEl("label", { cls: "buches-claudian-context-option" });
        const related = contextLabel.createEl("input", { type: "checkbox" });
        related.checked = true;
        contextLabel.createSpan({ text: " Include related notes I\u2019ve read and prerequisites" });
        const status = form.createEl("p", { cls: "buches-claudian-scope", attr: { role: "status" } });
        const actions = form.createDiv({ cls: "buches-modal-actions" });
        actions.createEl("button", { type: "button", text: "Cancel" }).addEventListener("click", () => this.close());
        const send = actions.createEl("button", { type: "submit", text: "Send to Claudian", cls: "mod-cta" });
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          if (send.disabled) return;
          send.disabled = true;
          status.setText("Gathering context\u2026");
          try {
            const question = input.value.trim();
            if (!review && !question) throw new Error("Enter a question.");
            const proof = review && (attempt.value.trim() || await readAttempt(reader, state.file, focus, this.selectedSolution));
            if (review && !proof) throw new Error("Write a solution or paste your attempt to review.");
            const page = await reader.plugin.learning.page(state.file);
            const current = focus && page.nodes.find((node) => node.id === focus.id);
            if (focus && !current) throw new Error("This block has changed. Reopen it in the reader.");
            const context = related.checked ? await relatedReading(reader.plugin, state.model, state.file, focus, question) : [];
            const ref = state.file.path + (focus?.id.startsWith("^") ? "#" + focus.id : "");
            const request = review ? "Check my proof step by step. Identify the first gap, explain whether the conclusion follows, and give a focused hint for fixing it. Keep the full corrected proof for a follow-up request." : "Answer my question as a tutor. Use the supplied notes when relevant and cite their file or block references. Make any additional assumptions explicit.";
            const prompt = [
              request + " Treat note excerpts as reference material. Reply in chat without changing files or progress.",
              question && `My question: ${question}`,
              `Book: ${state.model.book.title}
Focus: ${title}
Source: ${ref}

${chapterExcerpt(page, current)}`,
              proof && `My attempt:
${proof}`,
              ...context.map((item) => `Related ${item.read ? "reading" : "prerequisite"}: ${item.ref}
${item.text}`)
            ].filter(Boolean).join("\n\n");
            if (this.closed) return;
            await handOff(reader.app, prompt);
            this.close();
          } catch (error) {
            status.setText(error.message ?? String(error));
          } finally {
            send.disabled = false;
          }
        });
        input.focus();
      }
      onClose() {
        this.closed = true;
      }
    };
    function patchRange(text, unit) {
      if (!unit) return [text.length - stripFrontmatter(text, false).length, text.length];
      const body = unit.source.indexOf("\n");
      if (body < 0) throw new Error("This block has no body to rewrite.");
      const anchor = unit.source.match(/(?:\r?\n(?:> ?)?|[ \t]+)\^[\w-]+[ \t]*$/);
      return [unit.start + body + 1, anchor ? unit.start + anchor.index : unit.end];
    }
    async function openPatch(reader, file, focus) {
      const edit = inlineEdit(reader.app);
      if (!edit) throw new Error("Claudian Inline edit is unavailable.");
      if (reader.file !== file || reader.sheet || reader.editingChapter) return;
      await reader.toggleChapterEditor();
      try {
        const editor = reader.editor;
        const text = editor.getValue();
        const page = focus && await reader.plugin.learning.page(file, text);
        if (reader.file !== file || !reader.editingChapter || reader.editor !== editor || editor.getValue() !== text) {
          throw new Error("The note changed. Reopen the patch to select the current text.");
        }
        const current = page?.nodes.find((node) => node.id === focus.id);
        if (focus && current?.unit.source.replace(/\r\n/g, "\n") !== focus.unit.source.replace(/\r\n/g, "\n")) {
          throw new Error("The block changed. Reopen the patch to select the current text.");
        }
        const [start, end] = patchRange(text, current?.unit);
        if (!text.slice(start, end).trim()) throw new Error("There is no text to rewrite.");
        editor.setSelection(editor.offsetToPos(start), editor.offsetToPos(end));
        await edit(editor, reader);
      } finally {
        if (reader.file === file && reader.editingChapter) await reader.toggleChapterEditor();
      }
    }
    function studyActions(reader, host, state, focus, { review = false, patch = false, question = !review, selectedSolution } = {}) {
      if (!state.model || !claudian(reader.app)) return;
      const actions = host.createSpan({ cls: "buches-claudian-actions" });
      if (question) claudianButton(
        actions,
        "message-circle",
        "Ask Claudian about this",
        () => new StudyQuestion(reader, state, focus, false).open()
      );
      if (review) claudianButton(
        actions,
        "list-checks",
        "Review my solution with Claudian",
        () => new StudyQuestion(reader, state, focus, true, selectedSolution).open()
      );
      if (patch && inlineEdit(reader.app)) {
        claudianButton(
          actions,
          "wand-sparkles",
          focus ? "Patch this block with Claudian" : "Patch this note with Claudian",
          () => openPatch(reader, state.file, focus)
        );
      }
    }
    module2.exports = { claudian, studyActions, patchRange, handOff };
  }
});

// skills/buches-proof-tutor/SKILL.md
var require_SKILL = __commonJS({
  "skills/buches-proof-tutor/SKILL.md"(exports2, module2) {
    module2.exports = "---\nname: buches-proof-tutor\ndescription: Write a proof, proof sketch, or first-step hint for an exercise in a B\xFCcher book.\n---\n\nHonor the requested proof method, scope, and writing style. For a complete proof, justify each essential inference. For a hint, stop at the requested point.\n\nUse the supplied book passages as references and favor definitions and methods the reader has already studied. When a new result is essential, identify it before using it. Follow the exercise's language unless the user requests another. Format math for Obsidian with dollar delimiters.\n";
  }
});

// skills/buches-proof-reviewer/SKILL.md
var require_SKILL2 = __commonJS({
  "skills/buches-proof-reviewer/SKILL.md"(exports2, module2) {
    module2.exports = "---\nname: buches-proof-reviewer\ndescription: Grade a proof from a B\xFCcher exercise against the book's weighted rubric and annotate its source lines.\n---\n\nGrade the submitted proof from 0 to 10 on each rubric criterion, once per criterion. Give one concise reason per score in the language of the rubric.\n\nA minor slip that leaves the proof substantially sound can earn around 8 for correctness. A missing key implication or invalid argument should score lower. Judge simplicity using the material marked read and the declared prerequisites. If context is missing, say so instead of assuming what the student knows.\n\nWrite a brief review summary of what you verified. Cite exact numbered source lines only where a comment helps the reader improve the proof. Format math for Obsidian with dollar delimiters.\n";
  }
});

// src/study-skills.js
var require_study_skills = __commonJS({
  "src/study-skills.js"(exports2, module2) {
    var { stripFrontmatter } = require_intro_model();
    module2.exports = {
      proofTutor: stripFrontmatter(require_SKILL()),
      proofReviewer: stripFrontmatter(require_SKILL2())
    };
  }
});

// src/ai-solutions.js
var require_ai_solutions = __commonJS({
  "src/ai-solutions.js"(exports2, module2) {
    var { Modal, Notice: Notice2 } = require("obsidian");
    var { claudian, handOff } = require_claudian();
    var { chapterExcerpt } = require_study_context();
    var { normalizeLatexDelimiters } = require_math();
    var { proofTutor } = require_study_skills();
    var TASK_STATUS = {
      preparing: "Finding relevant passages\u2026",
      starting: "Starting the model\u2026",
      working: "Analyzing the exercise\u2026",
      responding: "Receiving the response\u2026"
    };
    var STYLES = {
      concise: {
        label: "Concise",
        description: "A short, complete proof with the key calculation or inference.",
        instruction: "Start with the first mathematical step. Aim for one to three compact paragraphs or a single derivation with brief justification. Use more space only when the exercise requires it. Skip introductions, restating the exercise, optional examples, and recaps."
      },
      "step-by-step": {
        label: "Step by step",
        description: "The complete proof, with each non-obvious step explained.",
        instruction: "Present a complete proof. Explain each non-obvious step and why the key manipulation is valid. Keep background and examples out unless requested or required."
      },
      sketch: {
        label: "Proof sketch",
        description: "The strategy and key identities, with routine details left to you.",
        instruction: "Give the proof strategy and the decisive identities or implications. Leave routine calculations to the reader. Identify any substantive gap left for the reader to fill."
      },
      "first-step": {
        label: "First step only",
        description: "One useful starting move and why it helps.",
        instruction: "Give one concrete starting step and briefly explain why it is useful. Stop before giving later steps or the conclusion."
      }
    };
    function solutionPrompt(file, exercise, excerpt, instructions, style) {
      const preset = Object.hasOwn(STYLES, style) ? STYLES[style] : STYLES.concise;
      return [
        "Answer in the language of the exercise unless I explicitly ask for another language. Follow any explicit method, scope, or detail I request. Apply the selected style where it fits those instructions.",
        `Writing style: ${preset.label}. ${preset.instruction}`,
        "Use Obsidian Markdown. Write inline math as $...$. Put display math between $$ delimiters on their own lines. Do not use backslash-parenthesis or backslash-bracket delimiters. Put LaTeX environments inside display math. Do not wrap the reply in a code fence. Return the requested mathematical content in chat without editing files.",
        `Exercise: ${exercise.title}
Source: ${file.path}

${excerpt}`,
        instructions && `My instructions: ${instructions}`
      ].filter(Boolean).join("\n\n");
    }
    var AiSolutionModal = class extends Modal {
      constructor(app, submit) {
        super(app);
        this.submit = submit;
      }
      onOpen() {
        this.contentEl.createEl("h2", { text: "AI solution" });
        const form = this.contentEl.createEl("form", { cls: "buches-name-form" });
        const label = form.createEl("label", { cls: "buches-ai-style" });
        label.createSpan({ text: "Writing style" });
        const style = label.createEl("select", { cls: "dropdown" });
        for (const [value, preset] of Object.entries(STYLES)) {
          style.createEl("option", { text: preset.label, attr: { value } });
        }
        const description = form.createEl("p", { cls: "buches-claudian-scope", text: STYLES.concise.description });
        style.addEventListener("change", () => description.setText(STYLES[style.value].description));
        const input = form.createEl("textarea", { attr: {
          "aria-label": "Instructions (optional)",
          placeholder: "e.g. Reindex the Leibniz formula and show the key algebraic step.",
          rows: 3
        } });
        const actions = form.createDiv({ cls: "buches-modal-actions" });
        actions.createEl("button", { type: "button", text: "Cancel" }).addEventListener("click", () => this.close());
        const send = actions.createEl("button", { type: "submit", text: "Ask Claudian", cls: "mod-cta" });
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          if (send.disabled) return;
          send.disabled = true;
          try {
            await this.submit(input.value.trim(), style.value);
            this.close();
          } catch (error) {
            new Notice2(error.message ?? String(error));
          } finally {
            send.disabled = false;
          }
        });
        input.focus();
      }
      onClose() {
        this.contentEl.empty();
      }
    };
    var AiSolutions2 = class {
      constructor(plugin) {
        this.plugin = plugin;
        this.pending = /* @__PURE__ */ new Map();
        this.errors = /* @__PURE__ */ new WeakMap();
        this.revision = 0;
        plugin.registerEvent(plugin.app.workspace.on("claudian:turn-ended", (event) => {
          void this.receive(event.sessionId).catch((error) => plugin.report(error, "Could not read the Claudian reply."));
        }));
      }
      async ask(note, file, exercise, instructions, style, model) {
        const app = this.plugin.app;
        const page = await this.plugin.learning.page(file);
        const current = page.nodes.find((node) => node.id === exercise.id);
        if (!current) throw new Error("The exercise changed. Reopen it and try again.");
        const initial = await app.vault.read(note);
        const prompt = solutionPrompt(file, current, chapterExcerpt(page, current), instructions, style);
        const save = async (proof) => {
          await app.vault.process(note, (current2) => {
            const prefix = current2 === initial ? current2 : current2.trimEnd() + "\n\n";
            return prefix + normalizeLatexDelimiters(proof) + "\n";
          });
          new Notice2("AI solution saved in its tab.");
        };
        if (!claudian(app)?.api?.runTask) return this.request(note, "solution", prompt, save);
        this.run(note, "solution", async (api, options) => {
          const { text } = await api.runTask({
            ...options,
            instructions: proofTutor,
            prompt,
            book: { path: model.book.path, chapter: file.path, block: current.id, query: instructions }
          });
          options.signal.throwIfAborted();
          await save(text);
        });
      }
      run(note, kind, work) {
        if (this.isPending(note)) throw new Error("A request for this solution is already waiting.");
        const api = claudian(this.plugin.app)?.api;
        if (!api?.runTask) throw new Error("Install the Claudian for B\xFCcher fork to run this request.");
        const token = crypto.randomUUID();
        const controller = new AbortController();
        const task = { note, kind, controller, phase: "preparing" };
        this.errors.delete(note);
        this.pending.set(token, task);
        this.changed();
        const onProgress = (phase) => {
          if (controller.signal.aborted) return;
          task.phase = phase;
          this.changed();
        };
        const onAnalysis = (text) => {
          if (controller.signal.aborted) return;
          task.analysis = ((task.analysis ?? "") + text).slice(0, 8e3);
          this.plugin.app.workspace.trigger?.("buches:analysis", note, task.analysis);
        };
        void Promise.resolve().then(() => work(api, { signal: controller.signal, onProgress, onAnalysis })).catch((error) => {
          if (!controller.signal.aborted) this.errors.set(note, error.message ?? String(error));
        }).finally(() => {
          if (this.pending.delete(token)) this.changed();
        });
      }
      pendingTask(note, kind) {
        return [...this.pending.values()].find((task) => task.note === note && (!kind || kind === task.kind));
      }
      taskStatus(note, kind) {
        const task = this.pendingTask(note, kind);
        return TASK_STATUS[task?.phase] ?? "Waiting for Claudian\u2026";
      }
      dispose() {
        for (const request of this.pending.values()) request.controller?.abort();
        this.pending.clear();
      }
      async request(note, kind, prompt, save) {
        if (this.isPending(note)) throw new Error("A request for this solution is already waiting.");
        const token = crypto.randomUUID();
        const marker = `<!-- buches-ai-${kind}: ${token} -->`;
        const request = { note, marker, kind, save, session: void 0 };
        this.errors.delete(note);
        this.pending.set(token, request);
        this.changed();
        try {
          request.session = await handOff(this.plugin.app, prompt + "\n\nBegin the reply with this exact line:\n" + marker);
        } catch (error) {
          this.pending.delete(token);
          this.changed();
          throw error;
        }
      }
      changed() {
        this.revision += 1;
        this.plugin.app.workspace.trigger?.("buches:ai-changed");
        this.plugin.scheduleRefresh();
      }
      isPending(note, kind) {
        return [...this.pending.values()].some((request) => request.note === note && (!kind || request.kind === kind));
      }
      cancel(note) {
        for (const [token, request] of this.pending) {
          if (request.note !== note) continue;
          request.controller?.abort();
          this.pending.delete(token);
        }
        this.changed();
      }
      async receive(sessionId) {
        const api = claudian(this.plugin.app)?.api;
        const candidates = [...this.pending].filter(([, request]) => request.marker && (!request.session || request.session === sessionId));
        if (!candidates.length || api?.version !== 1) return;
        const lines = (await api.read(sessionId)).trim().split(/\r?\n/);
        for (const [token, request] of candidates) {
          const markerIndex = lines.findIndex((line) => line.trim() === request.marker);
          if (markerIndex < 0 || !this.pending.delete(token)) continue;
          try {
            await request.save(lines.slice(markerIndex + 1).join("\n").trim());
          } catch (error) {
            this.errors.set(request.note, error.message);
            this.plugin.report(error, error.message || "Could not save the Claudian reply.");
          } finally {
            this.changed();
          }
          return;
        }
      }
    };
    module2.exports = { AiSolutions: AiSolutions2, AiSolutionModal, solutionPrompt };
  }
});

// src/grading.js
var require_grading = __commonJS({
  "src/grading.js"(exports2, module2) {
    var { Component, Modal, parseYaml, stringifyYaml } = require("obsidian");
    var { claudian } = require_claudian();
    var { chapterExcerpt } = require_study_context();
    var { proofReviewer } = require_study_skills();
    var FRONTMATTER = /^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;
    function rubricFor(frontmatter) {
      const rows = frontmatter?.grading;
      if (!Array.isArray(rows) || !rows.length) return [];
      const ids = /* @__PURE__ */ new Set();
      for (const row of rows) {
        if (typeof row?.id !== "string" || !row.id.trim() || ids.has(row.id) || typeof row.label !== "string" || !row.label.trim() || typeof row.criteria !== "string" || !row.criteria.trim() || !Number.isFinite(row.weight) || row.weight <= 0) return [];
        ids.add(row.id);
      }
      return rows.map(({ id, label, criteria, weight }) => ({ id, label, criteria, weight }));
    }
    function readSolution(text) {
      const header = text.match(FRONTMATTER);
      return {
        metadata: header ? parseYaml(header[1]) ?? {} : {},
        body: text.slice(header?.[0].length ?? 0)
      };
    }
    async function solutionFingerprint(body, rubric) {
      const bytes = new TextEncoder().encode(JSON.stringify([body, rubric]));
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    }
    function validateGrade(reply, rubric, lineCount) {
      let grade = reply;
      if (typeof reply === "string") {
        const json = reply.trim().replace(/^```(?:json)?\s*\n/i, "").replace(/\n```\s*$/, "");
        try {
          grade = JSON.parse(json);
        } catch {
          throw new Error("Claudian did not return a readable grade. Try grading again.");
        }
      }
      if (!Array.isArray(grade?.scores) || grade.scores.length !== rubric.length || !Array.isArray(grade.comments)) {
        throw new Error("Claudian did not return a grade for every criterion.");
      }
      const scores = rubric.map(({ id }) => {
        const score = grade.scores.find((item) => item?.id === id);
        if (!Number.isFinite(score?.score) || score.score < 0 || score.score > 10 || typeof score.reason !== "string" || !score.reason.trim()) {
          throw new Error("Claudian returned an invalid score or reason.");
        }
        return { id, score: score.score, reason: score.reason };
      });
      const comments = grade.comments.map((item) => {
        if (!Number.isInteger(item?.line) || item.line < 1 || item.line > lineCount || typeof item.comment !== "string" || !item.comment.trim()) {
          throw new Error("Claudian returned a comment outside the solution.");
        }
        return { line: item.line, comment: item.comment };
      });
      const summary = typeof grade.summary === "string" ? grade.summary.trim() : "";
      return { scores, comments, ...summary ? { summary } : {} };
    }
    function gradeSchema(rubric) {
      const object = (properties) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
      const string = { type: "string" };
      return object({
        summary: { ...string, description: "A short student-facing explanation of the main checks and their outcome." },
        scores: { type: "array", items: object({
          id: { type: "string", enum: rubric.map((row) => row.id) },
          score: { type: "number" },
          reason: string
        }) },
        comments: { type: "array", items: object({ line: { type: "integer" }, comment: string }) }
      });
    }
    function weightedGrade(rubric, scores) {
      return rubric.reduce((sum, row, i) => sum + row.weight * scores[i].score, 0) / rubric.reduce((sum, row) => sum + row.weight, 0);
    }
    var GradeModal = class extends Modal {
      constructor(reader, state, exercise, note) {
        super(reader.app);
        Object.assign(this, { reader, state, exercise, note });
      }
      onOpen() {
        this.component = new Component();
        this.component.load();
        this.contentEl.createEl("h2", { text: "Solution grade" });
        this.contentEl.createEl("p", { cls: "buches-claudian-scope", text: this.exercise.title });
        this.body = this.contentEl.createDiv();
        this.event = this.app.workspace.on("buches:ai-changed", () => void this.refresh());
        this.analysisEvent = this.app.workspace.on("buches:analysis", (note, text) => {
          if (note === this.note && this.liveAnalysis?.isConnected) this.liveAnalysis.setText(text);
        });
        void this.refresh();
      }
      onClose() {
        this.closed = true;
        if (this.event) this.app.workspace.offref(this.event);
        if (this.analysisEvent) this.app.workspace.offref(this.analysisEvent);
        this.component?.unload();
      }
      rubric() {
        return rubricFor(this.app.metadataCache.getFileCache(this.state.model.book.index)?.frontmatter);
      }
      async refresh() {
        const revision = this.revision = (this.revision ?? 0) + 1;
        try {
          const rubric = this.rubric();
          const { metadata, body } = readSolution(await this.app.vault.read(this.note));
          const fingerprint = await solutionFingerprint(body, rubric);
          if (this.closed || revision !== this.revision) return;
          this.body.empty();
          if (!rubric.length) {
            this.body.createEl("p", { text: "Define grading criteria in the book index frontmatter." });
            return;
          }
          const ai = this.reader.plugin.aiSolutions;
          const saved = metadata.buches_grade;
          if (saved?.fingerprint === fingerprint) {
            const grade = validateGrade(saved, rubric, body.split(/\r?\n/).length);
            await this.showGrade(rubric, grade, body, metadata.renderer);
            return;
          }
          if (ai.isPending(this.note, "grade")) {
            const task = this.body.createDiv({ cls: "buches-grade-pending" });
            task.createEl("p", { text: ai.taskStatus(this.note, "grade"), attr: { role: "status" } });
            task.createEl("progress", { attr: { "aria-label": "Grading in progress" } });
            const details = task.createEl("details", { cls: "buches-grade-analysis" });
            details.open = this.analysisOpen ?? false;
            details.addEventListener("toggle", () => {
              this.analysisOpen = details.open;
            });
            details.createEl("summary", { text: "Review details" });
            this.liveAnalysis = details.createEl("p", {
              cls: "buches-live-analysis",
              text: ai.pendingTask(this.note, "grade").analysis ?? "The model checks the submitted lines against the book\u2019s rubric and relevant material. Its summary will appear here."
            });
            task.createEl("button", { text: "Cancel", attr: { type: "button" } }).addEventListener("click", () => ai.cancel(this.note));
            return;
          }
          const error = ai.errors.get(this.note);
          if (error) this.body.createEl("p", { cls: "buches-edit-error", text: error });
          const available = typeof claudian(this.app)?.api?.runTask === "function";
          const message = !body.trim() ? "Write a solution before grading it." : !available ? "Install the Claudian for B\xFCcher fork to grade inside this window." : saved ? "The solution or rubric changed. Grade it again?" : "This solution has not been graded yet. Grade it?";
          this.body.createEl("p", { text: message });
          if (body.trim() && available) {
            const button = this.body.createEl("button", { text: "Grade solution", cls: "mod-cta" });
            button.addEventListener("click", async () => {
              button.disabled = true;
              try {
                await this.grade(rubric, body, fingerprint);
              } catch (error2) {
                this.body.createEl("p", { cls: "buches-edit-error", text: error2.message });
              } finally {
                button.disabled = false;
              }
            });
          }
        } catch (error) {
          if (this.closed || revision !== this.revision) return;
          this.body.empty();
          this.body.createEl("p", { cls: "buches-edit-error", text: error.message });
        }
      }
      grade(rubric, body, fingerprint) {
        const { reader, state, exercise, note } = this;
        reader.plugin.aiSolutions.run(note, "grade", async (api, options) => {
          const page = await reader.plugin.learning.page(state.file);
          const current = page.nodes.find((node) => node.id === exercise.id);
          if (!current) throw new Error("The exercise changed. Reopen it and try again.");
          const lines = body.split(/\r?\n/);
          options.signal.throwIfAborted();
          const { data } = await api.runTask({
            ...options,
            schema: gradeSchema(rubric),
            book: { path: state.model.book.path, chapter: state.file.path, block: current.id, query: exercise.title },
            instructions: proofReviewer,
            prompt: [
              "Rubric: " + JSON.stringify(rubric),
              "Exercise: " + exercise.title + "\n" + chapterExcerpt(page, current),
              "Submitted proof:\n" + lines.map((line, i) => i + 1 + " | " + line).join("\n")
            ].join("\n\n")
          });
          options.signal.throwIfAborted();
          const grade = validateGrade(data, rubric, lines.length);
          await this.app.vault.process(note, (text) => {
            options.signal.throwIfAborted();
            const latest = readSolution(text);
            if (latest.body !== body || JSON.stringify(this.rubric()) !== JSON.stringify(rubric)) {
              throw new Error("The solution or rubric changed while grading. Grade the new version.");
            }
            const yaml = stringifyYaml({ ...latest.metadata, buches_grade: { fingerprint, ...grade } }).trimEnd();
            return "---\n" + yaml + "\n---\n" + latest.body;
          });
        });
      }
      async showGrade(rubric, grade, proof, renderer) {
        const format = (score) => new Intl.NumberFormat(void 0, { maximumFractionDigits: 1 }).format(score);
        this.body.createEl("p", { cls: "buches-grade-total", text: `${format(weightedGrade(rubric, grade.scores))} / 10` });
        if (grade.summary) {
          const details2 = this.body.createEl("details", { cls: "buches-grade-analysis" });
          details2.open = this.analysisOpen ?? false;
          details2.addEventListener("toggle", () => {
            this.analysisOpen = details2.open;
          });
          details2.createEl("summary", { text: "Review details" });
          await this.reader.render(grade.summary, details2.createDiv({ cls: "markdown-rendered" }), {
            file: this.note,
            component: this.component,
            readerMath: "mathjax"
          });
          if (this.closed || !details2.isConnected) return;
        }
        for (const [i, criterion] of rubric.entries()) {
          const result = grade.scores[i];
          const item = this.body.createDiv({ cls: "buches-grade-item" });
          item.createEl("strong", {
            text: `${criterion.label} \xB7 ${format(result.score)}/10 \xB7 weight ${criterion.weight}`,
            attr: { title: criterion.criteria }
          });
          item.createEl("progress", { attr: { value: String(result.score), max: "10", "aria-label": criterion.label } });
          item.createEl("p", { text: result.reason });
        }
        const details = this.body.createEl("details", { cls: "buches-grade-annotations" });
        details.open = true;
        details.createEl("summary", { text: "Commented solution" });
        const source = details.createDiv({ cls: "buches-graded-source" });
        const lines = proof.split(/\r?\n/);
        const bytes = new TextEncoder().encode(proof).buffer;
        const metadata = await this.app.metadataCache.computeMetadataAsync?.(bytes);
        const starts = [.../* @__PURE__ */ new Set([0, ...(metadata?.sections ?? []).map((section) => section.position.start.line)])].filter((line) => line < lines.length).sort((a, b) => a - b);
        const engine = renderer === "latex" ? "mathjax" : renderer === "typst" ? "typst" : this.state.solutionMath;
        for (const [i, start] of starts.entries()) {
          const end = starts[i + 1] ?? lines.length;
          if (this.closed || !source.isConnected) return;
          const segment = source.createDiv({ cls: "buches-graded-line markdown-rendered" });
          await this.reader.render(lines.slice(start, end).join("\n"), segment, {
            file: this.note,
            component: this.component,
            readerMath: engine
          });
          for (const { line, comment } of grade.comments.filter((item) => item.line > start && item.line <= end)) {
            const remark = segment.createDiv({ cls: "buches-grade-comment" });
            remark.createEl("small", { text: `Line ${line}`, attr: { title: lines[line - 1] } });
            await this.reader.render(comment, remark.createDiv(), {
              file: this.note,
              component: this.component,
              readerMath: "mathjax"
            });
          }
        }
      }
    };
    module2.exports = { GradeModal, rubricFor, validateGrade, weightedGrade };
  }
});

// src/reader.js
var require_reader = __commonJS({
  "src/reader.js"(exports2, module2) {
    var { Component, MarkdownView, Keymap, setIcon } = require("obsidian");
    var { findBuchContext: findBuchContext2, flattenConcepts: flattenConcepts2 } = require_buch_model();
    var { getIntroduction, stripFrontmatter } = require_intro_model();
    var { getPagination } = require_order_model();
    var { renderPagination, withFinish } = require_pagination();
    var { iconFor: iconFor2, renderFileIcon } = require_icons();
    var { countsFor, statusFor: statusFor2 } = require_progress();
    var { renderDashboard, renderBookProgress, renderDependencies, chapterLink, progressButton } = require_dashboard();
    var { renderMarkdown } = require_math();
    var { materializeSolution, appendSolutionTab, solutionTabs } = require_solution_notes();
    var { claudian, studyActions } = require_claudian();
    var { AiSolutionModal } = require_ai_solutions();
    var { GradeModal } = require_grading();
    var READER_VIEW2 = "buches-reader";
    var emptySolution = (exercise) => ({ exercise, hints: [], markdown: "", source: "", virtual: true });
    var BuchReader2 = class extends MarkdownView {
      constructor(leaf, plugin) {
        super(leaf);
        this.plugin = plugin;
        this.sheet = false;
        this.embeds = /* @__PURE__ */ new Set();
        this.selectedSolutions = /* @__PURE__ */ new Map();
      }
      getViewType() {
        return READER_VIEW2;
      }
      getIcon() {
        return this.sheet ? "clipboard-list" : "book-open";
      }
      getDisplayText() {
        return this.title || this.file?.basename || "Buches";
      }
      canAcceptExtension() {
        return false;
      }
      getState() {
        return { ...super.getState(), sheet: this.sheet };
      }
      async setState(state, result) {
        const changed = this.sheet !== Boolean(state.sheet);
        this.sheet = Boolean(state.sheet);
        if (this.editingChapter) await this.toggleChapterEditor();
        await super.setState({ ...state, mode: "preview" }, result);
        if (changed) await this.refresh();
      }
      async onOpen() {
        await super.onOpen();
        this.modeButtonEl?.hide();
        this.contentEl.addClass("buches-reader");
        this.nativeHost = this.contentEl.createDiv({ cls: "buches-native-parking" });
        this.pageHost = this.contentEl.createDiv({ cls: "buches-page-host" });
        this.editingBar = this.contentEl.createDiv({ cls: "buches-chapter-edit-bar" });
        const done = this.editingBar.createEl("button", { text: "Back to reading" });
        done.addEventListener("click", () => void this.toggleChapterEditor());
        if (this.editMode?.editorEl) this.nativeHost.append(this.editMode.editorEl);
        if (this.previewMode?.containerEl) this.nativeHost.append(this.previewMode.containerEl);
      }
      async onLoadFile(file) {
        await super.onLoadFile(file);
        await this.refresh();
      }
      async onUnloadFile(file) {
        await this.flushEmbeds();
        if (this.editingChapter) {
          this.contentEl.removeClass("buches-editing-chapter");
          this.editingChapter = false;
        }
        this.refreshTask = null;
        this.renderKey = null;
        this.title = null;
        if (this.renderComponent) this.removeChild(this.renderComponent);
        this.renderComponent = null;
        this.pageHost.empty();
        await super.onUnloadFile(file);
      }
      async flushEmbeds() {
        for (const embed of this.embeds) {
          if (!embed.editor || !embed.dirty) continue;
          embed.requestSave?.cancel?.();
          await embed.save(embed.editor.getValue(), true);
        }
      }
      onSwitchView() {
        return this.toggleChapterEditor();
      }
      async toggleChapterEditor() {
        if (this.editingChapter) {
          await this.setMode(this.previewMode);
          this.editingChapter = false;
          this.contentEl.removeClass("buches-editing-chapter");
          await this.refresh();
          this.pageHost.querySelector(".buches-edit-note")?.focus();
          return;
        }
        if (this.sheet) return;
        await this.flushEmbeds();
        for (const embed of this.embeds) if (embed.editor) embed.showPreview();
        await this.setMode(this.editMode);
        this.editingChapter = true;
        this.contentEl.addClass("buches-editing-chapter");
        this.editMode.onResize();
        this.editor.focus();
      }
      refresh() {
        const file = this.file;
        if (!file || this.editingChapter || this.solutionLoading || [...this.embeds].some((embed) => embed.editor)) return Promise.resolve();
        if (this.refreshTask?.file === file) {
          this.refreshTask.again = true;
          return this.refreshTask.promise;
        }
        const task = { file, again: false };
        this.refreshTask = task;
        task.promise = (async () => {
          try {
            do {
              task.again = false;
              await this.renderPage(file, task);
            } while (task.again && this.refreshTask === task && this.file === file && !this.editingChapter);
          } finally {
            if (this.refreshTask === task) this.refreshTask = null;
          }
        })();
        return task.promise;
      }
      async renderPage(file, task) {
        const plugin = this.plugin;
        const text = await this.app.vault.cachedRead(file);
        const context = findBuchContext2(this.app, file);
        const pagination = context && getPagination(this.app, context.book, file.path);
        const title = context?.name ?? file.basename;
        const sheet = this.sheet;
        const icon = iconFor2(this.app, file);
        const intro = context?.isIndex && getIntroduction(this.app, file, text);
        const parsed = await plugin.learning.page(file, text);
        const model = context && await plugin.learning.book(context.book);
        let progress = {};
        let progressError;
        if (model) {
          try {
            progress = await plugin.progress.read(model);
          } catch (error) {
            progressError = error.message;
          }
        }
        if (this.file !== file || this.refreshTask !== task || this.editingChapter) return;
        const chapter = model?.byPath.get(file.path);
        const { readerMath, solutionMath } = plugin.settings;
        const key = JSON.stringify([
          file.path,
          sheet,
          text,
          title,
          icon,
          intro,
          readerMath,
          solutionMath,
          progress,
          progressError,
          Boolean(claudian(this.app)),
          plugin.aiSolutions.revision,
          model?.book.title,
          model?.issues,
          model?.chapters.map((ch) => [
            ch.path,
            ch.name,
            ch.description,
            ch.category,
            ch.nodes.map((node) => sheet ? [node.id, node.unit.markdown, node.prompt, node.solution?.source] : [node.id, node.title]),
            ch.dependencies.map((dep) => dep?.key),
            ch.nodes.map((node) => model.targets.get(`${ch.path}#${node.id}`)?.dependencies.map((dep) => dep?.key))
          ])
        ]);
        if (key === this.renderKey) return;
        const component = this.addChild(new Component());
        const page = this.contentEl.ownerDocument.createElement("div");
        page.className = "buches-reader-page";
        const header = page.createEl("header", { cls: "buches-reader-header" });
        const bar = header.createDiv({ cls: "buches-reader-bar" });
        if (sheet) {
          chapterLink(bar, { name: title }, () => plugin.openFile(file, this.leaf));
        } else if (context?.isIndex) {
          bar.createSpan({ cls: "buches-reader-position", text: `${pagination.total} ${pagination.total === 1 ? "chapter" : "chapters"}` });
        } else if (context) {
          const home = bar.createEl("button", { cls: "buches-reader-home", text: context.book.title });
          setIcon(home.createSpan({ cls: "buches-reader-home-icon", attr: { "aria-hidden": "true" } }), "book-open");
          home.addEventListener("click", () => plugin.openFile(context.book.index, this.leaf));
          if (pagination) bar.createSpan({ cls: "buches-reader-position", text: `${pagination.index} / ${pagination.total}` });
        }
        if (chapter && !sheet) {
          const count = countsFor(model, progress, [chapter]);
          if (count.exercises) bar.createSpan({ cls: "buches-reader-position", text: `${count.solved} / ${count.exercises} solved` });
          if (statusFor2(model, progress, chapter)) bar.createSpan({ cls: "buches-reader-position", text: "\u2713 Read" });
        }
        if (!sheet) {
          chapterLink(bar, { name: "Exercises" }, () => plugin.openExercises(file, this.leaf));
          const edit = bar.createEl("button", { cls: "buches-reader-action buches-edit-note", text: "Edit note" });
          edit.addEventListener("click", () => void this.toggleChapterEditor());
        }
        const headingHost = header.createDiv({ cls: "buches-title-host buches-source-block" });
        const heading = headingHost.createEl("h1", { cls: "buches-reader-title" });
        if (icon) renderFileIcon(heading.createSpan({ cls: "buches-reader-title-icon", attr: { "aria-hidden": "true" } }), icon, setIcon);
        const headingText = heading.createSpan({ text: sheet ? "Exercises" : title });
        if (!sheet && intro?.description) header.createEl("p", { cls: "buches-reader-description", text: intro.description });
        if (progressError) header.createEl("p", { cls: "buches-edit-error", text: progressError });
        if (!sheet && context?.isIndex && model) renderBookProgress(header, model, progress);
        const body = page.createEl("article", { cls: "buches-reader-body markdown-rendered" });
        const units = parsed.units;
        const state = { file, model, progress, component, readerMath, solutionMath };
        studyActions(this, bar, state, void 0, { patch: !sheet });
        const firstHeading = units[0]?.level === 1 ? units[0] : null;
        try {
          if (sheet && model) await this.renderExerciseSheet(body, context, state);
          if (!sheet && firstHeading) {
            const titleMarkup = firstHeading.markdown.replace(/^ {0,3}#\s+/, "").replace(/\s+#+\s*$/, "");
            headingText.empty();
            await this.render(titleMarkup, headingText, state);
            const inline = headingText.querySelector("p");
            if (inline) headingText.replaceChildren(...inline.childNodes);
            heading.dataset.heading = firstHeading.title;
          }
          if (!sheet) await Promise.all(units.map(async (unit) => {
            if (unit === firstHeading || unit.inSolution) return;
            if (unit.type === "solution") return this.renderSolution(body, unit, state);
            const row = body.createDiv({ cls: "buches-source-block" });
            const rendered = row.createDiv();
            await this.renderUnit(unit, rendered, state);
            if (unit.node) {
              row.dataset.block = unit.node.id;
              studyActions(this, row, state, unit.node, {
                patch: Boolean(unit.callout && unit.node.type !== "exercise"),
                question: true
              });
              const target = model?.targets.get(`${file.path}#${unit.node.id}`);
              if (target && unit.node.type === "exercise" && !unit.node.solution) {
                await this.renderSolution(row, emptySolution(unit.node), state);
              }
            } else if (unit.anchor) row.dataset.block = `^${unit.anchor}`;
            if (unit.node?.type === "exercise") rendered.querySelector("h2,h3,h4,h5,h6")?.addClass("buches-exercise-heading");
          }));
        } catch (error) {
          this.removeChild(component);
          throw error;
        }
        if (this.file !== file || this.refreshTask !== task || this.editingChapter || this.solutionLoading || [...this.embeds].some((embed) => embed.editor)) {
          this.removeChild(component);
          return;
        }
        if (!sheet && context?.isIndex && model) {
          renderDashboard(page.createDiv({ cls: "buches-dashboard" }), model, progress, (target) => plugin.openTarget(target, this.leaf));
        }
        if (!sheet) renderPagination(page, withFinish(pagination, context), (target, direction) => plugin.turnPage(context, this.leaf, target, direction));
        page.addEventListener("click", (event) => this.openLink(event, file));
        const samePage = this.renderedPath === file.path && this.renderedSheet === sheet;
        const scroll = samePage ? this.contentEl.scrollTop : 0;
        if (samePage) {
          const opened = new Set([...this.pageHost.querySelectorAll("details[open][data-state-key]")].map((el) => el.dataset.stateKey));
          for (const details of page.querySelectorAll("details[data-state-key]")) details.open = opened.has(details.dataset.stateKey);
        }
        if (this.renderComponent) this.removeChild(this.renderComponent);
        this.pageHost.replaceChildren(page);
        this.contentEl.scrollTop = scroll;
        this.renderComponent = component;
        this.renderedPath = file.path;
        this.renderedSheet = sheet;
        this.renderKey = key;
        this.title = sheet ? `${title} \xB7 Exercises` : title;
        this.leaf.updateHeader?.();
      }
      render(markdown, host, state, engine = state.readerMath) {
        return renderMarkdown(this.app, markdown, host, state.file.path, state.component, engine);
      }
      async renderUnit(unit, host, state) {
        if (!unit.node || !unit.callout) return this.render(unit.markdown, host, state);
        const heading = host.createEl("h3", { cls: "buches-learning-title" });
        heading.createSpan({ cls: "buches-learning-kind", text: unit.callout });
        await this.render(unit.node.title, heading.createSpan(), state);
        return this.render(calloutBody(unit.markdown), host.createDiv(), state);
      }
      async renderExerciseSheet(body, context, state) {
        const { model, progress } = state;
        const chapters = context.isIndex ? model.chapters : context.concept ? flattenConcepts2([context.concept]).map((concept) => model.byPath.get(concept.file.path)) : [];
        let number = 0;
        for (const chapter of chapters) {
          const exercises = chapter.nodes.filter((node) => node.type === "exercise");
          if (!exercises.length) continue;
          const group = body.createEl("section", { cls: "buches-exam-chapter" });
          chapterLink(group.createEl("h2"), chapter, (target) => this.plugin.openTarget(target, this.leaf));
          for (const exercise of exercises) {
            const target = model.targets.get(`${chapter.path}#${exercise.id}`);
            const row = group.createEl("section", { cls: "buches-exam-exercise" });
            const heading = row.createEl("h3", { text: `${++number}. ` });
            await this.render(exercise.title.replace(/^Exercise:?\s*/i, ""), heading.createSpan(), { ...state, file: chapter.file });
            const prompt = [exercise.unit.callout ? calloutBody(exercise.unit.markdown) : "", ...exercise.prompt ?? []].filter(Boolean).join("\n\n");
            await this.render(prompt, row.createDiv(), { ...state, file: chapter.file });
            const prerequisites = /* @__PURE__ */ new Set([chapter, ...chapter.dependencies, ...target.dependencies]);
            for (const match of prompt.matchAll(/(?<!!)\[\[([^|\]]+)(?:\|[^\]]*)?\]\]/g)) {
              const [path, fragment] = match[1].split("#");
              const file = path ? this.app.metadataCache.getFirstLinkpathDest(path, chapter.path) : chapter.file;
              const linked = file && model.targets.get(fragment ? `${file.path}#${fragment}` : file.path);
              if (linked && linked !== target && linked !== chapter) prerequisites.add(linked);
            }
            const tools = row.createDiv({ cls: "buches-exam-tools" });
            studyActions(this, tools, { ...state, file: chapter.file }, exercise, { question: true });
            const disclosure = tools.createEl("details", { cls: "buches-exam-prereqs buches-hint" });
            const summary = disclosure.createEl("summary", { text: "Prerequisites" });
            const popover = disclosure.createDiv({ cls: "buches-hint-popover" });
            renderDependencies(
              popover,
              model,
              progress,
              { dependencies: [...prerequisites] },
              (item) => this.plugin.openTarget(item, this.leaf)
            );
            this.bindPopover(disclosure, summary, state.component);
            progressButton(
              tools,
              "Mark solved",
              statusFor2(model, progress, target),
              (done) => this.plugin.learn(model, target, done)
            );
            const practice = row.createEl("details", { cls: "buches-exam-solution" });
            practice.dataset.stateKey = `practice:${target.key}`;
            practice.createEl("summary", { text: "Solution and hints" });
            await this.renderSolution(practice, exercise.solution ?? emptySolution(exercise), { ...state, file: chapter.file }, false);
          }
        }
        if (!number) body.createEl("p", { cls: "buches-context-empty", text: "No exercises yet." });
      }
      bindPopover(disclosure, summary, component) {
        disclosure.addEventListener("keydown", (event) => {
          if (event.key !== "Escape") return;
          disclosure.open = false;
          summary.focus();
        });
        component.registerDomEvent(disclosure.ownerDocument, "pointerdown", (event) => {
          if (disclosure.open && !disclosure.contains(event.target)) disclosure.open = false;
        });
      }
      async renderSolution(body, unit, state, showSolved = true) {
        const { exercise, hints } = unit;
        const { model, progress, file } = state;
        const section = body.createEl("section", { cls: "buches-exercise-tools" });
        const inner = section.createDiv({ cls: "buches-solution-inner" });
        const tools = inner.createDiv({ cls: "buches-solution-tools" });
        const hintBar = tools.createDiv({ cls: "buches-hint-bar" });
        studyActions(this, tools, state, exercise, { review: true, selectedSolution: () => note });
        for (const [index, hint] of hints.entries()) {
          const disclosure = hintBar.createEl("details", { cls: "buches-hint" });
          const button = disclosure.createEl("summary", { attr: { "aria-label": `Hint ${index + 1}` } });
          setIcon(button.createSpan({ attr: { "aria-hidden": "true" } }), "lightbulb");
          button.createSpan({ text: `#${index + 1}` });
          const popover = disclosure.createDiv({ cls: "buches-hint-popover buches-source-block" });
          const rendered2 = popover.createDiv();
          const markdown = calloutBody(hint.markdown);
          if (hint.title && hint.title.toLowerCase() !== "hint") rendered2.createEl("strong", { text: hint.title });
          await this.render(markdown, rendered2.createDiv(), state);
          disclosure.addEventListener("toggle", () => {
            if (disclosure.open) {
              for (const other of hintBar.children) if (other !== disclosure) other.open = false;
            }
          });
          this.bindPopover(disclosure, button, state.component);
        }
        const target = model?.targets.get(`${file.path}#${exercise.id}`);
        if (target && showSolved) progressButton(
          tools,
          "Mark solved",
          statusFor2(model, progress, target),
          (done) => this.plugin.learn(model, target, done)
        );
        const details = inner.createEl("details", { cls: "buches-solution" });
        details.dataset.stateKey = `solution:${file.path}#${exercise.id}`;
        if (exercise.unit === unit) section.dataset.block = exercise.id;
        const summary = details.createEl("summary");
        setIcon(summary.createSpan({ cls: "buches-solution-chevron", attr: { "aria-hidden": "true" } }), "chevron-right");
        summary.createSpan({ cls: "buches-solution-reveal", text: "Reveal solution" });
        summary.createSpan({ cls: "buches-solution-hide", text: "Hide solution" });
        const tabs = [{ path: "", title: "Solution 1" }, ...solutionTabs(unit).map((tab, index) => ({
          ...tab,
          title: tab.kind === "ai" ? `AI \xB7 Solution ${index + 2}` : `Solution ${index + 2}`
        }))];
        const tabKey = details.dataset.stateKey;
        const active = tabs.find((tab) => tab.path === this.selectedSolutions.get(tabKey)) ?? tabs[0];
        const tabBar = details.createDiv({ cls: "buches-solution-tabs", attr: { "aria-label": "Solutions" } });
        const changeTab = async (path) => {
          this.selectedSolutions.set(tabKey, path);
          this.renderKey = null;
          await this.refresh();
        };
        const saveCurrent = async () => {
          if (pending) await pending;
          if (embed?.editor && !await this.finishEmbedEdit(embed)) throw new Error("Save the current solution before switching.");
        };
        const addTabButton = (title, action, cls = "") => {
          const button = tabBar.createEl("button", { text: title, cls, attr: { type: "button" } });
          button.addEventListener("click", async () => {
            button.disabled = true;
            try {
              await action();
            } catch (error) {
              this.plugin.report(error, error.message || "Could not open the solution tab.");
            } finally {
              button.disabled = false;
            }
          });
          return button;
        };
        for (const tab of tabs) {
          const button = addTabButton(tab.title, async () => {
            if (tab === active) return;
            await saveCurrent();
            await changeTab(tab.path);
          });
          button.setAttribute("aria-pressed", String(tab === active));
        }
        const createTab = async (kind) => {
          await saveCurrent();
          return appendSolutionTab(this.plugin, file, model.book, unit, kind, state.solutionMath);
        };
        addTabButton("+ Solution", async () => changeTab((await createTab("manual")).path), "buches-solution-tab-add");
        if (claudian(this.app)?.api?.version === 1) {
          addTabButton("+ AI", () => {
            let created;
            new AiSolutionModal(this.app, async (instructions, style) => {
              created ?? (created = await createTab("ai"));
              try {
                await this.plugin.aiSolutions.ask(created, file, exercise, instructions, style, model);
              } finally {
                await changeTab(created.path);
              }
            }).open();
          }, "buches-solution-tab-add");
        }
        const rendered = details.createDiv({ cls: "buches-solution-body" });
        const edit = tools.createEl("button", {
          cls: "buches-block-edit",
          attr: { "aria-label": "Edit solution", title: "Edit solution" }
        });
        setIcon(edit, "pencil");
        let embed;
        let note = active.path ? this.app.vault.getAbstractFileByPath(active.path) : null;
        let pending;
        if (note && this.plugin.aiSolutions.isPending(note)) {
          const waiting = details.createDiv({ cls: "buches-solution-waiting", attr: { role: "status" } });
          waiting.createSpan({ text: this.plugin.aiSolutions.taskStatus(note) });
          waiting.createEl("button", { text: "Cancel", attr: { type: "button" } }).addEventListener("click", () => this.plugin.aiSolutions.cancel(note));
        } else if (note && active.kind === "ai" && this.plugin.aiSolutions.errors.has(note)) {
          details.createDiv({ cls: "buches-edit-error", text: this.plugin.aiSolutions.errors.get(note), attr: { role: "status" } });
        }
        const ensureContent = (native = false) => pending ?? (pending = (async () => {
          this.solutionLoading = (this.solutionLoading ?? 0) + 1;
          try {
            if (!active.path) note = await materializeSolution(this.plugin, file, model.book, unit, state.solutionMath);
            if (!note) throw new Error("The linked solution note could not be found.");
            if (!rendered.isConnected) return;
            const source = await this.app.vault.read(note);
            if (!rendered.isConnected) return;
            if (!native && (active.kind === "ai" || /^---\r?\nrenderer: latex\r?\n/.test(source))) {
              rendered.empty();
              await this.render(stripFrontmatter(source), rendered, { ...state, file: note }, "mathjax");
              return;
            }
            const create = this.app.embedRegistry?.getEmbedCreator(note);
            if (!create) {
              await this.render(`![[${note.path}]]`, rendered, state);
              return;
            }
            rendered.empty();
            const host = rendered.createDiv({ cls: "buches-solution-embed markdown-embed" });
            embed = create({ app: this.app, containerEl: host, sourcePath: file.path, displayMode: false }, note, "");
            embed.editable = true;
            state.component.addChild(embed);
            this.embeds.add(embed);
            state.component.register(() => this.embeds.delete(embed));
            await embed.loadFile();
          } catch (error) {
            rendered.empty();
            rendered.createEl("p", { cls: "buches-edit-error", text: error.message });
            pending = null;
          } finally {
            this.solutionLoading--;
          }
        })());
        details.addEventListener("toggle", () => {
          if (details.open && !unit.virtual) void ensureContent();
          else if (embed?.editor) void this.finishEmbedEdit(embed).then(updateEditButton);
        });
        const grade = tools.createEl("button", {
          cls: "buches-block-edit",
          attr: { "aria-label": "Grade this solution", title: "Grade this solution", type: "button" }
        });
        setIcon(grade, "chart-no-axes-column");
        grade.addEventListener("click", async () => {
          grade.disabled = true;
          try {
            await saveCurrent();
            if (!note) note = await materializeSolution(this.plugin, file, model.book, unit, state.solutionMath);
            if (!note) throw new Error("The solution note could not be found.");
            new GradeModal(this, state, exercise, note).open();
          } catch (error) {
            this.plugin.report(error, error.message || "Could not open the grade.");
          } finally {
            grade.disabled = false;
          }
        });
        const updateEditButton = () => {
          const editing = Boolean(embed?.editor);
          const label = editing ? "Done editing solution" : "Edit solution";
          edit.setAttribute("aria-label", label);
          edit.setAttribute("title", label);
          setIcon(edit, editing ? "check" : "pencil");
        };
        edit.addEventListener("click", async () => {
          details.open = true;
          if (note && this.plugin.aiSolutions.isPending(note)) return;
          if (pending) await pending;
          if (!embed) {
            pending = null;
            await ensureContent(true);
          }
          if (!embed) {
            if (note) await this.app.workspace.getLeaf("tab").openFile(note, { state: { mode: "source" } });
            return;
          }
          const editing = Boolean(embed.editor);
          if (editing) {
            if (await this.finishEmbedEdit(embed)) {
              this.renderKey = null;
              await this.refresh();
            }
          } else embed.showEditor();
          updateEditButton();
        });
      }
      async finishEmbedEdit(embed) {
        try {
          await this.flushEmbeds();
          embed.showPreview();
          this.plugin.scheduleRefresh();
          return true;
        } catch (error) {
          this.plugin.report(error, "Could not save the solution note.");
          return false;
        }
      }
      openLink(event, file) {
        const link = event.target.closest?.("a.internal-link");
        const href = link?.getAttribute("data-href");
        if (!href || event.defaultPrevented) return;
        event.preventDefault();
        const separator = href.indexOf("#");
        const path = separator < 0 ? href : href.slice(0, separator);
        const heading = separator < 0 ? "" : href.slice(separator + 1);
        const target = path ? this.app.metadataCache.getFirstLinkpathDest(path, file.path) : file;
        const newLeaf = Keymap.isModEvent(event);
        if (!newLeaf && target && findBuchContext2(this.app, target)) {
          if (heading.startsWith("^")) {
            void this.plugin.openTarget({ file: target, id: heading }, this.leaf);
            return;
          }
          void this.plugin.openFile(target, this.leaf).then(async () => {
            const reader = this.leaf.view;
            if (heading && reader.file?.path === target.path) {
              await reader.refresh();
              reader.goToHeading(heading);
            }
          });
        } else {
          void this.app.workspace.openLinkText(href, file.path, newLeaf);
        }
      }
      async revealBlock(id) {
        await this.refresh();
        const target = [...this.pageHost.querySelectorAll("[data-block]")].find((el) => el.dataset.block === id);
        this.scrollTo(target);
      }
      goToHeading(text) {
        const heading = [...this.pageHost.querySelectorAll("h1,h2,h3,h4,h5,h6")].find((el) => (el.dataset.heading || el.textContent).trim().toLowerCase() === text.trim().toLowerCase());
        this.scrollTo(heading);
      }
      scrollTo(target) {
        for (let details = target?.closest("details"); details; details = details.parentElement?.closest("details")) details.open = true;
        target?.scrollIntoView({ block: "start" });
      }
    };
    function calloutBody(markdown) {
      return markdown.split(/\r?\n/).slice(1).map((line) => line.replace(/^ {0,3}> ?/, "")).join("\n");
    }
    module2.exports = { BuchReader: BuchReader2, READER_VIEW: READER_VIEW2 };
  }
});

// node_modules/minisearch/dist/cjs/index.cjs
var require_cjs = __commonJS({
  "node_modules/minisearch/dist/cjs/index.cjs"(exports2, module2) {
    "use strict";
    var ENTRIES = "ENTRIES";
    var KEYS = "KEYS";
    var VALUES = "VALUES";
    var LEAF = "";
    var TreeIterator = class {
      constructor(set, type) {
        const node = set._tree;
        const keys = Array.from(node.keys());
        this.set = set;
        this._type = type;
        this._path = keys.length > 0 ? [{ node, keys }] : [];
      }
      next() {
        const value = this.dive();
        this.backtrack();
        return value;
      }
      dive() {
        if (this._path.length === 0) {
          return { done: true, value: void 0 };
        }
        const { node, keys } = last$1(this._path);
        if (last$1(keys) === LEAF) {
          return { done: false, value: this.result() };
        }
        const child = node.get(last$1(keys));
        this._path.push({ node: child, keys: Array.from(child.keys()) });
        return this.dive();
      }
      backtrack() {
        if (this._path.length === 0) {
          return;
        }
        const keys = last$1(this._path).keys;
        keys.pop();
        if (keys.length > 0) {
          return;
        }
        this._path.pop();
        this.backtrack();
      }
      key() {
        return this.set._prefix + this._path.map(({ keys }) => last$1(keys)).filter((key) => key !== LEAF).join("");
      }
      value() {
        return last$1(this._path).node.get(LEAF);
      }
      result() {
        switch (this._type) {
          case VALUES:
            return this.value();
          case KEYS:
            return this.key();
          default:
            return [this.key(), this.value()];
        }
      }
      [Symbol.iterator]() {
        return this;
      }
    };
    var last$1 = (array) => {
      return array[array.length - 1];
    };
    var fuzzySearch = (node, query, maxDistance) => {
      const results = /* @__PURE__ */ new Map();
      if (query === void 0)
        return results;
      const n = query.length + 1;
      const m = n + maxDistance;
      const matrix = new Uint8Array(m * n).fill(maxDistance + 1);
      for (let j = 0; j < n; ++j)
        matrix[j] = j;
      for (let i = 1; i < m; ++i)
        matrix[i * n] = i;
      recurse(node, query, maxDistance, results, matrix, 1, n, "");
      return results;
    };
    var recurse = (node, query, maxDistance, results, matrix, m, n, prefix) => {
      const offset = m * n;
      key: for (const key of node.keys()) {
        if (key === LEAF) {
          const distance = matrix[offset - 1];
          if (distance <= maxDistance) {
            results.set(prefix, [node.get(key), distance]);
          }
        } else {
          let i = m;
          for (let pos = 0; pos < key.length; ++pos, ++i) {
            const char = key[pos];
            const thisRowOffset = n * i;
            const prevRowOffset = thisRowOffset - n;
            let minDistance = matrix[thisRowOffset];
            const jmin = Math.max(0, i - maxDistance - 1);
            const jmax = Math.min(n - 1, i + maxDistance);
            for (let j = jmin; j < jmax; ++j) {
              const different = char !== query[j];
              const rpl = matrix[prevRowOffset + j] + +different;
              const del = matrix[prevRowOffset + j + 1] + 1;
              const ins = matrix[thisRowOffset + j] + 1;
              const dist = matrix[thisRowOffset + j + 1] = Math.min(rpl, del, ins);
              if (dist < minDistance)
                minDistance = dist;
            }
            if (minDistance > maxDistance) {
              continue key;
            }
          }
          recurse(node.get(key), query, maxDistance, results, matrix, i, n, prefix + key);
        }
      }
    };
    var SearchableMap = class _SearchableMap {
      /**
       * The constructor is normally called without arguments, creating an empty
       * map. In order to create a {@link SearchableMap} from an iterable or from an
       * object, check {@link SearchableMap.from} and {@link
       * SearchableMap.fromObject}.
       *
       * The constructor arguments are for internal use, when creating derived
       * mutable views of a map at a prefix.
       */
      constructor(tree = /* @__PURE__ */ new Map(), prefix = "") {
        this._size = void 0;
        this._tree = tree;
        this._prefix = prefix;
      }
      /**
       * Creates and returns a mutable view of this {@link SearchableMap},
       * containing only entries that share the given prefix.
       *
       * ### Usage:
       *
       * ```javascript
       * let map = new SearchableMap()
       * map.set("unicorn", 1)
       * map.set("universe", 2)
       * map.set("university", 3)
       * map.set("unique", 4)
       * map.set("hello", 5)
       *
       * let uni = map.atPrefix("uni")
       * uni.get("unique") // => 4
       * uni.get("unicorn") // => 1
       * uni.get("hello") // => undefined
       *
       * let univer = map.atPrefix("univer")
       * univer.get("unique") // => undefined
       * univer.get("universe") // => 2
       * univer.get("university") // => 3
       * ```
       *
       * @param prefix  The prefix
       * @return A {@link SearchableMap} representing a mutable view of the original
       * Map at the given prefix
       */
      atPrefix(prefix) {
        if (!prefix.startsWith(this._prefix)) {
          throw new Error("Mismatched prefix");
        }
        const [node, path] = trackDown(this._tree, prefix.slice(this._prefix.length));
        if (node === void 0) {
          const [parentNode, key] = last(path);
          for (const k of parentNode.keys()) {
            if (k !== LEAF && k.startsWith(key)) {
              const node2 = /* @__PURE__ */ new Map();
              node2.set(k.slice(key.length), parentNode.get(k));
              return new _SearchableMap(node2, prefix);
            }
          }
        }
        return new _SearchableMap(node, prefix);
      }
      /**
       * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/clear
       */
      clear() {
        this._size = void 0;
        this._tree.clear();
      }
      /**
       * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/delete
       * @param key  Key to delete
       */
      delete(key) {
        this._size = void 0;
        return remove(this._tree, key);
      }
      /**
       * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/entries
       * @return An iterator iterating through `[key, value]` entries.
       */
      entries() {
        return new TreeIterator(this, ENTRIES);
      }
      /**
       * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/forEach
       * @param fn  Iteration function
       */
      forEach(fn) {
        for (const [key, value] of this) {
          fn(key, value, this);
        }
      }
      /**
       * Returns a Map of all the entries that have a key within the given edit
       * distance from the search key. The keys of the returned Map are the matching
       * keys, while the values are two-element arrays where the first element is
       * the value associated to the key, and the second is the edit distance of the
       * key to the search key.
       *
       * ### Usage:
       *
       * ```javascript
       * let map = new SearchableMap()
       * map.set('hello', 'world')
       * map.set('hell', 'yeah')
       * map.set('ciao', 'mondo')
       *
       * // Get all entries that match the key 'hallo' with a maximum edit distance of 2
       * map.fuzzyGet('hallo', 2)
       * // => Map(2) { 'hello' => ['world', 1], 'hell' => ['yeah', 2] }
       *
       * // In the example, the "hello" key has value "world" and edit distance of 1
       * // (change "e" to "a"), the key "hell" has value "yeah" and edit distance of 2
       * // (change "e" to "a", delete "o")
       * ```
       *
       * @param key  The search key
       * @param maxEditDistance  The maximum edit distance (Levenshtein)
       * @return A Map of the matching keys to their value and edit distance
       */
      fuzzyGet(key, maxEditDistance) {
        return fuzzySearch(this._tree, key, maxEditDistance);
      }
      /**
       * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/get
       * @param key  Key to get
       * @return Value associated to the key, or `undefined` if the key is not
       * found.
       */
      get(key) {
        const node = lookup(this._tree, key);
        return node !== void 0 ? node.get(LEAF) : void 0;
      }
      /**
       * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/has
       * @param key  Key
       * @return True if the key is in the map, false otherwise
       */
      has(key) {
        const node = lookup(this._tree, key);
        return node !== void 0 && node.has(LEAF);
      }
      /**
       * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/keys
       * @return An `Iterable` iterating through keys
       */
      keys() {
        return new TreeIterator(this, KEYS);
      }
      /**
       * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/set
       * @param key  Key to set
       * @param value  Value to associate to the key
       * @return The {@link SearchableMap} itself, to allow chaining
       */
      set(key, value) {
        if (typeof key !== "string") {
          throw new Error("key must be a string");
        }
        this._size = void 0;
        const node = createPath(this._tree, key);
        node.set(LEAF, value);
        return this;
      }
      /**
       * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/size
       */
      get size() {
        if (this._size) {
          return this._size;
        }
        this._size = 0;
        const iter = this.entries();
        while (!iter.next().done)
          this._size += 1;
        return this._size;
      }
      /**
       * Updates the value at the given key using the provided function. The function
       * is called with the current value at the key, and its return value is used as
       * the new value to be set.
       *
       * ### Example:
       *
       * ```javascript
       * // Increment the current value by one
       * searchableMap.update('somekey', (currentValue) => currentValue == null ? 0 : currentValue + 1)
       * ```
       *
       * If the value at the given key is or will be an object, it might not require
       * re-assignment. In that case it is better to use `fetch()`, because it is
       * faster.
       *
       * @param key  The key to update
       * @param fn  The function used to compute the new value from the current one
       * @return The {@link SearchableMap} itself, to allow chaining
       */
      update(key, fn) {
        if (typeof key !== "string") {
          throw new Error("key must be a string");
        }
        this._size = void 0;
        const node = createPath(this._tree, key);
        node.set(LEAF, fn(node.get(LEAF)));
        return this;
      }
      /**
       * Fetches the value of the given key. If the value does not exist, calls the
       * given function to create a new value, which is inserted at the given key
       * and subsequently returned.
       *
       * ### Example:
       *
       * ```javascript
       * const map = searchableMap.fetch('somekey', () => new Map())
       * map.set('foo', 'bar')
       * ```
       *
       * @param key  The key to update
       * @param initial  A function that creates a new value if the key does not exist
       * @return The existing or new value at the given key
       */
      fetch(key, initial) {
        if (typeof key !== "string") {
          throw new Error("key must be a string");
        }
        this._size = void 0;
        const node = createPath(this._tree, key);
        let value = node.get(LEAF);
        if (value === void 0) {
          node.set(LEAF, value = initial());
        }
        return value;
      }
      /**
       * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/values
       * @return An `Iterable` iterating through values.
       */
      values() {
        return new TreeIterator(this, VALUES);
      }
      /**
       * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/@@iterator
       */
      [Symbol.iterator]() {
        return this.entries();
      }
      /**
       * Creates a {@link SearchableMap} from an `Iterable` of entries
       *
       * @param entries  Entries to be inserted in the {@link SearchableMap}
       * @return A new {@link SearchableMap} with the given entries
       */
      static from(entries) {
        const tree = new _SearchableMap();
        for (const [key, value] of entries) {
          tree.set(key, value);
        }
        return tree;
      }
      /**
       * Creates a {@link SearchableMap} from the iterable properties of a JavaScript object
       *
       * @param object  Object of entries for the {@link SearchableMap}
       * @return A new {@link SearchableMap} with the given entries
       */
      static fromObject(object) {
        return _SearchableMap.from(Object.entries(object));
      }
    };
    var trackDown = (tree, key, path = []) => {
      if (key.length === 0 || tree == null) {
        return [tree, path];
      }
      for (const k of tree.keys()) {
        if (k !== LEAF && key.startsWith(k)) {
          path.push([tree, k]);
          return trackDown(tree.get(k), key.slice(k.length), path);
        }
      }
      path.push([tree, key]);
      return trackDown(void 0, "", path);
    };
    var lookup = (tree, key) => {
      if (key.length === 0 || tree == null) {
        return tree;
      }
      for (const k of tree.keys()) {
        if (k !== LEAF && key.startsWith(k)) {
          return lookup(tree.get(k), key.slice(k.length));
        }
      }
    };
    var createPath = (node, key) => {
      const keyLength = key.length;
      outer: for (let pos = 0; node && pos < keyLength; ) {
        for (const k of node.keys()) {
          if (k !== LEAF && key[pos] === k[0]) {
            const len = Math.min(keyLength - pos, k.length);
            let offset = 1;
            while (offset < len && key[pos + offset] === k[offset])
              ++offset;
            const child2 = node.get(k);
            if (offset === k.length) {
              node = child2;
            } else {
              const intermediate = /* @__PURE__ */ new Map();
              intermediate.set(k.slice(offset), child2);
              node.set(key.slice(pos, pos + offset), intermediate);
              node.delete(k);
              node = intermediate;
            }
            pos += offset;
            continue outer;
          }
        }
        const child = /* @__PURE__ */ new Map();
        node.set(key.slice(pos), child);
        return child;
      }
      return node;
    };
    var remove = (tree, key) => {
      const [node, path] = trackDown(tree, key);
      if (node === void 0) {
        return;
      }
      node.delete(LEAF);
      if (node.size === 0) {
        cleanup(path);
      } else if (node.size === 1) {
        const [key2, value] = node.entries().next().value;
        merge(path, key2, value);
      }
    };
    var cleanup = (path) => {
      if (path.length === 0) {
        return;
      }
      const [node, key] = last(path);
      node.delete(key);
      if (node.size === 0) {
        cleanup(path.slice(0, -1));
      } else if (node.size === 1) {
        const [key2, value] = node.entries().next().value;
        if (key2 !== LEAF) {
          merge(path.slice(0, -1), key2, value);
        }
      }
    };
    var merge = (path, key, value) => {
      if (path.length === 0) {
        return;
      }
      const [node, nodeKey] = last(path);
      node.set(nodeKey + key, value);
      node.delete(nodeKey);
    };
    var last = (array) => {
      return array[array.length - 1];
    };
    var OR = "or";
    var AND = "and";
    var AND_NOT = "and_not";
    var MiniSearch = class _MiniSearch {
      /**
       * @param options  Configuration options
       *
       * ### Examples:
       *
       * ```javascript
       * // Create a search engine that indexes the 'title' and 'text' fields of your
       * // documents:
       * const miniSearch = new MiniSearch({ fields: ['title', 'text'] })
       * ```
       *
       * ### ID Field:
       *
       * ```javascript
       * // Your documents are assumed to include a unique 'id' field, but if you want
       * // to use a different field for document identification, you can set the
       * // 'idField' option:
       * const miniSearch = new MiniSearch({ idField: 'key', fields: ['title', 'text'] })
       * ```
       *
       * ### Options and defaults:
       *
       * ```javascript
       * // The full set of options (here with their default value) is:
       * const miniSearch = new MiniSearch({
       *   // idField: field that uniquely identifies a document
       *   idField: 'id',
       *
       *   // extractField: function used to get the value of a field in a document.
       *   // By default, it assumes the document is a flat object with field names as
       *   // property keys and field values as string property values, but custom logic
       *   // can be implemented by setting this option to a custom extractor function.
       *   extractField: (document, fieldName) => document[fieldName],
       *
       *   // tokenize: function used to split fields into individual terms. By
       *   // default, it is also used to tokenize search queries, unless a specific
       *   // `tokenize` search option is supplied. When tokenizing an indexed field,
       *   // the field name is passed as the second argument.
       *   tokenize: (string, _fieldName) => string.split(SPACE_OR_PUNCTUATION),
       *
       *   // processTerm: function used to process each tokenized term before
       *   // indexing. It can be used for stemming and normalization. Return a falsy
       *   // value in order to discard a term. By default, it is also used to process
       *   // search queries, unless a specific `processTerm` option is supplied as a
       *   // search option. When processing a term from a indexed field, the field
       *   // name is passed as the second argument.
       *   processTerm: (term, _fieldName) => term.toLowerCase(),
       *
       *   // searchOptions: default search options, see the `search` method for
       *   // details
       *   searchOptions: undefined,
       *
       *   // fields: document fields to be indexed. Mandatory, but not set by default
       *   fields: undefined
       *
       *   // storeFields: document fields to be stored and returned as part of the
       *   // search results.
       *   storeFields: []
       * })
       * ```
       */
      constructor(options) {
        if ((options === null || options === void 0 ? void 0 : options.fields) == null) {
          throw new Error('MiniSearch: option "fields" must be provided');
        }
        const autoVacuum = options.autoVacuum == null || options.autoVacuum === true ? defaultAutoVacuumOptions : options.autoVacuum;
        this._options = {
          ...defaultOptions,
          ...options,
          autoVacuum,
          searchOptions: { ...defaultSearchOptions, ...options.searchOptions || {} },
          autoSuggestOptions: { ...defaultAutoSuggestOptions, ...options.autoSuggestOptions || {} }
        };
        this._index = new SearchableMap();
        this._documentCount = 0;
        this._documentIds = /* @__PURE__ */ new Map();
        this._idToShortId = /* @__PURE__ */ new Map();
        this._fieldIds = {};
        this._fieldLength = /* @__PURE__ */ new Map();
        this._avgFieldLength = [];
        this._nextId = 0;
        this._storedFields = /* @__PURE__ */ new Map();
        this._dirtCount = 0;
        this._currentVacuum = null;
        this._enqueuedVacuum = null;
        this._enqueuedVacuumConditions = defaultVacuumConditions;
        this.addFields(this._options.fields);
      }
      /**
       * Adds a document to the index
       *
       * @param document  The document to be indexed
       */
      add(document) {
        const { extractField, stringifyField, tokenize, processTerm, fields, idField } = this._options;
        const id = extractField(document, idField);
        if (id == null) {
          throw new Error(`MiniSearch: document does not have ID field "${idField}"`);
        }
        if (this._idToShortId.has(id)) {
          throw new Error(`MiniSearch: duplicate ID ${id}`);
        }
        const shortDocumentId = this.addDocumentId(id);
        this.saveStoredFields(shortDocumentId, document);
        for (const field of fields) {
          const fieldValue = extractField(document, field);
          if (fieldValue == null)
            continue;
          const tokens = tokenize(stringifyField(fieldValue, field), field);
          const fieldId = this._fieldIds[field];
          const uniqueTerms = new Set(tokens).size;
          this.addFieldLength(shortDocumentId, fieldId, this._documentCount - 1, uniqueTerms);
          for (const term of tokens) {
            const processedTerm = processTerm(term, field);
            if (Array.isArray(processedTerm)) {
              for (const t of processedTerm) {
                this.addTerm(fieldId, shortDocumentId, t);
              }
            } else if (processedTerm) {
              this.addTerm(fieldId, shortDocumentId, processedTerm);
            }
          }
        }
      }
      /**
       * Adds all the given documents to the index
       *
       * @param documents  An array of documents to be indexed
       */
      addAll(documents) {
        for (const document of documents)
          this.add(document);
      }
      /**
       * Adds all the given documents to the index asynchronously.
       *
       * Returns a promise that resolves (to `undefined`) when the indexing is done.
       * This method is useful when index many documents, to avoid blocking the main
       * thread. The indexing is performed asynchronously and in chunks.
       *
       * @param documents  An array of documents to be indexed
       * @param options  Configuration options
       * @return A promise resolving to `undefined` when the indexing is done
       */
      addAllAsync(documents, options = {}) {
        const { chunkSize = 10 } = options;
        const acc = { chunk: [], promise: Promise.resolve() };
        const { chunk, promise } = documents.reduce(({ chunk: chunk2, promise: promise2 }, document, i) => {
          chunk2.push(document);
          if ((i + 1) % chunkSize === 0) {
            return {
              chunk: [],
              promise: promise2.then(() => new Promise((resolve) => setTimeout(resolve, 0))).then(() => this.addAll(chunk2))
            };
          } else {
            return { chunk: chunk2, promise: promise2 };
          }
        }, acc);
        return promise.then(() => this.addAll(chunk));
      }
      /**
       * Removes the given document from the index.
       *
       * The document to remove must NOT have changed between indexing and removal,
       * otherwise the index will be corrupted.
       *
       * This method requires passing the full document to be removed (not just the
       * ID), and immediately removes the document from the inverted index, allowing
       * memory to be released. A convenient alternative is {@link
       * MiniSearch#discard}, which needs only the document ID, and has the same
       * visible effect, but delays cleaning up the index until the next vacuuming.
       *
       * @param document  The document to be removed
       */
      remove(document) {
        const { tokenize, processTerm, extractField, stringifyField, fields, idField } = this._options;
        const id = extractField(document, idField);
        if (id == null) {
          throw new Error(`MiniSearch: document does not have ID field "${idField}"`);
        }
        const shortId = this._idToShortId.get(id);
        if (shortId == null) {
          throw new Error(`MiniSearch: cannot remove document with ID ${id}: it is not in the index`);
        }
        for (const field of fields) {
          const fieldValue = extractField(document, field);
          if (fieldValue == null)
            continue;
          const tokens = tokenize(stringifyField(fieldValue, field), field);
          const fieldId = this._fieldIds[field];
          const uniqueTerms = new Set(tokens).size;
          this.removeFieldLength(shortId, fieldId, this._documentCount, uniqueTerms);
          for (const term of tokens) {
            const processedTerm = processTerm(term, field);
            if (Array.isArray(processedTerm)) {
              for (const t of processedTerm) {
                this.removeTerm(fieldId, shortId, t);
              }
            } else if (processedTerm) {
              this.removeTerm(fieldId, shortId, processedTerm);
            }
          }
        }
        this._storedFields.delete(shortId);
        this._documentIds.delete(shortId);
        this._idToShortId.delete(id);
        this._fieldLength.delete(shortId);
        this._documentCount -= 1;
      }
      /**
       * Removes all the given documents from the index. If called with no arguments,
       * it removes _all_ documents from the index.
       *
       * @param documents  The documents to be removed. If this argument is omitted,
       * all documents are removed. Note that, for removing all documents, it is
       * more efficient to call this method with no arguments than to pass all
       * documents.
       */
      removeAll(documents) {
        if (documents) {
          for (const document of documents)
            this.remove(document);
        } else if (arguments.length > 0) {
          throw new Error("Expected documents to be present. Omit the argument to remove all documents.");
        } else {
          this._index = new SearchableMap();
          this._documentCount = 0;
          this._documentIds = /* @__PURE__ */ new Map();
          this._idToShortId = /* @__PURE__ */ new Map();
          this._fieldLength = /* @__PURE__ */ new Map();
          this._avgFieldLength = [];
          this._storedFields = /* @__PURE__ */ new Map();
          this._nextId = 0;
        }
      }
      /**
       * Discards the document with the given ID, so it won't appear in search results
       *
       * It has the same visible effect of {@link MiniSearch.remove} (both cause the
       * document to stop appearing in searches), but a different effect on the
       * internal data structures:
       *
       *   - {@link MiniSearch#remove} requires passing the full document to be
       *   removed as argument, and removes it from the inverted index immediately.
       *
       *   - {@link MiniSearch#discard} instead only needs the document ID, and
       *   works by marking the current version of the document as discarded, so it
       *   is immediately ignored by searches. This is faster and more convenient
       *   than {@link MiniSearch#remove}, but the index is not immediately
       *   modified. To take care of that, vacuuming is performed after a certain
       *   number of documents are discarded, cleaning up the index and allowing
       *   memory to be released.
       *
       * After discarding a document, it is possible to re-add a new version, and
       * only the new version will appear in searches. In other words, discarding
       * and re-adding a document works exactly like removing and re-adding it. The
       * {@link MiniSearch.replace} method can also be used to replace a document
       * with a new version.
       *
       * #### Details about vacuuming
       *
       * Repetite calls to this method would leave obsolete document references in
       * the index, invisible to searches. Two mechanisms take care of cleaning up:
       * clean up during search, and vacuuming.
       *
       *   - Upon search, whenever a discarded ID is found (and ignored for the
       *   results), references to the discarded document are removed from the
       *   inverted index entries for the search terms. This ensures that subsequent
       *   searches for the same terms do not need to skip these obsolete references
       *   again.
       *
       *   - In addition, vacuuming is performed automatically by default (see the
       *   `autoVacuum` field in {@link Options}) after a certain number of
       *   documents are discarded. Vacuuming traverses all terms in the index,
       *   cleaning up all references to discarded documents. Vacuuming can also be
       *   triggered manually by calling {@link MiniSearch#vacuum}.
       *
       * @param id  The ID of the document to be discarded
       */
      discard(id) {
        const shortId = this._idToShortId.get(id);
        if (shortId == null) {
          throw new Error(`MiniSearch: cannot discard document with ID ${id}: it is not in the index`);
        }
        this._idToShortId.delete(id);
        this._documentIds.delete(shortId);
        this._storedFields.delete(shortId);
        (this._fieldLength.get(shortId) || []).forEach((fieldLength, fieldId) => {
          this.removeFieldLength(shortId, fieldId, this._documentCount, fieldLength);
        });
        this._fieldLength.delete(shortId);
        this._documentCount -= 1;
        this._dirtCount += 1;
        this.maybeAutoVacuum();
      }
      maybeAutoVacuum() {
        if (this._options.autoVacuum === false) {
          return;
        }
        const { minDirtFactor, minDirtCount, batchSize, batchWait } = this._options.autoVacuum;
        this.conditionalVacuum({ batchSize, batchWait }, { minDirtCount, minDirtFactor });
      }
      /**
       * Discards the documents with the given IDs, so they won't appear in search
       * results
       *
       * It is equivalent to calling {@link MiniSearch#discard} for all the given
       * IDs, but with the optimization of triggering at most one automatic
       * vacuuming at the end.
       *
       * Note: to remove all documents from the index, it is faster and more
       * convenient to call {@link MiniSearch.removeAll} with no argument, instead
       * of passing all IDs to this method.
       */
      discardAll(ids) {
        const autoVacuum = this._options.autoVacuum;
        try {
          this._options.autoVacuum = false;
          for (const id of ids) {
            this.discard(id);
          }
        } finally {
          this._options.autoVacuum = autoVacuum;
        }
        this.maybeAutoVacuum();
      }
      /**
       * It replaces an existing document with the given updated version
       *
       * It works by discarding the current version and adding the updated one, so
       * it is functionally equivalent to calling {@link MiniSearch#discard}
       * followed by {@link MiniSearch#add}. The ID of the updated document should
       * be the same as the original one.
       *
       * Since it uses {@link MiniSearch#discard} internally, this method relies on
       * vacuuming to clean up obsolete document references from the index, allowing
       * memory to be released (see {@link MiniSearch#discard}).
       *
       * @param updatedDocument  The updated document to replace the old version
       * with
       */
      replace(updatedDocument) {
        const { idField, extractField } = this._options;
        const id = extractField(updatedDocument, idField);
        this.discard(id);
        this.add(updatedDocument);
      }
      /**
       * Triggers a manual vacuuming, cleaning up references to discarded documents
       * from the inverted index
       *
       * Vacuuming is only useful for applications that use the {@link
       * MiniSearch#discard} or {@link MiniSearch#replace} methods.
       *
       * By default, vacuuming is performed automatically when needed (controlled by
       * the `autoVacuum` field in {@link Options}), so there is usually no need to
       * call this method, unless one wants to make sure to perform vacuuming at a
       * specific moment.
       *
       * Vacuuming traverses all terms in the inverted index in batches, and cleans
       * up references to discarded documents from the posting list, allowing memory
       * to be released.
       *
       * The method takes an optional object as argument with the following keys:
       *
       *   - `batchSize`: the size of each batch (1000 by default)
       *
       *   - `batchWait`: the number of milliseconds to wait between batches (10 by
       *   default)
       *
       * On large indexes, vacuuming could have a non-negligible cost: batching
       * avoids blocking the thread for long, diluting this cost so that it is not
       * negatively affecting the application. Nonetheless, this method should only
       * be called when necessary, and relying on automatic vacuuming is usually
       * better.
       *
       * It returns a promise that resolves (to undefined) when the clean up is
       * completed. If vacuuming is already ongoing at the time this method is
       * called, a new one is enqueued immediately after the ongoing one, and a
       * corresponding promise is returned. However, no more than one vacuuming is
       * enqueued on top of the ongoing one, even if this method is called more
       * times (enqueuing multiple ones would be useless).
       *
       * @param options  Configuration options for the batch size and delay. See
       * {@link VacuumOptions}.
       */
      vacuum(options = {}) {
        return this.conditionalVacuum(options);
      }
      conditionalVacuum(options, conditions) {
        if (this._currentVacuum) {
          this._enqueuedVacuumConditions = this._enqueuedVacuumConditions && conditions;
          if (this._enqueuedVacuum != null) {
            return this._enqueuedVacuum;
          }
          this._enqueuedVacuum = this._currentVacuum.then(() => {
            const conditions2 = this._enqueuedVacuumConditions;
            this._enqueuedVacuumConditions = defaultVacuumConditions;
            return this.performVacuuming(options, conditions2);
          });
          return this._enqueuedVacuum;
        }
        if (this.vacuumConditionsMet(conditions) === false) {
          return Promise.resolve();
        }
        this._currentVacuum = this.performVacuuming(options);
        return this._currentVacuum;
      }
      async performVacuuming(options, conditions) {
        const initialDirtCount = this._dirtCount;
        if (this.vacuumConditionsMet(conditions)) {
          const batchSize = options.batchSize || defaultVacuumOptions.batchSize;
          const batchWait = options.batchWait || defaultVacuumOptions.batchWait;
          let i = 1;
          for (const [term, fieldsData] of this._index) {
            for (const [fieldId, fieldIndex] of fieldsData) {
              for (const [shortId] of fieldIndex) {
                if (this._documentIds.has(shortId)) {
                  continue;
                }
                if (fieldIndex.size <= 1) {
                  fieldsData.delete(fieldId);
                } else {
                  fieldIndex.delete(shortId);
                }
              }
            }
            if (this._index.get(term).size === 0) {
              this._index.delete(term);
            }
            if (i % batchSize === 0) {
              await new Promise((resolve) => setTimeout(resolve, batchWait));
            }
            i += 1;
          }
          this._dirtCount -= initialDirtCount;
        }
        await null;
        this._currentVacuum = this._enqueuedVacuum;
        this._enqueuedVacuum = null;
      }
      vacuumConditionsMet(conditions) {
        if (conditions == null) {
          return true;
        }
        let { minDirtCount, minDirtFactor } = conditions;
        minDirtCount = minDirtCount || defaultAutoVacuumOptions.minDirtCount;
        minDirtFactor = minDirtFactor || defaultAutoVacuumOptions.minDirtFactor;
        return this.dirtCount >= minDirtCount && this.dirtFactor >= minDirtFactor;
      }
      /**
       * Is `true` if a vacuuming operation is ongoing, `false` otherwise
       */
      get isVacuuming() {
        return this._currentVacuum != null;
      }
      /**
       * The number of documents discarded since the most recent vacuuming
       */
      get dirtCount() {
        return this._dirtCount;
      }
      /**
       * A number between 0 and 1 giving an indication about the proportion of
       * documents that are discarded, and can therefore be cleaned up by vacuuming.
       * A value close to 0 means that the index is relatively clean, while a higher
       * value means that the index is relatively dirty, and vacuuming could release
       * memory.
       */
      get dirtFactor() {
        return this._dirtCount / (1 + this._documentCount + this._dirtCount);
      }
      /**
       * Returns `true` if a document with the given ID is present in the index and
       * available for search, `false` otherwise
       *
       * @param id  The document ID
       */
      has(id) {
        return this._idToShortId.has(id);
      }
      /**
       * Returns the stored fields (as configured in the `storeFields` constructor
       * option) for the given document ID. Returns `undefined` if the document is
       * not present in the index.
       *
       * @param id  The document ID
       */
      getStoredFields(id) {
        const shortId = this._idToShortId.get(id);
        if (shortId == null) {
          return void 0;
        }
        return this._storedFields.get(shortId);
      }
      /**
       * Search for documents matching the given search query.
       *
       * The result is a list of scored document IDs matching the query, sorted by
       * descending score, and each including data about which terms were matched and
       * in which fields.
       *
       * ### Basic usage:
       *
       * ```javascript
       * // Search for "zen art motorcycle" with default options: terms have to match
       * // exactly, and individual terms are joined with OR
       * miniSearch.search('zen art motorcycle')
       * // => [ { id: 2, score: 2.77258, match: { ... } }, { id: 4, score: 1.38629, match: { ... } } ]
       * ```
       *
       * ### Restrict search to specific fields:
       *
       * ```javascript
       * // Search only in the 'title' field
       * miniSearch.search('zen', { fields: ['title'] })
       * ```
       *
       * ### Field boosting:
       *
       * ```javascript
       * // Boost a field
       * miniSearch.search('zen', { boost: { title: 2 } })
       * ```
       *
       * ### Prefix search:
       *
       * ```javascript
       * // Search for "moto" with prefix search (it will match documents
       * // containing terms that start with "moto" or "neuro")
       * miniSearch.search('moto neuro', { prefix: true })
       * ```
       *
       * ### Fuzzy search:
       *
       * ```javascript
       * // Search for "ismael" with fuzzy search (it will match documents containing
       * // terms similar to "ismael", with a maximum edit distance of 0.2 term.length
       * // (rounded to nearest integer)
       * miniSearch.search('ismael', { fuzzy: 0.2 })
       * ```
       *
       * ### Combining strategies:
       *
       * ```javascript
       * // Mix of exact match, prefix search, and fuzzy search
       * miniSearch.search('ismael mob', {
       *  prefix: true,
       *  fuzzy: 0.2
       * })
       * ```
       *
       * ### Advanced prefix and fuzzy search:
       *
       * ```javascript
       * // Perform fuzzy and prefix search depending on the search term. Here
       * // performing prefix and fuzzy search only on terms longer than 3 characters
       * miniSearch.search('ismael mob', {
       *  prefix: term => term.length > 3
       *  fuzzy: term => term.length > 3 ? 0.2 : null
       * })
       * ```
       *
       * ### Combine with AND:
       *
       * ```javascript
       * // Combine search terms with AND (to match only documents that contain both
       * // "motorcycle" and "art")
       * miniSearch.search('motorcycle art', { combineWith: 'AND' })
       * ```
       *
       * ### Combine with AND_NOT:
       *
       * There is also an AND_NOT combinator, that finds documents that match the
       * first term, but do not match any of the other terms. This combinator is
       * rarely useful with simple queries, and is meant to be used with advanced
       * query combinations (see later for more details).
       *
       * ### Filtering results:
       *
       * ```javascript
       * // Filter only results in the 'fiction' category (assuming that 'category'
       * // is a stored field)
       * miniSearch.search('motorcycle art', {
       *   filter: (result) => result.category === 'fiction'
       * })
       * ```
       *
       * ### Wildcard query
       *
       * Searching for an empty string (assuming the default tokenizer) returns no
       * results. Sometimes though, one needs to match all documents, like in a
       * "wildcard" search. This is possible by passing the special value
       * {@link MiniSearch.wildcard} as the query:
       *
       * ```javascript
       * // Return search results for all documents
       * miniSearch.search(MiniSearch.wildcard)
       * ```
       *
       * Note that search options such as `filter` and `boostDocument` are still
       * applied, influencing which results are returned, and their order:
       *
       * ```javascript
       * // Return search results for all documents in the 'fiction' category
       * miniSearch.search(MiniSearch.wildcard, {
       *   filter: (result) => result.category === 'fiction'
       * })
       * ```
       *
       * ### Advanced combination of queries:
       *
       * It is possible to combine different subqueries with OR, AND, and AND_NOT,
       * and even with different search options, by passing a query expression
       * tree object as the first argument, instead of a string.
       *
       * ```javascript
       * // Search for documents that contain "zen" and ("motorcycle" or "archery")
       * miniSearch.search({
       *   combineWith: 'AND',
       *   queries: [
       *     'zen',
       *     {
       *       combineWith: 'OR',
       *       queries: ['motorcycle', 'archery']
       *     }
       *   ]
       * })
       *
       * // Search for documents that contain ("apple" or "pear") but not "juice" and
       * // not "tree"
       * miniSearch.search({
       *   combineWith: 'AND_NOT',
       *   queries: [
       *     {
       *       combineWith: 'OR',
       *       queries: ['apple', 'pear']
       *     },
       *     'juice',
       *     'tree'
       *   ]
       * })
       * ```
       *
       * Each node in the expression tree can be either a string, or an object that
       * supports all {@link SearchOptions} fields, plus a `queries` array field for
       * subqueries.
       *
       * Note that, while this can become complicated to do by hand for complex or
       * deeply nested queries, it provides a formalized expression tree API for
       * external libraries that implement a parser for custom query languages.
       *
       * @param query  Search query
       * @param searchOptions  Search options. Each option, if not given, defaults to the corresponding value of `searchOptions` given to the constructor, or to the library default.
       */
      search(query, searchOptions = {}) {
        const { searchOptions: globalSearchOptions } = this._options;
        const searchOptionsWithDefaults = { ...globalSearchOptions, ...searchOptions };
        const rawResults = this.executeQuery(query, searchOptions);
        const results = [];
        for (const [docId, { score, terms, match }] of rawResults) {
          const quality = terms.length || 1;
          const result = {
            id: this._documentIds.get(docId),
            score: score * quality,
            terms: Object.keys(match),
            queryTerms: terms,
            match
          };
          Object.assign(result, this._storedFields.get(docId));
          if (searchOptionsWithDefaults.filter == null || searchOptionsWithDefaults.filter(result)) {
            results.push(result);
          }
        }
        if (query === _MiniSearch.wildcard && searchOptionsWithDefaults.boostDocument == null) {
          return results;
        }
        results.sort(byScore);
        return results;
      }
      /**
       * Provide suggestions for the given search query
       *
       * The result is a list of suggested modified search queries, derived from the
       * given search query, each with a relevance score, sorted by descending score.
       *
       * By default, it uses the same options used for search, except that by
       * default it performs prefix search on the last term of the query, and
       * combine terms with `'AND'` (requiring all query terms to match). Custom
       * options can be passed as a second argument. Defaults can be changed upon
       * calling the {@link MiniSearch} constructor, by passing a
       * `autoSuggestOptions` option.
       *
       * ### Basic usage:
       *
       * ```javascript
       * // Get suggestions for 'neuro':
       * miniSearch.autoSuggest('neuro')
       * // => [ { suggestion: 'neuromancer', terms: [ 'neuromancer' ], score: 0.46240 } ]
       * ```
       *
       * ### Multiple words:
       *
       * ```javascript
       * // Get suggestions for 'zen ar':
       * miniSearch.autoSuggest('zen ar')
       * // => [
       * //  { suggestion: 'zen archery art', terms: [ 'zen', 'archery', 'art' ], score: 1.73332 },
       * //  { suggestion: 'zen art', terms: [ 'zen', 'art' ], score: 1.21313 }
       * // ]
       * ```
       *
       * ### Fuzzy suggestions:
       *
       * ```javascript
       * // Correct spelling mistakes using fuzzy search:
       * miniSearch.autoSuggest('neromancer', { fuzzy: 0.2 })
       * // => [ { suggestion: 'neuromancer', terms: [ 'neuromancer' ], score: 1.03998 } ]
       * ```
       *
       * ### Filtering:
       *
       * ```javascript
       * // Get suggestions for 'zen ar', but only within the 'fiction' category
       * // (assuming that 'category' is a stored field):
       * miniSearch.autoSuggest('zen ar', {
       *   filter: (result) => result.category === 'fiction'
       * })
       * // => [
       * //  { suggestion: 'zen archery art', terms: [ 'zen', 'archery', 'art' ], score: 1.73332 },
       * //  { suggestion: 'zen art', terms: [ 'zen', 'art' ], score: 1.21313 }
       * // ]
       * ```
       *
       * @param queryString  Query string to be expanded into suggestions
       * @param options  Search options. The supported options and default values
       * are the same as for the {@link MiniSearch#search} method, except that by
       * default prefix search is performed on the last term in the query, and terms
       * are combined with `'AND'`.
       * @return  A sorted array of suggestions sorted by relevance score.
       */
      autoSuggest(queryString, options = {}) {
        options = { ...this._options.autoSuggestOptions, ...options };
        const suggestions = /* @__PURE__ */ new Map();
        for (const { score, terms } of this.search(queryString, options)) {
          const phrase = terms.join(" ");
          const suggestion = suggestions.get(phrase);
          if (suggestion != null) {
            suggestion.score += score;
            suggestion.count += 1;
          } else {
            suggestions.set(phrase, { score, terms, count: 1 });
          }
        }
        const results = [];
        for (const [suggestion, { score, terms, count }] of suggestions) {
          results.push({ suggestion, terms, score: score / count });
        }
        results.sort(byScore);
        return results;
      }
      /**
       * Total number of documents available to search
       */
      get documentCount() {
        return this._documentCount;
      }
      /**
       * Number of terms in the index
       */
      get termCount() {
        return this._index.size;
      }
      /**
       * Deserializes a JSON index (serialized with `JSON.stringify(miniSearch)`)
       * and instantiates a MiniSearch instance. It should be given the same options
       * originally used when serializing the index.
       *
       * ### Usage:
       *
       * ```javascript
       * // If the index was serialized with:
       * let miniSearch = new MiniSearch({ fields: ['title', 'text'] })
       * miniSearch.addAll(documents)
       *
       * const json = JSON.stringify(miniSearch)
       * // It can later be deserialized like this:
       * miniSearch = MiniSearch.loadJSON(json, { fields: ['title', 'text'] })
       * ```
       *
       * @param json  JSON-serialized index
       * @param options  configuration options, same as the constructor
       * @return An instance of MiniSearch deserialized from the given JSON.
       */
      static loadJSON(json, options) {
        if (options == null) {
          throw new Error("MiniSearch: loadJSON should be given the same options used when serializing the index");
        }
        return this.loadJS(JSON.parse(json), options);
      }
      /**
       * Async equivalent of {@link MiniSearch.loadJSON}
       *
       * This function is an alternative to {@link MiniSearch.loadJSON} that returns
       * a promise, and loads the index in batches, leaving pauses between them to avoid
       * blocking the main thread. It tends to be slower than the synchronous
       * version, but does not block the main thread, so it can be a better choice
       * when deserializing very large indexes.
       *
       * @param json  JSON-serialized index
       * @param options  configuration options, same as the constructor
       * @return A Promise that will resolve to an instance of MiniSearch deserialized from the given JSON.
       */
      static async loadJSONAsync(json, options) {
        if (options == null) {
          throw new Error("MiniSearch: loadJSON should be given the same options used when serializing the index");
        }
        return this.loadJSAsync(JSON.parse(json), options);
      }
      /**
       * Returns the default value of an option. It will throw an error if no option
       * with the given name exists.
       *
       * @param optionName  Name of the option
       * @return The default value of the given option
       *
       * ### Usage:
       *
       * ```javascript
       * // Get default tokenizer
       * MiniSearch.getDefault('tokenize')
       *
       * // Get default term processor
       * MiniSearch.getDefault('processTerm')
       *
       * // Unknown options will throw an error
       * MiniSearch.getDefault('notExisting')
       * // => throws 'MiniSearch: unknown option "notExisting"'
       * ```
       */
      static getDefault(optionName) {
        if (defaultOptions.hasOwnProperty(optionName)) {
          return getOwnProperty(defaultOptions, optionName);
        } else {
          throw new Error(`MiniSearch: unknown option "${optionName}"`);
        }
      }
      /**
       * @ignore
       */
      static loadJS(js, options) {
        const { index, documentIds, fieldLength, storedFields, serializationVersion } = js;
        const miniSearch = this.instantiateMiniSearch(js, options);
        miniSearch._documentIds = objectToNumericMap(documentIds);
        miniSearch._fieldLength = objectToNumericMap(fieldLength);
        miniSearch._storedFields = objectToNumericMap(storedFields);
        for (const [shortId, id] of miniSearch._documentIds) {
          miniSearch._idToShortId.set(id, shortId);
        }
        for (const [term, data] of index) {
          const dataMap = /* @__PURE__ */ new Map();
          for (const fieldId of Object.keys(data)) {
            let indexEntry = data[fieldId];
            if (serializationVersion === 1) {
              indexEntry = indexEntry.ds;
            }
            dataMap.set(parseInt(fieldId, 10), objectToNumericMap(indexEntry));
          }
          miniSearch._index.set(term, dataMap);
        }
        return miniSearch;
      }
      /**
       * @ignore
       */
      static async loadJSAsync(js, options) {
        const { index, documentIds, fieldLength, storedFields, serializationVersion } = js;
        const miniSearch = this.instantiateMiniSearch(js, options);
        miniSearch._documentIds = await objectToNumericMapAsync(documentIds);
        miniSearch._fieldLength = await objectToNumericMapAsync(fieldLength);
        miniSearch._storedFields = await objectToNumericMapAsync(storedFields);
        for (const [shortId, id] of miniSearch._documentIds) {
          miniSearch._idToShortId.set(id, shortId);
        }
        let count = 0;
        for (const [term, data] of index) {
          const dataMap = /* @__PURE__ */ new Map();
          for (const fieldId of Object.keys(data)) {
            let indexEntry = data[fieldId];
            if (serializationVersion === 1) {
              indexEntry = indexEntry.ds;
            }
            dataMap.set(parseInt(fieldId, 10), await objectToNumericMapAsync(indexEntry));
          }
          if (++count % 1e3 === 0)
            await wait(0);
          miniSearch._index.set(term, dataMap);
        }
        return miniSearch;
      }
      /**
       * @ignore
       */
      static instantiateMiniSearch(js, options) {
        const { documentCount, nextId, fieldIds, averageFieldLength, dirtCount, serializationVersion } = js;
        if (serializationVersion !== 1 && serializationVersion !== 2) {
          throw new Error("MiniSearch: cannot deserialize an index created with an incompatible version");
        }
        const miniSearch = new _MiniSearch(options);
        miniSearch._documentCount = documentCount;
        miniSearch._nextId = nextId;
        miniSearch._idToShortId = /* @__PURE__ */ new Map();
        miniSearch._fieldIds = fieldIds;
        miniSearch._avgFieldLength = averageFieldLength;
        miniSearch._dirtCount = dirtCount || 0;
        miniSearch._index = new SearchableMap();
        return miniSearch;
      }
      /**
       * @ignore
       */
      executeQuery(query, searchOptions = {}) {
        if (query === _MiniSearch.wildcard) {
          return this.executeWildcardQuery(searchOptions);
        }
        if (typeof query !== "string") {
          const options2 = { ...searchOptions, ...query, queries: void 0 };
          const results2 = query.queries.map((subquery) => this.executeQuery(subquery, options2));
          return this.combineResults(results2, options2.combineWith);
        }
        const { tokenize, processTerm, searchOptions: globalSearchOptions } = this._options;
        const options = { tokenize, processTerm, ...globalSearchOptions, ...searchOptions };
        const { tokenize: searchTokenize, processTerm: searchProcessTerm } = options;
        const terms = searchTokenize(query).flatMap((term) => searchProcessTerm(term)).filter((term) => !!term);
        const queries = terms.map(termToQuerySpec(options));
        const results = queries.map((query2) => this.executeQuerySpec(query2, options));
        return this.combineResults(results, options.combineWith);
      }
      /**
       * @ignore
       */
      executeQuerySpec(query, searchOptions) {
        const options = { ...this._options.searchOptions, ...searchOptions };
        const boosts = (options.fields || this._options.fields).reduce((boosts2, field) => ({ ...boosts2, [field]: getOwnProperty(options.boost, field) || 1 }), {});
        const { boostDocument, weights, maxFuzzy, bm25: bm25params } = options;
        const { fuzzy: fuzzyWeight, prefix: prefixWeight } = { ...defaultSearchOptions.weights, ...weights };
        const data = this._index.get(query.term);
        const results = this.termResults(query.term, query.term, 1, query.termBoost, data, boosts, boostDocument, bm25params);
        let prefixMatches;
        let fuzzyMatches;
        if (query.prefix) {
          prefixMatches = this._index.atPrefix(query.term);
        }
        if (query.fuzzy) {
          const fuzzy = query.fuzzy === true ? 0.2 : query.fuzzy;
          const maxDistance = fuzzy < 1 ? Math.min(maxFuzzy, Math.round(query.term.length * fuzzy)) : fuzzy;
          if (maxDistance)
            fuzzyMatches = this._index.fuzzyGet(query.term, maxDistance);
        }
        if (prefixMatches) {
          for (const [term, data2] of prefixMatches) {
            const distance = term.length - query.term.length;
            if (!distance) {
              continue;
            }
            fuzzyMatches === null || fuzzyMatches === void 0 ? void 0 : fuzzyMatches.delete(term);
            const weight = prefixWeight * term.length / (term.length + 0.3 * distance);
            this.termResults(query.term, term, weight, query.termBoost, data2, boosts, boostDocument, bm25params, results);
          }
        }
        if (fuzzyMatches) {
          for (const term of fuzzyMatches.keys()) {
            const [data2, distance] = fuzzyMatches.get(term);
            if (!distance) {
              continue;
            }
            const weight = fuzzyWeight * term.length / (term.length + distance);
            this.termResults(query.term, term, weight, query.termBoost, data2, boosts, boostDocument, bm25params, results);
          }
        }
        return results;
      }
      /**
       * @ignore
       */
      executeWildcardQuery(searchOptions) {
        const results = /* @__PURE__ */ new Map();
        const options = { ...this._options.searchOptions, ...searchOptions };
        for (const [shortId, id] of this._documentIds) {
          const score = options.boostDocument ? options.boostDocument(id, "", this._storedFields.get(shortId)) : 1;
          results.set(shortId, {
            score,
            terms: [],
            match: {}
          });
        }
        return results;
      }
      /**
       * @ignore
       */
      combineResults(results, combineWith = OR) {
        if (results.length === 0) {
          return /* @__PURE__ */ new Map();
        }
        const operator = combineWith.toLowerCase();
        const combinator = combinators[operator];
        if (!combinator) {
          throw new Error(`Invalid combination operator: ${combineWith}`);
        }
        return results.reduce(combinator) || /* @__PURE__ */ new Map();
      }
      /**
       * Allows serialization of the index to JSON, to possibly store it and later
       * deserialize it with {@link MiniSearch.loadJSON}.
       *
       * Normally one does not directly call this method, but rather call the
       * standard JavaScript `JSON.stringify()` passing the {@link MiniSearch}
       * instance, and JavaScript will internally call this method. Upon
       * deserialization, one must pass to {@link MiniSearch.loadJSON} the same
       * options used to create the original instance that was serialized.
       *
       * ### Usage:
       *
       * ```javascript
       * // Serialize the index:
       * let miniSearch = new MiniSearch({ fields: ['title', 'text'] })
       * miniSearch.addAll(documents)
       * const json = JSON.stringify(miniSearch)
       *
       * // Later, to deserialize it:
       * miniSearch = MiniSearch.loadJSON(json, { fields: ['title', 'text'] })
       * ```
       *
       * @return A plain-object serializable representation of the search index.
       */
      toJSON() {
        const index = [];
        for (const [term, fieldIndex] of this._index) {
          const data = {};
          for (const [fieldId, freqs] of fieldIndex) {
            data[fieldId] = Object.fromEntries(freqs);
          }
          index.push([term, data]);
        }
        return {
          documentCount: this._documentCount,
          nextId: this._nextId,
          documentIds: Object.fromEntries(this._documentIds),
          fieldIds: this._fieldIds,
          fieldLength: Object.fromEntries(this._fieldLength),
          averageFieldLength: this._avgFieldLength,
          storedFields: Object.fromEntries(this._storedFields),
          dirtCount: this._dirtCount,
          index,
          serializationVersion: 2
        };
      }
      /**
       * @ignore
       */
      termResults(sourceTerm, derivedTerm, termWeight, termBoost, fieldTermData, fieldBoosts, boostDocumentFn, bm25params, results = /* @__PURE__ */ new Map()) {
        if (fieldTermData == null)
          return results;
        for (const field of Object.keys(fieldBoosts)) {
          const fieldBoost = fieldBoosts[field];
          const fieldId = this._fieldIds[field];
          const fieldTermFreqs = fieldTermData.get(fieldId);
          if (fieldTermFreqs == null)
            continue;
          let matchingFields = fieldTermFreqs.size;
          const avgFieldLength = this._avgFieldLength[fieldId];
          for (const docId of fieldTermFreqs.keys()) {
            if (!this._documentIds.has(docId)) {
              this.removeTerm(fieldId, docId, derivedTerm);
              matchingFields -= 1;
              continue;
            }
            const docBoost = boostDocumentFn ? boostDocumentFn(this._documentIds.get(docId), derivedTerm, this._storedFields.get(docId)) : 1;
            if (!docBoost)
              continue;
            const termFreq = fieldTermFreqs.get(docId);
            const fieldLength = this._fieldLength.get(docId)[fieldId];
            const rawScore = calcBM25Score(termFreq, matchingFields, this._documentCount, fieldLength, avgFieldLength, bm25params);
            const weightedScore = termWeight * termBoost * fieldBoost * docBoost * rawScore;
            const result = results.get(docId);
            if (result) {
              result.score += weightedScore;
              assignUniqueTerm(result.terms, sourceTerm);
              const match = getOwnProperty(result.match, derivedTerm);
              if (match) {
                match.push(field);
              } else {
                result.match[derivedTerm] = [field];
              }
            } else {
              results.set(docId, {
                score: weightedScore,
                terms: [sourceTerm],
                match: { [derivedTerm]: [field] }
              });
            }
          }
        }
        return results;
      }
      /**
       * @ignore
       */
      addTerm(fieldId, documentId, term) {
        const indexData = this._index.fetch(term, createMap);
        let fieldIndex = indexData.get(fieldId);
        if (fieldIndex == null) {
          fieldIndex = /* @__PURE__ */ new Map();
          fieldIndex.set(documentId, 1);
          indexData.set(fieldId, fieldIndex);
        } else {
          const docs = fieldIndex.get(documentId);
          fieldIndex.set(documentId, (docs || 0) + 1);
        }
      }
      /**
       * @ignore
       */
      removeTerm(fieldId, documentId, term) {
        if (!this._index.has(term)) {
          this.warnDocumentChanged(documentId, fieldId, term);
          return;
        }
        const indexData = this._index.fetch(term, createMap);
        const fieldIndex = indexData.get(fieldId);
        if (fieldIndex == null || fieldIndex.get(documentId) == null) {
          this.warnDocumentChanged(documentId, fieldId, term);
        } else if (fieldIndex.get(documentId) <= 1) {
          if (fieldIndex.size <= 1) {
            indexData.delete(fieldId);
          } else {
            fieldIndex.delete(documentId);
          }
        } else {
          fieldIndex.set(documentId, fieldIndex.get(documentId) - 1);
        }
        if (this._index.get(term).size === 0) {
          this._index.delete(term);
        }
      }
      /**
       * @ignore
       */
      warnDocumentChanged(shortDocumentId, fieldId, term) {
        for (const fieldName of Object.keys(this._fieldIds)) {
          if (this._fieldIds[fieldName] === fieldId) {
            this._options.logger("warn", `MiniSearch: document with ID ${this._documentIds.get(shortDocumentId)} has changed before removal: term "${term}" was not present in field "${fieldName}". Removing a document after it has changed can corrupt the index!`, "version_conflict");
            return;
          }
        }
      }
      /**
       * @ignore
       */
      addDocumentId(documentId) {
        const shortDocumentId = this._nextId;
        this._idToShortId.set(documentId, shortDocumentId);
        this._documentIds.set(shortDocumentId, documentId);
        this._documentCount += 1;
        this._nextId += 1;
        return shortDocumentId;
      }
      /**
       * @ignore
       */
      addFields(fields) {
        for (let i = 0; i < fields.length; i++) {
          this._fieldIds[fields[i]] = i;
        }
      }
      /**
       * @ignore
       */
      addFieldLength(documentId, fieldId, count, length) {
        let fieldLengths = this._fieldLength.get(documentId);
        if (fieldLengths == null)
          this._fieldLength.set(documentId, fieldLengths = []);
        fieldLengths[fieldId] = length;
        const averageFieldLength = this._avgFieldLength[fieldId] || 0;
        const totalFieldLength = averageFieldLength * count + length;
        this._avgFieldLength[fieldId] = totalFieldLength / (count + 1);
      }
      /**
       * @ignore
       */
      removeFieldLength(documentId, fieldId, count, length) {
        if (count === 1) {
          this._avgFieldLength[fieldId] = 0;
          return;
        }
        const totalFieldLength = this._avgFieldLength[fieldId] * count - length;
        this._avgFieldLength[fieldId] = totalFieldLength / (count - 1);
      }
      /**
       * @ignore
       */
      saveStoredFields(documentId, doc) {
        const { storeFields, extractField } = this._options;
        if (storeFields == null || storeFields.length === 0) {
          return;
        }
        let documentFields = this._storedFields.get(documentId);
        if (documentFields == null)
          this._storedFields.set(documentId, documentFields = {});
        for (const fieldName of storeFields) {
          const fieldValue = extractField(doc, fieldName);
          if (fieldValue !== void 0)
            documentFields[fieldName] = fieldValue;
        }
      }
    };
    MiniSearch.wildcard = Symbol("*");
    var getOwnProperty = (object, property) => Object.prototype.hasOwnProperty.call(object, property) ? object[property] : void 0;
    var combinators = {
      [OR]: (a, b) => {
        for (const docId of b.keys()) {
          const existing = a.get(docId);
          if (existing == null) {
            a.set(docId, b.get(docId));
          } else {
            const { score, terms, match } = b.get(docId);
            existing.score = existing.score + score;
            existing.match = Object.assign(existing.match, match);
            assignUniqueTerms(existing.terms, terms);
          }
        }
        return a;
      },
      [AND]: (a, b) => {
        const combined = /* @__PURE__ */ new Map();
        for (const docId of b.keys()) {
          const existing = a.get(docId);
          if (existing == null)
            continue;
          const { score, terms, match } = b.get(docId);
          assignUniqueTerms(existing.terms, terms);
          combined.set(docId, {
            score: existing.score + score,
            terms: existing.terms,
            match: Object.assign(existing.match, match)
          });
        }
        return combined;
      },
      [AND_NOT]: (a, b) => {
        for (const docId of b.keys())
          a.delete(docId);
        return a;
      }
    };
    var defaultBM25params = { k: 1.2, b: 0.7, d: 0.5 };
    var calcBM25Score = (termFreq, matchingCount, totalCount, fieldLength, avgFieldLength, bm25params) => {
      const { k, b, d } = bm25params;
      const invDocFreq = Math.log(1 + (totalCount - matchingCount + 0.5) / (matchingCount + 0.5));
      return invDocFreq * (d + termFreq * (k + 1) / (termFreq + k * (1 - b + b * fieldLength / avgFieldLength)));
    };
    var termToQuerySpec = (options) => (term, i, terms) => {
      const fuzzy = typeof options.fuzzy === "function" ? options.fuzzy(term, i, terms) : options.fuzzy || false;
      const prefix = typeof options.prefix === "function" ? options.prefix(term, i, terms) : options.prefix === true;
      const termBoost = typeof options.boostTerm === "function" ? options.boostTerm(term, i, terms) : 1;
      return { term, fuzzy, prefix, termBoost };
    };
    var defaultOptions = {
      idField: "id",
      extractField: (document, fieldName) => document[fieldName],
      stringifyField: (fieldValue, fieldName) => fieldValue.toString(),
      tokenize: (text) => text.split(SPACE_OR_PUNCTUATION),
      processTerm: (term) => term.toLowerCase(),
      fields: void 0,
      searchOptions: void 0,
      storeFields: [],
      logger: (level, message) => {
        if (typeof (console === null || console === void 0 ? void 0 : console[level]) === "function")
          console[level](message);
      },
      autoVacuum: true
    };
    var defaultSearchOptions = {
      combineWith: OR,
      prefix: false,
      fuzzy: false,
      maxFuzzy: 6,
      boost: {},
      weights: { fuzzy: 0.45, prefix: 0.375 },
      bm25: defaultBM25params
    };
    var defaultAutoSuggestOptions = {
      combineWith: AND,
      prefix: (term, i, terms) => i === terms.length - 1
    };
    var defaultVacuumOptions = { batchSize: 1e3, batchWait: 10 };
    var defaultVacuumConditions = { minDirtFactor: 0.1, minDirtCount: 20 };
    var defaultAutoVacuumOptions = { ...defaultVacuumOptions, ...defaultVacuumConditions };
    var assignUniqueTerm = (target, term) => {
      if (!target.includes(term))
        target.push(term);
    };
    var assignUniqueTerms = (target, source) => {
      for (const term of source) {
        if (!target.includes(term))
          target.push(term);
      }
    };
    var byScore = ({ score: a }, { score: b }) => b - a;
    var createMap = () => /* @__PURE__ */ new Map();
    var objectToNumericMap = (object) => {
      const map = /* @__PURE__ */ new Map();
      for (const key of Object.keys(object)) {
        map.set(parseInt(key, 10), object[key]);
      }
      return map;
    };
    var objectToNumericMapAsync = async (object) => {
      const map = /* @__PURE__ */ new Map();
      let count = 0;
      for (const key of Object.keys(object)) {
        map.set(parseInt(key, 10), object[key]);
        if (++count % 1e3 === 0) {
          await wait(0);
        }
      }
      return map;
    };
    var wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    var SPACE_OR_PUNCTUATION = /[\n\r\p{Z}\p{P}]+/u;
    module2.exports = MiniSearch;
  }
});

// src/book-memory.js
var require_book_memory = __commonJS({
  "src/book-memory.js"(exports2, module2) {
    var MiniSearch = require_cjs();
    var { listBuches } = require_catalog();
    var { statusFor: statusFor2 } = require_progress();
    var { stripFrontmatter } = require_intro_model();
    var fold = (text) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
    var clip = (text, length) => text.length <= length ? text : text.slice(0, length) + "\u2026";
    function bookRecords(model, progress, introduction = "") {
      const records = /* @__PURE__ */ new Map();
      const put = (ref, entry) => records.set(ref, { id: ref, ...entry });
      if (introduction.trim()) put(model.book.index.path, {
        path: model.book.index.path,
        title: model.book.title,
        kind: "index",
        text: introduction,
        read: false
      });
      for (const chapter of model.chapters) {
        const { path, name, category } = chapter;
        const read = Boolean(statusFor2(model, progress, chapter));
        const blocks = chapter.units.filter((unit) => unit.type !== "solution" && !unit.inSolution && unit.callout !== "hint");
        const visible = new Set(blocks);
        const base = { path, category, read, chapter: name };
        put(path, { ...base, title: name, kind: "chapter", text: [chapter.description, ...blocks.map((unit) => unit.markdown)].filter(Boolean).join("\n\n") });
        let heading;
        for (const block of blocks) {
          if (block.type === "heading" && !block.node) {
            heading = { title: block.title, blocks: [] };
          } else if (heading && !block.node) {
            heading.blocks.push(block.markdown);
          } else {
            heading = null;
          }
          if (!heading?.title) continue;
          put(path + "#" + heading.title, { ...base, title: heading.title, kind: "section", text: heading.blocks.join("\n\n") });
        }
        for (const node of chapter.nodes) {
          if (!visible.has(node.unit)) continue;
          const ref = path + "#" + (node.id.startsWith("^") ? node.id : node.title);
          put(ref, { ...base, title: node.title, kind: node.type, text: [node.unit.markdown, ...node.prompt ?? []].join("\n\n") });
        }
      }
      return records;
    }
    function prerequisites(model, chapterPath, blockId) {
      const refs = /* @__PURE__ */ new Set();
      const visited = /* @__PURE__ */ new Set();
      const queue = [
        ...model.byPath.get(chapterPath)?.dependencies ?? [],
        ...model.targets.get(chapterPath + "#" + blockId)?.dependencies ?? []
      ];
      for (const target of queue) {
        if (!target || visited.has(target.key)) continue;
        visited.add(target.key);
        refs.add(target.id && !target.id.startsWith("^") ? target.path + "#" + target.title : target.key);
        queue.push(...target.dependencies);
      }
      return refs;
    }
    function searchRecords(records, query) {
      const index = new MiniSearch({
        fields: ["title", "chapter", "category", "text"],
        processTerm: (term) => fold(term)
      });
      index.addAll([...records.values()]);
      return index.search(query ?? "", {
        boost: { title: 4, chapter: 2, category: 1.5 },
        prefix: (term) => term.length >= 4,
        fuzzy: (term) => term.length >= 6 ? 0.15 : false
      });
    }
    async function memoryRecords(plugin, model) {
      const [progress, source] = await Promise.all([
        plugin.progress.read(model).catch(() => ({})),
        plugin.app.vault.cachedRead(model.book.index)
      ]);
      return bookRecords(model, progress, stripFrontmatter(source));
    }
    async function studyContext(plugin, model, file, focus, query) {
      const records = await memoryRecords(plugin, model);
      const required = prerequisites(model, file.path, focus?.id);
      const focusRef = file.path + "#" + (focus?.id.startsWith("^") ? focus.id : focus?.title);
      const ranked = searchRecords(records, [query, focus?.title, model.byPath.get(file.path)?.name].filter(Boolean).join(" "));
      const ordered = [
        ...required,
        ...ranked.filter((match) => records.get(match.id)?.read).map((match) => match.id),
        ...ranked.map((match) => match.id)
      ];
      return [...new Set(ordered)].flatMap((ref) => {
        const record = records.get(ref);
        if (!record || !record.text || ref === focusRef || ref === file.path && !required.has(ref)) return [];
        if (record.kind === "exercise" && !required.has(ref)) return [];
        return [{
          ref,
          title: record.title,
          type: record.kind,
          read: record.read,
          prerequisite: required.has(ref),
          text: clip(record.text, 850)
        }];
      }).slice(0, 6);
    }
    function createBookTools2(plugin) {
      async function modelFor(bookPath) {
        const book = listBuches(plugin.app).find((item) => item.path === bookPath);
        if (!book) throw new Error("B\xFCcher could not find that book.");
        return plugin.learning.book(book);
      }
      const recordsFor = async (bookPath) => memoryRecords(plugin, await modelFor(bookPath));
      return Object.freeze({
        version: 1,
        async context(bookPath, chapterPath, blockId, query) {
          const model = await modelFor(bookPath);
          const chapter = model.byPath.get(chapterPath);
          if (!chapter) throw new Error("B\xFCcher could not find that chapter in the requested book.");
          const focus = chapter.nodes.find((node) => node.id === blockId);
          return studyContext(plugin, model, chapter.file, focus, query);
        },
        async search(bookPath, query) {
          const records = await recordsFor(bookPath);
          return searchRecords(records, query).slice(0, 10).map(({ id }) => {
            const { title, kind, read, text } = records.get(id);
            return { ref: id, title, kind, read, excerpt: clip(text, 350) };
          });
        },
        async read(bookPath, ref) {
          const record = (await recordsFor(bookPath)).get(ref);
          if (!record) return null;
          const { id, title, kind, read, text } = record;
          return { ref: id, title, kind, read, text: clip(text, 5e3) };
        }
      });
    }
    module2.exports = { createBookTools: createBookTools2, studyContext };
  }
});

// src/plugin.js
var { Plugin, Notice } = require("obsidian");
var { ensureRoot, createBuch, createConcept, createSubconcept } = require_storage();
var { NameModal } = require_name_modal();
var { BuchesView, VIEW_TYPE } = require_view();
var { iconFor, setFileIcon } = require_icons();
var { ContextView, CONTEXT_VIEW } = require_context_view();
var { findBuchContext, flattenConcepts } = require_buch_model();
var { TabTitles } = require_tab_titles();
var { IntroductionRenderer } = require_introduction();
var { PaginationRenderer } = require_pagination();
var { BuchReader, READER_VIEW } = require_reader();
var { LearningIndex } = require_learning();
var { BookProgress, statusFor } = require_progress();
var { BuchSettings, readSettings } = require_settings();
var { AiSolutions } = require_ai_solutions();
var { createBookTools } = require_book_memory();
var BuchesPlugin = class extends Plugin {
  async onload() {
    await ensureRoot(this.app.vault);
    this.contextFile = null;
    this.contextPath = null;
    this.refreshTimer = null;
    this.contextOpening = null;
    this.alive = true;
    this.tabTitles = new TabTitles(this.app);
    this.introductions = new IntroductionRenderer(this.app);
    this.pagination = new PaginationRenderer(this.app, this);
    const data = this.savedData = await this.loadData() ?? {};
    this.settings = readSettings(data?.settings);
    this.lastRead = new Map(Object.entries(data.lastRead ?? {}));
    this.progress = new BookProgress(this.app, data?.solved ?? {});
    this.learning = new LearningIndex(this.app);
    this.solutionWrites = /* @__PURE__ */ new Map();
    this.aiSolutions = new AiSolutions(this);
    this.bookTools = createBookTools(this);
    this.settingsSave = Promise.resolve();
    this.addSettingTab(new BuchSettings(this.app, this));
    this.registerView(READER_VIEW, (leaf) => new BuchReader(leaf, this));
    this.addCommand({ id: "read-buch", name: "Read current Buch page", checkCallback: (checking) => {
      const file = this.app.workspace.getActiveFile();
      if (!findBuchContext(this.app, file)) return false;
      if (!checking) void this.openFile(file);
      return true;
    } });
    this.registerView(VIEW_TYPE, (leaf) => new BuchesView(leaf, this));
    this.registerView(CONTEXT_VIEW, (leaf) => new ContextView(leaf, this));
    this.addRibbonIcon("library", "Open Buches", () => {
      void this.activateView();
    });
    this.addCommand({ id: "create-buch", name: "Create Buch", callback: () => this.promptCreateBuch() });
    this.addCommand({ id: "open-buches", name: "Open Buches", callback: () => {
      void this.activateView();
    } });
    this.addCommand({ id: "open-buch-context", name: "Open Buch context", callback: () => {
      void this.ensureContextView(true);
    } });
    this.addCommand({ id: "set-buch-icon", name: "Set icon for current Buch or concept", checkCallback: (checking) => {
      const file = this.app.workspace.getActiveFile();
      if (!findBuchContext(this.app, file)) return false;
      if (!checking) this.promptIcon(file);
      return true;
    } });
    this.registerEvent(this.app.workspace.on("file-open", (file) => {
      const path = file?.path ?? null;
      const changed = path !== this.contextPath;
      this.contextFile = file;
      this.contextPath = path;
      const leaf = this.app.workspace.getMostRecentLeaf();
      if (leaf?.view?.file?.path === path) this.rememberReading(leaf);
      if (changed && findBuchContext(this.app, file)) void this.ensureContextView(false);
      this.scheduleRefresh();
    }));
    this.registerEvent(this.app.workspace.on("active-leaf-change", (leaf) => {
      this.rememberReading(leaf);
      this.scheduleRefresh();
    }));
    this.registerEvent(this.app.workspace.on("layout-change", () => this.scheduleRefresh()));
    for (const event of ["changed", "resolved"]) this.registerEvent(this.app.metadataCache.on(event, () => this.scheduleRefresh()));
    for (const event of ["create", "delete", "modify"]) this.registerEvent(this.app.vault.on(event, (file) => {
      if (file?.path?.startsWith("Buches/")) {
        if (event === "delete") this.learning.pages.delete(file.path);
        if (/^Buches\/[^/]+\/_solutions\//.test(file.path)) {
          for (const leaf of this.app.workspace.getLeavesOfType(READER_VIEW)) leaf.view.renderKey = null;
        }
        this.scheduleRefresh();
      }
    }));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
      this.learning.pages.delete(oldPath);
      for (const [book, path] of this.lastRead) {
        if (path !== oldPath && !path.startsWith(`${oldPath}/`)) continue;
        const next = file.path + path.slice(oldPath.length);
        this.lastRead.delete(book);
        const nextBook = next.match(/^(Buches\/[^/]+)\/concepts\//)?.[1];
        if (nextBook) this.lastRead.set(nextBook, next);
        this.savePreferences();
        break;
      }
      Promise.resolve(this.progress.rename(file, oldPath)).catch((error) => this.report(error, "Could not move chapter progress.")).finally(() => this.scheduleRefresh());
    }));
    const onReady = () => {
      this.contextFile = this.app.workspace.getActiveFile();
      this.contextPath = this.contextFile?.path ?? null;
      this.rememberReading(this.app.workspace.getMostRecentLeaf());
      void this.activateView();
      if (findBuchContext(this.app, this.contextFile)) void this.ensureContextView(false);
      this.scheduleRefresh();
    };
    if (this.app.workspace.layoutReady) {
      onReady();
    } else {
      this.app.workspace.onLayoutReady(onReady);
    }
  }
  onunload() {
    this.alive = false;
    this.aiSolutions.dispose();
    if (this.refreshTimer !== null) clearTimeout(this.refreshTimer);
    this.tabTitles.unload();
    this.introductions.unload();
    this.pagination.unload();
    this.app.workspace.detachLeavesOfType(READER_VIEW);
    this.app.workspace.detachLeavesOfType(VIEW_TYPE);
    this.app.workspace.detachLeavesOfType(CONTEXT_VIEW);
  }
  getContextFile() {
    return this.contextFile;
  }
  scheduleRefresh() {
    if (!this.alive) return;
    if (this.refreshTimer !== null) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      this.tabTitles.refresh();
      void this.introductions.refresh().catch((error) => console.error("Buches introduction:", error));
      void this.pagination.refresh().catch((error) => console.error("Buches pagination:", error));
      for (const leaf of this.app.workspace.getLeavesOfType(READER_VIEW)) {
        void leaf.view.refresh?.().catch((error) => console.error("Buches reader:", error));
      }
      for (const leaf of this.app.workspace.getLeavesOfType(CONTEXT_VIEW)) leaf.view?.render?.();
    }, 120);
  }
  async ensureContextView(reveal) {
    if (this.contextOpening) return this.contextOpening;
    const workspace = this.app.workspace;
    const existing = workspace.getLeavesOfType(CONTEXT_VIEW)[0];
    const leaf = workspace.getMostRecentLeaf();
    if (["markdown", READER_VIEW].includes(leaf?.view?.getViewType?.())) {
      this.contextFile = leaf.view.file ?? null;
      this.contextPath = this.contextFile?.path ?? null;
    }
    if (existing) {
      existing.view?.render?.();
      if (reveal || findBuchContext(this.app, this.contextFile)) await workspace.revealLeaf(existing);
      return existing;
    }
    this.contextOpening = (async () => {
      const leaf2 = workspace.getRightLeaf(false);
      if (!leaf2) {
        if (reveal) new Notice("Could not open Buch context.");
        return null;
      }
      await leaf2.setViewState({ type: CONTEXT_VIEW, active: true });
      if (this.alive) await workspace.revealLeaf(leaf2);
      return leaf2;
    })();
    try {
      return await this.contextOpening;
    } finally {
      this.contextOpening = null;
    }
  }
  async activateView() {
    const workspace = this.app.workspace;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) {
      leaf = workspace.getLeftLeaf(false);
      if (!leaf) {
        new Notice("Could not open the Buches sidebar.");
        return;
      }
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
    }
    await workspace.revealLeaf(leaf);
  }
  promptIcon(file) {
    new NameModal(this.app, {
      title: "Set icon",
      placeholder: "Lucide name or emoji; blank to clear",
      submitText: "Save",
      initialValue: iconFor(this.app, file),
      required: false,
      onSubmit: async (value) => {
        await setFileIcon(this.app, file, value);
      }
    }).open();
  }
  promptCreateBuch() {
    new NameModal(this.app, {
      title: "Create Buch",
      placeholder: "Buch title",
      submitText: "Create Buch",
      onSubmit: async (title) => {
        const file = await createBuch(this.app.vault, title);
        await this.openFile(file);
      }
    }).open();
  }
  promptCreateConcept(buchPath) {
    new NameModal(this.app, {
      title: "Create concept",
      placeholder: "Concept name",
      submitText: "Create concept",
      onSubmit: async (name) => {
        const file = await createConcept(this.app.vault, buchPath, name, this.app.metadataCache);
        await this.openFile(file);
      }
    }).open();
  }
  promptCreateSubconcept(parentPath) {
    new NameModal(this.app, {
      title: "Create subconcept",
      placeholder: "Concept name",
      submitText: "Create subconcept",
      onSubmit: async (name) => {
        const file = await createSubconcept(this.app.vault, parentPath, name, this.app.metadataCache);
        await this.openFile(file);
      }
    }).open();
  }
  async openFile(file, leaf = this.app.workspace.getLeaf(false), sheet = false) {
    if (leaf.view?.getViewType?.() === READER_VIEW && leaf.view.file?.path === file.path && leaf.view.sheet === sheet && !leaf.view.editingChapter) {
      await this.app.workspace.revealLeaf(leaf);
      this.rememberReading(leaf);
      return;
    }
    await leaf.setViewState({ type: READER_VIEW, state: { file: file.path, sheet }, active: true });
    this.rememberReading(leaf);
    this.contextFile = file;
    this.contextPath = file.path;
    void this.ensureContextView(false);
    this.scheduleRefresh();
  }
  rememberReading(leaf) {
    const view = leaf?.view;
    if (view?.getViewType?.() !== READER_VIEW || view.sheet || view.editingChapter) return;
    const context = findBuchContext(this.app, view.file);
    if (!context?.concept || this.lastRead.get(context.book.path) === context.file.path) return;
    this.lastRead.set(context.book.path, context.file.path);
    this.savePreferences();
    for (const { view: navigator2 } of this.app.workspace.getLeavesOfType(VIEW_TYPE)) navigator2.scheduleRender();
  }
  openExercises(file, leaf) {
    return this.openFile(file, leaf, true);
  }
  async turnPage(context, leaf, file, direction) {
    await this.openFile(file, leaf);
    if (direction !== "next" || !context?.concept || leaf.view.file?.path !== file.path) return;
    try {
      const model = await this.learning.book(context.book);
      const chapter = model.byPath.get(context.file.path);
      if (chapter) {
        const progress = await this.progress.read(model);
        if (!statusFor(model, progress, chapter)) await this.learn(model, chapter, true);
      }
    } catch (error) {
      this.report(error, "Could not record chapter progress.");
    }
  }
  report(error, message) {
    console.error("Buches:", error);
    new Notice(message);
  }
  changeSettings(update) {
    this.settings = { ...this.settings, ...update };
    this.scheduleRefresh();
    return this.savePreferences();
  }
  savePreferences() {
    this.settingsSave = this.settingsSave.then(() => this.saveData({
      ...this.savedData,
      settings: this.settings,
      solved: this.progress.legacy,
      lastRead: Object.fromEntries(this.lastRead)
    })).catch((error) => this.report(error, "Could not save B\xFCcher preferences."));
    return this.settingsSave;
  }
  async setConceptRead(book, concept, read) {
    const model = await this.learning.book(book);
    const paths = flattenConcepts([concept]).map((item) => item.file.path);
    await this.progress.setRead(model, paths, read);
    this.scheduleRefresh();
  }
  async learn(model, target, done) {
    try {
      await this.progress.set(model, target, done);
      this.scheduleRefresh();
      return true;
    } catch (error) {
      this.report(error, error.message || "Could not save reading progress.");
      return false;
    }
  }
  async openTarget(target, leaf = this.app.workspace.getMostRecentLeaf()) {
    await this.openFile(target.file, leaf);
    const reader = leaf?.view;
    if (reader?.getViewType?.() === READER_VIEW && reader.file?.path === target.file.path && target.id) {
      await reader.revealBlock(target.id);
    }
  }
  async goToHeading(file, heading) {
    const workspace = this.app.workspace;
    const reader = workspace.getLeavesOfType(READER_VIEW).find((item) => item.view?.file?.path === file.path);
    if (reader) {
      if (reader.view.sheet) await this.openFile(file, reader);
      else await workspace.revealLeaf(reader);
      if (reader.view.editingChapter) reader.view.editor.setCursor({ line: heading.line, ch: 0 });
      else reader.view.goToHeading(heading.text);
      return;
    }
    let leaf = workspace.getLeavesOfType("markdown").find((item) => item.view?.file?.path === file.path && item === workspace.getMostRecentLeaf());
    if (!leaf) leaf = workspace.getLeavesOfType("markdown").find((item) => item.view?.file?.path === file.path);
    if (!leaf?.view) {
      await workspace.openLinkText(`${file.path}#${heading.text}`, file.path, false);
      return;
    }
    const view = leaf.view;
    if (view.getMode?.() === "source" && view.editor) {
      const pos = { line: heading.line, ch: 0 };
      view.editor.setCursor(pos);
      view.editor.scrollIntoView({ from: pos, to: pos }, true);
      view.editor.focus();
    } else {
      await workspace.openLinkText(`${file.path}#${heading.text}`, file.path, false);
    }
  }
};
module.exports = BuchesPlugin;
