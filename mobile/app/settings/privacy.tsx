import React from 'react';
import { LegalPage } from '@/components';

export default function Privacy() {
  return (
    <LegalPage
      title="Privacy policy"
      updated="January 2026"
      sections={[
        {
          heading: 'What we collect',
          body: 'To build your plan we collect what you enter during setup: height, weight, age, activity level, goals and food preferences, along with what you log day to day such as meals, workouts, water and progress measurements.',
        },
        {
          heading: 'How we use it',
          body: 'Your information generates and adapts your nutrition and training recommendations, powers the reminders you have switched on, and shows you your own progress. Aggregated, non-identifying usage data helps us improve the app.',
        },
        {
          heading: 'Payment data',
          body: 'Card details are entered inside Stripe and never reach this app or our servers. We store only a payment token, which cannot be used anywhere else.',
        },
        {
          heading: 'What we do not do',
          body: 'We do not sell your personal information. We do not share your health data with advertisers. We do not build profiles for third parties.',
        },
        {
          heading: 'Your rights',
          body: 'You can export your data or delete your account at any time from your profile. Deleting removes your personal data from our production systems, with backups ageing out on a rolling schedule.',
        },
        {
          heading: 'Contact',
          body: 'Questions about privacy can be sent to privacy@vital.app.',
        },
      ]}
    />
  );
}
