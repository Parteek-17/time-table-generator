import { SETUP_STEPS, type SetupStateDto, type SetupStep, type TermRow } from '@slotwise/shared';
import { Card, CardDescription, CardHeader, CardTitle } from '@slotwise/ui';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { BatchesSection } from '../../batches/section';
import { DefaultBellSection } from '../../bell-schedules/section';
import { CalendarSection } from '../../calendar/section';
import { CohortsSection } from '../../cohorts/section';
import { DepartmentsSection } from '../../departments/section';
import { FacultySection } from '../../faculty/section';
import { ProgrammesSection } from '../../programmes/section';
import { RoomsSection } from '../../rooms/section';
import { SchemesSection } from '../../schemes/section';
import { InstituteSection } from '../../settings/institute/section';
import { TermStartsSection } from '../../terms/[id]/section';
import { TermsSection } from '../../terms/section';
import { api } from '@/lib/api';
import { getMe } from '@/lib/me';
import { pickTerm } from '@/lib/terms';
import { ProgressBar } from '../progress.local';
import { isStep, neighbours, STEP_HOME, STEP_IMPORTS } from '../steps';
import { WizardNav } from '../wizard-nav';

export const metadata: Metadata = { title: 'Set up your institute' };

/** One wizard step: the same screens as the settings pages, with Back / Skip / Continue. */
export default async function SetupStepPage({ params }: { params: Promise<{ step: string }> }) {
  const { step } = await params;
  if (!isStep(step)) notFound();
  const me = await getMe(`/setup/${step}`);
  const t = await getTranslations('p1.setup');
  const state = await api<SetupStateDto>('/setup');
  const percent = state.ok ? state.data.percent : 0;
  const index = SETUP_STEPS.indexOf(step);
  const { prev, next } = neighbours(step);
  const home = STEP_HOME[step];
  const title = t(`step.${step}.title`);
  const tImports = await getTranslations('p1.imports');
  const imports = me.may('import.run') ? (STEP_IMPORTS[step] ?? []) : [];

  return (
    <>
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">
          {t('stepOf', { n: index + 1, total: SETUP_STEPS.length })}
        </p>
        <ProgressBar value={percent} label={t('percentDone', { percent })} />
      </div>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-muted-foreground">{t(`step.${step}.hint`)}</p>
        {home ? (
          <p className="text-sm text-muted-foreground">
            {t('editLater')}{' '}
            <Link className="text-primary underline" href={home}>
              {t(`step.${step}.title`)}
            </Link>
          </p>
        ) : null}
        {imports.length > 0 ? (
          <p className="text-sm text-muted-foreground">
            {tImports('setupImport')}{' '}
            {imports.map((kind, i) => (
              <span key={kind}>
                {i > 0 ? ' · ' : null}
                <Link className="text-primary underline" href={`/imports/new?kind=${kind}`}>
                  {tImports('setupImportLink', { kind: tImports(`kind.${kind}.title`) })}
                </Link>
              </span>
            ))}
          </p>
        ) : null}
      </div>

      <StepContent step={step} />

      <WizardNav
        step={step}
        prev={prev}
        next={next}
        canEdit={me.may('institute.manage')}
        isLast={step === 'ready'}
      />
    </>
  );
}

async function StepContent({ step }: { step: SetupStep }): Promise<ReactNode> {
  const t = await getTranslations('p1.setup');
  const needsTerm = step === 'cohorts' || step === 'calendar';
  const { term } = step === 'term' || needsTerm ? await pickTerm(undefined) : { term: null };
  if (needsTerm && !term)
    return (
      <Notice
        title={t('needTermTitle')}
        body={t('needTermBody')}
        href="/setup/term"
        link={t('goToTermStep')}
      />
    );

  // Only "teaching" and "ready" have a laterBody, so build it when one of them is shown.
  const later = () => <Notice title={t('laterTitle')} body={t(`step.${step}.laterBody`)} />;
  // A map rather than a switch: one step is called "faculty", which the lint rule against
  // inline role checks would (wrongly) flag.
  const content: Record<SetupStep, () => ReactNode> = {
    profile: () => <InstituteSection />,
    departments: () => <DepartmentsSection />,
    programmes: () => <ProgrammesSection />,
    schemes: () => (
      <>
        <SchemesSection />
        <p className="text-sm text-muted-foreground">{t('schemesCourses')}</p>
      </>
    ),
    term: () => (
      <>
        <TermsSection />
        {term ? <TermStartsSection term={term as TermRow} /> : null}
      </>
    ),
    cohorts: () => (
      <>
        <section className="flex flex-col gap-3" aria-labelledby="batches-heading">
          <h2 id="batches-heading" className="text-lg font-semibold">
            {t('batchesHeading')}
          </h2>
          <p className="text-sm text-muted-foreground">{t('batchesHint')}</p>
          <BatchesSection />
        </section>
        <section className="flex flex-col gap-3" aria-labelledby="cohorts-heading">
          <h2 id="cohorts-heading" className="text-lg font-semibold">
            {t('cohortsHeading', { term: term!.label })}
          </h2>
          <p className="text-sm text-muted-foreground">{t('cohortsHint')}</p>
          <CohortsSection term={term!} />
        </section>
      </>
    ),
    faculty: () => <FacultySection />,
    rooms: () => <RoomsSection />,
    bell: () => (
      <>
        <DefaultBellSection />
        <p className="text-sm text-muted-foreground">{t('fixedSlotsLater')}</p>
      </>
    ),
    calendar: () => <CalendarSection term={term!} />,
    teaching: later,
    ready: later,
  };
  return content[step]();
}

function Notice({
  title,
  body,
  href,
  link,
}: {
  title: string;
  body: string;
  href?: string;
  link?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription className="text-base">{body}</CardDescription>
        {href && link ? (
          <Link className="mt-2 text-primary underline" href={href}>
            {link}
          </Link>
        ) : null}
      </CardHeader>
    </Card>
  );
}
