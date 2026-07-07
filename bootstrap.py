"""
bootstrap.py — one-time resume analysis that generates profile.json.

Run this whenever you update your resume:
    python bootstrap.py

It reads resume.txt, sends it to Gemini, and writes profile.json which
config.py uses to drive search terms, keywords, location, and email.
It does NOT touch jobs.db or send any emails.
"""

import json
import os
import time

from dotenv import load_dotenv
load_dotenv()

from google import genai

RESUME_PATH  = "resume.txt"
PROFILE_PATH = "profile.json"
MODEL        = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash")


# ---------------------------------------------------------------------------
# Gemini helper (same retry pattern as main.py)
# ---------------------------------------------------------------------------

def _gemini(prompt: str) -> str:
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY not set — check your .env file.")
    client = genai.Client(api_key=api_key)
    last_exc = None
    for attempt in range(4):
        try:
            return client.models.generate_content(model=MODEL, contents=prompt).text.strip()
        except Exception as e:
            if "503" in str(e) or "UNAVAILABLE" in str(e):
                wait = 15 * (attempt + 1)
                print(f"  Gemini 503, retrying in {wait}s (attempt {attempt + 1}/4)...")
                time.sleep(wait)
                last_exc = e
            else:
                raise
    raise last_exc


# ---------------------------------------------------------------------------
# Bootstrap prompt
# ---------------------------------------------------------------------------

PROMPT_TEMPLATE = """\
You are a job search assistant. Analyse the resume below and extract structured \
information to drive an automated job search.

Return ONLY valid JSON — no markdown fences, no explanation outside the JSON object.

The JSON must conform exactly to this schema:
{{
  "anchor_skill": "<the candidate's SINGLE most defining technology/framework — \
the one thing they are known for, e.g. 'Ruby on Rails' or 'React' or 'Python'>",
  "target_titles": [
    "<primary job title to search for>",
    "<secondary job title>",
    ... (2-4 titles, ordered by preference)
  ],
  "primary_skills": [
    "<second most important skill>",
    "<third most important skill>",
    ... (3-6 skills, EXCLUDING the anchor_skill — these are supporting primary skills)
  ],
  "secondary_skills": [
    "<supporting skill>",
    ... (4-8 skills)
  ],
  "location": "<candidate's city and country, e.g. Bengaluru, India>",
  "country": "<ISO country name only, e.g. India>",
  "years_experience": <integer>,
  "seniority": "<one of: junior | mid | senior | lead | staff | principal | manager>",
  "email": "<candidate's email address from resume, or empty string if not found>",
  "search_terms": [
    "<natural-language job search query 1>",
    "<natural-language job search query 2>",
    ... (3-5 queries, mix of title+skill+location combos)
  ],
  "keywords": [
    "<keyword or phrase that must appear in a matching job title or description>",
    ... (6-12 keywords, lower-case)
  ],
  "summary": "<one sentence describing the candidate's profile for use in scoring prompts>"
}}

Rules for anchor_skill:
- This MUST be the single technology/framework that defines the candidate's career identity
- Look at: most years of experience, most mentions in resume, current role's primary stack
- Examples: "Ruby on Rails", "React", "Java", "Python", "Go", "Kubernetes"
- Do NOT put a generic term like "backend" or "cloud" — it must be a specific technology

Rules for primary_skills:
- Do NOT include the anchor_skill here (it's separate)
- These are the other strong skills that complement the anchor

Rules for search_terms:
- Each query should be a natural search string like "Technical Lead Ruby on Rails India"
- At least 2 of the 5 queries MUST include the anchor_skill
- Include at least one location-specific query and one remote-friendly query
- Base them on the candidate's anchor_skill, primary skills, and target titles

Rules for keywords:
- The anchor_skill (and common abbreviations) MUST be first in the list
- Include all target title variants in lower-case
- Keep them specific enough to filter out clearly irrelevant roles

RESUME:
{resume}
"""


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def run():
    # Load resume
    if not os.path.exists(RESUME_PATH):
        raise FileNotFoundError(f"{RESUME_PATH} not found. Add your resume first.")

    with open(RESUME_PATH, "r") as f:
        resume = f.read()

    print(f"Reading resume from {RESUME_PATH} ({len(resume)} chars)...")
    print(f"Calling Gemini ({MODEL}) to extract profile...")

    raw = _gemini(PROMPT_TEMPLATE.format(resume=resume))

    # Strip any accidental markdown fences
    raw = raw.strip().lstrip("```json").lstrip("```").rstrip("```").strip()

    try:
        profile = json.loads(raw)
    except json.JSONDecodeError as e:
        print(f"\nERROR: Gemini returned invalid JSON:\n{raw}\n\nError: {e}")
        raise SystemExit(1)

    # Validate required keys
    required = [
        "anchor_skill", "target_titles", "primary_skills", "secondary_skills",
        "location", "country", "years_experience", "seniority",
        "email", "search_terms", "keywords", "summary",
    ]
    missing = [k for k in required if k not in profile]
    if missing:
        print(f"\nWARNING: Missing keys in profile: {missing}")
        print("Profile may be incomplete — check profile.json manually.")

    # Write profile
    with open(PROFILE_PATH, "w") as f:
        json.dump(profile, f, indent=2)

    print(f"\nProfile written to {PROFILE_PATH}")
    print("\n--- Extracted profile ---")
    print(f"  Anchor skill  : {profile.get('anchor_skill', 'n/a')}")
    print(f"  Name/Summary  : {profile.get('summary', 'n/a')}")
    print(f"  Location      : {profile.get('location', 'n/a')} ({profile.get('country', 'n/a')})")
    print(f"  Seniority     : {profile.get('seniority', 'n/a')} | {profile.get('years_experience', '?')} years")
    print(f"  Target titles : {', '.join(profile.get('target_titles', []))}")
    print(f"  Primary skills: {', '.join(profile.get('primary_skills', []))}")
    print(f"  Search terms  :")
    for t in profile.get("search_terms", []):
        print(f"    - {t}")
    print(f"  Keywords      : {', '.join(profile.get('keywords', []))}")
    print(f"  Email         : {profile.get('email', 'n/a')}")
    print("\nRun 'python main.py' to start the job search with your new profile.")


if __name__ == "__main__":
    run()
