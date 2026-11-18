// The screenshot scenes behind ?shot=start|drive|chase|mission. Each one plays the real rules
// forward from a fresh seeded game for a fixed number of steps, steered by a simple autopilot
// that drives toward waypoints, so the frame is what a short game really looks like and the
// same seed always gives the same frame.
import { STEP } from './config.js';
import { angleDelta, distance } from './random.js';
import { startRun, stepGame } from './state.js';
import { missionMarker, startMission } from './missions.js';
import { setWanted } from './police.js';
import { gridTarget, randomRoadPoint } from './world.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const IDLE = { move: { x: 0, y: 0 }, sprint: false, handbrake: false, aim: 0, shoot: false, punch: false, enter: false };

/** Put the player in the nearest car, as if they had just stolen it. */
function putPlayerInCar(game) {
  let best = null;
  let bestD = Infinity;
  for (const car of game.cars) {
    const d = distance(car.x, car.y, game.player.x, game.player.y);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  game.player.inCar = true;
  game.player.car = best;
  best.traffic = false;
}

/** Steering input that drives the player's car toward `target` through the street grid. */
function driveToward(game, target, stuck) {
  const car = game.player.car;
  const goal = gridTarget(car, target);
  const want = Math.atan2(goal.y - car.y, goal.x - car.x);
  const d = angleDelta(car.angle, want);
  const moved = distance(car.x, car.y, stuck.x, stuck.y);
  if (moved < 1.5) stuck.t += STEP;
  else stuck.t = 0;
  if (stuck.t > 0.7) {
    stuck.backup = 0.6;
    stuck.t = 0;
  }
  stuck.x = car.x;
  stuck.y = car.y;
  const backing = stuck.backup > 0;
  if (backing) stuck.backup -= STEP;
  return {
    move: { x: backing ? (d > 0.12 ? -1 : d < -0.12 ? 1 : 0) : d > 0.12 ? 1 : d < -0.12 ? -1 : 0, y: backing ? 1 : -1 },
    sprint: false,
    handbrake: false,
    aim: want,
    shoot: false,
    punch: false,
    enter: false,
  };
}

/** Drive for `seconds`, steering at whatever `nextTarget()` returns each step. */
function driveRoute(game, nextTarget, seconds) {
  const stuck = { x: game.player.x, y: game.player.y, t: 0, backup: 0 };
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    stepGame(game, driveToward(game, nextTarget(), stuck), STEP);
    if (game.player.health <= 0) break;
  }
}

/** A fixed route of waypoints, advancing when each one is reached. */
function routeTarget(game, route) {
  let index = 0;
  return () => {
    const target = route[index];
    if (distance(game.player.x, game.player.y, target.x, target.y) < 70) {
      index = (index + 1) % route.length;
    }
    return route[index];
  };
}

/**
 * Set `game` to the named scene (start, drive, chase or mission; any other name is start)
 * and return the screen to draw over it.
 */
export function stageShot(name, game) {
  if (name === 'drive') {
    startRun(game);
    putPlayerInCar(game);
    const route = [];
    for (let i = 0; i < 6; i += 1) route.push(randomRoadPoint(game.rng));
    driveRoute(game, routeTarget(game, route), 20);
    return { screen: SCREEN_PLAY };
  }
  if (name === 'chase') {
    startRun(game);
    putPlayerInCar(game);
    setWanted(game.police, 3);
    // A tight loop around the middle of town, so the police can close in.
    const route = [
      { x: 450, y: 450 },
      { x: 1950, y: 450 },
      { x: 1950, y: 1950 },
      { x: 450, y: 1950 },
    ];
    driveRoute(game, routeTarget(game, route), 18);
    return { screen: SCREEN_PLAY };
  }
  if (name === 'mission') {
    game.missions.index = 2;
    startMission(game, 2);
    putPlayerInCar(game);
    // Drive at the mission marker: nine seconds in, the package is still ahead of the player,
    // the two stars are still lit and the police are closing in.
    driveRoute(game, () => missionMarker(game) || randomRoadPoint(game.rng), 9);
    return { screen: SCREEN_PLAY };
  }
  // start: five seconds of city life behind the title screen.
  for (let i = 0; i < 5 / STEP; i += 1) stepGame(game, IDLE, STEP);
  return { screen: SCREEN_TITLE };
}
