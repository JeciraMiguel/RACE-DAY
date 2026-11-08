const dateFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export const formatDate = (iso: string) => dateFormat.format(new Date(iso));
export const formatDateTime = (iso: string) => dateTimeFormat.format(new Date(iso));

export function formatMoney(amount: number, currency = 'ZAR'): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
}

/** "01:02:03.500" (API TimeSpan) -> "1:02:03" or "2:03" when under an hour. */
export function formatDuration(timeSpan: string): string {
  const match = /^(?:(\d+)\.)?(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d+))?$/.exec(timeSpan);
  if (!match) return timeSpan;
  const hours = Number(match[1] ?? 0) * 24 + Number(match[2]);
  const mm = match[3];
  const ss = match[4];
  const fraction = match[5] ? `.${match[5].slice(0, 2)}` : '';
  return hours > 0 ? `${hours}:${mm}:${ss}${fraction}` : `${Number(mm)}:${ss}${fraction}`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
}

/** "07:30:00" (API TimeSpan) -> "07:30". */
export function formatTime(timeSpan: string): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(timeSpan);
  return match ? `${match[1]!.padStart(2, '0')}:${match[2]}` : timeSpan;
}

/** API TimeSpan -> milliseconds (NaN when it cannot be parsed). */
export function durationToMs(timeSpan: string): number {
  const match = /^(?:(\d+)\.)?(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d+))?$/.exec(timeSpan);
  if (!match) return NaN;
  const [, days, h, m, s, fraction] = match;
  const seconds = Number(days ?? 0) * 86400 + Number(h) * 3600 + Number(m) * 60 + Number(s);
  return seconds * 1000 + (fraction ? Math.round(Number(`0.${fraction}`) * 1000) : 0);
}

/** Time behind the leader: "+1:32" (or "+1:02:03"). */
export function formatGap(timeMs: number, leaderMs: number): string {
  const total = Math.max(Math.round((timeMs - leaderMs) / 1000), 0);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `+${h}:${String(m).padStart(2, '0')}:${ss}` : `+${m}:${ss}`;
}

/**
 * The API stores event dates exactly as organizers typed them (no time zone), so "now" for
 * comparisons and filters is the browser's local time in the same naive format.
 */
export function localNaiveNow(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** 1 -> "1st", 2 -> "2nd", 11 -> "11th", 22 -> "22nd". */
export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
}

/** ISO "2027-03-14T07:00:00" -> value for <input type="datetime-local"> ("2027-03-14T07:00"). */
export function toDateTimeLocal(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 16) : '';
}

/**
 * Finish times typed by organizers: "39:30", "1:02:03" or "00:39:30.5" -> "hh:mm:ss[.fff]" for the API.
 * Two parts are minutes:seconds. Returns null when the input is not a valid time.
 */
export function normalizeTimeSpan(input: string): string | null {
  const match = /^(?:(\d{1,2}):)?(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?$/.exec(input.trim());
  if (!match) return null;
  const [, h, m, s, fraction] = match;
  const minutes = Number(m);
  const seconds = Number(s);
  if (seconds > 59) return null;
  if (h !== undefined && minutes > 59) return null;

  let hours = Number(h ?? 0);
  let mins = minutes;
  if (h === undefined) {
    hours = Math.floor(minutes / 60);
    mins = minutes % 60;
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(hours)}:${pad(mins)}:${pad(seconds)}${fraction ? `.${fraction}` : ''}`;
}
