"""Invigilation duties for one exam session (CLAUDE.md, "Exam seating rules").

Rules:
- Each hall in use gets max(minimumPerHall, ceil(students / studentsPerInvigilator)).
- Only available faculty; one hall each per session.
- Never a hall where a paper they teach is written.
- Balance: faculty with fewer duties so far this exam season go first.

Assignment is a bipartite matching (hall places × faculty) found with augmenting paths, so a
hall is short of invigilators only when no reshuffle could cover it. Places are filled round
by round (every hall's first invigilator, then every hall's second …) and each place tries the
least-loaded faculty first, which keeps duties balanced.
"""

import math
from dataclasses import dataclass

from .models import Faculty, InvigilationProblem, Paper, SeatingRequest


@dataclass(frozen=True)
class HallNeed:
    hall_id: str
    hall_code: str
    students: int
    paper_ids: frozenset[str]


def needed(students: int, minimum: int, per_invigilator: int) -> int:
    if students == 0:
        return 0
    return max(minimum, math.ceil(students / per_invigilator))


def assign_invigilators(
    request: SeatingRequest, halls: list[HallNeed]
) -> tuple[dict[str, list[str]], list[InvigilationProblem]]:
    """hall id → faculty ids, and the halls left short."""
    opts = request.options.invigilators
    papers: dict[str, Paper] = {p.id: p for p in request.papers}
    pool = sorted(
        (f for f in request.faculty if f.available),
        key=lambda f: (f.duties_so_far, f.name, f.id),
    )
    need = {
        h.hall_id: needed(h.students, opts.minimum_per_hall, opts.students_per_invigilator)
        for h in halls
    }

    def eligible(f: Faculty, hall: HallNeed) -> bool:
        return not (hall.paper_ids & set(f.teaches_paper_ids))

    candidates = {h.hall_id: [f.id for f in pool if eligible(f, h)] for h in halls}
    rounds = max(need.values(), default=0)
    places = [(h.hall_id, k) for k in range(rounds) for h in halls if k < need[h.hall_id]]

    hall_of: dict[str, str] = {}  # faculty id → hall id
    place_of: dict[str, tuple[str, int]] = {}  # faculty id → place
    filled: dict[tuple[str, int], str] = {}

    def augment(place: tuple[str, int], seen: set[str]) -> bool:
        hall_id = place[0]
        for fid in candidates[hall_id]:
            if fid in seen:
                continue
            seen.add(fid)
            current = place_of.get(fid)
            if current is None or augment(current, seen):
                place_of[fid] = place
                hall_of[fid] = hall_id
                filled[place] = fid
                return True
        return False

    for place in places:
        augment(place, set())

    assigned: dict[str, list[str]] = {h.hall_id: [] for h in halls}
    order = {f.id: i for i, f in enumerate(pool)}
    for fid, hall_id in hall_of.items():
        assigned[hall_id].append(fid)
    for ids in assigned.values():
        ids.sort(key=lambda fid: order[fid])

    problems: list[InvigilationProblem] = []
    available = len(pool)
    for hall in halls:
        missing = need[hall.hall_id] - len(assigned[hall.hall_id])
        if missing <= 0:
            continue
        got, want = len(assigned[hall.hall_id]), need[hall.hall_id]
        codes = sorted(papers[p].code for p in hall.paper_ids if p in papers)
        if len(candidates[hall.hall_id]) < want:
            why = (
                f"everyone else teaches {' or '.join(codes)} or is not available"
                if codes
                else "not enough faculty are available"
            )
        else:
            why = f"the {available} available faculty are needed in other halls"
        problems.append(
            InvigilationProblem(
                hall_id=hall.hall_id,
                missing=missing,
                message=f"Only {got} of {want} invigilators for {hall.hall_code}: {why}.",
            )
        )
    return assigned, problems
