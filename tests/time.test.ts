import { describe, expect, it } from "vitest";

import { id } from "../src/locales";
import {
  formatDate,
  formatDateTime,
  formatRelativeTime,
} from "../src/utils/time";

const NOW = new Date("2026-10-15T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const MIN = 60_000;

describe("formatRelativeTime", () => {
  it.each([
    [ago(30_000), "Baru saja"],
    [ago(5 * MIN), "5 menit lalu"],
    [ago(3 * 60 * MIN), "3 jam lalu"],
    [ago(2 * 24 * 60 * MIN), "2 hari lalu"],
  ])("formats %s as %j", (value, expected) => {
    expect(formatRelativeTime(value, NOW, id.time)).toBe(expected);
  });

  it("falls back to the absolute date after a week", () => {
    const value = ago(10 * 24 * 60 * MIN);
    const options = { locale: "id-ID", timeZone: "Asia/Jakarta" };

    expect(formatRelativeTime(value, NOW, id.time, options)).toBe(
      formatDate(value, options),
    );
  });

  it("returns the placeholder for empty or invalid dates", () => {
    expect(formatRelativeTime(null, NOW, id.time, {}, "—")).toBe("—");
    expect(formatRelativeTime("nope", NOW, id.time)).toBe("");
  });
});

describe("formatDate / formatDateTime", () => {
  it("honours the locale and time zone", () => {
    // 23:30 UTC is already the next day in Jakarta (UTC+7).
    const value = "2026-10-01T23:30:00Z";

    expect(formatDate(value, { locale: "en-US", timeZone: "UTC" })).toBe(
      "Oct 1, 2026",
    );
    expect(
      formatDate(value, { locale: "en-US", timeZone: "Asia/Jakarta" }),
    ).toBe("Oct 2, 2026");
    expect(
      formatDateTime(value, { locale: "en-US", timeZone: "UTC" }),
    ).toContain("11:30");
  });

  it("accepts Date objects and returns the placeholder for invalid input", () => {
    expect(
      formatDate(new Date("2026-01-05T00:00:00Z"), { timeZone: "UTC" }),
    ).not.toBe("");
    expect(formatDate(undefined, {}, "—")).toBe("—");
    expect(formatDateTime("bad", {}, "—")).toBe("—");
  });
});
