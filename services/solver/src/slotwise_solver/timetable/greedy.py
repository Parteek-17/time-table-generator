"""Greedy placer: a quick, valid timetable used as the CP-SAT starting point (hint).

Hardest sessions first (fewest choices, longest blocks); each goes to the first free place,
preferring days its course doesn't use yet and earlier periods. Deterministic.
"""

from __future__ import annotations

from collections import defaultdict

from .problem import Option, Problem, Session

Atom = tuple[int, int]


class Occupancy:
    """Who is busy when, with the same rules as the model (sub-groups and elective groups)."""

    def __init__(self, problem: Problem) -> None:
        self.p = problem
        self.whole: dict[str, set[Atom]] = defaultdict(set)
        self.part: dict[str, set[Atom]] = defaultdict(set)
        # Section → atom → elective groups meeting then.
        self.elective: dict[str, dict[Atom, set[str]]] = defaultdict(lambda: defaultdict(set))
        self.own: dict[str, set[Atom]] = defaultdict(set)
        self.faculty: dict[str, set[Atom]] = defaultdict(set)
        self.day_load: dict[tuple[str, int], int] = defaultdict(int)
        self.week_load: dict[str, int] = defaultdict(int)
        self.room: dict[str, set[Atom]] = {r: problem.room_busy_atoms(r) for r in problem.rooms}
        for fid, per_day in problem.faculty_busy_load.items():
            for day, n in per_day.items():
                self.day_load[(fid, day)] += n
                self.week_load[fid] += n

    def _section_free(self, s: Session, atoms: list[Atom]) -> bool:
        for sid in s.section_ids:
            subs = self.p.subgroups_of.get(sid, [])
            for a in atoms:
                if a in self.whole[sid]:
                    return False
                groups = self.elective[sid].get(a)
                if groups and not (s.target_kind == "elective_section" and groups <= {s.group_key}):
                    return False
                if s.target_kind == "subgroup":
                    if a in self.part[s.target_id]:
                        return False
                elif any(a in self.part[g] for g in subs):
                    return False
        if s.target_kind == "elective_section":
            return not any(a in self.own[s.target_id] for a in atoms)
        return True

    def fits(self, s: Session, o: Option, room: str) -> bool:
        atoms = self.p.atoms(o)
        if any(a in self.room[room] for a in atoms):
            return False
        for fid in s.faculty_ids:
            f = self.p.faculty.get(fid)
            if any(a in self.faculty[fid] for a in atoms):
                return False
            if f is not None and (
                self.day_load[(fid, o.weekday)] + s.length > f["maxPeriodsPerDay"]
                or self.week_load[fid] + s.length > f["maxPeriodsPerWeek"]
            ):
                return False
        return self._section_free(s, atoms)

    def add(self, s: Session, o: Option, room: str) -> None:
        atoms = self.p.atoms(o)
        self.room[room].update(atoms)
        for fid in s.faculty_ids:
            self.faculty[fid].update(atoms)
            self.day_load[(fid, o.weekday)] += s.length
            self.week_load[fid] += s.length
        if s.target_kind == "section":
            self.whole[s.target_id].update(atoms)
        elif s.target_kind == "subgroup":
            self.part[s.target_id].update(atoms)
        else:
            self.own[s.target_id].update(atoms)
            for sid in s.section_ids:
                for a in atoms:
                    self.elective[sid][a].add(s.group_key)


def greedy(problem: Problem) -> dict[str, tuple[Option, str]]:
    sessions = problem.model_sessions
    order = sorted(
        range(len(sessions)),
        key=lambda i: (
            0 if sessions[i].locked else 1,
            len(sessions[i].options) * len(sessions[i].rooms),
            -sessions[i].length,
            i,
        ),
    )
    occ = Occupancy(problem)
    days_used: dict[tuple[str, str], set[int]] = defaultdict(set)
    out: dict[str, tuple[Option, str]] = {}
    for i in order:
        s = sessions[i]
        used = days_used[(s.course_id, s.target_id)]
        opts = sorted(s.options, key=lambda o: (o.weekday in used, o.start_index, o.weekday))
        done = False
        for o in opts:
            for r in s.rooms:
                if occ.fits(s, o, r):
                    occ.add(s, o, r)
                    out[s.id] = (o, r)
                    used.add(o.weekday)
                    done = True
                    break
            if done:
                break
    return out
