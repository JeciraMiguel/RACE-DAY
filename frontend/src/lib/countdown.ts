/** Remaining time split into days/hours/minutes/seconds. */
export function countdownParts(target: Date, now: Date) {
  const total = Math.max(Math.floor((target.getTime() - now.getTime()) / 1000), 0);
  return {
    done: total === 0,
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

