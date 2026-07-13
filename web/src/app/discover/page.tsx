"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Search, Loader2, ExternalLink, Bookmark, FileText, AlertCircle } from "lucide-react";
import { callTool } from "@/lib/mcp-client";
import { getKeys, hasKeys } from "@/lib/keys";
import { DEMO_JOBS } from "@/data/demo-jobs";

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
  const isDemo = searchParams.get("demo") === "true" || !hasKeys();

  const [query, setQuery] = useState("");
  const [postedDays, setPostedDays] = useState(7);
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");

  // Show demo data on first load if in demo mode
  useEffect(() => {
    if (isDemo && !searched) {
      setJobs(DEMO_JOBS as Job[]);
      setSearched(true);
    }
  }, [isDemo, searched]);

  async function handleSearch() {
    if (isDemo) {
      // Filter demo data by query
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
      const keys = getKeys();
      const result = await callTool("search_jobs", { posted_within_days: postedDays }, keys);
      let jobList = result.jobs || [];

      // Client-side filter by query if provided
      if (query.trim()) {
        const q = query.toLowerCase();
        jobList = jobList.filter((j: Job) =>
          j.title.toLowerCase().includes(q) ||
          j.company.toLowerCase().includes(q) ||
          j.location.toLowerCase().includes(q)
        );
      }

      // Client-side filter for remote
      if (remoteOnly) {
        jobList = jobList.filter((j: Job) => j.is_remote);
      }

      setJobs(jobList);
      setSearched(true);
    } catch (e: any) {
      setError(e.message || "Search failed. Check your API keys.");
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
        <Card className="p-4 mb-6">
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
              <div className="flex items-center gap-2">
                <Label className="text-xs whitespace-nowrap">Last</Label>
                <select
                  className="border rounded px-2 py-1.5 text-sm bg-background"
                  value={postedDays}
                  onChange={(e) => setPostedDays(Number(e.target.value))}
                >
                  <option value={1}>24 hours</option>
                  <option value={3}>3 days</option>
                  <option value={7}>1 week</option>
                  <option value={14}>2 weeks</option>
                  <option value={30}>1 month</option>
                </select>
              </div>
              <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={remoteOnly}
                  onChange={(e) => setRemoteOnly(e.target.checked)}
                  className="rounded"
                />
                Remote
              </label>
              <Button onClick={handleSearch} disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                <span className="ml-2">Search</span>
              </Button>
            </div>
          </div>
        </Card>

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
                {jobs.length} result{jobs.length !== 1 ? "s" : ""}
                {isDemo && " (demo data)"}
              </p>
            </div>

            {jobs.length === 0 ? (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground">No results found. Try a broader search or different time range.</p>
              </Card>
            ) : (
              <div className="space-y-2">
                {jobs.map((job) => (
                  <Card key={job.id} className="p-4 hover:border-primary/50 transition-colors">
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
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" disabled={isDemo} title="Bookmark">
                          <Bookmark className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" disabled={isDemo} title="Cover letter">
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
    </div>
  );
}
