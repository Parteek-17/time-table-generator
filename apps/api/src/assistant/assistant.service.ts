import Anthropic from '@anthropic-ai/sdk';
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod';
import {
  ConflictException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { canSomewhere } from '@slotwise/shared';
import { z } from 'zod';
import type { Tenant } from '../common/request-context';
import { ENV, type Env } from '../config/env';
import { PrismaService } from '../db/prisma.service';
import { TimetableEditService } from '../timetable/timetable-edit.service';

const MODEL = 'claude-opus-5-5';
const DAYS = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const ChatRequest = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().trim().min(1).max(4000),
      }),
    )
    .min(1)
    .max(30),
});
export type ChatRequest = z.infer<typeof ChatRequest>;

const HELP = `You are "Ask Slotwise", the help assistant inside Slotwise, a timetable app for Indian colleges.
Answer in plain, short sentences for busy, non-technical college staff and students. Use the words
users use: section, period, lab, teacher, room, make-up, holiday. Never say "entity", "constraint"
or "tenant".

Where things are (left menu):
- Setup progress: the 12-step setup wizard. "Try with sample data" makes a fictional college.
- Import from Excel: download a template, upload, match columns, fix bad rows, then import.
- Who teaches what: assign teachers to each section; badges show periods per week against the limit.
- Ready to generate?: 7 checks with a fix button for each problem.
- Timetable > Generate: makes a draft with the solver in the background.
- Timetables: view by section, lab group, teacher or room; drag a class to move it; Lock; Undo;
  "Not placed" explains classes without a period; Publish; download PDF or Excel.
- Changes and make-ups: holidays and events cancel classes; find make-up periods.
- Exams: date sheet, seating plan, invigilation duties.
- Today and Week: a student's or teacher's own classes; exam seat.

Rules for timetables:
- Only drafts can be changed. Published timetables never change: make an editable copy, change
  the copy, then publish it.
- When asked to move a class, find it with find_classes first, then call move_class. If the move
  is refused, explain the reason in plain words and suggest a free period if you can.
- After a successful move, say what moved where, and that Undo on the Timetables screen reverses it.
- Never invent ids, periods or names: use only what the tools return.
- If you cannot do something, say which screen does it.`;

/** "Ask Slotwise": help for everyone, and timetable editing for people who may edit. */
@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);
  private readonly client: Anthropic | null;

  constructor(
    @Inject(ENV) env: Env,
    private readonly prisma: PrismaService,
    private readonly edits: TimetableEditService,
  ) {
    this.client = env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }) : null;
  }

  get enabled(): boolean {
    return this.client !== null;
  }

  async chat(tenant: Tenant, body: ChatRequest): Promise<{ reply: string }> {
    if (!this.client) {
      throw new ServiceUnavailableException('The assistant is not set up yet.');
    }
    const place = {
      id: tenant.institute.id,
      parentUniversityId: tenant.institute.parentUniversityId,
    };
    const mayEdit = canSomewhere(tenant.authUser, 'timetable.edit', place);
    const tools = mayEdit ? this.editTools(tenant) : [];
    const system = mayEdit
      ? HELP
      : `${HELP}\nThis person can view but not edit timetables. If they ask to change one, say a timetable coordinator or HOD can.`;

    try {
      const final = await this.client.beta.messages.toolRunner({
        model: MODEL,
        max_tokens: 4000,
        output_config: { effort: 'low' },
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system,
        tools,
        max_iterations: 8,
        messages: body.messages,
      });
      if (final.stop_reason === 'refusal') {
        return { reply: 'Sorry, I can’t help with that. Please ask about Slotwise.' };
      }
      const reply = final.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();
      return { reply: reply || 'Done.' };
    } catch (error) {
      if (error instanceof Anthropic.RateLimitError) {
        throw new ServiceUnavailableException(
          'The assistant is busy. Please try again in a minute.',
        );
      }
      if (error instanceof Anthropic.APIError) {
        this.logger.error(`Assistant API error ${error.status}: ${error.message}`);
        throw new ServiceUnavailableException('The assistant can’t answer right now.');
      }
      throw error;
    }
  }

  private ctx(tenant: Tenant) {
    return { instituteId: tenant.institute.id, userId: tenant.user.id };
  }

  /** A refusal from the edit service becomes a tool result Claude can explain. */
  private async attempt(run: () => Promise<string>): Promise<string> {
    try {
      return await run();
    } catch (error) {
      if (error instanceof ConflictException) {
        const body = error.getResponse() as { message?: unknown };
        return `Refused: ${typeof body.message === 'string' ? body.message : error.message}`;
      }
      if (error instanceof ForbiddenException || error instanceof NotFoundException) {
        return `Refused: ${error.message}`;
      }
      if (error instanceof HttpException) return `Refused: ${error.message}`;
      throw error;
    }
  }

  private editTools(tenant: Tenant) {
    const listTimetables = betaZodTool({
      name: 'list_timetables',
      description:
        'List this institute’s timetable versions, newest first: id, term, status (draft, published, archived) and number. Use it to find the draft to edit.',
      inputSchema: z.object({}),
      run: async () => {
        const rows = await this.prisma.tenant(this.ctx(tenant), (tx) =>
          tx.timetableVersion.findMany({
            orderBy: { createdAt: 'desc' },
            take: 10,
            select: {
              id: true,
              status: true,
              number: true,
              createdAt: true,
              term: { select: { label: true } },
            },
          }),
        );
        return JSON.stringify(
          rows.map((r) => ({
            id: r.id,
            term: r.term.label,
            status: r.status,
            number: r.number,
            created: r.createdAt.toISOString().slice(0, 10),
          })),
        );
      },
    });

    const findClasses = betaZodTool({
      name: 'find_classes',
      description:
        'Find classes in one timetable version. Filter by text (course code or name, section, teacher name or short code, room) and/or weekday (1 = Monday). Returns up to 25 classes with their slot ids.',
      inputSchema: z.object({
        versionId: z.string().uuid(),
        text: z.string().optional().describe('e.g. "CS301", "CS B", "Kaur", "LAB-2"'),
        weekday: z.number().int().min(1).max(7).optional(),
      }),
      run: async ({ versionId, text, weekday }) =>
        this.attempt(async () => {
          const data = await this.edits.editor(tenant, versionId);
          const needle = text?.toLowerCase();
          const hits = data.slots
            .filter((s) => (weekday ? s.weekday === weekday : true))
            .filter((s) =>
              needle
                ? [
                    s.course.code,
                    s.course.shortName,
                    s.course.title,
                    s.target.name,
                    s.room?.code ?? '',
                  ]
                    .concat(s.faculty.flatMap((f) => [f.name, f.shortCode]))
                    .some((v) => v.toLowerCase().includes(needle))
                : true,
            )
            .slice(0, 25)
            .map((s) => ({
              slotId: s.id,
              course: `${s.course.code} ${s.course.shortName}`,
              kind: s.component,
              for: s.target.name,
              teachers: s.faculty.map((f) => f.name).join(', '),
              room: s.room?.code ?? null,
              day: DAYS[s.weekday],
              weekday: s.weekday,
              period: s.startPeriodIndex,
              periods: s.length,
              locked: s.locked,
            }));
          return JSON.stringify({ status: data.version.status, classes: hits });
        }),
    });

    const moveClass = betaZodTool({
      name: 'move_class',
      description:
        'Move one class in a DRAFT timetable to another day and first period, using the same clash checks as drag and drop. A refusal comes back with the reason in plain words.',
      inputSchema: z.object({
        versionId: z.string().uuid(),
        slotId: z.string().uuid(),
        weekday: z.number().int().min(1).max(7).describe('1 = Monday'),
        startPeriod: z.number().int().min(1).describe('first period, 1 = P1'),
      }),
      run: async ({ versionId, slotId, weekday, startPeriod }) =>
        this.attempt(async () => {
          const result = await this.edits.edit(tenant, versionId, {
            type: 'move',
            slotId,
            weekday,
            startPeriodIndex: startPeriod,
          });
          const s = result.slot;
          return `Moved ${s.course.code} for ${s.target.name} to ${DAYS[s.weekday]} P${s.startPeriodIndex} in ${
            s.room?.code ?? 'no room'
          }${result.roomChanged ? ' (its room was taken, so another free room was picked)' : ''}.`;
        }),
    });

    const makeCopy = betaZodTool({
      name: 'make_editable_copy',
      description:
        'Make an editable draft copy of a published (or archived) timetable version. Returns the new draft’s id.',
      inputSchema: z.object({ versionId: z.string().uuid() }),
      run: async ({ versionId }) =>
        this.attempt(async () => {
          const { versionId: id } = await this.edits.copy(tenant, versionId);
          return `New draft ${id}.`;
        }),
    });

    return [listTimetables, findClasses, moveClass, makeCopy];
  }
}
