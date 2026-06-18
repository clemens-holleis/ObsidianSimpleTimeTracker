import { vi } from 'vitest';

// Polyfill Array with Obsidian's custom methods
if (!Array.prototype.contains) {
  Array.prototype.contains = function <T>(this: T[], value: T): boolean {
    return this.indexOf(value) !== -1;
  };
}

if (!Array.prototype.remove) {
  Array.prototype.remove = function <T>(this: T[], value: T): void {
    const idx = this.indexOf(value);
    if (idx !== -1) this.splice(idx, 1);
  };
}

// Polyfill createFragment (Obsidian runtime global)
if (typeof globalThis.createFragment === 'undefined') {
  (globalThis as any).createFragment = (cb: (f: any) => void) => {
    const frag = document.createDocumentFragment();
    (frag as any).createSpan = (opts: any) => {
      const s = document.createElement('span');
      if (opts?.text) s.textContent = opts.text;
      frag.appendChild(s);
      return s;
    };
    (frag as any).createEl = (tag: string, opts: any) => {
      const el = document.createElement(tag);
      if (opts?.text) el.textContent = opts.text;
      if (opts?.href) el.setAttribute('href', opts.href);
      frag.appendChild(el);
      return el;
    };
    cb(frag);
    return frag;
  };
}

// Polyfill HTMLElement with Obsidian's custom DOM methods
const proto = HTMLElement.prototype as any;

if (!proto.addClass) {
  proto.addClass = function (cls: string) { this.classList.add(cls); return this; };
}
if (!proto.removeClass) {
  proto.removeClass = function (cls: string) { this.classList.remove(cls); return this; };
}
if (!proto.toggleClass) {
  proto.toggleClass = function (cls: string, value?: boolean) {
    if (value !== undefined) this.classList.toggle(cls, value);
    else this.classList.toggle(cls);
    return this;
  };
}
if (!proto.hasClass) {
  proto.hasClass = function (cls: string) { return this.classList.contains(cls); };
}
if (!proto.setText) {
  proto.setText = function (text: string) { this.textContent = text; return this; };
}
if (!proto.getText) {
  proto.getText = function () { return this.textContent || ''; };
}
if (!proto.show) {
  proto.show = function () { this.style.display = ''; return this; };
}
if (!proto.hide) {
  proto.hide = function () { this.style.display = 'none'; return this; };
}
if (!proto.empty) {
  proto.empty = function () { this.innerHTML = ''; return this; };
}
if (!proto.createEl) {
  proto.createEl = function (tag: string, options?: any) {
    const el = this.ownerDocument.createElement(tag);
    if (options) {
      if (options.cls) el.className = options.cls;
      if (options.text) el.textContent = options.text;
      if (options.attr) {
        for (const [k, v] of Object.entries(options.attr)) {
          el.setAttribute(k, String(v));
        }
      }
    }
    this.appendChild(el);
    return el;
  };
}
if (!proto.createDiv) {
  proto.createDiv = function (options?: any) { return this.createEl('div', options); };
}
if (!proto.createSpan) {
  proto.createSpan = function (options?: any) { return this.createEl('span', options); };
}
if (!proto.setAttr) {
  proto.setAttr = function (attr: string, value: any) { this.setAttribute(attr, value); return this; };
}

// Mock clipboard API
Object.defineProperty(navigator, 'clipboard', {
  value: { writeText: vi.fn(), readText: vi.fn() },
  configurable: true,
  writable: true,
});
