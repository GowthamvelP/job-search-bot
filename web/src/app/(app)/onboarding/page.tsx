"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  CheckCircle,
  XCircle,
  Loader2,
  ExternalLink,
  Upload,
  Sparkles,
  FileText,
} from "lucide-react";
import { saveKeys, validateGeminiKey, validateApifyKey, getKeys } from "@/lib/keys";
import { callTool } from "@/lib/mcp-client";
import { saveProfile, getProfile, clearProfile, UserProfile } from "@/lib/profile";

type KeyStatus = "idle" | "validating" | "valid" | "invalid";

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [existingProfile, setExistingProfile] = useState<UserProfile | null>(null);
  const [showReupload, setShowReupload] = useState(false);

  // Step 1: Keys
  const [geminiKey, setGeminiKey] = useState("");
  const [apifyKey, setApifyKey] = useState("");
  const [geminiStatus, setGeminiStatus] = useState<KeyStatus>("idle");
  const [apifyStatus, setApifyStatus] = useState<KeyStatus>("idle");
  const [geminiError, setGeminiError] = useState("");
  const [apifyError, setApifyError] = useState("");

  // Step 2: Resume
  const [resume, setResume] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileTextPreview, setFileTextPreview] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<
    "idle" | "uploading" | "success" | "error"
  >("idle");
  const [extractionStatus, setExtractionStatus] = useState<
    "idle" | "extracting" | "success" | "error"
  >("idle");
  const [extractError, setExtractError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 3: Profile preview
  const [profile, setProfile] = useState<any>(null);

  // Check for existing profile on mount
  useEffect(() => {
    const p = getProfile();
    if (p && p.anchor_skill) {
      setExistingProfile(p);
    }
  }, []);

  // If user has a profile and isn't re-uploading, show profile view
  if (existingProfile && !showReupload) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="max-w-xl mx-auto p-6 py-12">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold">Your Profile</h1>
            <p className="text-sm text-muted-foreground mt-1">
              This drives your job search scoring and filters
            </p>
          </div>

          <Card className="p-6 space-y-5 border-border/50">
            <div>
              <Label className="text-[11px] text-muted-foreground uppercase tracking-wider">Anchor Skill</Label>
              <p className="text-lg font-semibold mt-0.5">{existingProfile.anchor_skill}</p>
            </div>

            {existingProfile.primary_skills?.length > 0 && (
              <div>
                <Label className="text-[11px] text-muted-foreground uppercase tracking-wider">Primary Skills</Label>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {existingProfile.primary_skills.map((s) => (
                    <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
                  ))}
                </div>
              </div>
            )}

            {existingProfile.search_terms?.length > 0 && (
              <div>
                <Label className="text-[11px] text-muted-foreground uppercase tracking-wider">Search Terms</Label>
                <ul className="mt-1 space-y-0.5">
                  {existingProfile.search_terms.map((t) => (
                    <li key={t} className="text-sm text-muted-foreground">· {t}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex gap-6">
              {existingProfile.location && (
                <div>
                  <Label className="text-[11px] text-muted-foreground uppercase tracking-wider">Location</Label>
                  <p className="text-sm mt-0.5">{existingProfile.location}</p>
                </div>
              )}
              {existingProfile.seniority && (
                <div>
                  <Label className="text-[11px] text-muted-foreground uppercase tracking-wider">Seniority</Label>
                  <p className="text-sm mt-0.5 capitalize">{existingProfile.seniority}</p>
                </div>
              )}
              {existingProfile.years_experience !== undefined && (
                <div>
                  <Label className="text-[11px] text-muted-foreground uppercase tracking-wider">Experience</Label>
                  <p className="text-sm mt-0.5">{existingProfile.years_experience} years</p>
                </div>
              )}
            </div>
          </Card>

          <div className="flex gap-3 mt-6">
            <Button
              variant="outline"
              onClick={() => {
                clearProfile();
                setExistingProfile(null);
                setShowReupload(true);
                setStep(2);
              }}
              className="cursor-pointer"
            >
              Upload new resume
            </Button>
            <Button onClick={() => router.push("/discover")} className="cursor-pointer">
              Go to Discover
            </Button>
          </div>
        </div>
      </div>
    );
  }

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

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleFileDrop = async (files: FileList) => {
    if (files.length > 0) {
      processFile(files[0]);
    }
  };

  const processFile = async (file: File) => {
    setFile(file);
    setUploadStatus("uploading");
    setExtractError("");
    try {
      if (file.type === "text/plain") {
        const text = await file.text();
        setFileTextPreview(text.slice(0, 500));
        setResume(text);
      } else if (file.type === "application/pdf") {
        const { extractTextFromPDF } = await import("@/lib/pdf-extract");
        const text = await extractTextFromPDF(file);
        if (text.length < 50) {
          throw new Error("Could not extract text from this PDF. Please paste your resume text below.");
        }
        setFileTextPreview(text.slice(0, 500));
        setResume(text);
      } else {
        setFileTextPreview("");
        setResume("");
        throw new Error("Unsupported file type. Please upload a PDF or TXT file.");
      }
      setUploadStatus("success");
    } catch (err: any) {
      console.error("File processing error:", err);
      setUploadStatus("error");
      setExtractError(err.message || "Failed to process file. Try pasting your resume text instead.");
    }
  };

  const removeFile = () => {
    setFile(null);
    setFileTextPreview("");
    setResume("");
    setUploadStatus("idle");
  };

  async function handleExtractProfile() {
    if (extractionStatus === "extracting") return;
    setExtractionStatus("extracting");
    setExtractError("");

    const resumeText = resume.trim();
    if (!resumeText || resumeText.length < 100) {
      setExtractError("Resume text is too short. Please paste your full resume.");
      setExtractionStatus("error");
      return;
    }

    if (resumeText.startsWith("[") && resumeText.includes("not yet implemented")) {
      setExtractError("PDF/DOC text extraction failed. Please paste your resume text in the box below.");
      setExtractionStatus("error");
      return;
    }

    try {
      const keys = getKeys();
      if (!keys.gemini) {
        throw new Error("Gemini API key is required for profile extraction.");
      }

      const prompt = `You are a job search assistant. Analyse the resume below and extract structured information to drive an automated job search.

Return ONLY valid JSON — no markdown fences, no explanation outside the JSON object.

The JSON must conform exactly to this schema:
{
  "anchor_skill": "<the candidate's SINGLE most defining technology/framework>",
  "target_titles": ["<primary job title>", "<secondary>"],
  "primary_skills": ["<skill 1>", "<skill 2>", "<skill 3>"],
  "search_terms": ["<search query 1>", "<search query 2>", "<search query 3>"],
  "location": "<city, country>",
  "country": "<country>",
  "years_experience": <integer>,
  "seniority": "<one of: junior | mid | senior | lead | staff | principal>",
  "keywords": ["<keyword 1>", "<keyword 2>"],
  "summary": "<one sentence candidate summary>"
}

Rules for seniority — determine STRICTLY from total years of full-time experience:
  0-1 years = "junior"
  2-3 years = "mid"
  4-6 years = "senior"
  7-9 years = "lead"
  10-12 years = "staff"
  13+ years = "principal"
Do NOT inflate seniority based on project complexity or tech breadth.

Rules for target_titles — must match actual seniority:
  junior (0-1 yrs): "Software Engineer", "Backend Developer", "Junior Developer"
  mid (2-3 yrs): "Software Engineer", "Backend Engineer", "Full Stack Developer"
  Do NOT suggest "Lead", "Staff", or "Architect" for candidates with less than 5 years experience.

Rules for anchor_skill: Must be a specific technology (e.g. "Ruby on Rails", "React", "Python"), NOT a generic term like "backend".

RESUME:
${resumeText}`;

      const models = [
        "gemini-2.0-flash",
        "gemini-2.0-flash-lite",
        "gemini-2.5-flash-lite",
        "gemini-2.5-flash",
        "gemini-2.5-pro",
        "gemini-3.5-flash",
        "gemini-3.1-flash-lite",
        "gemini-3-flash-preview",
      ];

      let data: any = null;
      let lastError = "";

      for (const model of models) {
        const resp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${keys.gemini}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
          }
        );

        if (resp.ok) {
          data = await resp.json();
          break;
        }

        const errData = await resp.json().catch(() => null);
        const errMsg = errData?.error?.message || "";
        if (resp.status === 429 || errMsg.includes("RESOURCE_EXHAUSTED") || errMsg.includes("quota")) {
          lastError = `${model}: quota exhausted`;
          continue;
        }
        throw new Error(errMsg || `Gemini API error: ${resp.status}`);
      }

      if (!data) {
        throw new Error(`All Gemini models exhausted. Last: ${lastError}. Try again in a few minutes.`);
      }

      let raw = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      raw = raw.trim().replace(/^```json\s*/, "").replace(/^```\s*/, "").replace(/```\s*$/, "").trim();

      let extracted;
      try {
        extracted = JSON.parse(raw);
      } catch {
        throw new Error("Gemini didn't return valid JSON. Try pasting your resume as plain text.");
      }

      const profileData = {
        anchor_skill: extracted.anchor_skill || "",
        primary_skills: extracted.primary_skills || [],
        search_terms: extracted.search_terms || [],
        keywords: extracted.keywords || [],
        location: extracted.location || "",
        country: extracted.country || "",
        seniority: extracted.seniority || "",
        email: extracted.email || "",
        summary: extracted.summary || "",
        years_experience: extracted.years_experience || 0,
        target_titles: extracted.target_titles || [],
      };
      setProfile(profileData);
      saveProfile(profileData);
      setExtractionStatus("success");
      await new Promise((resolve) => setTimeout(resolve, 500));
      setStep(3);
    } catch (err: any) {
      console.error("Extraction error:", err);
      setExtractionStatus("error");
      setExtractError(err.message || "Failed to extract profile. Check your Gemini API key.");
    }
  }

  function handleComplete() {
    // Profile is already saved in handleExtractProfile via saveProfile()
    router.push("/discover");
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-xl">
        {/* Header + Stepper */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500/20 to-indigo-500/20 mb-4">
            <Sparkles className="w-6 h-6 text-violet-400" />
          </div>
          <h1 className="text-2xl font-bold">Set up JobAgent</h1>
          <p className="text-sm text-muted-foreground mt-1">3 quick steps to start finding your next role</p>
        </div>

        {/* Step indicators */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {[
            { n: 1, label: "Keys" },
            { n: 2, label: "Resume" },
            { n: 3, label: "Profile" },
          ].map(({ n, label }) => (
            <div key={n} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-all duration-300 ${
                step > n ? "bg-violet-500 text-white" : step === n ? "bg-foreground text-background ring-2 ring-foreground/20 ring-offset-2 ring-offset-background" : "bg-muted text-muted-foreground"
              }`}>
                {step > n ? <CheckCircle className="w-3.5 h-3.5" /> : n}
              </div>
              <span className={`text-xs hidden sm:inline ${step === n ? "text-foreground font-medium" : "text-muted-foreground"}`}>{label}</span>
              {n < 3 && <div className={`w-8 h-px ${step > n ? "bg-violet-500" : "bg-border"}`} />}
            </div>
          ))}
        </div>

        {/* Step content with animation */}
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.2 }}
          >

        {/* Step 1: API Keys */}
        {step === 1 && (
          <Card className="border border-border/50 bg-background/90 backdrop-blur-sm shadow-sm hover:shadow-md transition-shadow duration-200">
            <div className="p-6 space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-foreground">
                  Connect your AI services
                </h1>
                <p className="text-muted-foreground mt-1">
                  Your keys stay on your device. We never store or see them.
                </p>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                {/* Gemini */}
                <div className="space-y-3 p-4 border border-border/20 rounded-lg bg-background/50 hover:bg-background/60 transition-colors duration-200">
                  <div className="flex items-center justify-between">
                    <Label className="font-semibold text-foreground">Gemini AI</Label>
                    <Badge variant="secondary">Free</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Powers job scoring & cover letters
                  </p>
                  <a
                    href="https://aistudio.google.com/apikey"
                    target="_blank"
                    rel="noopener"
                    className="text-xs text-primary hover:text-primary/80 flex items-center gap-1 transition-colors duration-200"
                  >
                    Get a free key <ExternalLink className="w-3 h-3" />
                  </a>
                  <Input
                    type="password"
                    placeholder="Paste your Gemini API key"
                    value={geminiKey}
                    onChange={(e) => {
                      setGeminiKey(e.target.value);
                      setGeminiStatus("idle");
                    }}
                    onBlur={handleValidateGemini}
                    className="bg-background/30 border border-border/30 hover:border-primary/40 focus:border-primary focus:ring-primary/20 focus:ring-2 text-sm font-medium"
                  />
                  <div className="h-5 flex items-center gap-1 text-xs">
                    {geminiStatus === "validating" && (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span className="ml-1">Validating...</span>
                      </>
                    )}
                    {geminiStatus === "valid" && (
                      <>
                        <CheckCircle className="w-3 h-3 text-green-500" />
                        <span className="ml-1">Ready</span>
                      </>
                    )}
                    {geminiStatus === "invalid" && (
                      <>
                        <XCircle className="w-3 h-3 text-red-500" />
                        <span className="ml-1">{geminiError}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Apify */}
                <div className="space-y-3 p-4 border border-border/20 rounded-lg bg-background/50 hover:bg-background/60 transition-colors duration-200">
                  <div className="flex items-center justify-between">
                    <Label className="font-semibold text-foreground">Apify</Label>
                    <Badge variant="secondary">~$0.01/search</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Scrapes LinkedIn, Indeed, Glassdoor, Naukri
                  </p>
                  <a
                    href="https://console.apify.com/account/integrations"
                    target="_blank"
                    rel="noopener"
                    className="text-xs text-primary hover:text-primary/80 flex items-center gap-1 transition-colors duration-200"
                  >
                    Get your API token <ExternalLink className="w-3 h-3" />
                  </a>
                  <Input
                    type="password"
                    placeholder="Paste your Apify API token"
                    value={apifyKey}
                    onChange={(e) => {
                      setApifyKey(e.target.value);
                      setApifyStatus("idle");
                    }}
                    onBlur={handleValidateApify}
                    className="bg-background/30 border border-border/30 hover:border-primary/40 focus:border-primary focus:ring-primary/20 focus:ring-2 text-sm font-medium"
                  />
                  <div className="h-5 flex items-center gap-1 text-xs">
                    {apifyStatus === "validating" && (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span className="ml-1">Validating...</span>
                      </>
                    )}
                    {apifyStatus === "valid" && (
                      <>
                        <CheckCircle className="w-3 h-3 text-green-500" />
                        <span className="ml-1">Ready</span>
                      </> // Fixed: Added missing closing parenthesis
                    )}
                    {apifyStatus === "invalid" && (
                      <>
                        <XCircle className="w-3 h-3 text-red-500" />
                        <span className="ml-1">{apifyError}</span>
                      </> // Fixed: Added missing closing parenthesis
                    )}
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  We don&apos;t charge you. Apify bills your account directly. Most users spend {"<"}$1/month{">"}
                </p>
              </div>

              <Separator className="my-6 border-border/30" />

              <div className="flex items-center justify-between">
                <Button
                  variant="ghost"
                  onClick={handleSkipKeys}
                  className="hover:bg-muted/50 transition-colors duration-200 text-sm font-medium"
                >
                  Skip for now (demo mode)
                </Button>
                <Button
                  onClick={handleKeysNext}
                  disabled={!geminiKey.trim() || !apifyKey.trim()}
                  className="bg-primary hover:bg-primary/90 focus:ring-primary/30 active:bg-primary/80 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 text-sm font-medium px-6 py-2"
                >
                  Next: Upload Resume →
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* Step 2: Resume */}
        {step === 2 && (
          <Card className="border border-border/50 bg-background/90 backdrop-blur-sm shadow-sm hover:shadow-md transition-shadow duration-200">
            <div className="p-6 space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-foreground">
                  Add your resume
                </h1>
                <p className="text-muted-foreground mt-1">
                  AI extracts your skills, target titles, and search terms from this.
                </p>
              </div>

              <div className="space-y-4">
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept=".txt,.pdf"
                  onChange={async (e) => {
                    if (e.target.files?.length) {
                      await handleFileDrop(e.target.files);
                    }
                  }}
                />
                <div
                  className={`border-2 border-dashed rounded-lg p-6 text-center hover:border-primary/20 transition-colors duration-200 cursor-pointer ${
                    dragOver ? "border-primary bg-primary/5" : ""
                  }`}
                  onClick={triggerFileInput}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={async (e) => {
                    e.preventDefault();
                    setDragOver(false);
                    await handleFileDrop(e.dataTransfer.files);
                  }}
                >
                  {!file ? (
                    <>
                      <Upload className="mx-auto h-10 w-10 mb-3 text-primary/80" />
                      <p className="text-sm font-medium text-foreground">
                        Drag & drop your resume here, or click to select
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Supported: PDF, TXT (text extraction for PDF requires backend)
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <FileText className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <p className="font-medium text-foreground">{file.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {Math.round(file.size / 1024)} KB
                            </p>
                          </div>
                        </div>
                        <Button variant="ghost" size="sm" onClick={removeFile} className="hover:bg-muted/50 transition-colors duration-200">
                          <XCircle className="h-4 w-4 text-muted-foreground hover:text-red-500" />
                        </Button>
                      </div>
                      {file.type === "text/plain" && (
                        <div className="mt-4">
                          <p className="text-xs text-muted-foreground mb-1">Preview:</p>
                          <textarea
                            readOnly
                            className="w-full h-24 p-2 border border-border/30 rounded bg-background/50 text-sm focus:border-primary/40 focus:ring-primary/20"
                            value={fileTextPreview}
                          />
                        </div>
                      )}
                      {file.type !== "text/plain" && ( // Fixed: Corrected operator precedence
                        <p className="text-xs text-muted-foreground mt-2">
                          File preview not available for{" "}
                          {file.type.split("/")[0] || file.type}. Please paste text if needed.
                        </p>
                      )}
                    </>
                  )}
                </div>

                <Label className="flex items-center gap-2 text-foreground">
                  Or paste resume text
                  <Upload className="h-4 w-4 text-muted-foreground" />
                </Label>
                <textarea
                  className="w-full h-24 p-3 border border-border/30 rounded-lg bg-background/50 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-primary/20 placeholder:text-muted-foreground/50"
                  placeholder="Paste your resume here..."
                  value={resume}
                  onChange={(e) => setResume(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {resume.length > 0 ? `${resume.length} characters` : "Tip: Plain text works best. PDF text extraction coming soon."}
                </p>
              </div>

              <div className="mt-4 flex items-center justify-between gap-3">
                <Button variant="ghost" onClick={() => setStep(1)} className="hover:bg-muted/50 transition-colors duration-200 text-sm font-medium flex-1">
                  ← Back
                </Button>
                <Button
                  onClick={handleExtractProfile}
                  disabled={
                    extractionStatus === "extracting" ||
                    (!file && resume.trim().length < 100)
                  }
                  className="flex-1 bg-primary hover:bg-primary/90 focus:ring-primary/30 active:bg-primary/80 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 text-sm font-medium px-4 py-2 flex items-center justify-center gap-2"
                >
                  {extractionStatus === "extracting" ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="ml-1">Extracting...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      <span className="ml-1">Extract Profile</span>
                    </>
                  )}
                </Button>
              </div>

              {extractError && (
                <p className="mt-2 text-sm text-red-500">{extractError}</p>
              )}
            </div>
          </Card>
        )}

        {/* Step 3: Profile Preview */}
        {step === 3 && profile && (
          <Card className="border border-border/50 bg-background/90 backdrop-blur-sm shadow-sm hover:shadow-md transition-shadow duration-200">
            <div className="p-6 space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-foreground">
                  Your profile
                </h1>
                <p className="text-muted-foreground mt-1">
                  This is what we extracted from your resume. Looks right?
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Anchor Skill (highest priority)</Label>
                  <p className="text-lg font-semibold text-foreground">{profile.anchor_skill}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Primary Skills</Label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {profile.primary_skills.map((s: string) => (
                      <Badge key={s} variant="outline" className="border-border/30 hover:border-primary/40 transition-colors duration-200">
                        {s}
                      </Badge>
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
                    <p className="text-sm text-foreground">{profile.location}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Seniority</Label>
                    <p className="text-sm capitalize text-foreground">{profile.seniority}</p>
                  </div>
                </div>
              </div>

              <Separator className="my-6 border-border/30" />

              <div className="flex items-center justify-between gap-3">
                <Button variant="ghost" onClick={() => setStep(2)} className="hover:bg-muted/50 transition-colors duration-200 text-sm font-medium flex-1">
                  ← Back
                </Button>
                <Button onClick={handleComplete} className="flex-1 bg-violet-600 hover:bg-violet-700 text-white transition-all duration-200 text-sm font-medium px-4 py-2">
                  Looks good — Start Searching →
                </Button>
              </div>
            </div>
          </Card>
        )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}