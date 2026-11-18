// The wanted system: stars 0-5, police cars and foot cops who spawn at the edge of the
// player's view and chase, an arrest when a cop holds the player, and the heat cooling off
// when the player stays out of sight. Crimes raise the stars; hiding lowers them.
import { COP, PLAYER, WANTED_MAX, WORLD } from './config.js';
import { angleDelta, clamp, distance } from './random.js';
import { driveCar, makeCar } from './vehicles.js';
import { gridTarget, nearestRoadPoint, randomRoadPoint } from './world.js';

export function createPolice() {
  return {
    wanted: 0,
    cars: [], // police cars chasing
    cops: [], // foot cops chasing
    spawnTimer: 0,
    quietTimer: 0, // seconds with no police near the player
    arrestTimer: 0,
    sirenOn: false,
  };
}

export function addWanted(police, n) {
  police.wanted = clamp(police.wanted + n, 0, WANTED_MAX);
  if (n > 0) police.quietTimer = 0;
}

export function setWanted(police, n) {
  police.wanted = clamp(n, 0, WANTED_MAX);
  police.quietTimer = 0;
}

function spawnPointNear(game) {
  const p = game.player;
  for (let tries = 0; tries < 12; tries += 1) {
    const spot = randomRoadPoint(game.rng);
    if (distance(spot.x, spot.y, p.x, p.y) > COP.spawnDistance) return spot;
  }
  const spot = randomRoadPoint(game.rng);
  return { x: clamp(spot.x, 60, WORLD - 60), y: clamp(spot.y, 60, WORLD - 60) };
}

function nearestPoliceDistance(game) {
  const p = game.player;
  let best = Infinity;
  for (const car of game.police.cars) best = Math.min(best, distance(car.x, car.y, p.x, p.y));
  for (const cop of game.police.cops) best = Math.min(best, distance(cop.x, cop.y, p.x, p.y));
  return best;
}

/**
 * One fixed step of the wanted system. Returns 'busted' when a foot cop holds the player
 * long enough, otherwise null. `events` collects what happened for sounds and the HUD.
 */
export function updatePolice(game, dt, events) {
  const police = game.police;
  const player = game.player;

  if (police.wanted === 0) {
    // The last cops drive off and leave.
    for (const car of police.cars) {
      car.siren = Math.max(0, car.siren - dt);
    }
    police.cars = police.cars.filter((c) => distance(c.x, c.y, player.x, player.y) < COP.despawnDistance);
    police.cops = police.cops.filter((c) => distance(c.x, c.y, player.x, player.y) < COP.despawnDistance);
    police.sirenOn = false;
    return null;
  }

  // Spawn pressure scales with stars: more cars, more foot cops.
  const wantCars = Math.min(police.wanted, 4);
  const wantCops = police.wanted >= 2 ? Math.min(police.wanted - 1, 4) : 0;
  police.spawnTimer -= dt;
  if (police.spawnTimer <= 0) {
    police.spawnTimer = 1.6;
    if (police.cars.length < wantCars) {
      const spot = spawnPointNear(game);
      const car = makeCar(game.rng, { x: spot.x, y: spot.y, angle: 0, kind: 'police', color: '#1c2733', police: true, speedTarget: COP.carSpeed });
      car.siren = 1;
      police.cars.push(car);
    }
    if (police.cops.length < wantCops && !player.inCar) {
      const spot = spawnPointNear(game);
      police.cops.push({ x: spot.x, y: spot.y, angle: 0, speed: COP.footSpeed, arrest: 0 });
    }
  }

  // Police cars chase through the street grid: aim at the player's street, then charge
  // straight at the player once they share it. A car stuck against a building backs up.
  for (const car of police.cars) {
    const target = gridTarget(car, player);
    const want = Math.atan2(target.y - car.y, target.x - car.x);
    const steer = clamp(angleDelta(car.angle, want), -1, 1);
    const moved = distance(car.x, car.y, car.lastX ?? car.x, car.lastY ?? car.y);
    if (moved < 1.5) car.stuck = (car.stuck || 0) + dt;
    else car.stuck = 0;
    if (car.stuck > 0.7) {
      car.backup = 0.6;
      car.stuck = 0;
    }
    car.lastX = car.x;
    car.lastY = car.y;
    const backing = (car.backup || 0) > 0;
    if (backing) car.backup -= dt;
    const input = {
      forward: !backing,
      back: backing,
      left: backing ? steer > 0.08 : steer < -0.08,
      right: backing ? steer < -0.08 : steer > 0.08,
      handbrake: false,
    };
    const impact = driveCar(car, input, dt, game.city.buildings);
    if (impact > 220) {
      events.push({ type: 'crash', x: car.x, y: car.y });
    }
    // Ramming the player's car hurts the player and slows them.
    const d = distance(car.x, car.y, player.x, player.y);
    if (d < 34 && player.inCar) {
      player.health -= 6 * dt * 10;
      player.lastHurt = game.time;
      player.car.speed *= 0.98;
      if (game.rng() < dt * 4) events.push({ type: 'ram', x: player.x, y: player.y });
    } else if (d < 30 && !player.inCar) {
      // A police car nudging a player on foot knocks them down a little.
      player.health -= 10 * dt * 10;
      player.lastHurt = game.time;
    }
    car.siren = 1;
  }

  // Foot cops run at the player; holding them close for long enough ends in an arrest.
  let held = false;
  for (const cop of police.cops) {
    const d = distance(cop.x, cop.y, player.x, player.y);
    if (player.inCar) {
      // Cops give up chasing a car on foot and head for the nearest road.
      const road = nearestRoadPoint(cop.x, cop.y);
      const want = Math.atan2(road.y - cop.y, road.x - cop.x);
      cop.angle += clamp(angleDelta(cop.angle, want), -3 * dt, 3 * dt);
      cop.x += Math.cos(cop.angle) * cop.speed * dt;
      cop.y += Math.sin(cop.angle) * cop.speed * dt;
      continue;
    }
    const want = Math.atan2(player.y - cop.y, player.x - cop.x);
    cop.angle += clamp(angleDelta(cop.angle, want), -3 * dt, 3 * dt);
    // Close enough to hold the player: stand and hold on instead of running through them.
    if (d > 24) {
      cop.x += Math.cos(cop.angle) * cop.speed * dt;
      cop.y += Math.sin(cop.angle) * cop.speed * dt;
    }
    if (d < 26) {
      held = true;
      cop.arrest += dt;
    } else {
      cop.arrest = 0;
    }
  }
  if (held) {
    police.arrestTimer += dt;
    if (police.arrestTimer >= COP.arrestTime) return 'busted';
  } else {
    police.arrestTimer = 0;
  }

  // Heat cools when no police can see the player.
  const near = nearestPoliceDistance(game);
  if (near > 650) {
    police.quietTimer += dt;
    if (police.quietTimer > 9) {
      police.quietTimer = 0;
      police.wanted = Math.max(0, police.wanted - 1);
      events.push({ type: 'cooldown', stars: police.wanted });
    }
  } else {
    police.quietTimer = 0;
  }

  police.sirenOn = police.cars.length > 0 && near < 900;
  // Drop police that fell far behind.
  police.cars = police.cars.filter((c) => distance(c.x, c.y, player.x, player.y) < COP.despawnDistance);
  police.cops = police.cops.filter((c) => distance(c.x, c.y, player.x, player.y) < COP.despawnDistance);
  return null;
}
