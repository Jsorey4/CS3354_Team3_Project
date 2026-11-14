"""
@author: Tyler Gaines
@description: Lets a signed-in user view and change their own profile and preferences: username, display
    name, avatar picture link, light / dark theme, color-blindness palette, the default project type
    (work, school or personal), which notifications they receive, and which export targets (Google
    Calendar, Outlook, Google Sheets) they have connected. Everything is stored on their own profile row.
@traces: SE-FR-12, SE-FR-13, SE-FR-14, SE-FR-15, SE-FR-19, SE-FR-20, SE-FR-29, UC-14, UC-15, UC-22
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db, utcnow
from app.core.security import get_current_user
from app.models.entities import CONNECTED_PROVIDERS, DEFAULT_NOTIFICATION_PREFS, UserProfile
from app.schemas.dto import FieldValidationError, ProfileUpdate, UserOut

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("/profile", response_model=UserOut)
def get_profile(user: UserProfile = Depends(get_current_user)) -> UserOut:
    return UserOut.model_validate(user)


@router.put("/profile", response_model=UserOut)
def update_profile(
    body: ProfileUpdate, user: UserProfile = Depends(get_current_user), db: Session = Depends(get_db)
) -> UserOut:
    if body.username is not None and body.username.lower() != user.username.lower():
        taken = db.execute(
            select(UserProfile.id).where(
                func.lower(UserProfile.username) == body.username.lower(), UserProfile.id != user.id
            )
        ).first()
        if taken:
            raise FieldValidationError({"username": "That username is already taken"})
    if body.username is not None:
        user.username = body.username
    if body.display_name is not None:
        user.display_name = body.display_name or user.username
    if body.avatar_url is not None:
        user.avatar_url = body.avatar_url or None
    if body.theme is not None:
        user.theme = body.theme
    if body.color_blind_mode is not None:
        user.color_blind_mode = body.color_blind_mode
    if body.default_project_type is not None:
        user.default_project_type = body.default_project_type
    if body.notification_prefs is not None:
        changes = body.notification_prefs.model_dump(exclude_none=True)
        stored = user.notification_prefs if isinstance(user.notification_prefs, dict) else {}
        # The saved object is rebuilt from the four known switches every time, so it can never carry an
        # unexpected key or a non-boolean value, whatever was in the column before. (A new dict is also
        # what makes SQLAlchemy notice the change: JSON columns are not mutation-tracked.)
        user.notification_prefs = {
            key: changes[key] if key in changes else (stored[key] if isinstance(stored.get(key), bool) else default)
            for key, default in DEFAULT_NOTIFICATION_PREFS.items()
        }
    if body.connected_accounts is not None:
        changes = body.connected_accounts.model_dump(exclude_none=True)
        stored = user.connected_accounts if isinstance(user.connected_accounts, dict) else {}
        accounts: dict[str, dict] = {}
        for provider in CONNECTED_PROVIDERS:
            if provider in changes:
                connected = changes[provider]
                accounts[provider] = {"connected": connected, "connected_at": utcnow().isoformat() if connected else None}
            else:
                entry = stored.get(provider)
                if isinstance(entry, dict) and isinstance(entry.get("connected"), bool):
                    stamp = entry.get("connected_at")
                    accounts[provider] = {"connected": entry["connected"], "connected_at": stamp if isinstance(stamp, str) else None}
        user.connected_accounts = accounts
    db.commit()
    db.refresh(user)
    return UserOut.model_validate(user)
