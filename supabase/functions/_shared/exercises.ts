/* BUILT exercise library: every exercise the planner may prescribe, tagged
   by muscle group, movement pattern, equipment and the injuries it can
   aggravate, plus alternativesFor() for "Replace an exercise" (3 options for
   the same muscle group that fit the person's equipment and injuries).

   Pure data and functions, no imports, so it runs anywhere.
   This file is byte-identical in two places:
     mobile/src/data/exercises.ts              (the app: instant swaps, offline)
     supabase/functions/_shared/exercises.ts   (the planner)
   mobile/src/__tests__/exercises.test.ts fails if they differ. */

export type Muscle =
  | 'chest' | 'back' | 'shoulders' | 'biceps' | 'triceps'
  | 'quads' | 'hamstrings' | 'glutes' | 'calves' | 'core'
  | 'full_body' | 'cardio';

export type Pattern =
  | 'push_horizontal' | 'push_vertical' | 'pull_horizontal' | 'pull_vertical'
  | 'squat' | 'hinge' | 'lunge' | 'carry' | 'core' | 'isolation' | 'conditioning';

/** 'none' = bodyweight. 'machines' covers cables and every gym machine. */
export type Equipment = 'none' | 'dumbbells' | 'bands' | 'kettlebell' | 'pullup_bar' | 'bench' | 'machines' | 'barbell';

export type InjuryArea = 'knee' | 'lower_back' | 'shoulder' | 'wrist' | 'elbow' | 'hip' | 'ankle' | 'neck';

export type TrainLocation = 'home_none' | 'home_equipment' | 'gym';

export type Level = 'beginner' | 'intermediate' | 'advanced';

export type Exercise = {
  id: string;
  name: string;
  /** Older or common names, so plans written by name still match. */
  aliases?: string[];
  muscle: Muscle;
  secondary: Muscle[];
  pattern: Pattern;
  /** Everything it needs. ['none'] = bodyweight only. */
  equipment: Equipment[];
  /** Injury areas this exercise can aggravate; skipped for those people. */
  cautions: InjuryArea[];
  level: Level;
  unit: 'reps' | 's' | 'm';
  sets: number;
  /** reps, seconds or metres per set, by unit. */
  reps: number;
  /** rest between sets, seconds. */
  rest: number;
  /** One short form cue. */
  cue: string;
};

export const ALL_EQUIPMENT: readonly Equipment[] = ['none', 'dumbbells', 'bands', 'kettlebell', 'pullup_bar', 'bench', 'machines', 'barbell'];
export const INJURY_AREAS: readonly InjuryArea[] = ['knee', 'lower_back', 'shoulder', 'wrist', 'elbow', 'hip', 'ankle', 'neck'];

type Opts = Partial<Pick<Exercise, 'aliases' | 'secondary' | 'unit' | 'sets' | 'reps' | 'rest' | 'cue'>>;

function x(
  id: string,
  name: string,
  muscle: Muscle,
  pattern: Pattern,
  equipment: Equipment[],
  cautions: InjuryArea[],
  level: Level,
  o: Opts = {},
): Exercise {
  const unit = o.unit ?? 'reps';
  return {
    id,
    name,
    ...(o.aliases ? { aliases: o.aliases } : {}),
    muscle,
    secondary: o.secondary ?? [],
    pattern,
    equipment,
    cautions,
    level,
    unit,
    sets: o.sets ?? 3,
    reps: o.reps ?? (unit === 's' ? 30 : unit === 'm' ? 250 : 10),
    rest: o.rest ?? (pattern === 'isolation' || pattern === 'core' ? 60 : 90),
    cue: o.cue ?? '',
  };
}

const N: Equipment[] = ['none'];

export const EXERCISES: readonly Exercise[] = [
  // ── chest ──
  x('push_up', 'Push-up', 'chest', 'push_horizontal', N, ['wrist', 'shoulder'], 'beginner', { aliases: ['Push-up ladder', 'Push ups', 'Pushups'], secondary: ['triceps', 'shoulders', 'core'], reps: 12, cue: 'Body in one straight line, chest to a fist from the floor.' }),
  x('incline_push_up', 'Incline push-up', 'chest', 'push_horizontal', N, ['wrist'], 'beginner', { secondary: ['triceps', 'shoulders'], reps: 12, cue: 'Hands on a sturdy table or step; the higher, the easier.' }),
  x('knee_push_up', 'Knee push-up', 'chest', 'push_horizontal', N, ['wrist', 'knee'], 'beginner', { secondary: ['triceps'], reps: 12, cue: 'Knees down, hips in line with your shoulders.' }),
  x('decline_push_up', 'Decline push-up', 'chest', 'push_horizontal', N, ['wrist', 'shoulder'], 'intermediate', { secondary: ['shoulders', 'triceps'], reps: 10, cue: 'Feet on a step or chair, body rigid.' }),
  x('wall_push_up', 'Wall push-up', 'chest', 'push_horizontal', N, [], 'beginner', { secondary: ['triceps', 'shoulders'], reps: 15, cue: 'Hands on the wall at chest height, body straight, chest to the wall.' }),
  x('chest_squeeze', 'Isometric chest squeeze', 'chest', 'isolation', N, [], 'beginner', { unit: 's', reps: 20, rest: 45, cue: 'Press your palms together hard at chest height, elbows up.' }),
  x('db_bench_press', 'Dumbbell bench press', 'chest', 'push_horizontal', ['dumbbells', 'bench'], ['shoulder'], 'beginner', { secondary: ['triceps', 'shoulders'], cue: 'Shoulder blades back and down, lower to mid-chest.' }),
  x('db_floor_press', 'Dumbbell floor press', 'chest', 'push_horizontal', ['dumbbells'], [], 'beginner', { secondary: ['triceps'], cue: 'Elbows touch the floor softly, then press.' }),
  x('incline_db_press', 'Incline dumbbell press', 'chest', 'push_horizontal', ['dumbbells', 'bench'], ['shoulder'], 'beginner', { secondary: ['shoulders', 'triceps'], cue: 'Bench at about 30 degrees, wrists stacked over elbows.' }),
  x('db_fly', 'Dumbbell fly', 'chest', 'isolation', ['dumbbells', 'bench'], ['shoulder', 'elbow'], 'intermediate', { reps: 12, cue: 'Soft elbows, open wide until you feel a stretch.' }),
  x('band_chest_press', 'Band chest press', 'chest', 'push_horizontal', ['bands'], [], 'beginner', { secondary: ['triceps'], reps: 12, cue: 'Band anchored behind you at chest height.' }),
  x('band_fly', 'Band chest fly', 'chest', 'isolation', ['bands'], ['shoulder'], 'beginner', { reps: 15, cue: 'Hug a big tree, squeeze at the middle.' }),
  x('barbell_bench', 'Barbell bench press', 'chest', 'push_horizontal', ['barbell', 'bench'], ['shoulder', 'wrist'], 'intermediate', { aliases: ['Bench press'], secondary: ['triceps', 'shoulders'], reps: 8, rest: 120, cue: 'Feet planted, bar to lower chest, use a spotter or safeties.' }),
  x('machine_chest_press', 'Machine chest press', 'chest', 'push_horizontal', ['machines'], [], 'beginner', { secondary: ['triceps'], cue: 'Handles at mid-chest, press without locking out hard.' }),
  x('cable_fly', 'Cable fly', 'chest', 'isolation', ['machines'], ['shoulder'], 'beginner', { reps: 12, cue: 'Step forward, slight lean, bring hands together in an arc.' }),
  x('chest_dip', 'Parallel bar dip', 'chest', 'push_vertical', ['machines'], ['shoulder', 'elbow'], 'advanced', { secondary: ['triceps'], reps: 8, cue: 'Lean forward slightly, lower until shoulders are level with elbows.' }),

  // ── back ──
  x('pull_up', 'Pull-up', 'back', 'pull_vertical', ['pullup_bar'], ['shoulder', 'elbow'], 'intermediate', { secondary: ['biceps'], reps: 6, rest: 120, cue: 'Start from a dead hang, chest to the bar.' }),
  x('chin_up', 'Chin-up', 'back', 'pull_vertical', ['pullup_bar'], ['elbow'], 'intermediate', { secondary: ['biceps'], reps: 6, rest: 120, cue: 'Palms facing you, elbows drive down to your ribs.' }),
  x('negative_pull_up', 'Negative pull-up', 'back', 'pull_vertical', ['pullup_bar'], ['shoulder'], 'beginner', { secondary: ['biceps'], reps: 5, cue: 'Jump to the top, lower for a slow count of five.' }),
  x('band_assisted_pull_up', 'Band-assisted pull-up', 'back', 'pull_vertical', ['pullup_bar', 'bands'], ['shoulder'], 'beginner', { secondary: ['biceps'], reps: 8, cue: 'Band looped on the bar under one knee or foot.' }),
  x('lat_pulldown', 'Lat pulldown', 'back', 'pull_vertical', ['machines'], ['shoulder'], 'beginner', { secondary: ['biceps'], reps: 12, cue: 'Pull the bar to your upper chest, no swinging.' }),
  x('band_lat_pulldown', 'Band lat pulldown', 'back', 'pull_vertical', ['bands'], [], 'beginner', { secondary: ['biceps'], reps: 15, cue: 'Band anchored high, pull elbows to your sides.' }),
  x('db_row', 'One-arm dumbbell row', 'back', 'pull_horizontal', ['dumbbells'], ['lower_back'], 'beginner', { secondary: ['biceps'], reps: 12, cue: 'Hand on a chair or knee, flat back, elbow to hip.' }),
  x('chest_supported_db_row', 'Chest-supported dumbbell row', 'back', 'pull_horizontal', ['dumbbells', 'bench'], [], 'beginner', { secondary: ['biceps', 'shoulders'], reps: 12, cue: 'Chest on an inclined bench, squeeze shoulder blades.' }),
  x('band_row', 'Band seated row', 'back', 'pull_horizontal', ['bands'], [], 'beginner', { secondary: ['biceps'], reps: 15, cue: 'Sit tall, band around your feet, pull to your belly.' }),
  x('seated_cable_row', 'Seated cable row', 'back', 'pull_horizontal', ['machines'], ['lower_back'], 'beginner', { aliases: ['Seated row', 'Cable row'], secondary: ['biceps'], reps: 12, cue: 'Chest up, pull to your belly, pause.' }),
  x('barbell_row', 'Barbell bent-over row', 'back', 'pull_horizontal', ['barbell'], ['lower_back'], 'intermediate', { secondary: ['biceps'], reps: 8, rest: 120, cue: 'Hinge to about 45 degrees, bar to your lower ribs.' }),
  x('inverted_row', 'Inverted row', 'back', 'pull_horizontal', N, ['shoulder'], 'beginner', { secondary: ['biceps'], reps: 10, cue: 'Under a sturdy table edge, body straight, chest to the edge.' }),
  x('superman', 'Superman hold', 'back', 'core', N, ['lower_back'], 'beginner', { secondary: ['glutes'], unit: 's', reps: 20, cue: 'Lift arms and legs a few centimetres, long neck.' }),
  x('kb_row', 'Kettlebell row', 'back', 'pull_horizontal', ['kettlebell'], ['lower_back'], 'beginner', { secondary: ['biceps'], reps: 12, cue: 'Staggered stance, flat back, row to the hip.' }),
  x('towel_row', 'Door towel row', 'back', 'pull_horizontal', N, [], 'beginner', { secondary: ['biceps'], reps: 12, cue: 'Towel around a sturdy door handle, lean back, pull.' }),
  x('renegade_row', 'Renegade row', 'back', 'pull_horizontal', ['dumbbells'], ['wrist', 'lower_back'], 'advanced', { secondary: ['core'], reps: 8, cue: 'Plank on dumbbells, row without twisting your hips.' }),

  // ── shoulders ──
  x('pike_push_up', 'Pike push-up', 'shoulders', 'push_vertical', N, ['shoulder', 'wrist'], 'intermediate', { secondary: ['triceps'], reps: 8, cue: 'Hips high, lower your head between your hands.' }),
  x('db_shoulder_press', 'Dumbbell shoulder press', 'shoulders', 'push_vertical', ['dumbbells'], ['shoulder', 'lower_back'], 'beginner', { secondary: ['triceps'], cue: 'Ribs down, press straight up beside your ears.' }),
  x('arnold_press', 'Arnold press', 'shoulders', 'push_vertical', ['dumbbells'], ['shoulder'], 'intermediate', { secondary: ['triceps'], reps: 12, cue: 'Rotate palms out as you press.' }),
  x('lateral_raise', 'Lateral raise', 'shoulders', 'isolation', ['dumbbells'], ['shoulder'], 'beginner', { aliases: ['Dumbbell lateral raise'], reps: 15, cue: 'Lead with the elbows, stop at shoulder height.' }),
  x('band_lateral_raise', 'Band lateral raise', 'shoulders', 'isolation', ['bands'], ['shoulder'], 'beginner', { reps: 15, cue: 'Stand on the band, raise to shoulder height.' }),
  x('band_overhead_press', 'Band overhead press', 'shoulders', 'push_vertical', ['bands'], ['shoulder'], 'beginner', { secondary: ['triceps'], reps: 12, cue: 'Stand on the band, press overhead, ribs down.' }),
  x('kb_press', 'Kettlebell overhead press', 'shoulders', 'push_vertical', ['kettlebell'], ['shoulder'], 'intermediate', { secondary: ['triceps', 'core'], reps: 8, cue: 'Bell rests on the forearm, press and lock out.' }),
  x('machine_shoulder_press', 'Machine shoulder press', 'shoulders', 'push_vertical', ['machines'], ['shoulder'], 'beginner', { secondary: ['triceps'], cue: 'Seat so handles start at shoulder height.' }),
  x('barbell_ohp', 'Barbell overhead press', 'shoulders', 'push_vertical', ['barbell'], ['shoulder', 'lower_back'], 'intermediate', { secondary: ['triceps', 'core'], reps: 6, rest: 120, cue: 'Squeeze glutes, bar travels close to your face.' }),
  x('band_face_pull', 'Band face pull', 'shoulders', 'pull_horizontal', ['bands'], [], 'beginner', { secondary: ['back'], reps: 15, rest: 60, cue: 'Pull to your eyes, thumbs point back.' }),
  x('cable_face_pull', 'Face pull', 'shoulders', 'pull_horizontal', ['machines'], [], 'beginner', { aliases: ['Cable face pull'], secondary: ['back'], reps: 15, rest: 60, cue: 'Rope at eye height, pull apart to your ears.' }),
  x('rear_delt_fly', 'Dumbbell rear delt fly', 'shoulders', 'isolation', ['dumbbells'], ['lower_back'], 'beginner', { secondary: ['back'], reps: 15, cue: 'Hinge forward, open arms wide with soft elbows.' }),
  x('plank_shoulder_tap', 'Plank shoulder tap', 'shoulders', 'core', N, ['wrist'], 'beginner', { secondary: ['core', 'chest'], reps: 20, rest: 45, cue: 'High plank, feet wide, tap each shoulder without rocking your hips.' }),
  x('wall_slide', 'Wall slide', 'shoulders', 'isolation', N, [], 'beginner', { secondary: ['back'], reps: 10, rest: 45, cue: 'Back and arms against the wall, slide your arms up and down slowly.' }),
  x('prone_ytw', 'Prone Y-T-W raise', 'shoulders', 'isolation', N, [], 'beginner', { secondary: ['back'], reps: 8, rest: 60, cue: 'Face down, thumbs up, make each letter slowly.' }),

  // ── biceps ──
  x('db_curl', 'Dumbbell curl', 'biceps', 'isolation', ['dumbbells'], ['elbow'], 'beginner', { reps: 12, cue: 'Elbows pinned to your sides, no swinging.' }),
  x('hammer_curl', 'Hammer curl', 'biceps', 'isolation', ['dumbbells'], ['elbow'], 'beginner', { reps: 12, cue: 'Palms facing each other the whole way.' }),
  x('band_curl', 'Band curl', 'biceps', 'isolation', ['bands'], ['elbow'], 'beginner', { reps: 15, cue: 'Stand on the band, curl and squeeze.' }),
  x('barbell_curl', 'Barbell curl', 'biceps', 'isolation', ['barbell'], ['elbow', 'wrist'], 'beginner', { reps: 10, cue: 'Shoulder-width grip, control the way down.' }),
  x('cable_curl', 'Cable curl', 'biceps', 'isolation', ['machines'], ['elbow'], 'beginner', { reps: 12, cue: 'Step back slightly, elbows still.' }),
  x('kb_curl', 'Kettlebell curl', 'biceps', 'isolation', ['kettlebell'], ['elbow'], 'beginner', { reps: 12, cue: 'Hold the horns, curl to your chest.' }),
  x('towel_curl', 'Isometric towel curl', 'biceps', 'isolation', N, ['elbow'], 'beginner', { unit: 's', reps: 20, rest: 45, cue: 'Stand on a towel, pull up hard with bent elbows.' }),

  // ── triceps ──
  x('diamond_push_up', 'Diamond push-up', 'triceps', 'push_horizontal', N, ['wrist', 'elbow'], 'intermediate', { secondary: ['chest'], reps: 8, cue: 'Hands together under your chest, elbows close.' }),
  x('bench_dip', 'Chair dip', 'triceps', 'push_vertical', N, ['shoulder', 'wrist'], 'beginner', { aliases: ['Bench dip'], reps: 12, cue: 'Hands on a sturdy chair, shoulders away from ears.' }),
  x('isometric_triceps_press', 'Isometric triceps press', 'triceps', 'isolation', N, [], 'beginner', { unit: 's', reps: 20, rest: 45, cue: 'Hands on a table edge, arms straight, press down hard and hold.' }),
  x('db_overhead_extension', 'Dumbbell overhead triceps extension', 'triceps', 'isolation', ['dumbbells'], ['elbow', 'shoulder'], 'beginner', { reps: 12, cue: 'Elbows point forward, lower behind your head.' }),
  x('band_pushdown', 'Band triceps push-down', 'triceps', 'isolation', ['bands'], ['elbow'], 'beginner', { reps: 15, cue: 'Band anchored high, elbows pinned.' }),
  x('cable_pushdown', 'Cable triceps push-down', 'triceps', 'isolation', ['machines'], ['elbow'], 'beginner', { aliases: ['Triceps push-down', 'Tricep pushdown'], reps: 12, cue: 'Elbows at your sides, push to straight arms.' }),
  x('db_skull_crusher', 'Dumbbell skull crusher', 'triceps', 'isolation', ['dumbbells', 'bench'], ['elbow'], 'intermediate', { reps: 10, cue: 'Lower beside your head, upper arms still.' }),
  x('close_grip_bench', 'Close-grip bench press', 'triceps', 'push_horizontal', ['barbell', 'bench'], ['wrist', 'shoulder'], 'intermediate', { secondary: ['chest'], reps: 8, rest: 120, cue: 'Hands shoulder-width, elbows tucked.' }),
  x('db_kickback', 'Dumbbell kickback', 'triceps', 'isolation', ['dumbbells'], [], 'beginner', { reps: 15, cue: 'Hinge forward, straighten the arm behind you.' }),
  x('kb_overhead_extension', 'Kettlebell overhead extension', 'triceps', 'isolation', ['kettlebell'], ['elbow', 'shoulder'], 'beginner', { reps: 12, cue: 'Hold the horns, lower behind your head.' }),

  // ── quads ──
  x('bodyweight_squat', 'Bodyweight squat', 'quads', 'squat', N, ['knee'], 'beginner', { aliases: ['Air squat', 'Squat'], secondary: ['glutes'], reps: 15, cue: 'Sit back and down, knees track over toes.' }),
  x('box_squat', 'Squat to chair', 'quads', 'squat', N, [], 'beginner', { secondary: ['glutes'], reps: 12, cue: 'Tap a chair lightly and stand; knee-friendly depth.' }),
  x('db_box_squat', 'Dumbbell squat to a box', 'quads', 'squat', ['dumbbells'], [], 'beginner', { secondary: ['glutes'], reps: 12, cue: 'Sit back to a box or chair at knee height, stand tall; a knee-friendly depth.' }),
  x('straight_leg_raise', 'Straight-leg raise', 'quads', 'isolation', N, [], 'beginner', { secondary: ['core'], reps: 12, rest: 45, cue: 'Lying down, one knee bent, lift the straight leg to the other knee height.' }),
  x('band_tke', 'Band terminal knee extension', 'quads', 'isolation', ['bands'], [], 'beginner', { reps: 15, rest: 45, cue: 'Band behind the knee, straighten the leg fully and squeeze the thigh.' }),
  x('goblet_squat', 'Goblet squat', 'quads', 'squat', ['dumbbells'], ['knee'], 'beginner', { secondary: ['glutes', 'core'], reps: 12, cue: 'Hold the dumbbell at your chest, elbows inside knees.' }),
  x('kb_goblet_squat', 'Kettlebell goblet squat', 'quads', 'squat', ['kettlebell'], ['knee'], 'beginner', { secondary: ['glutes', 'core'], reps: 12, cue: 'Bell at your chest, chest up.' }),
  x('back_squat', 'Back squat', 'quads', 'squat', ['barbell'], ['knee', 'lower_back'], 'intermediate', { aliases: ['Barbell back squat', 'Barbell squat'], secondary: ['glutes', 'hamstrings'], reps: 8, rest: 150, cue: 'Brace, break at hips and knees together, use safeties.' }),
  x('front_squat', 'Front squat', 'quads', 'squat', ['barbell'], ['knee', 'wrist'], 'advanced', { secondary: ['glutes', 'core'], reps: 6, rest: 150, cue: 'Elbows high, upright torso.' }),
  x('leg_press', 'Leg press', 'quads', 'squat', ['machines'], ['knee'], 'beginner', { secondary: ['glutes'], reps: 10, rest: 120, cue: 'Lower back stays on the pad, no locking knees.' }),
  x('leg_extension', 'Leg extension', 'quads', 'isolation', ['machines'], ['knee'], 'beginner', { reps: 12, cue: 'Pause at the top, lower slowly.' }),
  x('hack_squat', 'Hack squat', 'quads', 'squat', ['machines'], ['knee'], 'intermediate', { secondary: ['glutes'], reps: 10, rest: 120, cue: 'Feet mid-platform, controlled depth.' }),
  x('split_squat', 'Split squat', 'quads', 'lunge', N, ['knee'], 'beginner', { secondary: ['glutes'], reps: 10, cue: 'Long stance, back knee drops straight down.' }),
  x('bulgarian_split_squat', 'Bulgarian split squat', 'quads', 'lunge', N, ['knee', 'hip'], 'intermediate', { secondary: ['glutes'], reps: 10, cue: 'Back foot on a chair, front shin fairly upright.' }),
  x('walking_lunge', 'Walking lunge', 'quads', 'lunge', N, ['knee'], 'beginner', { secondary: ['glutes'], reps: 12, cue: 'Step long, back knee hovers above the floor.' }),
  x('reverse_lunge', 'Reverse lunge', 'quads', 'lunge', N, ['knee'], 'beginner', { secondary: ['glutes'], reps: 10, cue: 'Step back, kinder to the knees than a forward lunge.' }),
  x('db_reverse_lunge', 'Dumbbell reverse lunge', 'quads', 'lunge', ['dumbbells'], ['knee'], 'beginner', { secondary: ['glutes'], reps: 10, cue: 'Dumbbells at your sides, torso tall.' }),
  x('step_up', 'Step-up', 'quads', 'lunge', N, ['knee'], 'beginner', { secondary: ['glutes'], reps: 10, cue: 'Whole foot on a stable step, drive through the heel.' }),
  x('wall_sit', 'Wall sit', 'quads', 'squat', N, ['knee'], 'beginner', { unit: 's', reps: 40, rest: 60, cue: 'Back flat on the wall, thighs near parallel.' }),
  x('band_squat', 'Banded squat', 'quads', 'squat', ['bands'], ['knee'], 'beginner', { secondary: ['glutes'], reps: 15, cue: 'Band under feet and over shoulders.' }),
  x('jump_squat', 'Jump squat', 'quads', 'conditioning', N, ['knee', 'ankle'], 'intermediate', { secondary: ['glutes', 'calves'], reps: 10, cue: 'Land soft and quiet, knees out.' }),

  // ── hamstrings ──
  x('db_rdl', 'Dumbbell Romanian deadlift', 'hamstrings', 'hinge', ['dumbbells'], ['lower_back'], 'beginner', { secondary: ['glutes', 'back'], reps: 10, cue: 'Push hips back, dumbbells slide down your thighs.' }),
  x('barbell_rdl', 'Romanian deadlift', 'hamstrings', 'hinge', ['barbell'], ['lower_back'], 'intermediate', { aliases: ['Barbell Romanian deadlift', 'RDL'], secondary: ['glutes', 'back'], reps: 8, rest: 120, cue: 'Soft knees, flat back, stop at a hamstring stretch.' }),
  x('deadlift', 'Deadlift', 'hamstrings', 'hinge', ['barbell'], ['lower_back'], 'intermediate', { aliases: ['Barbell deadlift', 'Conventional deadlift'], secondary: ['glutes', 'back', 'quads'], reps: 5, rest: 150, cue: 'Bar over mid-foot, brace, push the floor away.' }),
  x('kb_deadlift', 'Kettlebell deadlift', 'hamstrings', 'hinge', ['kettlebell'], ['lower_back'], 'beginner', { secondary: ['glutes'], reps: 12, cue: 'Bell between your feet, hips back, stand tall.' }),
  x('kb_swing', 'Kettlebell swing', 'hamstrings', 'hinge', ['kettlebell'], ['lower_back'], 'intermediate', { secondary: ['glutes', 'core'], reps: 15, cue: 'Snap the hips; arms only guide the bell.' }),
  x('single_leg_rdl', 'Single-leg Romanian deadlift', 'hamstrings', 'hinge', N, ['ankle'], 'beginner', { secondary: ['glutes'], reps: 10, cue: 'Reach back with the free leg, hips square.' }),
  x('bodyweight_good_morning', 'Bodyweight good morning', 'hamstrings', 'hinge', N, ['lower_back'], 'beginner', { secondary: ['glutes'], reps: 12, cue: 'Hands behind your head, soft knees, hinge until you feel the hamstrings.' }),
  x('leg_curl', 'Leg curl', 'hamstrings', 'isolation', ['machines'], ['knee'], 'beginner', { aliases: ['Lying leg curl', 'Seated leg curl'], reps: 12, cue: 'Hips stay down, squeeze at the top.' }),
  x('band_leg_curl', 'Band hamstring curl', 'hamstrings', 'isolation', ['bands'], ['knee'], 'beginner', { reps: 15, cue: 'Lie face down, band anchored low, curl your heel in.' }),
  x('slider_leg_curl', 'Towel hamstring curl', 'hamstrings', 'isolation', N, ['knee'], 'intermediate', { secondary: ['glutes'], reps: 10, cue: 'Heels on a towel on a smooth floor, hips up, pull in.' }),
  x('band_good_morning', 'Band good morning', 'hamstrings', 'hinge', ['bands'], ['lower_back'], 'beginner', { secondary: ['glutes'], reps: 15, cue: 'Band under feet and behind neck, hinge with a flat back.' }),

  // ── glutes ──
  x('glute_bridge', 'Glute bridge', 'glutes', 'hinge', N, [], 'beginner', { secondary: ['hamstrings'], reps: 15, rest: 60, cue: 'Drive through heels, squeeze at the top.' }),
  x('single_leg_glute_bridge', 'Single-leg glute bridge', 'glutes', 'hinge', N, [], 'beginner', { secondary: ['hamstrings'], reps: 10, rest: 60, cue: 'Hips stay level the whole time.' }),
  x('hip_thrust', 'Barbell hip thrust', 'glutes', 'hinge', ['barbell', 'bench'], ['lower_back'], 'intermediate', { secondary: ['hamstrings'], reps: 10, rest: 120, cue: 'Upper back on the bench, chin tucked, lock out with glutes.' }),
  x('db_hip_thrust', 'Dumbbell hip thrust', 'glutes', 'hinge', ['dumbbells', 'bench'], [], 'beginner', { secondary: ['hamstrings'], reps: 12, cue: 'Dumbbell on your hips, pause at the top.' }),
  x('band_lateral_walk', 'Band lateral walk', 'glutes', 'isolation', ['bands'], [], 'beginner', { reps: 12, rest: 45, cue: 'Band above knees, small steps, stay low.' }),
  x('cable_kickback', 'Cable glute kickback', 'glutes', 'isolation', ['machines'], ['lower_back'], 'beginner', { reps: 12, cue: 'Kick back and slightly out, no arching.' }),
  x('glute_kickback', 'Glute kickback', 'glutes', 'isolation', N, [], 'beginner', { reps: 15, rest: 45, cue: 'On hands and knees, press a heel to the ceiling.' }),
  x('kb_sumo_deadlift', 'Kettlebell sumo deadlift', 'glutes', 'hinge', ['kettlebell'], ['lower_back'], 'beginner', { secondary: ['quads', 'hamstrings'], reps: 12, cue: 'Wide stance, toes out, stand up tall.' }),

  // ── calves ──
  x('calf_raise', 'Standing calf raise', 'calves', 'isolation', N, ['ankle'], 'beginner', { aliases: ['Calf raise'], reps: 15, rest: 45, cue: 'On a step edge, full stretch then full rise.' }),
  x('db_calf_raise', 'Dumbbell calf raise', 'calves', 'isolation', ['dumbbells'], ['ankle'], 'beginner', { reps: 15, rest: 45, cue: 'Hold a dumbbell, pause at the top.' }),
  x('machine_calf_raise', 'Machine calf raise', 'calves', 'isolation', ['machines'], ['ankle'], 'beginner', { reps: 12, rest: 45, cue: 'Slow down, pause in the stretch.' }),

  // ── core ──
  x('plank', 'Plank', 'core', 'core', N, ['shoulder'], 'beginner', { unit: 's', reps: 40, rest: 45, cue: 'Elbows under shoulders, squeeze glutes.' }),
  x('side_plank', 'Side plank', 'core', 'core', N, ['shoulder'], 'beginner', { unit: 's', reps: 30, rest: 45, cue: 'Hips high, body in one line.' }),
  x('dead_bug', 'Dead bug', 'core', 'core', N, [], 'beginner', { reps: 10, rest: 45, cue: 'Lower back pressed down, slow opposite arm and leg.' }),
  x('bird_dog', 'Bird dog', 'core', 'core', N, [], 'beginner', { secondary: ['back', 'glutes'], reps: 10, rest: 45, cue: 'Reach long, hips stay level.' }),
  x('hollow_hold', 'Hollow hold', 'core', 'core', N, ['lower_back'], 'intermediate', { unit: 's', reps: 25, rest: 45, cue: 'Lower back glued down, arms by your ears.' }),
  x('bicycle_crunch', 'Bicycle crunch', 'core', 'core', N, ['neck'], 'beginner', { reps: 20, rest: 45, cue: 'Slow and controlled, hands light on your head.' }),
  x('russian_twist', 'Russian twist', 'core', 'core', N, ['lower_back'], 'beginner', { reps: 20, rest: 45, cue: 'Lean back slightly, rotate from the ribs.' }),
  x('hanging_knee_raise', 'Hanging knee raise', 'core', 'core', ['pullup_bar'], ['shoulder'], 'intermediate', { reps: 10, rest: 60, cue: 'No swinging, curl the hips up.' }),
  x('band_pallof_press', 'Band Pallof press', 'core', 'core', ['bands'], [], 'beginner', { reps: 10, rest: 45, cue: 'Band anchored at your side, press out and resist the twist.' }),
  x('cable_pallof_press', 'Cable Pallof press', 'core', 'core', ['machines'], [], 'beginner', { reps: 10, rest: 45, cue: 'Stand side-on to the cable, press out and hold.' }),
  x('cable_crunch', 'Cable crunch', 'core', 'core', ['machines'], ['lower_back', 'neck'], 'beginner', { reps: 12, rest: 60, cue: 'Kneel, crunch ribs to hips.' }),
  x('kb_halo', 'Kettlebell halo', 'core', 'core', ['kettlebell'], ['shoulder'], 'beginner', { secondary: ['shoulders'], reps: 8, rest: 45, cue: 'Circle the bell close around your head, ribs down.' }),
  x('db_side_bend', 'Dumbbell suitcase hold', 'core', 'carry', ['dumbbells'], [], 'beginner', { unit: 's', reps: 30, rest: 45, cue: 'One heavy dumbbell, stand tall without leaning.' }),

  // ── full body and carries ──
  x('farmer_carry', "Farmer's carry", 'full_body', 'carry', ['dumbbells'], [], 'beginner', { secondary: ['core', 'back'], unit: 'm', reps: 30, rest: 60, cue: 'Heavy dumbbells, tall posture, short quick steps.' }),
  x('kb_carry', 'Kettlebell carry', 'full_body', 'carry', ['kettlebell'], [], 'beginner', { secondary: ['core'], unit: 'm', reps: 30, rest: 60, cue: 'Bell at your side, walk tall.' }),
  x('db_thruster', 'Dumbbell thruster', 'full_body', 'squat', ['dumbbells'], ['knee', 'shoulder'], 'intermediate', { secondary: ['quads', 'shoulders'], reps: 10, cue: 'Squat, then drive the dumbbells overhead in one move.' }),
  x('kb_clean_press', 'Kettlebell clean and press', 'full_body', 'push_vertical', ['kettlebell'], ['shoulder', 'lower_back'], 'advanced', { secondary: ['shoulders', 'hamstrings'], reps: 6, rest: 120, cue: 'Clean to the rack, then press.' }),
  x('burpee', 'Burpee', 'full_body', 'conditioning', N, ['knee', 'wrist', 'shoulder'], 'intermediate', { secondary: ['cardio'], reps: 10, rest: 60, cue: 'Step back instead of jumping to make it easier.' }),
  x('bear_crawl', 'Bear crawl', 'full_body', 'conditioning', N, ['wrist'], 'intermediate', { secondary: ['core', 'shoulders'], unit: 's', reps: 30, rest: 60, cue: 'Knees an inch off the floor, opposite hand and foot.' }),

  // ── cardio ──
  x('jumping_jacks', 'Jumping jacks', 'cardio', 'conditioning', N, ['ankle', 'knee'], 'beginner', { unit: 's', reps: 40, rest: 30, cue: 'Light on your feet; step-jacks are lower impact.' }),
  x('high_knees', 'High knees', 'cardio', 'conditioning', N, ['knee', 'ankle'], 'beginner', { unit: 's', reps: 30, rest: 30, cue: 'Knees to hip height, stay on the balls of your feet.' }),
  x('mountain_climber', 'Mountain climber', 'cardio', 'conditioning', N, ['wrist', 'shoulder'], 'beginner', { secondary: ['core'], unit: 's', reps: 30, rest: 30, cue: 'Hips low, drive knees to chest.' }),
  x('shadow_boxing', 'Shadow boxing', 'cardio', 'conditioning', N, ['shoulder'], 'beginner', { unit: 's', reps: 60, rest: 30, cue: 'Guard up, light on your feet, breathe out on each punch.' }),
  x('march_in_place', 'Brisk march in place', 'cardio', 'conditioning', N, [], 'beginner', { unit: 's', reps: 60, rest: 30, cue: 'Arms swinging, knees up; a joint-friendly option.' }),
  x('rowing_intervals', 'Rowing intervals', 'cardio', 'conditioning', ['machines'], ['lower_back'], 'beginner', { aliases: ['Rowing machine', 'Row intervals'], secondary: ['back'], unit: 'm', sets: 5, reps: 250, rest: 60, cue: 'Legs, then body, then arms; reverse on the way back.' }),
  x('bike_intervals', 'Bike intervals', 'cardio', 'conditioning', ['machines'], [], 'beginner', { aliases: ['Stationary bike', 'Spin intervals'], unit: 's', sets: 6, reps: 30, rest: 60, cue: 'Hard for the interval, easy spin to recover.' }),
  x('incline_walk', 'Incline treadmill walk', 'cardio', 'conditioning', ['machines'], [], 'beginner', { unit: 's', sets: 1, reps: 900, rest: 0, cue: 'Brisk pace, do not hold the rails.' }),
  x('kb_swing_cardio', 'Kettlebell swing intervals', 'cardio', 'conditioning', ['kettlebell'], ['lower_back'], 'intermediate', { secondary: ['hamstrings', 'glutes'], unit: 's', sets: 6, reps: 20, rest: 40, cue: 'Powerful hips, steady breathing.' }),
  x('jump_rope', 'Jump rope (or rope-less hops)', 'cardio', 'conditioning', N, ['ankle', 'knee'], 'beginner', { unit: 's', reps: 45, rest: 30, cue: 'Small hops on the balls of your feet.' }),
];

const BY_ID = new Map(EXERCISES.map((e) => [e.id, e]));

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

const BY_NAME = new Map<string, Exercise>();
for (const e of EXERCISES) {
  BY_NAME.set(norm(e.name), e);
  for (const a of e.aliases ?? []) if (!BY_NAME.has(norm(a))) BY_NAME.set(norm(a), e);
}

/** The exercise with this id, name or alias (case and punctuation ignored). */
export function findExercise(idOrName: string | null | undefined): Exercise | null {
  if (!idOrName) return null;
  return BY_ID.get(idOrName) ?? BY_NAME.get(norm(idOrName)) ?? null;
}

/** What someone can train with at a location. 'none' is always there. */
export function availableEquipment(location: TrainLocation | null | undefined, equipment: readonly string[] = []): Equipment[] {
  if (location === 'gym') return [...ALL_EQUIPMENT];
  if (location === 'home_equipment') {
    const own = equipment.filter((e): e is Equipment => (ALL_EQUIPMENT as readonly string[]).includes(e));
    return ['none', ...own.filter((e) => e !== 'none')];
  }
  return ['none'];
}

export function fitsEquipment(e: Exercise, available: readonly Equipment[]): boolean {
  return e.equipment.every((k) => k === 'none' || available.includes(k));
}

export function safeFor(e: Exercise, injuries: readonly InjuryArea[]): boolean {
  return !e.cautions.some((c) => injuries.includes(c));
}

const INJURY_WORDS: [InjuryArea, RegExp][] = [
  ['knee', /\b(knees?|acl|mcl|menisc\w*|patell\w*)\b/i],
  ['lower_back', /\b(lower back|back pain|lumbar|disc|sciatica|herniat\w*|back injury|bad back)\b/i],
  ['shoulder', /\b(shoulders?|rotator|labrum|frozen shoulder)\b/i],
  ['wrist', /\b(wrists?|carpal)\b/i],
  ['elbow', /\b(elbows?|tennis elbow|golfer'?s elbow)\b/i],
  ['hip', /\b(hips?|groin)\b/i],
  ['ankle', /\b(ankles?|achilles|plantar|feet|foot)\b/i],
  ['neck', /\b(neck|cervical)\b/i],
];

/** Injury areas mentioned in free text ("old knee sprain, sore lower back"). */
export function injuriesFromText(text: string | null | undefined): InjuryArea[] {
  if (!text) return [];
  return INJURY_WORDS.filter(([, re]) => re.test(text)).map(([area]) => area);
}

/** The library filtered to what fits: equipment, injuries and (optionally)
    muscle, pattern and the hardest level allowed. */
export function exercisesFor(opts: {
  available: readonly Equipment[];
  injuries?: readonly InjuryArea[];
  muscle?: Muscle;
  pattern?: Pattern;
  maxLevel?: Level;
}): Exercise[] {
  const order: Level[] = ['beginner', 'intermediate', 'advanced'];
  const cap = order.indexOf(opts.maxLevel ?? 'advanced');
  return EXERCISES.filter(
    (e) =>
      fitsEquipment(e, opts.available) &&
      safeFor(e, opts.injuries ?? []) &&
      (!opts.muscle || e.muscle === opts.muscle) &&
      (!opts.pattern || e.pattern === opts.pattern) &&
      order.indexOf(e.level) <= cap,
  );
}

/** Up to `count` (default 3) alternatives that train the same muscle group,
    fit the equipment and avoid the injuries. Same movement pattern first,
    then shared secondary muscles, then a similar level. If the same muscle
    has too few options, exercises that train it as a secondary muscle or
    share the pattern fill the gap. Deterministic. */
export function alternativesFor(
  exercise: Exercise | string,
  available: readonly Equipment[],
  injuries: readonly InjuryArea[] = [],
  opts: { count?: number; exclude?: readonly string[]; maxLevel?: Level } = {},
): Exercise[] {
  const ex = typeof exercise === 'string' ? findExercise(exercise) : exercise;
  if (!ex) return [];
  const count = opts.count ?? 3;
  const exclude = new Set([ex.id, ...(opts.exclude ?? [])]);
  const order: Level[] = ['beginner', 'intermediate', 'advanced'];
  const cap = order.indexOf(opts.maxLevel ?? 'advanced');
  const pool = EXERCISES.filter(
    (e) => !exclude.has(e.id) && fitsEquipment(e, available) && safeFor(e, injuries) && order.indexOf(e.level) <= cap,
  );
  const score = (e: Exercise): number => {
    let s = 0;
    if (e.muscle === ex.muscle) s += 10;
    else if (e.secondary.includes(ex.muscle)) s += 4;
    if (e.pattern === ex.pattern) s += 3;
    if (e.secondary.some((m) => ex.secondary.includes(m))) s += 1;
    if (e.level === ex.level) s += 1;
    if (e.unit === ex.unit) s += 1;
    // Keep the kind of load: swapping a loaded lift for a bodyweight move
    // (or the reverse) is a weaker match when the person has the kit.
    const loaded = (x: Exercise) => !x.equipment.every((k) => k === 'none');
    if (loaded(e) === loaded(ex)) s += 2;
    if (e.equipment.some((k) => k !== 'none' && ex.equipment.includes(k))) s += 1;
    return s;
  };
  const ranked = pool
    .map((e, i) => ({ e, s: score(e), i }))
    .filter(({ e }) => e.muscle === ex.muscle || e.secondary.includes(ex.muscle) || e.pattern === ex.pattern)
    .sort((a, b) => b.s - a.s || a.i - b.i);
  return ranked.slice(0, count).map(({ e }) => e);
}

/** The exercise itself when it fits, otherwise its best alternative (or
    null when nothing fits). Used for home and gym variants of a plan. */
export function variantFor(
  exercise: Exercise | string,
  available: readonly Equipment[],
  injuries: readonly InjuryArea[] = [],
): Exercise | null {
  const ex = typeof exercise === 'string' ? findExercise(exercise) : exercise;
  if (!ex) return null;
  if (fitsEquipment(ex, available) && safeFor(ex, injuries)) return ex;
  return alternativesFor(ex, available, injuries, { count: 1 })[0] ?? null;
}
