"""Bookmark tests — save, unsave, duplicate handling."""
import uuid



def test_save_job_success(call):
    """Saving a new job returns 'saved' status."""
    job_id = f"test_{uuid.uuid4().hex[:8]}"
    result = call("save_job", {
        "job_id": job_id, "title": "Test Job", "company": "TestCo"
    })
    assert result["status"] == "saved"
    assert result["job_id"] == job_id


def test_save_job_duplicate(call):
    """Saving the same job_id twice returns 'already_bookmarked'."""
    job_id = f"test_dup_{uuid.uuid4().hex[:8]}"

    # First save
    result1 = call("save_job", {"job_id": job_id, "title": "X", "company": "Y"})
    assert result1["status"] == "saved"

    # Second save (same ID)
    result2 = call("save_job", {"job_id": job_id, "title": "X", "company": "Y"})
    assert result2["status"] == "already_bookmarked"


def test_unsave_job_success(call):
    """Unsaving an existing bookmark returns 'removed'."""
    job_id = f"test_rm_{uuid.uuid4().hex[:8]}"

    call("save_job", {"job_id": job_id, "title": "X", "company": "Y"})
    result = call("unsave_job", {"job_id": job_id})
    assert result["status"] == "removed"


def test_unsave_job_not_found(call):
    """Unsaving a non-existent job returns 'not_found'."""
    result = call("unsave_job", {"job_id": "nonexistent_xyz"})
    assert result["status"] == "not_found"


def test_save_job_rejects_empty_id(call):
    """save_job must reject empty job_id."""
    result = call("save_job", {"job_id": "", "title": "X", "company": "Y"})
    assert "error" in result
