"use client";

import { useState, useEffect, useMemo, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Search, Loader2, ExternalLink, Bookmark, FileText,
  AlertCircle, Building2, Filter, X, Zap, MapPin,
  Calendar, Star, ChevronDown, Sparkles,
} from "lucide-react";
import { callTool } from "@/lib/mcp-client";
import { getKeys, hasKeys } from "@/lib/keys";
import { getProfile } from "@/lib/profile";
import { DEMO_JOBS } from "@/data/demo-jobs";
import { COMPANIES, CATEGORIES, Company } from "@/data/companies";
import { searchCompanies, JobResult } from "@/lib/direct-search";
import { CoverLetterModal } from "@/components/cover-letter-modal";

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

const STATIC_COUNTRIES = ["India", "United States", "United Kingdom", "Canada", "Germany", "Singapore", "Australia", "Remote"];
const STATIC_SOURCES = ["linkedin", "indeed", "glassdoor", "naukri", "greenhouse", "lever"];

// --- Score ring component ---
function ScoreRing({ score, size = "sm", scoring = false }: { score?: number; size?: "sm" | "lg"; scoring?: boolean }) {
  const dim = size === "lg" ? 48 : 32;
  const stroke = size === "lg" ? 4 : 3;
  const radius = (dim - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  // Scoring in progress — pulsing ring
  if (scoring) {
    return (
      <div className="relative flex items-center justify-center animate-pulse" style={{ width: dim, height: dim }}>
        <svg width={dim} height={dim} className="-rotate-90">
          <circle cx={dim/2} cy={dim/2} r={radius} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-violet-500/40" strokeDasharray="4 4" />
        </svg>
        <Loader2 className="absolute w-3 h-3 animate-spin text-violet-400" />
      </div>
    );
  }

  // Unscored — dashed ring
  if (!score) {
    return (
      <div className="relative flex items-center justify-center" style={{ width: dim, height: dim }}>
        <svg width={dim} height={dim} className="-rotate-90">
          <circle cx={dim/2} cy={dim/2} r={radius} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-border/40" strokeDasharray="3 3" />
        </svg>
        <span className="absolute text-[9px] text-muted-foreground">?</span>
      </div>
    );
  }

  // Scored — filled ring
  const progress = (score / 100) * circumference;
  const color = score >= 80 ? "#22c55e" : score >= 60 ? "#eab308" : "#f87171";

  return (
    <div className="relative flex items-center justify-center" style={{ width: dim, height: dim }}>
      <svg width={dim} height={dim} className="-rotate-90">
        <circle cx={dim/2} cy={dim/2} r={radius} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-border/30" />
        <circle cx={dim/2} cy={dim/2} r={radius} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={circumference} strokeDashoffset={circumference - progress} strokeLinecap="round"
          className="transition-all duration-500"
        />
      </svg>
      <span className={`absolute font-bold ${size === "lg" ? "text-sm" : "text-[10px]"}`} style={{ color }}>
        {score}
      </span>
    </div>
  );
}

function SourceBadge({ source }: { source: string }) {
  const colors: Record<string, string> = {
    linkedin: "bg-blue-500/20 text-blue-400",
    indeed: "bg-purple-500/20 text-purple-400",
    glassdoor: "bg-green-500/20 text-green-400",
    naukri: "bg-orange-500/20 text-orange-400",
    greenhouse: "bg-emerald-500/20 text-emerald-400",
    lever: "bg-cyan-500/20 text-cyan-400",
  };
  return (
    <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${colors[source] || "bg-muted text-muted-foreground"}`}>
      {source}
    </span>
  );
}

export default function DiscoverPageWrapper() {
  return (
    <Suspense fallback={<div className="h-full flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>}>
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
  const [showFilters, setShowFilters] = useState(false);
  const [showCompanies, setShowCompanies] = useState(false);

  // Selected job for detail pane
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  // Always get the latest version of selectedJob from jobs array (scores update async)
  const currentJob = useMemo(() => {
    if (!selectedJob) return null;
    return jobs.find(j => j.id === selectedJob.id) || selectedJob;
  }, [selectedJob, jobs]);

  // Cover letter modal
  const [coverLetterJob, setCoverLetterJob] = useState<Job | null>(null);
  const [coverLetterOpen, setCoverLetterOpen] = useState(false);

  // Scoring state
  const [scoringId, setScoringId] = useState<string | null>(null);
  const [scoringIds, setScoringIds] = useState<Set<string>>(new Set());
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());

  // Filters
  const [filters, setFilters] = useState<Filters>({
    country: "all", jobType: "all", freshness: "all",
    minScore: "all", source: "all", visaOnly: false,
  });

  const activeFilterCount = useMemo(() => {
    let c = 0;
    if (filters.country !== "all") c++;
    if (filters.jobType !== "all") c++;
    if (filters.freshness !== "all") c++;
    if (filters.minScore !== "all") c++;
    if (filters.source !== "all") c++;
    if (filters.visaOnly) c++;
    return c;
  }, [filters]);

  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      if (filters.country !== "all" && !(job.location || "").toLowerCase().includes(filters.country.toLowerCase())) return false;
      if (filters.jobType === "remote" && !job.is_remote) return false;
      if (filters.jobType === "onsite" && job.is_remote) return false;
      if (filters.freshness !== "all" && job.posted_date) {
        const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - parseInt(filters.freshness));
        if (new Date(job.posted_date) < cutoff) return false;
      }
      // Score filter — show scored jobs that pass + all unscored jobs
      if (filters.minScore !== "all") {
        const min = parseInt(filters.minScore);
        if (job.score !== undefined && job.score < min) return false;
      }
      if (filters.source !== "all" && job.source !== filters.source) return false;
      if (filters.visaOnly && !job.visa_sponsorship) return false;
      return true;
    });
  }, [jobs, filters]);

  // Demo data on load
  useEffect(() => {
    if (isDemo && !searched) { setJobs(DEMO_JOBS as Job[]); setSearched(true); }
  }, [isDemo, searched]);

  // Auto-search when navigated from onboarding
  const autoSearch = searchParams.get("autoSearch") === "true";
  useEffect(() => {
    if (autoSearch && !searched && !loading && selectedCompanies.length > 0) {
      handleSearch();
    }
  }, [autoSearch]);

  // Keyboard navigation
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex(i => { const next = Math.min(i + 1, filteredJobs.length - 1); setSelectedJob(filteredJobs[next]); return next; });
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex(i => { const next = Math.max(i - 1, 0); setSelectedJob(filteredJobs[next]); return next; });
      } else if (e.key === "Escape") {
        setSelectedJob(null); setSelectedIndex(-1);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [filteredJobs]);

  function toggleCompany(company: Company) {
    setSelectedCompanies(prev =>
      prev.find(c => c.slug === company.slug)
        ? prev.filter(c => c.slug !== company.slug)
        : [...prev, company]
    );
  }

  async function handleSearch() {
    if (isDemo) {
      const q = query.toLowerCase();
      const filtered = DEMO_JOBS.filter((j) => j.title.toLowerCase().includes(q) || j.company.toLowerCase().includes(q));
      setJobs(filtered as Job[]); setSearched(true); return;
    }
    setLoading(true); setError("");
    try {
      if (selectedCompanies.length > 0) {
        // Get profile keywords for relevancy filtering
        const profile = getProfile();
        const keywords = profile?.keywords || profile?.primary_skills || [];
        // Include anchor skill and target titles as keywords too
        const allKeywords = [
          ...(profile?.anchor_skill ? [profile.anchor_skill] : []),
          ...keywords,
          ...(profile?.target_titles || []),
          "engineer", "developer", "software", "backend", "frontend", "full stack", "fullstack",
        ];
        const results = await searchCompanies(selectedCompanies, {
          query,
          remoteOnly: filters.jobType === "remote",
          keywords: allKeywords,
        });
        setJobs(results as Job[]);
        // Auto-score top 5 in background
        setTimeout(() => autoScoreTop(results as Job[]), 100);
      } else {
        const keys = getKeys();
        if (!keys.apify) { setError("Select companies above (free) or add Apify key for broad search."); setLoading(false); return; }
        const result = await callTool("search_jobs", { posted_within_days: postedDays }, keys);
        let jobList = result.jobs || [];
        if (query.trim()) { const q = query.toLowerCase(); jobList = jobList.filter((j: Job) => j.title.toLowerCase().includes(q) || j.company.toLowerCase().includes(q)); }
        setJobs(jobList);
        setTimeout(() => autoScoreTop(jobList), 100);
      }
      setSearched(true);
    } catch (e: any) { setError(e.message || "Search failed."); }
    finally { setLoading(false); }
  }

  // Auto-score top 5 jobs after search results load
  async function autoScoreTop(jobsToScore: Job[]) {
    const keys = getKeys();
    if (!keys.gemini) return;

    const top5 = jobsToScore.slice(0, 5);
    const ids = new Set(top5.map(j => j.id));
    setScoringIds(ids);

    for (const job of top5) {
      try {
        // Try MCP first
        let scored = false;
        try {
          const result = await callTool("score_job", {
            title: job.title, company: job.company, url: job.url,
            text: job.text || `${job.title} at ${job.company}`,
            location: job.location || "", is_remote: job.is_remote || false,
          }, keys);
          if (!result.error && result.final_score !== undefined) {
            setJobs(prev => prev.map(j => j.id === job.id ? { ...j, score: result.final_score, skill_bonus: result.skill_bonus, reasoning: result.reasoning } : j));
            scored = true;
          }
        } catch {}

        // Fallback: direct Gemini
        if (!scored && keys.gemini) {
          const prompt = `Score this job 0-100 for fit. Consider title, tech stack, seniority, location.\n\nJob: ${job.title} at ${job.company}\nLocation: ${job.location || "N/A"}\nRemote: ${job.is_remote ? "Yes" : "No"}\nDescription: ${(job.text || "").slice(0, 1500)}\n\nRespond JSON only: {"score": <0-100>, "reasoning": "<1-2 sentences>"}`;
          const models = ["gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-2.5-flash-lite", "gemini-2.5-flash"];
          for (const model of models) {
            try {
              const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${keys.gemini}`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
              });
              if (!resp.ok) { if (resp.status === 429) continue; break; }
              const data = await resp.json();
              let raw = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
              raw = raw.trim().replace(/^```json\s*/, "").replace(/^```\s*/, "").replace(/```\s*$/, "").trim();
              const parsed = JSON.parse(raw);
              setJobs(prev => prev.map(j => j.id === job.id ? { ...j, score: Math.min(parsed.score || 0, 100), reasoning: parsed.reasoning || "" } : j));
              break;
            } catch { continue; }
          }
        }
      } catch {}
      finally {
        setScoringIds(prev => { const next = new Set(prev); next.delete(job.id); return next; });
      }
    }
  }

  async function handleScoreJob(job: Job) {
    setScoringIds(prev => new Set([...prev, job.id]));
    try {
      const keys = getKeys();

      // Try MCP server first
      try {
        const result = await callTool("score_job", {
          title: job.title, company: job.company, url: job.url,
          text: job.text || `${job.title} at ${job.company}`,
          location: job.location || "", is_remote: job.is_remote || false,
        }, keys);
        if (!result.error) {
          setJobs(prev => prev.map(j => j.id === job.id ? { ...j, score: result.final_score, skill_bonus: result.skill_bonus, reasoning: result.reasoning } : j));
          if (selectedJob?.id === job.id) setSelectedJob({ ...job, score: result.final_score, skill_bonus: result.skill_bonus, reasoning: result.reasoning });
          return;
        }
      } catch {
        // MCP not available, fall through to direct Gemini
      }

      // Fallback: direct Gemini scoring
      if (!keys.gemini) return;

      const prompt = `Score this job 0-100 for fit against the candidate profile. Consider title alignment, tech stack, seniority, and location.

Job: ${job.title} at ${job.company}
Location: ${job.location || "Not specified"}
Remote: ${job.is_remote ? "Yes" : "No"}
Description: ${(job.text || "").slice(0, 2000)}

Respond with valid JSON only:
{"score": <0-100>, "reasoning": "<2 sentences>"}`;

      const models = ["gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-2.5-flash-lite", "gemini-2.5-flash"];
      let data: any = null;
      for (const model of models) {
        const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${keys.gemini}`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        });
        if (resp.ok) { data = await resp.json(); break; }
        if (resp.status === 429) continue;
        break;
      }

      if (data) {
        let raw = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
        raw = raw.trim().replace(/^```json\s*/, "").replace(/^```\s*/, "").replace(/```\s*$/, "").trim();
        try {
          const parsed = JSON.parse(raw);
          const score = Math.min(parsed.score || 0, 100);
          const reasoning = parsed.reasoning || "";
          setJobs(prev => prev.map(j => j.id === job.id ? { ...j, score, reasoning } : j));
          if (selectedJob?.id === job.id) setSelectedJob({ ...job, score, reasoning });
        } catch {}
      }
    } catch {}
    finally { setScoringIds(prev => { const next = new Set(prev); next.delete(job.id); return next; }); }
  }

  async function handleBookmark(job: Job) {
    try {
      const keys = getKeys();
      await callTool("save_job", { job_id: job.id, title: job.title, company: job.company, url: job.url }, keys);
      setBookmarkedIds(prev => new Set([...prev, job.id]));
    } catch {}
  }

  function resetFilters() {
    setFilters({ country: "all", jobType: "all", freshness: "all", minScore: "all", source: "all", visaOnly: false });
  }

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <header className="flex items-center gap-3 px-4 h-14 border-b border-border/50 shrink-0">
        <div className="flex-1 max-w-md">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search roles, companies..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="pl-9 h-9 bg-muted/30 border-transparent focus:border-border"
            />
          </div>
        </div>
        <Button
          variant={showFilters ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setShowFilters(!showFilters)}
          className="relative h-8"
        >
          <Filter className="w-3.5 h-3.5" />
          <span className="ml-1.5 text-xs">Filters</span>
          {activeFilterCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-violet-500 text-white text-[9px] rounded-full w-4 h-4 flex items-center justify-center font-bold">
              {activeFilterCount}
            </span>
          )}
        </Button>
        <Button
          variant={showCompanies ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setShowCompanies(!showCompanies)}
          className="h-8"
        >
          <Building2 className="w-3.5 h-3.5" />
          <span className="ml-1.5 text-xs">{selectedCompanies.length} cos</span>
        </Button>
        <Button onClick={handleSearch} disabled={loading} size="sm" className="h-8 px-4">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
          <span className="ml-1.5 text-xs">Search</span>
        </Button>
      </header>

      {/* Filter bar (collapsible) */}
      <AnimatePresence>
        {showFilters && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="border-b border-border/50 overflow-hidden"
          >
            <div className="px-4 py-3 flex flex-wrap items-center gap-3">
              <select value={filters.country} onChange={(e) => setFilters({ ...filters, country: e.target.value })}
                className="h-7 rounded-md border border-input bg-muted/30 px-2 text-xs">
                <option value="all">All countries</option>
                {STATIC_COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={filters.jobType} onChange={(e) => setFilters({ ...filters, jobType: e.target.value as JobType })}
                className="h-7 rounded-md border border-input bg-muted/30 px-2 text-xs">
                <option value="all">All types</option>
                <option value="remote">Remote</option>
                <option value="onsite">On-site</option>
                <option value="hybrid">Hybrid</option>
              </select>
              <select value={filters.freshness} onChange={(e) => setFilters({ ...filters, freshness: e.target.value as Freshness })}
                className="h-7 rounded-md border border-input bg-muted/30 px-2 text-xs">
                <option value="all">Any time</option>
                <option value="1">24h</option>
                <option value="3">3 days</option>
                <option value="7">Week</option>
                <option value="14">2 weeks</option>
                <option value="30">Month</option>
              </select>
              <select value={filters.minScore} onChange={(e) => setFilters({ ...filters, minScore: e.target.value as ScoreRange })}
                className="h-7 rounded-md border border-input bg-muted/30 px-2 text-xs">
                <option value="all">Any score</option>
                <option value="80">80+</option>
                <option value="60">60+</option>
                <option value="40">40+</option>
              </select>
              <select value={filters.source} onChange={(e) => setFilters({ ...filters, source: e.target.value })}
                className="h-7 rounded-md border border-input bg-muted/30 px-2 text-xs">
                <option value="all">All sources</option>
                {STATIC_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                <input type="checkbox" checked={filters.visaOnly} onChange={(e) => setFilters({ ...filters, visaOnly: e.target.checked })} className="rounded w-3 h-3" />
                Visa
              </label>
              {activeFilterCount > 0 && (
                <button onClick={resetFilters} className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1">
                  <X className="w-3 h-3" /> Clear
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Company picker (collapsible) */}
      <AnimatePresence>
        {showCompanies && !isDemo && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="border-b border-border/50 overflow-hidden"
          >
            <div className="px-4 py-3 max-h-32 overflow-y-auto">
              {CATEGORIES.map(cat => (
                <div key={cat} className="mb-1.5">
                  <span className="text-[9px] text-muted-foreground uppercase tracking-wider">{cat}</span>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {COMPANIES.filter(c => c.category === cat).map(company => {
                      const selected = selectedCompanies.some(s => s.slug === company.slug);
                      return (
                        <button key={company.slug} onClick={() => toggleCompany(company)}
                          className={`px-2 py-0.5 rounded text-[10px] border transition-all ${
                            selected ? "bg-violet-500/20 text-violet-300 border-violet-500/30" : "bg-transparent text-muted-foreground border-border/50 hover:border-border"
                          }`}
                        >{company.name}</button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error */}
      {error && (
        <div className="mx-4 mt-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Split pane: list + detail */}
      <div className="flex-1 flex overflow-hidden">
        {/* Job list */}
        <div className={`${selectedJob ? "w-[380px] min-w-[380px]" : "flex-1 max-w-3xl mx-auto"} border-r border-border/30 overflow-y-auto transition-all duration-200`}>
          {!searched ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-8">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500/20 to-indigo-500/20 flex items-center justify-center mb-4">
                <Sparkles className="w-6 h-6 text-violet-400" />
              </div>
              <h2 className="text-lg font-medium mb-1">Find your next role</h2>
              <p className="text-sm text-muted-foreground max-w-sm">
                Select companies above and hit Search, or use keyboard shortcuts: <kbd className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono">j</kbd>/<kbd className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono">k</kbd> to navigate, <kbd className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono">Esc</kbd> to close
              </p>
            </div>
          ) : filteredJobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-8">
              <p className="text-sm text-muted-foreground">
                {jobs.length > 0 ? "No results match your filters." : "No jobs found. Try different companies or keywords."}
              </p>
              {activeFilterCount > 0 && <button onClick={resetFilters} className="mt-2 text-xs text-violet-400 hover:underline">Clear filters</button>}
            </div>
          ) : (
            <div className="divide-y divide-border/30">
              {/* Result count */}
              <div className="px-4 py-2 text-[11px] text-muted-foreground sticky top-0 bg-background/80 backdrop-blur-sm z-10 flex items-center gap-2">
                <span>{filteredJobs.length} result{filteredJobs.length !== 1 ? "s" : ""}</span>
                {filteredJobs.length !== jobs.length && <span>(of {jobs.length})</span>}
                {filteredJobs.some(j => j.score) && (
                  <span className="text-emerald-400">{filteredJobs.filter(j => j.score).length} scored</span>
                )}
                {scoringIds.size > 0 && (
                  <span className="flex items-center gap-1 text-violet-400"><Loader2 className="w-3 h-3 animate-spin" />scoring...</span>
                )}
              </div>

              {/* Job rows */}
              {filteredJobs.map((job, idx) => (
                <button
                  key={job.id}
                  onClick={() => { setSelectedJob(job); setSelectedIndex(idx); }}
                  className={`w-full text-left px-4 py-3 transition-colors hover:bg-accent/30 ${
                    selectedJob?.id === job.id ? "bg-accent/50 border-l-2 border-violet-500" : "border-l-2 border-transparent"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <ScoreRing score={job.score} scoring={scoringIds.has(job.id)} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{job.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{job.company} · {job.location}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <SourceBadge source={job.source} />
                        {job.is_remote && <span className="text-[10px] text-emerald-400">Remote</span>}
                        {job.posted_date && <span className="text-[10px] text-muted-foreground">{job.posted_date}</span>}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Detail pane */}
        <AnimatePresence>
          {currentJob && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="flex-1 overflow-y-auto"
            >
              <div className="p-6 max-w-2xl">
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="text-xl font-semibold">{currentJob.title}</h2>
                    <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-2">
                      <Building2 className="w-3.5 h-3.5" />
                      {currentJob.company}
                    </p>
                  </div>
                  <button onClick={() => { setSelectedJob(null); setSelectedIndex(-1); }}
                    className="p-1.5 rounded-md hover:bg-accent transition-colors">
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>

                {/* Meta */}
                <div className="flex flex-wrap gap-2 mb-5">
                  {currentJob.location && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded">
                      <MapPin className="w-3 h-3" />{currentJob.location}
                    </span>
                  )}
                  {currentJob.posted_date && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded">
                      <Calendar className="w-3 h-3" />{currentJob.posted_date}
                    </span>
                  )}
                  {currentJob.is_remote && <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-400">Remote</Badge>}
                  {currentJob.visa_sponsorship && <Badge variant="outline" className="text-[10px] border-blue-500/30 text-blue-400">Visa</Badge>}
                  <SourceBadge source={currentJob.source} />
                </div>

                {/* Score section */}
                <div className="mb-5 p-4 rounded-lg bg-muted/30 border border-border/50">
                  {currentJob.score ? (
                    <div className="flex items-center gap-4">
                      <ScoreRing score={currentJob.score} size="lg" scoring={scoringIds.has(currentJob.id)} />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">Match Score</span>
                          {currentJob.skill_bonus ? (
                            <span className="text-[10px] text-emerald-400 flex items-center gap-0.5">
                              <Zap className="w-3 h-3" />+{currentJob.skill_bonus}
                            </span>
                          ) : null}
                        </div>
                        {currentJob.reasoning && (
                          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{currentJob.reasoning}</p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <Button variant="outline" size="sm" onClick={() => handleScoreJob(currentJob)}
                        disabled={scoringIds.has(currentJob.id)} className="h-8">
                        {scoringIds.has(currentJob.id) ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Zap className="w-3.5 h-3.5 mr-1.5" />}
                        Score this job
                      </Button>
                      <span className="text-[10px] text-muted-foreground">Uses Gemini to evaluate fit against your resume</span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 mb-5">
                  <a href={currentJob.url} target="_blank" rel="noopener">
                    <Button size="sm" className="h-8 bg-violet-600 hover:bg-violet-700 text-white">
                      <ExternalLink className="w-3.5 h-3.5 mr-1.5" />Apply
                    </Button>
                  </a>
                  <Button variant="outline" size="sm" className="h-8"
                    onClick={() => { setCoverLetterJob(currentJob); setCoverLetterOpen(true); }}>
                    <FileText className="w-3.5 h-3.5 mr-1.5" />Cover Letter
                  </Button>
                  <Button variant="outline" size="sm" className="h-8"
                    onClick={() => handleBookmark(currentJob)}
                    disabled={bookmarkedIds.has(currentJob.id)}>
                    <Bookmark className={`w-3.5 h-3.5 mr-1.5 ${bookmarkedIds.has(currentJob.id) ? "fill-current text-violet-400" : ""}`} />
                    {bookmarkedIds.has(currentJob.id) ? "Saved" : "Save"}
                  </Button>
                </div>

                <Separator className="mb-5" />

                {/* Job description */}
                {currentJob.text ? (
                  <div>
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Description</h4>
                    <div className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed">
                      {currentJob.text}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">
                    No description available.{" "}
                    <a href={currentJob.url} target="_blank" rel="noopener" className="text-violet-400 hover:underline">
                      View on source
                    </a>
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Cover letter modal */}
      <CoverLetterModal
        open={coverLetterOpen}
        onOpenChange={setCoverLetterOpen}
        job={coverLetterJob}
      />
    </div>
  );
}
