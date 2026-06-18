import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockApp: any = {
  vault: {
    getAbstractFileByPath: vi.fn(),
    read: vi.fn(),
    cachedRead: vi.fn(),
    modify: vi.fn(),
    on: vi.fn().mockReturnValue({}),
  },
  metadataCache: {},
};

let mockCodeBlockHandler: ((source: string, el: HTMLElement, info: any) => void) | null = null;
let mockCommandHandler: ((editor: any) => void) | null = null;

vi.mock('obsidian', () => {
  const moment = require('moment');

  function createFragment(cb: (f: any) => void) {
    const frag = document.createDocumentFragment();
    (frag as any).createSpan = (opts: any) => { const s = document.createElement('span'); if (opts.text) s.textContent = opts.text; frag.appendChild(s); return s; };
    (frag as any).createEl = (tag: string, opts: any) => { const el = document.createElement(tag); if (opts.text) el.textContent = opts.text; if (opts.href) el.setAttribute('href', opts.href); frag.appendChild(el); return el; };
    cb(frag);
    return frag;
  }

  class MockSetting {
    el: HTMLElement;
    constructor(containerEl: HTMLElement) { this.el = containerEl.createDiv(); }
    setName(_: string) { return this; }
    setDesc(_: any) { return this; }
    addText(cb: (t: any) => void) { cb({ setValue: vi.fn().mockReturnThis(), getValue: () => '', onChange: vi.fn().mockReturnThis() }); return this; }
    addToggle(cb: (t: any) => void) { cb({ setValue: vi.fn().mockReturnThis(), getValue: () => false, onChange: vi.fn().mockReturnThis() }); return this; }
    addButton(cb: (b: any) => void) {
      const btn = { setButtonText: vi.fn().mockReturnThis(), setCta: vi.fn().mockReturnThis(), onClick: vi.fn((fn: () => void) => fn()) };
      cb(btn);
      return this;
    }
  }

  class MockSettingGroup {
    constructor(_: HTMLElement) {}
    addSetting(cb: (s: any) => void) { cb(new MockSetting(document.createElement('div'))); return this; }
  }

  class MockPlugin {
    app: any; settings: any;
    constructor(app: any) { this.app = app; }
    loadData() { return Promise.resolve(null); }
    saveData(_: any) { return Promise.resolve(); }
    addSettingTab(_: any) {}
    registerMarkdownCodeBlockProcessor(type: string, handler: any) { if (type === 'simple-time-tracker') mockCodeBlockHandler = handler; }
    addCommand(cmd: any) { if (cmd.editorCallback) mockCommandHandler = cmd.editorCallback; }
  }

  class MockMarkdownRenderChild {
    registerEvent(_: any) {} addChild(_: any) {}
  }

  class MockComponent {
    registerEvent(_: any) {}
  }

  return {
    moment,
    Plugin: MockPlugin,
    MarkdownRenderChild: MockMarkdownRenderChild,
    Component: MockComponent,
    PluginSettingTab: class {
      app: any; plugin: any; containerEl: HTMLElement;
      constructor(app: any, plugin: any) { this.app = app; this.plugin = plugin; this.containerEl = document.createElement('div'); }
    },
    Setting: MockSetting,
    SettingGroup: MockSettingGroup,
    MarkdownRenderer: { render: vi.fn().mockResolvedValue(undefined) },
    ButtonComponent: class {
      buttonEl: HTMLButtonElement;
      constructor(c: HTMLElement) { this.buttonEl = c.createEl('button'); }
      setClass() { return this; } setIcon() { return this; } setTooltip() { return this; }
      setButtonText(t: string) { this.buttonEl.textContent = t; return this; }
      setDisabled() { return this; } setCta() { return this; }
      onClick(cb: () => any) { this.buttonEl.addEventListener('click', cb); return this; }
    },
    TextComponent: class {
      inputEl: HTMLInputElement; private _v = '';
      constructor(c: HTMLElement) { this.inputEl = c.createEl('input'); this.inputEl.type = 'text'; }
      setPlaceholder(_: string) { return this; } setDisabled(_: boolean) { return this; }
      setValue(v: string) { this._v = v; this.inputEl.value = v; return this; }
      getValue() { return this._v; } onChange(_: any) { return this; }
    },
    App: class {},
    Modal: class {
      app: any; contentEl: HTMLElement; picked = false; callback: (v: boolean) => void = () => {};
      constructor(app: any) { this.app = app; this.contentEl = document.createElement('div'); }
      open() { this.onOpen(); } close() { this.onClose(); }
      onOpen() {} onClose() { if (!this.picked) this.callback(false); }
    },
    TFile: class {},
    createFragment,
  };
});

import SimpleTimeTrackerPlugin from '../main';
import { defaultSettings } from '../settings';

describe('SimpleTimeTrackerPlugin', () => {
  let plugin: SimpleTimeTrackerPlugin;

  beforeEach(async () => {
    mockCodeBlockHandler = null;
    mockCommandHandler = null;
    plugin = new SimpleTimeTrackerPlugin(mockApp as any, {} as any);
    await plugin.onload();
  });

  it('loads settings with defaults', () => {
    expect(plugin.settings).toBeDefined();
    expect(plugin.settings.timestampFormat).toBe(defaultSettings.timestampFormat);
  });

  it('exposes public API with all expected functions', () => {
    const api = plugin.api;
    expect(api.loadTracker).toBeTypeOf('function');
    expect(api.getDuration).toBeTypeOf('function');
    expect(api.getTotalDuration).toBeTypeOf('function');
    expect(api.getDurationToday).toBeTypeOf('function');
    expect(api.getTotalDurationToday).toBeTypeOf('function');
    expect(api.getRunningEntry).toBeTypeOf('function');
    expect(api.isRunning).toBeTypeOf('function');
    expect(api.getTotalDurationDate).toBeTypeOf('function');
    expect(api.loadAllTrackers).toBeTypeOf('function');
    expect(api.formatTimestamp).toBeTypeOf('function');
    expect(api.formatDuration).toBeTypeOf('function');
    expect(api.orderedEntries).toBeTypeOf('function');
  });

  it('registers markdown code block processor', () => {
    expect(mockCodeBlockHandler).not.toBeNull();
  });

  it('registers insert command', () => {
    expect(mockCommandHandler).not.toBeNull();
  });

  it('insert command replaces selection', () => {
    const editor = { replaceSelection: vi.fn() };
    mockCommandHandler!(editor as any);
    expect(editor.replaceSelection).toHaveBeenCalledWith("```simple-time-tracker\n```\n");
  });

  it('handles rename events', () => {
    const el = document.createElement('div');
    mockCodeBlockHandler!('{"entries":[]}', el, { sourcePath: 'old.md', getSectionInfo: () => ({ lineStart: 0, lineEnd: 2 }), addChild: vi.fn() });
    expect(mockApp.vault.on).toHaveBeenCalledWith('rename', expect.any(Function));
  });

  it('saveSettings persists data', async () => {
    const spy = vi.spyOn(plugin, 'saveData');
    plugin.settings.timestampFormat = 'YYYY-MM-DD';
    await plugin.saveSettings();
    expect(spy).toHaveBeenCalledWith(plugin.settings);
  });

  it('loadSettings merges with defaults', async () => {
    vi.spyOn(plugin, 'loadData').mockResolvedValue({ timestampFormat: 'YYYY' });
    await plugin.loadSettings();
    expect(plugin.settings.timestampFormat).toBe('YYYY');
    expect(plugin.settings.fineGrainedDurations).toBe(true);
  });

  it('api bound functions use plugin settings', () => {
    expect(typeof plugin.api.formatDuration(3600000)).toBe('string');
  });
});
