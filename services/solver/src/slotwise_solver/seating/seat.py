"""Seat students in exam halls (CLAUDE.md, "Exam seating rules").

Rules:
- Two students writing the same paper never sit adjacent: left/right (any two neighbouring
  columns, also across benches) or front/back.
- Halls fill in `order`; within a paper, roll numbers go up through the halls; papers are
  interleaved seat by seat.
- Each hall keeps at least `reserveSeatsPerHall` seats empty: it takes at most capacity −
  reserve students, so the reserve comes out of seats the adjacency rule leaves empty anyway.
- Students who need an accessible seat get the front-most free seat in an accessible hall
  (ground floor first) before anyone else is seated.

A greedy fill that checks the rule at every seat is valid by construction, deterministic and
fast enough for thousands of students, so no CP-SAT model is needed. At each seat it takes the
paper with the most students still waiting among those not already seated to the left, right,
front or back, which keeps papers interleaved and leaves the fewest seats empty.
"""

import re
from collections import deque
from dataclasses import dataclass, field

from .models import Hall, Paper, SeatingRequest, Student

_DIGITS = re.compile(r"(\d+)")


def roll_key(roll_no: str) -> tuple[tuple[int, int | str], ...]:
    """Natural order: "CS9" before "CS10"; numbers compare as numbers."""
    return tuple(
        (0, int(part)) if part.isdigit() else (1, part.lower())
        for part in _DIGITS.split(roll_no)
        if part
    )


@dataclass
class HallGrid:
    hall: Hall
    reserve: int
    # (row, column) → paper id
    taken: dict[tuple[int, int], str] = field(default_factory=dict)

    def cells(self) -> list[tuple[int, int]]:
        """Fill order: front row first, left to right."""
        return [
            (r, c) for r in range(1, self.hall.rows + 1) for c in range(1, self.hall.columns + 1)
        ]

    @property
    def limit(self) -> int:
        return max(0, self.hall.capacity - self.reserve)

    @property
    def full(self) -> bool:
        return len(self.taken) >= self.limit

    def neighbour_papers(self, row: int, column: int) -> set[str]:
        around = ((row, column - 1), (row, column + 1), (row - 1, column), (row + 1, column))
        return {self.taken[cell] for cell in around if cell in self.taken}

    def label(self, row: int, column: int) -> str:
        return f"{self.hall.code}-R{row}-C{column}"


@dataclass
class Placement:
    student: Student
    grid: HallGrid
    row: int
    column: int


@dataclass
class SeatingResult:
    placements: list[Placement]
    unseated: list[tuple[Student, str, str]]  # (student, reason, message)
    grids: list[HallGrid]


def _hall_order(halls: list[Hall]) -> list[Hall]:
    return sorted(halls, key=lambda h: (h.order, h.code, h.id))


def seat_students(request: SeatingRequest) -> SeatingResult:
    papers: dict[str, Paper] = {p.id: p for p in request.papers}
    reserve = request.options.reserve_seats_per_hall
    grids = [HallGrid(hall, min(reserve, hall.capacity)) for hall in _hall_order(request.halls)]
    placements: list[Placement] = []
    unseated: list[tuple[Student, str, str]] = []

    students = sorted(request.students, key=lambda s: (roll_key(s.roll_no), s.id))

    # 1. Accessible seats first: front-most free seat in an accessible hall, ground floor first.
    accessible = sorted(
        (g for g in grids if g.hall.is_accessible),
        key=lambda g: (g.hall.floor, g.hall.order, g.hall.code, g.hall.id),
    )
    for student in (s for s in students if s.needs_accessible_seat):
        cell = _first_valid_cell(accessible, student.paper_id)
        if cell is None:
            reason = "no_accessible_seat"
            if not accessible:
                message = (
                    f"{student.roll_no} needs a ground-floor or front seat, but none of the "
                    "halls for this session is marked accessible."
                )
            else:
                message = (
                    f"{student.roll_no} needs a ground-floor or front seat, but the accessible "
                    "halls are full."
                )
            unseated.append((student, reason, message))
            continue
        grid, row, column = cell
        grid.taken[(row, column)] = student.paper_id
        placements.append(Placement(student, grid, row, column))

    # 2. Everyone else, hall by hall, seat by seat.
    queues: dict[str, deque[Student]] = {}
    for student in students:
        if not student.needs_accessible_seat:
            queues.setdefault(student.paper_id, deque()).append(student)
    first_roll = {pid: roll_key(q[0].roll_no) for pid, q in queues.items()}

    for grid in grids:
        for row, column in grid.cells():
            if not any(queues.values()) or grid.full:
                break
            if (row, column) in grid.taken:
                continue
            blocked = grid.neighbour_papers(row, column)
            choices = [pid for pid, q in queues.items() if q and pid not in blocked]
            if not choices:
                continue  # leave the seat empty: every waiting paper sits next to it
            pid = min(choices, key=lambda p: (-len(queues[p]), first_roll[p], p))
            student = queues[pid].popleft()
            grid.taken[(row, column)] = pid
            placements.append(Placement(student, grid, row, column))

    # 3. Who is left, and why.
    left = [s for q in queues.values() for s in q]
    if left:
        room_left = any(not g.full for g in grids)
        for student in sorted(left, key=lambda s: (roll_key(s.roll_no), s.id)):
            paper = papers.get(student.paper_id)
            code = paper.code if paper else "this paper"
            if room_left:
                unseated.append(
                    (
                        student,
                        "adjacency",
                        f"{student.roll_no} ({code}) has no seat: the empty seats are all next "
                        f"to another {code} student. Add a hall or mix in another paper.",
                    )
                )
            else:
                unseated.append(
                    (
                        student,
                        "not_enough_seats",
                        f"{student.roll_no} ({code}) has no seat: the halls are full. Add a "
                        "hall or lower the reserve seats.",
                    )
                )

    return SeatingResult(placements, unseated, grids)


def _first_valid_cell(grids: list[HallGrid], paper_id: str) -> tuple[HallGrid, int, int] | None:
    for grid in grids:
        if grid.full:
            continue
        for row, column in grid.cells():
            if (row, column) in grid.taken:
                continue
            if paper_id in grid.neighbour_papers(row, column):
                continue
            return grid, row, column
    return None
