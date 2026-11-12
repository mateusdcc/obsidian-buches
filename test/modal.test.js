const test = require('node:test');
const assert = require('node:assert/strict');
const { NameModal } = require('../src/name-modal');

class El {
  constructor() { this.children = []; this.handlers = {}; this.value = ''; this.attrs = {}; }
  empty() { this.children = []; }
  createEl(tag, opts) { const child = new El(); child.tag = tag; child.options = opts; this.children.push(child); return child; }
  createDiv(opts) { return this.createEl('div', opts); }
  setAttribute(k, v) { this.attrs[k] = v; }
  addEventListener(name, fn) { this.handlers[name] = fn; }
  focus() { this.focused = true; }
}

test('modal submits the entered title once and closes after success', async () => {
  let calls = 0;
  let value;
  const modal = new NameModal({}, {title:'Create Buch', placeholder:'Buch title', submitText:'Create Buch', onSubmit: async v => { calls++; value = v; }});
  modal.contentEl = new El();
  modal.close = () => { modal.closed = true; };
  modal.onOpen();
  const form = modal.contentEl.children[1];
  const input = form.children[0];
  input.value = 'Title';
  await form.handlers.submit({preventDefault() {}});
  assert.equal(value, 'Title');
  assert.equal(calls, 1);
  assert.equal(modal.closed, true);
});

test('modal remains open and permits retry on invalid input', async () => {
  let calls = 0;
  const modal = new NameModal({}, {title:'Create concept', placeholder:'Concept name', submitText:'Create', onSubmit: async () => { calls++; throw new Error('Invalid'); }});
  modal.contentEl = new El();
  modal.close = () => { modal.closed = true; };
  modal.onOpen();
  const form = modal.contentEl.children[1];
  await form.handlers.submit({preventDefault() {}});
  await form.handlers.submit({preventDefault() {}});
  assert.equal(calls, 2);
  assert.equal(modal.closed, undefined);
  assert.equal(form.children[0].focused, true);
});
