const { Modal, Notice } = require('obsidian');

class NameModal extends Modal {
  constructor(app, { title, placeholder, submitText, onSubmit, initialValue = '', required = true }) {
    super(app);
    this.options = { title, placeholder, submitText, onSubmit, initialValue, required };
    this.submitting = false;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: this.options.title });
    const form = contentEl.createEl('form', { cls: 'buches-name-form' });
    const input = form.createEl('input', { type: 'text', placeholder: this.options.placeholder });
    input.setAttribute('aria-label', this.options.placeholder);
    input.required = this.options.required;
    input.value = this.options.initialValue;
    const actions = form.createDiv({ cls: 'buches-modal-actions' });
    const cancel = actions.createEl('button', { text: 'Cancel', type: 'button' });
    cancel.addEventListener('click', () => this.close());
    const submit = actions.createEl('button', { text: this.options.submitText, type: 'submit', cls: 'mod-cta' });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (this.submitting) return;
      this.submitting = true;
      submit.disabled = true;
      try {
        await this.options.onSubmit(input.value);
        this.close();
      } catch (error) {
        new Notice(error instanceof Error ? error.message : String(error));
        input.focus();
      } finally {
        this.submitting = false;
        submit.disabled = false;
      }
    });
    input.focus();
  }
  onClose() { this.contentEl.empty(); }
}
module.exports = { NameModal };
