/**
 * Direct search against Greenhouse/Lever public APIs.
 * No API key needed — free and unlimited.
 */

import { Company } from "@/data/companies";

export interface JobResult {
  id: string;
  title: string;
  company: string;
  location: string;
  url: string;
  posted_date: string;
  is_remote: boolean;
  visa_sponsorship: boolean;
  source: string;
  score?: number;
  skill_bonus?: number;
  reasoning?: string;
}

async function fetchGreenhouseJobs(company: Company): Promise<JobResult[]> {
  try {
    const resp = await fetch(
      `https://boards-api.greenhouse.io/v1/boards/${company.slug}/jobs?content=true`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (!resp.ok) return [];
    const data = await resp.json();
    return (data.jobs || []).map((j: any) => ({
      id: `gh_${company.slug}_${j.id}`,
      title: j.title,
      company: company.name,
      location: j.location?.name || "",
      url: j.absolute_url,
      posted_date: j.updated_at?.slice(0, 10) || "",
      is_remote: j.title.toLowerCase().includes("remote") || (j.location?.name || "").toLowerCase().includes("remote"),
      visa_sponsorship: false,
      source: "greenhouse",
    }));
  } catch {
    return [];
  }
}

async function fetchLeverJobs(company: Company): Promise<JobResult[]> {
  try {
    const resp = await fetch(
      `https://api.lever.co/v0/postings/${company.slug}?mode=json`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (!resp.ok) return [];
    const data = await resp.json();
    return (data || []).map((j: any) => ({
      id: `lv_${company.slug}_${j.id}`,
      title: j.text,
      company: company.name,
      location: j.categories?.location || "",
      url: j.hostedUrl,
      posted_date: j.createdAt ? new Date(j.createdAt).toISOString().slice(0, 10) : "",
      is_remote: (j.categories?.location || "").toLowerCase().includes("remote") || j.text.toLowerCase().includes("remote"),
      visa_sponsorship: false,
      source: "lever",
    }));
  } catch {
    return [];
  }
}

export async function searchCompanies(
  companies: Company[],
  options: { query?: string; remoteOnly?: boolean } = {}
): Promise<JobResult[]> {
  // Fetch all companies in parallel
  const results = await Promise.all(
    companies.map((c) =>
      c.ats === "greenhouse" ? fetchGreenhouseJobs(c) : fetchLeverJobs(c)
    )
  );

  let allJobs = results.flat();

  // Filter by query
  if (options.query?.trim()) {
    const q = options.query.toLowerCase();
    allJobs = allJobs.filter(
      (j) =>
        j.title.toLowerCase().includes(q) ||
        j.company.toLowerCase().includes(q) ||
        j.location.toLowerCase().includes(q)
    );
  }

  // Filter remote
  if (options.remoteOnly) {
    allJobs = allJobs.filter((j) => j.is_remote);
  }

  // Sort by posted date (most recent first)
  allJobs.sort((a, b) => (b.posted_date || "").localeCompare(a.posted_date || ""));

  return allJobs;
}
