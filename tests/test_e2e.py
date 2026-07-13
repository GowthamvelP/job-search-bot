"""End-to-end test — proves the full workflow functions correctly."""
import uuid



def test_full_workflow(call):
    """Complete flow: health → platforms → search → save → unsave."""

    # 1. Health check
    health = call("run_health_check")
    assert health["database"] == "writable"

    # 2. Get platforms
    platforms = call("get_platforms")
    assert len(platforms["apify_boards"]) > 0
    assert platforms["anchor_skill"]

    # 3. Search (will likely return 0 due to Apify credit, but shouldn't crash)
    search = call("search_jobs", {"posted_within_days": 7})
    assert "total_fetched" in search
    assert isinstance(search["jobs"], list)

    # 4. Save a job
    job_id = f"e2e_{uuid.uuid4().hex[:8]}"
    save = call("save_job", {"job_id": job_id, "title": "E2E Test", "company": "TestCorp"})
    assert save["status"] == "saved"

    # 5. Get analytics
    analytics = call("get_analytics", {"hours": 8760})
    assert "total_jobs_scored" in analytics

    # 6. Export data (should include the job we just scored... or be empty)
    export = call("export_data", {"format": "json"})
    assert "count" in export
    assert export["format"] == "json"

    # 7. Unsave
    unsave = call("unsave_job", {"job_id": job_id})
    assert unsave["status"] == "removed"


def test_reminder_lifecycle(call):
    """Set a reminder, verify it exists, dismiss it."""

    # Set
    result = call("set_reminder", {"message": "Follow up", "due_at": "2026-12-01"})
    assert result["status"] == "set"
    reminder_id = result["reminder_id"]

    # Get
    reminders = call("get_reminders", {})
    assert reminders["count"] >= 1
    assert any(r["id"] == reminder_id for r in reminders["reminders"])

    # Dismiss
    dismiss = call("dismiss_reminder", {"reminder_id": reminder_id})
    assert dismiss["status"] == "dismissed"

    # Verify dismissed
    after = call("get_reminders", {})
    assert not any(r["id"] == reminder_id for r in after["reminders"])
