/* Today, as the Coach tab needs it for its starter questions and its
   "Your coach sees" chips: the session, protein and calories so far (plan
   meals ticked plus food logged, the same numbers as Today and Food), the
   workout streak and the hour. Null until the plan has loaded. */

import { useMemo } from 'react';

import { useFoodLogs } from '../../foodLogs';
import { usePlan } from '../../planStore';
import { daySummary } from '../../stats';
import type { CoachDay } from '../../lib/coachStarters';

export function useCoachDay(): CoachDay | null {
  const { days, todayIdx, todayId, targets, streak, activities, planLoaded } = usePlan();
  const food = useFoodLogs(todayId);
  const day = days[todayIdx];
  const hour = new Date().getHours();
  return useMemo(() => {
    if (!day || !planLoaded) return null;
    const mine = activities.filter((a) => a.day === todayId);
    const s = daySummary({
      day,
      logs: food.logs,
      activityKcal: mine.reduce((a, x) => a + x.kcal, 0),
      activityMinutes: mine.reduce((a, x) => a + x.minutes, 0),
      water: { count: 0, target: 0 },
      targets,
    });
    return {
      session: day.session.kind === 'workout' ? { kind: 'workout', focus: day.session.focus } : { kind: 'rest' },
      workoutDone: !!day.done.workout,
      protein: { eaten: s.eaten.protein, target: targets.protein },
      kcal: { eaten: s.eaten.kcal, target: targets.kcal },
      streak,
      hour,
    };
  }, [day, planLoaded, activities, todayId, food.logs, targets, streak, hour]);
}
