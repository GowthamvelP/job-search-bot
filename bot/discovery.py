from datetime import datetime, timedelta, timezone
import requests
from config import (
    GREENHOUSE_COMPANIES, LEVER_COMPANIES, KEYWORDS,
    JSEARCH_API_KEY, JSEARCH_ENABLED, JSEARCH_QUERIES, JSEARCH_INTERVAL_HOURS,
    APIFY_API_KEY, APIFY_SEARCH_TERMS, APIFY_JOB_BOARDS,
    APIFY_MAX_RESULTS, APIFY_INTERVAL_HOURS,
    POSTED_WITHIN_DAYS,
    FILTER_INTERNATIONAL, TARGET_COUNTRY,
    VISA_SPONSORSHIP_PHRASES, INDIA_REMOTE_PHRASES,
)
from db import get_meta, set_meta


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def _cutoff_dt() -> datetime:
    """UTC datetime before which jobs are considered too old."""
    return datetime.now(tz=timezone.utc) - timedelta(days=POSTED_WITHIN_DAYS)


def _parse_date(raw) -> str:
    """Normalise various date formats to ISO-8601 date string (YYYY-MM-DD) or ''."""
    if not raw:
        return ""
    if isinstance(raw, (int, float)):
        ts = raw / 1000 if raw > 1e10 else raw
        try:
            return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d")
        except Exception:
            return ""
    s = str(raw).strip()
    for fmt in ("%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%dT%H:%M:%SZ",
                "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(s[:19], fmt[:len(s[:19])]).strftime("%Y-%m-%d")
        except Exception:
            continue
    return s[:10]


def _is_within_cutoff(posted_date: str) -> bool:
    """Return True if posted_date is within POSTED_WITHIN_DAYS, or unknown."""
    if not posted_date:
        return True
    try:
        dt = datetime.strptime(posted_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        return dt >= _cutoff_dt()
    except Exception:
        return True


def _detect_visa_sponsorship(text: str) -> bool:
    t = text.lower()
    return any(phrase in t for phrase in VISA_SPONSORSHIP_PHRASES)


def _detect_india_remote(text: str) -> bool:
    t = text.lower()
    return any(phrase in t for phrase in INDIA_REMOTE_PHRASES)


def _passes_location_filter(job: dict) -> bool:
    """Apply India / visa / remote-friendly rules when FILTER_INTERNATIONAL is True."""
    if not FILTER_INTERNATIONAL:
        return True

    location = (job.get("location") or "").lower()
    text = (job.get("text") or "").lower()
    is_remote = job.get("is_remote", False)
    target = TARGET_COUNTRY.lower()

    if target in location:
        return True
    if not location:
        return True
    if is_remote or "remote" in location:
        return _detect_india_remote(text) or _detect_india_remote(location)
    return _detect_visa_sponsorship(text)


def _matches_keywords(job: dict) -> bool:
    if not KEYWORDS:
        return True
    haystack = (job["title"] + " " + job.get("text", "")).lower()
    return any(k.lower() in haystack for k in KEYWORDS)


def _sort_by_date(jobs: list) -> list:
    """Sort jobs most-recent first. Jobs with no date sort to the end."""
    def _key(j):
        d = j.get("posted_date", "")
        return d if d else "0000-00-00"
    return sorted(jobs, key=_key, reverse=True)


# ---------------------------------------------------------------------------
# Source: Greenhouse (unlimited, free, runs every time)
# ---------------------------------------------------------------------------

def fetch_greenhouse(company: str) -> list:
    url = f"https://boards-api.greenhouse.io/v1/boards/{company}/jobs?content=true"
    resp = requests.get(url, timeout=15)
    resp.raise_for_status()
    jobs = []
    for j in resp.json().get("jobs", []):
        posted_date = _parse_date(j.get("updated_at") or j.get("first_published") or "")
        jobs.append({
            "id":          f"gh_{company}_{j['id']}",
            "title":       j["title"],
            "company":     company,
            "location":    j.get("location", {}).get("name", "") if isinstance(j.get("location"), dict) else "",
            "url":         j["absolute_url"],
            "text":        j.get("content", ""),
            "posted_date": posted_date,
            "is_remote":   "remote" in j["title"].lower(),
            "visa_sponsorship": False,
            "source":      "greenhouse",
        })
    return jobs


# ---------------------------------------------------------------------------
# Source: Lever (unlimited, free, runs every time)
# ---------------------------------------------------------------------------

def fetch_lever(company: str) -> list:
    url = f"https://api.lever.co/v0/postings/{company}?mode=json"
    resp = requests.get(url, timeout=15)
    resp.raise_for_status()
    jobs = []
    for j in resp.json():
        text = j.get("descriptionPlain", "")
        posted_date = _parse_date(j.get("createdAt"))
        location = j.get("categories", {}).get("location", "") if isinstance(j.get("categories"), dict) else ""
        is_remote = "remote" in location.lower() or "remote" in j.get("text", "").lower()
        jobs.append({
            "id":          f"lv_{company}_{j['id']}",
            "title":       j["text"],
            "company":     company,
            "location":    location,
            "url":         j["hostedUrl"],
            "text":        text,
            "posted_date": posted_date,
            "is_remote":   is_remote,
            "visa_sponsorship": _detect_visa_sponsorship(text),
            "source":      "lever",
        })
    return jobs


# ---------------------------------------------------------------------------
# Source: JSearch via RapidAPI (rate-limited)
# ---------------------------------------------------------------------------

def _jsearch_due() -> bool:
    if not JSEARCH_ENABLED or not JSEARCH_API_KEY:
        return False
    last_run = get_meta("jsearch_last_run")
    if not last_run:
        return True
    elapsed = datetime.utcnow() - datetime.fromisoformat(last_run)
    return elapsed >= timedelta(hours=JSEARCH_INTERVAL_HOURS)


def fetch_jsearch(query: str) -> list:
    url = "https://jsearch.p.rapidapi.com/search"
    headers = {
        "X-RapidAPI-Key":  JSEARCH_API_KEY,
        "X-RapidAPI-Host": "jsearch.p.rapidapi.com",
    }
    if POSTED_WITHIN_DAYS <= 1:
        date_posted = "today"
    elif POSTED_WITHIN_DAYS <= 7:
        date_posted = "week"
    elif POSTED_WITHIN_DAYS <= 30:
        date_posted = "month"
    else:
        date_posted = "all"

    params = {"query": query, "num_pages": "1", "date_posted": date_posted}
    resp = requests.get(url, headers=headers, params=params, timeout=20)
    resp.raise_for_status()
    jobs = []
    for j in resp.json().get("data", []):
        text = j.get("job_description", "")
        posted_date = _parse_date(
            j.get("job_posted_at_datetime_utc") or j.get("job_posted_at_timestamp")
        )
        location = ", ".join(filter(None, [
            j.get("job_city"), j.get("job_state"), j.get("job_country"),
        ]))
        is_remote = bool(j.get("job_is_remote"))
        jobs.append({
            "id":          f"js_{j['job_id']}",
            "title":       j.get("job_title", ""),
            "company":     j.get("employer_name", "Unknown"),
            "location":    location,
            "url":         j.get("job_apply_link") or j.get("job_google_link", ""),
            "text":        text,
            "posted_date": posted_date,
            "is_remote":   is_remote,
            "visa_sponsorship": _detect_visa_sponsorship(text),
            "source":      "jsearch",
        })
    return jobs


# ---------------------------------------------------------------------------
# Source: Apify multi-board (LinkedIn, Indeed, Glassdoor, Naukri)
# NOTE: The URL uses ~ (tilde) to separate owner from actor name.
# ---------------------------------------------------------------------------

APIFY_ACTOR_ID = "openclawai~job-board-scraper"


def _apify_due() -> bool:
    if not APIFY_API_KEY:
        return False
    last_run = get_meta("apify_last_run")
    if not last_run:
        return True
    elapsed = datetime.utcnow() - datetime.fromisoformat(last_run)
    return elapsed >= timedelta(hours=APIFY_INTERVAL_HOURS)


def fetch_apify(search_term: str) -> list:
    """Run the Apify multi-board scraper for one search term."""
    hours_old = POSTED_WITHIN_DAYS * 24

    run_input = {
        "searchTerm":        search_term,
        "isRemote":          False,
        "sites":             APIFY_JOB_BOARDS,
        "maxResults":        APIFY_MAX_RESULTS,
        "descriptionFormat": "markdown",
        "hoursOld":          hours_old,
        "countryIndeed":     "india",
    }

    run_url = f"https://api.apify.com/v2/acts/{APIFY_ACTOR_ID}/run-sync-get-dataset-items"
    resp = requests.post(
        run_url,
        json=run_input,
        params={"token": APIFY_API_KEY},
        timeout=180,
    )
    resp.raise_for_status()

    jobs = []
    for item in resp.json():
        text = item.get("description") or ""
        location = item.get("location") or ""
        is_remote = bool(item.get("is_remote")) or "remote" in location.lower()
        posted_date = _parse_date(item.get("date_posted"))
        raw_id = item.get("id") or item.get("job_url") or item.get("job_url_direct") or ""

        jobs.append({
            "id":          f"ap_{item.get('site', 'unknown')}_{str(abs(hash(raw_id)))[-12:]}",
            "title":       item.get("title") or "",
            "company":     item.get("company") or "Unknown",
            "location":    location,
            "url":         item.get("job_url_direct") or item.get("job_url") or "",
            "text":        text,
            "posted_date": posted_date,
            "is_remote":   is_remote,
            "visa_sponsorship": _detect_visa_sponsorship(text),
            "source":      item.get("site", "apify"),
        })
    return jobs


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------

def fetch_new_postings() -> list:
    all_jobs = []

    for company in GREENHOUSE_COMPANIES:
        try:
            all_jobs.extend(fetch_greenhouse(company))
        except Exception as e:
            print(f"Greenhouse fetch failed for {company}: {e}")

    for company in LEVER_COMPANIES:
        try:
            all_jobs.extend(fetch_lever(company))
        except Exception as e:
            print(f"Lever fetch failed for {company}: {e}")

    if _jsearch_due():
        for query in JSEARCH_QUERIES:
            try:
                all_jobs.extend(fetch_jsearch(query))
            except Exception as e:
                print(f"JSearch fetch failed for '{query}': {e}")
        set_meta("jsearch_last_run", datetime.utcnow().isoformat())
    else:
        print("Skipping JSearch this run (interval not yet elapsed).")

    if _apify_due():
        for term in APIFY_SEARCH_TERMS:
            try:
                results = fetch_apify(term)
                print(f"Apify returned {len(results)} jobs for '{term}'.")
                all_jobs.extend(results)
            except Exception as e:
                print(f"Apify fetch failed for '{term}': {e}")
        set_meta("apify_last_run", datetime.utcnow().isoformat())
    else:
        print("Skipping Apify this run (interval not yet elapsed).")

    filtered = []
    for job in all_jobs:
        if not _matches_keywords(job):
            continue
        if not _is_within_cutoff(job.get("posted_date", "")):
            continue
        if not _passes_location_filter(job):
            continue
        filtered.append(job)

    return _sort_by_date(filtered)
