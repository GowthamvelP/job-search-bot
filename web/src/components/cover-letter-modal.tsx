"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, Copy, Download, Check } from "lucide-react";
import { callTool } from "@/lib/mcp-client";
import { getKeys } from "@/lib/keys";

interface CoverLetterModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: {
    title: string;
    company: string;
    location?: string;
    url?: string;
    text?: string;
  } | null;
}

export function CoverLetterModal({ open, onOpenChange, job }: CoverLetterModalProps) {
  const [materials, setMaterials] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  async function generate() {
    if (!job) return;
    setLoading(true);
    setError("");
    setMaterials("");

    try {
      const keys = getKeys();

      // Try MCP server first
      try {
        const result = await callTool(
          "generate_cover_letter",
          {
            title: job.title,
            company: job.company,
            text: job.text || `${job.title} at ${job.company}`,
            location: job.location || "",
            url: job.url || "",
          },
          keys
        );

        if (result.status === "error") {
          throw new Error(result.message || "MCP generation failed");
        }
        if (result.materials) {
          setMaterials(result.materials);
          return;
        }
      } catch {
        // MCP server not available — fall through to direct Gemini
      }

      // Fallback: call Gemini directly from browser
      if (!keys.gemini) {
        throw new Error("Gemini API key required. Add it in Profile settings.");
      }

      const prompt = `You are a career advisor helping a candidate apply for a job.

JOB POSTING:
Title: ${job.title}
Company: ${job.company}
Location: ${job.location || "Not specified"}
Description:
${job.text || "(no description available)"}

Write two things:
1. 3-5 tailored resume bullet points highlighting relevant experience for this role.
2. A concise, personalised cover letter (3 short paragraphs).

Format with clear headings:
## Resume Bullets
<bullets>

## Cover Letter
<cover letter>`;

      const models = ["gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-2.5-flash-lite", "gemini-2.5-flash"];
      let data: any = null;

      for (const model of models) {
        const resp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${keys.gemini}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
          }
        );
        if (resp.ok) { data = await resp.json(); break; }
        const err = await resp.json().catch(() => null);
        if (resp.status === 429 || err?.error?.message?.includes("quota")) continue;
        throw new Error(err?.error?.message || `Gemini error: ${resp.status}`);
      }

      if (!data) throw new Error("All Gemini models exhausted. Try again in a few minutes.");

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      if (!text) throw new Error("Gemini returned empty response.");
      setMaterials(text.trim());
    } catch (err: any) {
      setError(err.message || "Failed to generate. Check your Gemini API key.");
    } finally {
      setLoading(false);
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(materials);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleDownload() {
    const blob = new Blob([materials], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cover-letter-${job?.company?.replace(/\s+/g, "-").toLowerCase() || "job"}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Reset state when dialog opens
  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen && !materials && !loading) {
      generate();
    }
    if (!nextOpen) {
      setMaterials("");
      setError("");
      setLoading(false);
    }
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Cover Letter & Resume Bullets</DialogTitle>
          <DialogDescription>
            Tailored for {job?.title} at {job?.company}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0">
          {loading && (
            <div className="space-y-3 p-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating tailored materials...
              </div>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-4/6" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          )}

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-sm text-red-500">
              {error}
              <Button variant="ghost" size="sm" onClick={generate} className="ml-2">
                Retry
              </Button>
            </div>
          )}

          {materials && (
            <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap font-mono text-xs leading-relaxed p-2 bg-muted/30 rounded-lg">
              {materials}
            </div>
          )}
        </div>

        {materials && (
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={handleCopy}>
              {copied ? <Check className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />}
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button variant="outline" size="sm" onClick={handleDownload}>
              <Download className="w-4 h-4 mr-1" />
              Download .txt
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
