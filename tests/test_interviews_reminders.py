"""Tests for interview tracking and reminder tools."""



def test_add_interview(call):
    """add_interview stores interview and returns ID."""
    result = call("add_interview", {
        "company": "Stripe",
        "datetime": "2027-01-15T14:00",
        "role": "Backend Engineer",
        "notes": "System design round",
    })
    assert result["status"] == "added"
    assert result["interview_id"] > 0
    assert result["company"] == "Stripe"


def test_get_upcoming_interviews(call):
    """get_upcoming_interviews returns future interviews."""
    # Add a future interview
    call("add_interview", {
        "company": "TestCo",
        "datetime": "2027-06-01T10:00",
    })

    result = call("get_upcoming_interviews")
    assert "count" in result
    assert isinstance(result["interviews"], list)
    # Should have at least the one we just added
    assert result["count"] >= 1


def test_set_reminder_requires_message(call):
    """set_reminder rejects empty message."""
    result = call("set_reminder", {"message": "", "due_at": "2027-01-01"})
    assert "error" in result


def test_set_reminder_requires_due_at(call):
    """set_reminder rejects empty due_at."""
    result = call("set_reminder", {"message": "Follow up", "due_at": ""})
    assert "error" in result


def test_reminder_lifecycle(call):
    """Full lifecycle: set → get → dismiss → verify gone."""
    # Set
    result = call("set_reminder", {"message": "Test reminder", "due_at": "2027-12-01"})
    assert result["status"] == "set"
    rid = result["reminder_id"]

    # Get (should include it)
    reminders = call("get_reminders", {})
    assert any(r["id"] == rid for r in reminders["reminders"])

    # Dismiss
    dismiss = call("dismiss_reminder", {"reminder_id": rid})
    assert dismiss["status"] == "dismissed"

    # Should not appear in active reminders
    after = call("get_reminders", {})
    assert not any(r["id"] == rid for r in after["reminders"])

    # Should appear if include_done=True
    all_reminders = call("get_reminders", {"include_done": True})
    assert any(r["id"] == rid for r in all_reminders["reminders"])


def test_dismiss_nonexistent_reminder(call):
    """Dismissing a non-existent reminder returns not_found."""
    result = call("dismiss_reminder", {"reminder_id": 99999})
    assert result["status"] == "not_found"
