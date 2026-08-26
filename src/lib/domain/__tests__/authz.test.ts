import { describe, expect, it } from "vitest";
import {
  canApproveBatch,
  canChangeActor,
  canPerform,
  type AuthzActor,
} from "../authz";

const bw = (id: string, active = true): AuthzActor => ({
  id,
  role: "bewindvoerder",
  active,
});
const asst = (id: string, active = true): AuthzActor => ({
  id,
  role: "assistent",
  active,
});

describe("canPerform", () => {
  it("allows an active bewindvoerder every privileged action", () => {
    for (const action of [
      "batch_approve",
      "batch_item_exclude",
      "batch_export",
      "machtiging_resolve",
      "letter_approve",
      "letter_mark_sent",
      "actor_manage",
    ] as const) {
      expect(canPerform(bw("a"), action)).toEqual({ allowed: true });
    }
  });

  it("refuses an assistent with role_required", () => {
    expect(canPerform(asst("a"), "batch_approve")).toEqual({
      allowed: false,
      reason: "role_required",
    });
  });

  it("refuses an inactive bewindvoerder with inactive_actor", () => {
    expect(canPerform(bw("a", false), "machtiging_resolve")).toEqual({
      allowed: false,
      reason: "inactive_actor",
    });
  });
});

describe("canApproveBatch (vier-ogen)", () => {
  it("solo office: creator may approve their own batch", () => {
    expect(canApproveBatch(bw("a"), "a", 1)).toEqual({ allowed: true });
  });

  it("multi-bewindvoerder office: creator may NOT approve their own batch", () => {
    expect(canApproveBatch(bw("a"), "a", 2)).toEqual({
      allowed: false,
      reason: "vier_ogen",
    });
  });

  it("multi-bewindvoerder office: a different bewindvoerder may approve", () => {
    expect(canApproveBatch(bw("b"), "a", 2)).toEqual({ allowed: true });
  });

  it("legacy batch without creator falls back to the role check", () => {
    expect(canApproveBatch(bw("a"), null, 3)).toEqual({ allowed: true });
  });

  it("assistent may never approve, regardless of office size", () => {
    expect(canApproveBatch(asst("b"), "a", 2)).toEqual({
      allowed: false,
      reason: "role_required",
    });
    expect(canApproveBatch(asst("b"), "a", 1)).toEqual({
      allowed: false,
      reason: "role_required",
    });
  });

  it("inactive bewindvoerder may not approve", () => {
    expect(canApproveBatch(bw("b", false), "a", 2)).toEqual({
      allowed: false,
      reason: "inactive_actor",
    });
  });
});

describe("canChangeActor", () => {
  const target = (id: string, role: "bewindvoerder" | "assistent") => ({
    id,
    role,
    active: true,
  });

  it("bewindvoerder may promote an assistent", () => {
    expect(
      canChangeActor(bw("a"), target("b", "assistent"), { role: "bewindvoerder" }, 1)
    ).toEqual({ allowed: true });
  });

  it("assistent may not manage actors", () => {
    expect(
      canChangeActor(asst("a"), target("b", "assistent"), { active: false }, 2)
    ).toEqual({ allowed: false, reason: "role_required" });
  });

  it("refuses self-change", () => {
    expect(
      canChangeActor(bw("a"), target("a", "bewindvoerder"), { active: false }, 2)
    ).toEqual({ allowed: false, reason: "self_change" });
  });

  it("refuses removing the last active bewindvoerder", () => {
    expect(
      canChangeActor(bw("a"), target("b", "bewindvoerder"), { role: "assistent" }, 1)
    ).toEqual({ allowed: false, reason: "last_bewindvoerder" });
    expect(
      canChangeActor(bw("a"), target("b", "bewindvoerder"), { active: false }, 1)
    ).toEqual({ allowed: false, reason: "last_bewindvoerder" });
  });

  it("allows demoting a bewindvoerder when another remains", () => {
    expect(
      canChangeActor(bw("a"), target("b", "bewindvoerder"), { role: "assistent" }, 2)
    ).toEqual({ allowed: true });
  });

  it("deactivating an assistent never trips the last-bewindvoerder guard", () => {
    expect(
      canChangeActor(bw("a"), target("b", "assistent"), { active: false }, 1)
    ).toEqual({ allowed: true });
  });
});
