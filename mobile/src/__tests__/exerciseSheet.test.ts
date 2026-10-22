/* The owner's rule: workouts use ONLY the exercises in the exercise sheet
   (supabase/functions/_shared/exercise-sheet.csv). These tests hold the
   library to the sheet, keep old plan ids working, and check the rules
   planner can fill every session from the sheet alone. */

import { beforeAll, describe, expect, it, vi } from 'vitest';

import {
  alternativesFor,
  availableEquipment,
  type Equipment,
  EXERCISES,
  exercisesFor,
  findExercise,
  fitsEquipment,
  INJURY_AREAS,
  LEGACY_IDS,
  type Level,
  type TrainLocation,
  variantFor,
} from '../data/exercises';

vi.mock('https://esm.sh/@supabase/supabase-js@2', () => ({ createClient: () => ({}) }));
(globalThis as { Deno?: unknown }).Deno = { env: { get: () => undefined }, serve: () => undefined };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Mod = any;

/** File contents as text (Vite ?raw import; no Node types needed). */
async function readText(rel: string): Promise<string> {
  const mod = (await import(/* @vite-ignore */ `${new URL(rel, import.meta.url).pathname}?raw`)) as { default: string };
  return mod.default;
}

/** Quoted fields, "" inside quotes, CRLF or LF. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (c === '"') quoted = false; else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; } else if (c === '\n' || c === '\r') {
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

let sheet: { id: number; name: string }[] = [];
let plan: Mod, profile: Mod, rules: Mod, generator: Mod;
let libraryText = '';

beforeAll(async () => {
  const [header, ...rows] = parseCsv(await readText('../../../supabase/functions/_shared/exercise-sheet.csv'));
  const id = header.indexOf('ID');
  const name = header.indexOf('Exercise Name');
  sheet = rows.map((r) => ({ id: Number(r[id]), name: r[name].trim() }));
  libraryText = await readText('../data/exercises.ts');
  const shared = new URL('../../../supabase/functions/_shared/', import.meta.url).pathname;
  [plan, profile, rules] = await Promise.all(['plan', 'profile', 'rules'].map((n) => import(/* @vite-ignore */ `${shared}${n}.ts`)));
  generator = await import(/* @vite-ignore */ new URL('../../../scripts/import-exercises.mjs', import.meta.url).pathname);
});

/** Every id the library had before it became the sheet. */
const OLD_IDS = [
  'push_up', 'incline_push_up', 'knee_push_up', 'decline_push_up', 'wall_push_up', 'chest_squeeze', 'db_bench_press', 'db_floor_press', 'incline_db_press', 'db_fly', 'band_chest_press', 'band_fly', 'barbell_bench', 'machine_chest_press', 'cable_fly', 'chest_dip',
  'pull_up', 'chin_up', 'negative_pull_up', 'band_assisted_pull_up', 'lat_pulldown', 'band_lat_pulldown', 'db_row', 'chest_supported_db_row', 'band_row', 'seated_cable_row', 'barbell_row', 'inverted_row', 'superman', 'kb_row', 'towel_row', 'renegade_row',
  'pike_push_up', 'db_shoulder_press', 'arnold_press', 'lateral_raise', 'band_lateral_raise', 'band_overhead_press', 'kb_press', 'machine_shoulder_press', 'barbell_ohp', 'band_face_pull', 'cable_face_pull', 'rear_delt_fly', 'plank_shoulder_tap', 'wall_slide', 'prone_ytw',
  'db_curl', 'hammer_curl', 'band_curl', 'barbell_curl', 'cable_curl', 'kb_curl', 'towel_curl',
  'diamond_push_up', 'bench_dip', 'isometric_triceps_press', 'db_overhead_extension', 'band_pushdown', 'cable_pushdown', 'db_skull_crusher', 'close_grip_bench', 'db_kickback', 'kb_overhead_extension',
  'bodyweight_squat', 'box_squat', 'db_box_squat', 'straight_leg_raise', 'band_tke', 'goblet_squat', 'kb_goblet_squat', 'back_squat', 'front_squat', 'leg_press', 'leg_extension', 'hack_squat', 'split_squat', 'bulgarian_split_squat', 'walking_lunge', 'reverse_lunge', 'db_reverse_lunge', 'step_up', 'wall_sit', 'band_squat', 'jump_squat',
  'db_rdl', 'barbell_rdl', 'deadlift', 'kb_deadlift', 'kb_swing', 'single_leg_rdl', 'bodyweight_good_morning', 'leg_curl', 'band_leg_curl', 'slider_leg_curl', 'band_good_morning',
  'glute_bridge', 'single_leg_glute_bridge', 'hip_thrust', 'db_hip_thrust', 'band_lateral_walk', 'cable_kickback', 'glute_kickback', 'kb_sumo_deadlift',
  'calf_raise', 'db_calf_raise', 'machine_calf_raise',
  'plank', 'side_plank', 'dead_bug', 'bird_dog', 'hollow_hold', 'bicycle_crunch', 'russian_twist', 'hanging_knee_raise', 'band_pallof_press', 'cable_pallof_press', 'cable_crunch', 'kb_halo', 'db_side_bend',
  'farmer_carry', 'kb_carry', 'db_thruster', 'kb_clean_press', 'burpee', 'bear_crawl',
  'jumping_jacks', 'high_knees', 'mountain_climber', 'shadow_boxing', 'march_in_place', 'rowing_intervals', 'bike_intervals', 'incline_walk', 'kb_swing_cardio', 'jump_rope',
];

const OFF = () => EXERCISES.filter((e) => e.planner === false);

describe('the library is exactly the exercise sheet', () => {
  it('has one entry per sheet row, with the sheet ID and the sheet name', () => {
    expect(sheet.length).toBe(243);
    const bySheet = new Map(sheet.map((r) => [r.id, r.name]));
    for (const e of EXERCISES) {
      expect(bySheet.has(e.sheetId), `${e.id} sheetId ${e.sheetId}`).toBe(true);
      expect(e.name, e.id).toBe(bySheet.get(e.sheetId));
    }
    for (const r of sheet) expect(EXERCISES.filter((e) => e.sheetId === r.id).length, r.name).toBe(1);
    expect(EXERCISES.length).toBe(sheet.length);
  });

  it('every entry has a kind, and only planner: false marks a row as never prescribed', () => {
    for (const e of EXERCISES) {
      expect(['strength', 'power', 'conditioning', 'mobility']).toContain(e.kind);
      expect(e.planner === undefined || e.planner === false).toBe(true);
    }
    // a pool, a track, a partner, open running space
    expect(OFF().map((e) => e.name).sort()).toEqual(['Nordic Hamstring Curl', 'Outdoor Running', 'Shuttle Runs', 'Sprint Intervals', 'Swimming Laps']);
  });

  it('rows are the generator output (no hand edits between the markers)', () => {
    const rows: string = generator.buildRows().map(generator.rowSource).join('\n');
    const a = libraryText.indexOf('  // <sheet-rows>\n');
    const b = libraryText.indexOf('  // </sheet-rows>');
    expect(a).toBeGreaterThan(0);
    expect(libraryText.slice(a + '  // <sheet-rows>\n'.length, b)).toBe(`${rows}\n`);
  });
});

describe('planner: false rows are never prescribed or offered', () => {
  const places: Equipment[][] = [availableEquipment('home_none'), availableEquipment('home_equipment', ['dumbbells', 'bands']), availableEquipment('gym')];
  const off = () => new Set(OFF().map((e) => e.id));

  it('not by exercisesFor, alternativesFor or variantFor', () => {
    for (const available of places) {
      for (const maxLevel of ['beginner', 'intermediate', 'advanced'] as Level[]) {
        for (const e of exercisesFor({ available, maxLevel })) expect(off().has(e.id), e.id).toBe(false);
      }
      for (const ex of EXERCISES) {
        for (const a of alternativesFor(ex, available)) expect(off().has(a.id), `${ex.id} -> ${a.id}`).toBe(false);
      }
      for (const e of OFF()) {
        const v = variantFor(e, available);
        if (v) expect(off().has(v.id)).toBe(false);
      }
    }
  });

  it('not in the list the model chooses from', () => {
    for (const loc of ['home_none', 'home_equipment', 'gym'] as TrainLocation[]) {
      const p = person({ train_location: loc, equipment: ['dumbbells', 'bands', 'pullup_bar'], activity_level: 'very' });
      const list: string = plan.allowedList(p);
      expect(list.length).toBeGreaterThan(100);
      for (const e of OFF()) expect(list).not.toMatch(new RegExp(`\\b${e.id}\\b`));
      for (const id of [...list.matchAll(/(?:^|: |, )([a-z0-9_]+) \(/gm)].map((m) => m[1])) expect(findExercise(id, { legacy: false }), id).not.toBeNull();
    }
  });
});

describe('old plan ids keep working', () => {
  it('maps every removed id to an existing sheet exercise', () => {
    const ids = new Set(EXERCISES.map((e) => e.id));
    expect(Object.keys(LEGACY_IDS).length).toBe(46);
    for (const [old, now] of Object.entries(LEGACY_IDS)) {
      expect(ids.has(old), `${old} is still a library id`).toBe(false);
      expect(ids.has(now), `${old} -> ${now}`).toBe(true);
      expect(findExercise(old)!.id).toBe(now);
      expect(findExercise(now)!.planner, now).toBeUndefined();
    }
  });

  it('resolves every id the library ever had, and keeps the muscle where it can', () => {
    for (const id of OLD_IDS) expect(findExercise(id), id).not.toBeNull();
    expect(OLD_IDS.length).toBe(136);
    expect(findExercise('kb_goblet_squat')!.muscle).toBe('quads');
    expect(findExercise('band_curl')!.muscle).toBe('biceps');
    expect(findExercise('kb_halo', { legacy: false })).toBeNull();
  });
});

const TODAY = '2026-10-01';
function person(over: Record<string, unknown> = {}) {
  return profile.toPerson(
    {
      id: 'u1', name: 'Ana', gender: 'female', birth_date: '1994-05-05', height_cm: 165, weight_kg: 70,
      activity_level: 'moderate', job_activity: 'desk', goal: 'build_muscle', timeline_months: 3, target_weight_kg: 65,
      train_location: 'home_none', equipment: [], training_days: [1, 2, 3, 4, 5, 6], training_time: 'evening',
      diet_type: 'none', allergies: [], allergies_other: '', dislikes: '', injuries: '', injury_areas: [], conditions: [],
      ...over,
    },
    TODAY,
  );
}

describe('the rules planner fills every session from the sheet', () => {
  // Slots per session in plan.ts T (no cardio finisher for build_muscle).
  const SLOTS: Record<string, number> = { 'Full body': 6, 'Upper body': 6, 'Lower body': 6, Push: 5, Pull: 5, Legs: 5, 'Active recovery': 4 };
  const places: [TrainLocation, string[]][] = [['home_none', []], ['home_equipment', ['dumbbells', 'bands']], ['home_equipment', ['dumbbells']], ['gym', []]];
  const who: [string, Record<string, unknown>][] = [
    ['beginner', { activity_level: 'sedentary' }],
    ['adult', { activity_level: 'moderate' }],
    ['advanced adult', { activity_level: 'very' }],
    ['minor', { birth_date: '2011-06-01', gender: 'male', weight_kg: 60, height_cm: 170 }],
  ];
  // 2 days = full_a + full_b, 4 = upper + lower, 7 = push, pull, legs and recovery
  const schedules = [[1, 4], [1, 2, 4, 5], [0, 1, 2, 3, 4, 5, 6]];

  for (const [loc, equipment] of places) {
    for (const [label, over] of who) {
      it(`${loc} ${equipment.join('+') || ''} ${label}`, () => {
        for (const training_days of schedules) {
          const p = person({ train_location: loc, equipment, training_days, ...over });
          const adj = plan.applyInstruction(p, null);
          const targets = rules.dailyTargets({ weightKg: 70, heightCm: 165, age: 32, gender: 'female', activityLevel: 'moderate', goal: 'build_muscle' });
          for (const d of plan.rulesWeek(adj, targets)) {
            if (d.session.kind !== 'workout') continue;
            expect(d.session.exercises.length, `${d.session.focus} ${training_days.length} days`).toBe(SLOTS[d.session.focus]);
            for (const e of d.session.exercises) {
              const lib = findExercise(e.id, { legacy: false })!;
              expect(lib, e.id).not.toBeNull();
              expect(sheet.some((r) => r.id === lib.sheetId && r.name === e.name), e.id).toBe(true);
              expect(lib.planner).toBeUndefined();
              expect(fitsEquipment(lib, p.available)).toBe(true);
              if (p.minor || label === 'adult') expect(lib.level).not.toBe('advanced');
              if (label === 'beginner') expect(lib.level).toBe('beginner');
              for (const v of Object.values(e.variants) as { id: string }[]) expect(findExercise(v.id, { legacy: false })?.planner).toBeUndefined();
            }
          }
        }
      });
    }
  }

  it('steers every injury clear at every place', () => {
    for (const [loc, equipment] of places) {
      for (const area of INJURY_AREAS) {
        const p = person({ train_location: loc, equipment, injury_areas: [area] });
        const adj = plan.applyInstruction(p, null);
        const targets = rules.dailyTargets({ weightKg: 70, heightCm: 165, age: 32, gender: 'female', activityLevel: 'moderate', goal: 'build_muscle' });
        for (const d of plan.rulesWeek(adj, targets)) {
          if (d.session.kind !== 'workout') continue;
          expect(d.session.exercises.length).toBeGreaterThanOrEqual(3);
          for (const e of d.session.exercises) expect(findExercise(e.id)!.cautions, `${loc} ${area} ${e.id}`).not.toContain(area);
        }
      }
    }
  });
});
