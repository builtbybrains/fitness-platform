#!/usr/bin/env node
/* Usage: node scripts/import-exercises.mjs [--write]
   Reads supabase/functions/_shared/exercise-sheet.csv (the owner's exercise
   sheet) and prints the x(...) rows of the exercise library, one per sheet
   row, in sheet ID order. With --write it replaces the rows between the
   `// <sheet-rows>` and `// </sheet-rows>` markers in both copies of
   exercises.ts (mobile/src/data and supabase/functions/_shared), which must
   stay byte-identical.

   The sheet gives name, muscle group, equipment, pattern, level and type.
   The tables below hold everything the sheet does not: the id (an existing
   library id is reused when the sheet row is the same movement), the form
   cue, injury cautions and the default dose. Node standard library only. */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHEET = join(ROOT, 'supabase/functions/_shared/exercise-sheet.csv');
const TARGETS = [join(ROOT, 'mobile/src/data/exercises.ts'), join(ROOT, 'supabase/functions/_shared/exercises.ts')];

// ───────────────────────────── CSV ─────────────────────────────

/** RFC 4180-ish: quoted fields, "" inside quotes, CRLF or LF. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f !== '')) rows.push(row);
  return rows;
}

export function readSheet(path = SHEET) {
  const [header, ...rows] = parseCsv(readFileSync(path, 'utf8').replace(/^﻿/, ''));
  const col = (name) => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`exercise sheet: no "${name}" column`);
    return i;
  };
  const c = {
    id: col('ID'), group: col('Muscle Group'), name: col('Exercise Name'), primary: col('Primary Muscle'),
    secondary: col('Secondary Muscles'), equipment: col('Equipment'), pattern: col('Movement Pattern'),
    difficulty: col('Difficulty'), unilateral: col('Unilateral'), type: col('Exercise Type'),
  };
  return rows.map((r) => ({
    sheetId: Number(r[c.id]),
    group: r[c.group].trim(),
    name: r[c.name].trim(),
    primary: r[c.primary].trim(),
    secondary: r[c.secondary].trim(),
    equipment: r[c.equipment].trim(),
    pattern: r[c.pattern].trim(),
    difficulty: r[c.difficulty].trim(),
    unilateral: /^yes$/i.test(r[c.unilateral].trim()),
    type: r[c.type].trim(),
  }));
}

// ───────────────────────────── mappings ─────────────────────────────

/** Sheet equipment word → library Equipment. NOWHERE = nothing a gym or a
    home can be assumed to have: the row stays in the library with
    planner: false. Judgement calls are commented. */
const NOWHERE = 'nowhere';
const EQUIPMENT = {
  bodyweight: 'none', mat: 'none', wall: 'none', floor: 'none', step: 'none', doorframe: 'none',
  'stability ball': 'none', // no gym or home item fits; it is cheap and light, treated as bodyweight
  'jump rope': 'none',
  cones: 'none', // any markers do; the row itself needs open space, see PLANNER_OFF
  dumbbell: 'dumbbells', dumbbells: 'dumbbells', 'light dumbbells': 'dumbbells',
  barbell: 'barbell', 'ez curl bar': 'barbell', 'ez bar': 'barbell', 'landmine barbell': 'barbell',
  'squat rack': 'barbell', 'weight plate': 'barbell', 'weight plates': 'barbell',
  bench: 'bench', 'incline bench': 'bench', 'high bench': 'bench', box: 'bench', 'plyo box': 'bench',
  'resistance band': 'bands', 'mini resistance band': 'bands', 'mini band': 'bands',
  kettlebell: 'kettlebell', kettlebells: 'kettlebell',
  'pull-up bar': 'pullup_bar', 'parallel bars': 'pullup_bar', bar: 'pullup_bar', support: 'pullup_bar',
  'cable machine': 'machines', 'smith machine': 'machines', 'leg press machine': 'machines',
  'leg extension machine': 'machines', 'leg curl machine': 'machines', 'seated leg curl machine': 'machines',
  'calf raise machine': 'machines', 'seated calf machine': 'machines', 'calf machine': 'machines',
  'pec deck machine': 'machines', 'reverse pec deck machine': 'machines', 'chest press machine': 'machines',
  'assisted dip machine': 'machines', 'assisted pull-up machine': 'machines', 't-bar row machine': 'machines',
  'high row machine': 'machines', 'row machine': 'machines', 'hack squat machine': 'machines',
  'ghd machine': 'machines', 'hip abduction machine': 'machines', 'reverse hyper machine': 'machines',
  'shoulder press machine': 'machines', 'preacher curl machine': 'machines', "captain's chair": 'machines',
  treadmill: 'machines', 'stationary bike': 'machines', 'air bike': 'machines', 'rowing machine': 'machines',
  'elliptical machine': 'machines', 'stair machine': 'machines', 'weighted sled': 'machines',
  'back extension bench': 'machines', // a gym station, not a flat bench
  'preacher bench': 'machines', // a gym station, not a flat bench
  rope: 'machines', // the cable rope attachment (every rope row also lists the cable machine)
  'straight bar': 'machines', // the cable straight-bar attachment, not a barbell
  // Small gym-only kit with no word of its own: counted as gym kit.
  'ab wheel': 'machines', 'battle ropes': 'machines', 'medicine ball': 'machines', sandbag: 'machines',
  partner: NOWHERE, track: NOWHERE, 'swimming pool': NOWHERE,
};

/** Rows that need space or a place, not equipment: kept, never prescribed. */
const PLANNER_OFF = new Set([
  'Outdoor Running', // needs a safe outdoor route; Treadmill Running covers it in a plan
  'Shuttle Runs', // needs about 20 m of open floor
]);

function equipmentOf(cell) {
  const out = [];
  let nowhere = false;
  for (let part of cell.split(',')) {
    part = part.trim().toLowerCase();
    if (!part || /\boptional\b/.test(part)) continue;
    part = part.split(/\s+or\s+/)[0].trim();
    const k = EQUIPMENT[part];
    if (k === undefined) throw new Error(`exercise sheet: unknown equipment "${part}" (add it to EQUIPMENT)`);
    if (k === NOWHERE) nowhere = true;
    else if (!out.includes(k)) out.push(k);
  }
  const real = out.filter((k) => k !== 'none');
  return { equipment: real.length ? real : ['none'], nowhere };
}

const PATTERN = {
  'Horizontal Push': 'push_horizontal', 'Incline Push': 'push_horizontal',
  'Vertical Push': 'push_vertical', 'Diagonal Push': 'push_vertical',
  'Horizontal Pull': 'pull_horizontal', 'Vertical Pull': 'pull_vertical',
  Squat: 'squat', 'Isometric Hold': 'squat', 'Squat to Press': 'squat',
  Lunge: 'lunge', 'Step-Up': 'lunge', 'Step-Up to Press': 'lunge',
  'Hip Hinge': 'hinge', 'Hip Extension': 'hinge', 'Olympic Lift': 'hinge', 'Explosive Pull': 'hinge',
  Carry: 'carry',
  'Core Flexion': 'core', 'Anti-Extension': 'core', 'Anti-Rotation': 'core', 'Core Rotation': 'core',
  'Lateral Stability': 'core', 'Core Stability': 'core', 'Lateral Flexion': 'core', 'Back Extension': 'core',
  'Ground to Stand': 'core',
  'Chest Isolation': 'isolation', 'Shoulder Isolation': 'isolation', 'Knee Extension': 'isolation',
  'Knee Flexion': 'isolation', 'Calf Raise': 'isolation', 'Arm Curl': 'isolation', 'Triceps Extension': 'isolation',
  'Hip Abduction': 'isolation', 'Shoulder Extension': 'isolation', 'Scapular Control': 'isolation',
  'Scapular Elevation': 'isolation', 'External Rotation': 'isolation', 'Wrist Flexion': 'isolation',
  'Wrist Extension': 'isolation', 'Ankle Dorsiflexion': 'isolation', 'Grip Hold': 'isolation',
  Conditioning: 'conditioning', 'Jump / Land': 'conditioning', 'Lateral Jump': 'conditioning',
  'Power Throw': 'conditioning', Crawl: 'conditioning', 'Push / Drive': 'conditioning', 'Pull / Drive': 'conditioning',
  Complex: 'conditioning', 'Steady-State Cardio': 'conditioning', Intervals: 'conditioning',
  'Spinal Mobility': 'mobility', 'Full-Body Mobility': 'mobility', 'Thoracic Rotation': 'mobility',
  'Hip Rotation': 'mobility', 'Squat Mobility': 'mobility', 'Hip Extension Mobility': 'mobility',
  'Chest Stretch': 'mobility', 'Shoulder Mobility': 'mobility', 'Ankle Mobility': 'mobility',
  'Hamstring Mobility': 'mobility', 'Hip Mobility': 'mobility', 'Wrist Mobility': 'mobility', 'Quad Stretch': 'mobility',
};

/** Muscle words in the Primary and Secondary columns → library Muscle. */
const MUSCLE_WORDS = [
  [/tricep/, 'triceps'],
  [/delt|shoulder|rotator/, 'shoulders'],
  [/bicep|forearm|brachi|grip|wrist/, 'biceps'],
  [/\blats?\b|back|trap|erector|thoracic|spine/, 'back'],
  [/chest/, 'chest'],
  [/^core$|\babs\b|oblique|hip flexor|deep core/, 'core'],
  [/glute|^hips?\b|^hip /, 'glutes'],
  [/hamstring/, 'hamstrings'],
  [/quad|adductor/, 'quads'],
  [/calve|calf|tibialis|ankle/, 'calves'],
  [/cardio/, 'cardio'],
  [/^legs$/, ['quads', 'glutes']],
];
const IGNORED_WORDS = new Set(['', '—', '-', 'full body', 'arms', 'upper body']);

function musclesIn(text) {
  const w = text.trim().toLowerCase();
  if (IGNORED_WORDS.has(w)) return [];
  for (const [re, m] of MUSCLE_WORDS) if (re.test(w)) return Array.isArray(m) ? m : [m];
  throw new Error(`exercise sheet: unknown muscle "${text}" (add it to MUSCLE_WORDS)`);
}

/** Main muscle: the Muscle Group, refined by the Primary Muscle. */
function muscleOf(row) {
  const p = row.primary.toLowerCase();
  switch (row.group) {
    case 'Chest': return 'chest';
    case 'Back': return 'back';
    case 'Shoulders': return 'shoulders';
    case 'Glutes': return 'glutes';
    case 'Core': return 'core';
    case 'Full Body': return 'full_body';
    case 'Cardio': return 'cardio';
    case 'Arms': return /tricep/.test(p) ? 'triceps' : 'biceps'; // forearms, grip and brachialis → biceps
    case 'Legs': return /hamstring/.test(p) ? 'hamstrings' : /calves|tibialis/.test(p) ? 'calves' : 'quads'; // adductors → quads
    case 'Mobility':
      if (/hip flexor/.test(p)) return 'quads'; // the couch and kneeling stretches open the front of the thigh
      if (/hip/.test(p)) return 'glutes';
      if (/thoracic|spine|lats/.test(p)) return 'back';
      if (/ankle/.test(p)) return 'calves';
      if (/shoulder/.test(p)) return 'shoulders';
      if (/hamstring/.test(p)) return 'hamstrings';
      if (/chest/.test(p)) return 'chest';
      if (/quad/.test(p)) return 'quads';
      if (/wrist/.test(p)) return 'biceps'; // forearm area, as for Arms
      return 'full_body';
    default: throw new Error(`exercise sheet: unknown muscle group "${row.group}"`);
  }
}

function secondaryOf(row, muscle) {
  const out = [];
  const add = (ms) => { for (const m of ms) if (m !== muscle && !out.includes(m)) out.push(m); };
  // A primary muscle the group does not name (Deadlift: Full Body, glutes) is listed first.
  if (!/full body|cardiorespiratory/i.test(row.primary)) add(musclesIn(row.primary.split('/')[0]));
  for (const w of row.secondary.split(',')) add(musclesIn(w));
  return out;
}

const KIND = { Strength: 'strength', Power: 'power', Conditioning: 'conditioning', Mobility: 'mobility' };

/** Injury areas, from the movement and the name. Errs on listing one. */
function cautionsFor(row, pattern, equipment) {
  const c = new Set();
  const mp = row.pattern;
  const n = row.name.toLowerCase();
  const raw = row.equipment.toLowerCase();
  const loaded = equipment.some((k) => k === 'barbell' || k === 'machines');
  const jumps = /\bjump|\bhops?\b|sprint|running|shuttle|burpee|skater/.test(n) || mp === 'Jump / Land' || mp === 'Lateral Jump';
  // knee: squats, lunges, step-ups, jumps, knee-joint machines, kneeling
  if (['Squat', 'Lunge', 'Step-Up', 'Step-Up to Press', 'Squat to Press', 'Isometric Hold', 'Knee Extension', 'Knee Flexion'].includes(mp) || jumps) c.add('knee');
  if (/kneeling|couch|pigeon|deep squat|sled push/.test(n)) c.add('knee');
  // ankle: jumps, sprints, calf and ankle work
  if (jumps || ['Calf Raise', 'Ankle Dorsiflexion', 'Ankle Mobility'].includes(mp)) c.add('ankle');
  // lower back: hinges, deadlifts, good mornings, Olympic lifts, bent-over rows, back extensions, loaded squats, twists
  if (['Hip Hinge', 'Olympic Lift', 'Explosive Pull', 'Back Extension', 'Complex', 'Core Rotation'].includes(mp)) c.add('lower_back');
  if (mp === 'Hip Extension' && loaded) c.add('lower_back');
  if (mp === 'Horizontal Pull' && /barbell|dumbbell/.test(raw) && !/chest-supported|seal/.test(n)) c.add('lower_back'); // bent-over rows
  if (pattern === 'squat' && /barbell/.test(raw)) c.add('lower_back');
  if (/sit-up|v-up|windshield|sandbag|ab wheel|sled|turkish|superman/.test(n)) c.add('lower_back');
  // shoulder: overhead pressing, dips, flys, raises, hanging, upright pulls
  if (['Vertical Push', 'Diagonal Push', 'Squat to Press', 'Step-Up to Press', 'Olympic Lift', 'Complex', 'Chest Isolation', 'Shoulder Isolation', 'Shoulder Extension'].includes(mp)) c.add('shoulder');
  if (/dip|handstand|pull-up|chin-up|hanging|high pull|snatch|battle|slam|ab wheel|turkish|pass-through|upright|behind/.test(n)) c.add('shoulder');
  if ((mp === 'Horizontal Push' || mp === 'Incline Push') && /barbell|smith/.test(raw)) c.add('shoulder');
  // wrist: push-ups, planks on the hands, handstands, racked catches, wrist work
  if (/push-up|handstand|bear |burpee|mountain|devil|clean|snatch|front squat/.test(n)) c.add('wrist');
  if (['Wrist Flexion', 'Wrist Extension', 'Grip Hold'].includes(mp)) c.add('wrist');
  // elbow: curls, extensions, skull crushers, dips, close-grip pressing
  if (['Arm Curl', 'Triceps Extension'].includes(mp) || /skull|dip|close-grip/.test(n)) c.add('elbow');
  // hip: deep lateral and single-leg work, hip mobility under load
  if (/cossack|copenhagen|lateral lunge|pistol|pigeon|90\/90|deep squat/.test(n)) c.add('hip');
  // neck: crunching with the head, shrugs, handstands
  if (/crunch|sit-up|toe touch|heel touch|v-up|shrug|handstand/.test(n)) c.add('neck');
  const order = ['knee', 'lower_back', 'shoulder', 'wrist', 'elbow', 'hip', 'ankle', 'neck'];
  return order.filter((k) => c.has(k));
}

const COMPOUND = new Set(['push_horizontal', 'push_vertical', 'pull_horizontal', 'pull_vertical', 'squat', 'hinge', 'lunge']);
const HOLD = /\bhold\b|plank|hollow|wall sit|stir the pot/i;

/** Default dose for a new row. */
function doseFor(row, pattern, kind, level) {
  if (kind === 'mobility') return { unit: 's', sets: 2, reps: 30, rest: 30 };
  if (kind === 'power') return { unit: 'reps', sets: 4, reps: 5, rest: 120 };
  if (kind === 'conditioning') {
    if (row.pattern === 'Steady-State Cardio') return { unit: 's', sets: 1, reps: 900, rest: 0 };
    if (row.pattern === 'Intervals') return { unit: 's', sets: 6, reps: 30, rest: 60 };
    if (/Drive/.test(row.pattern)) return { unit: 'm', sets: 4, reps: 20, rest: 90 };
    return { unit: 's', sets: 4, reps: 30, rest: 45 };
  }
  if (pattern === 'carry') return { unit: 'm', sets: 3, reps: 30, rest: 60 };
  if (row.pattern === 'Calf Raise') return { unit: 'reps', sets: 3, reps: 15, rest: 45 };
  if (HOLD.test(row.name) || row.pattern === 'Grip Hold' || row.pattern === 'Lateral Stability') return { unit: 's', sets: 3, reps: 30, rest: pattern === 'core' ? 45 : 60 };
  if (COMPOUND.has(pattern)) return level === 'beginner' ? { unit: 'reps', sets: 3, reps: 10, rest: 90 } : { unit: 'reps', sets: 4, reps: level === 'advanced' ? 6 : 8, rest: 90 };
  return { unit: 'reps', sets: 3, reps: 12, rest: 60 };
}

const slug = (s) => s.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// ───────────────────────────── hand-written fields ─────────────────────────────

/** Sheet rows that are the same movement as an exercise already in the
    library: the old id, cue, cautions, dose and aliases are kept (and the
    old name becomes an alias), so stored plans and videos keep working. */
const REUSED = {
  1: {id: "barbell_bench", name: "Barbell bench press", cautions: ["shoulder", "wrist"], unit: "reps", sets: 3, reps: 8, rest: 120, cue: "Feet planted, bar to lower chest, use a spotter or safeties.", aliases: ["Bench press"]},
  2: {id: "incline_db_press", name: "Incline dumbbell press", cautions: ["shoulder"], unit: "reps", sets: 3, reps: 10, rest: 90, cue: "Bench at about 30 degrees, wrists stacked over elbows."},
  3: {id: "cable_fly", name: "Cable fly", cautions: ["shoulder"], unit: "reps", sets: 3, reps: 12, rest: 60, cue: "Step forward, slight lean, bring hands together in an arc."},
  4: {id: "chest_dip", name: "Parallel bar dip", cautions: ["shoulder", "elbow"], unit: "reps", sets: 3, reps: 8, rest: 90, cue: "Lean forward slightly, lower until shoulders are level with elbows."},
  6: {id: "db_bench_press", name: "Dumbbell bench press", cautions: ["shoulder"], unit: "reps", sets: 3, reps: 10, rest: 90, cue: "Shoulder blades back and down, lower to mid-chest."},
  8: {id: "close_grip_bench", name: "Close-grip bench press", cautions: ["wrist", "shoulder"], unit: "reps", sets: 3, reps: 8, rest: 120, cue: "Hands shoulder-width, elbows tucked."},
  9: {id: "pull_up", name: "Pull-up", cautions: ["shoulder", "elbow"], unit: "reps", sets: 3, reps: 6, rest: 120, cue: "Start from a dead hang, chest to the bar."},
  10: {id: "lat_pulldown", name: "Lat pulldown", cautions: ["shoulder"], unit: "reps", sets: 3, reps: 12, rest: 90, cue: "Pull the bar to your upper chest, no swinging."},
  11: {id: "seated_cable_row", name: "Seated cable row", cautions: ["lower_back"], unit: "reps", sets: 3, reps: 12, rest: 90, cue: "Chest up, pull to your belly, pause.", aliases: ["Seated row", "Cable row"]},
  13: {id: "barbell_row", name: "Barbell bent-over row", cautions: ["lower_back"], unit: "reps", sets: 3, reps: 8, rest: 120, cue: "Hinge to about 45 degrees, bar to your lower ribs."},
  14: {id: "db_row", name: "One-arm dumbbell row", cautions: ["lower_back"], unit: "reps", sets: 3, reps: 12, rest: 90, cue: "Hand on a chair or knee, flat back, elbow to hip."},
  15: {id: "chest_supported_db_row", name: "Chest-supported dumbbell row", cautions: [], unit: "reps", sets: 3, reps: 12, rest: 90, cue: "Chest on an inclined bench, squeeze shoulder blades."},
  16: {id: "cable_face_pull", name: "Face pull", cautions: [], unit: "reps", sets: 3, reps: 15, rest: 60, cue: "Rope at eye height, pull apart to your ears.", aliases: ["Cable face pull"]},
  17: {id: "back_squat", name: "Back squat", cautions: ["knee", "lower_back"], unit: "reps", sets: 3, reps: 8, rest: 150, cue: "Brace, break at hips and knees together, use safeties.", aliases: ["Barbell back squat", "Barbell squat"]},
  18: {id: "leg_press", name: "Leg press", cautions: ["knee"], unit: "reps", sets: 3, reps: 10, rest: 120, cue: "Lower back stays on the pad, no locking knees."},
  19: {id: "walking_lunge", name: "Walking lunge", cautions: ["knee"], unit: "reps", sets: 3, reps: 12, rest: 90, cue: "Step long, back knee hovers above the floor."},
  20: {id: "leg_extension", name: "Leg extension", cautions: ["knee"], unit: "reps", sets: 3, reps: 12, rest: 60, cue: "Pause at the top, lower slowly."},
  21: {id: "calf_raise", name: "Standing calf raise", cautions: ["ankle"], unit: "reps", sets: 3, reps: 15, rest: 45, cue: "On a step edge, full stretch then full rise.", aliases: ["Calf raise"]},
  22: {id: "barbell_rdl", name: "Romanian deadlift", cautions: ["lower_back"], unit: "reps", sets: 3, reps: 8, rest: 120, cue: "Soft knees, flat back, stop at a hamstring stretch.", aliases: ["Barbell Romanian deadlift", "RDL"]},
  23: {id: "hip_thrust", name: "Barbell hip thrust", cautions: ["lower_back"], unit: "reps", sets: 3, reps: 10, rest: 120, cue: "Upper back on the bench, chin tucked, lock out with glutes."},
  24: {id: "leg_curl", name: "Leg curl", cautions: ["knee"], unit: "reps", sets: 3, reps: 12, rest: 60, cue: "Hips stay down, squeeze at the top.", aliases: ["Lying leg curl", "Seated leg curl"]},
  25: {id: "bulgarian_split_squat", name: "Bulgarian split squat", cautions: ["knee", "hip"], unit: "reps", sets: 3, reps: 10, rest: 90, cue: "Back foot on a chair, front shin fairly upright."},
  27: {id: "barbell_ohp", name: "Barbell overhead press", cautions: ["shoulder", "lower_back"], unit: "reps", sets: 3, reps: 6, rest: 120, cue: "Squeeze glutes, bar travels close to your face."},
  28: {id: "lateral_raise", name: "Lateral raise", cautions: ["shoulder"], unit: "reps", sets: 3, reps: 15, rest: 60, cue: "Lead with the elbows, stop at shoulder height.", aliases: ["Dumbbell lateral raise"]},
  29: {id: "rear_delt_fly", name: "Dumbbell rear delt fly", cautions: ["lower_back"], unit: "reps", sets: 3, reps: 15, rest: 60, cue: "Hinge forward, open arms wide with soft elbows."},
  30: {id: "arnold_press", name: "Arnold press", cautions: ["shoulder"], unit: "reps", sets: 3, reps: 12, rest: 90, cue: "Rotate palms out as you press."},
  31: {id: "barbell_curl", name: "Barbell curl", cautions: ["elbow", "wrist"], unit: "reps", sets: 3, reps: 10, rest: 60, cue: "Shoulder-width grip, control the way down."},
  32: {id: "db_overhead_extension", name: "Dumbbell overhead triceps extension", cautions: ["elbow", "shoulder"], unit: "reps", sets: 3, reps: 12, rest: 60, cue: "Elbows point forward, lower behind your head."},
  33: {id: "hammer_curl", name: "Hammer curl", cautions: ["elbow"], unit: "reps", sets: 3, reps: 12, rest: 60, cue: "Palms facing each other the whole way."},
  34: {id: "cable_pushdown", name: "Cable triceps push-down", cautions: ["elbow"], unit: "reps", sets: 3, reps: 12, rest: 60, cue: "Elbows at your sides, push to straight arms.", aliases: ["Triceps push-down", "Tricep pushdown"]},
  37: {id: "cable_crunch", name: "Cable crunch", cautions: ["lower_back", "neck"], unit: "reps", sets: 3, reps: 12, rest: 60, cue: "Kneel, crunch ribs to hips."},
  39: {id: "plank", name: "Plank", cautions: ["shoulder"], unit: "s", sets: 3, reps: 40, rest: 45, cue: "Elbows under shoulders, squeeze glutes."},
  40: {id: "deadlift", name: "Deadlift", cautions: ["lower_back"], unit: "reps", sets: 3, reps: 5, rest: 150, cue: "Bar over mid-foot, brace, push the floor away.", aliases: ["Barbell deadlift", "Conventional deadlift"]},
  41: {id: "goblet_squat", name: "Goblet squat", cautions: ["knee"], unit: "reps", sets: 3, reps: 12, rest: 90, cue: "Hold the dumbbell at your chest, elbows inside knees."},
  42: {id: "push_up", name: "Push-up", cautions: ["wrist", "shoulder"], unit: "reps", sets: 3, reps: 12, rest: 90, cue: "Body in one straight line, chest to a fist from the floor.", aliases: ["Push-up ladder", "Push ups", "Pushups"]},
  44: {id: "farmer_carry", name: "Farmer's carry", cautions: [], unit: "m", sets: 3, reps: 30, rest: 60, cue: "Heavy dumbbells, tall posture, short quick steps."},
  45: {id: "kb_swing", name: "Kettlebell swing", cautions: ["lower_back"], unit: "reps", sets: 3, reps: 15, rest: 90, cue: "Snap the hips; arms only guide the bell."},
  46: {id: "burpee", name: "Burpee", cautions: ["knee", "wrist", "shoulder"], unit: "reps", sets: 3, reps: 10, rest: 60, cue: "Step back instead of jumping to make it easier."},
  49: {id: "incline_push_up", name: "Incline push-up", cautions: ["wrist"], unit: "reps", sets: 3, reps: 12, rest: 90, cue: "Hands on a sturdy table or step; the higher, the easier."},
  50: {id: "decline_push_up", name: "Decline push-up", cautions: ["wrist", "shoulder"], unit: "reps", sets: 3, reps: 10, rest: 90, cue: "Feet on a step or chair, body rigid."},
  52: {id: "knee_push_up", name: "Knee push-up", cautions: ["wrist", "knee"], unit: "reps", sets: 3, reps: 12, rest: 90, cue: "Knees down, hips in line with your shoulders."},
  53: {id: "machine_chest_press", name: "Machine chest press", cautions: [], unit: "reps", sets: 3, reps: 10, rest: 90, cue: "Handles at mid-chest, press without locking out hard."},
  55: {id: "db_floor_press", name: "Dumbbell floor press", cautions: [], unit: "reps", sets: 3, reps: 10, rest: 90, cue: "Elbows touch the floor softly, then press."},
  60: {id: "band_chest_press", name: "Band chest press", cautions: [], unit: "reps", sets: 3, reps: 12, rest: 90, cue: "Band anchored behind you at chest height."},
  64: {id: "chin_up", name: "Chin-up", cautions: ["elbow"], unit: "reps", sets: 3, reps: 6, rest: 120, cue: "Palms facing you, elbows drive down to your ribs."},
  72: {id: "inverted_row", name: "Inverted row", cautions: ["shoulder"], unit: "reps", sets: 3, reps: 10, rest: 90, cue: "Under a sturdy table edge, body straight, chest to the edge."},
  78: {id: "superman", name: "Superman hold", cautions: ["lower_back"], unit: "s", sets: 3, reps: 20, rest: 60, cue: "Lift arms and legs a few centimetres, long neck."},
  79: {id: "band_row", name: "Band seated row", cautions: [], unit: "reps", sets: 3, reps: 15, rest: 90, cue: "Sit tall, band around your feet, pull to your belly."},
  84: {id: "front_squat", name: "Front squat", cautions: ["knee", "wrist"], unit: "reps", sets: 3, reps: 6, rest: 150, cue: "Elbows high, upright torso."},
  85: {id: "hack_squat", name: "Hack squat", cautions: ["knee"], unit: "reps", sets: 3, reps: 10, rest: 120, cue: "Feet mid-platform, controlled depth."},
  89: {id: "bodyweight_squat", name: "Bodyweight squat", cautions: ["knee"], unit: "reps", sets: 3, reps: 15, rest: 90, cue: "Sit back and down, knees track over toes.", aliases: ["Air squat", "Squat"]},
  90: {id: "split_squat", name: "Split squat", cautions: ["knee"], unit: "reps", sets: 3, reps: 10, rest: 90, cue: "Long stance, back knee drops straight down."},
  91: {id: "reverse_lunge", name: "Reverse lunge", cautions: ["knee"], unit: "reps", sets: 3, reps: 10, rest: 90, cue: "Step back, kinder to the knees than a forward lunge."},
  94: {id: "step_up", name: "Step-up", cautions: ["knee"], unit: "reps", sets: 3, reps: 10, rest: 90, cue: "Whole foot on a stable step, drive through the heel."},
  99: {id: "single_leg_rdl", name: "Single-leg Romanian deadlift", cautions: ["ankle"], unit: "reps", sets: 3, reps: 10, rest: 90, cue: "Reach back with the free leg, hips square."},
  100: {id: "db_rdl", name: "Dumbbell Romanian deadlift", cautions: ["lower_back"], unit: "reps", sets: 3, reps: 10, rest: 90, cue: "Push hips back, dumbbells slide down your thighs."},
  104: {id: "wall_sit", name: "Wall sit", cautions: ["knee"], unit: "s", sets: 3, reps: 40, rest: 60, cue: "Back flat on the wall, thighs near parallel."},
  113: {id: "glute_bridge", name: "Glute bridge", cautions: [], unit: "reps", sets: 3, reps: 15, rest: 60, cue: "Drive through heels, squeeze at the top."},
  114: {id: "single_leg_glute_bridge", name: "Single-leg glute bridge", cautions: [], unit: "reps", sets: 3, reps: 10, rest: 60, cue: "Hips stay level the whole time."},
  116: {id: "db_hip_thrust", name: "Dumbbell hip thrust", cautions: [], unit: "reps", sets: 3, reps: 12, rest: 90, cue: "Dumbbell on your hips, pause at the top."},
  117: {id: "cable_kickback", name: "Cable glute kickback", cautions: ["lower_back"], unit: "reps", sets: 3, reps: 12, rest: 60, cue: "Kick back and slightly out, no arching."},
  120: {id: "band_lateral_walk", name: "Band lateral walk", cautions: [], unit: "reps", sets: 3, reps: 12, rest: 45, cue: "Band above knees, small steps, stay low."},
  126: {id: "db_shoulder_press", name: "Dumbbell shoulder press", cautions: ["shoulder", "lower_back"], unit: "reps", sets: 3, reps: 10, rest: 90, cue: "Ribs down, press straight up beside your ears."},
  127: {id: "machine_shoulder_press", name: "Machine shoulder press", cautions: ["shoulder"], unit: "reps", sets: 3, reps: 10, rest: 90, cue: "Seat so handles start at shoulder height."},
  135: {id: "pike_push_up", name: "Pike push-up", cautions: ["shoulder", "wrist"], unit: "reps", sets: 3, reps: 8, rest: 90, cue: "Hips high, lower your head between your hands."},
  142: {id: "db_curl", name: "Dumbbell curl", cautions: ["elbow"], unit: "reps", sets: 3, reps: 12, rest: 60, cue: "Elbows pinned to your sides, no swinging."},
  145: {id: "cable_curl", name: "Cable curl", cautions: ["elbow"], unit: "reps", sets: 3, reps: 12, rest: 60, cue: "Step back slightly, elbows still."},
  159: {id: "db_skull_crusher", name: "Dumbbell skull crusher", cautions: ["elbow"], unit: "reps", sets: 3, reps: 10, rest: 60, cue: "Lower beside your head, upper arms still."},
  161: {id: "diamond_push_up", name: "Diamond push-up", cautions: ["wrist", "elbow"], unit: "reps", sets: 3, reps: 8, rest: 90, cue: "Hands together under your chest, elbows close."},
  163: {id: "bench_dip", name: "Chair dip", cautions: ["shoulder", "wrist"], unit: "reps", sets: 3, reps: 12, rest: 90, cue: "Hands on a sturdy chair, shoulders away from ears.", aliases: ["Bench dip"]},
  165: {id: "db_kickback", name: "Dumbbell kickback", cautions: [], unit: "reps", sets: 3, reps: 15, rest: 60, cue: "Hinge forward, straighten the arm behind you."},
  171: {id: "dead_bug", name: "Dead bug", cautions: [], unit: "reps", sets: 3, reps: 10, rest: 45, cue: "Lower back pressed down, slow opposite arm and leg."},
  172: {id: "bird_dog", name: "Bird dog", cautions: [], unit: "reps", sets: 3, reps: 10, rest: 45, cue: "Reach long, hips stay level."},
  174: {id: "bicycle_crunch", name: "Bicycle crunch", cautions: ["neck"], unit: "reps", sets: 3, reps: 20, rest: 45, cue: "Slow and controlled, hands light on your head."},
  175: {id: "russian_twist", name: "Russian twist", cautions: ["lower_back"], unit: "reps", sets: 3, reps: 20, rest: 45, cue: "Lean back slightly, rotate from the ribs."},
  176: {id: "side_plank", name: "Side plank", cautions: ["shoulder"], unit: "s", sets: 3, reps: 30, rest: 45, cue: "Hips high, body in one line."},
  177: {id: "cable_pallof_press", name: "Cable Pallof press", cautions: [], unit: "reps", sets: 3, reps: 10, rest: 45, cue: "Stand side-on to the cable, press out and hold."},
  179: {id: "hollow_hold", name: "Hollow hold", cautions: ["lower_back"], unit: "s", sets: 3, reps: 25, rest: 45, cue: "Lower back glued down, arms by your ears."},
  194: {id: "db_thruster", name: "Dumbbell thruster", cautions: ["knee", "shoulder"], unit: "reps", sets: 3, reps: 10, rest: 90, cue: "Squat, then drive the dumbbells overhead in one move."},
  200: {id: "bear_crawl", name: "Bear crawl", cautions: ["wrist"], unit: "s", sets: 3, reps: 30, rest: 60, cue: "Knees an inch off the floor, opposite hand and foot."},
  210: {id: "incline_walk", name: "Incline treadmill walk", cautions: [], unit: "s", sets: 1, reps: 900, rest: 0, cue: "Brisk pace, do not hold the rails."},
  212: {id: "bike_intervals", name: "Bike intervals", cautions: [], unit: "s", sets: 6, reps: 30, rest: 60, cue: "Hard for the interval, easy spin to recover.", aliases: ["Stationary bike", "Spin intervals"]},
  214: {id: "rowing_intervals", name: "Rowing intervals", cautions: ["lower_back"], unit: "m", sets: 5, reps: 250, rest: 60, cue: "Legs, then body, then arms; reverse on the way back.", aliases: ["Rowing machine", "Row intervals"]},
  217: {id: "jump_rope", name: "Jump rope (or rope-less hops)", cautions: ["ankle", "knee"], unit: "s", sets: 3, reps: 45, rest: 30, cue: "Small hops on the balls of your feet."},
  218: {id: "jumping_jacks", name: "Jumping jacks", cautions: ["ankle", "knee"], unit: "s", sets: 3, reps: 40, rest: 30, cue: "Light on your feet; step-jacks are lower impact."},
  219: {id: "high_knees", name: "High knees", cautions: ["knee", "ankle"], unit: "s", sets: 3, reps: 30, rest: 30, cue: "Knees to hip height, stay on the balls of your feet."},
  220: {id: "mountain_climber", name: "Mountain climber", cautions: ["wrist", "shoulder"], unit: "s", sets: 3, reps: 30, rest: 30, cue: "Hips low, drive knees to chest."},
  222: {id: "shadow_boxing", name: "Shadow boxing", cautions: ["shoulder"], unit: "s", sets: 3, reps: 60, rest: 30, cue: "Guard up, light on your feet, breathe out on each punch."},
  226: {id: "march_in_place", name: "Brisk march in place", cautions: [], unit: "s", sets: 3, reps: 60, rest: 30, cue: "Arms swinging, knees up; a joint-friendly option."},
  240: {id: "wall_slide", name: "Wall slide", cautions: [], unit: "reps", sets: 3, reps: 10, rest: 45, cue: "Back and arms against the wall, slide your arms up and down slowly."},};

/** Cues for new rows, and per-row corrections where a reused cue no longer
    fits the sheet's equipment. Per-side wording is added for unilateral rows. */
const CUES = {
  5: 'Bench at about 30 degrees, lower the bar to your upper chest under control.',
  7: 'Seat so the handles sit at chest height, squeeze them together without shrugging.',
  12: 'Arms long with soft elbows, sweep the bar down to your thighs.',
  14: 'Hand and knee on the bench, flat back, elbow to hip.',
  21: 'Shoulders under the pads, full stretch at the bottom, rise all the way up.',
  25: 'Back foot on the bench, dumbbells at your sides, front shin fairly upright.',
  26: 'Pads snug on your thighs, full stretch at the bottom, pause at the top.',
  35: 'Back on the incline bench, arms hanging straight, curl without moving the elbows.',
  36: 'Start from a dead hang, no swinging, lift your legs by curling your hips up.',
  38: 'Ribs down and glutes tight, roll out only as far as your back stays flat.',
  43: 'Staggered stance, free hand on your knee, flat back, pull the elbow to your hip.',
  47: 'Jump onto a low box, land softly with bent knees, step down.',
  48: 'Soft knees and a tall chest, make fast waves from the shoulders.',
  49: 'Hands on a bench or box; the higher, the easier.',
  50: 'Feet on a bench or box, body rigid.',
  51: 'Plate resting flat on your upper back, body in one straight line.',
  54: 'Bar over your mid chest, feet planted, set the safety stops first.',
  56: 'Soft elbows, open wide to a gentle stretch, bring the dumbbells together over your chest.',
  57: 'Handles set high, sweep down and together in front of your hips.',
  58: 'Handles set low, sweep up and together at chest height.',
  59: 'Staggered stance, brace your core, press straight forward without twisting.',
  61: 'Lean forward slightly, lower until your shoulders are level with your elbows.',
  62: 'Squeeze the plate between your palms at your chest, press it straight out and back.',
  63: 'Knees on the pad, pull your chest toward the bar, lower slowly.',
  65: 'Palms facing each other, start from a dead hang, chest to the bar.',
  66: 'Hands wider than your shoulders, pull the bar to your upper chest, no swinging.',
  67: 'Palms facing each other, pull the handle to your upper chest, elbows down.',
  68: 'Sit tall, pull the handle to your belly, squeeze your shoulder blades.',
  69: 'Brace your core, pull the elbow back past your ribs without twisting.',
  70: 'Chest on the pad, pull the handles toward your lower chest, squeeze.',
  71: 'Chest against the pad, pull the handles down and back, elbows wide.',
  72: 'Hang under a low bar or straps, body straight, pull your chest to the bar.',
  73: 'Flat back almost parallel to the floor, row the bar from the floor to your lower chest.',
  74: 'Staggered stance beside the landmine, flat back, row the bar end to your hip.',
  75: 'Palms up, hinge to about 45 degrees, row the bar to your belly.',
  76: 'Upper back on the bench, slight elbow bend, lower behind your head to a gentle stretch.',
  77: 'Hips on the pad, lower with a flat back, rise until your body is straight.',
  80: 'Arms straight at shoulder height, pull the band apart to your chest.',
  81: 'Hang with straight arms, pull your shoulder blades down and back, then relax.',
  82: 'Lie face down on the high bench, row the dumbbells to your ribs.',
  83: 'Chest against the pad, pull the handles to your ribs, pause.',
  86: 'Feet slightly in front of the bar, sit straight down, set the safety stops first.',
  87: 'Dumbbells at your sides, chest up, sit down until your thighs are near parallel.',
  88: 'Sit back to the box with control, pause without relaxing, drive up. Use safeties.',
  92: 'Step forward, lower until both knees bend to about 90 degrees, push back.',
  93: 'Step wide, sit back into one hip, keep the other leg straight.',
  94: 'Dumbbells at your sides, whole foot on a stable box, drive through the heel.',
  95: 'One foot mid-platform, lower back stays on the pad, no locking the knee.',
  96: 'Pad just above your heels, curl down fully, return slowly.',
  97: 'Hips against the pad, curl your heel up, lower with control.',
  98: 'Ankles held firmly, lower your body as slowly as you can, push up with your hands.',
  101: 'Bar on your upper back, soft knees, hinge with a flat back until you feel the hamstrings.',
  102: 'Ankles locked in, lower with a straight line from knees to head, curl back up.',
  103: 'Wide stance, sit into one leg, keep the other straight with toes up.',
  105: 'Back against a wall, heels forward, lift your toes as high as you can.',
  106: 'Hips under the pad, full stretch at the bottom, rise high on your toes.',
  107: 'Ball of the foot on a step, hold on for balance, full stretch then full rise.',
  108: 'Balls of the feet on the platform edge, knees soft, push through your toes.',
  109: 'Hold a support, sit down on one leg with the other leg forward.',
  110: 'Arms forward for balance, sit down on one leg with the knee over your toes.',
  111: 'Heels raised on a plate, chest upright, sit straight down.',
  112: 'Pad the bar across your hips, drive through your heels, squeeze at the top.',
  115: 'Upper back on the bench, drive through one heel, hips stay level.',
  118: 'Sit tall, push the pads out with control, return slowly.',
  119: 'Cuff on the outer ankle, stand tall, lift the leg out to the side.',
  121: 'Lie on your side, heels together, lift the top knee without rolling back.',
  122: 'Soles of the feet together, knees out, drive your hips up and squeeze.',
  123: 'On hands and knees, lift one knee out to the side, hips stay square.',
  124: 'Hips on the pad edge, raise your legs to hip height with your glutes.',
  125: 'Face away from the cable, hinge back, stand tall by squeezing your glutes.',
  128: 'Ribs down, press straight up beside your ear without leaning.',
  129: 'Cable from the opposite side, lead with the elbow, stop at shoulder height.',
  130: 'Hold the post and lean away, raise to shoulder height with a soft elbow.',
  131: 'Raise to shoulder height in front of you, no swinging.',
  132: 'Cables crossed at shoulder height, pull out wide with soft elbows.',
  133: 'Chest on the pad, sweep the handles back with straight arms.',
  134: 'Staggered stance, press the bar end up and forward, ribs down.',
  136: 'Kick up to the wall, lower your head to a cushion slowly, press back up.',
  137: 'Chest on an incline bench, thumbs up, raise light dumbbells into a Y.',
  138: 'Arms straight, lift your shoulders toward your ears, pause, lower.',
  139: 'Elbow pinned to your side at 90 degrees, rotate your hand out slowly.',
  140: 'Elbow at your side at 90 degrees, rotate your hand out against the band.',
  141: 'Elbows at your sides, curl the bar up, lower slowly.',
  143: 'Upper arms flat on the pad, curl up, lower nearly to straight.',
  144: 'Upper arms flat on the pad, curl up, lower with control.',
  146: 'Elbow braced on your inner thigh, curl up and squeeze.',
  147: 'Palm facing in, curl across toward the opposite shoulder.',
  148: 'Face away from the cable, arm behind you, curl forward without moving the elbow.',
  149: 'Palms down, elbows at your sides, curl up slowly.',
  150: 'Curl up with palms up, turn them down at the top, lower slowly.',
  151: 'Chest on the incline bench, arms hanging straight down, curl and squeeze.',
  152: 'Palms facing each other on the rope, elbows still, curl up.',
  153: 'Back on the incline bench, palms facing in, curl without moving the elbows.',
  154: 'Seven reps on the bottom half, seven on the top half, seven full reps.',
  155: 'Elbows at your sides, push down and spread the rope at the bottom.',
  156: 'Elbows pinned, push the bar to your thighs, control it back up.',
  157: 'Elbow pinned to your side, straighten the arm fully.',
  158: 'Face away from the cable, elbows by your ears, straighten your arms overhead.',
  160: 'Upper arms still, lower the bar toward your forehead slowly, press back up.',
  162: 'Hands under your shoulders, elbows brush your sides, body straight.',
  163: 'Hands on the bench edge, shoulders away from your ears, lower to a comfortable depth.',
  164: 'Stay upright, lower until your elbows reach 90 degrees, press up.',
  166: 'Hinge forward, upper arm still, straighten the arm behind you.',
  167: 'Sit tall, elbows pointing up, lower the dumbbell behind your head.',
  168: 'Forearms on your thighs, palms up, curl the wrists slowly.',
  169: 'Forearms on your thighs, palms down, lift the backs of your hands.',
  170: 'Pinch two plates together, smooth sides out, stand tall and hold.',
  173: 'Lower back pressed down, curl your knees toward your chest.',
  178: 'Rotate from your hips and ribs, arms long, back foot pivots.',
  180: 'Lower back pressed down, small fast kicks with straight legs.',
  181: 'Legs straight up, reach toward your toes, chin off your chest.',
  182: 'Lift arms and legs together to meet over your hips, lower slowly.',
  183: 'Plate held at your chest, sit up with control, lower slowly.',
  184: 'Hands under shoulders, knees an inch off the floor, back flat.',
  185: 'Top leg on the bench, lift your hips into a straight line.',
  186: 'Legs up, lower them side to side slowly, shoulders stay down.',
  187: 'One weight in one hand, walk tall without leaning.',
  188: 'Forearms on the ball, plank tight, draw small circles.',
  189: 'Arms long, rotate the bar end from hip to hip, pivot your feet.',
  190: 'Lower back on the ball, crunch your ribs toward your hips.',
  191: 'Shoulders slightly lifted, reach side to side to tap your heels.',
  192: 'Back against the pad, lift your knees to your chest without swinging.',
  193: 'Pull the bar from the floor to your shoulders, then press overhead. Learn it light.',
  195: 'Front squat, then drive the bar overhead in one move.',
  196: 'Hinge, then drive your hips to pull the dumbbell overhead in one move.',
  197: 'Hike the bell back, snap your hips, catch it softly at your chest.',
  198: 'Eyes on the bell, arm locked straight, move slowly through each step.',
  199: 'Reach overhead, slam the ball down hard, bend your knees to pick it up.',
  201: 'Arms long, body leaning in, drive with short powerful steps.',
  202: 'Walk backward holding the straps, sit low, take steady steps.',
  203: 'Hug the bag to your chest, walk tall with short steps.',
  204: 'Step back onto the dumbbells, step in, then swing them overhead in one move.',
  205: 'Clean the dumbbells to your shoulders, then press them overhead.',
  206: 'Step up onto the box, then press the dumbbells overhead at the top.',
  207: 'Snap your hips, pull the bell to chest height with elbows high.',
  208: 'Brisk pace, tall posture, arms swinging.',
  209: 'Easy pace you can talk at, short quick strides.',
  211: 'Easy pace you can talk at, short quick strides.',
  213: 'Push and pull hard for the interval, then pedal easy to recover.',
  215: 'Steady pace, upright posture, push and pull the handles.',
  216: 'Light grip on the rails, full steps, tall posture.',
  221: 'Hop side to side, land softly on one foot, knee over toes.',
  223: 'Run to the marker, touch down low, turn and run back.',
  224: 'Warm up first, sprint hard, walk to recover.',
  225: 'Steady strokes, breathe every few strokes, rest at the wall when you need to.',
  227: 'On hands and knees, round your back slowly, then arch it.',
  228: 'Lunge, place a hand inside the front foot, rotate the other arm to the ceiling.',
  229: 'Lie on your side, knees bent, open the top arm across while the knees stay down.',
  230: 'Sit with both knees at 90 degrees, rotate them side to side slowly.',
  231: 'Heels down, chest up, hold the bottom of a squat.',
  232: 'Back knee padded, shin up the bench, squeeze the glute of that leg.',
  233: 'Back knee padded, tuck your hips under and lean forward gently.',
  234: 'Forearm on the door frame at shoulder height, step through gently.',
  235: 'Wide grip on the band, arms straight, take it over your head and back.',
  236: 'Foot a hand width from the wall, rock the knee forward, heel stays down.',
  237: 'Knees wide, sit back toward your heels, arms long, breathe slowly.',
  238: 'Heel forward with toes up, hinge and sweep your hands down toward the foot.',
  239: 'Step and pull one knee to your chest, stand tall, alternate.',
  241: 'Slow full circles each way, fingers relaxed.',
  242: 'Front shin across, back leg long, hips square, ease forward.',
  243: 'Hold your ankle behind you, knees together, hips tucked.',
};

/** Field corrections for single rows. */
const FIX = {
  117: { pattern: 'isolation' }, // a single-joint kickback, as before
  154: { reps: 21 }, // a set of 21s is 21 reps
  180: { unit: 's', reps: 30, rest: 45 },
  199: { reps: 8 },
  80: { reps: 15, rest: 60 }, // a light band drill, not a heavy row
  198: { sets: 3, reps: 3, rest: 90 }, // slow, technical, a few reps per side
  204: { unit: 'reps', sets: 4, reps: 8, rest: 90 }, // a dumbbell complex, counted in reps
  221: { perSide: false }, // alternating, timed
};

// ───────────────────────────── build ─────────────────────────────

export function buildRows(sheet = readSheet()) {
  const sheetNames = new Set(sheet.map((r) => norm(r.name)));
  const ids = new Set();
  const reusedIds = new Set(Object.values(REUSED).map((r) => r.id));
  return sheet
    .slice()
    .sort((a, b) => a.sheetId - b.sheetId)
    .map((row) => {
      const old = REUSED[row.sheetId];
      const fix = FIX[row.sheetId] ?? {};
      const muscle = fix.muscle ?? muscleOf(row);
      const pattern = fix.pattern ?? PATTERN[row.pattern];
      if (!pattern) throw new Error(`exercise sheet: unknown movement pattern "${row.pattern}" (add it to PATTERN)`);
      const kind = KIND[row.type];
      if (!kind) throw new Error(`exercise sheet: unknown exercise type "${row.type}"`);
      const level = row.difficulty.toLowerCase();
      if (!['beginner', 'intermediate', 'advanced'].includes(level)) throw new Error(`exercise sheet: unknown difficulty "${row.difficulty}"`);
      const { equipment, nowhere } = equipmentOf(row.equipment);
      const planner = !(nowhere || PLANNER_OFF.has(row.name));

      let id = old?.id;
      if (!id) {
        id = slug(row.name);
        // a new row never takes an id an old exercise used for a different movement
        if (reusedIds.has(id) || ids.has(id) || LEGACY_IDS_USED.has(id)) id = `${slug(equipment[0] === 'none' ? 'bodyweight' : equipment[0])}_${id}`;
      }
      if (ids.has(id)) throw new Error(`duplicate id ${id}`);
      ids.add(id);

      // Reused rows keep their cautions and gain any the sheet's equipment adds.
      const derived = cautionsFor(row, pattern, equipment);
      const cautions = old ? [...old.cautions, ...derived.filter((k) => !old.cautions.includes(k))] : derived;
      const dose = old ? { unit: old.unit, sets: old.sets, reps: old.reps, rest: old.rest } : doseFor(row, pattern, kind, level);
      for (const k of ['unit', 'sets', 'reps', 'rest']) if (fix[k] !== undefined) dose[k] = fix[k];

      let cue = CUES[row.sheetId] ?? old?.cue;
      if (!cue) throw new Error(`no cue for sheet row ${row.sheetId} ${row.name} (add it to CUES)`);
      if (row.unilateral && !old && fix.perSide !== false && !/\b(side|each)\b/i.test(cue)) {
        cue += dose.unit === 'reps' ? ' Reps are per side.' : dose.unit === 's' ? ' Time is per side.' : ' Distance is per side.';
      }
      if (/—/.test(cue)) throw new Error(`em dash in cue of ${row.name}`);

      const aliases = [];
      for (const a of [old?.name, ...(old?.aliases ?? [])]) {
        if (a && !sheetNames.has(norm(a)) && !aliases.some((x) => norm(x) === norm(a))) aliases.push(a);
      }

      return {
        sheetId: row.sheetId, id, name: row.name, muscle, pattern, equipment, cautions, level, kind,
        aliases, secondary: secondaryOf(row, muscle), ...dose, cue, planner, reused: !!old,
      };
    });
}

/** Old ids that are gone from the library (see LEGACY_IDS in exercises.ts);
    a new row never takes one of them as its id. */
const LEGACY_IDS_USED = new Set(['wall_push_up', 'chest_squeeze', 'db_fly', 'band_fly', 'negative_pull_up', 'band_assisted_pull_up', 'band_lat_pulldown', 'kb_row', 'towel_row', 'renegade_row', 'band_lateral_raise', 'band_overhead_press', 'kb_press', 'band_face_pull', 'plank_shoulder_tap', 'prone_ytw', 'band_curl', 'kb_curl', 'towel_curl', 'isometric_triceps_press', 'band_pushdown', 'kb_overhead_extension', 'box_squat', 'db_box_squat', 'straight_leg_raise', 'band_tke', 'kb_goblet_squat', 'db_reverse_lunge', 'band_squat', 'jump_squat', 'kb_deadlift', 'bodyweight_good_morning', 'band_leg_curl', 'slider_leg_curl', 'band_good_morning', 'glute_kickback', 'kb_sumo_deadlift', 'db_calf_raise', 'machine_calf_raise', 'hanging_knee_raise', 'band_pallof_press', 'kb_halo', 'db_side_bend', 'kb_carry', 'kb_clean_press', 'kb_swing_cardio']);

const q = (s) => (s.includes("'") ? JSON.stringify(s) : `'${s.replace(/\\/g, '\\\\')}'`);
const list = (xs) => `[${xs.map(q).join(', ')}]`;

export function rowSource(e) {
  const o = [];
  if (e.aliases.length) o.push(`aliases: ${list(e.aliases)}`);
  if (e.secondary.length) o.push(`secondary: ${list(e.secondary)}`);
  if (e.unit !== 'reps') o.push(`unit: '${e.unit}'`);
  o.push(`sets: ${e.sets}`, `reps: ${e.reps}`, `rest: ${e.rest}`, `cue: ${q(e.cue)}`);
  if (!e.planner) o.push('planner: false');
  const eq = e.equipment.length === 1 && e.equipment[0] === 'none' ? 'N' : list(e.equipment);
  return `  x(${e.sheetId}, ${q(e.id)}, ${q(e.name)}, '${e.muscle}', '${e.pattern}', ${eq}, ${list(e.cautions)}, '${e.level}', '${e.kind}', { ${o.join(', ')} }),`;
}

const START = '  // <sheet-rows>';
const END = '  // </sheet-rows>';

function main() {
  const rows = buildRows();
  const body = rows.map(rowSource).join('\n');
  if (!process.argv.includes('--write')) {
    process.stdout.write(`${body}\n`);
    return;
  }
  for (const file of TARGETS) {
    const src = readFileSync(file, 'utf8');
    const a = src.indexOf(START);
    const b = src.indexOf(END);
    if (a < 0 || b < a) throw new Error(`${file}: no ${START} ... ${END} markers`);
    writeFileSync(file, `${src.slice(0, a + START.length)}\n${body}\n${src.slice(b)}`);
  }
  const reused = rows.filter((r) => r.reused).length;
  process.stderr.write(`${rows.length} rows (${reused} reused ids, ${rows.length - reused} new, ${rows.filter((r) => !r.planner).length} planner: false) written to ${TARGETS.length} files\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
