// The wanted system: stars 0-5, police cars and foot cops who spawn at the edge of the
// player's view and chase, an arrest when a cop holds the player, and the heat cooling off
// when the player stays out of sight. The chase is smarter than a beeline: cars aim where
// the player is heading, not where he is, fresh units prefer to appear ahead of a driver,
// and at four stars the PD parks roadblocks across the road ahead — two cars, and three
// at the full five stars — and ahead of the roadblock it lays a spike strip across the
// road: a car that crosses one shreds its tyres and limps away slow and sliding, so the
// player either brakes, swerves around the strip's ends, or pays for the shortcut.
// At five stars, once you have blown through one roadblock, the
// PD throws a second one across your road while the heat lasts — and puts a helicopter
// over the chase: no gun, no arrest, just a searchlight that refuses to lose you until
// the heat drops. The helicopter stays grounded in a thunderstorm, though — the PD does
// not fly its bird into lightning — so a five-star storm chase is all ground units.
// Three stars is where the
// pursuit bares its teeth: an extra car joins and fresh units roll in faster. Crimes raise
// the stars; hiding lowers them. The pursuit is hard on the cruisers, too: a unit that
// piles into a building comes away bent, and a bent cruiser smokes like any other wreck.
import { COP, SPIKE, WANTED_MAX, WORLD } from './config.js';
import { angleDelta, chance, clamp, distance } from './random.js';
import { driveCar, makeCar, spikeCheck } from './vehicles.js';
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
    roadblockWaves: 0, // roadblocks thrown at this heat so far (a second wave only at 5 stars)
    strips: [], // spike strips laid across the road ahead of roadblocks: {x, y, angle, hit, deploy} — deploy 0..1 is the strip unfolding on the asphalt; it only bites once fully laid
    heli: null, // the five-star helicopter: {x, y, angle, rotor, leaving} while it hunts
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
  // A driver mostly meets the law in front of him: prefer a far spot in the hemisphere he
  // is heading into, and only fall back to anywhere far when the tries run out.
  const heading = p.inCar && p.car ? p.car.angle : p.angle;
  // Down in the beach district the shore is a trap with one road out: units answering a
  // call there roll in along the southern streets, so the heat arrives on the coast road
  // and the avenues feeding it instead of across town.
  const atBeach = p.x < 1500 && p.y > 1750;
  let fallback = null;
  for (let tries = 0; tries < 12; tries += 1) {
    const spot = randomRoadPoint(game.rng);
    if (distance(spot.x, spot.y, p.x, p.y) <= COP.spawnDistance) continue;
    if (!fallback) fallback = spot;
    const ahead = Math.cos(heading) * (spot.x - p.x) + Math.sin(heading) * (spot.y - p.y);
    if (ahead > 0 && (!atBeach || spot.y > 1400)) return spot;
  }
  if (fallback) return fallback;
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
  // At the full five stars a third car closes the middle gap.
  const onVertical = Math.abs(spot.x - ahead.x) < Math.abs(spot.y - ahead.y);
  const across = onVertical ? Math.PI / 2 : 0;
  const offsets = police.wanted >= WANTED_MAX ? [-27, 0, 27] : [-19, 19];
  for (const offset of offsets) {
    const x = onVertical ? spot.x + offset : spot.x;
    const y = onVertical ? spot.y : spot.y + offset;
    const car = makeCar(game.rng, { x, y, angle: across, kind: 'police', color: '#1c2733', police: true, speedTarget: COP.carSpeed });
    car.siren = 1;
    car.roadblock = true;
    police.cars.push(car);
  }
  // Ahead of the roadblock, the PD lays a spike strip across the road — 140 units
  // before the cars, so the player must choose: cross it and shred the tyres, or
  // swerve around its ends. At most SPIKE.maxStrips are out at once; a spent strip
  // stays on the road, flattened, until the heat dies. A fresh strip unfolds over
  // SPIKE.deployTime seconds — the teeth fan out across the asphalt — and only bites
  // once it is fully laid, so a driver who is already on top of it when it lands
  // gets a heartbeat to swerve.
  if (police.strips.length < SPIKE.maxStrips) {
    const stripAhead = {
      x: clamp(player.x + Math.cos(heading) * SPIKE.ahead, 80, WORLD - 80),
      y: clamp(player.y + Math.sin(heading) * SPIKE.ahead, 80, WORLD - 80),
    };
    const stripSpot = nearestRoadPoint(stripAhead.x, stripAhead.y);
    police.strips.push({ x: stripSpot.x, y: stripSpot.y, angle: onVertical ? 0 : Math.PI / 2, hit: false, deploy: 0 });
  }
  police.roadblockSet = true;
  police.roadblockWaves += 1;
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
    police.roadblockWaves = 0;
    police.strips = []; // no heat, no strips: the road is swept clean
    police.heli = null; // no heat, no bird: it is simply gone
    return null;
  }
  if (police.wanted < COP.roadblockMinStars) {
    police.roadblockSet = false;
    police.roadblockWaves = 0;
  }
  // Fresh strips unfold on the asphalt over SPIKE.deployTime seconds: the teeth fan
  // out across the road, and only a fully laid strip can bite — spikeCheck reads
  // the same deploy flag, so a car crossing mid-unfold passes over harmlessly.
  for (const strip of police.strips) {
    strip.deploy = Math.min(1, (strip.deploy ?? 1) + dt / SPIKE.deployTime);
  }
  // Five stars, and every roadblock car has already broken ranks to chase: the PD gets
  // one more throw of the barricade across the road ahead.
  if (
    police.wanted >= WANTED_MAX
    && police.roadblockSet
    && police.roadblockWaves < 2
    && !police.cars.some((c) => c.roadblock)
  ) {
    police.roadblockSet = false;
  }

  // Spawn pressure scales with stars: more cars, more foot cops, and a roadblock at 4+.
  // From three stars the PD commits an extra car and answers calls faster.
  const wantCars = Math.min(police.wanted, 4) + (police.wanted >= COP.roadblockMinStars ? 2 : police.wanted === 3 ? 1 : 0);
  const wantCops = police.wanted >= 2 ? Math.min(police.wanted - 1, 4) : 0;
  police.spawnTimer -= dt;
  if (police.spawnTimer <= 0) {
    police.spawnTimer = police.wanted >= 3 ? 1.25 : 1.6;
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

  // The helicopter: at the full five stars the PD puts a bird over the chase. It carries
  // no gun and makes no arrest — it hovers over the player with its searchlight on, aimed
  // where he is heading and swaying as it hunts, faster than any car in the city. Drop
  // below five stars and it peels off toward the edge of town and is gone; the ground
  // units still decide whether the heat cools, so the bird alone can never hold a chase
  // open forever. In a thunderstorm it never takes off at all, and a bird already up
  // peels off the moment the storm rolls in — the PD does not fly into lightning.
  const storm = game.weather && game.weather.storm > 0;
  if (police.wanted >= WANTED_MAX && !storm) {
    if (!police.heli) {
      const fromEast = chance(game.rng, 0.5);
      const a = game.rng() * Math.PI * 2;
      police.heli = {
        x: clamp(player.x + (fromEast ? 640 : -640), 40, WORLD - 40),
        y: clamp(player.y + Math.sin(a) * 420, 40, WORLD - 40),
        angle: fromEast ? Math.PI : 0,
        rotor: 0,
        leaving: false,
      };
      events.push({ type: 'announce', text: 'PD helicopter overhead — five stars!' });
    } else {
      const heli = police.heli;
      heli.leaving = false;
      heli.rotor += dt * 42;
      const lead = aimPoint(game);
      const sway = game.time * 0.8;
      const tx = lead.x + Math.cos(sway) * 34;
      const ty = lead.y + Math.sin(sway * 1.3) * 26;
      const dx = tx - heli.x;
      const dy = ty - heli.y;
      const d = Math.hypot(dx, dy);
      if (d > 4) {
        const stepMove = Math.min(d, COP.heliSpeed * dt);
        heli.x += (dx / d) * stepMove;
        heli.y += (dy / d) * stepMove;
        heli.angle = Math.atan2(dy, dx);
      }
    }
  } else if (police.heli) {
    const heli = police.heli;
    heli.leaving = true;
    heli.rotor += dt * 42;
    const edgeX = heli.x < WORLD / 2 ? -90 : WORLD + 90;
    const dx = edgeX - heli.x;
    const dy = (player.y - heli.y) * 0.15;
    const d = Math.hypot(dx, dy) || 1;
    heli.x += (dx / d) * COP.heliSpeed * dt;
    heli.y += (dy / d) * COP.heliSpeed * dt;
    heli.angle = Math.atan2(dy, dx);
    if (heli.x < -70 || heli.x > WORLD + 70) police.heli = null;
  }

  // Police cars chase through the street grid, aiming at where the player is heading.
  // A roadblock car holds its line until the player is close, then it joins the chase.
  // A car stuck against a building backs up. In a thunderstorm the wet roads cost
  // them pace — pursuit cars hold 85% of their speed while the storm is overhead
  // (`storm` is the same flag the helicopter check above reads).
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
    car.siren = (car.siren || 0) + dt; // the light bar's clock: it drives the flash phase
    if (car.roadblock) {
      if (d > 165) continue; // hold the line, lights flashing
      car.roadblock = false; // the player is here: chase
      car.chaseBoost = 3; // breaking ranks, the unit rolls out fast for three seconds
    }
    // Wet roads in a thunderstorm: a chasing cruiser holds 85% of its pace, and takes
    // it back the moment the storm passes. Roadblock cars keep their posted speed —
    // they are parked until they join the chase. A unit fresh off a roadblock runs
    // 12% over its pace while its chase boost lasts, so a blown barricade still hurts.
    if (car.chaseBoost > 0) car.chaseBoost -= dt;
    const boost = (car.chaseBoost || 0) > 0 ? 1.12 : 1;
    if (!car.roadblock) car.speedTarget = COP.carSpeed * (storm ? COP.stormSlow : 1) * boost;
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
    if (impact > 90) {
      // A cruiser that hits a building wears it: dents now, engine smoke later.
      car.damage = Math.min(100, (car.damage || 0) + impact * 0.05);
    }
    if (impact > 220) {
      events.push({ type: 'crash', x: car.x, y: car.y });
    }
    // A chasing cruiser can shred its own tyres on a strip laid for the player —
    // the PD's trap does not spare its own. The timer ticks down here; driveCar
    // reads it every step, so a spiked cruiser falls back on its own.
    if (car.spikeTimer > 0) car.spikeTimer -= dt;
    spikeCheck(game, car, events);
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
    const pace = (d > 320 ? cop.speed * 1.3 : cop.speed) * (storm ? 0.9 : 1); // wet shoes, too
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
