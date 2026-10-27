import { LIMIT_KINDS, PLAN_CODES, PLANS } from '@slotwise/shared/platform';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@slotwise/ui';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Slotwise: timetables for colleges',
  description:
    'Clash-free timetables, rescheduling and exam seating for colleges and universities.',
};

const FEATURES = ['timetable', 'reschedule', 'exams', 'phones'] as const;
const STEPS = ['one', 'two', 'three'] as const;

/**
 * Marketing page. At /welcome because "/" is still INT's home page (apps/web/src/app/page.tsx);
 * moving it to the root is an INT request.
 */
export default async function WelcomePage() {
  const t = await getTranslations('p7.marketing');
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col">
      <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <span className="text-base font-semibold">{t('title')}</span>
        <Button asChild variant="ghost" size="sm">
          <Link href="/sign-in">{t('signIn')}</Link>
        </Button>
      </header>

      <main id="main" className="flex flex-1 flex-col gap-12 px-4 py-10">
        <section className="flex flex-col gap-4" aria-labelledby="hero">
          <h1 id="hero" className="text-3xl font-semibold leading-tight sm:text-4xl">
            {t('heroTitle')}
          </h1>
          <p className="max-w-2xl text-lg text-muted-foreground">{t('heroBody')}</p>
          <div className="flex flex-wrap items-center gap-3">
            <Button asChild size="lg">
              <Link href="/signup">{t('start')}</Link>
            </Button>
            <span className="text-sm text-muted-foreground">{t('trialNote')}</span>
          </div>
        </section>

        <section className="flex flex-col gap-4" aria-labelledby="features">
          <h2 id="features" className="text-xl font-semibold">
            {t('featuresTitle')}
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {FEATURES.map((key) => (
              <li key={key}>
                <Card className="h-full">
                  <CardHeader>
                    <CardTitle>{t(`features.${key}.title`)}</CardTitle>
                    <CardDescription className="text-base">
                      {t(`features.${key}.body`)}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </li>
            ))}
          </ul>
        </section>

        <section className="flex flex-col gap-4" aria-labelledby="steps">
          <h2 id="steps" className="text-xl font-semibold">
            {t('stepsTitle')}
          </h2>
          <ol className="flex list-decimal flex-col gap-2 pl-6 text-base">
            {STEPS.map((key) => (
              <li key={key}>{t(`steps.${key}`)}</li>
            ))}
          </ol>
        </section>

        <section className="flex flex-col gap-4" aria-labelledby="plans">
          <div className="flex flex-col gap-1">
            <h2 id="plans" className="text-xl font-semibold">
              {t('plansTitle')}
            </h2>
            <p className="text-muted-foreground">{t('plansBody')}</p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-3">
            {PLAN_CODES.map((code) => {
              const plan = PLANS[code];
              return (
                <li key={code}>
                  <Card className="h-full">
                    <CardHeader>
                      <CardTitle>{plan.name}</CardTitle>
                      <CardDescription>
                        {plan.trialDays ? t('trialDays', { days: plan.trialDays }) : t('paid')}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                        {LIMIT_KINDS.map((kind) => (
                          <div key={kind} className="contents">
                            <dt className="text-muted-foreground">{t(`limit.${kind}`)}</dt>
                            <dd className="text-right font-medium tabular-nums">
                              {plan.limits[kind]?.toLocaleString('en-IN') ?? t('unlimited')}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
          <Button asChild size="lg" className="self-start">
            <Link href="/signup">{t('start')}</Link>
          </Button>
        </section>
      </main>
    </div>
  );
}
