import { Module } from '@nestjs/common';
import { crudController } from '../masterdata/crud.controller';
import {
  bellSchedules,
  calendarWindows,
  extraWorkingDays,
  fixedSlots,
  holidays,
  sessions,
  termCohortWindows,
  terms,
} from './calendar.entities';
import { HolidaysController } from './holidays.controller';
import { TermsController } from './terms.controller';

/** Sessions, terms, cohort windows, calendar windows, holidays, working days, bell schedules. */
@Module({
  controllers: [
    HolidaysController,
    TermsController,
    crudController(sessions),
    crudController(terms),
    crudController(termCohortWindows),
    crudController(calendarWindows),
    crudController(holidays),
    crudController(extraWorkingDays),
    crudController(bellSchedules),
    crudController(fixedSlots),
  ],
})
export class CalendarModule {}
