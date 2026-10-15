import { describe, expect, it } from "vitest";

import { getErrorMessage } from "../src/utils/errors";

describe("getErrorMessage", () => {
  it.each([
    ["an Error", new Error("boom"), "boom"],
    ["a message-shaped object", { message: "denied", code: "42501" }, "denied"],
    ["a string", "plain", "plain"],
  ])("reads %s", (_label, error, expected) => {
    expect(getErrorMessage(error, "fallback")).toBe(expected);
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["an empty string", ""],
    ["an empty message", new Error("")],
    ["an object without a message", { code: "X" }],
    ["a non-string message", { message: 42 }],
    ["a number", 42],
  ])("falls back for %s", (_label, error) => {
    expect(getErrorMessage(error, "fallback")).toBe("fallback");
  });
});
