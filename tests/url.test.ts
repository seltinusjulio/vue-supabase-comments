import { describe, expect, it } from "vitest";

import { safeLinkUrl } from "../src/utils/url";

describe("safeLinkUrl", () => {
  it.each([
    ["https://x.example/doc.pdf", "https://x.example/doc.pdf"],
    ["http://x.example/a", "http://x.example/a"],
    ["  https://x.example/a  ", "https://x.example/a"],
    ["/files/a.pdf", "/files/a.pdf"],
  ])("keeps %j", (value, expected) => {
    expect(safeLinkUrl(value)).toBe(expected);
  });

  it.each([
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    " javascript:alert(1)",
    "data:text/html;base64,PHNjcmlwdD4=",
    "vbscript:msgbox(1)",
    "//evil.example/a.pdf",
    "not a url",
    "",
  ])("rejects %j", (value) => {
    expect(safeLinkUrl(value)).toBeUndefined();
  });

  it("rejects missing values", () => {
    expect(safeLinkUrl(null)).toBeUndefined();
    expect(safeLinkUrl(undefined)).toBeUndefined();
  });
});
