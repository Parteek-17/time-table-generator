"""Soft-constraint score of a solution, counted the way the response's breakdown reports it.

One function per soft constraint in SOFT_CONSTRAINTS_V1. Counts are violations; penalty is
weight × count.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from math import ceil

from .problem import LONG_BREAK_MINUTES, Json, Option, Problem, Session

# Order and defaults of SOFT_CONSTRAINTS_V1 (packages/shared/src/contracts/solver-timetable.v1.ts).
DEFAULT_WEIGHTS: dict[str, float] = {
    "theory_spread": 10,
    "faculty_consecutive": 5,
    "late_slots": 2,
    "section_idle_gaps": 3,
    "home_room": 1,
    "preferred_room": 1,
}

# Most consecutive periods a teacher should have before a rest.
MAX_CONSECUTIVE = 3


@dataclass(frozen=True)
class Placed:
    session: Session
    option: Option
    room_id: str


def theory_per_day_cap(total: int, days: int) -> int:
    """Theory periods of one course allowed on one day: 1, unless L+T > working days."""
    return 1 if total <= days else ceil(total / days)


def count_theory_spread(placed: list[Placed], problem: Problem) -> int:
    # The cap uses the course's whole L + T for the audience, placed or not.
    total: dict[tuple[str, str], int] = defaultdict(int)
    for s in problem.sessions:
        if s.component in ("lecture", "tutorial"):
            total[(s.course_id, s.target_id)] += 1
    groups: dict[tuple[str, str], list[Placed]] = defaultdict(list)
    for p in placed:
        if p.session.component in ("lecture", "tutorial"):
            groups[(p.session.course_id, p.session.target_id)].append(p)
    count = 0
    for key, items in groups.items():
        bell = items[0].session.bell
        days = len(bell.working_days) if bell else 5
        cap = theory_per_day_cap(total[key], days)
        per_day: dict[int, int] = defaultdict(int)
        for p in items:
            per_day[p.option.weekday] += 1
        count += sum(max(0, n - cap) for n in per_day.values())
    return count


def count_faculty_consecutive(placed: list[Placed]) -> int:
    days: dict[tuple[str, int], list[Placed]] = defaultdict(list)
    for p in placed:
        for fid in p.session.faculty_ids:
            days[(fid, p.option.weekday)].append(p)
    count = 0
    for items in days.values():
        items.sort(key=lambda p: p.option.start)
        run, last_end = 0, None
        for p in items:
            if last_end is not None and p.option.start - last_end < LONG_BREAK_MINUTES:
                run += p.session.length
            else:
                count += max(0, run - MAX_CONSECUTIVE)
                run = p.session.length
            last_end = p.option.end
        count += max(0, run - MAX_CONSECUTIVE)
    return count


def count_late_slots(placed: list[Placed]) -> int:
    count = 0
    for p in placed:
        bell = p.session.bell
        if bell and p.option.start_index + p.session.length - 1 >= bell.last_index:
            count += 1
    return count


def count_section_idle_gaps(placed: list[Placed]) -> int:
    busy: dict[tuple[str, int], set[int]] = defaultdict(set)
    for p in placed:
        for sid in p.session.section_ids:
            for k in range(p.session.length):
                busy[(sid, p.option.weekday)].add(p.option.start_index + k)
    count = 0
    for idx in busy.values():
        count += (max(idx) - min(idx) + 1) - len(idx)
    return count


def count_home_room(placed: list[Placed], problem: Problem) -> int:
    sections: dict[str, Json] = {s["id"]: s for s in problem.snapshot["sections"]}
    count = 0
    labs: dict[str, set[str]] = defaultdict(set)
    for p in placed:
        s = p.session
        if s.component == "practical":
            labs[s.assignment_id].add(p.room_id)
        elif s.target_kind == "section":
            home = sections.get(s.target_id, {}).get("homeRoomId")
            if home and p.room_id != home:
                count += 1
    # Same lab for every block of a lab group.
    count += sum(len(rooms) - 1 for rooms in labs.values())
    return count


def count_preferred_room(placed: list[Placed], problem: Problem) -> int:
    assignments: dict[str, Json] = {a["id"]: a for a in problem.snapshot["assignments"]}
    count = 0
    for p in placed:
        a = assignments[p.session.assignment_id]
        room = problem.rooms[p.room_id]
        if a.get("preferredRoomId"):
            count += p.room_id != a["preferredRoomId"]
        elif a.get("preferredLabCategory"):
            wanted = a["preferredLabCategory"].strip().lower()
            count += not any(c.strip().lower() == wanted for c in room["labCategories"])
    return count


def score(placed: list[Placed], problem: Problem, weights: dict[str, float]) -> Json:
    counts = {
        "theory_spread": count_theory_spread(placed, problem),
        "faculty_consecutive": count_faculty_consecutive(placed),
        "late_slots": count_late_slots(placed),
        "section_idle_gaps": count_section_idle_gaps(placed),
        "home_room": count_home_room(placed, problem),
        "preferred_room": count_preferred_room(placed, problem),
    }
    breakdown = [
        {
            "constraint": name,
            "weight": weights[name],
            "count": counts[name],
            "penalty": weights[name] * counts[name],
        }
        for name in DEFAULT_WEIGHTS
    ]
    return {"total": sum(b["penalty"] for b in breakdown), "breakdown": breakdown}
