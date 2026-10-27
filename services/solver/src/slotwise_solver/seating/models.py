"""solver-seating.v1 request and response (packages/shared/src/contracts/solver-seating.v1.ts).

Field meanings are in the JSDoc of the TypeScript file; the JSON uses camelCase.
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

VERSION = "solver-seating.v1"


class _Model(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="ignore")


class Paper(_Model):
    id: str
    code: str
    title: str


class Student(_Model):
    id: str
    roll_no: str
    paper_id: str
    section_id: str | None
    needs_accessible_seat: bool


class Hall(_Model):
    id: str
    code: str
    floor: int
    is_accessible: bool
    rows: int = Field(ge=1)
    benches_per_row: int = Field(ge=1)
    seats_per_bench: int = Field(ge=1)
    order: int = Field(ge=0)

    @property
    def columns(self) -> int:
        return self.benches_per_row * self.seats_per_bench

    @property
    def capacity(self) -> int:
        return self.rows * self.columns


class Faculty(_Model):
    id: str
    name: str
    available: bool
    teaches_paper_ids: list[str]
    duties_so_far: int = Field(ge=0)


class InvigilatorOptions(_Model):
    minimum_per_hall: int = Field(default=1, ge=1)
    students_per_invigilator: int = Field(default=30, ge=1)


class Options(_Model):
    reserve_seats_per_hall: int = Field(default=0, ge=0)
    invigilators: InvigilatorOptions = Field(default_factory=InvigilatorOptions)
    time_limit_seconds: float = Field(default=30, gt=0, le=600)
    seed: int = Field(default=0, ge=0)


class SeatingRequest(_Model):
    version: Literal["solver-seating.v1"]
    request_id: str = Field(min_length=1)
    exam_session_id: str
    date: str
    session_label: str
    papers: list[Paper]
    students: list[Student]
    halls: list[Hall]
    faculty: list[Faculty]
    options: Options


class Seat(_Model):
    student_id: str
    paper_id: str
    hall_id: str
    row: int
    column: int
    label: str


UnseatedReason = Literal["not_enough_seats", "no_accessible_seat", "adjacency", "time_limit"]


class Unseated(_Model):
    student_id: str
    reason: UnseatedReason
    message: str


class HallSummary(_Model):
    hall_id: str
    capacity: int
    used: int
    reserved: int
    paper_ids: list[str]
    invigilator_ids: list[str]


class InvigilationProblem(_Model):
    hall_id: str
    missing: int = Field(ge=1)
    message: str


class SeatingResponse(_Model):
    version: Literal["solver-seating.v1"] = VERSION
    request_id: str
    status: Literal["OPTIMAL", "FEASIBLE", "INFEASIBLE", "TIMEOUT"]
    solve_seconds: float
    seats: list[Seat]
    unseated: list[Unseated]
    halls: list[HallSummary]
    invigilation_problems: list[InvigilationProblem]
