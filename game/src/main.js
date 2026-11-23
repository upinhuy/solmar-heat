// Boot and the one loop: input is read every frame, the game advances in fixed 1/60 s steps
// (several in a slow frame, none in a fast one), and the renderer paints what is there. The
// game moves between six screens: title, play, paused, wasted, busted and story done.
//
// ?seed=N fixes the city and the traffic. ?shot=start|drive|chase|mission|showdown|skyline|
// rain|port (with &seed=N) stages that scene instead of running the loop, paints it twice
// and sets window.__shotReady for a screenshot.
import { STEP } from './config.js';
import { createGame, loadSave, startRun, stepGame } from './state.js';
import { ACTION_CONFIRM, ACTION_ENTER, ACTION_HORN, ACTION_MUTE, ACTION_NEW, ACTION_PAUSE, ACTION_PUNCH, ACTION_RESTART, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_BUSTED, SCREEN_DONE, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WASTED } from './render.js';
import { HIDEOUT, createMissions } from './missions.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const saved = loadSave();
const game = createGame(seed, saved);
window.__game = game; // handy for debugging and for automated checks
const renderer = createRenderer(canvas);
const audio = createAudio();
game.audio = audio;

function runShot(name) {
  const scene = stageShot(name, game);
  let painted = 0;
  function paint() {
    renderer.draw(game, scene.screen, { save: saved });
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let accumulator = 0;
  let last = performance.now();
  // One-shot step actions (enter a car, punch) wait here until a simulation step actually
  // runs: a press taken on a frame too short for a step must not be dropped.
  let stepActions = 0;

  function announce(message) {
    status.textContent = message;
  }

  function playEvents(events) {
    for (const event of events) {
      if (event.type === 'shot') audio.shot();
      else if (event.type === 'horn') audio.horn();
      else if (event.type === 'punch') audio.punch();
      else if (event.type === 'crash') audio.crash();
      else if (event.type === 'checkpoint') {
        audio.checkpoint();
        announce('Checkpoint! Keep going.');
      } else if (event.type === 'pickup') {
        audio.pickup();
        announce('Package grabbed. Now deliver it.');
      } else if (event.type === 'announce') {
        announce(event.text);
      } else if (event.type === 'cash') {
        audio.cash();
        announce(`Mission complete. $${event.amount} earned.`);
      } else if (event.type === 'steal') {
        announce('Car stolen — the law is watching.');
      } else if (event.type === 'unlock') {
        announce(event.text);
      } else if (event.type === 'cooldown') {
        announce(event.stars === 0 ? 'The heat is off. You are clean.' : `Wanted level fell to ${event.stars} star${event.stars === 1 ? '' : 's'}.`);
      } else if (event.type === 'story-done') {
        audio.sting();
      }
    }
  }

  function startGame(fresh) {
    if (fresh) {
      // A fresh run replaces the whole mission state: story back to job one, side
      // activities cleared, race and delivery records back to zero.
      game.cash = 0;
      game.missions = createMissions();
    }
    // After being wasted or busted, Rico wakes up at the hideout.
    if (screen === SCREEN_WASTED || screen === SCREEN_BUSTED) {
      game.player.inCar = false;
      game.player.car = null;
      game.player.x = HIDEOUT.x + 40;
      game.player.y = HIDEOUT.y + 40;
    }
    game.player.health = 100;
    startRun(game);
    accumulator = 0;
    screen = game.missions.finishedAll ? SCREEN_DONE : SCREEN_PLAY;
    announce('Playing. Follow the yellow marker.');
  }

  function handleActions(actions) {
    if (actions & ACTION_MUTE) {
      audio.setMuted(!audio.muted);
      announce(audio.muted ? 'Sound off.' : 'Sound on.');
    }
    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_NEW) startGame(true);
      else if (actions & ACTION_CONFIRM) {
        audio.unlock();
        startGame(false);
      }
      return;
    }
    if (screen === SCREEN_PLAY) {
      if (actions & ACTION_PAUSE) {
        screen = SCREEN_PAUSED;
        stepActions = 0; // a press queued before the pause must not fire on resume
        announce('Paused.');
      }
      return;
    }
    if (screen === SCREEN_PAUSED) {
      if (actions & ACTION_RESTART) startGame(true);
      else if (actions & ACTION_PAUSE) screen = SCREEN_PLAY;
      else if (actions & ACTION_CONFIRM) screen = SCREEN_PLAY;
      return;
    }
    if (screen === SCREEN_WASTED || screen === SCREEN_BUSTED || screen === SCREEN_DONE) {
      if (actions & ACTION_RESTART) startGame(true);
      else if (actions & ACTION_CONFIRM) startGame(false);
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    // One-shot presses are taken once per frame and shared by the screens and the steps.
    let actions = input.takeActions();
    handleActions(actions);
    if (screen === SCREEN_PLAY) {
      stepActions |= actions & (ACTION_PUNCH | ACTION_ENTER | ACTION_HORN);
      while (accumulator >= STEP) {
        const mouse = input.mouse();
        const world = renderer.screenToWorld(game, mouse.x, mouse.y);
        const result = stepGame(game, {
          move: input.move(),
          sprint: input.sprint(),
          handbrake: input.handbrake(),
          aim: Math.atan2(world.y - game.player.y, world.x - game.player.x),
          shoot: input.takeClick(),
          punch: !!(stepActions & ACTION_PUNCH),
          enter: !!(stepActions & ACTION_ENTER),
          horn: !!(stepActions & ACTION_HORN),
        }, STEP);
        // Enter, punch and the horn are one-shot: only the first step that runs gets them.
        stepActions &= ~(ACTION_PUNCH | ACTION_ENTER | ACTION_HORN);
        accumulator -= STEP;
        playEvents(result.events);
        // Engine and siren follow the game every step; a motorcycle's engine sits a
        // third higher than a car's, and the rain wash follows the weather.
        if (game.player.inCar && game.player.car) {
          const car = game.player.car;
          const ratio = Math.min(1, Math.hypot(car.vx, car.vy) / 540);
          audio.engine(car.shape === 'moto' ? ratio * 1.35 : ratio);
        } else {
          audio.engine(0);
        }
        audio.siren(game.police.sirenOn);
        audio.rain(game.weather.rain);
        if (result.busted) {
          screen = SCREEN_BUSTED;
          announce('Busted by the Solmar PD.');
          break;
        }
        if (result.wasted) {
          screen = SCREEN_WASTED;
          announce('Wasted.');
          break;
        }
        if (game.missions.finishedAll && screen === SCREEN_PLAY) {
          screen = SCREEN_DONE;
          announce('All missions done. Solmar is yours.');
          break;
        }
      }
    } else if (screen === SCREEN_TITLE) {
      while (accumulator >= STEP) {
        stepGame(game, { move: { x: 0, y: 0 }, sprint: false, handbrake: false, aim: 0, shoot: false, punch: false, enter: false }, STEP);
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(game, screen, { save: saved });
  }

  // Leaving the tab pauses a running game rather than letting the city move unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Solmar Heat. Press Enter or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
