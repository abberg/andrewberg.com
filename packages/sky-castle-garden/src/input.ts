// Keyboard and mouse, read once per frame. Clicking the canvas locks the
// pointer so the mouse orbits the camera; Esc lets it go.
export function createInput(canvas: HTMLCanvasElement) {
  const keys = new Set<string>(), taps = new Set<string>();
  const look = { x: 0, y: 0 };
  let zoom = 0;
  addEventListener('keydown', event => {
    if (event.target instanceof Element && event.target.closest('input, select')) return;
    keys.add(event.code);
    if (!event.repeat) taps.add(event.code);
  });
  addEventListener('keyup', event => keys.delete(event.code));
  addEventListener('blur', () => keys.clear());
  canvas.addEventListener('click', () => { if (document.pointerLockElement !== canvas) canvas.requestPointerLock(); });
  addEventListener('mousemove', event => {
    if (document.pointerLockElement !== canvas) return;
    look.x += event.movementX;
    look.y += event.movementY;
  });
  canvas.addEventListener('wheel', event => { event.preventDefault(); zoom += Math.sign(event.deltaY); }, { passive: false });

  return {
    // Which way to walk, x to the right and y forward, at most 1 long.
    move() {
      const x = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
      const y = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
      const length = Math.hypot(x, y) || 1;
      return { x: x / length, y: y / length };
    },
    run: () => keys.has('ShiftLeft') || keys.has('ShiftRight'),
    // Whether a key went down since the last time it was asked about.
    tapped: (code: string) => taps.delete(code),
    // Mouse movement and wheel steps since the last call.
    take() {
      const taken = { x: look.x, y: look.y, zoom };
      look.x = look.y = zoom = 0;
      return taken;
    },
  };
}
export type Input = ReturnType<typeof createInput>;
