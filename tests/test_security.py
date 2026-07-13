"""Security tests — credential masking, input validation, profile whitelist."""



def test_health_check_never_exposes_key_values(call):
    """run_health_check must report 'set'/'MISSING', never actual key values."""
    result = call("run_health_check")

    # Check all key-related fields
    for key in ["gemini_api_key", "apify_api_key", "gmail_address", "gmail_app_password"]:
        if key in result:
            assert result[key] in ("set", "MISSING"), f"{key} leaked value: {result[key]}"


def test_update_profile_rejects_invalid_key(call):
    """update_profile must reject keys not in the whitelist."""
    result = call("update_profile", {"key": "malicious_field", "value": "hacked"})
    assert "error" in result
    assert "not allowed" in result["error"]


def test_update_profile_rejects_dangerous_keys(call):
    """Specific dangerous keys that should never be writable."""
    dangerous = ["__init__", "GEMINI_API_KEY", "password", "secret", "admin"]
    for key in dangerous:
        result = call("update_profile", {"key": key, "value": "x"})
        assert "error" in result, f"Key '{key}' was accepted but should be rejected"


def test_update_profile_accepts_valid_keys(call):
    """Whitelisted keys should be accepted."""
    # anchor_skill is whitelisted
    result = call("update_profile", {"key": "anchor_skill", "value": "Python"})
    # Should succeed (or error if profile.json missing, but NOT a whitelist error)
    if "error" in result:
        assert "not allowed" not in result["error"]


def test_score_job_rejects_empty_fields(call):
    """score_job must reject empty required fields."""
    result = call("score_job", {
        "title": "",  # empty — should fail
        "company": "Test",
        "url": "http://test.com",
        "text": "Some description"
    })
    assert "error" in result
    assert "title" in result["error"]


def test_score_job_rejects_missing_text(call):
    """score_job requires job description text."""
    result = call("score_job", {
        "title": "Engineer",
        "company": "Corp",
        "url": "http://x.com",
        "text": ""  # empty
    })
    assert "error" in result
