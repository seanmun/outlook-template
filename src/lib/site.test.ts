import { describe, expect, it } from "vitest";
import { isAccountFreeHost } from "./site";

describe("addresses without accounts", () => {
  it("turns accounts off on vercel.app addresses only", () => {
    expect(isAccountFreeHost("outlook-template.vercel.app")).toBe(true);
    expect(isAccountFreeHost("Outlook-Template.vercel.app:443")).toBe(true);
    expect(isAccountFreeHost("outlook-template-git-main-someone.vercel.app")).toBe(true);
    expect(isAccountFreeHost("www.outlooksucks.email")).toBe(false);
    expect(isAccountFreeHost("outlooksucks.email")).toBe(false);
    expect(isAccountFreeHost("localhost:3000")).toBe(false);
    expect(isAccountFreeHost("vercel.app.evil.example")).toBe(false);
    expect(isAccountFreeHost(null)).toBe(false);
  });
});
