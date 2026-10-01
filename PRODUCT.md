# BUILT product spec (v2)

The client's feature list, with Omar's answers (2026-10-01). The look is `DESIGN.md`; this file is
what the product does. When code and this file disagree, this file wins; fix the code or update
this file with the client's newer decision.

## Market

- Lebanon. English only. Prices in USD.
- **Payments are out of scope** until the client approves the app. Build nothing for billing, no
  paywall, no trial. (Plans for later: monthly $30, 3 months $81, yearly $300.)
- No domain yet. The website and admin live on GitHub Pages:
  `https://builtbybrains.github.io/fitness-platform/` and `.../admin/`.

## Sign-up and the questionnaire ("KYC")

- Sign in with **email + password**. Email verification is off for now (turned on later).
- After registering, a step-by-step questionnaire (one question per screen on phones, progress
  bar, back button, saved as the user goes so a closed app resumes where it stopped):
  1. Name.
  2. Phone number (kept on file, not used for login). Default country code +961, any country
     allowed.
  3. Date of birth. Age rules below.
  4. Gender.
  5. Height, current weight.
  6. **Activity level** (required): sedentary, lightly active, moderately active, very active,
     athlete. Plain-language descriptions.
  7. Job activity (desk, on my feet, physical work) and average sleep hours.
  8. **Goal** (required): Lose fat, Build muscle, Tone up, Stay fit, Sports performance.
  9. **Timeline**: 1, 3, 6 or 12 months (never under one month). Optional target weight. If the
     pace implied is unsafe (more than about 1% of bodyweight a week of loss, or more than
     0.5 kg a week of gain), say so plainly and suggest a longer timeline.
  10. Where they train: home with no equipment, home with some equipment (pick which: dumbbells,
      bands, kettlebell, pull-up bar, bench, other), or gym. Changeable any week.
  11. Training days and preferred time of day. **Sunday is the default rest day**; the user can
      move it.
  12. Diet: none, halal, vegetarian, vegan, pescatarian, lactose-free, gluten-free; allergies
      (nuts, peanuts, dairy, eggs, gluten, shellfish, fish, soy, sesame, other free text);
      foods they dislike.
  13. Injuries and medical conditions (free text plus common checkboxes).
  14. **Body photo** (front required; side and back optional), face blurred before it leaves the
      phone (see Photos).
  15. Waiver (see Age and safety) and finish. The AI builds the first plan.
- Everything stays editable later in Profile.

## Age and safety

- Under 13: cannot use the app.
- 13 to 17: allowed with a parent or guardian consent checkbox (and the parent's name). No
  calorie deficit (maintenance or growth only), no supplement advice, no max-effort lifting;
  the coach and planner know the user is a minor.
- Everyone accepts a waiver at sign-up: BUILT gives general fitness and nutrition guidance, not
  medical advice; check with a doctor before starting if you have a medical condition, are
  pregnant, or have a history of disordered eating; you train at your own risk. Store the
  acceptance time and waiver version. Draft text lives in `mobile/src/legal/waiver.ts` and needs a
  lawyer's review before launch.
- Calorie floors stay (1200 women, 1500 men or unknown), enforced in code.

## Photos

- Body photos are taken at sign-up and again at each check-in (weekly weight, monthly photos).
- **The face is blurred on the device before upload**: automatic face detection, plus a
  draggable, resizable blur area the user can adjust; the blur is baked into the pixels. Never
  upload an unblurred photo.
- Stored in a private bucket, readable only by the user. The AI may use them for suggestions;
  the admin dashboard never shows them.
- The AI estimates the starting point from photos plus the questionnaire (rough body-fat range,
  visible build, posture notes) and uses it to pick the best training approach. It never comments
  on attractiveness, never diagnoses.

## Training

- The AI generates a weekly plan from the questionnaire, photo estimate, location and equipment,
  training days and time, goal and timeline, age rules and injuries.
- Home (no equipment), home (with the user's equipment) and gym versions of exercises.
- **The user can move workout days** (drag or swap a workout to another day when the schedule is
  full). Rest day defaults to Sunday, movable.
- **Replace an exercise**: offer 3 alternatives for the same muscle group that fit their
  equipment and injuries.
- The user can ask for plan changes ("my knee hurts", "only 3 days this week") and the plan is
  updated.
- **General activities** (walking, running, football, basketball, swimming, cycling, padel,
  hiking, dancing, other) logged with duration and effort; calories burned estimated with
  MET x body weight x hours, shown on Today and in Progress.

## Food

- The AI generates a daily meal plan (breakfast, lunch, dinner, snacks) that respects diet,
  allergies and dislikes, Lebanese everyday foods included.
- **Swap a meal** for an alternative with similar calories and protein.
- **Second option: log whatever food they have at home**, by typing it ("2 eggs, 1 pita, labneh")
  or by photo. Off-plan food counts toward the day's calorie goal.
- Food photos: the AI shows **all macros** (calories, protein, carbs, fat) and **asks follow-up
  questions when it needs them** (portion size, oil or butter, sauce, what's in the drink) before
  the estimate is saved. The user confirms or edits before it counts.

## Check-ins

- Weekly: weigh-in prompt.
- Monthly check-in: weight, optional waist and other measurements, new body photos (face
  blurred), energy, sleep, hunger, how hard the plan felt, adherence. The AI reviews progress and
  adjusts the plan, and tells the user what changed and why.

## AI coach

- Chat that knows the plan, today, the questionnaire and history.
- **Memory**: the coach saves facts the user tells it (injuries, likes and dislikes, schedule,
  preferences) and learns from behaviour (skipped or swapped exercises and meals, missed days).
  The user can see everything it remembers in Profile and delete any item.
- **The AI provider stays on the free models for now.** Photos and messages go to that provider
  for processing; the privacy text must say so.

## Health apps

- Apple Health (iOS) and Health Connect (Android): read steps, active calories, workouts, weight
  and sleep; write BUILT workouts. Opt-in from Profile and during onboarding. Native builds only
  (not in the web version); the web version hides it.

## Reminders (all of them, with quiet hours)

- Workout at the chosen time on training days.
- Meals.
- Water.
- Weekly weigh-in and monthly check-in.
- Streak at risk (evening, if today's workout isn't done).
- Plan updated.
- Reply to a problem report (push from the admin).
- Quiet hours setting (default 22:00 to 07:00). Each type can be turned off.

## Report a problem

- In the app (Profile, and a shake-free menu item): a message, a category (bug, plan, food,
  account, other) and an optional screenshot. The user sees their reports and replies.
- Statuses: new, in progress, fixed. Admin replies notify the user by push.

## Admin dashboard (`/admin/` on the website)

- One admin. A **fixed, hidden username and password**, checked on the server (never in the page
  source), with sessions that expire and a lockout after repeated failures. No sign-up, no
  password reset by email.
- Overview: total users, new this week, active today and in the last 7 days, average streak,
  check-ins due, open reports.
- Users: searchable, filterable list (goal, activity level, training location, age group, last
  active, streak, signed up between), CSV export of contact details and filters (for inviting
  customers to future events).
- User detail: questionnaire answers, phone and email, streak, workouts and meals completed,
  activities, weight trend, check-in history, an activity timeline, their reports. **No body
  photos.**
- Reports inbox: filter by status, read, reply (notifies the user), change status.
- `noindex`, not linked from the public site.

## Not now

Payments and subscriptions, free trial, ID verification, email verification, Arabic, admin
editing users' plans.
