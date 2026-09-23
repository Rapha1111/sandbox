import { useEffect, useRef } from "react";
import { useGameStore, isWorldInputBlocked } from "../data/store";

const KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true; // covers CodeMirror's contenteditable script editor
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT";
}

/**
 * Tracks currently-held movement keys in a ref (no re-renders) for use inside useFrame loops.
 * Ignores keys typed into a form field and, more broadly, any key at all while a modal/panel
 * (Object Creator, a confirmation dialog, the inventory...) covers the world — see
 * isWorldInputBlocked() — so creating or editing an object never moves the player in the
 * background.
 */
export function useKeyboard() {
  const pressed = useRef<Set<string>>(new Set());

  useEffect(() => {
    function down(e: KeyboardEvent) {
      if (!KEYS.has(e.code)) return;
      if (isEditableTarget(e.target) || isWorldInputBlocked()) return;
      pressed.current.add(e.code);
    }
    function up(e: KeyboardEvent) {
      pressed.current.delete(e.code);
    }
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    // Safety net: if a key was already held down when a modal opened, release it immediately
    // instead of waiting for a keyup that might land on a focused input and not bubble as expected.
    const unsubscribe = useGameStore.subscribe(() => {
      if (isWorldInputBlocked()) pressed.current.clear();
    });
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      unsubscribe();
    };
  }, []);

  return pressed;
}
