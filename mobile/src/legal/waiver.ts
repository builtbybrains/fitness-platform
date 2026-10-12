/* The sign-up waiver. DRAFT: needs a lawyer's review before launch
   (PRODUCT.md, "Age and safety").

   When the text changes in a way people must accept again, bump
   WAIVER_VERSION. The app stores the version and the time of acceptance on
   the profile (profiles.waiver_version, profiles.waiver_accepted_at); the
   database refuses to finish onboarding without them, and for 13 to 17 year
   olds also without a guardian's name and consent
   (profiles.guardian_name, profiles.guardian_consent_at). */

export const WAIVER_VERSION = '2026-10-01-draft';

export const WAIVER_TITLE = 'Before you start';

/** Paragraphs, in order. Plain language, second person. */
export const WAIVER_PARAGRAPHS: readonly string[] = [
  'BUILT gives general fitness and nutrition guidance. It is not medical advice, and it does not diagnose or treat any condition.',
  'Check with a doctor before you start if you have a medical condition or an injury, are pregnant or recently gave birth, take regular medication, or have a history of disordered eating.',
  'Stop training and get medical help if you feel chest pain, faintness, severe shortness of breath or sharp pain.',
  'You train at your own risk. Choose weights and paces you can control, and skip anything that hurts.',
  'Your coach and your plans are written by an AI from what you tell us. Your messages and your face-blurred photos are sent to our AI provider to do this. Your photos are stored privately; only you can see them.',
];

/** The checkbox every person ticks. */
export const WAIVER_ACCEPT_LABEL = 'I have read this and I accept it.';

/** Shown to 13 to 17 year olds, with a field for the guardian's name. */
export const GUARDIAN_TITLE = 'Parent or guardian consent';
export const GUARDIAN_TEXT =
  'You are under 18, so a parent or guardian needs to agree to you using BUILT. Your plan keeps calories at maintenance or above, avoids maximum-effort lifts and never suggests supplements.';
export const GUARDIAN_NAME_LABEL = "Parent or guardian's full name";
export const GUARDIAN_ACCEPT_LABEL = 'I am their parent or guardian and I agree to them using BUILT.';

/** Shown instead of the app to anyone under 13. */
export const UNDER_13_TEXT = 'BUILT is for people aged 13 and over.';

/** Everything as one block of text, for a scroll view or a share sheet. */
export function waiverText(): string {
  return [WAIVER_TITLE, ...WAIVER_PARAGRAPHS].join('\n\n');
}
