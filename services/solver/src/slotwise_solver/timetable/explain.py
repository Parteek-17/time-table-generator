"""Plain-language messages for unplaced sessions (CLAUDE.md: explain problems, name people)."""

from __future__ import annotations

from .problem import Json, Problem, Session

COMPONENT_WORDS = {"lecture": "lecture", "tutorial": "tutorial", "practical": "lab"}
ROOM_WORDS = {
    "lecture": "lecture room",
    "tutorial": "tutorial room",
    "lab": "lab",
    "seminar": "seminar hall",
    "drawing_hall": "drawing hall",
    "workshop": "workshop",
}


class Names:
    def __init__(self, problem: Problem) -> None:
        snap = problem.snapshot
        self.courses = {c["id"]: c for c in snap["courses"]}
        self.sections = {s["id"]: s for s in snap["sections"]}
        self.subgroups = {g["id"]: g for g in snap["subGroups"]}
        self.electives = {e["id"]: e for e in snap["electiveSections"]}
        self.faculty = problem.faculty
        self.rooms = problem.rooms

    def course(self, s: Session) -> str:
        c = self.courses[s.course_id]
        return f"{c['code']} {c['shortName']}"

    def audience(self, s: Session) -> str:
        if s.target_kind == "section" and s.target_id in self.sections:
            return self.sections[s.target_id]["displayName"]
        if s.target_kind == "subgroup" and s.target_id in self.subgroups:
            g = self.subgroups[s.target_id]
            sec = self.sections.get(g["sectionId"])
            return f"{sec['displayName']} {g['name']}" if sec else g["name"]
        if s.target_id in self.electives:
            return self.electives[s.target_id]["name"]
        return "this group"

    def teachers(self, ids: tuple[str, ...] | list[str]) -> str:
        names = [self.faculty[f]["name"] for f in ids if f in self.faculty]
        if not names:
            return "The teacher"
        return names[0] if len(names) == 1 else ", ".join(names[:-1]) + " and " + names[-1]

    def need(self, need: Json | None) -> str:
        if need is None:
            return "room"
        word = ROOM_WORDS.get(need["type"], need["type"])
        return f"{need['labCategory']} {word}" if need.get("labCategory") else word


def message(names: Names, s: Session, reason: str, extra: Json | None = None) -> str:
    what = f"{names.course(s)} {COMPONENT_WORDS[s.component]} for {names.audience(s)}"
    extra = extra or {}
    if reason == "no_suitable_room":
        if s.room_need is None:
            return f"{what}: the course has no room type set for this part. Set it in the scheme."
        return (
            f"There is no {names.need(s.room_need)} for {what}. "
            "Add one in Rooms, or change the room the course needs."
        )
    if reason == "room_too_small":
        return (
            f"No {names.need(s.room_need)} seats {s.strength} students for {what}. "
            "Split the class into groups, or set a bigger room's capacity."
        )
    if reason == "lab_block_does_not_fit":
        return (
            f"The {s.length}-period block for {what} does not fit between breaks on any day. "
            "Shorten the lab block or change the bell schedule."
        )
    if reason == "faculty_unavailable":
        return (
            f"{names.teachers(s.faculty_ids)} is not available in any period that would work "
            f"for {what}. Change their availability or the teacher."
        )
    if reason == "blocked_by_fixed_slot":
        return f"Fixed periods (mentoring, library …) leave no time for {what}."
    if reason == "faculty_over_max":
        who = names.teachers(extra.get("facultyIds", s.faculty_ids))
        limit = extra.get("limit", "weekly")
        return (
            f"{who} would go over their {limit} limit with {what}. "
            "Raise the limit or give the class to another teacher."
        )
    if reason == "locked_conflict":
        return (
            f"The locked place for {what} is not valid (wrong period, length or room). "
            "Unlock it or move it."
        )
    if reason == "time_limit":
        return f"Time ran out before {what} was placed. Try again with more time."
    if reason == "no_free_slot":
        return (
            f"No period is free for {what} with {names.teachers(s.faculty_ids)}, "
            "the students and a room all available."
        )
    return f"{what} could not be placed: the class has no students or no bell schedule."


def involved(problem: Problem, s: Session) -> Json:
    rooms = s.rooms or [
        r["id"]
        for r in problem.snapshot["rooms"]
        if s.room_need is not None and r["type"] == s.room_need["type"]
    ]
    return {
        "facultyIds": list(s.faculty_ids),
        "roomIds": rooms,
        "sectionIds": list(s.section_ids),
        "subGroupIds": [s.target_id] if s.target_kind == "subgroup" else [],
        "electiveSectionIds": [s.target_id] if s.target_kind == "elective_section" else [],
        "courseIds": [s.course_id],
    }
