"""Tests for compare_jobs tool (now live, not a stub)."""
import uuid



def test_compare_jobs_requires_minimum_2(call):
    """compare_jobs rejects fewer than 2 job_ids."""
    result = call("compare_jobs", {"job_ids": ["single_id"]})
    assert "error" in result
    assert "at least 2" in result["error"]


def test_compare_jobs_rejects_empty_list(call):
    """compare_jobs rejects empty job_ids."""
    result = call("compare_jobs", {"job_ids": []})
    assert "error" in result


def test_compare_jobs_rejects_too_many(call):
    """compare_jobs rejects more than 5 job_ids."""
    ids = [f"id_{i}" for i in range(6)]
    result = call("compare_jobs", {"job_ids": ids})
    assert "error" in result
    assert "5" in result["error"]


def test_compare_jobs_handles_not_found(call):
    """compare_jobs returns error when none of the IDs exist."""
    fake_ids = [f"fake_{uuid.uuid4().hex[:8]}" for _ in range(2)]
    result = call("compare_jobs", {"job_ids": fake_ids})
    assert "error" in result or "not_found" in result
