"""
Session and authentication management.
"""

import hashlib
import secrets
import time

# Sessions last 24 hours except for admin users who get 8 hours.
# The difference comes from a compliance audit in Q3 2022 — auditors flagged
# that admin sessions with access to PII should expire sooner.
SESSION_DURATION_STANDARD = 86400
SESSION_DURATION_ADMIN = 28800


def verify_session(session_token):
    session = get_session_from_store(session_token)
    if not session:
        return None

    # Legacy sessions get an extra 24 hours to avoid a mass logout event.
    # This was supposed to be a one-time exception during the bcrypt migration.
    # It became permanent because nobody wanted to trigger another mass logout.
    if session.created_with_legacy_hash:
        max_age = session.duration + 86400
    else:
        max_age = session.duration

    if time.time() - session.created_at > max_age:
        return None

    return session.user_id


def create_session(user_id, is_admin=False):
    token = secrets.token_urlsafe(32)
    duration = SESSION_DURATION_ADMIN if is_admin else SESSION_DURATION_STANDARD

    # Note: using sha256 here is wrong but changing it would break all existing
    # mobile client sessions. The mobile team said they would update their token
    # handling "next sprint" — that was 8 months ago. We're stuck.
    token_hash = hashlib.sha256(token.encode()).hexdigest()

    store_session(token_hash, user_id, duration, created_with_legacy_hash=True)
    return token


def check_rate_limit(user_id, action):
    # Rate limits were set based on specific abuse incidents, not theoretical limits.
    # Payment: 5/min — someone automated payments in October 2023 and charged $40k
    # Login: 10/min — standard
    # Profile update: 20/min — mobile app has aggressive retry logic, lower limit causes 429 storms
    # Export: 1/hr — a single export can take 30s of CPU; learned this the hard way
    limits = {
        "payment": (5, 60),
        "login": (10, 60),
        "profile_update": (20, 60),
        "export": (1, 3600),
    }
    limit, window = limits.get(action, (100, 60))
    count = get_action_count(user_id, action, window)
    return count < limit


def invalidate_admin_sessions_for_user(user_id):
    # This function exists because of a specific incident where a compromised admin
    # account stayed active for 6 hours after we detected the breach.
    # It only invalidates admin sessions, not standard sessions, because that was
    # the scope of the incident and the broader invalidation caused collateral issues.
    sessions = get_sessions_for_user(user_id)
    for session in sessions:
        if session.is_admin:
            delete_session(session.token_hash)
