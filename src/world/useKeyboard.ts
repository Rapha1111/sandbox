import { useEffect, useRef } from "react";

const KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

/** Tracks currently-held movement keys in a ref (no re-renders) for use inside useFrame loops. */
export function useKeyboard() {
  const pressed = useRef<Set<string>>(new Set());

  useEffect(() => {
    function down(e: KeyboardEvent) {
      if (KEYS.has(e.code)) pressed.current.add(e.code);
    }
    function up(e: KeyboardEvent) {
      pressed.current.delete(e.code);
    }
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  return pressed;
}
