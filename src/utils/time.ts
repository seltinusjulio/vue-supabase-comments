import type { CommentMessages } from "../types";

export interface DateFormatOptions {
  /** BCP 47 locale(s) for dates, e.g. "id-ID". */
  locale?: string | string[];
  /** IANA time zone, e.g. "Asia/Jakarta"; the viewer's own zone by default. */
  timeZone?: string;
}

const toDate = (value: string | Date | null | undefined): Date | null => {
  if (!value) return null;
  const date = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(date.getTime()) ? null : date;
};

/** "1 Okt 2026" style date, or the placeholder for empty or invalid input. */
export function formatDate(
  value: string | Date | null | undefined,
  { locale, timeZone }: DateFormatOptions = {},
  placeholder = "",
): string {
  const date = toDate(value);
  if (!date) return placeholder;
  return date.toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone,
  });
}

/** Date with hours and minutes, or the placeholder for empty or invalid input. */
export function formatDateTime(
  value: string | Date | null | undefined,
  { locale, timeZone }: DateFormatOptions = {},
  placeholder = "",
): string {
  const date = toDate(value);
  if (!date) return placeholder;
  return date.toLocaleString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  });
}

/**
 * Short relative time ("3 jam lalu"), falling back to the absolute date once
 * it is a week or more in the past.
 */
export function formatRelativeTime(
  value: string | Date | null | undefined,
  now: Date,
  messages: CommentMessages["time"],
  options: DateFormatOptions = {},
  placeholder = "",
): string {
  const date = toDate(value);
  if (!date) return placeholder;

  const diffMins = Math.floor((now.getTime() - date.getTime()) / 60000);
  if (diffMins < 1) return messages.justNow;
  if (diffMins < 60) return messages.minutesAgo(diffMins);
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return messages.hoursAgo(diffHours);
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return messages.daysAgo(diffDays);
  return formatDate(date, options, placeholder);
}
