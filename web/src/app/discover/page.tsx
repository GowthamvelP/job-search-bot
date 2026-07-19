"use client";

import { useState, useEffect, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Search, Loader2, ExternalLink, Bookmark, FileText, AlertCircle, Building2, Filter, X } from "lucide-react";
import { callTool } from "@/lib/mcp-client";
import { getKeys, hasKeys } from "@/lib/keys";
import { getProfile } from "@/lib/profile";
import { DEMO_JOBS } from "@/data/demo-jobs";
import { COMPANIES, CATEGORIES, Company } from "@/data/companies";
import { searchCompanies, JobResult } from "@/lib/direct-search";
import { CoverLetterModal } from "@/components/cover-letter-modal";
import { JobDetailModal } from "@/components/job-detail-modal";

interface Job {
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
  text?: string;
}

type JobType = "all" | "remote" | "onsite" | "hybrid";
type Freshness = "all" | "1" | "3" | "7" | "14" | "30";
type ScoreRange = "all" | "80" | "60" | "40";

interface Filters {
  country: string;
  jobType: JobType;
  freshness: Freshness;
  minScore: ScoreRange;
  source: string;
  visaOnly: boolean;
}

function ScoreBadge({ score }: { score?: number }) {
  if (!score) return <Badge variant="outline">—</Badge>;
  const color = score >= 80 ? "bg-green-500" : score >= 60 ? "bg-yellow-500" : "bg-red-400";
  return (
    <Badge className={`${color} text-white font-bold`}>
      {score}
    </Badge>
  );
}

function SourceBadge({ source }: { source: string }) {
  const colors: Record<string, string> = {
    linkedin: "bg-blue-600",
    indeed: "bg-purple-600",
    glassdoor: "bg-green-700",
    naukri: "bg-orange-600",
  };
  return (
    <Badge variant="secondary" className={`${colors[source] || ""} text-white text-[10px]`}>
      {source}
    </Badge>
  );
}

export default function DiscoverPageWrapper() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background flex items-center justify-center">Loading...</div>}>
      <DiscoverPage />
    </Suspense>
  );
}

function DiscoverPage() {
  const searchParams = useSearchParams();
  const isDemo = searchParams.get("demo") === "true";

  const [query, setQuery] = useState("");
  const [postedDays, setPostedDays] = useState(7);
  const [loading, setLoading] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");
  const [selectedCompanies, setSelectedCompanies] = useState<Company[]>(
    COMPANIES.filter(c => ["Stripe", "Notion", "Razorpay", "Postman", "GitLab"].includes(c.name))
  );
  const [searchMode, setSearchMode] = useState<"companies" | "apify">("companies");
  const [showFilters, setShowFilters] = useState(false);

  // Modal state
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [coverLetterJob, setCoverLetterJob] = useState<Job | null>(null);
  const [coverLetterOpen, setCoverLetterOpen] = useState(false);

  // Filters
  const [filters, setFilters] = useState<Filters>({
    country: "all",
    jobType: "all",
    freshness: "all",
    minScore: "all",
    source: "all",
    visaOnly: false,
  });

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.country !== "all") count++;
    if (filters.jobType !== "all") count++;
    if (filters.freshness !== "all") count++;
    if (filters.minScore !== "all") count++;
    if (filters.source !== "all") count++;
    if (filters.visaOnly) count++;
    return count;
  }, [filters]);

  // Derive unique countries and sources from results for filter options
  // Merge static defaults with any dynamic values from results
  const STATIC_COUNTRIES = ["India", "United States", "United Kingdom", "Canada", "Germany", "Singapore", "Australia", "Remote"];
  const STATIC_SOURCES = ["linkedin", "indeed", "glassdoor", "naukri", "greenhouse", "lever"];

  const availableCountries = useMemo(() => {
    const countries = new Set<string>(STATIC_COUNTRIES);
    jobs.forEach((j) => {
      const loc = j.location || "";
      const parts = loc.split(",").map((s) => s.trim());
      const country = parts[parts.length - 1];
      if (country && country.length > 1) countries.add(country);
    });
    return Array.from(countries).sort();
  }, [jobs]);

  const availableSources = useMemo(() => {
    const sources = new Set<string>(STATIC_SOURCES);
    jobs.forEach((j) => {
      if (j.source) sources.add(j.source);
    });
    return Array.from(sources).sort();
  }, [jobs]);

  // Apply filters to jobs
  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      // Country filter
      if (filters.country !== "all") {
        const loc = (job.location || "").toLowerCase();
        if (!loc.includes(filters.country.toLowerCase())) return false;
      }

      // Job type filter
      if (filters.jobType === "remote" && !job.is_remote) return false;
      if (filters.jobType === "onsite" && job.is_remote) return false;
      if (filters.jobType === "hybrid") {
        const text = (job.title + " " + job.location).toLowerCase();
        if (!text.includes("hybrid")) return false;
      }

      // Freshness filter
      if (filters.freshness !== "all" && job.posted_date) {
        const days = parseInt(filters.freshness);
        const posted = new Date(job.posted_date);
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);
        if (posted < cutoff) return false;
      }

      // Score filter
      if (filters.minScore !== "all") {
        const min = parseInt(filters.minScore);
        if (!job.score || job.score < min) return false;
      }

      // Source filter
      if (filters.source !== "all" && job.source !== filters.source) return false;

      // Visa filter
      if (filters.visaOnly && !job.visa_sponsorship) return false;

      return true;
    });
  }, [jobs, filters]);

  function resetFilters() {
    setFilters({
      country: "all",
      jobType: "all",
      freshness: "all",
      minScore: "all",
      source: "all",
      visaOnly: false,
    });
  }

  // Show demo data on first load if in demo mode
  useEffect(() => {
    if (isDemo && !searched) {
      setJobs(DEMO_JOBS as Job[]);
      setSearched(true);
    }
  }, [isDemo, searched]);

  function toggleCompany(company: Company) {
    setSelectedCompanies(prev =>
      prev.find(c => c.slug === company.slug)
        ? prev.filter(c => c.slug !== company.slug)
        : [...prev, company]
    );
  }

  async function handleSearch() {
    if (isDemo) {
      const filtered = DEMO_JOBS.filter(
        (j) => j.title.toLowerCase().includes(query.toLowerCase()) ||
               j.company.toLowerCase().includes(query.toLowerCase())
      );
      setJobs(filtered as Job[]);
      setSearched(true);
      return;
    }

    setLoading(true);
    setError("");
    try {
      if (searchMode === "companies" && selectedCompanies.length > 0) {
        // Direct search — free, no API key needed
        const results = await searchCompanies(selectedCompanies, { query, remoteOnly: filters.jobType === "remote" });
        setJobs(results as Job[]);
      } else {
        // MCP search (requires Apify key)
        const keys = getKeys();
        if (!keys.apify) {
          setError("Apify API key required for broad search. Use company search (free) or add your Apify key in settings.");
          setLoading(false);
          return;
        }
        const result = await callTool("search_jobs", { posted_within_days: postedDays }, keys);
        let jobList = result.jobs || [];
        if (query.trim()) {
          const q = query.toLowerCase();
          jobList = jobList.filter((j: Job) =>
            j.title.toLowerCase().includes(q) || j.company.toLowerCase().includes(q)
          );
        }
        setJobs(jobList);
      }
      setSearched(true);
    } catch (e: any) {
      setError(e.message || "Search failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Demo mode banner */}
      {isDemo && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 text-center text-sm">
          <AlertCircle className="w-4 h-4 inline mr-1" />
          Demo mode — showing sample data.{" "}
          <a href="/onboarding" className="font-medium underline">Add your API keys</a> to search real jobs.
        </div>
      )}

      <div className="max-w-6xl mx-auto p-6">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Discover Jobs</h1>
          <p className="text-muted-foreground mt-1">
            Search across LinkedIn, Indeed, Glassdoor, and Naukri — scored against your resume.
          </p>
        </div>

        {/* Search form */}
        <Card className="p-4 mb-4">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex-1">
              <Input
                placeholder="Role, company, or keyword..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              />
            </div>
            <div className="flex gap-3 items-center">
              <Button
                variant={showFilters ? "secondary" : "outline"}
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
                className="relative"
              >
                <Filter className="w-4 h-4" />
                <span className="ml-1.5">Filters</span>
                {activeFilterCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-primary text-primary-foreground text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
              <Button onClick={handleSearch} disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                <span className="ml-2">Search</span>
              </Button>
            </div>
          </div>
        </Card>

        {/* Filter panel */}
        {showFilters && (
          <Card className="p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-muted-foreground" />
                <Label className="text-sm font-medium">Filter results</Label>
              </div>
              {activeFilterCount > 0 && (
                <Button variant="ghost" size="sm" onClick={resetFilters} className="text-xs h-7">
                  <X className="w-3 h-3 mr-1" />
                  Clear all
                </Button>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {/* Country */}
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Country</Label>
                <select
                  value={filters.country}
                  onChange={(e) => setFilters({ ...filters, country: e.target.value })}
                  className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="all">All countries</option>
                  {availableCountries.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              {/* Job Type */}
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Job type</Label>
                <select
                  value={filters.jobType}
                  onChange={(e) => setFilters({ ...filters, jobType: e.target.value as JobType })}
                  className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="all">All types</option>
                  <option value="remote">Remote</option>
                  <option value="onsite">On-site</option>
                  <option value="hybrid">Hybrid</option>
                </select>
              </div>

              {/* Freshness */}
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Posted within</Label>
                <select
                  value={filters.freshness}
                  onChange={(e) => setFilters({ ...filters, freshness: e.target.value as Freshness })}
                  className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="all">Any time</option>
                  <option value="1">Last 24 hours</option>
                  <option value="3">Last 3 days</option>
                  <option value="7">Last week</option>
                  <option value="14">Last 2 weeks</option>
                  <option value="30">Last month</option>
                </select>
              </div>

              {/* Relevancy / Score */}
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Min score</Label>
                <select
                  value={filters.minScore}
                  onChange={(e) => setFilters({ ...filters, minScore: e.target.value as ScoreRange })}
                  className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="all">Any score</option>
                  <option value="80">80+ (strong match)</option>
                  <option value="60">60+ (good match)</option>
                  <option value="40">40+ (possible fit)</option>
                </select>
              </div>

              {/* Source */}
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Source</Label>
                <select
                  value={filters.source}
                  onChange={(e) => setFilters({ ...filters, source: e.target.value })}
                  className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="all">All sources</option>
                  {availableSources.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              {/* Visa sponsorship */}
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Visa</Label>
                <label className="flex items-center gap-2 h-9 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.visaOnly}
                    onChange={(e) => setFilters({ ...filters, visaOnly: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-sm">Sponsorship only</span>
                </label>
              </div>
            </div>
          </Card>
        )}

        {/* Company selection */}
        {!isDemo && (
          <Card className="p-4 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Building2 className="w-4 h-4 text-muted-foreground" />
              <Label className="text-sm font-medium">Companies to search (free, no API key needed)</Label>
              <Badge variant="outline" className="text-[10px]">{selectedCompanies.length} selected</Badge>
            </div>
            {CATEGORIES.map(cat => (
              <div key={cat} className="mb-2">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">{cat}</p>
                <div className="flex flex-wrap gap-1.5">
                  {COMPANIES.filter(c => c.category === cat).map(company => {
                    const selected = selectedCompanies.some(s => s.slug === company.slug);
                    return (
                      <button
                        key={company.slug}
                        onClick={() => toggleCompany(company)}
                        className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                          selected
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-muted/50 text-muted-foreground border-border hover:border-primary/50"
                        }`}
                      >
                        {company.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </Card>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-4 text-sm text-red-500">
            {error}
          </div>
        )}

        {/* Results */}
        {searched && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {filteredJobs.length} result{filteredJobs.length !== 1 ? "s" : ""}
                {filteredJobs.length !== jobs.length && ` (filtered from ${jobs.length})`}
                {isDemo && " (demo data)"}
              </p>
            </div>

            {filteredJobs.length === 0 ? (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground">
                  {jobs.length > 0
                    ? "No results match your filters. Try adjusting or clearing them."
                    : "No results found. Try a broader search or different time range."}
                </p>
                {jobs.length > 0 && activeFilterCount > 0 && (
                  <Button variant="ghost" size="sm" onClick={resetFilters} className="mt-2">
                    Clear filters
                  </Button>
                )}
              </Card>
            ) : (
              <div className="space-y-2">
                {filteredJobs.map((job) => (
                  <Card
                    key={job.id}
                    className="p-4 hover:border-primary/50 transition-colors cursor-pointer"
                    onClick={() => { setSelectedJob(job); setDetailOpen(true); }}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <ScoreBadge score={job.score} />
                          <h3 className="font-semibold truncate">{job.title}</h3>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span>{job.company}</span>
                          <span>•</span>
                          <span>{job.location}</span>
                          {job.is_remote && <Badge variant="outline" className="text-[10px]">Remote</Badge>}
                          {job.visa_sponsorship && <Badge variant="outline" className="text-[10px]">Visa</Badge>}
                        </div>
                        {job.reasoning && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{job.reasoning}</p>
                        )}
                        <div className="flex items-center gap-2 mt-2">
                          <SourceBadge source={job.source} />
                          <span className="text-[10px] text-muted-foreground">{job.posted_date}</span>
                          {job.skill_bonus ? (
                            <span className="text-[10px] text-green-500">+{job.skill_bonus} skill bonus</span>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={isDemo}
                          title="Cover letter"
                          onClick={() => { setCoverLetterJob(job); setCoverLetterOpen(true); }}
                        >
                          <FileText className="w-4 h-4" />
                        </Button>
                        <a href={job.url} target="_blank" rel="noopener">
                          <Button variant="ghost" size="sm" title="Open">
                            <ExternalLink className="w-4 h-4" />
                          </Button>
                        </a>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      <JobDetailModal
        open={detailOpen}
        onOpenChange={setDetailOpen}
        job={selectedJob}
        onGenerateCoverLetter={(job) => {
          setDetailOpen(false);
          setCoverLetterJob(job);
          setCoverLetterOpen(true);
        }}
      />
      <CoverLetterModal
        open={coverLetterOpen}
        onOpenChange={setCoverLetterOpen}
        job={coverLetterJob}
      />
    </div>
  );
}
