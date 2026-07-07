import sqlite3
from contextlib import closing
from config import DB_PATH


def init_db():
    with closing(sqlite3.connect(DB_PATH)) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS jobs (
                job_id          TEXT PRIMARY KEY,
                title           TEXT,
                company         TEXT,
                location        TEXT,
                url             TEXT,
                score           INTEGER,
                status          TEXT,
                reasoning       TEXT,
                materials       TEXT,
                posted_date     TEXT,
                is_remote       INTEGER DEFAULT 0,
                visa_sponsorship INTEGER DEFAULT 0,
                source          TEXT,
                seen_at         TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)
        # Migrate existing databases that are missing the new columns
        existing = {
            row[1]
            for row in conn.execute("PRAGMA table_info(jobs)").fetchall()
        }
        for col, definition in [
            ("location",         "TEXT DEFAULT ''"),
            ("posted_date",      "TEXT DEFAULT ''"),
            ("is_remote",        "INTEGER DEFAULT 0"),
            ("visa_sponsorship", "INTEGER DEFAULT 0"),
            ("source",           "TEXT DEFAULT ''"),
        ]:
            if col not in existing:
                conn.execute(f"ALTER TABLE jobs ADD COLUMN {col} {definition}")

        conn.execute("""
            CREATE TABLE IF NOT EXISTS meta (
                key   TEXT PRIMARY KEY,
                value TEXT
            )
        """)
        conn.commit()


def get_meta(key):
    with closing(sqlite3.connect(DB_PATH)) as conn:
        row = conn.execute(
            "SELECT value FROM meta WHERE key = ?", (key,)
        ).fetchone()
        return row[0] if row else None


def set_meta(key, value):
    with closing(sqlite3.connect(DB_PATH)) as conn:
        conn.execute("""
            INSERT INTO meta (key, value) VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET value=excluded.value
        """, (key, value))
        conn.commit()


def already_seen(job_id):
    with closing(sqlite3.connect(DB_PATH)) as conn:
        row = conn.execute(
            "SELECT 1 FROM jobs WHERE job_id = ?", (job_id,)
        ).fetchone()
        return row is not None


def save_result(job, score, status, reasoning="", materials=""):
    with closing(sqlite3.connect(DB_PATH)) as conn:
        conn.execute("""
            INSERT INTO jobs (
                job_id, title, company, location, url,
                score, status, reasoning, materials,
                posted_date, is_remote, visa_sponsorship, source
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(job_id) DO UPDATE SET
                score=excluded.score,
                status=excluded.status,
                reasoning=excluded.reasoning,
                materials=excluded.materials,
                posted_date=excluded.posted_date,
                is_remote=excluded.is_remote,
                visa_sponsorship=excluded.visa_sponsorship,
                source=excluded.source
        """, (
            job["id"],
            job["title"],
            job["company"],
            job.get("location", ""),
            job["url"],
            score,
            status,
            reasoning,
            materials,
            job.get("posted_date", ""),
            1 if job.get("is_remote") else 0,
            1 if job.get("visa_sponsorship") else 0,
            job.get("source", ""),
        ))
        conn.commit()


def get_recent_results(hours=1):
    with closing(sqlite3.connect(DB_PATH)) as conn:
        rows = conn.execute("""
            SELECT title, company, location, url, score, status,
                   reasoning, materials, posted_date, is_remote,
                   visa_sponsorship, source
            FROM jobs
            WHERE seen_at >= datetime('now', ?)
            ORDER BY score DESC
        """, (f"-{hours} hours",)).fetchall()
        cols = [
            "title", "company", "location", "url", "score", "status",
            "reasoning", "materials", "posted_date", "is_remote",
            "visa_sponsorship", "source",
        ]
        return [dict(zip(cols, r)) for r in rows]


def flush_db():
    """Delete all rows from jobs and meta tables. Used to re-score everything fresh."""
    with closing(sqlite3.connect(DB_PATH)) as conn:
        job_count = conn.execute("SELECT COUNT(*) FROM jobs").fetchone()[0]
        conn.execute("DELETE FROM jobs")
        conn.execute("DELETE FROM meta")
        conn.commit()
    print(f"[db] Flushed {job_count} jobs and all meta timestamps. Next run will re-fetch and re-score everything.")
