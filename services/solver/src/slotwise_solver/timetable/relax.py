"""Relaxation pass: why each unplaced session got no place (solver-timetable.v1 reason codes).

Around the final timetable, every place the bell schedule allows the session is checked
against each kind of rule, collecting what stands in the way ("hits"). A kind is relaxed when
ignoring it alone would free some place; the first such kind in RELAX_ORDER names the reason.
When no single kind is enough, a kind in the way everywhere still names it (a teacher who is
never available), and otherwise the session has no free slot.

Reasons found before solving (no suitable room, room too small, lab block does not fit, no
audience) need no relaxation and are kept as they are. A locked session is only ever checked
at its locked place: an invalid lock, or what holds that place, explains locked_conflict.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field

from .explain import Names
from .problem import Option, Problem, Session
from .score import Placed

DAYS = {1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat", 7: "Sun"}

# Kind of rule in the way → the reason when relaxing that kind alone frees a place.
RELAX_ORDER = (
    ("unavailable", "faculty_unavailable"),
    ("fixed", "blocked_by_fixed_slot"),
    ("day_max", "faculty_over_max"),
    ("locked", "locked_conflict"),
)


@dataclass(frozen=True)
class Hit:
    """One thing in the way of a place: a rule kind, a plain description and who is involved."""

    kind: str  # unavailable | fixed | busy | day_max | locked | placed
    text: str
    faculty_ids: tuple[str, ...] = ()
    section_ids: tuple[str, ...] = ()
    room_ids: tuple[str, ...] = ()


@dataclass
class Diagnosis:
    reason: str
    # Places that show the reason ("Mon P1"), each with what is in the way there.
    places: list[tuple[str, list[Hit]]] = field(default_factory=list)
    faculty_ids: list[str] = field(default_factory=list)
    limit: str | None = None  # periods-per-day | periods-per-week, for faculty_over_max
    invalid: str | None = None  # length | place | room, for an invalid lock

    def involved(self) -> dict[str, list[str]]:
        out: dict[str, list[str]] = {"facultyIds": [], "sectionIds": [], "roomIds": []}
        for _, hits in self.places:
            for h in hits:
                out["facultyIds"] += h.faculty_ids
                out["sectionIds"] += h.section_ids
                out["roomIds"] += h.room_ids
        out["facultyIds"] += self.faculty_ids
        return {k: list(dict.fromkeys(v)) for k, v in out.items()}


def faculty_load(problem: Problem, placed: list[Placed]) -> dict[str, dict[int, int]]:
    load: dict[str, dict[int, int]] = defaultdict(lambda: defaultdict(int))
    for fid, per_day in problem.faculty_busy_load.items():
        for day, n in per_day.items():
            load[fid][day] += n
    for p in placed:
        for fid in p.session.faculty_ids:
            load[fid][p.option.weekday] += p.session.length
    return load


def diagnose(problem: Problem, placed: list[Placed], proven: bool) -> dict[str, Diagnosis]:
    """A reason for every session without a place, keyed by session id."""
    done = {p.session.id for p in placed}
    load = faculty_load(problem, placed)
    names = Names(problem)
    out: dict[str, Diagnosis] = {}
    for s in problem.sessions:
        if s.id in done:
            continue
        if s.locked:
            out[s.id] = _locked(problem, names, s, placed, load)
        elif s.reason is not None and s.detail != "blocked":
            out[s.id] = Diagnosis(s.reason)
        else:
            out[s.id] = _relax(problem, names, s, placed, load, proven)
    return out


def at(s: Session, o: Option) -> str:
    p = s.bell.period(o.start_index) if s.bell else None
    return f"{DAYS.get(o.weekday, str(o.weekday))} {p.label if p else o.start_index}"


def _relax(
    problem: Problem,
    names: Names,
    s: Session,
    placed: list[Placed],
    load: dict[str, dict[int, int]],
    proven: bool,
) -> Diagnosis:
    for fid in s.faculty_ids:
        f = problem.faculty.get(fid)
        if f is not None and sum(load[fid].values()) + s.length > f["maxPeriodsPerWeek"]:
            return Diagnosis("faculty_over_max", faculty_ids=[fid], limit="periods-per-week")

    hits = {o: _hits(problem, names, s, o, placed, load) for o in s.all_options}
    kinds = {o: {h.kind for h in hs} for o, hs in hits.items()}

    def show(opts: list[Option]) -> list[tuple[str, list[Hit]]]:
        return [(at(s, o), hits[o]) for o in opts]

    free = [o for o in s.all_options if not kinds[o]]
    if free:
        # Nothing is in the way: the search stopped before it found this place.
        return Diagnosis("time_limit", show(free))
    for every in (False, True):
        for kind, reason in RELAX_ORDER:
            opts = [o for o in s.all_options if (kind in kinds[o] if every else kinds[o] == {kind})]
            if opts and (not every or len(opts) == len(s.all_options)):
                d = Diagnosis(reason, show(opts))
                if kind in ("unavailable", "day_max"):
                    found = [h for o in opts for h in hits[o] if h.kind == kind]
                    d.faculty_ids = list(dict.fromkeys(f for h in found for f in h.faculty_ids))
                if kind == "day_max":
                    d.limit = "periods-per-day"
                return d
    # Other classes are in the way; only a proven placement count says they cannot move.
    movable = any("placed" in k for k in kinds.values())
    reason = "time_limit" if movable and not proven else "no_free_slot"
    return Diagnosis(reason, show(s.all_options))


def _locked(
    problem: Problem,
    names: Names,
    s: Session,
    placed: list[Placed],
    load: dict[str, dict[int, int]],
) -> Diagnosis:
    """A locked session without a place: the lock is invalid, or something holds its place."""
    if s.detail in ("length", "place", "room") or not s.all_options:
        return Diagnosis("locked_conflict", invalid=s.detail or "place")
    o = s.all_options[0]
    hits = _hits(problem, names, s, o, placed, load)
    for fid in s.faculty_ids:
        f = problem.faculty.get(fid)
        if f is not None and sum(load[fid].values()) + s.length > f["maxPeriodsPerWeek"]:
            text = f"{names.teachers([fid])} would go over {f['maxPeriodsPerWeek']} periods a week"
            hits.append(Hit("week_max", text, faculty_ids=(fid,)))
    return Diagnosis("locked_conflict", [(at(s, o), hits)])


def _hits(
    problem: Problem,
    names: Names,
    s: Session,
    o: Option,
    placed: list[Placed],
    load: dict[str, dict[int, int]],
) -> list[Hit]:
    out: list[Hit] = []
    for b in s.blocks:
        if not b.overlaps(o):
            continue
        if b.why == "unavailable":
            who = names.teachers([b.owner])
            out.append(Hit("unavailable", f"{who} is not available", faculty_ids=(b.owner,)))
        elif b.why == "fixed_slot":
            out.append(Hit("fixed", "a fixed period (mentoring, library …)"))
        elif b.owner in problem.faculty:
            who = names.teachers([b.owner])
            out.append(Hit("busy", f"{who} is busy elsewhere", faculty_ids=(b.owner,)))
        else:
            out.append(Hit("busy", f"{names.audience(s)} is busy elsewhere"))
    for fid in s.faculty_ids:
        f = problem.faculty.get(fid)
        if f is not None and load[fid][o.weekday] + s.length > f["maxPeriodsPerDay"]:
            text = (
                f"{names.teachers([fid])} already has {load[fid][o.weekday]} periods that day "
                f"(most {f['maxPeriodsPerDay']})"
            )
            out.append(Hit("day_max", text, faculty_ids=(fid,)))

    overlapping = [
        p
        for p in placed
        if p.option.weekday == o.weekday and p.option.start < o.end and o.start < p.option.end
    ]
    for p in overlapping:
        kind = "locked" if p.session.locked else "placed"
        what = f"{names.course(p.session)} for {names.audience(p.session)}"
        if kind == "locked":
            what = f"the locked {what}"
        shared = [f for f in s.faculty_ids if f in p.session.faculty_ids]
        if shared:
            text = f"{names.teachers(shared)} teaches {what}"
            out.append(
                Hit(kind, text, faculty_ids=tuple(shared), section_ids=p.session.section_ids)
            )
        if _audience_clash(problem, s, p.session):
            text = f"{names.audience(s)} has {what}"
            out.append(Hit(kind, text, section_ids=p.session.section_ids))

    # Rooms: the place is blocked only when every suitable room is taken.
    room_kinds: list[tuple[int, list[str], str]] = []
    for rid in s.rooms:
        ks = {"locked" if p.session.locked else "placed" for p in overlapping if p.room_id == rid}
        if any(b.overlaps(o) for b in problem.room_blocks.get(rid, [])):
            ks.add("busy")
        if not ks:
            room_kinds = []
            break
        room_kinds.append((len(ks), sorted(ks), rid))
    if room_kinds:
        _, ks, _ = min(room_kinds)
        text = f"every {names.need(s.room_need)} that fits is in use"
        rooms = tuple(rid for _, _, rid in room_kinds)
        out += [Hit(k, text, room_ids=rooms) for k in ks]
    return list(dict.fromkeys(out))


def _audience_clash(problem: Problem, s: Session, p: Session) -> bool:
    """Do the students of s and p overlap? Same rules as greedy.Occupancy."""
    common = set(s.section_ids) & set(p.section_ids)
    if not common:
        return False
    if p.target_kind == "section" or s.target_kind == "section":
        return True
    if p.target_kind == "subgroup":
        return s.target_kind != "subgroup" or s.target_id == p.target_id
    if s.target_kind == "subgroup":
        return True
    # Both electives: one group may meet in parallel, but not the same elective section twice.
    return s.target_id == p.target_id or s.group_key != p.group_key
