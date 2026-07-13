"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CheckCircle, XCircle, Loader2, ExternalLink, Upload, Sparkles } from "lucide-react";
import { saveKeys, validateGeminiKey, validateApifyKey } from "@/lib/keys";

type KeyStatus = "idle" | "validating" | "valid" | "invalid";

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);

  // Step 1: Keys
  const [geminiKey, setGeminiKey] = useState("");
  const [apifyKey, setApifyKey] = useState("");
  const [geminiStatus, setGeminiStatus] = useState<KeyStatus>("idle");
  const [apifyStatus, setApifyStatus] = useState<KeyStatus>("idle");
  const [geminiError, setGeminiError] = useState("");
  const [apifyError, setApifyError] = useState("");

  // Step 2: Resume
  const [resume, setResume] = useState("");

  // Step 3: Profile preview
  const [profile, setProfile] = useState<any>(null);

  async function handleValidateGemini() {
    if (!geminiKey.trim()) return;
    setGeminiStatus("validating");
    const result = await validateGeminiKey(geminiKey.trim());
    setGeminiStatus(result.valid ? "valid" : "invalid");
    setGeminiError(result.error || "");
  }

  async function handleValidateApify() {
    if (!apifyKey.trim()) return;
    setApifyStatus("validating");
    const result = await validateApifyKey(apifyKey.trim());
    setApifyStatus(result.valid ? "valid" : "invalid");
    setApifyError(result.error || "");
  }

  function handleKeysNext() {
    saveKeys({ gemini: geminiKey.trim(), apify: apifyKey.trim() });
    setStep(2);
  }

  function handleSkipKeys() {
    router.push("/discover?demo=true");
  }

  function handleResumeNext() {
    // In a real app, this would call bootstrap via MCP
    // For now, simulate a profile extraction
    setProfile({
      anchor_skill: "Ruby on Rails",
      primary_skills: ["AWS", "Node.js", "TypeScript", "Microservices"],
      search_terms: ["Technical Lead Ruby on Rails India", "Backend Architect AWS Remote"],
      location: "Bengaluru, India",
      seniority: "lead",
    });
    setStep(3);
  }

  function handleComplete() {
    router.push("/discover");
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {/* Progress */}
        <div className="flex items-center gap-2 mb-8">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                step >= s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}>
                {step > s ? "✓" : s}
              </div>
              {s < 3 && <div className={`h-0.5 w-12 ${step > s ? "bg-primary" : "bg-muted"}`} />}
            </div>
          ))}
          <span className="ml-4 text-sm text-muted-foreground">
            {step === 1 && "API Keys"}
            {step === 2 && "Resume"}
            {step === 3 && "Profile"}
          </span>
        </div>

        {/* Step 1: API Keys */}
        {step === 1 && (
          <Card className="p-6 space-y-6">
            <div>
              <h1 className="text-2xl font-bold">Connect your AI services</h1>
              <p className="text-muted-foreground mt-1">
                Your keys stay on your device. We never store or see them.
              </p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              {/* Gemini */}
              <div className="space-y-3 p-4 border rounded-lg">
                <div className="flex items-center justify-between">
                  <Label className="font-semibold">Gemini AI</Label>
                  <Badge variant="secondary">Free</Badge>
                </div>
                <p className="text-xs text-muted-foreground">Powers job scoring & cover letters</p>
                <a
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noopener"
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  Get a free key <ExternalLink className="w-3 h-3" />
                </a>
                <Input
                  type="password"
                  placeholder="Paste your Gemini API key"
                  value={geminiKey}
                  onChange={(e) => { setGeminiKey(e.target.value); setGeminiStatus("idle"); }}
                  onBlur={handleValidateGemini}
                />
                <div className="h-5 flex items-center gap-1 text-xs">
                  {geminiStatus === "validating" && <><Loader2 className="w-3 h-3 animate-spin" /> Validating...</>}
                  {geminiStatus === "valid" && <><CheckCircle className="w-3 h-3 text-green-500" /> Ready</>}
                  {geminiStatus === "invalid" && <><XCircle className="w-3 h-3 text-red-500" /> {geminiError}</>}
                </div>
              </div>

              {/* Apify */}
              <div className="space-y-3 p-4 border rounded-lg">
                <div className="flex items-center justify-between">
                  <Label className="font-semibold">Apify</Label>
                  <Badge variant="secondary">~$0.01/search</Badge>
                </div>
                <p className="text-xs text-muted-foreground">Scrapes LinkedIn, Indeed, Glassdoor, Naukri</p>
                <a
                  href="https://console.apify.com/account/integrations"
                  target="_blank"
                  rel="noopener"
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  Get your API token <ExternalLink className="w-3 h-3" />
                </a>
                <Input
                  type="password"
                  placeholder="Paste your Apify API token"
                  value={apifyKey}
                  onChange={(e) => { setApifyKey(e.target.value); setApifyStatus("idle"); }}
                  onBlur={handleValidateApify}
                />
                <div className="h-5 flex items-center gap-1 text-xs">
                  {apifyStatus === "validating" && <><Loader2 className="w-3 h-3 animate-spin" /> Validating...</>}
                  {apifyStatus === "valid" && <><CheckCircle className="w-3 h-3 text-green-500" /> Ready</>}
                  {apifyStatus === "invalid" && <><XCircle className="w-3 h-3 text-red-500" /> {apifyError}</>}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  We don&apos;t charge you. Apify bills your account directly. Most users spend &lt;$1/month.
                </p>
              </div>
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <Button variant="ghost" onClick={handleSkipKeys}>
                Skip for now (demo mode)
              </Button>
              <Button
                onClick={handleKeysNext}
                disabled={!geminiKey.trim() || !apifyKey.trim()}
              >
                Next: Upload Resume →
              </Button>
            </div>
          </Card>
        )}

        {/* Step 2: Resume */}
        {step === 2 && (
          <Card className="p-6 space-y-6">
            <div>
              <h1 className="text-2xl font-bold">Add your resume</h1>
              <p className="text-muted-foreground mt-1">
                AI extracts your skills, target titles, and search terms from this.
              </p>
            </div>

            <div className="space-y-3">
              <Label>Paste your resume (plain text)</Label>
              <textarea
                className="w-full h-64 p-3 border rounded-lg bg-background text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Paste your resume here...&#10;&#10;Name&#10;Title | Location | email@example.com&#10;&#10;SUMMARY&#10;...&#10;&#10;EXPERIENCE&#10;..."
                value={resume}
                onChange={(e) => setResume(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {resume.length > 0 ? `${resume.length} characters` : "Tip: Plain text works best. Copy from your .txt resume file."}
              </p>
            </div>

            <div className="flex items-center justify-between">
              <Button variant="ghost" onClick={() => setStep(1)}>← Back</Button>
              <Button onClick={handleResumeNext} disabled={resume.length < 100}>
                <Sparkles className="w-4 h-4 mr-2" /> Extract Profile
              </Button>
            </div>
          </Card>
        )}

        {/* Step 3: Profile Preview */}
        {step === 3 && profile && (
          <Card className="p-6 space-y-6">
            <div>
              <h1 className="text-2xl font-bold">Your profile</h1>
              <p className="text-muted-foreground mt-1">
                This is what we extracted from your resume. Looks right?
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <Label className="text-xs text-muted-foreground">Anchor Skill (highest priority)</Label>
                <p className="text-lg font-semibold">{profile.anchor_skill}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Primary Skills</Label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {profile.primary_skills.map((s: string) => (
                    <Badge key={s} variant="outline">{s}</Badge>
                  ))}
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Search Terms</Label>
                <ul className="mt-1 text-sm space-y-1">
                  {profile.search_terms.map((t: string) => (
                    <li key={t} className="text-muted-foreground">• {t}</li>
                  ))}
                </ul>
              </div>
              <div className="flex gap-8">
                <div>
                  <Label className="text-xs text-muted-foreground">Location</Label>
                  <p className="text-sm">{profile.location}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Seniority</Label>
                  <p className="text-sm capitalize">{profile.seniority}</p>
                </div>
              </div>
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <Button variant="ghost" onClick={() => setStep(2)}>← Back</Button>
              <Button onClick={handleComplete}>
                Looks good — Start Searching →
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
