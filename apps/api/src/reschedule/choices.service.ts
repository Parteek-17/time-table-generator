import { Injectable } from '@nestjs/common';
import {
  calendarFromSnapshot,
  todayIn,
  type RescheduleChoicesDto,
} from '@slotwise/shared/reschedule';
import type { Tenant } from '../common/request-context';
import { TermSource } from './term-source';

/** Pick-lists for the rescheduling screens, from the term's setup snapshot. */
@Injectable()
export class ChoicesService {
  constructor(private readonly source: TermSource) {}

  async choices(tenant: Tenant, termId: string): Promise<RescheduleChoicesDto> {
    const snapshot = await this.source.snapshot(tenant, termId);
    const cal = calendarFromSnapshot(snapshot);
    const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
    return {
      termStart: cal.termStart,
      termEnd: cal.termEnd,
      today: todayIn(new Date(), snapshot.timezone),
      departmentIds: [...new Set([...cal.sections.values()].map((p) => p.departmentId))],
      sections: snapshot.sections
        .flatMap((s) => {
          const place = cal.sections.get(s.id);
          return place ? [{ id: s.id, name: s.displayName, departmentId: place.departmentId }] : [];
        })
        .sort(byName),
      faculty: snapshot.faculty
        .map((f) => ({ id: f.id, name: f.name, departmentId: f.homeDepartmentId }))
        .sort(byName),
    };
  }
}
