/**
 * Spec §11 — the engine draws a hard line between actions a script can trigger
 * freely (no economic consequence) and actions that must go through a manager
 * that validates and, for money, requires explicit player confirmation.
 *
 * Scripts never get a reference to raw game state: the only things they can
 * call are the host-object methods built in scriptApi.ts, and every one of
 * those methods is listed here so the classification is auditable in one
 * place instead of scattered implicitly through the codebase.
 */
export type ActionKind = "local" | "sensitive";

export const ACTION_KIND: Record<string, ActionKind> = {
  "player.say": "local",
  "player.get_money": "local",
  "player.get_name": "local",
  "player.get_id": "local",
  "object.set_texture": "local",
  "object.get_texture": "local",
  "object.play_animation": "local",
  "object.get_state": "local",
  "object.set_state": "local",
  "object.get_property": "local",
  "object.get_balance": "local",
  "player.request_money": "sensitive",
  "object.give_item": "sensitive",
  "object.spawn": "sensitive",
  "object.send_money": "sensitive",
};

export function kindOf(action: string): ActionKind {
  return ACTION_KIND[action] ?? "sensitive";
}
