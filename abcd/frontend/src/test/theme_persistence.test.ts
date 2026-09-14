import { describe, it, expect, beforeEach } from 'vitest';
import { safeStorage } from '../lib/storage';

describe('Theme Persistence and Management', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should default to dark theme when no preference is saved', () => {
    expect(safeStorage.getTheme()).toBe('dark');
  });

  it('should persist and retrieve light theme preference', () => {
    safeStorage.setTheme('light');
    expect(safeStorage.getTheme()).toBe('light');
    expect(localStorage.getItem('crs_theme_mode')).toBe('light');
  });

  it('should toggle back and persist dark theme preference', () => {
    safeStorage.setTheme('light');
    expect(safeStorage.getTheme()).toBe('light');

    safeStorage.setTheme('dark');
    expect(safeStorage.getTheme()).toBe('dark');
    expect(localStorage.getItem('crs_theme_mode')).toBe('dark');
  });

  it('should preserve theme preference when clearAllStorage is called with preserveSettings=true', () => {
    safeStorage.setTheme('light');
    expect(safeStorage.getTheme()).toBe('light');

    safeStorage.clearAllStorage(true);

    expect(safeStorage.getTheme()).toBe('light');
  });

  it('should reset theme when clearAllStorage is called with preserveSettings=false', () => {
    safeStorage.setTheme('light');
    expect(safeStorage.getTheme()).toBe('light');

    safeStorage.clearAllStorage(false);

    expect(safeStorage.getTheme()).toBe('dark');
  });
});
