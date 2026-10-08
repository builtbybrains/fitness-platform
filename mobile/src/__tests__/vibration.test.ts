import { describe, expect, it, vi } from 'vitest';

import { VIBRATION, vibrationFromStored, webVibrate } from '../lib/vibration';

function phone(active = true) {
  return { vibrate: vi.fn(() => true), userActivation: { hasBeenActive: active } };
}

describe('webVibrate', () => {
  it('maps each haptic to its pattern', () => {
    const nav = phone();
    webVibrate('tap', nav);
    webVibrate('select', nav);
    webVibrate('success', nav);
    webVibrate('heavy', nav);
    expect(nav.vibrate.mock.calls).toEqual([[15], [10], [[20, 60, 35]], [30]]);
    expect(VIBRATION).toEqual({ tap: 15, select: 10, success: [20, 60, 35], heavy: 30 });
  });

  it('reports whether the browser took the call', () => {
    expect(webVibrate('tap', phone())).toBe(true);
    expect(webVibrate('tap', { vibrate: () => false })).toBe(false);
  });

  it('stays silent where vibrate does not exist (iOS Safari, desktop, no window)', () => {
    expect(webVibrate('tap', {})).toBe(false);
    expect(webVibrate('tap', undefined)).toBe(false);
  });

  it('waits for the first touch so the browser never blocks it', () => {
    const nav = phone(false);
    expect(webVibrate('heavy', nav)).toBe(false);
    expect(nav.vibrate).not.toHaveBeenCalled();
  });

  it('never throws when the browser does', () => {
    const nav = {
      vibrate: () => {
        throw new Error('blocked');
      },
    };
    expect(webVibrate('success', nav)).toBe(false);
  });
});

describe('vibrationFromStored', () => {
  it('is on unless it was turned off', () => {
    expect(vibrationFromStored(null)).toBe(true);
    expect(vibrationFromStored('1')).toBe(true);
    expect(vibrationFromStored('0')).toBe(false);
  });
});
