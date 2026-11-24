// Keyboard and pointer input. Held keys give movement and driving; one-shot presses
// (start, pause, enter a car, mute, restart, headlights) are queued as bit flags and taken once by
// the loop, so a press between two frames is never lost and never counted twice. The
// canvas also swallows the right-click menu, so a stray click while aiming never
// interrupts a fight, and the movement keys keep their default page behaviour
// (scrolling) suppressed. Hiding the tab counts as losing focus too: a key released
// while the game is unseen must not stay held when the player comes back.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER = 4;
export const ACTION_MUTE = 8;
export const ACTION_NEW = 16;
export const ACTION_PUNCH = 32;
export const ACTION_RESTART = 64;
export const ACTION_HORN = 128;
export const ACTION_LIGHTS = 256; // L: toggle the headlights after dark

const CONFIRM = new Set(['Enter', 'Space']);
const PAUSE = new Set(['KeyP', 'Escape']);
const ENTER = new Set(['KeyE']);
const MUTE = new Set(['KeyM']);
const NEW = new Set(['KeyN']);
const PUNCH = new Set(['KeyF']);
const RESTART = new Set(['KeyR']);
const HORN = new Set(['KeyH', 'KeyB']); // H, or B for a left hand that is already on WASD
const LIGHTS = new Set(['KeyL']);

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let mouseX = 0;
  let mouseY = 0;
  let mouseDown = false;
  let clicked = false;

  function onKeyDown(event) {
    // The keys that move Rico must never scroll the page out from under the game.
    if (event.code.startsWith('Arrow') || event.code === 'Space') event.preventDefault();
    if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
      event.preventDefault();
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
      event.preventDefault();
    } else if (ENTER.has(event.code)) {
      if (!event.repeat) actions |= ACTION_ENTER;
    } else if (MUTE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else if (NEW.has(event.code)) {
      if (!event.repeat) actions |= ACTION_NEW;
    } else if (PUNCH.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PUNCH;
    } else if (RESTART.has(event.code)) {
      if (!event.repeat) actions |= ACTION_RESTART;
    } else if (HORN.has(event.code)) {
      actions |= ACTION_HORN; // held or tapped, the horn may sound again at once
    } else if (LIGHTS.has(event.code)) {
      if (!event.repeat) actions |= ACTION_LIGHTS; // one toggle per press, never a strobe
    }
    keys.add(event.code);
  }
  function onKeyUp(event) {
    keys.delete(event.code);
  }
  function onBlur() {
    // Losing focus drops everything mid-gesture: held keys, the mouse, and any one-shot
    // press still queued — a stale Enter must not fire when the player comes back.
    keys.clear();
    mouseDown = false;
    clicked = false;
    actions = 0;
  }
  function onMove(event) {
    const rect = canvas.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) onBlur();
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerdown', (event) => {
    onMove(event);
    mouseDown = true;
    clicked = true;
    actions |= ACTION_CONFIRM;
  });
  canvas.addEventListener('pointerup', () => {
    mouseDown = false;
  });
  canvas.addEventListener('pointercancel', () => {
    // A cancelled pointer (the browser took the gesture over) must not leave the mouse
    // stuck down: a stuck button would keep Rico firing long after the player let go.
    mouseDown = false;
    clicked = false;
  });
  canvas.addEventListener('pointerleave', () => {
    // Sliding off the canvas mid-press is the same trap as a cancelled pointer: the
    // button is no longer over the game, so it no longer counts as held.
    mouseDown = false;
  });

  return {
    /** WASD/arrows as {x, y} in -1..1. */
    move() {
      const x = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
      const y = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0);
      return { x, y };
    },
    sprint() {
      return keys.has('ShiftLeft') || keys.has('ShiftRight');
    },
    handbrake() {
      return keys.has('Space');
    },
    mouse() {
      return { x: mouseX, y: mouseY, down: mouseDown };
    },
    /** True once after a click (mouse or touch), for shooting. */
    takeClick() {
      const was = clicked;
      clicked = false;
      return was;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
