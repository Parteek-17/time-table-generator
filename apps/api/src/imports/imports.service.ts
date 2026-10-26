import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';
import type { Prisma } from '@slotwise/db';
import {
  canSomewhere,
  IMPORT_BACKGROUND_ROWS,
  IMPORT_MAX_BYTES,
  IMPORT_MAX_ROWS,
  IMPORT_TEMPLATES,
  mapRow,
  matchHeaders,
  rowKey,
  type CellProblem,
  type ImportCreateInput,
  type ImportJobDto,
  type ImportKindName,
  type ImportMappingInput,
  type ImportRowAction,
  type ImportRowDto,
  type ImportRowEditInput,
  type ImportRowsPageDto,
  type ImportRowsQuery,
  type ImportStatusName,
  type ImportSummaryDto,
  type ImportTemplateFileDto,
} from '@slotwise/shared';
import type { Queue } from 'bullmq';
import { ENV, type Env } from '../config/env';
import type { Tenant } from '../common/request-context';
import { PrismaService } from '../db/prisma.service';
import type { EntityContext } from '../masterdata/entity';
import { MasterDataService } from '../masterdata/masterdata.service';
import { QueueService } from '../queue/queue.service';
import { toGrant } from '../tenancy/grants';
import { KIND_HANDLERS, type KindContext, type RowData, type WriteResult } from './kinds';
import { buildTemplate, readSheet, SheetError, type ReadSheet } from './spreadsheet';
import { StorageService } from './storage.service';

export const IMPORTS_QUEUE = 'p1.imports';
const PAGE_SIZE = 50;
const NOT_ALLOWED = 'You don’t have permission to import. Ask your institute admin.';

interface QueueJob {
  importId: string;
  instituteId: string;
  userId: string;
  step: 'prepare' | 'commit';
  /** Prepare with the mapping saved on the job (the admin chose the columns). */
  savedMapping?: boolean;
}

/** Stored in ImportJob.columnMapping: the file's header row and what each column maps to. */
interface StoredMapping {
  headerRowNumber: number;
  headers: string[];
  mapping: Record<string, number>;
}

type JobRow = Prisma.ImportJobGetPayload<{
  include: { createdBy: { select: { name: true; email: true } } };
}>;

/** A row that stopped the commit; everything before it is rolled back. */
class RowFailure extends Error {
  constructor(
    readonly rowNumber: number,
    readonly problems: CellProblem[],
  ) {
    super(`row ${rowNumber}`);
  }
}

/**
 * Excel/CSV import (milestone 1d, ADR 0011): upload → columns matched → every row checked
 * → preview with plain-language problems → inline fixes or skips → commit in one
 * transaction → summary. Files over IMPORT_BACKGROUND_ROWS rows are read and committed on
 * the `p1.imports` queue; the page polls the job's progress.
 */
@Injectable()
export class ImportsService implements OnModuleInit {
  private readonly logger = new Logger(ImportsService.name);
  private queue: Queue<QueueJob> | null = null;

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly md: MasterDataService,
    private readonly storage: StorageService,
    private readonly queues: QueueService,
  ) {}

  onModuleInit(): void {
    // Tests (and CI) start the worker only when something is enqueued.
    if (this.env.NODE_ENV !== 'test') this.start();
  }

  private start(): Queue<QueueJob> {
    if (this.queue) return this.queue;
    this.queue = this.queues.queue<QueueJob>(IMPORTS_QUEUE);
    this.queue.on('error', (e) => this.logger.error(`queue: ${e.message}`));
    const worker = this.queues.worker<QueueJob>(IMPORTS_QUEUE, (job) => this.runQueued(job.data));
    worker.on('error', (e) => this.logger.error(`worker: ${e.message}`));
    return this.queue;
  }

  private async enqueue(
    tenant: Tenant,
    importId: string,
    step: QueueJob['step'],
    savedMapping = false,
  ): Promise<void> {
    await this.start().add(
      step,
      { importId, instituteId: tenant.institute.id, userId: tenant.user.id, step, savedMapping },
      { jobId: `${importId}-${step}-${Date.now()}`, removeOnComplete: 100, removeOnFail: 100 },
    );
  }

  /** Background work runs as the user who started it, with their current permissions. */
  private async runQueued(data: QueueJob): Promise<void> {
    const tenant = await this.tenantFor(data.instituteId, data.userId);
    try {
      if (data.step === 'prepare') {
        const saved = data.savedMapping
          ? storedMapping(
              (await this.tx(tenant, ({ tx }) => this.find(tx, data.importId))).columnMapping,
            ).mapping
          : undefined;
        await this.prepare(tenant, data.importId, null, saved);
      } else await this.runCommit(tenant, data.importId, true);
    } catch (error) {
      this.logger.error(`import ${data.importId} ${data.step}: ${String(error)}`);
      await this.setStatus(tenant, data.importId, 'failed', {
        error: 'Something went wrong while working on this file. Please upload it again.',
      });
    }
  }

  private async tenantFor(instituteId: string, userId: string): Promise<Tenant> {
    const institute = await this.prisma.institute.findUniqueOrThrow({ where: { id: instituteId } });
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, email: true, name: true },
    });
    const memberships = await this.prisma.tenant({ instituteId, userId }, (tx) =>
      tx.membership.findMany({ where: { userId, revokedAt: null } }),
    );
    return { institute, user, authUser: { id: userId, memberships: memberships.map(toGrant) } };
  }

  /** A tenant transaction that may run long (checking or committing thousands of rows). */
  private tx<T>(
    tenant: Tenant,
    fn: (ctx: EntityContext) => Promise<T>,
    timeout = 60_000,
  ): Promise<T> {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT set_config('app.institute_id', ${tenant.institute.id}, true),
                                  set_config('app.user_id', ${tenant.user.id}, true)`;
        return fn({ tx, tenant });
      },
      { timeout, maxWait: 10_000 },
    );
  }

  private assertMayImport(tenant: Tenant): void {
    if (!canSomewhere(tenant.authUser, 'import.run', tenant.institute)) {
      throw new ForbiddenException(NOT_ALLOWED);
    }
  }

  // ---- Templates and reads ---------------------------------------------------------------

  async template(kind: ImportKindName): Promise<ImportTemplateFileDto> {
    const t = IMPORT_TEMPLATES[kind];
    const buffer = await buildTemplate(t);
    return {
      fileName: `slotwise-${kind.replace(/_/g, '-')}-template.xlsx`,
      contentBase64: buffer.toString('base64'),
    };
  }

  list(tenant: Tenant): Promise<ImportJobDto[]> {
    this.assertMayImport(tenant);
    return this.tx(tenant, async ({ tx }) => {
      const jobs = await tx.importJob.findMany({
        orderBy: { createdAt: 'desc' },
        take: 30,
        include: { createdBy: { select: { name: true, email: true } } },
      });
      return Promise.all(jobs.map((j) => this.dto(tx, j)));
    });
  }

  get(tenant: Tenant, id: string): Promise<ImportJobDto> {
    this.assertMayImport(tenant);
    return this.tx(tenant, async ({ tx }) => this.dto(tx, await this.find(tx, id)));
  }

  rows(tenant: Tenant, id: string, query: ImportRowsQuery): Promise<ImportRowsPageDto> {
    this.assertMayImport(tenant);
    return this.tx(tenant, async ({ tx }) => {
      await this.find(tx, id);
      const where: Prisma.ImportRowWhereInput = { jobId: id };
      if (query.show === 'problems') {
        Object.assign(where, { NOT: [{ errors: { equals: [] } }, { action: 'skip' }] });
      } else if (query.show !== 'all') {
        Object.assign(where, { ...actionWhere(query.show), errors: { equals: [] } });
      }
      const total = await tx.importRow.count({ where });
      const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
      const page = Math.min(query.page, pageCount);
      const rows = await tx.importRow.findMany({
        where,
        orderBy: { rowNumber: 'asc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      });
      return { rows: rows.map(rowDto), page, pageCount, total };
    });
  }

  private async find(tx: Prisma.TransactionClient, id: string): Promise<JobRow> {
    const job = await tx.importJob.findFirst({
      where: { id },
      include: { createdBy: { select: { name: true, email: true } } },
    });
    if (!job) throw new NotFoundException('We could not find this import.');
    return job;
  }

  private async dto(tx: Prisma.TransactionClient, job: JobRow): Promise<ImportJobDto> {
    const stored = storedMapping(job.columnMapping);
    const template = IMPORT_TEMPLATES[kindOf(job.kind)];
    const ok = (action: ImportRowAction) =>
      tx.importRow.count({
        where: { jobId: job.id, errors: { equals: [] }, ...actionWhere(action) },
      });
    const problems = await tx.importRow.count({
      where: { jobId: job.id, NOT: [{ errors: { equals: [] } }, { action: 'skip' }] },
    });
    const skipped = await tx.importRow.count({ where: { jobId: job.id, action: 'skip' } });
    const counts = {
      problems,
      create: await ok('create'),
      update: await ok('update'),
      unchanged: await ok('unchanged'),
      skip: skipped,
    };
    return {
      id: job.id,
      kind: kindOf(job.kind),
      status: job.status,
      fileName: job.fileName,
      termId: job.termId,
      rowCount: job.rowCount,
      progress: job.progress,
      headers: stored.headers,
      mapping: stored.mapping,
      missingRequired: template.columns
        .filter((c) => c.required && !(c.key in stored.mapping))
        .map((c) => c.key),
      counts,
      summary: job.summary as unknown as ImportSummaryDto,
      createdAt: job.createdAt.toISOString(),
      createdByName: job.createdBy.name ?? job.createdBy.email,
    };
  }

  // ---- Upload ------------------------------------------------------------------------------

  async create(tenant: Tenant, input: ImportCreateInput, file: Buffer): Promise<ImportJobDto> {
    this.assertMayImport(tenant);
    const template = IMPORT_TEMPLATES[input.kind];
    if (file.length === 0) throw new BadRequestException('The file is empty.');
    if (file.length > IMPORT_MAX_BYTES)
      throw new BadRequestException('The file is too big. Keep it under 5 MB.');
    if (template.term === 'required' && !input.termId) {
      throw new BadRequestException(
        `Choose the term these ${template.title.toLowerCase()} are for.`,
      );
    }
    const sheet = await this.read(file, input.fileName, input.kind);
    if (sheet.rows.length === 0) {
      throw new BadRequestException('The file has a header row but no data rows below it.');
    }
    if (sheet.rows.length > IMPORT_MAX_ROWS) {
      throw new BadRequestException(
        `The file has ${sheet.rows.length} rows. Split it into files of at most ${IMPORT_MAX_ROWS} rows.`,
      );
    }
    const id = randomUUID();
    const fileKey = `imports/${tenant.institute.id}/${id}/${input.fileName.replace(/[^\w.\- ]/g, '_')}`;
    await this.storage.put(fileKey, file, contentType(input.fileName));
    const background = sheet.rows.length > IMPORT_BACKGROUND_ROWS;
    await this.tx(tenant, async (ctx) => {
      if (input.termId) {
        const term = await ctx.tx.term.findFirst({ where: { id: input.termId, deletedAt: null } });
        if (!term) throw new BadRequestException('Choose a term from the list.');
      }
      await ctx.tx.importJob.create({
        data: {
          id,
          instituteId: tenant.institute.id,
          kind: input.kind,
          status: background ? 'parsing' : 'uploaded',
          fileName: input.fileName,
          fileKey,
          termId: input.termId,
          rowCount: sheet.rows.length,
          createdById: tenant.user.id,
        },
      });
      await this.md.audit(ctx, 'import.uploaded', 'import', id, {
        kind: input.kind,
        fileName: input.fileName,
        rows: sheet.rows.length,
      });
    });
    if (background) await this.enqueue(tenant, id, 'prepare');
    else await this.prepare(tenant, id, sheet);
    return this.get(tenant, id);
  }

  private async read(file: Buffer, fileName: string, kind: ImportKindName): Promise<ReadSheet> {
    try {
      return await readSheet(file, fileName, IMPORT_TEMPLATES[kind]);
    } catch (error) {
      if (error instanceof SheetError) throw new BadRequestException(error.message);
      throw error;
    }
  }

  /**
   * Reads the file (unless given), matches columns (keeping a mapping the admin chose),
   * stores every row and checks them. Without all required columns the job waits in
   * "mapping" for the admin to pick them.
   */
  private async prepare(
    tenant: Tenant,
    id: string,
    sheet: ReadSheet | null,
    chosen?: Record<string, number>,
  ): Promise<void> {
    const job = await this.tx(tenant, ({ tx }) => this.find(tx, id));
    const template = IMPORT_TEMPLATES[kindOf(job.kind)];
    const read =
      sheet ??
      (await this.read(await this.storage.get(job.fileKey), job.fileName, kindOf(job.kind)));
    const mapping = chosen ?? matchHeaders(read.headers, template.columns).mapping;
    const stored: StoredMapping = {
      headerRowNumber: read.headerRowNumber,
      headers: read.headers,
      mapping,
    };
    const missing = template.columns.some((c) => c.required && !(c.key in mapping));
    await this.tx(
      tenant,
      async ({ tx }) => {
        await tx.importRow.deleteMany({ where: { jobId: id } });
        await tx.importJob.update({
          where: { id },
          data: {
            columnMapping: stored as unknown as Prisma.InputJsonObject,
            status: missing ? 'mapping' : 'parsing',
            progress: 10,
          },
        });
        if (missing) return;
        const rows = read.rows.map((r) => ({
          instituteId: tenant.institute.id,
          jobId: id,
          rowNumber: r.rowNumber,
          data: { ...mapRow(template, mapping, r.cells), [SAME]: '0' },
          action: 'create',
        }));
        for (let i = 0; i < rows.length; i += 1000) {
          await tx.importRow.createMany({ data: rows.slice(i, i + 1000) });
        }
      },
      120_000,
    );
    if (!missing) await this.check(tenant, id);
  }

  /**
   * Plans every row against the institute's current data and stores problems and actions.
   * Only rows whose result changed are written, so an inline fix is quick even for big files.
   */
  private async check(tenant: Tenant, id: string): Promise<void> {
    await this.tx(
      tenant,
      async (entity) => {
        const job = await this.find(entity.tx, id);
        const template = IMPORT_TEMPLATES[kindOf(job.kind)];
        const handler = KIND_HANDLERS[kindOf(job.kind)];
        const ctx: KindContext = { ...entity, md: this.md, termId: job.termId };
        const lookups = await handler.load(ctx);
        const rows = await entity.tx.importRow.findMany({
          where: { jobId: id },
          orderBy: { rowNumber: 'asc' },
        });
        // Rows the admin skipped are checked last, so they never block the others.
        const ordered = [
          ...rows.filter((r) => r.action !== 'skip'),
          ...rows.filter((r) => r.action === 'skip'),
        ];
        const firstRowOfKey = new Map<string, number>();
        for (const row of ordered) {
          const data = row.data as RowData;
          const plan = handler.plan(data, lookups, ctx);
          const problems = [...plan.problems];
          const skip = row.action === 'skip';
          const key = rowKey(template, data);
          if (!skip && key.replace(/\|/g, '') !== '') {
            const first = firstRowOfKey.get(key);
            if (first != null) {
              problems.push({
                column: template.key[0]!,
                message: `Same as row ${first}. Remove one of them or skip this row.`,
              });
            } else {
              firstRowOfKey.set(key, row.rowNumber);
            }
          }
          const action = skip ? 'skip' : plan.action === 'unchanged' ? 'update' : plan.action;
          const same = !skip && plan.action === 'unchanged' ? '1' : '0';
          if (
            action !== row.action ||
            same !== data[SAME] ||
            JSON.stringify(problems) !== JSON.stringify(row.errors)
          ) {
            await entity.tx.importRow.update({
              where: { id: row.id },
              data: {
                action,
                data: { ...data, [SAME]: same },
                errors: problems as unknown as Prisma.InputJsonArray,
              },
            });
          }
        }
        await entity.tx.importJob.update({
          where: { id },
          data: { status: 'preview', progress: 100 },
        });
      },
      300_000,
    );
  }

  // ---- Fixing --------------------------------------------------------------------------------

  async setMapping(tenant: Tenant, id: string, input: ImportMappingInput): Promise<ImportJobDto> {
    this.assertMayImport(tenant);
    const job = await this.tx(tenant, ({ tx }) => this.find(tx, id));
    this.assertEditable(job);
    const template = IMPORT_TEMPLATES[kindOf(job.kind)];
    const stored = storedMapping(job.columnMapping);
    const mapping: Record<string, number> = {};
    const used = new Set<number>();
    for (const [key, index] of Object.entries(input.mapping)) {
      if (index == null) continue;
      if (!template.columns.some((c) => c.key === key))
        throw new BadRequestException(`Unknown column ${key}.`);
      if (index >= stored.headers.length)
        throw new BadRequestException('Choose a column from the file.');
      if (used.has(index)) {
        throw new BadRequestException(
          `“${stored.headers[index]}” is chosen twice. Use each column of the file once.`,
        );
      }
      used.add(index);
      mapping[key] = index;
    }
    if (job.rowCount > IMPORT_BACKGROUND_ROWS) {
      await this.tx(tenant, ({ tx }) =>
        tx.importJob.update({
          where: { id },
          data: {
            status: 'parsing',
            progress: 0,
            columnMapping: { ...stored, mapping } as unknown as Prisma.InputJsonObject,
          },
        }),
      );
      await this.enqueue(tenant, id, 'prepare', true);
    } else {
      await this.prepare(tenant, id, null, mapping);
    }
    return this.get(tenant, id);
  }

  async editRow(
    tenant: Tenant,
    id: string,
    rowNumber: number,
    input: ImportRowEditInput,
  ): Promise<ImportRowDto> {
    this.assertMayImport(tenant);
    const job = await this.tx(tenant, ({ tx }) => this.find(tx, id));
    this.assertEditable(job);
    if (job.status !== 'preview')
      throw new ConflictException('Wait until the file has been checked.');
    const template = IMPORT_TEMPLATES[kindOf(job.kind)];
    await this.tx(tenant, async ({ tx }) => {
      const row = await tx.importRow.findFirst({ where: { jobId: id, rowNumber } });
      if (!row) throw new NotFoundException(`There is no row ${rowNumber} in this file.`);
      const data = { ...(row.data as RowData) };
      for (const [key, value] of Object.entries(input.data ?? {})) {
        if (template.columns.some((c) => c.key === key)) data[key] = value.trim();
      }
      const action =
        input.skip === true
          ? 'skip'
          : input.skip === false && row.action === 'skip'
            ? 'create'
            : row.action;
      await tx.importRow.update({ where: { id: row.id }, data: { data, action } });
    });
    await this.check(tenant, id);
    return this.tx(tenant, async ({ tx }) =>
      rowDto(await tx.importRow.findFirstOrThrow({ where: { jobId: id, rowNumber } })),
    );
  }

  async cancel(tenant: Tenant, id: string): Promise<ImportJobDto> {
    this.assertMayImport(tenant);
    const job = await this.tx(tenant, ({ tx }) => this.find(tx, id));
    this.assertEditable(job);
    await this.setStatus(tenant, id, 'cancelled');
    return this.get(tenant, id);
  }

  private assertEditable(job: JobRow): void {
    if (job.status === 'committed')
      throw new ConflictException('This file has already been imported.');
    if (job.status === 'cancelled')
      throw new ConflictException('This import was cancelled. Upload the file again.');
    if (job.status === 'committing')
      throw new ConflictException('This file is being imported right now.');
  }

  private async setStatus(
    tenant: Tenant,
    id: string,
    status: ImportStatusName,
    summary?: Partial<ImportSummaryDto>,
  ): Promise<void> {
    await this.tx(tenant, async ({ tx }) => {
      const job = await tx.importJob.findFirstOrThrow({ where: { id } });
      await tx.importJob.update({
        where: { id },
        data: {
          status,
          ...(summary
            ? { summary: { ...(job.summary as object), ...summary } as Prisma.InputJsonObject }
            : {}),
        },
      });
    });
  }

  // ---- Commit --------------------------------------------------------------------------------

  async commit(tenant: Tenant, id: string): Promise<ImportJobDto> {
    this.assertMayImport(tenant);
    const job = await this.tx(tenant, ({ tx }) => this.find(tx, id));
    this.assertEditable(job);
    if (job.status !== 'preview')
      throw new ConflictException('Wait until the file has been checked.');
    const before = await this.get(tenant, id);
    if (before.counts.problems > 0) {
      throw new BadRequestException(
        `${before.counts.problems === 1 ? 'One row has a problem' : `${before.counts.problems} rows have problems`}. Fix or skip ${before.counts.problems === 1 ? 'it' : 'them'} first.`,
      );
    }
    if (job.rowCount > IMPORT_BACKGROUND_ROWS) {
      await this.setStatus(tenant, id, 'committing');
      await this.enqueue(tenant, id, 'commit');
    } else {
      await this.runCommit(tenant, id, false);
    }
    return this.get(tenant, id);
  }

  /**
   * Writes every row in one transaction, re-checking each against the data as it is now:
   * all rows are imported, or none. A row that fails is marked, and the job goes back to
   * the preview with the reason.
   */
  private async runCommit(tenant: Tenant, id: string, background: boolean): Promise<void> {
    if (!background) await this.setStatus(tenant, id, 'committing');
    try {
      await this.tx(
        tenant,
        async (entity) => {
          const job = await this.find(entity.tx, id);
          const handler = KIND_HANDLERS[kindOf(job.kind)];
          const ctx: KindContext = { ...entity, md: this.md, termId: job.termId };
          const lookups = await handler.load(ctx);
          const rows = await entity.tx.importRow.findMany({
            where: { jobId: id },
            orderBy: { rowNumber: 'asc' },
          });
          const summary = { created: 0, updated: 0, unchanged: 0, skipped: 0 };
          let done = 0;
          for (const row of rows) {
            done++;
            if (row.action === 'skip') {
              summary.skipped++;
              continue;
            }
            const plan = handler.plan(row.data as RowData, lookups, ctx);
            if (plan.problems.length > 0) throw new RowFailure(row.rowNumber, plan.problems);
            let result: WriteResult;
            try {
              result = await plan.write();
            } catch (error) {
              throw new RowFailure(row.rowNumber, [
                { column: null, message: this.messageOf(error) },
              ]);
            }
            summary[result]++;
            if (background && done % 200 === 0)
              await this.progress(tenant, id, Math.round((done / rows.length) * 100));
          }
          await entity.tx.importJob.update({
            where: { id },
            data: { status: 'committed', progress: 100, summary },
          });
          await this.md.audit(entity, 'import.committed', 'import', id, {
            kind: kindOf(job.kind),
            fileName: job.fileName,
            ...summary,
          });
        },
        600_000,
      );
    } catch (error) {
      if (!(error instanceof RowFailure)) throw error;
      await this.tx(tenant, async ({ tx }) => {
        await tx.importRow.updateMany({
          where: { jobId: id, rowNumber: error.rowNumber },
          data: { errors: error.problems as unknown as Prisma.InputJsonArray },
        });
        await tx.importJob.update({
          where: { id },
          data: {
            status: 'preview',
            progress: 100,
            summary: {
              created: 0,
              updated: 0,
              unchanged: 0,
              skipped: 0,
              error:
                `Nothing was imported: row ${error.rowNumber} could not be saved. ${error.problems[0]?.message ?? ''}`.trim(),
            },
          },
        });
      });
    }
  }

  private async progress(tenant: Tenant, id: string, percent: number): Promise<void> {
    await this.prisma.tenant({ instituteId: tenant.institute.id, userId: tenant.user.id }, (tx) =>
      tx.importJob.update({ where: { id }, data: { progress: Math.min(99, percent) } }),
    );
  }

  private messageOf(error: unknown): string {
    const friendly = this.md.friendly(error, () => 'This already exists.');
    if (friendly instanceof HttpException) {
      const body = friendly.getResponse();
      if (typeof body === 'object' && body && 'fieldErrors' in body) {
        const fieldErrors = (body as { fieldErrors: Record<string, string[]> }).fieldErrors;
        const first = Object.values(fieldErrors)[0]?.[0];
        if (first) return first;
      }
      return friendly.message;
    }
    this.logger.error(`import commit: ${String(error)}`);
    return 'Something went wrong while saving this row.';
  }
}

/** 'fet' is in the database enum for milestone 1f; nothing creates such jobs yet. */
function kindOf(kind: ImportKindName | 'fet'): ImportKindName {
  if (kind === 'fet') throw new BadRequestException('FET files cannot be imported yet.');
  return kind;
}

/**
 * import_rows.action allows only create | update | skip (CHECK in the 1a migration). Until
 * requests/2026-10-27-p1-import-row-unchanged.md lands, an unchanged row is stored as
 * "update" with SAME = '1' in its data; every row carries SAME so filters never meet NULL.
 */
const SAME = '$same';

function actionWhere(action: ImportRowAction): Prisma.ImportRowWhereInput {
  if (action === 'update') return { action: 'update', data: { path: [SAME], equals: '0' } };
  if (action === 'unchanged') return { action: 'update', data: { path: [SAME], equals: '1' } };
  return { action };
}

function storedMapping(value: Prisma.JsonValue): StoredMapping {
  const v = (value ?? {}) as Partial<StoredMapping>;
  return {
    headerRowNumber: v.headerRowNumber ?? 1,
    headers: v.headers ?? [],
    mapping: v.mapping ?? {},
  };
}

function rowDto(r: {
  rowNumber: number;
  data: Prisma.JsonValue;
  errors: Prisma.JsonValue;
  action: string;
}): ImportRowDto {
  const { [SAME]: same, ...data } = r.data as RowData;
  return {
    rowNumber: r.rowNumber,
    data,
    errors: r.errors as unknown as CellProblem[],
    action: r.action === 'update' && same === '1' ? 'unchanged' : (r.action as ImportRowAction),
  };
}

function contentType(fileName: string): string {
  return /\.xlsx$/i.test(fileName)
    ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    : 'text/csv';
}
