"""Independent checker: does a response break any hard constraint of its request?

Deliberately shares no code with problem.py or model.py: it re-reads the raw snapshot and
compares every pair of placed sessions, so a bug in the model can't hide here.
Returns plain-language violations; an empty list means the timetable is valid.
"""

from __future__ import annotations

from itertools import combinations
from typing import Any

Json = dict[str, Any]
LONG_BREAK = 30


def _lengths(n: int, component: str, block: int) -> list[int]:
    if component != "practical":
        return [1] * n
    return [min(block, n - k) for k in range(0, n, block)]


def _fits(room: Json, need: Json) -> bool:
    if need["type"] == "tutorial":
        return room["type"] in ("tutorial", "lecture")
    if room["type"] != need["type"]:
        return False
    cat = need.get("labCategory")
    return cat is None or cat.strip().lower() in {c.strip().lower() for c in room["labCategories"]}


def _in_scope(row: Json, cohort: Json, section_id: str) -> bool:
    kind = row["scopeType"]
    if kind == "institute":
        return True
    key = {"department": "departmentId", "programme": "programmeId", "cohort": "cohortId"}
    if kind in key:
        own = cohort["id"] if kind == "cohort" else cohort[key[kind]]
        return row[key[kind]] == own
    return row["sectionId"] == section_id


def check(request: Json, response: Json) -> list[str]:
    snap = request["snapshot"]
    opts = request.get("options") or {}
    errors: list[str] = []

    bells = snap["bellSchedules"]
    default = next((b for b in bells if b["isDefault"]), bells[0] if bells else None)
    cohorts = {c["id"]: c for c in snap["cohorts"]}
    sections = {s["id"]: s for s in snap["sections"]}
    subgroups = {g["id"]: g for g in snap["subGroups"]}
    electives = {e["id"]: e for e in snap["electiveSections"]}
    courses = {c["id"]: c for c in snap["courses"]}
    faculty = {f["id"]: f for f in snap["faculty"]}
    rooms = {r["id"]: r for r in snap["rooms"]}

    def bell_of_section(sid: str) -> Json | None:
        c = cohorts.get(sections[sid]["cohortId"]) if sid in sections else None
        if c is None:
            return default
        for b in bells:
            for o in b["overrides"]:
                if o["programmeId"] == c["programmeId"] and (
                    not o["semesters"] or c["semester"] in o["semesters"]
                ):
                    return b
        return default

    def minutes(bell: Json | None, start: int, end: int) -> tuple[int, int] | None:
        if bell is None:
            return None
        ps = {p["index"]: p for p in bell["periods"]}
        if start not in ps or end not in ps:
            return None
        return ps[start]["startMinute"], ps[end]["endMinute"]

    # Expected sessions.
    expected: dict[str, tuple[Json, int]] = {}
    for a in snap["assignments"]:
        c = courses.get(a["courseId"])
        if c is None or not c["isScheduled"] or a["periodsPerWeek"] <= 0:
            continue
        for n, length in enumerate(
            _lengths(a["periodsPerWeek"], a["component"], c["labBlockLength"]), 1
        ):
            expected[f"{a['id']}#{n}"] = (a, length)

    placed_ids = [p["sessionId"] for p in response["placed"]]
    unplaced_ids = [u["sessionId"] for u in response["unplaced"]]
    for sid in set(placed_ids) & set(unplaced_ids):
        errors.append(f"{sid} is both placed and unplaced")
    for ids, what in ((placed_ids, "placed"), (unplaced_ids, "unplaced")):
        if len(ids) != len(set(ids)):
            errors.append(f"a session is {what} twice")
    missing = set(expected) - set(placed_ids) - set(unplaced_ids)
    extra = (set(placed_ids) | set(unplaced_ids)) - set(expected)
    if missing:
        errors.append(f"{len(missing)} sessions are neither placed nor unplaced")
    if extra:
        errors.append(f"unknown sessions in the response: {sorted(extra)[:3]}")

    locks = {p["sessionId"]: p for p in opts.get("lockedSessions") or []}

    # Per placed session: audience, time in minutes, and single-session checks.
    rows: list[Json] = []
    for p in response["placed"]:
        sid = p["sessionId"]
        if sid not in expected:
            continue
        a, length = expected[sid]
        course = courses[a["courseId"]]
        target = a["sectionId"] or a["subGroupId"] or a["electiveSectionId"]
        fac = [f["facultyId"] for f in a["faculty"]]
        if (
            p["assignmentId"] != a["id"]
            or p["courseId"] != a["courseId"]
            or p["component"] != a["component"]
            or p["target"] != {"kind": a["target"], "id": target}
            or sorted(p["facultyIds"]) != sorted(fac)
        ):
            errors.append(f"{sid}: details don't match its assignment")
        if p["length"] != length:
            errors.append(f"{sid}: length {p['length']}, expected {length}")

        if a["target"] == "section":
            secs, strength = [target], sections[target]["strength"]
        elif a["target"] == "subgroup":
            secs, strength = [subgroups[target]["sectionId"]], subgroups[target]["strength"]
        else:
            secs, strength = electives[target]["sourceSectionIds"], electives[target]["strength"]
        bell = bell_of_section(secs[0]) if secs else default

        day, first, last = p["weekday"], p["startPeriodIndex"], p["startPeriodIndex"] + length - 1
        span = minutes(bell, first, last)
        if bell is None or span is None or day not in bell["workingDays"]:
            errors.append(f"{sid}: not inside the bell schedule (day {day}, P{first}-P{last})")
            continue
        ps = {q["index"]: q for q in bell["periods"]}
        long_after = {b["afterPeriodIndex"] for b in bell["breaks"] if b["minutes"] >= LONG_BREAK}
        for k in range(first, last):
            if k in long_after or ps[k + 1]["startMinute"] - ps[k]["endMinute"] >= LONG_BREAK:
                errors.append(f"{sid}: block crosses a long break after P{k}")

        room = rooms.get(p["roomId"])
        need = course["roomNeeds"].get(a["component"])
        if room is None or need is None or not _fits(room, need):
            errors.append(f"{sid}: room {p['roomId']} is the wrong type")
        elif room["capacity"] < strength:
            errors.append(f"{sid}: room {room['code']} seats {room['capacity']} < {strength}")

        if sid in locks:
            lk = locks[sid]
            same = all(lk[k] == p[k] for k in ("weekday", "startPeriodIndex", "length", "roomId"))
            if not same or not p["locked"]:
                errors.append(f"{sid}: locked session moved")
        elif p["locked"]:
            errors.append(f"{sid}: marked locked but was not locked")

        rows.append(
            {
                "id": sid,
                "day": day,
                "start": span[0],
                "end": span[1],
                "periods": length,
                "faculty": set(fac),
                "room": p["roomId"],
                "kind": a["target"],
                "target": target,
                "sections": set(secs),
                "group": course["electiveGroup"] or course["id"],
            }
        )

    def overlap(r: Json, day: int, start: int, end: int) -> bool:
        return r["day"] == day and r["start"] < end and start < r["end"]

    # Pairs on the same day.
    by_day: dict[int, list[Json]] = {}
    for r in rows:
        by_day.setdefault(r["day"], []).append(r)
    for day_rows in by_day.values():
        for r1, r2 in combinations(day_rows, 2):
            if not overlap(r1, r2["day"], r2["start"], r2["end"]):
                continue
            if r1["faculty"] & r2["faculty"]:
                errors.append(f"teacher double-booked: {r1['id']} and {r2['id']}")
            if r1["room"] == r2["room"]:
                errors.append(f"room double-booked: {r1['id']} and {r2['id']}")
            if r1["sections"] & r2["sections"]:
                parallel_groups = (
                    r1["kind"] == r2["kind"] == "subgroup" and r1["target"] != r2["target"]
                )
                parallel_electives = (
                    r1["kind"] == r2["kind"] == "elective_section"
                    and r1["group"] == r2["group"]
                    and r1["target"] != r2["target"]
                )
                if not (parallel_groups or parallel_electives):
                    errors.append(f"students double-booked: {r1['id']} and {r2['id']}")

    # Faculty availability and limits.
    busy = opts.get("busySlots") or []
    for fid, f in faculty.items():
        mine = [r for r in rows if fid in r["faculty"]]
        for c in f["unavailable"]:
            span = minutes(default, c["periodIndex"], c["periodIndex"])
            if span and any(overlap(r, c["weekday"], *span) for r in mine):
                errors.append(f"{f['name']} teaches while unavailable (day {c['weekday']})")
        extra_cells = {
            (b["weekday"], b["periodIndex"])
            for b in busy
            if b["resource"] == "faculty" and b["id"] == fid
        }
        per_day: dict[int, int] = {}
        for r in mine:
            per_day[r["day"]] = per_day.get(r["day"], 0) + r["periods"]
        for d, _ in extra_cells:
            per_day[d] = per_day.get(d, 0) + 1
        for d, n in per_day.items():
            if n > f["maxPeriodsPerDay"]:
                errors.append(
                    f"{f['name']} has {n} periods on day {d} (max {f['maxPeriodsPerDay']})"
                )
        if sum(per_day.values()) > f["maxPeriodsPerWeek"]:
            errors.append(
                f"{f['name']} has {sum(per_day.values())} periods (max {f['maxPeriodsPerWeek']})"
            )

    # Fixed slots.
    for fs in snap["fixedSlots"]:
        for r in rows:
            for sec in r["sections"]:
                c = cohorts.get(sections[sec]["cohortId"]) if sec in sections else None
                if c is None or not _in_scope(fs, c, sec):
                    continue
                span = minutes(bell_of_section(sec), fs["startPeriodIndex"], fs["endPeriodIndex"])
                if span and overlap(r, fs["weekday"], *span):
                    errors.append(f"{r['id']} is in fixed slot {fs['label']}")
            span = minutes(default, fs["startPeriodIndex"], fs["endPeriodIndex"])
            if span and r["faculty"] & set(fs["facultyIds"]) and overlap(r, fs["weekday"], *span):
                errors.append(f"{r['id']}: teacher is busy in fixed slot {fs['label']}")

    # Busy slots from other timetables.
    for b in busy:
        kind, rid = b["resource"], b["id"]
        if kind in ("section", "subgroup"):
            sec = rid if kind == "section" else subgroups.get(rid, {}).get("sectionId")
            bell = bell_of_section(sec) if sec else default
        else:
            bell = default
        span = minutes(bell, b["periodIndex"], b["periodIndex"])
        if span is None:
            continue
        for r in rows:
            hit = {
                "faculty": rid in r["faculty"],
                "room": r["room"] == rid,
                "section": rid in r["sections"],
                "subgroup": (r["kind"] == "subgroup" and r["target"] == rid)
                or (
                    r["kind"] != "subgroup"
                    and subgroups.get(rid, {}).get("sectionId") in r["sections"]
                ),
                "elective_section": r["kind"] == "elective_section" and r["target"] == rid,
            }[kind]
            if hit and overlap(r, b["weekday"], *span):
                errors.append(f"{r['id']} uses busy {kind} {rid} (day {b['weekday']})")

    return errors
