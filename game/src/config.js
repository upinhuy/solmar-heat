// Solmar Heat: shared constants. One place for every number the rest of the game tunes from.
export const WORLD = 2400; // the city is WORLD x WORLD world units
export const ROAD_GAP = 300; // distance between street centrelines
export const ROAD_WIDTH = 64; // drivable width of a street
export const FIRST_ROAD = 150; // centreline of the first street

export const STEP = 1 / 60; // fixed simulation step, seconds

export const PLAYER = {
  radius: 13,
  walkSpeed: 185,
  sprintSpeed: 265,
  health: 100,
  punchDamage: 14,
  punchRange: 36,
  punchCooldown: 0.45,
  shootCooldown: 0.22,
  bulletSpeed: 820,
  bulletDamage: 26,
  regenDelay: 6,
  regenRate: 4,
};

// How much of the city is alive when a run starts. More traffic and more pedestrians make
// the streets feel crowded, which is what the screenshots and the driving both feed on.
// This version crowds downtown harder: half again as many moving cars, a dozen more
// pedestrians and more parked cars at the kerbs. v10 crowds it harder still — four more
// cars working the loop and eight more people on the sidewalks, so the midday frame
// never reads as an empty street.
export const CITY_POPULATION = {
  parkedCars: 22,
  trafficCars: 34,
  pedestrians: 66,
};

// Traffic signals run on one shared cycle, in seconds: five of green for one direction,
// one of amber, then the cross street gets its turn. world.js phases each intersection
// off this cycle with a green-wave offset (signalOffset), so a driver holding traffic
// speed down an avenue meets green after green instead of one city-wide change —
// and the zebra crossings at every intersection get their own walk phase, read off
// the same cycle: a walker crosses while the traffic that would cut the zebra is stopped.
export const SIGNAL_CYCLE = 12;

// The elevated loop line: a three-car train circling downtown on a viaduct built over
// the middle avenues (world.js owns the track geometry). It cruises at city speed,
// brakes into its two stations, holds for the passengers, and pulls away again — a
// working railway, not a backdrop, so its pace matches the traffic below.
export const TRAIN = {
  cars: 3, // head car and two trailers, drawn as one consist
  carLen: 54,
  carWid: 26,
  carGap: 7, // the coupling slack between cars, in world units of track
  speed: 128, // cruise speed along the loop
  accel: 70, // how briskly it pulls away from a station
  brake: 120, // how firmly it slows for one
  dwell: 3.6, // seconds held at a station with the doors open — a touch longer now, so the south-station job can watch a whole stop
  brakeZone: 170, // distance out from a station where the braking starts
};

// The airfield's little prop plane, flying touch-and-go circuits over the north edge:
// it rolls down the runway, lifts off, circles the northern blocks in the sky and comes
// back to land on the same strip, over and over. It lives in the air layer, so it never
// collides with anything on the ground — the same deal as the train and the helicopter.
// Speeds are in world units per second; altitude is 0 on the ground, 1 at cruise.
export const PLANE = {
  cruise: 210, // speed in the air, around the circuit
  roll: 60, // the slow taxi speed mid-runway, between landing and takeoff
  approach: 150, // speed on final approach, easing in for the touchdown
  accel: 95, // how briskly it powers up down the runway
  brake: 150, // how firmly it slows after touching down
  liftAt: 420, // arc length along the runway where the wheels leave the ground
  climbEnd: 560, // arc length where the climb levels off at cruise altitude
  descendAt: 420, // arc length before the loop's end where the descent begins
  altDraw: 46, // how far up the screen the plane is drawn per unit of altitude
  trailRate: 8, // white puffs per second off the tail while it climbs
};

// A thunderstorm's own numbers: how often a bolt answers itself with a second
// strike, how hard the wind gusts inside a storm band, and how fast the flash dies.
export const STORM = {
  doubleStrike: 0.35, // chance a bolt is followed by a second, weaker strike
  gustMax: 0.6, // gusts add up to 60% more rain while a storm is overhead
  flashDecay: 2.4, // lightning brightness lost per second after the strike
};

// The night market quarter: a festival district that comes alive after dark — food
// stalls under string lights, a stage with a band, and crowds that thicken at night.
// The market's own numbers: how many stalls ring the plaza, how big the crowd gets
// by day and by night, and how far the market murmur carries. Ten stalls now: the
// flower seller and the second-hand book stall joined the food row, and paper lanterns
// hang from the string-light spans between the posts, swaying over the crowd. The band
// plays in sets — twenty-five seconds on, fifteen off — and during a set the crowd
// drifts toward the stage and bobs to the beat.
export const MARKET = {
  stalls: 10, // food and flower and book stalls ringing the plaza
  crowdDay: 10, // market browsers by day
  crowdNight: 26, // and by night, when the lanterns are lit — four more than before, so the plaza reads full
  spawnEvery: 1.5, // seconds between extra browsers arriving after dark
  murmurRange: 620, // how far the market's hum carries
  lanterns: 6, // paper lanterns hung from the string-light spans
  setOn: 25, // seconds the band plays per set
  setOff: 15, // seconds of quiet between sets
  gatherRadius: 70, // how close to the stage the crowd gathers during a set
};

// The marina pier after dark: festoon lights strung along the boards, warm dots over
// the water, so the harbour-lights job has its own glow — and so the pier reads at
// night from the boardwalk instead of vanishing into the dark.
export const HARBOUR_LIGHTS = 5; // festoon bulbs along the pier

// Police spike strips: at four stars and above the PD lays a strip across the road
// ahead, ahead of the roadblock. A car that crosses one shreds its tyres — speed and
// grip fall away for a while, the car takes damage and throws tyre smoke — so the
// player either brakes, swerves around the strip's ends, or pays for the shortcut.
export const SPIKE = {
  deployStars: 4, // the heat at which the PD starts laying strips
  maxStrips: 3, // strips out at once; the PD re-lays as they are used up
  length: 40, // across the road: shorter than the street is wide, so it can be dodged
  speedMult: 0.55, // shredded tyres: barely over half speed
  gripMult: 0.5, // and half the grip, so the car slides wide on every corner
  duration: 12, // seconds a shredding lasts before the tyres are swapped (off-screen)
  damage: 12, // the hit itself bends the car a little, on top of the handling loss
  ahead: 380, // how far ahead of the player the strip is laid
  deployTime: 0.6, // seconds a strip takes to unfold on the asphalt before it can bite
};

// The tyre-repair bays: two kerbside workshops where a shredded car can be fixed for
// free — drive over the bay and the tyres are swapped on the spot. A bay goes quiet
// for a while after a repair, then opens again. Both sit on the kerb of a road the
// player actually drives, so a shredding in a chase is a detour, not a death sentence.
export const REPAIR = {
  radius: 30, // drive within this of the bay's centre to use it
  cooldown: 20, // seconds a bay stays closed after a repair
  spots: [
    { x: 470, y: 750, label: 'TALLER RICO' }, // the avenue west of the market
    { x: 1970, y: 1650, label: 'MUELLE 12' }, // the coast road by the marina
  ],
};

export const CAR = {
  radius: 17,
  length: 46,
  width: 24,
  accel: 430,
  reverseAccel: 260,
  maxSpeed: 540,
  maxReverse: 170,
  brake: 720,
  steer: 2.7,
  grip: 2.4, // lateral velocity damping
  drag: 0.5,
};

export const TRAFFIC_SPEED = 150;
export const PED_SPEED = 55;

export const WANTED_MAX = 5;
export const COP = {
  carSpeed: 492,
  footSpeed: 200,
  arrestTime: 1.4,
  spawnDistance: 720,
  despawnDistance: 1700,
  roadblockMinStars: 4, // at this heat the PD starts parking cars across the road ahead
  aimLead: 0.42, // seconds of player travel the chase cars aim ahead by
  heliSpeed: 660, // the five-star helicopter: faster than any car in the city, or it is no threat
  heliLead: 0.35, // seconds of player travel the helicopter aims ahead by
  heliBeamLag: 2.2, // per second: how fast the searchlight's ground pool chases the player — a hard swerve leaves the light behind
  heliBeamRadius: 95, // the pool's radius on the ground: inside it, the lock builds
  heliLockRate: 0.5, // lock gained per second while the beam covers the player
  heliSweepRadius: 230, // the circle the bird sweeps around the player's last seen spot once the beam loses him
  heliCatchup: 1.15, // extra pace while the bird is far behind its target, so a long straight never shakes it for good
  stormSlow: 0.85, // wet roads in a thunderstorm: pursuit cars hold 85% of their pace
};

export const COLORS = {
  grass: '#2e5d3a',
  grassDark: '#274f31',
  road: '#34383f',
  roadLine: '#d8c95a',
  roadEdge: '#9aa0a6',
  roadTrack: 'rgba(0,0,0,0.10)',
  sidewalk: '#6d6a63',
  sidewalkLine: '#5b574f',
  crosswalk: '#cfd4d9',
  windowLit: '#ffd98a',
  windowDark: '#26313f',
  taxi: '#f2c230',
  building: ['#7a5a44', '#5d6b7a', '#8a6f4d', '#4d5d6b', '#75604f', '#66755a'],
  roof: ['#4a3a2e', '#3d4a57', '#5d4a35', '#37424e'],
  player: '#e8b23a',
  playerDark: '#8a6420',
  copCar: '#1c2733',
  copBlue: '#2f6fd0',
  copRed: '#d0342c',
  mission: '#f2c230',
  cash: '#7fd069',
  hud: '#10141a',
  water: '#1d4e6b',
  waterDeep: '#173f57',
  waterLight: '#2a6a8f',
  foam: '#bfe3f2',
  boardwalk: '#8a6f4d',
  boardwalkDark: '#6f573c',
  sand: '#c9b27a',
  sandWet: '#a68f5e',
  // The beach resort district along the south-west shore: dry sand up the beach, a paler
  // packed-sand promenade where the kiosks stand, pastel resort blocks behind the coast
  // road, and the turquoise of their pools.
  sandDry: '#d9c48c',
  sandPale: '#e3d09e',
  pool: '#2fa8b8',
  poolDeep: '#1f7f96',
  resort: ['#e8d8b0', '#dfc9a8', '#cfd8c2', '#e5c1b4', '#d8cf9f', '#c9d4de'],
  plaza: '#7d7468',
  // The night market quarter: warm stall awnings in ten stall colours, lantern
  // gold, the stage's red curtain over a wooden floor, and the spike strips the PD
  // lays across the road — a dark band with steel teeth, dulled once they have bitten.
  // The paper lanterns strung between the posts glow warm after dark; the reflective
  // chevrons painted ahead of a fresh strip warn a driver what is coming; and the
  // tyre-repair bays are painted workshop green with a wrench on the asphalt.
  marketPlaza: '#8a6a52',
  stallAwning: ['#e2583e', '#f2a541', '#3e8f6a', '#d94f70', '#4a7fc1', '#e8b23a', '#7a5fb0', '#c96a3b', '#e87ab0', '#8a6f4d'],
  lantern: '#ffb84d',
  lanternGlow: 'rgba(255,184,77,0.16)',
  stageCurtain: '#a83232',
  stageFloor: '#7a4a2b',
  spikeBand: '#2b2b2b',
  spikeTooth: '#c8ccd2',
  spikeHit: '#8a8f96',
  spikeChevron: '#f2e3c9',
  repairBay: '#2f7a4d',
  repairRing: '#7fd069',
  race: '#3fd06a',
  courier: '#39c2d7',
  hostile: '#a03a5e',
  // The industrial port in the south-east: concrete yards, cargo cranes and stacks of
  // shipping containers in harbour colours.
  yard: '#5d5a54',
  yardLine: '#c9c2a4',
  crane: '#39424e',
  craneDark: '#232a33',
  container: ['#b8443a', '#2c6e9e', '#3f7a4d', '#c97e2c', '#6a6f76', '#7a4d8a', '#a03a5e', '#2c8a8a'],
  // The distant skyline that rings the north and east edges, and the wet sheen the roads
  // take on after dark and in the rain.
  skyline: '#111a28',
  skylineLit: '#ffd98a',
  wetSheen: 'rgba(160,190,230,0.10)',
  // The elevated railway: a concrete viaduct beam on steel-grey pillars, pale rails on
  // dark ties, and the train itself in a teal-and-cream livery with a yellow stripe —
  // bright enough to read across a crowded frame, day or night.
  viaduct: '#4c463f',
  viaductBed: '#5d574e',
  viaductDark: '#35312c',
  railSteel: '#9aa4ac',
  tie: '#2e2a26',
  trainBody: '#0fb5ba',
  trainCream: '#f2e9d8',
  trainStripe: '#f2c230',
  platform: '#7d7468',
  // Wreckage and wear: the dark smoke of a dying engine, and the rust of the dock
  // barrels that split open when a car ploughs through them.
  smokeDark: '#3a3a3a',
  barrel: '#8a5a2c',
  barrelDark: '#5d3c1c',
  // The airfield on the north edge: a dark asphalt strip with white markings and amber
  // edge lights, a pale hangar, and the little prop plane itself — a white fuselage with
  // a blue stripe and a red tail, lit like a toy at dusk.
  runway: '#3a3d42',
  runwayLine: '#e8e8e8',
  runwayLight: '#ffd76a',
  hangar: '#c9c9c9',
  hangarRoof: '#8a8f96',
  planeBody: '#e8e8e8',
  planeStripe: '#2f6fd0',
  planeTail: '#b8443a',
  // A lightning bolt: cold white-blue, the colour the whole screen flashes; its
  // second fork is fainter, and a struck street throws up pale splash rings.
  bolt: '#dfe9ff',
  boltBranch: '#b9c8f5',
  splash: '#c8d6e2',
  // The airfield's extras: the white approach strobes sequencing down the strip, and
  // the windsock by the hangar, orange against the grass.
  runwayStrobe: '#ffffff',
  windsock: '#e8632c',
};

// Neon signboards on the commercial buildings: names and tube colours, assigned per
// building in world.js. After dark these are what make downtown read as a city of lights.
export const SIGN_NAMES = [
  'HOTEL SOLMAR', 'BAR PALMA', 'CAFE LUNA', 'TACOS RIO', 'CLUB VERTIGO', 'PIZZA NONA',
  'GYM ATLAS', 'BARBER 9', 'HOTEL MAR', 'CLUB NEON', 'SUSHI ONDA', 'DISCO FARO',
  'CAFE SOL', 'BAR AZUL', 'TALLER RICO', 'MUELLE 12', 'CARGA SUR', 'ASTILLERO',
  'CINE FARO', 'RAMEN PUERTO', 'TABERNA SOL', 'JOYERIA LUNA', 'TATTOO MAR', 'FLORERIA',
];
export const NEON_COLORS = ['#ff4d8a', '#39c2d7', '#b46aff', '#ffb84d', '#3fd06a', '#ff6a5e'];
export const AWNING_COLORS = ['#b8443a', '#2c8a8a', '#c9a13b', '#7a4d8a'];
// The resort blocks fly their own names over the coast road: beach hotels and bars in
// the same neon, read from the sand as much as from the street.
export const BEACH_SIGN_NAMES = [
  'HOTEL BRISA', 'PALMS RESORT', 'BAR OLA', 'CAFE ARENA', 'CLUB MAREA', 'HOTEL CORAL',
  'BAR BRISA', 'SUITES SOLMAR', 'CHIRINGUITO', 'HOTEL FARO',
];
// Beach umbrellas and loungers: the bright holiday palette the sand is dressed in.
export const UMBRELLA_COLORS = ['#e23b30', '#f2a81d', '#39c2d7', '#3fd06a', '#ff4d8a', '#f2e3c9', '#b46aff'];

export const SAVE_KEY = 'solmar-heat-save-v1';
