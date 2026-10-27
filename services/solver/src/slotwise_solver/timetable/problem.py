"""Turn a solver-timetable.v1 request into sessions, time options and rooms for the model.

Plain data only (no OR-Tools). Lists keep the request's order, so the same input always
builds the same model, which keeps the solver deterministic.

Times are minutes: a session option is a (weekday, first period) of its own bell schedule,
converted to minutes so classes on different bell schedules still clash when they overlap.
"""

from __future__ import annotations

from bisect import bisect_left
from dataclasses import dataclass, field
from typing import Any

# packages/shared/src/domain/constants.ts LONG_BREAK_MINUTES: breaks this long split lab blocks.
LONG_BREAK_MINUTES = 30
MINUTES_PER_DAY = 1440

Json = dict[str, Any]


@dataclass(frozen=True)
class Period:
    index: int
    label: str
    start: int
    end: int


@dataclass(frozen=True)
class Bell:
    id: str
    working_days: tuple[int, ...]
    periods: tuple[Period, ...]
    long_break_after: frozenset[int]

    @staticmethod
    def from_json(b: Json) -> Bell:
        periods = tuple(
            Period(p["index"], p["label"], p["startMinute"], p["endMinute"])
            for p in sorted(b["periods"], key=lambda p: p["index"])
        )
        long_after = frozenset(
            br["afterPeriodIndex"] for br in b["breaks"] if br["minutes"] >= LONG_BREAK_MINUTES
        )
        return Bell(b["id"], tuple(sorted(b["workingDays"])), periods, long_after)

    def period(self, index: int) -> Period | None:
        for p in self.periods:
            if p.index == index:
                return p
        return None

    @property
    def last_index(self) -> int:
        return self.periods[-1].index if self.periods else 0

    def block_starts(self, length: int) -> list[int]:
        """First periods where `length` consecutive periods fit without crossing a long break."""
        ps = self.periods
        starts: list[int] = []
        for i in range(len(ps) - length + 1):
            ok = True
            for k in range(i, i + length - 1):
                if (
                    ps[k].index in self.long_break_after
                    or ps[k + 1].start - ps[k].end >= LONG_BREAK_MINUTES
                    or ps[k + 1].index != ps[k].index + 1
                ):
                    ok = False
                    break
            if ok:
                starts.append(ps[i].index)
        return starts

    def span(self, start_index: int, length: int) -> tuple[int, int] | None:
        """Minutes [start, end) of `length` periods from `start_index`; None if they don't exist."""
        first = self.period(start_index)
        last = self.period(start_index + length - 1)
        if first is None or last is None:
            return None
        return first.start, last.end


def bell_for_cohort(cohort: Json, bells: list[Bell], raw: list[Json]) -> Bell | None:
    """bellScheduleFor() in packages/shared: a programme/semester override, else the default."""
    for b, r in zip(bells, raw, strict=True):
        for o in r["overrides"]:
            if o["programmeId"] == cohort["programmeId"] and (
                not o["semesters"] or cohort["semester"] in o["semesters"]
            ):
                return b
    for b, r in zip(bells, raw, strict=True):
        if r["isDefault"]:
            return b
    return bells[0] if bells else None


def session_lengths(periods_per_week: int, component: str, lab_block_length: int) -> list[int]:
    """sessionLengths() in solver-timetable.v1.ts: 1-period sessions, or lab blocks."""
    if component != "practical":
        return [1] * periods_per_week
    out: list[int] = []
    left = periods_per_week
    while left > 0:
        out.append(min(lab_block_length, left))
        left -= lab_block_length
    return out


def room_fits(room: Json, need: Json) -> bool:
    """roomFits() in packages/shared: tutorials may use lecture rooms; lab category must match."""
    if need["type"] == "tutorial":
        return room["type"] in ("tutorial", "lecture")
    if room["type"] != need["type"]:
        return False
    if need.get("labCategory") is None:
        return True
    wanted = need["labCategory"].strip().lower()
    return any(c.strip().lower() == wanted for c in room["labCategories"])


def scope_applies(row: Json, cohort: Json, section_id: str) -> bool:
    """scopeApplies() in packages/shared."""
    kind = row["scopeType"]
    if kind == "institute":
        return True
    if kind == "department":
        return row["departmentId"] == cohort["departmentId"]
    if kind == "programme":
        return row["programmeId"] == cohort["programmeId"]
    if kind == "cohort":
        return row["cohortId"] == cohort["id"]
    return row["sectionId"] == section_id


@dataclass(frozen=True)
class Option:
    """One place in the week a session can start."""

    weekday: int
    start_index: int
    start: int  # minutes from midnight
    end: int

    @property
    def global_start(self) -> int:
        return self.weekday * MINUTES_PER_DAY + self.start

    @property
    def global_end(self) -> int:
        return self.weekday * MINUTES_PER_DAY + self.end


@dataclass(frozen=True)
class Block:
    """A resource is busy at [start, end) minutes on a weekday."""

    weekday: int
    start: int
    end: int
    why: str  # fixed_slot | unavailable | busy
    # Faculty, section, sub-group or elective id the block belongs to.
    owner: str = ""

    def overlaps(self, o: Option) -> bool:
        return self.weekday == o.weekday and self.start < o.end and o.start < self.end


@dataclass
class Session:
    id: str
    n: int
    assignment_id: str
    course_id: str
    component: str
    length: int
    target_kind: str
    target_id: str
    faculty_ids: tuple[str, ...]
    strength: int
    bell: Bell | None
    # Sections whose students attend (the section, a sub-group's section, an elective's sources).
    section_ids: tuple[str, ...]
    # Electives of one group may meet at the same time for the same sections.
    elective_group: str | None
    room_need: Json | None
    rooms: list[str] = field(default_factory=list)
    options: list[Option] = field(default_factory=list)
    # Every place the bell schedule allows, and the fixed/unavailable/busy blocks in the way;
    # relax.py uses them to explain why a session got no place.
    all_options: list[Option] = field(default_factory=list)
    blocks: list[Block] = field(default_factory=list)
    # Set when the session cannot be placed before solving (with the reason code).
    reason: str | None = None
    detail: str | None = None
    locked: bool = False

    @property
    def group_key(self) -> str:
        return self.elective_group or self.course_id


@dataclass
class Problem:
    request_id: str
    snapshot: Json
    sessions: list[Session]
    bells: list[Bell]
    default_bell: Bell | None
    # Section id → its sub-group ids, in snapshot order.
    subgroups_of: dict[str, list[str]]
    subgroup_section: dict[str, str]
    faculty: dict[str, Json]
    rooms: dict[str, Json]
    # Fixed busy periods for rooms (busySlots) and faculty load already used elsewhere.
    room_blocks: dict[str, list[Block]]
    faculty_busy_load: dict[str, dict[int, int]]
    # Atoms: per weekday, the minute boundaries every bell uses; [b[k], b[k+1]) is atom k.
    boundaries: dict[int, list[int]]
    _atoms: dict[Option, list[tuple[int, int]]] = field(default_factory=dict, repr=False)

    def atoms(self, o: Option) -> list[tuple[int, int]]:
        """Cached: large institutes ask for the same few hundred options many times."""
        out = self._atoms.get(o)
        if out is None:
            out = self._atoms[o] = self.atoms_between(o.weekday, o.start, o.end)
        return out

    def atoms_between(self, weekday: int, start: int, end: int) -> list[tuple[int, int]]:
        """Time atoms that [start, end) overlaps on a weekday."""
        b = self.boundaries[weekday]
        lo = max(0, bisect_left(b, start + 1) - 1)
        hi = bisect_left(b, end)
        return [(weekday, k) for k in range(lo, hi)]

    def room_busy_atoms(self, room_id: str) -> set[tuple[int, int]]:
        out: set[tuple[int, int]] = set()
        for b in self.room_blocks.get(room_id, []):
            out.update(self.atoms_between(b.weekday, b.start, b.end))
        return out

    @property
    def model_sessions(self) -> list[Session]:
        return [s for s in self.sessions if s.reason is None]


def target_id(a: Json) -> str:
    return a["sectionId"] or a["subGroupId"] or a["electiveSectionId"]


def build_problem(request: Json) -> Problem:
    snap: Json = request["snapshot"]
    options: Json = request.get("options") or {}

    raw_bells: list[Json] = snap["bellSchedules"]
    bells = [Bell.from_json(b) for b in raw_bells]
    default_bell = next((b for b, r in zip(bells, raw_bells, strict=True) if r["isDefault"]), None)
    default_bell = default_bell or (bells[0] if bells else None)

    cohorts = {c["id"]: c for c in snap["cohorts"]}
    sections = {s["id"]: s for s in snap["sections"]}
    subgroups = {g["id"]: g for g in snap["subGroups"]}
    electives = {e["id"]: e for e in snap["electiveSections"]}
    courses = {c["id"]: c for c in snap["courses"]}
    faculty = {f["id"]: f for f in snap["faculty"]}
    rooms = {r["id"]: r for r in snap["rooms"]}
    subgroups_of: dict[str, list[str]] = {s: [] for s in sections}
    for g in snap["subGroups"]:
        subgroups_of.setdefault(g["sectionId"], []).append(g["id"])

    section_bell: dict[str, Bell | None] = {
        sid: bell_for_cohort(cohorts[s["cohortId"]], bells, raw_bells)
        if s["cohortId"] in cohorts
        else default_bell
        for sid, s in sections.items()
    }

    def bell_span(
        bell: Bell | None, weekday: int, start: int, end: int, why: str, owner: str
    ) -> Block | None:
        if bell is None:
            return None
        first, last = bell.period(start), bell.period(end)
        if first is None or last is None:
            return None
        return Block(weekday, first.start, last.end, why, owner)

    # Busy periods per resource, in minutes.
    section_blocks: dict[str, list[Block]] = {}
    subgroup_blocks: dict[str, list[Block]] = {}
    elective_blocks: dict[str, list[Block]] = {}
    faculty_blocks: dict[str, list[Block]] = {}
    room_blocks: dict[str, list[Block]] = {}
    faculty_busy_cells: dict[str, set[tuple[int, int]]] = {}

    def add(store: dict[str, list[Block]], key: str, block: Block | None) -> None:
        if block is not None:
            store.setdefault(key, []).append(block)

    for f in snap["faculty"]:
        for c in f["unavailable"]:
            add(
                faculty_blocks,
                f["id"],
                bell_span(
                    default_bell,
                    c["weekday"],
                    c["periodIndex"],
                    c["periodIndex"],
                    "unavailable",
                    f["id"],
                ),
            )

    for fs in snap["fixedSlots"]:
        for sid, s in sections.items():
            cohort = cohorts.get(s["cohortId"])
            if cohort is not None and scope_applies(fs, cohort, sid):
                add(
                    section_blocks,
                    sid,
                    bell_span(
                        section_bell[sid],
                        fs["weekday"],
                        fs["startPeriodIndex"],
                        fs["endPeriodIndex"],
                        "fixed_slot",
                        sid,
                    ),
                )
        for fid in fs["facultyIds"]:
            add(
                faculty_blocks,
                fid,
                bell_span(
                    default_bell,
                    fs["weekday"],
                    fs["startPeriodIndex"],
                    fs["endPeriodIndex"],
                    "fixed_slot",
                    fid,
                ),
            )

    for b in options.get("busySlots") or []:
        kind, rid, day, p = b["resource"], b["id"], b["weekday"], b["periodIndex"]
        if kind == "faculty":
            add(faculty_blocks, rid, bell_span(default_bell, day, p, p, "busy", rid))
            faculty_busy_cells.setdefault(rid, set()).add((day, p))
        elif kind == "room":
            add(room_blocks, rid, bell_span(default_bell, day, p, p, "busy", rid))
        elif kind == "section":
            add(
                section_blocks,
                rid,
                bell_span(section_bell.get(rid, default_bell), day, p, p, "busy", rid),
            )
        elif kind == "subgroup":
            sec = subgroups[rid]["sectionId"] if rid in subgroups else None
            add(
                subgroup_blocks,
                rid,
                bell_span(section_bell.get(sec, default_bell), day, p, p, "busy", rid),
            )
        else:
            src = electives[rid]["sourceSectionIds"] if rid in electives else []
            bell = section_bell.get(src[0], default_bell) if src else default_bell
            add(elective_blocks, rid, bell_span(bell, day, p, p, "busy", rid))

    faculty_busy_load: dict[str, dict[int, int]] = {}
    for fid, cells in faculty_busy_cells.items():
        per_day: dict[int, int] = {}
        for day, _ in cells:
            per_day[day] = per_day.get(day, 0) + 1
        faculty_busy_load[fid] = per_day

    locks: dict[str, Json] = {p["sessionId"]: p for p in options.get("lockedSessions") or []}

    sessions: list[Session] = []
    for a in snap["assignments"]:
        course = courses.get(a["courseId"])
        if course is None or not course["isScheduled"] or a["periodsPerWeek"] <= 0:
            continue
        tid = target_id(a)
        if a["target"] == "section":
            section_ids: tuple[str, ...] = (tid,) if tid in sections else ()
            strength = sections[tid]["strength"] if tid in sections else 0
            group = None
        elif a["target"] == "subgroup":
            g = subgroups.get(tid)
            section_ids = (g["sectionId"],) if g else ()
            strength = g["strength"] if g else 0
            group = None
        else:
            e = electives.get(tid)
            section_ids = tuple(e["sourceSectionIds"]) if e else ()
            strength = e["strength"] if e else 0
            group = course["electiveGroup"] or course["id"]
        bell = section_bell.get(section_ids[0], default_bell) if section_ids else default_bell
        need = course["roomNeeds"].get(a["component"])
        fit = [r for r in snap["rooms"] if need is not None and room_fits(r, need)]
        big = [r for r in fit if r["capacity"] >= strength]
        lengths = session_lengths(a["periodsPerWeek"], a["component"], course["labBlockLength"])

        # Blocks that apply to this audience.
        aud_blocks: list[Block] = []
        for sid in section_ids:
            aud_blocks += section_blocks.get(sid, [])
        if a["target"] == "subgroup":
            aud_blocks += subgroup_blocks.get(tid, [])
        else:
            for sid in section_ids:
                for gid in subgroups_of.get(sid, []):
                    aud_blocks += subgroup_blocks.get(gid, [])
        if a["target"] == "elective_section":
            aud_blocks += elective_blocks.get(tid, [])
        fac_ids = tuple(f["facultyId"] for f in a["faculty"])
        fac_blocks = [b for fid in fac_ids for b in faculty_blocks.get(fid, [])]

        for n, length in enumerate(lengths, start=1):
            s = Session(
                id=f"{a['id']}#{n}",
                n=n,
                assignment_id=a["id"],
                course_id=course["id"],
                component=a["component"],
                length=length,
                target_kind=a["target"],
                target_id=tid,
                faculty_ids=fac_ids,
                strength=strength,
                bell=bell,
                section_ids=section_ids,
                elective_group=group,
                room_need=need,
            )
            sessions.append(s)
            if not section_ids or bell is None:
                s.reason, s.detail = "other", "audience"
                continue
            if need is None:
                s.reason = "no_suitable_room"
                continue
            if not fit:
                s.reason = "no_suitable_room"
                continue
            if not big:
                s.reason = "room_too_small"
                continue
            s.rooms = _rank_rooms(big, a, sections.get(tid) if a["target"] == "section" else None)

            all_opts = [
                Option(day, start, *span)
                for day in bell.working_days
                for start in bell.block_starts(length)
                if (span := bell.span(start, length)) is not None
            ]
            if not all_opts:
                s.reason = "lab_block_does_not_fit"
                continue

            lock = locks.get(s.id)
            if lock is not None:
                span = bell.span(lock["startPeriodIndex"], lock["length"])
                if span is not None and lock["length"] == length and lock["roomId"] in rooms:
                    s.locked = True
                    s.options = [Option(lock["weekday"], lock["startPeriodIndex"], *span)]
                    s.rooms = [lock["roomId"]]
                    continue
                s.reason = "locked_conflict"
                continue

            s.all_options = all_opts
            s.blocks = aud_blocks + fac_blocks
            s.options = [o for o in all_opts if not any(b.overlaps(o) for b in s.blocks)]
            if not s.options:
                # relax.diagnose() finds the real reason (unavailable, fixed slot …).
                s.reason, s.detail = "no_free_slot", "blocked"

    boundaries: dict[int, list[int]] = {}
    for day in range(1, 8):
        points: set[int] = set()
        for b in bells:
            for p in b.periods:
                points.add(p.start)
                points.add(p.end)
        boundaries[day] = sorted(points)

    return Problem(
        request_id=request["requestId"],
        snapshot=snap,
        sessions=sessions,
        bells=bells,
        default_bell=default_bell,
        subgroups_of=subgroups_of,
        subgroup_section={g["id"]: g["sectionId"] for g in snap["subGroups"]},
        faculty=faculty,
        rooms=rooms,
        room_blocks=room_blocks,
        faculty_busy_load=faculty_busy_load,
        boundaries=boundaries,
    )


def _rank_rooms(rooms: list[Json], assignment: Json, section: Json | None) -> list[str]:
    """Rooms in preference order: preferred, home room, then smallest that fits (stable)."""
    preferred = assignment.get("preferredRoomId")
    home = section.get("homeRoomId") if section else None

    def key(r: Json) -> tuple[int, int, int]:
        return (0 if r["id"] == preferred else 1, 0 if r["id"] == home else 1, r["capacity"])

    return [r["id"] for r in sorted(rooms, key=key)]
