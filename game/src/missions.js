// The story of Solmar Heat: Rico Vega, new in town, working jobs for Mara Solis and her crew.
// Eighteen missions in order, each a small state machine with an objective, a map marker,
// dialogue and a cash reward. A failed mission restarts itself; finishing one starts the
// next. Two jobs work the beach resort district: a meet on
// the sand that turns into a firefight among the umbrellas, and a timed run in a marked
// coupe along the coast road to a drop at the far end of the beach. The last two jobs
// before the finale work the elevated railway: a courier's handoff under Estacion Norte
// that turns into a timed getaway, and an ambush under the viaduct where a rival crew
// tries to take a case back by force. Between story jobs,
// two repeatable side activities pay cash — generously, so a
// free-roaming Rico can earn his keep: street races from the green flag and courier runs
// from the depot — they run on their own state, alongside whatever the story is doing.
import { distance } from './random.js';
import { cashBurst, makeCar, makePed, makeSportCar, muzzleFlash } from './vehicles.js';
import { BEACH_DROP, BEACH_MEET, COAST_PARK, MARINA, PORT_SPOT, SHOWROOM_SPOT, STATION_MEET, parkingSpot, randomRoadPoint, resolveBuildings } from './world.js';
import { addWanted, setWanted } from './police.js';

export const HIDEOUT = { x: 150, y: 2100 };
export const RACE_START = { x: 750, y: 750 }; // the green flag, north-west of centre
export const COURIER_DEPOT = { x: 1650, y: 450 }; // the courier depot, north-east

export const MISSIONS = [
  {
    id: 'getaway',
    name: 'First Job: Getaway Driver',
    reward: 400,
    intro: ['Mara Solis: "Rico. You drive, you get paid. The car is marked — get in."', '"Drive it to the hideout, south-west corner. No cops, no problem."'],
    objectives: ['Get in the marked car', 'Drive to the hideout'],
  },
  {
    id: 'pickup',
    name: 'The Pickup',
    reward: 600,
    intro: ['Mara Solis: "A friend is waiting with a package. On foot — keep it quiet."', '"Bring it to the blue door. Do not open it."'],
    objectives: ['Meet the contact', 'Deliver the package to the blue door'],
  },
  {
    id: 'hot',
    name: 'Hot Delivery',
    reward: 900,
    intro: ['Mara Solis: "The package is hot and so are you. Two stars and counting."', '"Ninety seconds to the drop. Drive like Solmar is watching — it is."'],
    objectives: ['Grab the package', 'Deliver it in 90 seconds'],
    timer: 90,
  },
  {
    id: 'tail',
    name: 'The Tail',
    reward: 1200,
    intro: ['Mara Solis: "Follow the grey sedan. Not too close, not too far."', '"If he spots you, the job is blown. Stay in the goldilocks zone."'],
    objectives: ['Tail the grey sedan without being spotted'],
  },
  {
    id: 'heist',
    name: 'The Solmar Heist',
    reward: 2500,
    intro: ['Mara Solis: "Last one, Rico. The armoured car. Take it, lose the heat, bring it home."', '"Do this and Solmar is yours."'],
    objectives: ['Steal the armoured car', 'Lose the heat — reach 0 stars', 'Drive to the hideout'],
  },
  {
    id: 'convoy',
    name: 'The Convoy',
    reward: 1800,
    intro: ['Mara Solis: "A rival crew is moving product across Solmar in a brown van."', '"Follow it. When it parks, the van — and everything in it — is ours."'],
    objectives: ['Follow the rival van until it parks', 'Steal the van', 'Deliver the van to the hideout'],
  },
  {
    id: 'showdown',
    name: 'Harbour Showdown',
    reward: 2200,
    intro: ['Mara Solis: "The harbour crew wants a meet at the marina. It is a trap, obviously."', '"So walk in ready. Four of them, one of you. The cash case is the point."'],
    objectives: ['Go to the marina meet', 'Drop all four rivals', 'Grab the cash case'],
  },
  {
    id: 'swap',
    name: 'The Swap',
    reward: 2600,
    intro: ['Mara Solis: "A buyer at the marina wants one specific car — the teal coupe on your map."', '"Take it to the boardwalk and hand him the keys. Cash, no names, no questions."'],
    objectives: ['Steal the marked car', 'Deliver it to the buyer at the marina'],
  },
  {
    id: 'nightrun',
    name: 'Night Run',
    reward: 2800,
    intro: ['Mara Solis: "Night work, Rico. A courier bag waits across town — the yellow marker."', '"Grab it, then beat the clock to the drop. And Rico — the PD naps lightly."'],
    objectives: ['Reach the courier bag', 'Deliver it before the clock runs out'],
    timer: 75,
  },
  {
    id: 'harbourhaul',
    name: 'Harbour Haul',
    reward: 3000,
    intro: ['Mara Solis: "The dock crews owe me a truck. It sits in the port yards, full of untaxed everything."', '"Take it. The harbour patrol will object — three stars of objection. Bring it home."'],
    objectives: ['Steal the truck at the port yards', 'Lose the heat — reach 0 stars', 'Drive the truck to the hideout'],
  },
  {
    id: 'dawnrun',
    name: 'The Dawn Run',
    reward: 3200,
    intro: ['Mara Solis: "A limousine, Rico. Black, long, and carrying a man who talks too much for his own good."', '"Pick him up and have him at the marina before the city wakes. One hundred seconds."'],
    objectives: ['Get in the limousine', 'Reach the marina drop before the clock runs out'],
    timer: 100,
  },
  {
    id: 'rushhour',
    name: 'Rush Hour',
    reward: 3400,
    intro: ['Mara Solis: "Rush hour, Rico — the whole city is on the street at once, and the lights are not your friends."', '"The red coupe is marked. Take it across downtown to the drop. One hundred and ten seconds, two stars."'],
    objectives: ['Steal the marked coupe', 'Reach the drop before the clock runs out'],
    timer: 110,
  },
  {
    id: 'shipyard',
    name: 'The Shipyard Score',
    reward: 3600,
    intro: ['Mara Solis: "Back to the port, Rico. A case of harbour money changes hands at the yards tonight."', '"Three of their men will object. Drop them, take the case, and bring it home — the patrol will be wide awake."'],
    objectives: ['Go to the port meet', 'Drop all three guards', 'Grab the cash case', 'Bring the case to the hideout'],
  },
  {
    id: 'boardwalk',
    name: 'Boardwalk Business',
    reward: 3800,
    intro: ['Mara Solis: "New turf, Rico — the beach. A crew from the resorts is moving money on the sand, by the pier."', '"Walk in friendly. It will not stay friendly. The case is the point — it always is."'],
    objectives: ['Meet the beach crew on the sand', 'Drop all three of them', 'Grab the cash case', 'Bring the case to the hideout'],
  },
  {
    id: 'coastrun',
    name: 'The Coast Run',
    reward: 4200,
    intro: ['Mara Solis: "The gold coupe by the coast road, Rico — a collector\'s car with a buyer waiting down the beach."', '"Ninety-five seconds along the shore. Mind the promenade crowds — and the two stars that come free."'],
    objectives: ['Steal the marked coupe on the coast road', 'Reach the beach drop before the clock runs out'],
    timer: 95,
  },
  {
    id: 'station',
    name: 'The Station Drop',
    reward: 4400,
    intro: ['Mara Solis: "A courier rides the elevated line with a case for us, Rico. He steps off at Estacion Norte."', '"Meet him under the platform, on foot. The silver coupe is yours for the ride home — if the PD lets you keep it."'],
    objectives: ['Meet the courier under Estacion Norte', 'Get in the silver coupe', 'Reach the hideout before the clock runs out'],
    timer: 100,
  },
  {
    id: 'ambush',
    name: 'The Viaduct Ambush',
    reward: 4600,
    intro: ['Mara Solis: "One more case changes hands tonight, Rico — under the viaduct, where the west avenue crosses the middle of town."', '"The harbour crew calls it a trade. It is not a trade. Three guns, one case, and the whole elevated line watching."'],
    objectives: ['Go to the meet under the viaduct', 'Drop all three of them', 'Grab the cash case', 'Bring the case to the hideout'],
  },
  {
    id: 'finale',
    name: 'One Last Ride',
    reward: 5000,
    intro: ['Mara Solis: "One last ride, Rico. The Vortex GT at the marina showroom."', '"Take it, shake a five-star heat, and park it at the hideout. Then Solmar is truly yours."'],
    objectives: ['Take the Vortex GT from the marina showroom', 'Lose the heat — reach 0 stars', 'Park it at the hideout'],
  },
];

export function createMissions() {
  return {
    index: 0,
    step: 0,
    active: false,
    timer: 0,
    progress: 0,
    spotted: 0,
    targetCar: null,
    contact: null,
    missionCar: null,
    marker: null,
    door: null,
    vanState: null, // convoy: 'driving' while the van rolls, 'parked' once it stops
    parkPoint: null,
    casePoint: null, // showdown: where the cash case waits
    hostiles: [], // showdown: the rival peds, who shoot back
    finishedAll: false,
    sportUnlocked: false,
    // Side activities (street race / courier run), independent of the story.
    activity: {
      kind: null, // null | 'race' | 'delivery'
      step: 0, // delivery: 0 = fetch the package, 1 = drop it off
      timer: 0,
      checkpoints: [],
      cp: 0,
      marker: null,
      par: 0,
      cooldown: 0,
    },
    stats: { races: 0, deliveries: 0 },
  };
}

/** Show dialogue lines at the bottom of the screen for a few seconds each. */
export function say(game, lines) {
  game.dialogue = { lines, index: 0, until: game.time + 4.5 };
}

function placeMissionCar(game, kind, color) {
  const spot = parkingSpot(game.rng);
  const car = makeCar(game.rng, { x: spot.x, y: spot.y, angle: spot.angle, kind, color, missionCar: true });
  game.cars.push(car);
  return car;
}

function farPoint(game, from, minDist) {
  for (let tries = 0; tries < 20; tries += 1) {
    const p = randomRoadPoint(game.rng);
    if (distance(p.x, p.y, from.x, from.y) > minDist) return p;
  }
  return randomRoadPoint(game.rng);
}

/** Begin mission `index` (0-17): set up its cars, people and first marker, say the intro. */
export function startMission(game, index) {
  const m = game.missions;
  const def = MISSIONS[index];
  m.index = index;
  m.step = 0;
  m.active = true;
  m.timer = def.timer || 0;
  m.progress = 0;
  m.spotted = 0;
  m.targetCar = null;
  m.contact = null;
  m.missionCar = null;
  m.marker = null;
  m.door = null;
  m.vanState = null;
  m.parkPoint = null;
  m.casePoint = null;
  m.hostiles = [];
  const player = game.player;
  if (def.id === 'getaway') {
    m.missionCar = placeMissionCar(game, 'mission', '#b8443a');
    m.marker = { x: m.missionCar.x, y: m.missionCar.y };
  } else if (def.id === 'pickup') {
    const p = farPoint(game, player, 500);
    m.contact = { x: p.x, y: p.y, angle: 0, shirt: '#e8b23a', target: null, down: 0, fade: 0, walkPhase: 0, contact: true };
    game.peds.push(m.contact);
    m.marker = { x: p.x, y: p.y };
  } else if (def.id === 'hot') {
    const p = farPoint(game, player, 300);
    m.marker = { x: p.x, y: p.y };
    setWanted(game.police, 2);
  } else if (def.id === 'tail') {
    const spot = randomRoadPoint(game.rng);
    const car = makeCar(game.rng, { x: spot.x, y: spot.y, angle: 0, kind: 'traffic', color: '#6a6a6a', traffic: true, speedTarget: 130 });
    car.loop = [];
    for (let i = 0; i < 4; i += 1) car.loop.push(randomRoadPoint(game.rng));
    car.loopIndex = 0;
    car.target = car.loop[0];
    game.cars.push(car);
    m.targetCar = car;
    m.marker = { x: car.x, y: car.y };
  } else if (def.id === 'heist') {
    m.missionCar = placeMissionCar(game, 'mission', '#2c3e50');
    m.marker = { x: m.missionCar.x, y: m.missionCar.y };
  } else if (def.id === 'convoy') {
    const spot = randomRoadPoint(game.rng);
    const van = makeCar(game.rng, { x: spot.x, y: spot.y, angle: 0, kind: 'mission', shape: 'van', color: '#5a4632', missionCar: true, traffic: true, speedTarget: 120 });
    van.holdTarget = true; // the mission sets the van's target every step; traffic must not re-pick it
    van.loop = [];
    for (let i = 0; i < 4; i += 1) van.loop.push(randomRoadPoint(game.rng));
    van.target = van.loop[0];
    game.cars.push(van);
    m.missionCar = van;
    m.vanState = 'driving';
    m.parkPoint = farPoint(game, spot, 900);
    m.marker = { x: van.x, y: van.y };
  } else if (def.id === 'showdown') {
    m.marker = { x: MARINA.x, y: MARINA.y };
  } else if (def.id === 'swap') {
    m.missionCar = placeMissionCar(game, 'mission', '#2c8a8a');
    m.marker = { x: m.missionCar.x, y: m.missionCar.y };
  } else if (def.id === 'nightrun') {
    m.marker = farPoint(game, player, 700);
  } else if (def.id === 'harbourhaul') {
    const truck = makeCar(game.rng, { x: PORT_SPOT.x, y: PORT_SPOT.y, angle: PORT_SPOT.angle, kind: 'mission', shape: 'van', color: '#8a2f4d', missionCar: true });
    game.cars.push(truck);
    m.missionCar = truck;
    m.marker = { x: truck.x, y: truck.y };
  } else if (def.id === 'dawnrun') {
    const spot = parkingSpot(game.rng);
    const limo = makeCar(game.rng, { x: spot.x, y: spot.y, angle: spot.angle, kind: 'mission', shape: 'limo', color: '#14161a', missionCar: true });
    game.cars.push(limo);
    m.missionCar = limo;
    m.marker = { x: limo.x, y: limo.y };
  } else if (def.id === 'rushhour') {
    m.missionCar = placeMissionCar(game, 'sport', '#d0342c');
    m.marker = { x: m.missionCar.x, y: m.missionCar.y };
  } else if (def.id === 'shipyard') {
    // The meet is on the port street itself, kerbside by the yards where the haul's
    // truck waits: open ground, so the guards can stand and fight on the asphalt.
    m.casePoint = { x: PORT_SPOT.x, y: PORT_SPOT.y };
    m.marker = { x: PORT_SPOT.x, y: PORT_SPOT.y };
  } else if (def.id === 'boardwalk') {
    // The meet is on the sand itself, west of the beach pier: open ground among the
    // umbrellas, so the crew can stand and fight where the swimmers were.
    m.casePoint = { x: BEACH_MEET.x, y: BEACH_MEET.y };
    m.marker = { x: BEACH_MEET.x, y: BEACH_MEET.y };
  } else if (def.id === 'coastrun') {
    // The collector's coupe waits kerbside on the coast road, facing the beach.
    const coupe = makeCar(game.rng, { x: COAST_PARK.x, y: COAST_PARK.y, angle: COAST_PARK.angle, kind: 'mission', shape: 'sport', color: '#c9a13b', missionCar: true });
    game.cars.push(coupe);
    m.missionCar = coupe;
    m.marker = { x: coupe.x, y: coupe.y };
  } else if (def.id === 'station') {
    // The courier steps off the train at Estacion Norte and waits under the platform;
    // the getaway coupe stands kerbside just west of the station, facing east.
    m.contact = { x: STATION_MEET.x, y: STATION_MEET.y, angle: Math.PI / 2, shirt: '#39c2d7', target: null, down: 0, fade: 0, walkPhase: 0, contact: true };
    game.peds.push(m.contact);
    const coupe = makeCar(game.rng, { x: 1010, y: 466, angle: 0, kind: 'mission', shape: 'sport', color: '#c9c9c9', missionCar: true });
    game.cars.push(coupe);
    m.missionCar = coupe;
    m.marker = { x: STATION_MEET.x, y: STATION_MEET.y };
  } else if (def.id === 'ambush') {
    // The meet is on the west avenue itself, in the viaduct's shadow where it crosses
    // the middle of town: open asphalt under the pillars, nowhere to hide.
    m.casePoint = { x: 450, y: 1372 };
    m.marker = { x: 450, y: 1372 };
  } else if (def.id === 'finale') {
    const car = makeSportCar(game.rng, SHOWROOM_SPOT.x, SHOWROOM_SPOT.y);
    car.angle = SHOWROOM_SPOT.angle;
    car.missionCar = true;
    game.cars.push(car);
    m.missionCar = car;
    m.marker = { x: car.x, y: car.y };
  }
  say(game, def.intro);
}

function finishMission(game, events) {
  const m = game.missions;
  const def = MISSIONS[m.index];
  game.cash += def.reward;
  cashBurst(game, game.player.x, game.player.y);
  events.push({ type: 'cash', amount: def.reward });
  if (def.id === 'hot' && !m.sportUnlocked) {
    m.sportUnlocked = true;
    const sport = makeSportCar(game.rng, HIDEOUT.x + 80, HIDEOUT.y);
    game.cars.push(sport);
    events.push({ type: 'unlock', text: 'A Vortex GT is parked at the hideout. It is yours now.' });
  }
  m.active = false;
  m.index += 1;
  if (m.index >= MISSIONS.length) {
    m.finishedAll = true;
    if (def.id === 'finale') {
      say(game, ['Mara Solis: "Five stars and you parked it like a valet. Incredible."', '"Solmar is yours now, Rico. Every street of it. Spend it well."']);
    } else {
      say(game, ['Mara Solis: "You did it, Rico. The whole city saw it."', '"Solmar is yours now. Spend it well."']);
    }
    events.push({ type: 'story-done' });
  } else {
    startMission(game, m.index);
  }
  game.save();
}

/** Restart the current mission after a failure. */
function failMission(game, reason) {
  const m = game.missions;
  say(game, [reason, 'The job restarts. Mara is patient — once.']);
  if (m.targetCar) {
    game.cars = game.cars.filter((c) => c !== m.targetCar);
  }
  if (m.missionCar) {
    game.cars = game.cars.filter((c) => c !== m.missionCar);
  }
  if (m.contact) {
    game.peds = game.peds.filter((p) => p !== m.contact);
  }
  if (m.hostiles.length) {
    game.peds = game.peds.filter((p) => !p.hostile);
  }
  setWanted(game.police, 0);
  startMission(game, m.index);
}

export function currentObjective(game) {
  const m = game.missions;
  if (m.finishedAll) return 'Solmar is yours — free roam';
  if (!m.active) return 'Get to work';
  const def = MISSIONS[m.index];
  let text = `${def.name}: ${def.objectives[m.step]}`;
  if (def.id === 'tail') text += ` — ${Math.floor(m.progress)}%`;
  if (def.id === 'hot' && m.step === 1) text += ` — ${Math.max(0, Math.ceil(m.timer))}s left`;
  if (def.id === 'nightrun' && m.step === 1) text += ` — ${Math.max(0, Math.ceil(m.timer))}s left`;
  if (def.id === 'dawnrun' && m.step === 1) text += ` — ${Math.max(0, Math.ceil(m.timer))}s left`;
  if (def.id === 'rushhour' && m.step === 1) text += ` — ${Math.max(0, Math.ceil(m.timer))}s left`;
  if (def.id === 'coastrun' && m.step === 1) text += ` — ${Math.max(0, Math.ceil(m.timer))}s left`;
  if (def.id === 'station' && m.step === 2) text += ` — ${Math.max(0, Math.ceil(m.timer))}s left`;
  if ((def.id === 'showdown' || def.id === 'shipyard' || def.id === 'boardwalk' || def.id === 'ambush') && m.step === 1) {
    const down = m.hostiles.filter((h) => h.down > 0).length;
    text += ` — ${down} of ${m.hostiles.length} down`;
  }
  return text;
}

/** Where the yellow marker points right now, or null. */
export function missionMarker(game) {
  const m = game.missions;
  if (!m.active || m.finishedAll) return null;
  if (m.marker) return m.marker;
  return null;
}

/** The showdown rivals: they keep their distance, strafe, and shoot back. */
function updateHostiles(game, dt, events) {
  const m = game.missions;
  const player = game.player;
  for (const h of m.hostiles) {
    if (h.down > 0) continue; // down for good: nothing revives a rival in this mission
    const d = distance(h.x, h.y, player.x, player.y);
    const toward = Math.atan2(player.y - h.y, player.x - h.x);
    // Hold a fighting distance: close in when far, back off when crowded, drift sideways.
    let moveAngle = toward + Math.PI / 2; // strafe by default
    let speed = 60;
    if (d > 230) {
      moveAngle = toward;
      speed = 150;
    } else if (d < 120) {
      moveAngle = toward + Math.PI;
      speed = 110;
    }
    h.angle = toward;
    h.x += Math.cos(moveAngle) * speed * dt;
    h.y += Math.sin(moveAngle) * speed * dt;
    resolveBuildings(game.city.buildings, h, 11);
    h.walkPhase += dt * 9;
    h.shootCd -= dt;
    if (d < 300 && h.shootCd <= 0) {
      h.shootCd = 1.7 + game.rng() * 0.9;
      const spread = (game.rng() - 0.5) * 0.21;
      const a = toward + spread;
      game.bullets.push({
        x: h.x + Math.cos(a) * 16,
        y: h.y + Math.sin(a) * 16,
        vx: Math.cos(a) * 620,
        vy: Math.sin(a) * 620,
        life: 0.85,
        hostile: true,
      });
      muzzleFlash(game, h.x + Math.cos(a) * 16, h.y + Math.sin(a) * 16, a);
      if (d < 420) events.push({ type: 'rival-shot', x: h.x, y: h.y });
    }
  }
}

/** One fixed step of the active mission. */
export function updateMissions(game, dt, events) {
  const m = game.missions;
  // Dialogue cycles even between missions: the side activities speak through it too.
  if (game.dialogue && game.time > game.dialogue.until) {
    game.dialogue.index += 1;
    if (game.dialogue.index < game.dialogue.lines.length) game.dialogue.until = game.time + 4.5;
    else game.dialogue = null;
  }
  if (!m.active || m.finishedAll) return;
  const def = MISSIONS[m.index];
  const player = game.player;

  if (def.id === 'getaway') {
    if (m.step === 0) {
      if (player.inCar && player.car === m.missionCar) {
        m.step = 1;
        m.marker = { x: HIDEOUT.x, y: HIDEOUT.y };
        say(game, ['Mara Solis: "Good. Now the hideout — south-west corner."']);
      }
    } else if (distance(player.x, player.y, HIDEOUT.x, HIDEOUT.y) < 90 && player.inCar) {
      finishMission(game, events);
    }
  } else if (def.id === 'pickup') {
    if (m.step === 0) {
      if (distance(player.x, player.y, m.contact.x, m.contact.y) < 46 && !player.inCar) {
        m.step = 1;
        game.peds = game.peds.filter((p) => p !== m.contact);
        m.door = farPoint(game, player, 600);
        m.marker = { x: m.door.x, y: m.door.y };
        say(game, ['Contact: "No questions. Blue door, across town."']);
      }
    } else if (distance(player.x, player.y, m.door.x, m.door.y) < 60 && !player.inCar) {
      finishMission(game, events);
    }
  } else if (def.id === 'hot') {
    if (m.step === 0) {
      if (distance(player.x, player.y, m.marker.x, m.marker.y) < 60) {
        m.step = 1;
        m.door = farPoint(game, player, 800);
        m.marker = { x: m.door.x, y: m.door.y };
        m.timer = 90;
        say(game, ['Mara Solis: "Go. Ninety seconds. Do not stop for anyone."']);
      }
    } else {
      m.timer -= dt;
      if (m.timer <= 0) {
        failMission(game, 'Too slow — the buyer walked away.');
        return;
      }
      if (distance(player.x, player.y, m.door.x, m.door.y) < 70) {
        finishMission(game, events);
      }
    }
  } else if (def.id === 'tail') {
    const target = m.targetCar;
    if (!target) return;
    m.marker = { x: target.x, y: target.y };
    const d = distance(player.x, player.y, target.x, target.y);
    if (d < 90 || d > 480) {
      m.spotted += dt;
      if (m.spotted > 3) {
        failMission(game, 'He spotted you in the mirror. The tail is blown.');
        return;
      }
    } else {
      m.spotted = 0;
      m.progress += dt * 4;
      if (m.progress >= 100) {
        target.traffic = false;
        target.speedTarget = 0;
        finishMission(game, events);
      }
    }
  } else if (def.id === 'heist') {
    if (m.step === 0) {
      if (player.inCar && player.car === m.missionCar) {
        m.step = 1;
        setWanted(game.police, 3);
        m.marker = null;
        say(game, ['Mara Solis: "Three stars. Lose them, then bring it home."']);
      }
    } else if (m.step === 1) {
      if (game.police.wanted === 0) {
        m.step = 2;
        m.marker = { x: HIDEOUT.x, y: HIDEOUT.y };
        say(game, ['Mara Solis: "Clean. Now the hideout."']);
      }
    } else if (distance(player.x, player.y, HIDEOUT.x, HIDEOUT.y) < 90 && player.inCar) {
      finishMission(game, events);
    }
  } else if (def.id === 'convoy') {
    const van = m.missionCar;
    if (!van) return;
    m.marker = { x: van.x, y: van.y };
    if (m.step === 0) {
      // The van rolls its route for a while, then parks at its drop. Stay with it.
      if (m.vanState === 'driving') {
        m.progress += dt;
        const waypoint = m.progress < 42 ? van.loop[Math.floor(m.progress / 10.5) % van.loop.length] : m.parkPoint;
        van.target = waypoint;
        if (m.progress >= 42 && distance(van.x, van.y, m.parkPoint.x, m.parkPoint.y) < 75) {
          van.traffic = false;
          van.speedTarget = 0;
          van.vx = 0;
          van.vy = 0;
          m.vanState = 'parked';
          m.step = 1;
          m.marker = { x: van.x, y: van.y };
          say(game, ['Mara Solis: "It parked. Now take it — the crew will not wait around."']);
        }
      }
      if (distance(player.x, player.y, van.x, van.y) > 700) {
        m.spotted += dt;
        if (m.spotted > 6) {
          failMission(game, 'You lost the convoy in traffic.');
          return;
        }
      } else {
        m.spotted = 0;
      }
    } else if (m.step === 1) {
      if (player.inCar && player.car === van) {
        m.step = 2;
        setWanted(game.police, 2);
        m.marker = { x: HIDEOUT.x, y: HIDEOUT.y };
        say(game, ['Mara Solis: "Two stars and one very full van. Hideout, Rico."']);
      }
    } else if (distance(player.x, player.y, HIDEOUT.x, HIDEOUT.y) < 90 && player.inCar && player.car === van) {
      finishMission(game, events);
    }
  } else if (def.id === 'showdown') {
    if (m.step === 0) {
      if (distance(player.x, player.y, MARINA.x, MARINA.y) < 70) {
        m.step = 1;
        const offsets = [[-110, 0], [110, 0], [-70, 26], [80, -26]];
        m.hostiles = offsets.map(([ox, oy]) => {
          const h = makePed(game.rng, MARINA.x + ox, MARINA.y + oy);
          h.shirt = '#a03a5e';
          h.hostile = true;
          h.shootCd = 0.8 + game.rng() * 0.9;
          game.peds.push(h);
          return h;
        });
        addWanted(game.police, 1);
        m.casePoint = { x: MARINA.x, y: MARINA.y };
        m.marker = null;
        say(game, ['Rival: "Wrong harbour, Vega. The case stays with us."']);
      }
    } else if (m.step === 1) {
      updateHostiles(game, dt, events);
      if (m.hostiles.every((h) => h.down > 0)) {
        m.step = 2;
        m.marker = { x: m.casePoint.x, y: m.casePoint.y };
        say(game, ['Mara Solis: "Quiet at last. Grab the case, Rico."']);
      }
    } else if (distance(player.x, player.y, m.casePoint.x, m.casePoint.y) < 50 && !player.inCar) {
      finishMission(game, events);
    }
  } else if (def.id === 'swap') {
    if (m.step === 0) {
      if (player.inCar && player.car === m.missionCar) {
        m.step = 1;
        setWanted(game.police, 2);
        m.marker = { x: MARINA.x, y: MARINA.y };
        say(game, ['Mara Solis: "Two stars for your trouble. The buyer waits by the pier — move."']);
      }
    } else if (distance(player.x, player.y, MARINA.x, MARINA.y) < 90 && player.inCar && player.car === m.missionCar) {
      finishMission(game, events);
    }
  } else if (def.id === 'nightrun') {
    if (m.step === 0) {
      if (distance(player.x, player.y, m.marker.x, m.marker.y) < 65) {
        m.step = 1;
        m.door = farPoint(game, player, 900);
        m.marker = { x: m.door.x, y: m.door.y };
        m.timer = def.timer || 75;
        setWanted(game.police, 2);
        say(game, ['Mara Solis: "Bag is yours. Seventy-five seconds — and the whole PD heard the alarm."']);
      }
    } else {
      m.timer -= dt;
      if (m.timer <= 0) {
        failMission(game, 'The drop went cold — the buyer vanished into the night.');
        return;
      }
      if (distance(player.x, player.y, m.door.x, m.door.y) < 70) {
        finishMission(game, events);
      }
    }
  } else if (def.id === 'harbourhaul') {
    if (m.step === 0) {
      if (player.inCar && player.car === m.missionCar) {
        m.step = 1;
        setWanted(game.police, 3);
        m.marker = null;
        say(game, ['Mara Solis: "Three stars and a truck full of evidence. Lose them, then home."']);
      }
    } else if (m.step === 1) {
      if (game.police.wanted === 0) {
        m.step = 2;
        m.marker = { x: HIDEOUT.x, y: HIDEOUT.y };
        say(game, ['Mara Solis: "Clean. Now bring the truck home, gently."']);
      }
    } else if (distance(player.x, player.y, HIDEOUT.x, HIDEOUT.y) < 90 && player.inCar) {
      finishMission(game, events);
    }
  } else if (def.id === 'dawnrun') {
    if (m.step === 0) {
      if (player.inCar && player.car === m.missionCar) {
        m.step = 1;
        m.timer = def.timer || 100;
        setWanted(game.police, 2);
        m.marker = { x: MARINA.x, y: MARINA.y };
        say(game, ['Mara Solis: "He is in. One hundred seconds to the marina — make the dawn worth it."']);
      }
    } else {
      m.timer -= dt;
      if (m.timer <= 0) {
        failMission(game, 'Too slow — the passenger took a taxi and talked anyway.');
        return;
      }
      if (distance(player.x, player.y, MARINA.x, MARINA.y) < 90 && player.inCar && player.car === m.missionCar) {
        finishMission(game, events);
      }
    }
  } else if (def.id === 'rushhour') {
    if (m.step === 0) {
      if (player.inCar && player.car === m.missionCar) {
        m.step = 1;
        m.timer = def.timer || 110;
        setWanted(game.police, 2);
        m.door = farPoint(game, player, 950);
        m.marker = { x: m.door.x, y: m.door.y };
        say(game, ['Mara Solis: "Go. Beat the lights, beat the clock — the drop is marked."']);
      }
    } else {
      m.timer -= dt;
      if (m.timer <= 0) {
        failMission(game, 'Too slow — rush hour swallowed the drop window.');
        return;
      }
      if (distance(player.x, player.y, m.door.x, m.door.y) < 75 && player.inCar) {
        finishMission(game, events);
      }
    }
  } else if (def.id === 'shipyard') {
    if (m.step === 0) {
      if (distance(player.x, player.y, m.casePoint.x, m.casePoint.y) < 70) {
        m.step = 1;
        const offsets = [[-90, 6], [80, -10], [-10, 58]];
        m.hostiles = offsets.map(([ox, oy]) => {
          const h = makePed(game.rng, m.casePoint.x + ox, m.casePoint.y + oy);
          h.shirt = '#5b2333';
          h.hostile = true;
          h.shootCd = 0.9 + game.rng() * 0.9;
          game.peds.push(h);
          return h;
        });
        addWanted(game.police, 1);
        m.marker = null;
        say(game, ['Guard: "Wrong yard, Vega. The case stays here."']);
      }
    } else if (m.step === 1) {
      updateHostiles(game, dt, events);
      if (m.hostiles.every((h) => h.down > 0)) {
        m.step = 2;
        m.marker = { x: m.casePoint.x, y: m.casePoint.y };
        say(game, ['Mara Solis: "Quiet among the containers. Grab the case, Rico."']);
      }
    } else if (m.step === 2) {
      if (distance(player.x, player.y, m.casePoint.x, m.casePoint.y) < 50 && !player.inCar) {
        m.step = 3;
        setWanted(game.police, 3);
        m.marker = { x: HIDEOUT.x, y: HIDEOUT.y };
        say(game, ['Mara Solis: "Case is yours. Three stars — bring it home, Rico."']);
      }
    } else if (distance(player.x, player.y, HIDEOUT.x, HIDEOUT.y) < 90 && player.inCar) {
      finishMission(game, events);
    }
  } else if (def.id === 'boardwalk') {
    if (m.step === 0) {
      if (distance(player.x, player.y, m.casePoint.x, m.casePoint.y) < 60 && !player.inCar) {
        m.step = 1;
        // The beach crew spreads out over the sand around the meet: bright shirts,
        // bad intentions, nowhere to hide but the umbrellas.
        const offsets = [[-95, -14], [88, 10], [6, -64]];
        m.hostiles = offsets.map(([ox, oy]) => {
          const h = makePed(game.rng, m.casePoint.x + ox, m.casePoint.y + oy);
          h.shirt = '#e07b39';
          h.hostile = true;
          h.shootCd = 0.9 + game.rng() * 0.9;
          game.peds.push(h);
          return h;
        });
        addWanted(game.police, 1);
        m.marker = null;
        say(game, ['Beach boss: "This sand is ours, Vega. The case stays on it."']);
      }
    } else if (m.step === 1) {
      updateHostiles(game, dt, events);
      if (m.hostiles.every((h) => h.down > 0)) {
        m.step = 2;
        m.marker = { x: m.casePoint.x, y: m.casePoint.y };
        say(game, ['Mara Solis: "Quiet on the beach. Grab the case, Rico."']);
      }
    } else if (m.step === 2) {
      if (distance(player.x, player.y, m.casePoint.x, m.casePoint.y) < 50 && !player.inCar) {
        m.step = 3;
        setWanted(game.police, 3);
        m.marker = { x: HIDEOUT.x, y: HIDEOUT.y };
        say(game, ['Mara Solis: "Case is yours. Three stars over the boardwalk — bring it home."']);
      }
    } else if (distance(player.x, player.y, HIDEOUT.x, HIDEOUT.y) < 90 && player.inCar) {
      finishMission(game, events);
    }
  } else if (def.id === 'coastrun') {
    if (m.step === 0) {
      if (player.inCar && player.car === m.missionCar) {
        m.step = 1;
        m.timer = def.timer || 95;
        setWanted(game.police, 2);
        m.door = { x: BEACH_DROP.x, y: BEACH_DROP.y };
        m.marker = { x: BEACH_DROP.x, y: BEACH_DROP.y };
        say(game, ['Mara Solis: "Ninety-five seconds. Down the coast road, onto the sand, do not stop."']);
      }
    } else {
      m.timer -= dt;
      if (m.timer <= 0) {
        failMission(game, 'Too slow — the buyer walked down the beach and vanished.');
        return;
      }
      if (distance(player.x, player.y, m.door.x, m.door.y) < 75 && player.inCar && player.car === m.missionCar) {
        finishMission(game, events);
      }
    }
  } else if (def.id === 'station') {
    if (m.step === 0) {
      if (distance(player.x, player.y, m.contact.x, m.contact.y) < 46 && !player.inCar) {
        // The handoff: the courier melts back into the station crowd with the case
        // in Rico's hands, and the clock starts on the ride home.
        game.peds = game.peds.filter((p) => p !== m.contact);
        m.contact = null;
        m.step = 1;
        m.marker = { x: m.missionCar.x, y: m.missionCar.y };
        say(game, ['Courier: "Off the Norte train, friend. The case is yours — the coupe, quickly."']);
      }
    } else if (m.step === 1) {
      if (player.inCar && player.car === m.missionCar) {
        m.step = 2;
        m.timer = def.timer || 100;
        setWanted(game.police, 2);
        m.marker = { x: HIDEOUT.x, y: HIDEOUT.y };
        say(game, ['Mara Solis: "Two stars saw the handoff. One hundred seconds — bring the case home, Rico."']);
      }
    } else {
      m.timer -= dt;
      if (m.timer <= 0) {
        failMission(game, 'Too slow — the buyer at the hideout stopped waiting.');
        return;
      }
      if (distance(player.x, player.y, HIDEOUT.x, HIDEOUT.y) < 90 && player.inCar && player.car === m.missionCar) {
        finishMission(game, events);
      }
    }
  } else if (def.id === 'ambush') {
    if (m.step === 0) {
      if (distance(player.x, player.y, m.casePoint.x, m.casePoint.y) < 70) {
        m.step = 1;
        // The harbour crew spreads across the avenue under the pillars: dark red
        // shirts, long guns, and the case on the asphalt between the pillars.
        const offsets = [[-84, -30], [76, 24], [-6, -88]];
        m.hostiles = offsets.map(([ox, oy]) => {
          const h = makePed(game.rng, m.casePoint.x + ox, m.casePoint.y + oy);
          h.shirt = '#5b2333';
          h.hostile = true;
          h.shootCd = 0.9 + game.rng() * 0.9;
          game.peds.push(h);
          return h;
        });
        addWanted(game.police, 1);
        m.marker = null;
        say(game, ['Harbour boss: "Mara sends one man to a trade? The case goes back with us, Vega."']);
      }
    } else if (m.step === 1) {
      updateHostiles(game, dt, events);
      if (m.hostiles.every((h) => h.down > 0)) {
        m.step = 2;
        m.marker = { x: m.casePoint.x, y: m.casePoint.y };
        say(game, ['Mara Solis: "Quiet under the viaduct. Grab the case, Rico."']);
      }
    } else if (m.step === 2) {
      if (distance(player.x, player.y, m.casePoint.x, m.casePoint.y) < 50 && !player.inCar) {
        m.step = 3;
        setWanted(game.police, 3);
        m.marker = { x: HIDEOUT.x, y: HIDEOUT.y };
        say(game, ['Mara Solis: "Case is yours. Three stars under the railway — bring it home."']);
      }
    } else if (distance(player.x, player.y, HIDEOUT.x, HIDEOUT.y) < 90 && player.inCar) {
      finishMission(game, events);
    }
  } else if (def.id === 'finale') {
    if (m.step === 0) {
      if (player.inCar && player.car === m.missionCar) {
        m.step = 1;
        setWanted(game.police, 5);
        m.marker = null;
        say(game, ['Mara Solis: "Five stars. The whole PD. Lose them all."']);
      }
    } else if (m.step === 1) {
      if (game.police.wanted === 0) {
        m.step = 2;
        m.marker = { x: HIDEOUT.x, y: HIDEOUT.y };
        say(game, ['Mara Solis: "Clean. Bring my car home."']);
      }
    } else if (distance(player.x, player.y, HIDEOUT.x, HIDEOUT.y) < 90 && player.inCar) {
      finishMission(game, events);
    }
  }
}

// ---------------------------------------------------------------------------
// Side activities: street races and courier runs. They pay cash, keep their own
// state in game.missions.activity, and can run alongside the story.

function startRace(game, events) {
  const m = game.missions;
  const a = m.activity;
  const checkpoints = [];
  let from = RACE_START;
  let total = 0;
  for (let i = 0; i < 5; i += 1) {
    const p = farPoint(game, from, 650);
    total += distance(from.x, from.y, p.x, p.y);
    checkpoints.push(p);
    from = p;
  }
  a.kind = 'race';
  a.step = 0;
  a.timer = 0;
  a.checkpoints = checkpoints;
  a.cp = 0;
  a.marker = checkpoints[0];
  a.par = total / 230 + 40;
  events.push({ type: 'announce', text: `Street race! Five checkpoints — par ${Math.floor(a.par)}s.` });
  say(game, ['Mara Solis: "A race, Rico? Fine — win it. Green flags, five of them."']);
}

function startDelivery(game) {
  const m = game.missions;
  const a = m.activity;
  a.kind = 'delivery';
  a.step = 0;
  a.timer = 0;
  a.marker = farPoint(game, game.player, 550);
  say(game, ['Dispatcher: "Package waits at the marker. Grab it, then drive it home fast."']);
}

function endActivity(game, cooldown) {
  const a = game.missions.activity;
  a.kind = null;
  a.step = 0;
  a.marker = null;
  a.checkpoints = [];
  a.cp = 0;
  a.cooldown = cooldown;
}

function failActivity(game, reason) {
  say(game, [reason, 'The job is off. Come back when you are ready.']);
  endActivity(game, 10);
}

/** One fixed step of the side activities. Safe to call when nothing is running. */
export function updateActivities(game, dt, events) {
  const m = game.missions;
  const a = m.activity;
  const player = game.player;
  if (a.cooldown > 0) a.cooldown -= dt;
  if (!a.kind) {
    if (a.cooldown > 0) return;
    if (player.inCar && distance(player.x, player.y, RACE_START.x, RACE_START.y) < 55) {
      startRace(game, events);
    } else if (!player.inCar && distance(player.x, player.y, COURIER_DEPOT.x, COURIER_DEPOT.y) < 50) {
      startDelivery(game);
    }
    return;
  }
  if (a.kind === 'race') {
    a.timer += dt;
    if (a.timer > 300) {
      failActivity(game, 'The crowd got bored and went home.');
      return;
    }
    if (distance(player.x, player.y, a.marker.x, a.marker.y) < 62) {
      a.cp += 1;
      if (a.cp >= a.checkpoints.length) {
        const reward = 800 + Math.max(0, Math.round((a.par - a.timer) * 6));
        game.cash += reward;
        m.stats.races += 1;
        cashBurst(game, player.x, player.y);
        events.push({ type: 'cash', amount: reward });
        events.push({ type: 'announce', text: `Race won in ${Math.floor(a.timer)}s — $${reward}.` });
        endActivity(game, 25);
        game.save();
      } else {
        a.marker = a.checkpoints[a.cp];
        events.push({ type: 'checkpoint', x: a.marker.x, y: a.marker.y });
      }
    }
    return;
  }
  // Courier run: fetch on foot, deliver by car, against the clock.
  if (a.step === 0) {
    if (distance(player.x, player.y, a.marker.x, a.marker.y) < 52) {
      a.step = 1;
      a.timer = 80;
      a.marker = farPoint(game, player, 700);
      events.push({ type: 'pickup', x: player.x, y: player.y });
      say(game, ['Dispatcher: "Got it. Eighty seconds to the drop — drive!"']);
    }
  } else {
    a.timer -= dt;
    if (a.timer <= 0) {
      failActivity(game, 'Too late — the customer cancelled.');
      return;
    }
    if (player.inCar && distance(player.x, player.y, a.marker.x, a.marker.y) < 72) {
      const reward = 650 + Math.round(a.timer) * 3;
      game.cash += reward;
      m.stats.deliveries += 1;
      cashBurst(game, player.x, player.y);
      events.push({ type: 'cash', amount: reward });
      events.push({ type: 'announce', text: `Delivered with ${Math.ceil(a.timer)}s to spare — $${reward}.` });
      endActivity(game, 25);
      game.save();
    }
  }
}

/** The objective line for the running activity, or a hint near a start point, or null. */
export function activityObjective(game) {
  const a = game.missions.activity;
  const player = game.player;
  if (a.kind === 'race') {
    return `Street Race: checkpoint ${a.cp + 1} of ${a.checkpoints.length} — ${Math.floor(a.timer)}s (par ${Math.floor(a.par)}s)`;
  }
  if (a.kind === 'delivery') {
    return a.step === 0 ? 'Courier Run: pick up the package' : `Courier Run: deliver it — ${Math.max(0, Math.ceil(a.timer))}s left`;
  }
  if (a.cooldown <= 0) {
    if (!player.inCar && distance(player.x, player.y, RACE_START.x, RACE_START.y) < 60) {
      return 'Street Race: get in a car at the green flag to race';
    }
    if (player.inCar && distance(player.x, player.y, COURIER_DEPOT.x, COURIER_DEPOT.y) < 60) {
      return 'Courier Run: step out at the depot to take the job';
    }
  }
  return null;
}

/** Where the activity marker points right now, or null. */
export function activityMarker(game) {
  const a = game.missions.activity;
  return a.kind ? a.marker : null;
}
