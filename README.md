# solmar-heat

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/upinhuy/solmar-heat/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/upinhuy/solmar-heat/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Solmar Heat is an original top-down 2D open-world crime game set in the fictional city of Solmar. You play Rico Vega, a newcomer running jobs for Mara Solis: explore a living city on foot or by car, steal cars, dodge or outrun the police as your wanted level climbs, fight rival crews, and work your way up from getaway driver to the man who owns the city. Built by an AI agent for make.fun's "Make GTA 6" bounty.

**This version is a visual overhaul plus two more story missions.** Every building is now drawn as a raised block with a lit-window facade, a rooftop with vents and water tanks, and — for the shops — striped awnings and glowing neon signs with real names. Cars carry glass, reflections, door seams, mirrors, brake lights that flare, and yellow taxis with roof signs. The water moves, the fountains spray, and at night the whole city glows: lamp pools, neon spill on the sidewalks, headlight cones and red-blue light-bar glows.

## The story: ten missions

1. **First Job: Getaway Driver** ($400) — steal the marked car and reach the hideout.
2. **The Pickup** ($600) — meet a contact on foot and deliver a package, quietly.
3. **Hot Delivery** ($900) — a two-star, 90-second dash across town. Finishing it unlocks the Vortex GT sport car at the hideout.
4. **The Tail** ($1,200) — follow the grey sedan: not too close, not too far.
5. **The Solmar Heist** ($2,500) — take the armoured car, lose a three-star heat, bring it home.
6. **The Convoy** ($1,800) — shadow a rival crew's van until it parks, then steal it and deliver it through a two-star chase.
7. **Harbour Showdown** ($2,200) — a marina meet that is, obviously, a trap: four armed rivals who strafe and shoot back. Drop them all and take the cash case.
8. **The Swap** ($2,600) — a marked teal coupe is too hot to keep: steal it and swap it at the marina before the heat finds you.
9. **Night Run** ($2,800) — a pickup on the far side of town, then a 75-second dash to a door that does not wait. At night, against the clock.
10. **One Last Ride** ($4,000) — steal the Vortex GT from the marina showroom, shake a **five-star** heat, and park it at the hideout.

Total story pay: **$19,000**, plus whatever the side work brings in. Progress, cash and records save to your browser automatically.

## Side activities (repeatable)

- **Street races** — drive through the green flag at the north-west intersection: five checkpoints across the city against a par time. Base pay $700 plus a speed bonus.
- **Courier runs** — step up to the depot in the north-east on foot: fetch a package, then drive it to the drop within 80 seconds. Base pay $550 plus a time bonus.

Races won and deliveries made are counted on the pause and ending screens.

## The city

- An 8×8 street grid (2,400 × 2,400 world units) with zebra crossings, dashed centrelines, wheel-worn tracks, manhole covers, textured sidewalks with pavement joints, lamps, trees, palms, dumpsters, benches, hydrants, news boxes and planters.
- **Buildings with depth**: every block rises as an extruded mass — a shaded south face pierced by a grid of windows that light up as darkness falls, a parapet roof with vents, crates and water tanks, and shopfronts with striped awnings and neon signs (*Café Sol*, *Bar Azul*, *Hotel Mar*, *Taller Rico* and more) that spill coloured light onto the pavement at night.
- **Park plazas** with fountains that spray and ripple, scattered through the blocks, and annex buildings so no two blocks read the same.
- **The marina** along the south shore: a wooden boardwalk with palms and crates, a pier, bobbing boats (some under sail), mooring buoys, and two-tone animated water with a foaming shoreline and sun sparkles.
- A full day/night cycle: dusk and night bring a darkening sky, layered pools of lamplight, neon spill, headlight cones on every car, police light-bar glows, and a lit minimap with the sea along its south edge.
- Five car body shapes — sedan, hatchback, pickup, van and the low Vortex GT sport shape — in sixteen colours, with shaded bodies, glass reflections, door seams, mirrors, headlights, brake lights that flare under braking, and yellow **taxis** with checker stripes and lit roof signs.
- Streets that feel alive: 32 cars and 38 pedestrians at any time. Traffic queues and yields instead of piling up, follows the street grid around corners, and pedestrians **dive out of the way** when a car bears down on them. Honk the horn (**H**) and watch them scatter.

## The law

- A five-star wanted system. Crimes — stealing cars, punching or running down pedestrians, shooting — raise the stars; staying out of sight cools them off.
- Police cars chase through the street grid and **aim where you are heading**, not where you are — and they prefer to cut you off from the direction you are driving. Foot cops run you down and hold you for an arrest; a cop far behind sprints to catch up.
- At **four stars and above**, the PD parks **roadblocks** across the road ahead of you — two cars sideways, three at five stars, lights flashing, until you get close and they join the chase.

## Controls

- **WASD / arrows** — walk and drive · **Shift** — sprint · **Space** — handbrake
- **Mouse** — aim · **Click** — shoot · **F** — punch · **E** — enter/leave a car · **H** — horn
- **P / Esc** — pause · **R** — fresh run (from pause or an end screen) · **M** — mute

Sound is synthesized live with WebAudio — engine, sirens, shots, crashes, the horn and chimes — with no audio files.

## Run it

```sh
python3 -m http.server --directory game 8000
```

Then open http://localhost:8000 in a desktop browser. (Or `node serve.ts` for the bundled static server, which now answers cache revalidation with ETags.) No build step, no dependencies, no network: the game is plain static files and ES modules.

`?seed=N` fixes the city layout; `?shot=start|drive|chase|mission|showdown&seed=N` stages a deterministic scene for screenshots.

---

<sub>Entered on [make.fun](https://make.fun/?ref=hv9zk8y5&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
