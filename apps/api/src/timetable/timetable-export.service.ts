import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { canSomewhere } from '@slotwise/shared';
import type { SetupSnapshotV1 } from '@slotwise/shared/contracts';
import {
  EXPORT_LABELS_EN,
  exportTable,
  viewChoices,
  weekOf,
  type TimetableExportQuery,
  type ViewKind,
} from '@slotwise/shared/timetable';
import type { Tenant } from '../common/request-context';
import { PrismaService } from '../db/prisma.service';
import { findBrowser, htmlToPdf, tablesToHtml } from './export/pdf';
import { tablesToXlsx } from './export/xlsx';
import { TIMETABLE_CONFIG, type TimetableConfig } from './timetable.config';
import { storedSlot } from './timetable-read.service';

const DRAFTS_NOT_ALLOWED =
  'Only timetable coordinators can download draft timetables. Ask your institute admin.';
const NO_BROWSER =
  'PDF downloads are not set up on this server yet. Download Excel instead, or ask your administrator.';

const PLURAL: Record<ViewKind, string> = {
  section: 'sections',
  subgroup: 'lab-groups',
  faculty: 'teachers',
  room: 'rooms',
};
const CONTENT_TYPE = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
} as const;

export interface ExportFile {
  filename: string;
  contentType: string;
  body: Buffer;
}

const fileSlug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'timetable';

/** PDF and Excel files of a version: one week, or every section, lab group, teacher or room. */
@Injectable()
export class TimetableExportService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(TIMETABLE_CONFIG) private readonly config: TimetableConfig,
  ) {}

  async export(
    tenant: Tenant,
    versionId: string,
    query: TimetableExportQuery,
  ): Promise<ExportFile> {
    const { tables, subtitle, name } = await this.prisma.tenant(
      { instituteId: tenant.institute.id, userId: tenant.user.id },
      async (tx) => {
        const version = await tx.timetableVersion.findUnique({
          where: { id: versionId },
          include: { snapshot: true, slots: true, term: true },
        });
        if (!version) throw new NotFoundException('We could not find this timetable.');
        const place = {
          id: tenant.institute.id,
          parentUniversityId: tenant.institute.parentUniversityId,
        };
        if (version.status === 'draft' && !canSomewhere(tenant.authUser, 'timetable.edit', place)) {
          throw new ForbiddenException(DRAFTS_NOT_ALLOWED);
        }
        // Written only from a validated SetupSnapshotV1.
        const snapshot = version.snapshot.data as unknown as SetupSnapshotV1;
        const all = viewChoices(snapshot)[query.kind];
        const chosen = query.id ? all.filter((c) => c.id === query.id) : all;
        if (chosen.length === 0) {
          throw new NotFoundException(
            'This timetable has no such section, sub-group, teacher or room.',
          );
        }
        const slots = version.slots.map(storedSlot);
        const tables = chosen.map((c) => {
          const who = { kind: query.kind, id: c.id, name: c.name };
          return exportTable(weekOf(snapshot, slots, who), who, EXPORT_LABELS_EN);
        });
        const from = version.validFrom?.toISOString().slice(0, 10);
        const state =
          version.status === 'draft'
            ? 'Draft, not published'
            : `${version.status === 'archived' ? 'Old version' : 'Version'} ${version.number}${
                from ? `, from ${from}` : ''
              }`;
        const tag = version.status === 'draft' ? 'draft' : `v${version.number}`;
        const who = query.id ? fileSlug(chosen[0]!.name) : PLURAL[query.kind];
        return {
          tables,
          subtitle: `${version.term.label} · ${state}`,
          name: `timetable-${who}-${tag}`,
        };
      },
    );

    if (query.format === 'xlsx') {
      return {
        filename: `${name}.xlsx`,
        contentType: CONTENT_TYPE.xlsx,
        body: await tablesToXlsx(tables, subtitle),
      };
    }
    const browser = findBrowser(this.config.PDF_BROWSER_PATH);
    if (!browser) throw new ServiceUnavailableException(NO_BROWSER);
    return {
      filename: `${name}.pdf`,
      contentType: CONTENT_TYPE.pdf,
      body: await htmlToPdf(tablesToHtml(tables, subtitle), browser),
    };
  }
}
