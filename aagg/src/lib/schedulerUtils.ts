/**
 * Scheduler Dashboard Utility Functions
 * Converts and formats execution durations and processing speeds into minutes
 * so operators get clear, human-readable insight instead of raw milliseconds.
 */

export interface FormattedDurationMinutes {
  /** Formatted minute string with unit, e.g. "0.02 min" or "1.50 min" or "<0.01 min/tkt" */
  minutesValue: string;
  /** Human-friendly second or minute breakdown, e.g. "1.4s" or "1m 30s" or "0.3s/tkt" */
  subtext: string;
  /** Combined representation, e.g. "0.02 min (1.4s)" or "1.50 min (1m 30s)" */
  fullDisplay: string;
  /** Exact numeric value in minutes (ms / 60,000) */
  minutesNumber: number;
}

/**
 * Converts milliseconds into a minutes calculation with seconds subtext.
 * @param ms Duration in milliseconds
 * @param isSpeed Whether this is a processing speed per ticket (appends /tkt)
 */
export function formatDurationInMinutes(
  ms: number | undefined | null,
  isSpeed = false
): FormattedDurationMinutes {
  const safeMs = typeof ms === 'number' && !isNaN(ms) && ms >= 0 ? ms : 0;
  const suffix = isSpeed ? '/tkt' : '';
  const totalSeconds = safeMs / 1000;
  const minutesNumber = safeMs / 60000;

  let minutesValue: string;
  let subtext: string;

  if (safeMs >= 60000) {
    // 1 minute or longer: e.g. "1.50 min" & "(1m 30s)"
    minutesValue = `${minutesNumber.toFixed(2)} min${suffix}`;
    const m = Math.floor(totalSeconds / 60);
    const s = Math.round(totalSeconds % 60);
    subtext = `${m}m ${String(s).padStart(2, '0')}s${suffix}`;
  } else if (safeMs >= 1000) {
    // Between 1s and 60s: e.g. "0.02 min" & "(1.4s)"
    minutesValue = `${minutesNumber.toFixed(2)} min${suffix}`;
    const s = totalSeconds < 10 ? totalSeconds.toFixed(1) : Math.round(totalSeconds).toString();
    subtext = `${s}s${suffix}`;
  } else if (safeMs > 0) {
    // Under 1s: e.g. 285 ms -> "<0.01 min/tkt" & "(0.3s/tkt)"
    minutesValue = minutesNumber < 0.01 ? `<0.01 min${suffix}` : `${minutesNumber.toFixed(2)} min${suffix}`;
    const s = totalSeconds < 0.1 ? totalSeconds.toFixed(2) : totalSeconds.toFixed(1);
    subtext = `${s}s${suffix}`;
  } else {
    minutesValue = `0.00 min${suffix}`;
    subtext = `0s${suffix}`;
  }

  const fullDisplay = `${minutesValue} (${subtext})`;

  return {
    minutesValue,
    subtext,
    fullDisplay,
    minutesNumber,
  };
}

/**
 * Formats individual ticket speed/duration for table display in minutes and seconds
 */
export function formatTicketSpeed(ms: number | undefined | null): string {
  const safeMs = typeof ms === 'number' && !isNaN(ms) && ms >= 0 ? ms : 0;
  const minutes = safeMs / 60000;
  const totalSeconds = safeMs / 1000;

  if (safeMs >= 60000) {
    const m = Math.floor(totalSeconds / 60);
    const s = Math.round(totalSeconds % 60);
    return `${minutes.toFixed(2)} min (${m}m ${String(s).padStart(2, '0')}s)`;
  }
  if (safeMs >= 1000) {
    const s = totalSeconds < 10 ? totalSeconds.toFixed(1) : Math.round(totalSeconds).toString();
    return `${minutes.toFixed(2)} min (${s}s)`;
  }
  const s = totalSeconds.toFixed(1);
  return `<0.01 min (${s}s)`;
}

/**
 * Format countdown seconds into mm:ss
 */
export function formatCountdown(seconds: number | undefined): string {
  if (seconds === undefined || seconds < 0) return '00m 00s';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
}

/**
 * Format timestamp nicely
 */
export function formatTimestamp(isoStr: string | undefined | null): string {
  if (!isoStr) return '---';
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return isoStr;
  }
}
