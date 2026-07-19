/**
 * Profile persistence — localStorage backed.
 *
 * Stores the extracted profile so users don't need to re-bootstrap on every page load.
 * Key: "velai_profile"
 */

const STORAGE_KEY = "velai_profile";

export interface UserProfile {
  anchor_skill: string;
  primary_skills: string[];
  search_terms: string[];
  keywords?: string[];
  location: string;
  country?: string;
  seniority: string;
  email?: string;
  summary?: string;
  years_experience?: number;
  target_titles?: string[];
}

export function getProfile(): UserProfile | null {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

export function saveProfile(profile: UserProfile): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
}

export function clearProfile(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function hasProfile(): boolean {
  return getProfile() !== null;
}
