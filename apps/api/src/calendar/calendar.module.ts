import { Module } from '@nestjs/common';
import { crudController } from '../masterdata/crud.controller';
import {
  bellSchedules,
  calendarWindows,
  extraWorkingDays,
  holidays,
  sessions,
  termCohortWindows,
  terms,
} from './calendar.entities';
import { HolidaysController } from './holidays.controller';

/** Sessions, terms, cohort windows, calendar windows, holidays, working days, bell schedules. */
@Module({
  controllers: [
    HolidaysController,
    crudController(sessions),
    crudController(terms),
    crudController(termCohortWindows),
    crudController(calendarWindows),
    crudController(holidays),
    crudController(extraWorkingDays),
    crudController(bellSchedules),
  ],
})
export class CalendarModule {}
