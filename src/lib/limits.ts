/**
 * How much a personal account and a team space can hold. Free for everyone; kept small on purpose
 * and raised as real usage shows what people need. A team space holds four times a personal account.
 */
export interface SpaceLimits {
  emails: number;
  templates: number;
  savedBlocks: number;
  /** Total size of uploaded pictures, in bytes. */
  imageBytes: number;
}

const MB = 1024 * 1024;

export const PERSONAL_LIMITS: SpaceLimits = { emails: 50, templates: 20, savedBlocks: 40, imageBytes: 25 * MB };

const TEAM_FACTOR = 4;
export const TEAM_LIMITS: SpaceLimits = {
  emails: PERSONAL_LIMITS.emails * TEAM_FACTOR,
  templates: PERSONAL_LIMITS.templates * TEAM_FACTOR,
  savedBlocks: PERSONAL_LIMITS.savedBlocks * TEAM_FACTOR,
  imageBytes: PERSONAL_LIMITS.imageBytes * TEAM_FACTOR,
};

export function limitsFor(team: boolean): SpaceLimits {
  return team ? TEAM_LIMITS : PERSONAL_LIMITS;
}

/**
 * How many AI requests one person can make per day (the day turns over at midnight UTC).
 * Every "Build it" and every follow-up message to the AI assistant is one request.
 */
export const AI_DAILY_LIMIT = 30;

/**
 * AI for visitors without an account. Switched on for the launch so people can try it straight
 * away, including on the backup address where nobody can sign in. Set to false to go back to
 * "sign in to use AI". The ceilings below are per day (midnight UTC) and are what keeps the bill
 * bounded: one browser, one network address (a whole office often shares one), and all guests
 * together. When the last one is reached the maintainer is told and guests are asked to sign in.
 */
export const GUEST_AI_ENABLED = true;
export const GUEST_AI_LIMITS = { perBrowser: 5, perNetwork: 20, total: 200 } as const;

/** "12.5 MB" (or "340 KB" for small amounts), for showing sizes to people. */
export function formatMb(bytes: number): string {
  if (bytes <= 0) return "0 MB";
  if (bytes < MB / 10) return `${Math.round(bytes / 1024)} KB`;
  const mb = bytes / MB;
  return `${mb >= 10 || Number.isInteger(mb) ? Math.round(mb) : mb.toFixed(1)} MB`;
}
