import { describe, it, expect } from 'vitest';
import { defaultSettings } from '../settings';
import type { SimpleTimeTrackerSettings } from '../settings';

describe('settings', () => {
  it('has all required properties with correct types', () => {
    const s: SimpleTimeTrackerSettings = defaultSettings;
    expect(typeof s.timestampFormat).toBe('string');
    expect(typeof s.editableTimestampFormat).toBe('string');
    expect(typeof s.csvDelimiter).toBe('string');
    expect(typeof s.fineGrainedDurations).toBe('boolean');
    expect(typeof s.reverseSegmentOrder).toBe('boolean');
    expect(typeof s.timestampDurations).toBe('boolean');
    expect(typeof s.showToday).toBe('boolean');
    expect(typeof s.useMonospacedFont).toBe('boolean');
  });

  it('has expected default values', () => {
    expect(defaultSettings.timestampFormat).toBe('YY-MM-DD HH:mm:ss');
    expect(defaultSettings.editableTimestampFormat).toBe('YYYY-MM-DD HH:mm:ss');
    expect(defaultSettings.csvDelimiter).toBe(',');
    expect(defaultSettings.fineGrainedDurations).toBe(true);
    expect(defaultSettings.reverseSegmentOrder).toBe(false);
    expect(defaultSettings.timestampDurations).toBe(false);
    expect(defaultSettings.showToday).toBe(false);
    expect(defaultSettings.useMonospacedFont).toBe(false);
  });
});
