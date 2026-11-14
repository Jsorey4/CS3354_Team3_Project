"""
@author: Tyler Gaines
@description: Sign-up, log-in, two-factor verification, account lockout / unlock and password reset.
    Log-in checks whether the account is locked BEFORE looking at the password, locks it for 30 minutes
    after 5 wrong passwords and emails a single-use unlock link. Every failure message is generic so an
    attacker cannot tell which emails have accounts. Sign-up and log-in are also limited to 5 requests
    per minute per IP address by the middleware in core/security.py.
    Failed attempts are counted with one atomic database UPDATE, so parallel guesses cannot slip past
    the limit. Unlocking and password reset are separate: a reset link changes the password but leaves a
    locked account locked, and an unlock link never touches the password. Both links work once.
@traces: SE-FR-11, SE-NFR-06, UC-08, UC-09, UC-10, UC-11
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db, utcnow
from app.core.realtime import hub
from app.core.security import (
    DEV_OUTBOX,
    TOKEN_MFA,
    TOKEN_RESET,
    TOKEN_UNLOCK,
    create_access_token,
    create_token,
    decode_token,
    generate_mfa_secret,
    get_current_user,
    hash_password,
    jti_matches,
    lockout_expiry,
    mfa_provisioning_uri,
    send_email,
    verify_mfa_code,
    verify_password,
)
from app.models.entities import UserProfile
from app.schemas.dto import (
    DemoSwitchRequest,
    DemoUserOut,
    FieldValidationError,
    LoginRequest,
    LoginResponse,
    MessageOut,
    MfaCodeRequest,
    MfaSetupResponse,
    OutboxMessageOut,
    ResetPasswordConfirm,
    ResetPasswordRequest,
    SignupRequest,
    UnlockRequest,
    UserOut,
    VerifyMfaRequest,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])
settings = get_settings()

INVALID_CREDENTIALS = "Invalid email or password"
LOCKED_MESSAGE = "Account is locked due to multiple failed attempts. Check your email for the unlock link."
RESET_SENT_MESSAGE = "If an account with that email exists, check your inbox for a reset link."
INVALID_RESET = "This reset link is invalid or has expired. Request a new one."
INVALID_UNLOCK = "This unlock link is invalid or has expired."

# Demo role switcher (UC-01 / UC-02 / UC-18 live demonstrations). Only active when DEMO_MODE is true.
DEMO_USERS: dict[str, str] = {"jon": "Owner", "tyler": "Manager", "staff": "Member"}


def _find_user(db: Session, identifier: str, lock: bool = False) -> UserProfile | None:
    """Looks an account up by email or username. With lock=True the row is locked (SELECT ... FOR UPDATE)
    until the request's transaction ends, so two sign-in attempts on one account are checked one after
    the other and both see an up-to-date failure count and lock state."""
    ident = identifier.strip()
    if not ident:
        return None
    stmt = select(UserProfile).where(
        or_(func.lower(UserProfile.email) == ident.lower(), func.lower(UserProfile.username) == ident.lower())
    )
    if lock:
        stmt = stmt.with_for_update()
    return db.execute(stmt).scalars().first()


def _session_response(user: UserProfile) -> LoginResponse:
    return LoginResponse(
        mfa_required=False,
        access_token=create_access_token(user.id, user.password_hash),
        user=UserOut.model_validate(user),
    )


def _register_failure(db: Session, user: UserProfile) -> None:
    """Counts a failed password / code and locks the account at the threshold (UC-09, UC-10).

    The count is incremented by the database in a single UPDATE (not read, added to and written back in
    Python), so concurrent wrong guesses each count. The lock itself is a conditional UPDATE: only the
    request that actually flips the account from unlocked to locked sends the unlock email.
    """
    now = utcnow()
    db.execute(
        update(UserProfile)
        .where(UserProfile.id == user.id)
        .values(failed_login_attempts=UserProfile.failed_login_attempts + 1)
    )
    token, jti = create_token(user.id, TOKEN_UNLOCK, settings.unlock_token_minutes)
    locked_now = db.execute(
        update(UserProfile)
        .where(
            UserProfile.id == user.id,
            UserProfile.failed_login_attempts >= settings.lockout_threshold,
            or_(UserProfile.locked_until.is_(None), UserProfile.locked_until <= now),
        )
        .values(locked_until=lockout_expiry(), unlock_token_jti=jti)
    ).rowcount
    db.commit()
    db.refresh(user)
    if locked_now:
        link = f"{settings.frontend_url}/login?unlock_token={token}"
        send_email(
            user.email,
            "Your ProjectForge account was locked",
            "We locked your account after several failed sign-in attempts. "
            f"Use this single-use link to unlock it: {link}",
            link,
        )


@router.post("/signup", response_model=LoginResponse, status_code=status.HTTP_201_CREATED)
def signup(body: SignupRequest, db: Session = Depends(get_db)) -> LoginResponse:
    """UC-08: create an account with validated username, email and strong password."""
    errors: dict[str, str] = {}
    if db.execute(select(UserProfile.id).where(func.lower(UserProfile.username) == body.username.lower())).first():
        errors["username"] = "That username is already taken"
    if db.execute(select(UserProfile.id).where(func.lower(UserProfile.email) == body.email.lower())).first():
        errors["email"] = "An account with that email already exists"
    if errors:
        raise FieldValidationError(errors)
    user = UserProfile(
        username=body.username,
        email=body.email,
        display_name=(body.display_name or body.username).strip() or body.username,
        password_hash=hash_password(body.password),
        theme="dark",
        color_blind_mode="none",
        default_project_type="work",
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        # Two sign-ups raced for the same name / email; the unique indexes let exactly one through.
        db.rollback()
        raise FieldValidationError({"username": "That username or email was just taken. Try another."}) from None
    db.refresh(user)
    return _session_response(user)


@router.post("/login", response_model=LoginResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)) -> LoginResponse:
    """UC-09: lockout check first, then password, then optional 2FA step."""
    user = _find_user(db, body.email, lock=True)
    now = utcnow()

    if user is not None:
        if user.is_locked(now):
            raise HTTPException(status_code=status.HTTP_423_LOCKED, detail=LOCKED_MESSAGE)
        if user.locked_until is not None and user.locked_until <= now:
            # The 30-minute lock has expired: start counting from zero again.
            user.locked_until = None
            user.failed_login_attempts = 0
            user.unlock_token_jti = None
            db.flush()  # written now (still inside the locked transaction) so the counter below starts at 0

    if user is None or not verify_password(body.password, user.password_hash if user else None):
        if user is not None:
            _register_failure(db, user)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=INVALID_CREDENTIALS)

    user.failed_login_attempts = 0
    user.locked_until = None
    user.unlock_token_jti = None
    db.commit()

    if user.mfa_enabled:
        temp_token, _ = create_token(user.id, TOKEN_MFA, settings.mfa_token_minutes)
        return LoginResponse(mfa_required=True, temp_token=temp_token)
    return _session_response(user)


@router.post("/verify-mfa", response_model=LoginResponse)
def verify_mfa(body: VerifyMfaRequest, db: Session = Depends(get_db)) -> LoginResponse:
    """SE-FR-11: second login step - a 6-digit TOTP code (or the demo code 123456 in demo mode)."""
    payload = decode_token(body.temp_token, TOKEN_MFA)
    if payload is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Your sign-in session expired. Sign in again.")
    user = db.get(UserProfile, payload["sub"], with_for_update=True)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Your sign-in session expired. Sign in again.")
    if user.is_locked(utcnow()):
        raise HTTPException(status_code=status.HTTP_423_LOCKED, detail=LOCKED_MESSAGE)
    if not verify_mfa_code(user.mfa_secret, body.code):
        _register_failure(db, user)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid verification code")
    user.failed_login_attempts = 0
    db.commit()
    return _session_response(user)


@router.post("/unlock", response_model=MessageOut)
def unlock_account(body: UnlockRequest, db: Session = Depends(get_db)) -> MessageOut:
    """User.unlockAccount(token): single-use, signed, expiring unlock link (UC-10). Never changes the password."""
    payload = decode_token(body.unlock_token, TOKEN_UNLOCK)
    user = db.get(UserProfile, payload["sub"]) if payload else None
    if user is None or not jti_matches(user.unlock_token_jti, payload.get("jti") if payload else None):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=INVALID_UNLOCK)
    user.failed_login_attempts = 0
    user.locked_until = None
    user.unlock_token_jti = None
    db.commit()
    return MessageOut(message="Your account is unlocked. You can sign in now.")


@router.post("/reset-password/request", response_model=MessageOut)
def request_password_reset(body: ResetPasswordRequest, db: Session = Depends(get_db)) -> MessageOut:
    """UC-11: always the same 200 answer so nobody can discover which emails are registered."""
    email = body.email.strip().lower()
    user = db.execute(select(UserProfile).where(func.lower(UserProfile.email) == email)).scalar_one_or_none()
    if user is not None:
        token, jti = create_token(user.id, TOKEN_RESET, settings.reset_token_minutes)
        user.reset_token_jti = jti
        db.commit()
        link = f"{settings.frontend_url}/reset-password?token={token}"
        send_email(
            user.email,
            "Reset your ProjectForge password",
            f"Use this link within {settings.reset_token_minutes} minutes to choose a new password: {link}",
            link,
        )
    return MessageOut(message=RESET_SENT_MESSAGE)


@router.post("/reset-password/confirm", response_model=MessageOut)
def confirm_password_reset(body: ResetPasswordConfirm, db: Session = Depends(get_db)) -> MessageOut:
    payload = decode_token(body.token, TOKEN_RESET)
    user = db.get(UserProfile, payload["sub"]) if payload else None
    if user is None or not jti_matches(user.reset_token_jti, payload.get("jti") if payload else None):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=INVALID_RESET)
    # UC-11: "Password reset is separate from account unlocking". Only the password and the used link
    # change here; failed_login_attempts, locked_until and the unlock link are deliberately left alone, so
    # a locked account stays locked until its unlock link is used or the lock expires.
    user.password_hash = hash_password(body.new_password)
    user.reset_token_jti = None
    db.commit()
    # The new password hash invalidates every earlier session token; drop their live connections too.
    hub.close_user(user.id)
    return MessageOut(message="Your password was updated. Sign in with your new password.")


@router.get("/me", response_model=UserOut)
def me(user: UserProfile = Depends(get_current_user)) -> UserOut:
    return UserOut.model_validate(user)


@router.post("/mfa/setup", response_model=MfaSetupResponse)
def mfa_setup(user: UserProfile = Depends(get_current_user), db: Session = Depends(get_db)) -> MfaSetupResponse:
    """SE-FR-11: create a new authenticator secret (not active until confirmed with a code)."""
    if user.mfa_enabled:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Two-factor authentication is already on")
    secret = generate_mfa_secret()
    user.mfa_secret = secret
    db.commit()
    return MfaSetupResponse(secret=secret, otpauth_uri=mfa_provisioning_uri(secret, user.email))


@router.post("/mfa/enable", response_model=UserOut)
def mfa_enable(
    body: MfaCodeRequest, user: UserProfile = Depends(get_current_user), db: Session = Depends(get_db)
) -> UserOut:
    if not user.mfa_secret:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Start two-factor setup first")
    if not verify_mfa_code(user.mfa_secret, body.code):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid verification code")
    user.mfa_enabled = True
    db.commit()
    return UserOut.model_validate(user)


@router.post("/mfa/disable", response_model=UserOut)
def mfa_disable(
    body: MfaCodeRequest, user: UserProfile = Depends(get_current_user), db: Session = Depends(get_db)
) -> UserOut:
    if not user.mfa_enabled:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Two-factor authentication is already off")
    if not verify_mfa_code(user.mfa_secret, body.code):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid verification code")
    user.mfa_enabled = False
    user.mfa_secret = None
    db.commit()
    return UserOut.model_validate(user)


# ---------------------------------------------------------------------------
# Demo-mode helpers (disabled when DEMO_MODE=false)
# ---------------------------------------------------------------------------
def _require_demo() -> None:
    if not settings.demo_mode:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")


@router.get("/demo-users", response_model=list[DemoUserOut])
def demo_users(db: Session = Depends(get_db)) -> list[DemoUserOut]:
    _require_demo()
    users = db.execute(select(UserProfile).where(UserProfile.username.in_(list(DEMO_USERS)))).scalars().all()
    by_name = {u.username: u for u in users}
    return [
        DemoUserOut(
            username=name,
            display_name=by_name[name].display_name,
            label=label,
            mfa_enabled=by_name[name].mfa_enabled,
        )
        for name, label in DEMO_USERS.items()
        if name in by_name
    ]


@router.post("/demo-switch", response_model=LoginResponse)
def demo_switch(body: DemoSwitchRequest, db: Session = Depends(get_db)) -> LoginResponse:
    """One-click presenter switch between the seeded Owner / Manager / Member accounts."""
    _require_demo()
    if body.username not in DEMO_USERS:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only seeded demo accounts can be switched to")
    user = db.execute(select(UserProfile).where(UserProfile.username == body.username)).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Demo user not found")
    return _session_response(user)


@router.get("/dev-outbox", response_model=list[OutboxMessageOut])
def dev_outbox() -> list[OutboxMessageOut]:
    """Demo stand-in for an email inbox so reset / unlock links can be shown in class."""
    _require_demo()
    return [OutboxMessageOut(**vars(m)) for m in list(DEV_OUTBOX)]
