# mcp-wrapper/storage.py
#
# Wrapper-local SQLite database for MCP-specific features (bookmarks, interviews,
# reminders) that don't belong in the bot's jobs.db.
# This file is owned entirely by the MCP wrapper — bot/ never touches it.

import sqlite3
import os
from contextlib import closing
from datetime import datetime, timezone

WRAPPER_DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "wrapper.db")


def init_wrapper_db():
    """Create wrapper-local tables if they don't exist."""
    with closing(sqlite3.connect(WRAPPER_DB_PATH)) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS bookmarks (
                job_id    TEXT PRIMARY KEY,
                title     TEXT,
                company   TEXT,
                url       TEXT,
                notes     TEXT DEFAULT '',
                saved_at  TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS interviews (
                id        INTEGER PRIMARY KEY AUTOINCREMENT,
                job_id    TEXT,
                company   TEXT,
                role      TEXT,
                datetime  TEXT,
                notes     TEXT DEFAULT '',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS reminders (
                id        INTEGER PRIMARY KEY AUTOINCREMENT,
                message   TEXT,
                due_at    TEXT,
                done      INTEGER DEFAULT 0,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.commit()


def save_bookmark(job_id: str, title: str, company: str, url: str, notes: str = "") -> bool:
    """Save a job to bookmarks. Returns True if new, False if already existed."""
    init_wrapper_db()
    with closing(sqlite3.connect(WRAPPER_DB_PATH)) as conn:
        try:
            conn.execute(
                "INSERT INTO bookmarks (job_id, title, company, url, notes) VALUES (?, ?, ?, ?, ?)",
                (job_id, title, company, url, notes),
            )
            conn.commit()
            return True
        except sqlite3.IntegrityError:
            return False


def remove_bookmark(job_id: str) -> bool:
    """Remove a bookmark. Returns True if deleted, False if not found."""
    init_wrapper_db()
    with closing(sqlite3.connect(WRAPPER_DB_PATH)) as conn:
        cursor = conn.execute("DELETE FROM bookmarks WHERE job_id = ?", (job_id,))
        conn.commit()
        return cursor.rowcount > 0


def get_bookmarks() -> list[dict]:
    """Return all bookmarked jobs."""
    init_wrapper_db()
    with closing(sqlite3.connect(WRAPPER_DB_PATH)) as conn:
        rows = conn.execute(
            "SELECT job_id, title, company, url, notes, saved_at FROM bookmarks ORDER BY saved_at DESC"
        ).fetchall()
        return [
            {"job_id": r[0], "title": r[1], "company": r[2], "url": r[3], "notes": r[4], "saved_at": r[5]}
            for r in rows
        ]


def add_interview(job_id: str, company: str, role: str, dt: str, notes: str = "") -> int:
    """Add an interview. Returns the interview ID."""
    init_wrapper_db()
    with closing(sqlite3.connect(WRAPPER_DB_PATH)) as conn:
        cursor = conn.execute(
            "INSERT INTO interviews (job_id, company, role, datetime, notes) VALUES (?, ?, ?, ?, ?)",
            (job_id, company, role, dt, notes),
        )
        conn.commit()
        return cursor.lastrowid


def get_interviews(upcoming_only: bool = True) -> list[dict]:
    """Return interviews. If upcoming_only, filter to future dates."""
    init_wrapper_db()
    now = datetime.now(tz=timezone.utc).isoformat()
    with closing(sqlite3.connect(WRAPPER_DB_PATH)) as conn:
        if upcoming_only:
            rows = conn.execute(
                "SELECT id, job_id, company, role, datetime, notes FROM interviews WHERE datetime >= ? ORDER BY datetime",
                (now[:10],),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT id, job_id, company, role, datetime, notes FROM interviews ORDER BY datetime DESC"
            ).fetchall()
        return [
            {"id": r[0], "job_id": r[1], "company": r[2], "role": r[3], "datetime": r[4], "notes": r[5]}
            for r in rows
        ]


def add_reminder(message: str, due_at: str) -> int:
    """Add a reminder. Returns the reminder ID."""
    init_wrapper_db()
    with closing(sqlite3.connect(WRAPPER_DB_PATH)) as conn:
        cursor = conn.execute(
            "INSERT INTO reminders (message, due_at) VALUES (?, ?)",
            (message, due_at),
        )
        conn.commit()
        return cursor.lastrowid


def get_reminders(include_done: bool = False) -> list[dict]:
    """Return reminders."""
    init_wrapper_db()
    with closing(sqlite3.connect(WRAPPER_DB_PATH)) as conn:
        if include_done:
            rows = conn.execute(
                "SELECT id, message, due_at, done, created_at FROM reminders ORDER BY due_at"
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT id, message, due_at, done, created_at FROM reminders WHERE done = 0 ORDER BY due_at"
            ).fetchall()
        return [
            {"id": r[0], "message": r[1], "due_at": r[2], "done": bool(r[3]), "created_at": r[4]}
            for r in rows
        ]


def dismiss_reminder(reminder_id: int) -> bool:
    """Mark a reminder as done. Returns True if found."""
    init_wrapper_db()
    with closing(sqlite3.connect(WRAPPER_DB_PATH)) as conn:
        cursor = conn.execute("UPDATE reminders SET done = 1 WHERE id = ?", (reminder_id,))
        conn.commit()
        return cursor.rowcount > 0
