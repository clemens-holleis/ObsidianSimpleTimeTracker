import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('obsidian', () => {
  class MockModal {
    app: any;
    contentEl: HTMLElement;
    picked = false;
    callback: (v: boolean) => void = () => {};
    constructor(app: any) {
      this.app = app;
      this.contentEl = document.createElement('div');
    }
    open() { this.onOpen(); }
    close() { this.onClose(); }
    onOpen() {}
    onClose() { if (!this.picked) this.callback(false); }
  }

  class MockSetting {
    el: HTMLElement;
    constructor(containerEl: HTMLElement) {
      this.el = containerEl.createDiv();
    }
    setName(_: string) { return this; }
    setDesc(_: any) { return this; }
    addButton(cb: (b: any) => void) {
      const btnEl = this.el.createEl('button');
      let clickHandler: (() => void) | null = null;
      btnEl.addEventListener('click', () => clickHandler?.());
      const btn = {
        el: btnEl,
        setButtonText: vi.fn().mockReturnThis(),
        setCta: vi.fn().mockReturnThis(),
        onClick: vi.fn((fn: () => void) => { clickHandler = fn; return btn; }),
      };
      cb(btn);
      return this;
    }
  }

  return {
    App: class MockApp {},
    Modal: MockModal,
    Setting: MockSetting,
  };
});

import { ConfirmModal } from '../confirm-modal';

describe('ConfirmModal', () => {
  let app: any;

  beforeEach(() => {
    app = {};
    document.body.innerHTML = '';
  });

  it('calls callback with true when Ok is clicked', () => {
    const cb = vi.fn();
    const modal = new ConfirmModal(app, 'msg', cb);
    modal.open();
    modal.contentEl.querySelector('button')!.click();
    expect(cb).toHaveBeenCalledWith(true);
  });

  it('calls callback with false when Cancel is clicked', () => {
    const cb = vi.fn();
    const modal = new ConfirmModal(app, 'msg', cb);
    modal.open();
    modal.contentEl.querySelectorAll('button')[1].click();
    expect(cb).toHaveBeenCalledWith(false);
  });

  it('calls callback with false on close without picking', () => {
    const cb = vi.fn();
    const modal = new ConfirmModal(app, 'msg', cb);
    modal.open();
    modal.onClose();
    expect(cb).toHaveBeenCalledWith(false);
  });

  it('does not call callback again on close if already picked', () => {
    const cb = vi.fn();
    const modal = new ConfirmModal(app, 'msg', cb);
    modal.open();
    modal.contentEl.querySelector('button')!.click();
    expect(cb).toHaveBeenCalledTimes(1);
    modal.onClose();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('shows the message in contentEl', () => {
    const modal = new ConfirmModal(app, 'Test message', vi.fn());
    modal.open();
    expect(modal.contentEl.textContent).toContain('Test message');
  });
});
