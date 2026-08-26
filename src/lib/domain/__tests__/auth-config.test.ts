import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bewindvoerderAllowlist, resolveAuthMode } from "@/lib/auth-config";

const KEYS = [
  "CLERK_SECRET_KEY",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "FRANK_BEWINDVOERDER_EMAILS",
] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("resolveAuthMode", () => {
  it("no Clerk keys → dev mode", () => {
    expect(resolveAuthMode()).toBe("dev");
  });

  it("both keys + allowlist → clerk mode", () => {
    process.env.CLERK_SECRET_KEY = "sk_test_x";
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test_x";
    process.env.FRANK_BEWINDVOERDER_EMAILS = "jeromeibanez95@gmail.com";
    expect(resolveAuthMode()).toBe("clerk");
  });

  it("secret key without publishable key → throws (fail fast)", () => {
    process.env.CLERK_SECRET_KEY = "sk_test_x";
    expect(() => resolveAuthMode()).toThrow(/Clerk misconfigured/);
  });

  it("publishable key without secret key → throws (fail fast)", () => {
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test_x";
    expect(() => resolveAuthMode()).toThrow(/Clerk misconfigured/);
  });

  it("clerk mode with empty allowlist → throws (unmanageable office)", () => {
    process.env.CLERK_SECRET_KEY = "sk_test_x";
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test_x";
    expect(() => resolveAuthMode()).toThrow(/FRANK_BEWINDVOERDER_EMAILS/);
  });

  it("clerk mode with whitespace-only allowlist → throws", () => {
    process.env.CLERK_SECRET_KEY = "sk_test_x";
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test_x";
    process.env.FRANK_BEWINDVOERDER_EMAILS = " , ,";
    expect(() => resolveAuthMode()).toThrow(/FRANK_BEWINDVOERDER_EMAILS/);
  });
});

describe("bewindvoerderAllowlist", () => {
  it("trims, lowercases, drops empties", () => {
    process.env.FRANK_BEWINDVOERDER_EMAILS = " A@B.nl ,, c@D.nl ";
    expect(bewindvoerderAllowlist()).toEqual(["a@b.nl", "c@d.nl"]);
  });
});
