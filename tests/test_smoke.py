"""Smoke tests — quick checks that the server is alive and configured correctly."""



def test_health_check_passes(call):
    result = call("run_health_check")
    assert result["overall"] in ("healthy", "issues_detected")
    assert "gemini_api_key" in result
    assert "database" in result


def test_health_check_reports_anchor_skill(call):
    result = call("run_health_check")
    assert "anchor_skill" in result
    assert isinstance(result["anchor_skill"], str)
    assert len(result["anchor_skill"]) > 0


def test_get_platforms_returns_boards(call):
    result = call("get_platforms")
    assert "apify_boards" in result
    assert isinstance(result["apify_boards"], list)
    assert "anchor_skill" in result


def test_get_analytics_returns_structure(call):
    result = call("get_analytics", {"hours": 168})
    assert "total_jobs_scored" in result
    assert "strong_matches" in result
    assert "by_source" in result
    assert isinstance(result["total_jobs_scored"], int)


def test_get_bot_status(call):
    result = call("get_bot_status")
    assert "status" in result
    assert "interval_hours" in result
