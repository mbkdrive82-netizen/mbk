import dynamic from 'next/dynamic';

export const metadata = {
  title: 'Trainer Registration',
  description:
    'Join MBK Carrierz as a professional trainer. Complete your registration to start training students and building your career.',
};

export function generateStaticParams() {
  return [
    { stepSlug: 'step2' },
    { stepSlug: 'step3' },
    { stepSlug: 'step4' },
    { stepSlug: 'step5' },
    { stepSlug: 'step6' },
  ];
}

const TrainerRegistration = dynamic(
  () => import('@/features/auth/pages/TrainerRegistration'),
);

export default function TrainerSignupStepPage() {
  return <TrainerRegistration />;
}
