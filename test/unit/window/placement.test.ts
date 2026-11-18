import { describe, expect, it } from 'vitest';
import { placement, type Placement } from '../../../src/features/window/placement';

const display = { left: 0, top: 0, width: 1920, height: 1040 };

function saved(
  ...[left, top, width, height, maximized = false]: [number, number, number, number, boolean?]
): Placement {
  return { left, top, width, height, maximized };
}

describe('window.placement', () => {
  it('opens 1,280 × 800 at 320, 120 at the first start on a display of 1,920 × 1,040', () => {
    expect(placement(undefined, [display])).toEqual(saved(320, 120, 1280, 800));
  });

  it('opens 1,280 × 728 at 43, 0 on a display of 1,366 × 728', () => {
    expect(placement(undefined, [{ left: 0, top: 0, width: 1366, height: 728 }])).toEqual(saved(43, 0, 1280, 728));
  });

  it('keeps a saved place that is on screen', () => {
    expect(placement(saved(100, 80, 1280, 800), [display])).toEqual(saved(100, 80, 1280, 800));
  });

  it('centers a window closed on a second display that is gone, with the size it had', () => {
    expect(placement(saved(2100, 120, 1400, 900), [display])).toEqual(saved(260, 70, 1400, 900));
  });

  it('centers a window with only 80 px of its width on screen', () => {
    expect(placement(saved(-1200, 50, 1280, 800), [display])).toEqual(saved(320, 120, 1280, 800));
  });

  it('keeps a window with 100 px of its width on screen where it was', () => {
    expect(placement(saved(-1180, 50, 1280, 800), [display])).toEqual(saved(-1180, 50, 1280, 800));
  });

  it('opens a saved size larger than the display as large as its work area, maximized as saved', () => {
    expect(placement(saved(2100, 120, 2400, 1300, true), [display])).toEqual(saved(0, 0, 1920, 1040, true));
  });

  it('gives the default for a saved size under 400 × 300', () => {
    expect(placement(saved(50, 50, 300, 200), [display])).toEqual(saved(320, 120, 1280, 800));
  });

  it('keeps the window on the display that holds most of it', () => {
    const second = { left: 1920, top: 0, width: 1920, height: 1040 };
    expect(placement(saved(1800, 100, 1000, 700), [display, second])).toEqual(saved(1800, 100, 1000, 700));
  });

  it('centers a window whose top bar is above the work area', () => {
    expect(placement(saved(100, -20, 1280, 800), [display])).toEqual(saved(320, 120, 1280, 800));
  });

  it('never makes the window smaller than 640 × 400', () => {
    expect(placement(saved(10, 10, 500, 350), [display])).toEqual(saved(10, 10, 640, 400));
  });

  it('gives the same result for the same inputs', () => {
    expect(placement(saved(5, 5, 900, 600), [display])).toEqual(placement(saved(5, 5, 900, 600), [display]));
  });
});
