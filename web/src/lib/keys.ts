/**
 * API key storage — localStorage for dev, encrypted later for prod.
 */

const STORAGE_KEY = "jobagent_keys";

export interface UserKeys {
  gemini: string;
  apify: string;
}

export function getKeys(): UserKeys {
  if (typeof window === "undefined") return { gemini: "", apify: "" };
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return { gemini: "", apify: "" };
  try {
    return JSON.parse(stored);
  } catch {
    return { gemini: "", apify: "" };
  }
}

export function saveKeys(keys: UserKeys) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
}

export function clearKeys() {
  localStorage.removeItem(STORAGE_KEY);
}

export function hasKeys(): boolean {
  const keys = getKeys();
  return !!(keys.gemini && keys.apify);
}

export async function validateGeminiKey(key: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`
    );
    if (resp.ok) return { valid: true };
    if (resp.status === 400 || resp.status === 403) return { valid: false, error: "Invalid API key" };
    return { valid: false, error: `HTTP ${resp.status}` };
  } catch (e: any) {
    return { valid: false, error: e.message };
  }
}

export async function validateApifyKey(key: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const resp = await fetch(`https://api.apify.com/v2/users/me?token=${key}`);
    if (resp.ok) return { valid: true };
    if (resp.status === 401) return { valid: false, error: "Invalid API token" };
    return { valid: false, error: `HTTP ${resp.status}` };
  } catch (e: any) {
    return { valid: false, error: e.message };
  }
}
