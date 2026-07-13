"""Search tool tests — validates search_jobs behavior."""



def test_search_jobs_returns_structure(call):
    """search_jobs returns proper JSON structure even with 0 results."""
    result = call("search_jobs", {"posted_within_days": 1})
    assert "total_fetched" in result
    assert "returned" in result
    assert "jobs" in result
    assert isinstance(result["jobs"], list)


def test_search_jobs_clamps_posted_within_days(call):
    """Values outside 1-90 should be clamped, not error."""
    # Very high value — should clamp to 90, not crash
    result = call("search_jobs", {"posted_within_days": 999})
    assert "total_fetched" in result  # Didn't crash

    # Zero/negative — should clamp to 1
    result = call("search_jobs", {"posted_within_days": 0})
    assert "total_fetched" in result


def test_search_jobs_default_params(call):
    """Calling with no params uses defaults (posted_within_days=7)."""
    result = call("search_jobs", {})
    assert "total_fetched" in result
