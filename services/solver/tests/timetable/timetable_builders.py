"""Tiny, fictional setup snapshots for timetable solver tests.

t = Tiny(days=(1,), periods=2)
sec = t.section("CS A", subgroups=("G1", "G2"))
teacher = t.teacher("Dr. Test One")
...
response = solve_ok(t.request())   # validates schema + independent checker
"""

from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Any

from slotwise_solver.timetable.checker import check
from slotwise_solver.timetable.contract import request_issues, response_issues
from slotwise_solver.timetable.solve import solve

Json = dict[str, Any]
NS = uuid.UUID("6f1c0d8e-5a1e-4b7c-9d3e-2a4b6c8d0e1f")
REPO = Path(__file__).resolve().parents[4]
DEMO_SNAPSHOT = REPO / "packages" / "shared" / "fixtures" / "demo-term.snapshot.json"


def uid(name: str) -> str:
    return str(uuid.uuid5(NS, name))


def no_scope() -> Json:
    return {
        "scopeType": "institute",
        "departmentId": None,
        "programmeId": None,
        "cohortId": None,
        "sectionId": None,
    }


class Tiny:
    def __init__(
        self,
        days: tuple[int, ...] = (1, 2, 3, 4, 5),
        periods: int = 6,
        lunch_after: int | None = 3,
        lunch_minutes: int = 60,
    ) -> None:
        self.dept = uid("dept")
        self.programme = uid("programme")
        self.scheme = uid("scheme")
        self.cohort = uid("cohort")
        self.cohorts: list[Json] = [self._cohort_row("T CSE", 3)]
        ps, t = [], 540
        for i in range(1, periods + 1):
            ps.append({"index": i, "label": f"P{i}", "startMinute": t, "endMinute": t + 50})
            t += 50
            if i == lunch_after:
                t += lunch_minutes
        self.bell = {
            "id": uid("bell"),
            "name": "Regular",
            "isDefault": True,
            "workingDays": list(days),
            "periods": ps,
            "breaks": (
                [{"label": "Lunch", "afterPeriodIndex": lunch_after, "minutes": lunch_minutes}]
                if lunch_after
                else []
            ),
            "overrides": [],
        }
        self.sections: list[Json] = []
        self.subgroups: list[Json] = []
        self.electives: list[Json] = []
        self.courses: list[Json] = []
        self.assignments: list[Json] = []
        self.faculty: list[Json] = []
        self.rooms: list[Json] = []
        self.fixed: list[Json] = []
        self.options: Json = {"timeLimitSeconds": 10, "seed": 0}

    def _cohort_row(self, code: str, semester: int) -> Json:
        return {
            "id": self.cohort,
            "displayCode": code,
            "semester": semester,
            "isRunning": True,
            "entryType": "regular",
            "schemeVersionId": self.scheme,
            "programmeId": self.programme,
            "branchId": uid(f"branch:{self.dept}"),
            "departmentId": self.dept,
            "joinsCohortId": None,
        }

    def department(self, code: str) -> None:
        """Later cohorts, courses and teachers belong to a new department and programme."""
        self.dept = uid(f"dept:{code}")
        self.programme = uid(f"programme:{code}")

    def new_cohort(self, code: str, semester: int) -> None:
        """Later sections belong to a new cohort (semester) of the current department."""
        self.cohort = uid(f"cohort:{code}")
        self.cohorts.append(self._cohort_row(code, semester))

    def section(
        self,
        name: str,
        strength: int = 60,
        subgroups: tuple[str, ...] = (),
        home: str | None = None,
    ) -> str:
        sid = uid(f"section:{name}")
        self.sections.append(
            {
                "id": sid,
                "cohortId": self.cohort,
                "name": name.split()[-1],
                "displayName": name,
                "strength": strength,
                "homeRoomId": home,
            }
        )
        for g in subgroups:
            self.subgroups.append(
                {
                    "id": uid(f"subgroup:{name}:{g}"),
                    "sectionId": sid,
                    "name": g,
                    "strength": strength // max(1, len(subgroups)),
                }
            )
        return sid

    def subgroup(self, section: str, g: str) -> str:
        return uid(f"subgroup:{section}:{g}")

    def course(
        self,
        code: str,
        lectures: int = 0,
        tutorials: int = 0,
        practicals: int = 0,
        block: int = 2,
        lab: str | None = "Software lab",
        practical_room: str = "lab",
        group: str | None = None,
    ) -> str:
        cid = uid(f"course:{code}")
        needs: Json = {}
        if lectures:
            needs["lecture"] = {"type": "lecture", "labCategory": None}
        if tutorials:
            needs["tutorial"] = {"type": "tutorial", "labCategory": None}
        if practicals:
            needs["practical"] = {
                "type": practical_room,
                "labCategory": lab if practical_room == "lab" else None,
            }
        self.courses.append(
            {
                "id": cid,
                "code": code,
                "title": f"{code} course",
                "shortName": code,
                "schemeVersionId": self.scheme,
                "semester": 3,
                "branchIds": [],
                "offeringDepartmentId": self.dept,
                "type": "programme_elective" if group else "core",
                "electiveGroup": group,
                "lectures": lectures,
                "tutorials": tutorials,
                "practicals": practicals,
                "syllabusHours": None,
                "labBlockLength": block,
                "isScheduled": True,
                "tutorialBy": "section",
                "practicalBy": "subgroup",
                "roomNeeds": needs,
            }
        )
        return cid

    def teacher(
        self,
        name: str,
        max_day: int = 8,
        max_week: int = 40,
        unavailable: tuple[tuple[int, int], ...] = (),
    ) -> str:
        fid = uid(f"faculty:{name}")
        self.faculty.append(
            {
                "id": fid,
                "name": name,
                "shortCode": "".join(w[0] for w in name.split()[-2:]).upper(),
                "homeDepartmentId": self.dept,
                "designation": "assistant_professor",
                "experience": "experienced",
                "maxPeriodsPerDay": max_day,
                "maxPeriodsPerWeek": max_week,
                "unavailable": [{"weekday": d, "periodIndex": p} for d, p in unavailable],
            }
        )
        return fid

    def room(
        self, code: str, type: str = "lecture", capacity: int = 70, labs: tuple[str, ...] = ()
    ) -> str:
        rid = uid(f"room:{code}")
        self.rooms.append(
            {
                "id": rid,
                "code": code,
                "buildingId": uid("building"),
                "buildingName": "Main Block",
                "floor": 0,
                "type": type,
                "labCategories": list(labs),
                "capacity": capacity,
                "rows": None,
                "seatsPerRow": None,
                "examSeatsPerBench": None,
                "ownerDepartmentId": None,
                "isShared": True,
                "isAccessible": True,
            }
        )
        return rid

    def elective(self, course: str, name: str, sources: list[str], strength: int = 30) -> str:
        eid = uid(f"elective:{name}")
        self.electives.append(
            {
                "id": eid,
                "courseId": course,
                "name": name,
                "strength": strength,
                "sourceSectionIds": sources,
            }
        )
        return eid

    def assign(
        self,
        course: str,
        component: str,
        target: tuple[str, str],
        teachers: list[str],
        periods: int | None = None,
        preferred_room: str | None = None,
    ) -> str:
        kind, tid = target
        c = next(c for c in self.courses if c["id"] == course)
        if periods is None:
            periods = {"lecture": c["lectures"], "tutorial": c["tutorials"]}.get(
                component, c["practicals"]
            )
        aid = uid(f"assignment:{len(self.assignments)}")
        self.assignments.append(
            {
                "id": aid,
                "courseId": course,
                "component": component,
                "target": kind,
                "sectionId": tid if kind == "section" else None,
                "subGroupId": tid if kind == "subgroup" else None,
                "electiveSectionId": tid if kind == "elective_section" else None,
                "preferredRoomId": preferred_room,
                "preferredLabCategory": None,
                "periodsPerWeek": periods,
                "faculty": [
                    {"facultyId": f, "role": "main" if i == 0 else "co_teacher"}
                    for i, f in enumerate(teachers)
                ],
            }
        )
        return aid

    def fixed_slot(
        self,
        weekday: int,
        start: int,
        end: int,
        faculty: tuple[str, ...] = (),
        label: str = "Mentoring",
    ) -> None:
        self.fixed.append(
            {
                **no_scope(),
                "id": uid(f"fixed:{len(self.fixed)}"),
                "kind": "mentoring",
                "label": label,
                "weekday": weekday,
                "startPeriodIndex": start,
                "endPeriodIndex": end,
                "facultyIds": list(faculty),
            }
        )

    def snapshot(self) -> Json:
        return {
            "version": "setup-snapshot.v1",
            "generatedAt": "2026-10-22T00:00:00.000Z",
            "instituteId": uid("institute"),
            "timezone": "Asia/Kolkata",
            "term": {
                "id": uid("term"),
                "label": "July–Dec 2026",
                "kind": "odd",
                "status": "planning",
                "startDate": "2026-07-15",
                "endDate": "2026-12-15",
                "minTeachingDays": 90,
            },
            "scope": None,
            "bellSchedules": [self.bell],
            "holidays": [],
            "calendarWindows": [],
            "extraWorkingDays": [],
            "cohortWindows": [],
            "cohorts": self.cohorts,
            "sections": self.sections,
            "subGroups": self.subgroups,
            "electiveSections": self.electives,
            "courses": self.courses,
            "assignments": self.assignments,
            "faculty": self.faculty,
            "rooms": self.rooms,
            "fixedSlots": self.fixed,
        }

    def request(self, **options: Any) -> Json:
        return {
            "version": "solver-timetable.v1",
            "requestId": "test",
            "snapshot": self.snapshot(),
            "options": {**self.options, **options},
        }


def demo_request(**options: Any) -> Json:
    snap = json.loads(DEMO_SNAPSHOT.read_text(encoding="utf-8"))
    return {
        "version": "solver-timetable.v1",
        "requestId": "demo",
        "snapshot": snap,
        "options": {"timeLimitSeconds": 10, "seed": 0, **options},
    }


def solve_ok(request: Json) -> Json:
    """Solve and assert: the request and response match the schema, and no hard rule breaks."""
    assert request_issues(request) == []
    response = solve(request)
    assert response_issues(response) == []
    assert check(request, response) == []
    return response


def reasons(response: Json) -> list[str]:
    return [u["reason"] for u in response["unplaced"]]


def big_institute(
    departments: tuple[str, ...] = ("CSE", "ECE", "ME", "CE"),
    semesters: tuple[int, ...] = (1, 3, 5, 7),
    sections_per_semester: int = 3,
) -> Tiny:
    """A fictional four-department college: 48 sections, 1,536 periods a week.

    Mon–Fri, 8 periods with lunch after P4. Per section: six theory courses (L3 T1, one
    teacher) and two labs (P2) for each of two sub-groups. Per department: 24 teachers with 16
    periods each, 10 lecture rooms (fewer than its 12 sections), 4 labs and one tutorial room.
    """
    t = Tiny(periods=8, lunch_after=4, lunch_minutes=40)
    t.fixed_slot(5, 8, 8, label="Library")
    for d, dept in enumerate(departments):
        t.department(dept)
        teachers = [
            t.teacher(
                f"Dr. {dept} Teacher {i + 1}",
                max_day=5,
                max_week=18,
                # Every fourth teacher is away on one morning.
                unavailable=((1 + i % 5, 1), (1 + i % 5, 2)) if i % 4 == 0 else (),
            )
            for i in range(24)
        ]
        lecture_rooms = [t.room(f"{dept}-LT{r + 1}", capacity=66) for r in range(10)]
        t.room(f"{dept}-TR1", "tutorial", 66)
        lab_kind = f"{dept} lab"
        for r in range(4):
            t.room(f"{dept}-Lab{r + 1}", "lab", 32, (lab_kind,))
        theory_n = lab_n = 0
        for sem in semesters:
            t.new_cohort(f"{dept} S{sem}", sem)
            theory = [t.course(f"{dept}{sem}0{c + 1}", lectures=3, tutorials=1) for c in range(6)]
            labs = [t.course(f"{dept}{sem}L{c + 1}", practicals=2, lab=lab_kind) for c in range(2)]
            for k in range(sections_per_semester):
                name = f"{dept}{d} {sem}{'ABCDEFG'[k]}"
                n = len(t.sections) - d * len(semesters) * sections_per_semester
                home = lecture_rooms[n] if n < len(lecture_rooms) else None
                sec = t.section(name, strength=60, subgroups=("G1", "G2"), home=home)
                for c in theory:
                    teacher = teachers[theory_n % 24]
                    theory_n += 1
                    t.assign(c, "lecture", ("section", sec), [teacher], periods=3)
                    t.assign(c, "tutorial", ("section", sec), [teacher], periods=1)
                for c in labs:
                    for g in ("G1", "G2"):
                        teacher = teachers[lab_n % 24]
                        lab_n += 1
                        t.assign(c, "practical", ("subgroup", t.subgroup(name, g)), [teacher])
    return t
