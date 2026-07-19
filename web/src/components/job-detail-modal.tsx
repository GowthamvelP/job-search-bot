"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Loader2,
  ExternalLink,
  Bookmark,
  FileText,
  MapPin,
  Calendar,
  Building2,
  Zap,
  Star,
} from "lucide-react";
import { callTool } from "@/lib/mcp-client";
import { getKeys } from "@/lib/keys";

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

interface JobDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: Job | null;
  onGenerateCoverLetter: (job: Job) => void;
}

function ScoreRing({ score }: { score: number }) {
  const color = score >= 80 ? "text-green-500" : score >= 60 ? "text-yellow-500" : "text-red-400";
  return (
    <div className={`flex items-center gap-1.5 ${color}`}>
      <Star className="w-5 h-5 fill-current" />
      <span className="text-2xl font-bold">{score}</span>
      <span className="text-sm text-muted-foreground">/100</span>
    </div>
  );
}

export function JobDetailModal({ open, onOpenChange, job, onGenerateCoverLetter }: JobDetailModalProps) {
  const [scoring, setScoring] = useState(false);
  const [scoreResult, setScoreResult] = useState<{ score: number; reasoning: string; skill_bonus: number } | null>(null);
  const [scoreError, setScoreError] = useState("");
  const [bookmarked, setBookmarked] = useState(false);
  const [bookmarking, setBookmarking] = useState(false);

  async function handleScore() {
    if (!job) return;
    setScoring(true);
    setScoreError("");

    try {
      const keys = getKeys();
      const result = await callTool(
        "score_job",
        {
          title: job.title,
          company: job.company,
          url: job.url,
          text: job.text || `${job.title} at ${job.company} - ${job.location}`,
          location: job.location || "",
          is_remote: job.is_remote || false,
        },
        keys
      );

      if (result.error) {
        throw new Error(result.error);
      }

      setScoreResult({
        score: result.final_score,
        reasoning: result.reasoning,
        skill_bonus: result.skill_bonus,
      });
    } catch (err: any) {
      setScoreError(err.message || "Scoring failed");
    } finally {
      setScoring(false);
    }
  }

  async function handleBookmark() {
    if (!job) return;
    setBookmarking(true);
    try {
      const keys = getKeys();
      await callTool("save_job", { job_id: job.id, title: job.title, company: job.company, url: job.url }, keys);
      setBookmarked(true);
    } catch {
      // Silently fail — not critical
    } finally {
      setBookmarking(false);
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setScoreResult(null);
      setScoreError("");
      setBookmarked(false);
    }
    onOpenChange(nextOpen);
  }

  if (!job) return null;

  const displayScore = scoreResult?.score ?? job.score;
  const displayReasoning = scoreResult?.reasoning ?? job.reasoning;
  const displaySkillBonus = scoreResult?.skill_bonus ?? job.skill_bonus;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-lg">{job.title}</DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            <Building2 className="w-3.5 h-3.5" />
            {job.company}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 space-y-4">
          {/* Meta info */}
          <div className="flex flex-wrap gap-3 text-sm">
            {job.location && (
              <span className="flex items-center gap-1 text-muted-foreground">
                <MapPin className="w-3.5 h-3.5" />
                {job.location}
              </span>
            )}
            {job.posted_date && (
              <span className="flex items-center gap-1 text-muted-foreground">
                <Calendar className="w-3.5 h-3.5" />
                {job.posted_date}
              </span>
            )}
            {job.is_remote && <Badge variant="outline">Remote</Badge>}
            {job.visa_sponsorship && <Badge variant="outline">Visa Sponsorship</Badge>}
            <Badge variant="secondary" className="text-[10px]">{job.source}</Badge>
          </div>

          <Separator />

          {/* Score section */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Relevancy Score</h4>
            {displayScore ? (
              <div className="space-y-2">
                <div className="flex items-center gap-4">
                  <ScoreRing score={displayScore} />
                  {displaySkillBonus ? (
                    <span className="text-xs text-green-500 flex items-center gap-1">
                      <Zap className="w-3 h-3" />
                      +{displaySkillBonus} skill bonus
                    </span>
                  ) : null}
                </div>
                {displayReasoning && (
                  <p className="text-sm text-muted-foreground">{displayReasoning}</p>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-3">
                {scoring ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Scoring against your resume...
                  </div>
                ) : (
                  <Button variant="outline" size="sm" onClick={handleScore}>
                    <Zap className="w-4 h-4 mr-1" />
                    Score this job
                  </Button>
                )}
                {scoreError && (
                  <span className="text-xs text-red-500">{scoreError}</span>
                )}
              </div>
            )}
          </div>

          <Separator />

          {/* Description */}
          {job.text && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Job Description</h4>
              <div className="text-sm text-muted-foreground whitespace-pre-wrap max-h-60 overflow-y-auto bg-muted/30 rounded-lg p-3 leading-relaxed">
                {job.text}
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-3 border-t">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onGenerateCoverLetter(job)}
          >
            <FileText className="w-4 h-4 mr-1" />
            Cover Letter
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleBookmark}
            disabled={bookmarked || bookmarking}
          >
            <Bookmark className={`w-4 h-4 mr-1 ${bookmarked ? "fill-current" : ""}`} />
            {bookmarked ? "Saved" : bookmarking ? "..." : "Save"}
          </Button>
          <div className="flex-1" />
          <a href={job.url} target="_blank" rel="noopener">
            <Button size="sm">
              <ExternalLink className="w-4 h-4 mr-1" />
              Apply
            </Button>
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}
