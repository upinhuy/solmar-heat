// The wanted system: stars 0-5, police cars and foot cops who spawn at the edge of the
// player's view and chase, an arrest when a cop holds the player, and the heat cooling off
// when the player stays out of sight. The chase is smarter than a beeline: cars aim where
// the player is heading, not where he is, and at four stars the PD parks roadblocks across
// the road ahead. Crimes raise the stars; hiding lowers them.
import { COP, WANTED_MAX, WORLD } from './config.js';
import { angleDelta, clamp, distance } from './random.js';
import { driveCar, makeCar } from './vehicles.js';
import { gridTarget, nearestRoadPoint, randomRoadPoint } from './world.js';

export function createPolice() {
  return {
    wanted: 0,
    cars: [], // police cars chasing (some may be parked as a roadblock)
    cops: [], // foot cops chasing
    spawnTimer: 0,
    quietTimer: 0, // seconds with no police near the player
    arrestTimer: 0,
    sirenOn: false,
    roadblockSet: false, // a roadblock is out for the current heat level
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

/** Where the player will be shortly: his car velocity, or his facing when he is on foot. */
function aimPoint(game) {
  const player = game.player;
  if (player.inCar && player.car) {
    return {
      x: player.x + player.car.vx * COP.aimLead,
      y: player.y + player.car.vy * COP.aimLead,
    };
  }
  return {
    x: player.x + Math.cos(player.angle) * 60,
    y: player.y + Math.sin(player.angle) * 60,
  };
}

/**
 * Park two police cars across the road about 500 units ahead of the player, sideways so
 * they block both lanes. They sit with the siren on until the player gets close, then join
 * the chase like any other unit.
 */
function setRoadblock(game) {
  const police = game.police;
  const player = game.player;
  const heading = player.inCar && player.car ? player.car.angle : player.angle;
  const ahead = {
    x: clamp(player.x + Math.cos(heading) * 520, 80, WORLD - 80),
    y: clamp(player.y + Math.sin(heading) * 520, 80, WORLD - 80),
  };
  const spot = nearestRoadPoint(ahead.x, ahead.y);
  // Sideways across the street: the cars' noses point along the street's cross direction.
  const onVertical = Math.abs(spot.x - ahead.x) < Math.abs(spot.y - ahead.y);
  const across = onVertical ? Math.PI / 2 : 0;
  for (const offset of [-19, 19]) {
    const x = onVertical ? spot.x + offset : spot.x;
    const y = onVertical ? spot.y : spot.y + offset;
    const car = makeCar(game.rng, { x, y, angle: across, kind: 'police', color: '#1c2733', police: true, speedTarget: COP.carSpeed });
    car.siren = 1;
    car.roadblock = true;
    police.cars.push(car);
  }
  police.roadblockSet = true;
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
    police.roadblockSet = false;
    return null;
  }
  if (police.wanted < COP.roadblockMinStars) police.roadblockSet = false;

  // Spawn pressure scales with stars: more cars, more foot cops, and a roadblock at 4+.
  const wantCars = Math.min(police.wanted, 4) + (police.wanted >= COP.roadblockMinStars ? 2 : 0);
  const wantCops = police.wanted >= 2 ? Math.min(police.wanted - 1, 4) : 0;
  police.spawnTimer -= dt;
  if (police.spawnTimer <= 0) {
    police.spawnTimer = 1.6;
    if (police.wanted >= COP.roadblockMinStars && !police.roadblockSet) {
      setRoadblock(game);
    } else if (police.cars.length < wantCars) {
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

  // Police cars chase through the street grid, aiming at where the player is heading.
  // A roadblock car holds its line until the player is close, then it joins the chase.
  // A car stuck against a building backs up.
  for (const car of police.cars) {
    const d = distance(car.x, car.y, player.x, player.y);
    // Ramming the player's car hurts the player and slows them; a nudge on foot hurts more.
    if (d < 34 && player.inCar) {
      player.health -= 4 * dt * 10;
      player.lastHurt = game.time;
      player.car.speed *= 0.98;
      if (game.rng() < dt * 4) events.push({ type: 'ram', x: player.x, y: player.y });
    } else if (d < 30 && !player.inCar) {
      player.health -= 10 * dt * 10;
      player.lastHurt = game.time;
    }
    car.siren = 1;
    if (car.roadblock) {
      if (d > 150) continue; // hold the line, lights flashing
      car.roadblock = false; // the player is here: chase
    }
    const target = gridTarget(car, aimPoint(game));
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
  }

  // Foot cops run at the player; holding them close for long enough ends in an arrest.
  // A cop far behind the action runs faster to catch up, then settles to a normal pace.
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
    const pace = d > 320 ? cop.speed * 1.3 : cop.speed;
    const want = Math.atan2(player.y - cop.y, player.x - cop.x);
    cop.angle += clamp(angleDelta(cop.angle, want), -3 * dt, 3 * dt);
    // Close enough to hold the player: stand and hold on instead of running through them.
    if (d > 24) {
      cop.x += Math.cos(cop.angle) * pace * dt;
      cop.y += Math.sin(cop.angle) * pace * dt;
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
