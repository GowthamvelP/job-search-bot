"""
Job search bot — orchestrator.

Pipeline:
  1. fetch_new_postings()  — scrape jobs from all sources, filtered by date/location/visa
  2. Deduplicate against jobs.db
  3. Score each new job against the resume via Gemini (with visa/remote signals)
  4. For jobs at/above SCORE_THRESHOLD, generate tailored resume bullets + cover letter
  5. Persist everything to jobs.db
  6. Send an email digest with inline summary + CSV attachment
"""

import csv
import io
import json
import smtplib
import time
from datetime import datetime, timezone
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email import encoders

from dotenv import load_dotenv
load_dotenv()

from google import genai

from config import (
    GEMINI_API_KEY, GEMINI_MODELS,
    RESUME_PATH, SCORE_THRESHOLD,
    EMAIL_TO, EMAIL_FROM, EMAIL_APP_PASSWORD,
    POSTED_WITHIN_DAYS,
    CANDIDATE_LOCATION, CANDIDATE_SUMMARY, CANDIDATE_SENIORITY,
)
from db import init_db, already_seen, save_result
from discovery import fetch_new_postings


# ---------------------------------------------------------------------------
# Resume (loaded once at startup)
# ---------------------------------------------------------------------------

with open(RESUME_PATH, "r") as f:
    RESUME = f.read()


# ---------------------------------------------------------------------------
# Gemini helper
# ---------------------------------------------------------------------------

class QuotaExhaustedError(Exception):
    """Raised when ALL Gemini model quotas are exhausted for the day."""
    pass


def _gemini(prompt: str) -> str:
    """Call Gemini, cascading through all models in GEMINI_MODELS.
    - On 503 (server overload): retry same model up to 3 times.
    - On 429 (quota exhausted): move to next model in the list.
    - If all models are exhausted: raise QuotaExhaustedError.
    """
    client = genai.Client(api_key=GEMINI_API_KEY)

    for model in GEMINI_MODELS:
        for attempt in range(3):
            try:
                response = client.models.generate_content(model=model, contents=prompt)
                return response.text.strip()
            except Exception as e:
                err = str(e)
                if "429" in err or "RESOURCE_EXHAUSTED" in err:
                    print(f"  [{model}] quota exhausted, trying next model...")
                    break  # try next model
                elif "503" in err or "UNAVAILABLE" in err:
                    wait = 10 * (attempt + 1)
                    print(f"  [{model}] 503, retrying in {wait}s (attempt {attempt + 1}/3)...")
                    time.sleep(wait)
                else:
                    raise
        else:
            # All 3 retries failed with 503 for this model — try next
            continue
        # Broke out of retry loop due to 429 — try next model
        continue

    raise QuotaExhaustedError(
        f"All Gemini models exhausted for today. Tried: {', '.join(GEMINI_MODELS)}. "
        "Remaining jobs will be scored on next run after quota resets."
    )


# ---------------------------------------------------------------------------
# Scoring and material generation
# ---------------------------------------------------------------------------

def score_job(job: dict) -> tuple[int, str]:
    """Score a job 0-100 against the resume. Returns (score, reasoning).

    The prompt explicitly mentions visa/remote context so Gemini can factor
    eligibility into the score rather than surface irrelevant roles.
    """
    # Build eligibility context line
    if job.get("is_remote"):
        eligibility = f"This is a REMOTE role. Candidate is based in {CANDIDATE_LOCATION} — only roles that explicitly accept that timezone are relevant."
    elif job.get("visa_sponsorship"):
        eligibility = "This role is outside the candidate's country but VISA SPONSORSHIP is mentioned — international relocation is feasible."
    else:
        eligibility = f"This role appears to be in or near {CANDIDATE_LOCATION}, or has no location restriction."

    prompt = f"""You are a career advisor evaluating a job posting for a candidate.

CANDIDATE CONTEXT:
- {CANDIDATE_SUMMARY}
- Based in: {CANDIDATE_LOCATION}
- Seniority: {CANDIDATE_SENIORITY}
- Open to: local roles, remote roles accepting their timezone, international roles with visa sponsorship
- {eligibility}

RESUME:
{RESUME}

JOB POSTING:
Title: {job['title']}
Company: {job['company']}
Location: {job.get('location', 'Not specified')}
Posted: {job.get('posted_date', 'Unknown')}
Remote: {'Yes' if job.get('is_remote') else 'No'}
Visa Sponsorship: {'Mentioned' if job.get('visa_sponsorship') else 'Not mentioned'}
URL: {job['url']}
Description:
{job.get('text', '(no description available)')}

Score this job 0-100 for fit. Consider: title alignment, tech stack overlap (prioritise primary skills),
seniority level match (penalise roles clearly below {CANDIDATE_SENIORITY} seniority),
location eligibility, and remote/visa feasibility for a candidate in {CANDIDATE_LOCATION}.
Penalise heavily if the role is international with no visa sponsorship and not remote-friendly for the candidate's timezone.

Respond with valid JSON only — no markdown, no explanation outside the JSON:
{{"score": <integer 0-100>, "reasoning": "<2-3 sentence summary including location/visa eligibility>"}}"""

    raw = _gemini(prompt)
    raw = raw.strip().lstrip("```json").lstrip("```").rstrip("```").strip()
    data = json.loads(raw)
    return int(data["score"]), data["reasoning"]


def generate_materials(job: dict) -> str:
    """Generate tailored resume bullets and a cover letter for a strong-match job."""
    prompt = f"""You are a career advisor helping a candidate apply for a job.

RESUME:
{RESUME}

JOB POSTING:
Title: {job['title']}
Company: {job['company']}
Location: {job.get('location', 'Not specified')}
URL: {job['url']}
Description:
{job.get('text', '(no description available)')}

Write two things:
1. 3-5 tailored resume bullet points highlighting the candidate's most relevant experience for this role.
2. A concise, personalised cover letter (3 short paragraphs).

Format with clear headings:
## Resume Bullets
<bullets>

## Cover Letter
<cover letter>"""

    return _gemini(prompt)


# ---------------------------------------------------------------------------
# CSV generation
# ---------------------------------------------------------------------------

def _build_csv(results: list[dict]) -> str:
    """Return a CSV string of all processed jobs, sorted by score descending."""
    output = io.StringIO()
    fieldnames = [
        "Score", "Title", "Company", "Location", "Remote",
        "Visa Sponsorship", "Posted Date", "Source", "Status",
        "Apply URL", "Reasoning",
    ]
    writer = csv.DictWriter(output, fieldnames=fieldnames, quoting=csv.QUOTE_ALL)
    writer.writeheader()
    for r in sorted(results, key=lambda x: x["score"], reverse=True):
        writer.writerow({
            "Score":            r["score"],
            "Title":            r["title"],
            "Company":          r["company"],
            "Location":         r.get("location", ""),
            "Remote":           "Yes" if r.get("is_remote") else "No",
            "Visa Sponsorship": "Yes" if r.get("visa_sponsorship") else "No",
            "Posted Date":      r.get("posted_date", ""),
            "Source":           r.get("source", ""),
            "Status":           r["status"],
            "Apply URL":        r["url"],
            "Reasoning":        r.get("reasoning", ""),
        })
    return output.getvalue()


# ---------------------------------------------------------------------------
# Email
# ---------------------------------------------------------------------------

def _build_email_body(results: list[dict], crawled_at: str) -> str:
    """Clean summary note — no job detail blocks, no materials inline.
    The full listing is in the attached CSV."""
    strong  = [r for r in results if r["status"] == "strong_match"]
    others  = [r for r in results if r["status"] == "below_threshold"]
    errors  = [r for r in results if r["status"] not in ("strong_match", "below_threshold")]

    lines = [
        f"Hi,",
        f"",
        f"Your automated job search ran at {crawled_at} (UTC) and found "
        f"{len(results)} new role(s) posted in the last {POSTED_WITHIN_DAYS} day(s).",
        f"",
        f"  Strong matches (score ≥ {SCORE_THRESHOLD}) : {len(strong)}",
        f"  Below threshold                            : {len(others)}",
    ]
    if errors:
        lines.append(f"  Scoring errors                             : {len(errors)}")

    lines += [
        f"",
        f"The full listing — including scores, locations, remote/visa flags, "
        f"apply links, and tailored materials for strong matches — is attached "
        f"as jobs_digest.csv. Open it in Excel or Google Sheets.",
        f"",
        f"Search window  : last {POSTED_WITHIN_DAYS} day(s)",
        f"Sources        : LinkedIn, Indeed, Glassdoor, Naukri, JSearch",
        f"Filters applied: India-based, remote (India timezone), "
        f"or international with visa sponsorship",
        f"",
        f"— Job Search Bot",
    ]
    return "\n".join(lines)


def send_digest(results: list[dict]) -> None:
    """Send a brief summary email with the full CSV attached.
    Skips gracefully if credentials are missing."""
    if not EMAIL_FROM or not EMAIL_APP_PASSWORD:
        print("Email credentials not set — skipping digest email.")
        return

    crawled_at   = datetime.now(tz=timezone.utc).strftime("%Y-%m-%d %H:%M")
    strong_count = sum(1 for r in results if r["score"] >= SCORE_THRESHOLD)
    subject      = (
        f"[Job Digest] {strong_count} strong match(es) of {len(results)} new role(s) "
        f"— crawled {crawled_at} UTC"
    )

    msg = MIMEMultipart("mixed")
    msg["Subject"] = subject
    msg["From"]    = EMAIL_FROM
    msg["To"]      = EMAIL_TO

    msg.attach(MIMEText(_build_email_body(results, crawled_at), "plain"))

    csv_data   = _build_csv(results)
    attachment = MIMEBase("text", "csv")
    attachment.set_payload(csv_data.encode("utf-8"))
    encoders.encode_base64(attachment)
    attachment.add_header(
        "Content-Disposition", "attachment", filename="jobs_digest.csv"
    )
    msg.attach(attachment)

    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
        server.login(EMAIL_FROM, EMAIL_APP_PASSWORD)
        server.sendmail(EMAIL_FROM, EMAIL_TO, msg.as_string())

    print(f"Digest sent to {EMAIL_TO} ({len(results)} jobs, {strong_count} strong match(es)).")


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------

def run():
    init_db()

    print(f"Fetching jobs posted in the last {POSTED_WITHIN_DAYS} day(s)...")
    postings = fetch_new_postings()
    print(f"  {len(postings)} keyword/location-matching postings fetched.")

    new_jobs = [j for j in postings if not already_seen(j["id"])]
    print(f"  {len(new_jobs)} not yet seen in the database.")

    processed = []
    quota_exhausted = False
    for job in new_jobs:
        if quota_exhausted:
            break
        remote_tag = " [remote]" if job.get("is_remote") else ""
        print(f"\nScoring: {job['title']} @ {job['company']}{remote_tag}")
        try:
            score, reasoning = score_job(job)
        except QuotaExhaustedError:
            print("\n  *** Gemini daily quota exhausted — stopping scoring for this run.")
            print("  Jobs scored so far will still be emailed. Remaining jobs will be scored next run.")
            quota_exhausted = True
            break
        except Exception as e:
            print(f"  Scoring failed: {e}")
            save_result(job, score=0, status="score_error", reasoning=str(e))
            continue

        print(f"  Score: {score}/100")

        if score >= SCORE_THRESHOLD:
            print("  Strong match — generating tailored materials...")
            try:
                materials = generate_materials(job)
                status = "strong_match"
            except Exception as e:
                print(f"  Material generation failed: {e}")
                materials = ""
                status = "materials_error"
        else:
            materials = ""
            status = "below_threshold"

        save_result(job, score=score, status=status,
                    reasoning=reasoning, materials=materials)
        processed.append({
            **job,
            "score":     score,
            "status":    status,
            "reasoning": reasoning,
            "materials": materials,
        })

    print(f"\nRun complete. Processed {len(processed)} new job(s).")

    processed.sort(key=lambda r: r["score"], reverse=True)
    if processed:
        try:
            send_digest(processed)
        except Exception as e:
            print(f"Failed to send digest email: {e}")
    else:
        print("Nothing new to email.")


if __name__ == "__main__":
    run()
