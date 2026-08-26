/**
 * Authorization rules — pure functions, no I/O (plan os-v1 W0).
 *
 * Server actions gather the facts (actor, batch, active-bewindvoerder
 * count) and ask these functions for the verdict. UI never decides.
 */

export type Role = "bewindvoerder" | "assistent";

export type AuthzActor = {
  id: string;
  role: Role;
  active: boolean;
};

/** Actions reserved for the bewindvoerder role (legal-responsibility acts). */
export type PrivilegedAction =
  | "batch_approve"
  | "batch_item_exclude"
  | "machtiging_resolve"
  | "letter_approve"
  | "actor_manage";

export type AuthzVerdict =
  | { allowed: true }
  | {
      allowed: false;
      reason:
        | "inactive_actor"
        | "role_required"
        | "vier_ogen"
        | "self_change"
        | "last_bewindvoerder";
    };

export function canPerform(
  actor: AuthzActor,
  action: PrivilegedAction
): AuthzVerdict {
  if (!actor.active) return { allowed: false, reason: "inactive_actor" };
  if (actor.role !== "bewindvoerder")
    return { allowed: false, reason: "role_required" };
  void action; // all privileged actions currently require bewindvoerder
  return { allowed: true };
}

/**
 * Vier-ogen on batch approval: when more than one active bewindvoerder
 * exists in the office, the approver must differ from the batch creator.
 * With a single active bewindvoerder (solo founder) it degrades to the
 * acknowledged-approve flow and never blocks.
 *
 * `createdBy` may be null on batches predating this rule; those cannot be
 * held to a creator identity and fall back to the role check alone.
 */
export function canApproveBatch(
  actor: AuthzActor,
  batchCreatedBy: string | null,
  activeBewindvoerderCount: number
): AuthzVerdict {
  const base = canPerform(actor, "batch_approve");
  if (!base.allowed) return base;
  if (
    activeBewindvoerderCount > 1 &&
    batchCreatedBy !== null &&
    batchCreatedBy === actor.id
  ) {
    return { allowed: false, reason: "vier_ogen" };
  }
  return { allowed: true };
}

/**
 * Actor management guardrails: a bewindvoerder manages roles, but may not
 * deactivate/demote themselves and may not remove the last active
 * bewindvoerder (the office must always keep one).
 */
export function canChangeActor(
  manager: AuthzActor,
  target: { id: string; role: Role; active: boolean },
  change: { role?: Role; active?: boolean },
  activeBewindvoerderCount: number
): AuthzVerdict {
  const base = canPerform(manager, "actor_manage");
  if (!base.allowed) return base;
  if (target.id === manager.id)
    return { allowed: false, reason: "self_change" };
  const losesBewindvoerder =
    target.role === "bewindvoerder" &&
    target.active &&
    (change.role === "assistent" || change.active === false);
  if (losesBewindvoerder && activeBewindvoerderCount <= 1)
    return { allowed: false, reason: "last_bewindvoerder" };
  return { allowed: true };
}
