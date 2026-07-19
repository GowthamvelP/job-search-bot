/**
 * Curated companies with known Greenhouse/Lever ATS slugs.
 * These APIs are free and unlimited — no API key needed.
 */

export interface Company {
  name: string;
  slug: string;
  ats: "greenhouse" | "lever";
  category: string;
}

export const COMPANIES: Company[] = [
  // Top Tech
  { name: "Stripe", slug: "stripe", ats: "greenhouse", category: "Top Tech" },
  { name: "Notion", slug: "notion", ats: "greenhouse", category: "Top Tech" },
  { name: "Figma", slug: "figma", ats: "lever", category: "Top Tech" },
  { name: "GitLab", slug: "gitlab", ats: "greenhouse", category: "Top Tech" },
  { name: "Shopify", slug: "shopify", ats: "greenhouse", category: "Top Tech" },
  { name: "Cloudflare", slug: "cloudflare", ats: "greenhouse", category: "Top Tech" },
  { name: "Datadog", slug: "datadog", ats: "greenhouse", category: "Top Tech" },
  { name: "HashiCorp", slug: "hashicorp", ats: "greenhouse", category: "Top Tech" },
  { name: "Vercel", slug: "vercel", ats: "greenhouse", category: "Top Tech" },
  { name: "Supabase", slug: "supabase", ats: "greenhouse", category: "Top Tech" },

  // Indian Unicorns / Tech
  { name: "Razorpay", slug: "razorpay", ats: "lever", category: "Indian Tech" },
  { name: "Zerodha", slug: "zerodha", ats: "lever", category: "Indian Tech" },
  { name: "CRED", slug: "cred-club", ats: "lever", category: "Indian Tech" },
  { name: "PhonePe", slug: "phonepe", ats: "lever", category: "Indian Tech" },
  { name: "Groww", slug: "groww", ats: "lever", category: "Indian Tech" },
  { name: "Postman", slug: "postman", ats: "greenhouse", category: "Indian Tech" },
  { name: "Freshworks", slug: "freshworks", ats: "greenhouse", category: "Indian Tech" },

  // Remote-first
  { name: "Basecamp", slug: "basecamp", ats: "greenhouse", category: "Remote-first" },
  { name: "Automattic", slug: "automattic", ats: "greenhouse", category: "Remote-first" },
  { name: "Zapier", slug: "zapier", ats: "lever", category: "Remote-first" },
  { name: "Buffer", slug: "buffer", ats: "lever", category: "Remote-first" },
  { name: "Doist", slug: "doist", ats: "greenhouse", category: "Remote-first" },
  { name: "Fly.io", slug: "fly-io", ats: "lever", category: "Remote-first" },

  // Enterprise / FAANG-adjacent
  { name: "Atlassian", slug: "atlassian", ats: "greenhouse", category: "Enterprise" },
  { name: "Twilio", slug: "twilio", ats: "greenhouse", category: "Enterprise" },
  { name: "MongoDB", slug: "mongodb", ats: "greenhouse", category: "Enterprise" },
  { name: "Elastic", slug: "elastic", ats: "greenhouse", category: "Enterprise" },
  { name: "HubSpot", slug: "hubspot", ats: "greenhouse", category: "Enterprise" },
  { name: "Square", slug: "squareup", ats: "greenhouse", category: "Enterprise" },
];

export const CATEGORIES = [...new Set(COMPANIES.map(c => c.category))];
