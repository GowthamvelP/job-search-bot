"""Tests for bootstrap prompt — validates seniority rules are present in prompt."""
import sys
import os

# Add paths
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "bot"))


def test_bootstrap_prompt_contains_seniority_rules():
    """The bootstrap prompt must include explicit seniority mapping rules."""
    from bootstrap import PROMPT_TEMPLATE

    # Must contain the year-to-seniority mapping
    assert "0-1 years" in PROMPT_TEMPLATE
    assert '"junior"' in PROMPT_TEMPLATE
    assert "2-3 years" in PROMPT_TEMPLATE
    assert '"mid"' in PROMPT_TEMPLATE
    assert "4-6 years" in PROMPT_TEMPLATE
    assert '"senior"' in PROMPT_TEMPLATE


def test_bootstrap_prompt_warns_against_inflated_titles():
    """Prompt must warn not to suggest Lead/Staff for < 5 years experience."""
    from bootstrap import PROMPT_TEMPLATE

    assert "Do NOT suggest" in PROMPT_TEMPLATE
    assert "Lead" in PROMPT_TEMPLATE
    assert "< 5 years" in PROMPT_TEMPLATE


def test_bootstrap_prompt_requires_specific_anchor_skill():
    """Prompt must instruct that anchor_skill is a specific technology, not generic."""
    from bootstrap import PROMPT_TEMPLATE

    assert "specific technology" in PROMPT_TEMPLATE or "MUST be" in PROMPT_TEMPLATE
    assert "Do NOT put a generic term" in PROMPT_TEMPLATE


def test_bootstrap_prompt_has_all_required_schema_keys():
    """The prompt must request all required profile keys."""
    from bootstrap import PROMPT_TEMPLATE

    required_keys = [
        "anchor_skill", "target_titles", "primary_skills",
        "secondary_skills", "location", "country",
        "years_experience", "seniority", "email",
        "search_terms", "keywords", "summary",
    ]
    for key in required_keys:
        assert f'"{key}"' in PROMPT_TEMPLATE, f"Missing key in prompt: {key}"


def test_bootstrap_run_function_exists():
    """bootstrap.py must export a run() function."""
    from bootstrap import run
    assert callable(run)
