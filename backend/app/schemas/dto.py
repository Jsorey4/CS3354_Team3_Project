"""
@author: eLeet Coderz (Team 3) - auth/settings: Tyler Gaines; projects/exports: Saaqib Shaik; dashboard:
    Myoram Langwang; tasks/members/comments: Aashwat Singh; soft deadlines: Preethi Seereddy;
    costs/time/reports: Jon Sorey
@description: Defines exactly what each API request may contain and what each response looks like. Bad
    input (a short password, a negative amount, an unknown status, a malformed date) is rejected here with
    a clear field-level message before any database work happens. Money is always an exact Decimal rounded
    half-up to the cent and sent to the browser as a string so no floating-point error can creep in.
@traces: SE-FR-01..SE-FR-30, SE-NFR-01, UC-01..UC-22
"""

from __future__ import annotations

import re
import uuid
from datetime import date, datetime
from decimal import ROUND_HALF_UP, Decimal
from typing import Annotated, Any, Literal

from email_validator import EmailNotValidError, validate_email
from pydantic import AfterValidator, BaseModel, ConfigDict, Field, PlainSerializer, StrictBool, field_validator, model_validator

from app.core.database import to_naive_utc
from app.core.sanitizer import clean_single_line, clean_text, sanitize_markdown
from app.core.security import USERNAME_RE, password_error_message

# ---------------------------------------------------------------------------
# Shared field types
# ---------------------------------------------------------------------------
CENT = Decimal("0.01")


def quantize_money(value: Decimal) -> Decimal:
    """SE-NFR-01: exact decimal, rounded half-up to $0.01."""
    return Decimal(value).quantize(CENT, rounding=ROUND_HALF_UP)


def _iso_z(value: datetime) -> str:
    return to_naive_utc(value).isoformat(timespec="seconds") + "Z"


def _money_str(value: Decimal) -> str:
    return f"{quantize_money(value):.2f}"


def _hours_float(value: Decimal | float | None) -> float | None:
    if value is None:
        return None
    return float(Decimal(str(value)).quantize(CENT, rounding=ROUND_HALF_UP))


UTCDateTimeIn = Annotated[datetime, AfterValidator(to_naive_utc)]
UTCDateTimeOut = Annotated[datetime, PlainSerializer(_iso_z, return_type=str)]
MoneyIn = Annotated[Decimal, Field(ge=0, le=Decimal("9999999999.99")), AfterValidator(quantize_money)]
MoneyOut = Annotated[Decimal, PlainSerializer(_money_str, return_type=str)]
HoursIn = Annotated[Decimal, Field(ge=0, le=Decimal("100000")), AfterValidator(quantize_money)]
HoursOut = Annotated[Decimal | float | None, PlainSerializer(_hours_float, return_type=float | None)]

Role = Literal["owner", "manager", "member"]
ProjectStatus = Literal["planning", "active", "on_hold", "completed", "archived"]
ProjectType = Literal["work", "school", "personal"]
TaskStatus = Literal["todo", "in_progress", "review", "done"]
TaskPriority = Literal["low", "medium", "high", "urgent"]
Theme = Literal["light", "dark"]
ColorBlindMode = Literal["none", "protanopia", "deuteranopia", "tritanopia", "high_contrast"]
SoftDeadlinePriority = Literal["high", "medium", "low"]
ExpenseCategory = Literal["labor", "materials", "software", "equipment", "travel", "services", "other"]

HEX_COLOR_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


def _non_blank(value: str, label: str) -> str:
    """Names and titles: one line, no invisible / control characters (so no CR/LF can reach an export)."""
    value = clean_single_line(value)
    if not value:
        raise ValueError(f"{label} is required")
    return value


def _valid_id(value: str) -> str:
    """Ids are UUIDs. Anything else is rejected here with a 422 instead of reaching the database."""
    try:
        return str(uuid.UUID(value))
    except (ValueError, AttributeError, TypeError) as exc:
        raise ValueError("Not a valid id") from exc


IdStr = Annotated[str, Field(max_length=36), AfterValidator(_valid_id)]
Position = Annotated[int, Field(ge=0, le=100_000)]


def _normalize_email(value: str) -> str:
    try:
        return validate_email(value.strip(), check_deliverability=False).normalized.lower()
    except EmailNotValidError as exc:
        raise ValueError("Enter a valid email address") from exc


def _validate_username(value: str) -> str:
    value = value.strip()
    if not USERNAME_RE.fullmatch(value):
        raise ValueError("Username must be 3-30 characters: letters, numbers or underscores")
    return value


def _validate_password(value: str) -> str:
    message = password_error_message(value)
    if message:
        raise ValueError(message)
    return value


class MessageOut(BaseModel):
    message: str


# ---------------------------------------------------------------------------
# Auth & settings (Tyler Gaines)
# ---------------------------------------------------------------------------
class SignupRequest(BaseModel):
    username: str = Field(max_length=64)
    email: str = Field(max_length=254)
    password: str = Field(max_length=128)
    display_name: str | None = Field(default=None, max_length=80)

    _username = field_validator("username")(lambda cls, v: _validate_username(v))
    _email = field_validator("email")(lambda cls, v: _normalize_email(v))
    _password = field_validator("password")(lambda cls, v: _validate_password(v))
    _display = field_validator("display_name")(lambda cls, v: None if v is None else clean_single_line(v))


class LoginRequest(BaseModel):
    email: str = Field(min_length=1, max_length=254, description="Email address or username")
    password: str = Field(min_length=1, max_length=128)


class NotificationPrefs(BaseModel):
    """profile.html "Notification preferences" (SE-FR-29)."""

    task_assignments: bool = True
    mentions: bool = True
    deadline_reminders: bool = True
    project_updates: bool = False


class NotificationPrefsUpdate(BaseModel):
    """Exactly four optional true / false switches.

    extra="forbid" rejects every other key (including "__proto__" / "constructor" style keys and nested
    objects), and StrictBool rejects "yes", 1, "true" and anything else that merely looks like a boolean,
    so the stored JSON can never grow beyond these four flags.
    """

    model_config = ConfigDict(extra="forbid")

    task_assignments: StrictBool | None = None
    mentions: StrictBool | None = None
    deadline_reminders: StrictBool | None = None
    project_updates: StrictBool | None = None


class ConnectedAccount(BaseModel):
    connected: bool = False
    connected_at: UTCDateTimeOut | None = None


class ConnectedAccounts(BaseModel):
    """profile.html "Connections": consent recorded per one-way export target (SE-FR-19, SE-FR-20)."""

    google_calendar: ConnectedAccount = Field(default_factory=ConnectedAccount)
    outlook: ConnectedAccount = Field(default_factory=ConnectedAccount)
    google_sheets: ConnectedAccount = Field(default_factory=ConnectedAccount)


class ConnectedAccountsUpdate(BaseModel):
    """true connects, false disconnects. Only these three providers; values must be real booleans."""

    model_config = ConfigDict(extra="forbid")

    google_calendar: StrictBool | None = None
    outlook: StrictBool | None = None
    google_sheets: StrictBool | None = None


class UserOut(ORMModel):
    id: str
    username: str
    email: str
    display_name: str
    avatar_url: str | None
    mfa_enabled: bool
    theme: Theme
    color_blind_mode: ColorBlindMode
    default_project_type: ProjectType
    notification_prefs: NotificationPrefs = Field(default_factory=NotificationPrefs)
    connected_accounts: ConnectedAccounts = Field(default_factory=ConnectedAccounts)
    created_at: UTCDateTimeOut

    @field_validator("notification_prefs", mode="before")
    @classmethod
    def _stored_prefs(cls, v: Any) -> Any:
        """Only the known switches, and only real booleans, are ever read back from the JSON column."""
        if not isinstance(v, dict):
            return {}
        return {k: v[k] for k in NotificationPrefs.model_fields if isinstance(v.get(k), bool)}

    @field_validator("connected_accounts", mode="before")
    @classmethod
    def _stored_accounts(cls, v: Any) -> Any:
        if not isinstance(v, dict):
            return {}
        out: dict[str, dict[str, Any]] = {}
        for provider in ConnectedAccounts.model_fields:
            entry = v.get(provider)
            if isinstance(entry, dict) and isinstance(entry.get("connected"), bool):
                stamp = entry.get("connected_at")
                out[provider] = {"connected": entry["connected"], "connected_at": stamp if isinstance(stamp, str) else None}
        return out


class UserBrief(ORMModel):
    id: str
    username: str
    display_name: str
    avatar_url: str | None = None


class LoginResponse(BaseModel):
    mfa_required: bool
    temp_token: str | None = None
    access_token: str | None = None
    token_type: str = "bearer"
    user: UserOut | None = None


class VerifyMfaRequest(BaseModel):
    temp_token: str = Field(min_length=1, max_length=2048)
    code: str = Field(min_length=6, max_length=8)


class UnlockRequest(BaseModel):
    unlock_token: str = Field(min_length=1, max_length=2048)


class ResetPasswordRequest(BaseModel):
    email: str = Field(max_length=254)


class ResetPasswordConfirm(BaseModel):
    token: str = Field(min_length=1, max_length=2048)
    new_password: str = Field(max_length=128)

    _password = field_validator("new_password")(lambda cls, v: _validate_password(v))


class MfaSetupResponse(BaseModel):
    secret: str
    otpauth_uri: str


class MfaCodeRequest(BaseModel):
    code: str = Field(min_length=6, max_length=8)


class DemoSwitchRequest(BaseModel):
    username: str = Field(min_length=3, max_length=30)


class DemoUserOut(BaseModel):
    username: str
    display_name: str
    label: str
    mfa_enabled: bool


class OutboxMessageOut(BaseModel):
    to: str
    subject: str
    body: str
    link: str
    sent_at: str


class ProfileUpdate(BaseModel):
    # Unknown fields (for example "mfa_enabled", "email" or "password_hash") are refused, not ignored.
    model_config = ConfigDict(extra="forbid")

    username: str | None = Field(default=None, max_length=64)
    display_name: str | None = Field(default=None, max_length=80)
    avatar_url: str | None = Field(default=None, max_length=500)
    theme: Theme | None = None
    color_blind_mode: ColorBlindMode | None = None
    default_project_type: ProjectType | None = None
    notification_prefs: NotificationPrefsUpdate | None = None
    connected_accounts: ConnectedAccountsUpdate | None = None

    @field_validator("username")
    @classmethod
    def _check_username(cls, v: str | None) -> str | None:
        return None if v is None else _validate_username(v)

    @field_validator("display_name")
    @classmethod
    def _check_display(cls, v: str | None) -> str | None:
        return None if v is None else clean_single_line(v)

    @field_validator("avatar_url")
    @classmethod
    def _check_avatar(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip()
        if v == "":
            return ""
        # https only: the picture is loaded by every teammate's browser, so plain http would leak that
        # request (and break the HTTPS-only page). One linear character class, no backtracking.
        if not re.match(r"^https://[^\s<>\"'\\]+$", v, re.IGNORECASE):
            raise ValueError("Avatar URL must start with https://")
        return v


# ---------------------------------------------------------------------------
# Projects, cards, progress, calendar (Saaqib Shaik)
# ---------------------------------------------------------------------------
class ProjectCreate(BaseModel):
    name: str = Field(max_length=120)
    description: str = Field(default="", max_length=5000)
    status: ProjectStatus
    project_type: ProjectType
    deadline: UTCDateTimeIn
    members: list[str] = Field(default_factory=list, max_length=500, description="Usernames to add as members")
    card_color: str | None = None

    _name = field_validator("name")(lambda cls, v: _non_blank(v, "Project name"))
    _description = field_validator("description")(lambda cls, v: clean_text(v))

    @field_validator("members")
    @classmethod
    def _dedupe_members(cls, v: list[str]) -> list[str]:
        seen: dict[str, None] = {}
        for raw in v:
            name = raw.strip().lstrip("@")
            if name:
                seen.setdefault(name, None)
        return list(seen)

    @field_validator("card_color")
    @classmethod
    def _color(cls, v: str | None) -> str | None:
        if v is not None and not HEX_COLOR_RE.fullmatch(v):
            raise ValueError("Card color must be a hex value like #6366F1")
        return v.upper() if v else v


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    description: str | None = Field(default=None, max_length=5000)
    status: ProjectStatus | None = None
    project_type: ProjectType | None = None
    deadline: UTCDateTimeIn | None = None

    @field_validator("name")
    @classmethod
    def _name(cls, v: str | None) -> str | None:
        return None if v is None else _non_blank(v, "Project name")

    @field_validator("description")
    @classmethod
    def _description(cls, v: str | None) -> str | None:
        return None if v is None else clean_text(v)


class CardCustomization(BaseModel):
    card_color: str | None = None
    card_order: int | None = Field(default=None, ge=0, le=100000)

    @field_validator("card_color")
    @classmethod
    def _color(cls, v: str | None) -> str | None:
        if v is not None and not HEX_COLOR_RE.fullmatch(v):
            raise ValueError("Card color must be a hex value like #6366F1")
        return v.upper() if v else v


class TaskListOut(ORMModel):
    id: str
    project_id: str
    name: str
    position: int


class MemberOut(BaseModel):
    user_id: str
    username: str
    display_name: str
    email: str
    avatar_url: str | None
    role: Role
    joined_at: UTCDateTimeOut
    open_task_count: int = 0
    task_count: int = 0
    done_task_count: int = 0


class ProjectOut(BaseModel):
    id: str
    name: str
    description: str
    status: ProjectStatus
    project_type: ProjectType
    deadline: UTCDateTimeOut
    created_at: UTCDateTimeOut
    my_role: Role
    card_color: str
    card_order: int
    progress_pct: float
    task_count: int
    done_count: int
    member_count: int
    members_preview: list[UserBrief] = Field(default_factory=list)


class ProjectDetailOut(ProjectOut):
    members: list[MemberOut]
    lists: list[TaskListOut]


class FeatureProgress(BaseModel):
    list_id: str | None
    name: str
    total: int
    done: int
    progress_pct: float


class ProgressOut(BaseModel):
    project_id: str
    overall_progress_pct: float
    total_tasks: int
    done_tasks: int
    feature_progress: list[FeatureProgress]


class CalendarEventOut(BaseModel):
    id: str
    kind: Literal["project_deadline", "task_due", "soft_deadline"]
    title: str
    starts_at: UTCDateTimeOut
    project_id: str
    project_name: str
    task_id: str | None = None
    color: str
    is_completed: bool = False


# ---------------------------------------------------------------------------
# Exports (Saaqib Shaik)
# ---------------------------------------------------------------------------
class CalendarExportRequest(BaseModel):
    target: Literal["ical", "google", "outlook"]
    oauth_consent: bool | None = None
    include_project_deadline: bool = True
    include_task_due_dates: bool = True
    include_soft_deadlines: bool = True


class ProviderLink(BaseModel):
    title: str
    starts_at: UTCDateTimeOut
    url: str


class CalendarExportResult(BaseModel):
    message: str
    count: int
    provider_links: list[ProviderLink]


SpreadsheetSection = Literal["tasks", "soft_deadlines", "time_entries", "financials", "stage_costs", "expenses"]


class SpreadsheetExportRequest(BaseModel):
    target: Literal["excel", "sheets"]
    sections: list[SpreadsheetSection] | None = Field(default=None, max_length=12)


class SheetPayload(BaseModel):
    title: str
    values: list[list[Any]]


class SheetsExportResult(BaseModel):
    message: str
    count: int
    sheets: list[SheetPayload]


# ---------------------------------------------------------------------------
# Dashboard (Myoram Langwang)
# ---------------------------------------------------------------------------
class WidgetOut(ORMModel):
    id: str
    widget_type: str
    title: str = ""
    grid_x: int
    grid_y: int
    width: int
    height: int
    is_hidden: bool


class WidgetCreate(BaseModel):
    widget_type: str = Field(min_length=1, max_length=40)
    grid_x: int | None = Field(default=None, ge=0, le=11)
    grid_y: int | None = Field(default=None, ge=0, le=200)


class WidgetPosition(BaseModel):
    grid_x: int = Field(ge=0, le=11)
    grid_y: int = Field(ge=0, le=200)
    width: int | None = Field(default=None, ge=1, le=12)
    height: int | None = Field(default=None, ge=1, le=12)


class WidgetTypeOut(BaseModel):
    widget_type: str
    title: str
    description: str
    width: int
    height: int


class DashboardOut(BaseModel):
    widgets: list[WidgetOut]
    available_types: list[WidgetTypeOut]
    data: dict[str, Any]
    grid_columns: int
    generated_at: UTCDateTimeOut


# ---------------------------------------------------------------------------
# Tasks, lists, members, comments, notifications (Aashwat Singh)
# ---------------------------------------------------------------------------
def _normalize_tags(tags: list[str]) -> list[str]:
    seen: dict[str, None] = {}
    for raw in tags:
        tag = raw.strip().lower()
        if not tag:
            continue
        if len(tag) > 30:
            raise ValueError("Tags must be 30 characters or fewer")
        if not re.fullmatch(r"[a-z0-9 _\-]+", tag):
            raise ValueError("Tags may only contain letters, numbers, spaces, - and _")
        seen.setdefault(tag, None)
    if len(seen) > 10:
        raise ValueError("A task can have at most 10 tags")
    return list(seen)


class TaskListCreate(BaseModel):
    name: str = Field(max_length=80)
    position: Position | None = None

    _name = field_validator("name")(lambda cls, v: _non_blank(v, "List name"))


class TaskListUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=80)
    position: Position | None = None

    @field_validator("name")
    @classmethod
    def _name(cls, v: str | None) -> str | None:
        return None if v is None else _non_blank(v, "List name")


class TaskCreate(BaseModel):
    title: str = Field(max_length=200)
    description: str = Field(default="", max_length=20000)
    list_id: IdStr | None = None
    status: TaskStatus = "todo"
    priority: TaskPriority = "medium"
    assignee_id: IdStr | None = None
    # UC-18: "Validate required fields (title and due date)". An omitted value is turned into None before
    # validation (see _fill_missing_due), so omitted and null both get the same "Due date is required" error.
    due_date: UTCDateTimeIn | None
    tags: list[str] = Field(default_factory=list, max_length=50)
    estimated_hours: HoursIn | None = None
    assigned_hours: HoursIn | None = None

    _title = field_validator("title")(lambda cls, v: _non_blank(v, "Title"))
    _tags = field_validator("tags")(lambda cls, v: _normalize_tags(v))
    # The description is Markdown shown to every project member, so it gets the same cleaning as comments.
    _description = field_validator("description")(lambda cls, v: sanitize_markdown(v))

    @model_validator(mode="before")
    @classmethod
    def _fill_missing_due(cls, data: Any) -> Any:
        if isinstance(data, dict) and "due_date" not in data:
            return {**data, "due_date": None}
        return data

    @field_validator("due_date")
    @classmethod
    def _due_required(cls, v: datetime | None) -> datetime:
        if v is None:
            raise ValueError("Due date is required")
        return v


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    description: str | None = Field(default=None, max_length=20000)
    list_id: IdStr | None = None
    status: TaskStatus | None = None
    priority: TaskPriority | None = None
    assignee_id: IdStr | None = None
    due_date: UTCDateTimeIn | None = None
    tags: list[str] | None = Field(default=None, max_length=50)
    estimated_hours: HoursIn | None = None
    assigned_hours: HoursIn | None = None

    @field_validator("title")
    @classmethod
    def _title(cls, v: str | None) -> str | None:
        return None if v is None else _non_blank(v, "Title")

    @field_validator("tags")
    @classmethod
    def _tags(cls, v: list[str] | None) -> list[str] | None:
        return None if v is None else _normalize_tags(v)

    @field_validator("description")
    @classmethod
    def _description(cls, v: str | None) -> str | None:
        return None if v is None else sanitize_markdown(v)


class TaskMove(BaseModel):
    """Task.moveTo(list_id, position) - board drag-and-drop."""

    list_id: IdStr | None = None
    status: TaskStatus | None = None
    position: Position


class TaskOut(BaseModel):
    id: str
    project_id: str
    list_id: str | None
    title: str
    description: str
    status: TaskStatus
    priority: TaskPriority
    assignee_id: str | None
    assignee: UserBrief | None
    due_date: UTCDateTimeOut
    position: int
    tags: list[str]
    estimated_hours: HoursOut
    assigned_hours: HoursOut
    actual_hours: HoursOut
    completed_at: UTCDateTimeOut | None
    created_at: UTCDateTimeOut
    updated_at: UTCDateTimeOut
    soft_deadlines_total: int = 0
    soft_deadlines_done: int = 0
    next_soft_deadline_at: UTCDateTimeOut | None = None
    comment_count: int = 0


class TaskDetailOut(TaskOut):
    project_name: str
    my_role: Role
    can_edit: bool
    can_assign: bool


class InviteRequest(BaseModel):
    identifier: str = Field(min_length=1, max_length=254, description="Username or email")
    role: Role = "member"


class RoleChangeRequest(BaseModel):
    role: Role


class RemoveMemberResult(BaseModel):
    removed_user_id: str
    reassigned_task_count: int
    reassigned_to: str | None


class CommentCreate(BaseModel):
    body: str = Field(max_length=10000)


class CommentOut(BaseModel):
    id: str
    task_id: str
    author: UserBrief | None
    body: str
    created_at: UTCDateTimeOut
    can_delete: bool = False


class CommentCreateResult(BaseModel):
    comment: CommentOut
    warnings: list[str]
    notified: list[str]


class NotificationOut(ORMModel):
    id: str
    kind: str
    message: str
    link: str
    is_read: bool
    created_at: UTCDateTimeOut
    project_id: str | None
    task_id: str | None


class NotificationList(BaseModel):
    items: list[NotificationOut]
    unread_count: int


# ---------------------------------------------------------------------------
# Soft deadlines (Preethi Seereddy)
# ---------------------------------------------------------------------------
class SoftDeadlineCreate(BaseModel):
    title: str = Field(max_length=120)
    due_at: UTCDateTimeIn
    priority: SoftDeadlinePriority = "medium"

    _title = field_validator("title")(lambda cls, v: _non_blank(v, "Title"))


class SoftDeadlineUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=120)
    due_at: UTCDateTimeIn | None = None
    priority: SoftDeadlinePriority | None = None

    @field_validator("title")
    @classmethod
    def _title(cls, v: str | None) -> str | None:
        return None if v is None else _non_blank(v, "Title")


class SoftDeadlineComplete(BaseModel):
    is_completed: bool = True


class SoftDeadlineOut(BaseModel):
    id: str
    task_id: str
    project_id: str
    task_title: str
    task_due_date: UTCDateTimeOut | None
    title: str
    due_at: UTCDateTimeOut
    priority: SoftDeadlinePriority
    is_completed: bool
    completed_at: UTCDateTimeOut | None
    state: Literal["upcoming", "due_soon", "overdue", "completed"]
    can_edit: bool = False


# ---------------------------------------------------------------------------
# Costs, time tracking, reports (Jon Sorey)
# ---------------------------------------------------------------------------
class FinancialsUpdate(BaseModel):
    bid_amount: MoneyIn | None = None
    budget_amount: MoneyIn | None = None
    currency: str | None = Field(default=None, pattern=r"^[A-Z]{3}$")


class StageCostCreate(BaseModel):
    stage_name: str = Field(max_length=80)
    amount: MoneyIn
    notes: str = Field(default="", max_length=2000)
    position: Position | None = None

    _name = field_validator("stage_name")(lambda cls, v: _non_blank(v, "Stage name"))
    _notes = field_validator("notes")(lambda cls, v: clean_text(v))


class StageCostUpdate(BaseModel):
    stage_name: str | None = Field(default=None, max_length=80)
    amount: MoneyIn | None = None
    notes: str | None = Field(default=None, max_length=2000)
    position: Position | None = None

    @field_validator("notes")
    @classmethod
    def _notes(cls, v: str | None) -> str | None:
        return None if v is None else clean_text(v)

    @field_validator("stage_name")
    @classmethod
    def _name(cls, v: str | None) -> str | None:
        return None if v is None else _non_blank(v, "Stage name")


class ExpenseCreate(BaseModel):
    category: ExpenseCategory
    description: str = Field(max_length=300)
    amount: MoneyIn
    expense_date: date
    stage_cost_id: IdStr | None = None

    _desc = field_validator("description")(lambda cls, v: _non_blank(v, "Description"))


class ExpenseUpdate(BaseModel):
    category: ExpenseCategory | None = None
    description: str | None = Field(default=None, max_length=300)
    amount: MoneyIn | None = None
    expense_date: date | None = None
    stage_cost_id: IdStr | None = None

    @field_validator("description")
    @classmethod
    def _desc(cls, v: str | None) -> str | None:
        return None if v is None else _non_blank(v, "Description")


class StageCostOut(ORMModel):
    id: str
    stage_name: str
    amount: MoneyOut
    position: int
    notes: str


class ExpenseOut(ORMModel):
    id: str
    category: ExpenseCategory
    description: str
    amount: MoneyOut
    expense_date: date
    stage_cost_id: str | None
    created_at: UTCDateTimeOut


class CostSummaryOut(BaseModel):
    project_id: str
    currency: str
    bid_amount: MoneyOut
    budget_amount: MoneyOut
    stage_costs: list[StageCostOut]
    stage_cost_sum: MoneyOut
    sum_label: Literal["Total", "Subtotal"]
    included_stage_ids: list[str]
    expenses: list[ExpenseOut]
    expense_total: MoneyOut
    expense_count: int
    categories: list[str]


class HoursUpdate(BaseModel):
    estimated_hours: HoursIn | None = None
    assigned_hours: HoursIn | None = None
    actual_hours: Annotated[Decimal, Field(gt=0, le=24), AfterValidator(quantize_money)] | None = None
    work_date: date | None = None
    note: str = Field(default="", max_length=300)

    _note = field_validator("note")(lambda cls, v: clean_single_line(v))


class TaskHoursOut(BaseModel):
    task_id: str
    estimated_hours: HoursOut
    assigned_hours: HoursOut
    actual_hours: HoursOut


class TimerStart(BaseModel):
    task_id: IdStr
    note: str = Field(default="", max_length=300)

    _note = field_validator("note")(lambda cls, v: clean_single_line(v))


class TimerAction(BaseModel):
    entry_id: IdStr | None = None


class TimeEntryOut(BaseModel):
    id: str
    project_id: str
    project_name: str
    task_id: str
    task_title: str
    user_id: str
    username: str
    source: Literal["timer", "manual"]
    started_at: UTCDateTimeOut
    ended_at: UTCDateTimeOut | None
    paused_seconds: int
    is_running: bool
    is_paused: bool
    elapsed_seconds: int
    duration_hours: HoursOut
    note: str


class PerformanceRow(BaseModel):
    user_id: str
    username: str
    display_name: str
    estimated_hours: float
    assigned_hours: float
    actual_hours: float
    efficiency_pct: float | Literal["N/A"]
    tasks_total: int
    tasks_done: int


class PerformanceTotals(BaseModel):
    estimated_hours: float
    assigned_hours: float
    actual_hours: float
    efficiency_pct: float | Literal["N/A"]
    tasks_total: int
    tasks_done: int


class WeeklyHours(BaseModel):
    week_start: date
    actual_hours: float


class WeeklyProgress(BaseModel):
    week_start: date
    completion_pct: float


class CompletionSummary(BaseModel):
    done: int
    total: int
    progress_pct: float


class TaskEfficiency(BaseModel):
    task_id: str
    title: str
    assignee_username: str | None
    estimated_hours: float | None
    actual_hours: float
    efficiency_pct: float | Literal["N/A"]


class PerformanceReport(BaseModel):
    project_id: str
    scope: Literal["team", "self"]
    start_date: date
    end_date: date
    totals: PerformanceTotals
    members: list[PerformanceRow]
    weekly: list[WeeklyHours]
    completion: CompletionSummary
    progress_over_time: list[WeeklyProgress]
    tasks: list[TaskEfficiency]


# ---------------------------------------------------------------------------
# Field-level validation errors raised by routers (e.g. "username already taken")
# ---------------------------------------------------------------------------
class FieldValidationError(Exception):
    """Rendered by main.py as HTTP 422 {"detail": "...", "errors": {field: message}}."""

    def __init__(self, errors: dict[str, str], detail: str = "Please fix the highlighted fields.") -> None:
        super().__init__(detail)
        self.errors = errors
        self.detail = detail
