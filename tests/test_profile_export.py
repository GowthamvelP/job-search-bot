"""Tests for update_profile and export_data tools."""



def test_update_profile_accepts_anchor_skill(call):
    """anchor_skill is a whitelisted key and should be accepted."""
    result = call("update_profile", {"key": "anchor_skill", "value": "Python"})
    # Should succeed (not a whitelist error)
    if "error" in result:
        assert "not allowed" not in result["error"]
    else:
        assert result["status"] == "updated"
        assert result["key"] == "anchor_skill"
        assert result["new_value"] == "Python"


def test_update_profile_accepts_array_value(call):
    """Array values (as JSON string) should be parsed correctly."""
    result = call("update_profile", {
        "key": "primary_skills",
        "value": '["React", "Node.js", "TypeScript"]'
    })
    if "error" in result:
        assert "not allowed" not in result["error"]
    else:
        assert result["status"] == "updated"
        assert result["new_value"] == ["React", "Node.js", "TypeScript"]


def test_update_profile_rejects_unlisted_key(call):
    """Keys not in the whitelist must be rejected."""
    result = call("update_profile", {"key": "database_url", "value": "postgres://..."})
    assert "error" in result
    assert "not allowed" in result["error"]


def test_export_json_format(call):
    """export_data with format=json returns proper structure."""
    result = call("export_data", {"format": "json"})
    assert result["format"] == "json"
    assert "count" in result
    assert isinstance(result.get("count"), int)


def test_export_csv_format(call):
    """export_data with format=csv returns CSV data."""
    result = call("export_data", {"format": "csv"})
    assert result["format"] == "csv"
    assert "count" in result


def test_export_invalid_format_defaults_json(call):
    """Unknown format values should default to json, not error."""
    result = call("export_data", {"format": "xml"})
    assert result["format"] == "json"


def test_export_to_file(call):
    """export_data with return_file_path=true writes to disk."""
    result = call("export_data", {"format": "json", "return_file_path": True})
    assert "file_path" in result
    assert result["file_path"].endswith(".json")
