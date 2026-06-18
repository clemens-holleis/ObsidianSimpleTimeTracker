import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPlugin = {
  settings: {
    timestampFormat: 'YY-MM-DD HH:mm:ss',
    editableTimestampFormat: 'YYYY-MM-DD HH:mm:ss',
    csvDelimiter: ',',
    fineGrainedDurations: true,
    reverseSegmentOrder: false,
    timestampDurations: false,
    showToday: false,
    useMonospacedFont: false,
  },
  saveSettings: vi.fn(),
};

let textComps: any[] = [];
let toggleComps: any[] = [];

vi.mock('obsidian', () => {
  const createFragment = (cb: (f: any) => void) => {
    const frag = document.createDocumentFragment();
    (frag as any).createSpan = (opts: any) => {
      const s = document.createElement('span');
      if (opts.text) s.textContent = opts.text;
      frag.appendChild(s);
      return s;
    };
    (frag as any).createEl = (tag: string, opts: any) => {
      const el = document.createElement(tag);
      if (opts.text) el.textContent = opts.text;
      if (opts.href) el.setAttribute('href', opts.href);
      frag.appendChild(el);
      return el;
    };
    cb(frag);
    return frag;
  };

  class MockTextComponent {
    private _v = '';
    private _onChange: ((v: string) => void) | null = null;
    setValue(v: string) { this._v = v; return this; }
    getValue() { return this._v; }
    onChange(cb: (v: string) => void) { this._onChange = cb; return this; }
    triggerChange(v: string) { this._v = v; this._onChange?.(v); }
  }

  class MockToggleComponent {
    private _v = false;
    private _onChange: ((v: boolean) => void) | null = null;
    setValue(v: boolean) { this._v = v; return this; }
    getValue() { return this._v; }
    onChange(cb: (v: boolean) => void) { this._onChange = cb; return this; }
    triggerToggle(v: boolean) { this._v = v; this._onChange?.(v); }
  }

  class MockSetting {
    el: HTMLElement;
    private nameEl: HTMLElement;
    constructor(containerEl: HTMLElement) {
      this.el = containerEl.createDiv();
      this.nameEl = this.el.createEl('div');
    }
    setName(name: string) { this.nameEl.textContent = name; return this; }
    setDesc(_: any) { return this; }
    addText(cb: (t: any) => void) {
      const tc = new MockTextComponent();
      textComps.push(tc);
      cb(tc);
      return this;
    }
    addToggle(cb: (t: any) => void) {
      const tc = new MockToggleComponent();
      toggleComps.push(tc);
      cb(tc);
      return this;
    }
    addButton(cb: (b: any) => void) {
      cb({ setButtonText: vi.fn().mockReturnThis(), setCta: vi.fn().mockReturnThis(), onClick: vi.fn((fn: () => void) => fn()) });
      return this;
    }
  }

  class MockSettingGroup {
    private containerEl: HTMLElement;
    constructor(containerEl: HTMLElement) {
      this.containerEl = containerEl;
    }
    addSetting(cb: (s: any) => void) {
      cb(new MockSetting(this.containerEl));
      return this;
    }
  }

  return {
    App: class {},
    PluginSettingTab: class {
      app: any; plugin: any; containerEl: HTMLElement;
      constructor(app: any, plugin: any) {
        this.app = app;
        this.plugin = plugin;
        this.containerEl = document.createElement('div');
      }
    },
    Setting: MockSetting,
    SettingGroup: MockSettingGroup,
    createFragment,
  };
});

import { SimpleTimeTrackerSettingsTab } from '../settings-tab';

describe('SimpleTimeTrackerSettingsTab', () => {
  let tab: SimpleTimeTrackerSettingsTab;

  beforeEach(() => {
    mockPlugin.saveSettings.mockReset();
    textComps = [];
    toggleComps = [];
    tab = new SimpleTimeTrackerSettingsTab({} as any, mockPlugin as any);
  });

  it('renders all setting elements', () => {
    tab.display();
    const html = tab.containerEl.innerHTML;
    expect(html).toContain('Timestamp Display Format');
    expect(html).toContain('CSV Delimiter');
    expect(html).toContain('Fine-Grained Durations');
    expect(html).toContain('Timestamp Durations');
    expect(html).toContain('Display Segments in Reverse Order');
    expect(html).toContain('Show Total Today');
    expect(html).toContain('Use Monospaced Font for Times');
  });

  it('renders support links', () => {
    tab.display();
    expect(tab.containerEl.innerHTML).toContain('Need help');
    expect(tab.containerEl.innerHTML).toContain('support its development');
  });

  it('updates plugin setting on text field change', () => {
    tab.display();
    if (textComps.length > 0) {
      textComps[0].triggerChange('HH:mm');
      expect(mockPlugin.settings.timestampFormat).toBe('HH:mm');
      expect(mockPlugin.saveSettings).toHaveBeenCalled();
    }
  });

  it('resets empty text field to default', () => {
    tab.display();
    if (textComps.length > 0) {
      const csvField = textComps[1];
      if (csvField) {
        csvField.triggerChange('');
        expect(mockPlugin.settings.csvDelimiter).toBe(',');
        expect(mockPlugin.saveSettings).toHaveBeenCalled();
      }
    }
  });

  it('updates plugin setting on toggle change', () => {
    tab.display();
    if (toggleComps.length > 0) {
      toggleComps[0].triggerToggle(false);
      expect(mockPlugin.settings.fineGrainedDurations).toBe(false);
      expect(mockPlugin.saveSettings).toHaveBeenCalled();
    }
  });
});
