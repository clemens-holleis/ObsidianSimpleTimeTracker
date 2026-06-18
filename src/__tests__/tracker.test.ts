import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('obsidian', () => {
  const moment = require('moment');

  class MockApp {}
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
        el: btnEl, setButtonText: () => btn, setCta: () => btn,
        onClick: (fn: () => void) => { clickHandler = fn; return btn; },
      };
      cb(btn);
      return this;
    }
  }

  return {
    moment,
    App: MockApp,
    Modal: MockModal,
    Setting: MockSetting,
    MarkdownSectionInformation: class {},
    TFile: class {},
    Component: class {
      registerEvent() {}
    },
    MarkdownRenderChild: class {
      registerEvent() {}
    },
    ButtonComponent: class {
      buttonEl: HTMLButtonElement;
      constructor(c: HTMLElement) { this.buttonEl = c.createEl('button'); }
      setClass() { return this; }
      setIcon() { return this; }
      setTooltip() { return this; }
      setButtonText(t: string) { this.buttonEl.textContent = t; return this; }
      setDisabled() { return this; }
      setCta() { return this; }
      onClick(cb: () => any) { this.buttonEl.addEventListener('click', cb); return this; }
    },
    TextComponent: class {
      inputEl: HTMLInputElement;
      private _v = '';
      constructor(c: HTMLElement) { this.inputEl = c.createEl('input'); this.inputEl.type = 'text'; }
      setPlaceholder(_: string) { return this; }
      setDisabled(_: boolean) { return this; }
      setValue(v: string) { this._v = v; this.inputEl.value = v; return this; }
      getValue() { return this._v; }
      onChange(_: (v: string) => void) { return this; }
    },
    MarkdownRenderer: { render: vi.fn().mockResolvedValue(undefined) },
  };
});

import moment from 'moment';
import type { Entry, Tracker } from '../tracker';
import {
  loadTracker,
  getDuration,
  getDurationDate,
  getDurationToday,
  getTotalDuration,
  getTotalDurationDate,
  getTotalDurationToday,
  isRunning,
  getRunningEntry,
  createMarkdownTable,
  createCsv,
  orderedEntries,
  formatTimestamp,
  formatDuration,
  startNewEntry,
  endRunningEntry,
  startSubEntry,
  removeEntry,
  createTableSection,
  EditableField,
  EditableTimestampField,
} from '../tracker';
import { defaultSettings } from '../settings';

function makeEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    name: 'Test',
    startTime: '2024-06-15T10:00:00.000Z',
    endTime: '2024-06-15T11:30:00.000Z',
    ...overrides,
  };
}

const settings = defaultSettings;

describe('loadTracker', () => {
  it('parses valid JSON', () => {
    expect(loadTracker(JSON.stringify({ entries: [{ name: 'A', startTime: '2024-01-01T00:00:00.000Z', endTime: null }] })).entries[0].name).toBe('A');
  });

  it('returns empty for empty string', () => {
    const result = loadTracker('');
    expect(result).toEqual({ entries: [] });
  });

  it('returns empty for invalid JSON', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = loadTracker('not-json');
    expect(result).toEqual({ entries: [] });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('returns empty for null/undefined', () => {
    expect(loadTracker(null as any)).toEqual({ entries: [] });
    expect(loadTracker(undefined as any)).toEqual({ entries: [] });
  });

  it('migrates legacy unix timestamps', () => {
    const r = loadTracker(JSON.stringify({ entries: [{ name: 'Old', startTime: '1718460000', endTime: '1718463600' }] }));
    expect(r.entries[0].startTime).toContain('2024');
    expect(r.entries[0].endTime).toContain('2024');
  });

  it('converts empty/null subEntries to undefined', () => {
    expect(loadTracker(JSON.stringify({ entries: [{ name: 'A', startTime: '2024-01-01T00:00:00.000Z', endTime: '2024-01-01T01:00:00.000Z', subEntries: [] }] })).entries[0].subEntries).toBeUndefined();
    expect(loadTracker(JSON.stringify({ entries: [{ name: 'A', startTime: '2024-01-01T00:00:00.000Z', endTime: '2024-01-01T01:00:00.000Z', subEntries: null }] })).entries[0].subEntries).toBeUndefined();
  });

  it('preserves valid subEntries', () => {
    const r = loadTracker(JSON.stringify({ entries: [{ name: 'A', startTime: null, endTime: null, subEntries: [{ name: 'Sub', startTime: '2024-01-01T00:00:00.000Z', endTime: '2024-01-01T01:00:00.000Z' }] }] }));
    expect(r.entries[0].subEntries).toHaveLength(1);
  });
});

describe('getDuration', () => {
  it('returns ms for completed entry', () => {
    expect(getDuration(makeEntry({ startTime: '2024-06-15T10:00:00.000Z', endTime: '2024-06-15T11:30:00.000Z' }))).toBe(90 * 60 * 1000);
  });

  it('returns positive for running entry', () => {
    vi.useFakeTimers();
    vi.setSystemTime(moment('2024-06-15T12:00:00.000Z').valueOf());
    expect(getDuration(makeEntry({ startTime: '2024-06-15T10:00:00.000Z', endTime: null as any }))).toBe(2 * 60 * 60 * 1000);
    vi.useRealTimers();
  });

  it('returns 0 for entry without startTime', () => {
    expect(getDuration(makeEntry({ startTime: null as any }))).toBe(0);
  });

  it('aggregates sub-entries', () => {
    expect(getDuration(makeEntry({ startTime: null as any, endTime: null as any, subEntries: [
      { name: 'P1', startTime: '2024-06-15T10:00:00.000Z', endTime: '2024-06-15T11:00:00.000Z' },
      { name: 'P2', startTime: '2024-06-15T11:00:00.000Z', endTime: '2024-06-15T12:00:00.000Z' },
    ] }))).toBe(2 * 60 * 60 * 1000);
  });
});

describe('getDurationDate', () => {
  it('returns full duration within date', () => {
    expect(getDurationDate(makeEntry({ startTime: '2024-06-15T10:00:00.000Z', endTime: '2024-06-15T11:00:00.000Z' }), '2024-06-15')).toBe(60 * 60 * 1000);
  });

  it('returns 0 when no overlap', () => {
    expect(getDurationDate(makeEntry({ startTime: '2024-06-15T10:00:00.000Z', endTime: '2024-06-15T11:00:00.000Z' }), '2024-06-16')).toBe(0);
  });

  it('trims start to target day', () => {
    expect(getDurationDate(makeEntry({ startTime: '2024-06-14T22:00:00.000Z', endTime: '2024-06-15T02:00:00.000Z' }), '2024-06-15')).toBe(2 * 60 * 60 * 1000);
  });

  it('trims end to target day', () => {
    expect(getDurationDate(makeEntry({ startTime: '2024-06-15T22:00:00.000Z', endTime: '2024-06-16T02:00:00.000Z' }), '2024-06-15')).toBe(2 * 60 * 60 * 1000);
  });

  it('trims both sides for multi-day entry', () => {
    const result = getDurationDate(makeEntry({ startTime: '2024-06-15T06:00:00.000Z', endTime: '2024-06-16T22:00:00.000Z' }), '2024-06-15');
    expect(result).toBeGreaterThanOrEqual(17.9 * 60 * 60 * 1000);
    expect(result).toBeLessThanOrEqual(18 * 60 * 60 * 1000);
  });

  it('delegates to getTotalDurationDate for sub-entries', () => {
    expect(getDurationDate(makeEntry({ startTime: null as any, endTime: null as any, subEntries: [
      { name: 'P1', startTime: '2024-06-15T10:00:00.000Z', endTime: '2024-06-15T11:00:00.000Z' },
    ] }), '2024-06-15')).toBe(60 * 60 * 1000);
  });

  it('handles running entry', () => {
    vi.useFakeTimers();
    vi.setSystemTime(moment('2024-06-15T14:00:00.000Z').valueOf());
    expect(getDurationDate(makeEntry({ startTime: '2024-06-15T10:00:00.000Z', endTime: null as any }), '2024-06-15')).toBe(4 * 60 * 60 * 1000);
    vi.useRealTimers();
  });

  it('returns 0 when no startTime', () => {
    expect(getDurationDate(makeEntry({ startTime: null as any }), '2024-06-15')).toBe(0);
  });
});

describe('getDurationToday', () => {
  it('uses today', () => {
    vi.useFakeTimers();
    const today = moment().format('YYYY-MM-DD');
    expect(getDurationToday(makeEntry({ startTime: `${today}T10:00:00.000Z`, endTime: `${today}T11:00:00.000Z` }))).toBe(60 * 60 * 1000);
    vi.useRealTimers();
  });
});

describe('Total duration helpers', () => {
  const a = makeEntry({ name: 'A', startTime: '2024-06-15T10:00:00.000Z', endTime: '2024-06-15T11:00:00.000Z' });
  const b = makeEntry({ name: 'B', startTime: '2024-06-15T11:00:00.000Z', endTime: '2024-06-15T12:30:00.000Z' });

  it('getTotalDuration sums', () => {
    expect(getTotalDuration([a, b])).toBe(2.5 * 60 * 60 * 1000);
  });

  it('getTotalDuration empty', () => {
    expect(getTotalDuration([])).toBe(0);
  });

  it('getTotalDurationDate sums for date', () => {
    expect(getTotalDurationDate([a, b], '2024-06-15')).toBe(2.5 * 60 * 60 * 1000);
  });

  it('getTotalDurationToday sums today', () => {
    vi.useFakeTimers();
    const today = moment().format('YYYY-MM-DD');
    expect(getTotalDurationToday([makeEntry({ startTime: `${today}T10:00:00.000Z`, endTime: `${today}T11:00:00.000Z` })])).toBe(60 * 60 * 1000);
    vi.useRealTimers();
  });
});

describe('isRunning / getRunningEntry', () => {
  it('isRunning false for empty tracker', () => { expect(isRunning({ entries: [] })).toBe(false); });
  it('isRunning false for completed entries', () => { expect(isRunning({ entries: [makeEntry()] })).toBe(false); });
  it('isRunning true when entry has no endTime', () => { expect(isRunning({ entries: [makeEntry({ endTime: null as any })] })).toBe(true); });
  it('isRunning true when sub-entry is running', () => {
    expect(isRunning({ entries: [{ name: 'A', startTime: null as any, endTime: null as any, subEntries: [{ name: 'Sub', startTime: '2024-01-01T00:00:00.000Z', endTime: null as any }] }] })).toBe(true);
  });

  it('getRunningEntry null for empty', () => { expect(getRunningEntry([])).toBeNull(); });
  it('getRunningEntry null for completed', () => { expect(getRunningEntry([makeEntry()])).toBeNull(); });
  it('getRunningEntry finds running', () => { expect(getRunningEntry([makeEntry({ name: 'A', endTime: null as any }), makeEntry({ name: 'B' })])?.name).toBe('A'); });
  it('getRunningEntry finds nested running', () => {
    expect(getRunningEntry([{ name: 'A', startTime: null as any, endTime: null as any, subEntries: [{ name: 'Sub', startTime: 'x', endTime: null as any }] }])?.name).toBe('Sub');
  });
  it('getRunningEntry null for nested completed', () => {
    expect(getRunningEntry([{ name: 'A', startTime: null as any, endTime: null as any, subEntries: [{ name: 'Sub', startTime: 'x', endTime: 'y' }] }])).toBeNull();
  });
});

describe('orderedEntries', () => {
  it('returns in order', () => {
    const e = [{ name: 'A', startTime: '', endTime: '' }, { name: 'B', startTime: '', endTime: '' }];
    expect(orderedEntries(e, { ...settings, reverseSegmentOrder: false })[0].name).toBe('A');
  });
  it('reverses', () => {
    const e = [{ name: 'A', startTime: '', endTime: '' }, { name: 'B', startTime: '', endTime: '' }];
    expect(orderedEntries(e, { ...settings, reverseSegmentOrder: true })[0].name).toBe('B');
  });
  it('does not mutate', () => {
    const e = [{ name: 'A', startTime: '', endTime: '' }, { name: 'B', startTime: '', endTime: '' }];
    orderedEntries(e, { ...settings, reverseSegmentOrder: true });
    expect(e[0].name).toBe('A');
  });
});

describe('formatTimestamp', () => {
  it('formats with default', () => { expect(formatTimestamp('2024-06-15T14:30:00.000Z', settings)).toMatch(/\d{2}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/); });
  it('formats with custom', () => { expect(formatTimestamp('2024-06-15T14:30:00.000Z', { ...settings, timestampFormat: 'YYYY-MM-DD' })).toBe('2024-06-15'); });
});

describe('formatDuration', () => {
  it('default fineGrained', () => { expect(formatDuration(90 * 60 * 1000 + 5000, settings)).toBe('1h 30m 5s'); });
  it('fineGrained false', () => { expect(formatDuration(25 * 60 * 60 * 1000, { ...settings, fineGrainedDurations: false })).toBe('25h 0s'); });
  it('timestampDurations', () => { expect(formatDuration(90 * 60 * 1000, { ...settings, timestampDurations: true })).toBe('01:30:00'); });
  it('timestampDurations + fineGrained multi-day', () => { expect(formatDuration(25 * 60 * 60 * 1000, { ...settings, timestampDurations: true, fineGrainedDurations: true })).toBe('1.01:00:00'); });
  it('years months days', () => {
    const r = formatDuration(moment.duration({ years: 1, months: 2, days: 3, hours: 4, minutes: 5, seconds: 6 }).asMilliseconds(), settings);
    expect(r).toContain('1y'); expect(r).toContain('2M'); expect(r).toContain('2d');
  });
  it('zero', () => { expect(formatDuration(0, settings)).toBe('0s'); });
  it('only seconds', () => { expect(formatDuration(45 * 1000, settings)).toBe('45s'); });
  it('skips hours when zero', () => { expect(formatDuration(30 * 60 * 1000, settings)).toBe('30m 0s'); });
});

describe('createMarkdownTable', () => {
  it('generates table', () => {
    const r = createMarkdownTable({ entries: [{ name: 'A', startTime: '2024-06-15T10:00:00.000Z', endTime: '2024-06-15T11:00:00.000Z' }] }, settings);
    expect(r).toContain('| Segment'); expect(r).toContain('A'); expect(r).toContain('**Total**');
  });

  it('indents sub-entries', () => {
    expect(createMarkdownTable({ entries: [{ name: 'P', startTime: null as any, endTime: null as any, subEntries: [{ name: 'C', startTime: '2024-06-15T10:00:00.000Z', endTime: '2024-06-15T11:00:00.000Z' }] }] }, settings)).toContain('- C');
  });

  it('respects reverse order', () => {
    const r = createMarkdownTable({ entries: [
      { name: 'A', startTime: 'x', endTime: 'x' }, { name: 'B', startTime: 'x', endTime: 'x' },
    ]}, { ...settings, reverseSegmentOrder: true });
    expect(r.indexOf('B')).toBeLessThan(r.indexOf('A'));
  });

  it('handles template entries', () => {
    const r = createMarkdownTable({ entries: [{ name: 'T', startTime: null as any, endTime: null as any }] }, settings);
    expect(r).toContain('T'); expect(r).not.toContain('undefined');
  });

  it('has separator row', () => {
    expect(createMarkdownTable({ entries: [makeEntry()] }, settings).split('\n')[1]).toContain('---');
  });
});

describe('createCsv', () => {
  it('generates CSV', () => { const r = createCsv({ entries: [{ name: 'A', startTime: '2024-01-01T00:00:00.000Z', endTime: '2024-01-01T01:00:00.000Z' }] }, settings); expect(r).toContain('A'); expect(r).toContain('"'); });
  it('custom delimiter', () => { expect(createCsv({ entries: [makeEntry()] }, { ...settings, csvDelimiter: ';' })).toContain('";"'); });
  it('escapes quotes', () => { const r = createCsv({ entries: [{ name: 'A"B', startTime: 'x', endTime: 'x' }] }, settings); expect(r).toContain('A""B'); });
  it('empty', () => { expect(createCsv({ entries: [] }, settings)).toBe(''); });
});

describe('startNewEntry', () => {
  it('adds entry', () => {
    vi.useFakeTimers(); vi.setSystemTime(moment('2024-06-15T10:00:00.000Z').valueOf());
    const t: Tracker = { entries: [] }; startNewEntry(t, 'Seg');
    expect(t.entries[0].name).toBe('Seg'); expect(t.entries[0].endTime).toBeNull();
    vi.useRealTimers();
  });
  it('auto-names', () => {
    const t: Tracker = { entries: [{ name: 'A', startTime: 'x', endTime: 'x' }] }; startNewEntry(t, '');
    expect(t.entries[1].name).toBe('Segment 2');
  });
});

describe('endRunningEntry', () => {
  it('sets end time', () => {
    vi.useFakeTimers(); const now = moment('2024-06-15T12:00:00.000Z').valueOf(); vi.setSystemTime(now);
    const t: Tracker = { entries: [{ name: 'R', startTime: '2024-06-15T10:00:00.000Z', endTime: null as any }] };
    endRunningEntry(t);
    expect(moment(t.entries[0].endTime).valueOf()).toBe(now);
    vi.useRealTimers();
  });
});

describe('startSubEntry', () => {
  it('converts parent', () => {
    vi.useFakeTimers(); vi.setSystemTime(moment('2024-06-15T12:00:00.000Z').valueOf());
    const e: Entry = { name: 'M', startTime: '2024-06-15T10:00:00.000Z', endTime: '2024-06-15T11:00:00.000Z' };
    startSubEntry(e, 'Sub');
    expect(e.subEntries).toHaveLength(2); expect(e.startTime).toBeNull(); expect(e.endTime).toBeNull();
    vi.useRealTimers();
  });
  it('appends to existing', () => {
    vi.useFakeTimers(); vi.setSystemTime(moment('2024-06-15T13:00:00.000Z').valueOf());
    const e: Entry = { name: 'M', startTime: null as any, endTime: null as any, subEntries: [{ name: 'P1', startTime: 'x', endTime: 'y' }] };
    startSubEntry(e, '');
    expect(e.subEntries).toHaveLength(2); expect(e.subEntries![1].name).toBe('Part 2');
    vi.useRealTimers();
  });
});

describe('removeEntry', () => {
  it('removes from list', () => {
    const e: Entry[] = [{ name: 'A', startTime: 'x', endTime: 'x' }, { name: 'B', startTime: 'x', endTime: 'x' }];
    expect(removeEntry(e, e[0])).toBe(true); expect(e).toHaveLength(1); expect(e[0].name).toBe('B');
  });
  it('returns false if not found', () => {
    expect(removeEntry([{ name: 'A', startTime: 'x', endTime: 'x' }], { name: 'B', startTime: 'x', endTime: 'x' })).toBe(false);
  });
  it('merges single remaining sub-entry', () => {
    const e = [{ name: 'P', startTime: null as any, endTime: null as any, subEntries: [
      { name: 'P1', startTime: '2024-01-01T10:00:00.000Z', endTime: '2024-01-01T11:00:00.000Z' },
      { name: 'P2', startTime: '2024-01-01T11:00:00.000Z', endTime: '2024-01-01T12:00:00.000Z' },
    ] }];
    removeEntry(e, e[0].subEntries![1]);
    expect(e[0].subEntries).toBeUndefined(); expect(e[0].startTime).toBe('2024-01-01T10:00:00.000Z');
  });
  it('keeps multiple sub-entries', () => {
    const e = [{ name: 'P', startTime: null as any, endTime: null as any, subEntries: [
      { name: 'P1', startTime: 'x', endTime: 'y' }, { name: 'P2', startTime: 'x', endTime: 'y' }, { name: 'P3', startTime: 'x', endTime: 'y' },
    ] }];
    removeEntry(e, e[0].subEntries![2]);
    expect(e[0].subEntries).toHaveLength(2);
  });
});

describe('createTableSection', () => {
  it('generates row', () => {
    const r = createTableSection(makeEntry({ name: 'Test' }), settings);
    expect(r[0][0]).toBe(' Test'); expect(r[0][1]).toBeTruthy();
  });
  it('recurses sub-entries', () => {
    const r = createTableSection({ name: 'P', startTime: null as any, endTime: null as any, subEntries: [{ name: 'C', startTime: '2024-06-15T10:00:00.000Z', endTime: '2024-06-15T11:00:00.000Z' }] }, settings);
    expect(r).toHaveLength(2); expect(r[1][0]).toBe('- C');
  });
  it('handles template entry', () => {
    const r = createTableSection({ name: 'T', startTime: null as any, endTime: null as any }, settings);
    expect(r[0][1]).toBe(''); expect(r[0][2]).toBe(''); expect(r[0][3]).toBe('');
  });
  it('shows duration for sub-entry parent', () => {
    const r = createTableSection({ name: 'P', startTime: null as any, endTime: null as any, subEntries: [{ name: 'C', startTime: '2024-06-15T10:00:00.000Z', endTime: '2024-06-15T11:00:00.000Z' }] }, settings);
    expect(r[0][3]).toBeTruthy();
  });
});

describe('EditableField', () => {
  let row: HTMLTableRowElement;
  beforeEach(() => {
    document.body.innerHTML = '<table><tbody></tbody></table>';
    row = document.querySelector('tbody')!.createEl('tr') as HTMLTableRowElement;
  });

  it('creates cell with hidden input', () => {
    const f = new EditableField(row, 0, 'V');
    expect(f.cell).toBeTruthy(); expect(f.label.textContent).toBe('V'); expect(f.box.inputEl.style.display).toBe('none');
  });
  it('indents', () => { expect(new EditableField(row, 3, '').label.style.marginLeft).toBe('3em'); });
  it('editing false initially', () => { expect(new EditableField(row, 0, '').editing()).toBe(false); });
  it('beginEdit shows input', () => {
    const f = new EditableField(row, 0, 'Old');
    f.beginEdit('New');
    expect(f.label.hidden).toBe(true); expect(f.box.getValue()).toBe('New');
  });
  it('endEdit returns value', () => {
    const f = new EditableField(row, 0, 'Old');
    f.beginEdit('New');
    expect(f.endEdit()).toBe('New'); expect(f.label.textContent).toBe('New'); expect(f.label.hidden).toBe(false);
  });
  it('Enter triggers onSave', () => {
    const f = new EditableField(row, 0, 'T');
    const s = vi.fn();
    f.onSave = s; f.beginEdit('V');
    f.box.inputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(s).toHaveBeenCalled();
  });
  it('Escape triggers onCancel', () => {
    const f = new EditableField(row, 0, 'T');
    const c = vi.fn();
    f.onCancel = c; f.beginEdit('V');
    f.box.inputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(c).toHaveBeenCalled();
  });
  it('beginEdit focuses when requested', () => {
    const f = new EditableField(row, 0, 'T');
    const spy = vi.spyOn(f.box.inputEl, 'focus');
    f.beginEdit('V', true);
    expect(spy).toHaveBeenCalled();
  });
});

describe('EditableTimestampField', () => {
  let row: HTMLTableRowElement;
  beforeEach(() => {
    document.body.innerHTML = '<table><tbody></tbody></table>';
    row = document.querySelector('tbody')!.createEl('tr') as HTMLTableRowElement;
  });

  it('formats value on construction', () => {
    expect(new EditableTimestampField(row, '2024-06-15T14:30:00.000Z', settings).label.textContent).toMatch(/\d{2}-\d{2}-\d{2}/);
  });
  it('handles empty', () => { expect(new EditableTimestampField(row, null as any, settings).label.textContent).toBe(''); });
  it('beginEdit uses editable format', () => {
    const f = new EditableTimestampField(row, '2024-06-15T14:30:00.000Z', settings);
    f.beginEdit('2024-06-15T14:30:00.000Z');
    expect(f.box.getValue()).toMatch(/2024-06-15 \d{2}:30:00/);
  });
  it('endEdit formats back', () => {
    const f = new EditableTimestampField(row, '2024-06-15T14:30:00.000Z', settings);
    f.beginEdit('v'); f.endEdit();
    expect(f.label.textContent).toMatch(/Invalid|^\d{2}-\d{2}-\d{2}/);
  });
  it('endEdit handles empty', () => {
    const f = new EditableTimestampField(row, '2024-06-15T14:30:00.000Z', settings);
    f.beginEdit(''); f.endEdit();
    expect(f.label.textContent).toBe('');
  });
  it('getTimestamp returns ISO', () => {
    const f = new EditableTimestampField(row, null as any, settings);
    f.beginEdit(null as any); f.box.setValue('2024-06-15 14:30:00');
    expect(moment(f.getTimestamp()).isValid()).toBe(true);
  });
  it('getTimestamp null for empty', () => {
    const f = new EditableTimestampField(row, null as any, settings);
    f.beginEdit(null as any);
    expect(f.getTimestamp()).toBeNull();
  });
});
