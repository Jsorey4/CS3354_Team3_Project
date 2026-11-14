"""
@author: Saaqib Shaik
@description: Exports a project's deadlines to a calendar and its data to a spreadsheet. Calendar export
    builds a standards-compliant .ics file (RFC 5545) or, after the user explicitly consents, ready-made
    "add to Google Calendar / Outlook" links; if consent is declined nothing is shared. Spreadsheet export
    builds an .xlsx workbook (or a Google Sheets values payload) containing only what the caller's role
    may see - members never get financial sheets or other people's hours - and every text cell is
    neutralised against formula injection first. Exporting nothing returns "Nothing to export".
@traces: SE-FR-19, SE-FR-20, UC-14, UC-15
"""

from __future__ import annotations

import io
import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Response, status
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill
from openpyxl.utils import get_column_letter
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.database import get_db, utcnow
from app.core.permissions import ALL_ROLES, MANAGERS, require_project_role
from app.core.sanitizer import clean_text, sanitize_spreadsheet_cell
from app.core.security import get_current_user
from app.models.entities import Expense, Project, ProjectFinancials, SoftDeadline, StageCost, Task, TimeEntry, UserProfile
from app.schemas.dto import (
    CalendarExportRequest,
    CalendarExportResult,
    ProviderLink,
    SheetPayload,
    SheetsExportResult,
    SpreadsheetExportRequest,
)

router = APIRouter(prefix="/api/projects/{project_id}/export", tags=["exports"])

NOTHING_TO_EXPORT = "Nothing to export"
CONSENT_DECLINED = "Export cancelled: calendar access was not authorized, so no data was shared."
EVENT_LENGTH = timedelta(minutes=30)
XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


# ---------------------------------------------------------------------------
# Calendar export (UC-14)
# ---------------------------------------------------------------------------
@dataclass
class Deadline:
    uid: str
    title: str
    starts_at: datetime
    description: str
    category: str


def _safe_filename(name: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "-", name).strip("-")
    return (cleaned or "project")[:60]


def collect_deadlines(db: Session, project: Project, body: CalendarExportRequest) -> list[Deadline]:
    """Only deadlines every project member may already see: project, task due dates, soft deadlines."""
    items: list[Deadline] = []
    if body.include_project_deadline:
        items.append(
            Deadline(
                uid=f"project-{project.id}@projectforge",
                title=f"{project.name} \u2013 project deadline",
                starts_at=project.deadline,
                description=project.description or "Project deadline",
                category="Project deadline",
            )
        )
    if body.include_task_due_dates:
        for task in db.execute(
            select(Task).where(Task.project_id == project.id, Task.due_date.is_not(None)).order_by(Task.due_date)
        ).scalars():
            items.append(
                Deadline(
                    uid=f"task-{task.id}@projectforge",
                    title=f"{task.title} (due)",
                    starts_at=task.due_date,
                    description=f"Task in {project.name}. Status: {task.status.replace('_', ' ')}.",
                    category="Task due date",
                )
            )
    if body.include_soft_deadlines:
        for sd, title in db.execute(
            select(SoftDeadline, Task.title)
            .join(Task, Task.id == SoftDeadline.task_id)
            .where(SoftDeadline.project_id == project.id)
            .order_by(SoftDeadline.due_at)
        ).all():
            items.append(
                Deadline(
                    uid=f"soft-{sd.id}@projectforge",
                    title=f"{sd.title} (soft deadline: {title})",
                    starts_at=sd.due_at,
                    description=f"Soft deadline ({sd.priority} priority) for \u201c{title}\u201d in {project.name}.",
                    category="Soft deadline",
                )
            )
    items.sort(key=lambda d: d.starts_at)
    return items


_ICS_LINE_BREAK = re.compile(r"\r\n|[\r\n\x0b\x0c\x85\u2028\u2029]")


def _ics_escape(text: str) -> str:
    """RFC 5545 section 3.3.11 TEXT escaping, so user text can never start a new property line.

    Order matters: backslash first, then ";" and ",", then every kind of line break (CRLF, a lone CR, a
    lone LF and the Unicode separators some parsers honour) becomes the two characters "\\n". Remaining
    control characters are dropped. A title such as "x\r\nBEGIN:VALARM" therefore stays one SUMMARY
    value: the file never gains a raw CR or LF from user data, so no VALARM, ATTACH or other property
    can be injected.
    """
    text = clean_text(_ICS_LINE_BREAK.sub("\n", text))
    return text.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


def _ics_fold(line: str) -> list[str]:
    """RFC 5545 3.1: lines longer than 75 octets are folded with CRLF + single space."""
    encoded = line.encode("utf-8")
    if len(encoded) <= 75:
        return [line]
    parts: list[str] = []
    current = b""
    limit = 75
    for ch in line:
        b = ch.encode("utf-8")
        if len(current) + len(b) > limit:
            parts.append(current.decode("utf-8"))
            current = b
            limit = 74  # continuation lines start with a space
        else:
            current += b
    parts.append(current.decode("utf-8"))
    return [parts[0]] + [" " + p for p in parts[1:]]


def _ics_time(value: datetime) -> str:
    return value.strftime("%Y%m%dT%H%M%SZ")


def build_ics(project: Project, deadlines: list[Deadline]) -> str:
    stamp = _ics_time(utcnow())
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//eLeet Coderz//ProjectForge//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:{_ics_escape(project.name)} deadlines",
    ]
    for d in deadlines:
        lines += [
            "BEGIN:VEVENT",
            f"UID:{d.uid}",
            f"DTSTAMP:{stamp}",
            f"DTSTART:{_ics_time(d.starts_at)}",
            f"DTEND:{_ics_time(d.starts_at + EVENT_LENGTH)}",
            f"SUMMARY:{_ics_escape(d.title)}",
            f"DESCRIPTION:{_ics_escape(d.description)}",
            f"CATEGORIES:{_ics_escape(d.category)}",
            "TRANSP:TRANSPARENT",
            "BEGIN:VALARM",
            "ACTION:DISPLAY",
            f"DESCRIPTION:{_ics_escape(d.title)}",
            "TRIGGER:-PT1H",
            "END:VALARM",
            "END:VEVENT",
        ]
    lines.append("END:VCALENDAR")
    folded: list[str] = []
    for line in lines:
        folded.extend(_ics_fold(line))
    return "\r\n".join(folded) + "\r\n"


def provider_link(target: str, d: Deadline) -> str:
    end = d.starts_at + EVENT_LENGTH
    if target == "google":
        query = urlencode(
            {
                "action": "TEMPLATE",
                "text": d.title,
                "dates": f"{_ics_time(d.starts_at)}/{_ics_time(end)}",
                "details": d.description,
            }
        )
        return f"https://calendar.google.com/calendar/render?{query}"
    query = urlencode(
        {
            "path": "/calendar/action/compose",
            "rru": "addevent",
            "subject": d.title,
            "startdt": d.starts_at.isoformat(timespec="seconds") + "Z",
            "enddt": end.isoformat(timespec="seconds") + "Z",
            "body": d.description,
        }
    )
    return f"https://outlook.live.com/calendar/0/deeplink/compose?{query}"


def _project(db: Session, project_id: str) -> Project:
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


@router.post("/calendar", response_model=CalendarExportResult)
def export_calendar(
    project_id: str, body: CalendarExportRequest, user: UserProfile = Depends(get_current_user), db: Session = Depends(get_db)
):
    require_project_role(db, user.id, project_id, ALL_ROLES)
    project = _project(db, project_id)
    if body.target in ("google", "outlook") and body.oauth_consent is not True:
        # Declined (or missing) consent: stop before reading or sharing any deadline.
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=CONSENT_DECLINED)
    deadlines = collect_deadlines(db, project, body)
    if not deadlines:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=NOTHING_TO_EXPORT)
    if body.target == "ical":
        content = build_ics(project, deadlines)
        return Response(
            content=content.encode("utf-8"),
            media_type="text/calendar; charset=utf-8",
            headers={
                "Content-Disposition": f'attachment; filename="{_safe_filename(project.name)}-deadlines.ics"',
                "X-Export-Count": str(len(deadlines)),
                "Access-Control-Expose-Headers": "Content-Disposition, X-Export-Count",
            },
        )
    links = [ProviderLink(title=d.title, starts_at=d.starts_at, url=provider_link(body.target, d)) for d in deadlines]
    noun = "deadline" if len(links) == 1 else "deadlines"
    return CalendarExportResult(message=f"{len(links)} {noun} added", count=len(links), provider_links=links)


# ---------------------------------------------------------------------------
# Spreadsheet export (UC-15)
# ---------------------------------------------------------------------------
@dataclass
class Sheet:
    title: str
    header: list[str]
    rows: list[list[Any]] = field(default_factory=list)


class ExportJob:
    """ExportJob from the Class Diagram: gathers role-filtered sheets and generates the file."""

    MEMBER_SECTIONS = ("tasks", "soft_deadlines", "time_entries")
    MANAGER_SECTIONS = ("tasks", "soft_deadlines", "time_entries", "financials", "stage_costs", "expenses")
    FINANCIAL_SECTIONS = {"financials", "stage_costs", "expenses"}

    def __init__(self, db: Session, project: Project, user: UserProfile, role: str, sections: list[str] | None) -> None:
        self.db = db
        self.project = project
        self.user = user
        self.role = role
        allowed = self.MANAGER_SECTIONS if role in MANAGERS else self.MEMBER_SECTIONS
        requested = sections or list(allowed)
        # Financial sections are silently dropped for members - the role filter, not the request, decides.
        self.sections = [s for s in requested if s in allowed]
        self.sheets: list[Sheet] = []

    def collect(self) -> list[Sheet]:
        builders = {
            "tasks": self._tasks,
            "soft_deadlines": self._soft_deadlines,
            "time_entries": self._time_entries,
            "financials": self._financials,
            "stage_costs": self._stage_costs,
            "expenses": self._expenses,
        }
        self.sheets = [builders[s]() for s in dict.fromkeys(self.sections)]
        return self.sheets

    @property
    def record_count(self) -> int:
        return sum(len(s.rows) for s in self.sheets)

    def _tasks(self) -> Sheet:
        sheet = Sheet("Tasks", ["Title", "Status", "Priority", "Assignee", "Due (UTC)", "Tags", "Estimated hours", "Assigned hours"])
        tasks = self.db.execute(
            select(Task).options(joinedload(Task.assignee)).where(Task.project_id == self.project.id).order_by(Task.status, Task.position)
        ).scalars().all()
        for t in tasks:
            sheet.rows.append(
                [
                    t.title,
                    t.status,
                    t.priority,
                    t.assignee.username if t.assignee else "",
                    t.due_date,
                    ", ".join(t.tags or []),
                    t.estimated_hours,
                    t.assigned_hours,
                ]
            )
        return sheet

    def _soft_deadlines(self) -> Sheet:
        sheet = Sheet("Soft deadlines", ["Task", "Soft deadline", "Due (UTC)", "Priority", "Completed"])
        for sd, title in self.db.execute(
            select(SoftDeadline, Task.title)
            .join(Task, Task.id == SoftDeadline.task_id)
            .where(SoftDeadline.project_id == self.project.id)
            .order_by(SoftDeadline.due_at)
        ).all():
            sheet.rows.append([title, sd.title, sd.due_at, sd.priority, "yes" if sd.is_completed else "no"])
        return sheet

    def _time_entries(self) -> Sheet:
        sheet = Sheet("Time entries", ["Person", "Task", "Source", "Started (UTC)", "Ended (UTC)", "Hours", "Note"])
        stmt = (
            select(TimeEntry, Task.title, UserProfile.username)
            .join(Task, Task.id == TimeEntry.task_id)
            .join(UserProfile, UserProfile.id == TimeEntry.user_id)
            .where(TimeEntry.project_id == self.project.id, TimeEntry.ended_at.is_not(None))
        )
        if self.role not in MANAGERS:
            stmt = stmt.where(TimeEntry.user_id == self.user.id)
        for e, title, username in self.db.execute(stmt.order_by(TimeEntry.started_at)).all():
            sheet.rows.append([username, title, e.source, e.started_at, e.ended_at, e.duration_hours, e.note])
        return sheet

    def _financials(self) -> Sheet:
        sheet = Sheet("Bid & budget", ["Currency", "Bid amount", "Budget amount"])
        fin = self.db.get(ProjectFinancials, self.project.id)
        if fin is not None:
            sheet.rows.append([fin.currency, fin.bid_amount, fin.budget_amount])
        return sheet

    def _stage_costs(self) -> Sheet:
        sheet = Sheet("Stage costs", ["Stage", "Amount", "Notes"])
        for s in self.db.execute(
            select(StageCost).where(StageCost.project_id == self.project.id).order_by(StageCost.position)
        ).scalars():
            sheet.rows.append([s.stage_name, s.amount, s.notes])
        return sheet

    def _expenses(self) -> Sheet:
        sheet = Sheet("Expenses", ["Date", "Category", "Description", "Amount"])
        for e in self.db.execute(
            select(Expense).where(Expense.project_id == self.project.id).order_by(Expense.expense_date)
        ).scalars():
            sheet.rows.append([e.expense_date, e.category, e.description, e.amount])
        return sheet

    def generate_file(self) -> bytes:
        """ExportJob.generateFile(): in-memory .xlsx with every string cell sanitized (CWE-1236).

        Every value of every sheet - titles, tags, notes, descriptions, categories, names, headers - goes
        through sanitize_spreadsheet_cell(); there is no code path that appends a row without it.
        """
        workbook = Workbook()
        workbook.remove(workbook.active)
        bold = Font(bold=True, color="FFFFFF")
        fill = PatternFill("solid", fgColor="4F46E5")
        for sheet in self.sheets:
            ws = workbook.create_sheet(title=sheet.title[:31])
            ws.append([sanitize_spreadsheet_cell(h) for h in sheet.header])
            for cell in ws[1]:
                cell.font = bold
                cell.fill = fill
            for row in sheet.rows:
                ws.append([sanitize_spreadsheet_cell(_xlsx_value(v)) for v in row])
                for cell, value in zip(ws[ws.max_row], row):
                    if isinstance(value, Decimal):
                        cell.number_format = "0.00"  # money and hours keep exactly two decimals
            for index, header in enumerate(sheet.header, start=1):
                width = max([len(str(header))] + [len(str(r[index - 1])) for r in sheet.rows if r[index - 1] is not None])
                ws.column_dimensions[get_column_letter(index)].width = min(60, max(10, width + 2))
            ws.freeze_panes = "A2"
        buffer = io.BytesIO()
        workbook.save(buffer)
        return buffer.getvalue()

    def sheets_payload(self) -> list[SheetPayload]:
        """Google Sheets values.update payload, sanitized the same way."""
        return [
            SheetPayload(
                title=s.title,
                values=[[sanitize_spreadsheet_cell(h) for h in s.header]]
                + [[sanitize_spreadsheet_cell(_json_value(v)) for v in row] for row in s.rows],
            )
            for s in self.sheets
        ]


def _xlsx_value(value: Any) -> Any:
    """Decimals are written as exact decimal numbers (openpyxl stores their string form), never as floats."""
    if value is None:
        return ""
    return value


def _json_value(value: Any) -> Any:
    if value is None:
        return ""
    if isinstance(value, Decimal):
        return f"{value:.2f}"
    if isinstance(value, datetime):
        return value.isoformat(timespec="minutes") + "Z"
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return value


@router.post("/spreadsheet", response_model=SheetsExportResult)
def export_spreadsheet(
    project_id: str, body: SpreadsheetExportRequest, user: UserProfile = Depends(get_current_user), db: Session = Depends(get_db)
):
    membership = require_project_role(db, user.id, project_id, ALL_ROLES)
    project = _project(db, project_id)
    job = ExportJob(db, project, user, membership.role, list(body.sections) if body.sections else None)
    job.collect()
    if job.record_count == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=NOTHING_TO_EXPORT)
    if body.target == "excel":
        return Response(
            content=job.generate_file(),
            media_type=XLSX_MIME,
            headers={
                "Content-Disposition": f'attachment; filename="{_safe_filename(project.name)}-export.xlsx"',
                "X-Export-Count": str(job.record_count),
                "Access-Control-Expose-Headers": "Content-Disposition, X-Export-Count",
            },
        )
    return SheetsExportResult(
        message=f"{job.record_count} records ready for Google Sheets",
        count=job.record_count,
        sheets=job.sheets_payload(),
    )
