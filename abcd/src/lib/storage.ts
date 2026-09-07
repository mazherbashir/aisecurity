/**
 * Safe Storage Management Utility
 * Protects against QuotaExceededError, corrupted localStorage data,
 * unbounded memory/storage growth, and prevents blank-screen UI crashes.
 */

export interface PersistedCommentEntry {
  groupId: string;
  baseGroupId?: string;
  type?: string;
  cweId?: string;
  identifier?: string;
  comments?: string;
  aiComment?: string;
  aiMetrics?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    engine?: string;
  };
  status?: 'approved' | 'rejected';
  isDevDependency?: boolean;
  crsComments?: string;
  updatedAt?: number;
}

export type PersistedCommentsStore = Record<string, {
  lastUpdated: number;
  comments: Record<string, PersistedCommentEntry>;
}>;

const STORAGE_KEYS = {
  COMMENTS: 'crs_persisted_comments',
  VERACODE_HISTORY: 'veracode_history',
  CHECKMARX_HISTORY: 'checkmarx_history',
  PREFERRED_AI_PROVIDER: 'preferred_ai_provider',
  HIDE_PROCESSED: 'hide_processed_findings',
  THEME: 'crs_theme_mode',
} as const;

const MAX_PROFILES_STORED = 20; // Keep at most 20 recent profiles in local cache
const MAX_COMMENTS_PER_PROFILE = 100; // Keep up to 100 comments per profile
const MAX_HISTORY_ENTRIES = 30; // Keep up to 30 history items

class SafeStorageManager {
  /**
   * Safe getter for localStorage items with JSON parsing and fallback
   */
  getItem<T>(key: string, defaultValue: T): T {
    try {
      if (typeof window === 'undefined' || !window.localStorage) {
        return defaultValue;
      }
      const raw = window.localStorage.getItem(key);
      if (raw === null || raw === undefined) {
        return defaultValue;
      }
      try {
        const parsed = JSON.parse(raw);
        return parsed !== null && parsed !== undefined ? (parsed as T) : defaultValue;
      } catch {
        // In case it's a raw string (like preferred_ai_provider)
        return (raw as unknown as T) || defaultValue;
      }
    } catch (e) {
      console.warn(`[SafeStorage] Error reading key "${key}":`, e);
      return defaultValue;
    }
  }

  /**
   * Safe setter for localStorage items with quota detection and auto-pruning
   */
  setItem<T>(key: string, value: T): boolean {
    try {
      if (typeof window === 'undefined' || !window.localStorage) {
        return false;
      }
      const serialized = typeof value === 'string' ? value : JSON.stringify(value);
      try {
        window.localStorage.setItem(key, serialized);
        return true;
      } catch (quotaError: any) {
        console.warn(`[SafeStorage] Storage write failed (possible quota limit for "${key}"). Triggering emergency pruning:`, quotaError);
        
        // Step 1: Emergency auto-pruning of old comments and histories
        this.pruneOldestComments(0.5);
        this.trimHistoryArrays();

        // Step 2: Retry write
        try {
          window.localStorage.setItem(key, serialized);
          return true;
        } catch (secondError) {
          console.warn(`[SafeStorage] Second attempt failed. Clearing legacy storage entries:`, secondError);
          // Step 3: Hard prune if still failing
          this.pruneOldestComments(0.8);
          try {
            window.localStorage.setItem(key, serialized);
            return true;
          } catch (fatalError) {
            console.error(`[SafeStorage] Critical storage quota exceeded. Operation ignored to prevent UI crash:`, fatalError);
            return false;
          }
        }
      }
    } catch (e) {
      console.error(`[SafeStorage] Unexpected error in setItem for "${key}":`, e);
      return false;
    }
  }

  /**
   * Safe removal of item
   */
  removeItem(key: string): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(key);
      }
    } catch (e) {
      console.warn(`[SafeStorage] Error removing key "${key}":`, e);
    }
  }

  /**
   * Helper to normalize a profile name for storage indexing
   */
  normalizeProfileKey(profileName: string): string {
    return (profileName || '').trim().toLowerCase();
  }

  /**
   * Get all persisted comments store safely
   */
  getPersistedCommentsStore(): PersistedCommentsStore {
    const raw = this.getItem<any>(STORAGE_KEYS.COMMENTS, {});
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return {};
    }

    // Migrate old format if needed (previously: { [profileName]: { [groupId]: entry } })
    const migrated: PersistedCommentsStore = {};
    const now = Date.now();

    Object.entries(raw).forEach(([key, val]: [string, any]) => {
      if (!val || typeof val !== 'object') return;

      const normKey = this.normalizeProfileKey(key);
      if (!normKey) return;

      // Check if it is the new structured format { lastUpdated, comments }
      if (val.comments && typeof val.comments === 'object' && !val.groupId) {
        migrated[normKey] = {
          lastUpdated: typeof val.lastUpdated === 'number' ? val.lastUpdated : now,
          comments: val.comments,
        };
      } else {
        // Old unstructured format
        if (!migrated[normKey]) {
          migrated[normKey] = {
            lastUpdated: now,
            comments: {},
          };
        }
        // If val itself contains entries
        Object.entries(val).forEach(([gId, gVal]: [string, any]) => {
          if (gVal && typeof gVal === 'object') {
            migrated[normKey].comments[gId] = gVal;
          }
        });
      }
    });

    return migrated;
  }

  /**
   * Save comments for a specific target profile with size limits and duplicate prevention
   */
  saveProfileComments(targetProfile: string, entries: PersistedCommentEntry[]): boolean {
    if (!targetProfile || !targetProfile.trim() || !Array.isArray(entries) || entries.length === 0) {
      return false;
    }

    try {
      const normKey = this.normalizeProfileKey(targetProfile);
      if (!normKey) return false;

      const store = this.getPersistedCommentsStore();
      const existingProfile = store[normKey] || { lastUpdated: Date.now(), comments: {} };
      let hasChanges = false;
      const now = Date.now();

      entries.forEach((entry) => {
        if (!entry || !entry.groupId) return;
        if (entry.aiComment || entry.status || entry.isDevDependency || entry.crsComments) {
          const baseGroupId = entry.groupId.split('-IDS-')[0];
          
          // Compact metrics to only essential numbers to save space
          const compactMetrics = entry.aiMetrics ? {
            inputTokens: typeof entry.aiMetrics.inputTokens === 'number' ? entry.aiMetrics.inputTokens : undefined,
            outputTokens: typeof entry.aiMetrics.outputTokens === 'number' ? entry.aiMetrics.outputTokens : undefined,
            totalTokens: typeof entry.aiMetrics.totalTokens === 'number' ? entry.aiMetrics.totalTokens : undefined,
            engine: typeof entry.aiMetrics.engine === 'string' ? entry.aiMetrics.engine : undefined,
          } : undefined;

          const cleanEntry: PersistedCommentEntry = {
            groupId: entry.groupId,
            baseGroupId: baseGroupId !== entry.groupId ? baseGroupId : undefined,
            type: entry.type,
            cweId: entry.cweId,
            identifier: entry.identifier,
            comments: entry.comments ? entry.comments.slice(0, 1000) : undefined,
            aiComment: entry.aiComment ? entry.aiComment.slice(0, 4000) : undefined,
            aiMetrics: compactMetrics,
            status: entry.status,
            isDevDependency: entry.isDevDependency,
            crsComments: entry.crsComments ? entry.crsComments.slice(0, 4000) : undefined,
            updatedAt: now,
          };

          existingProfile.comments[entry.groupId] = cleanEntry;
          if (baseGroupId && baseGroupId !== entry.groupId) {
            existingProfile.comments[baseGroupId] = cleanEntry;
          }
          hasChanges = true;
        }
      });

      if (!hasChanges) return false;

      // Limit comments per profile to prevent single-scan bloat
      const commentKeys = Object.keys(existingProfile.comments);
      if (commentKeys.length > MAX_COMMENTS_PER_PROFILE) {
        const excess = commentKeys.length - MAX_COMMENTS_PER_PROFILE;
        for (let i = 0; i < excess; i++) {
          delete existingProfile.comments[commentKeys[i]];
        }
      }

      existingProfile.lastUpdated = now;
      store[normKey] = existingProfile;

      // Limit number of stored profiles (LRU eviction)
      const profileEntries = Object.entries(store).sort((a, b) => b[1].lastUpdated - a[1].lastUpdated);
      if (profileEntries.length > MAX_PROFILES_STORED) {
        const prunedStore: PersistedCommentsStore = {};
        profileEntries.slice(0, MAX_PROFILES_STORED).forEach(([k, v]) => {
          prunedStore[k] = v;
        });
        return this.setItem(STORAGE_KEYS.COMMENTS, prunedStore);
      }

      return this.setItem(STORAGE_KEYS.COMMENTS, store);
    } catch (e) {
      console.warn('[SafeStorage] Failed to save profile comments safely:', e);
      return false;
    }
  }

  /**
   * Retrieve comments for a target profile
   */
  getProfileComments(targetProfile: string, scanSource?: 'json' | 'live' | null): Record<string, PersistedCommentEntry> {
    try {
      const store = this.getPersistedCommentsStore();
      const normKey = this.normalizeProfileKey(targetProfile);

      // Direct normalized match
      if (normKey && store[normKey]?.comments) {
        return store[normKey].comments;
      }

      // Try strip .json extension or add .json extension
      if (normKey) {
        const withoutExt = normKey.replace(/\.json$/i, '');
        if (store[withoutExt]?.comments) return store[withoutExt].comments;

        const withExt = `${withoutExt}.json`;
        if (store[withExt]?.comments) return store[withExt].comments;

        // Partial match fallback if string length is reasonable (> 3 chars to avoid false positives)
        if (normKey.length >= 4) {
          const matchedProfile = Object.keys(store).find(
            (k) => k === normKey || k.startsWith(normKey) || normKey.startsWith(k)
          );
          if (matchedProfile && store[matchedProfile]?.comments) {
            return store[matchedProfile].comments;
          }
        }
      }

      // Fallback for json drag-and-drop if only 1 profile exists
      if (scanSource === 'json') {
        const profileKeys = Object.keys(store);
        if (profileKeys.length > 0) {
          const sorted = profileKeys.sort((a, b) => (store[b]?.lastUpdated || 0) - (store[a]?.lastUpdated || 0));
          return store[sorted[0]]?.comments || {};
        }
      }

      return {};
    } catch (e) {
      console.warn('[SafeStorage] Error getting profile comments:', e);
      return {};
    }
  }

  /**
   * Clear comments for a specific profile or all profiles
   */
  clearProfileComments(targetProfile?: string): void {
    try {
      if (!targetProfile || !targetProfile.trim()) {
        this.removeItem(STORAGE_KEYS.COMMENTS);
        return;
      }
      const normKey = this.normalizeProfileKey(targetProfile);
      const store = this.getPersistedCommentsStore();
      
      const filtered: PersistedCommentsStore = {};
      Object.entries(store).forEach(([k, v]) => {
        if (k !== normKey && !k.includes(normKey) && !normKey.includes(k)) {
          filtered[k] = v;
        }
      });
      this.setItem(STORAGE_KEYS.COMMENTS, filtered);
    } catch (e) {
      console.warn('[SafeStorage] Error clearing profile comments:', e);
    }
  }

  /**
   * Prune oldest stored profiles to free up space
   */
  pruneOldestComments(ratioToKeep = 0.5): void {
    try {
      const store = this.getPersistedCommentsStore();
      const profileEntries = Object.entries(store).sort((a, b) => b[1].lastUpdated - a[1].lastUpdated);
      const keepCount = Math.max(1, Math.floor(profileEntries.length * ratioToKeep));
      
      const pruned: PersistedCommentsStore = {};
      profileEntries.slice(0, keepCount).forEach(([k, v]) => {
        // Also trim comments in kept profiles
        const commentKeys = Object.keys(v.comments).slice(0, 50);
        const trimmedComments: Record<string, PersistedCommentEntry> = {};
        commentKeys.forEach((cKey) => {
          trimmedComments[cKey] = v.comments[cKey];
        });
        pruned[k] = {
          lastUpdated: v.lastUpdated,
          comments: trimmedComments,
        };
      });

      window.localStorage.setItem(STORAGE_KEYS.COMMENTS, JSON.stringify(pruned));
    } catch (e) {
      console.warn('[SafeStorage] Emergency prune failed, wiping comments store:', e);
      try {
        window.localStorage.removeItem(STORAGE_KEYS.COMMENTS);
      } catch {}
    }
  }

  /**
   * Trim history arrays to prevent unbounded growth
   */
  trimHistoryArrays(): void {
    try {
      ['veracode_history', 'checkmarx_history'].forEach((key) => {
        const list = this.getItem<string[]>(key, []);
        if (Array.isArray(list) && list.length > MAX_HISTORY_ENTRIES) {
          const trimmed = list.slice(0, MAX_HISTORY_ENTRIES);
          this.setItem(key, trimmed);
        }
      });
    } catch (e) {
      console.warn('[SafeStorage] Error trimming history arrays:', e);
    }
  }

  /**
   * Get storage usage statistics
   */
  getStorageUsage(): {
    usedBytes: number;
    usedKb: string;
    profileCount: number;
    itemCount: number;
    isNearLimit: boolean;
  } {
    let totalBytes = 0;
    let itemCount = 0;
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        for (let i = 0; i < window.localStorage.length; i++) {
          const key = window.localStorage.key(i);
          if (key) {
            const val = window.localStorage.getItem(key) || '';
            totalBytes += (key.length + val.length) * 2; // UTF-16 bytes approx
            itemCount++;
          }
        }
      }
    } catch (e) {
      console.warn('[SafeStorage] Error calculating storage usage:', e);
    }

    const store = this.getPersistedCommentsStore();
    const profileCount = Object.keys(store).length;
    const usedKb = (totalBytes / 1024).toFixed(1);
    const isNearLimit = totalBytes > 3.5 * 1024 * 1024; // > 3.5 MB

    return {
      usedBytes: totalBytes,
      usedKb,
      profileCount,
      itemCount,
      isNearLimit,
    };
  }

  /**
   * Safe complete storage reset (preserves user provider preference and theme if requested)
   */
  clearAllStorage(preserveSettings = true): void {
    try {
      let aiProvider = 'Azure OpenAI';
      let hideProcessed = false;
      let theme: 'dark' | 'light' = 'dark';

      if (preserveSettings) {
        aiProvider = this.getItem(STORAGE_KEYS.PREFERRED_AI_PROVIDER, 'Azure OpenAI');
        hideProcessed = this.getItem(STORAGE_KEYS.HIDE_PROCESSED, false);
        theme = this.getItem(STORAGE_KEYS.THEME, 'dark');
      }

      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.clear();
      }

      if (preserveSettings) {
        this.setItem(STORAGE_KEYS.PREFERRED_AI_PROVIDER, aiProvider);
        this.setItem(STORAGE_KEYS.HIDE_PROCESSED, hideProcessed);
        this.setItem(STORAGE_KEYS.THEME, theme);
      }
    } catch (e) {
      console.error('[SafeStorage] Error clearing storage:', e);
    }
  }

  /**
   * Get user's preferred theme ('dark' | 'light')
   */
  getTheme(defaultTheme: 'dark' | 'light' = 'dark'): 'dark' | 'light' {
    const val = this.getItem<'dark' | 'light'>(STORAGE_KEYS.THEME, defaultTheme);
    return val === 'light' ? 'light' : 'dark';
  }

  /**
   * Persist user's theme selection to memory/storage
   */
  setTheme(theme: 'dark' | 'light'): boolean {
    return this.setItem(STORAGE_KEYS.THEME, theme === 'light' ? 'light' : 'dark');
  }

  /**
   * Startup sanitizer to protect against preexisting corruptions
   */
  sanitizeOnStartup(): void {
    try {
      // 1. Trim history lists
      this.trimHistoryArrays();

      // 2. Validate and migrate persisted comments
      const store = this.getPersistedCommentsStore();
      const keys = Object.keys(store);
      if (keys.length > MAX_PROFILES_STORED) {
        this.pruneOldestComments(0.6);
      }

      // 3. Check total size; if over 4MB, proactively prune
      const usage = this.getStorageUsage();
      if (usage.isNearLimit) {
        console.warn(`[SafeStorage] High storage usage detected on startup (${usage.usedKb} KB). Proactively pruning.`);
        this.pruneOldestComments(0.4);
      }
    } catch (e) {
      console.warn('[SafeStorage] Startup sanitization encountered an error:', e);
    }
  }
}

export const safeStorage = new SafeStorageManager();
