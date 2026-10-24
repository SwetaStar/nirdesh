# Nirdesh

**When a court orders the government to do something, Nirdesh makes sure it actually gets done on time — and that the citizen who won knows their rights.**

Built for the IIM Visakhapatnam Agentic AI Hackathon (Area 10: Public Policy).

The AI reads, checks, reminds and drafts. **Humans decide.** Nirdesh never files anything, never decides whether to appeal, and never states an action was taken unless a user confirms it.

## How it works

Upload a judgment → **Direction Extractor** pulls every direction to a government party (exact quote, paragraph, authority, deadline) → **Critic** independently re-checks it (up to 2 correction rounds) → code verifies every quote verbatim and recomputes every date → **Verification Gate**: an officer approves, corrects or rejects each item → **Planner & Drafter** (officers) or **Citizen Explainer** (citizens, 5 languages) → dashboard and systemic-issue detection.

**Know Your Law** answers questions about Acts, Rules and filings from uploaded Bare Acts, in four layers, and hands hard questions to legal aid with a ready summary.

## Bring your own AI key

Nirdesh does not ship with an AI key. Each user adds their own in **Settings** (Claude, Gemini, OpenAI, Groq or OpenRouter). The key is stored only in that browser and sent directly to the provider — it never reaches the Nirdesh server. Gemini offers a free key at https://aistudio.google.com/apikey.

## Stack

Next.js (TypeScript, Tailwind) · Supabase (Postgres + Storage) · deployed on Vercel.

## Run locally

1. Create a Supabase project and run `supabase/schema.sql` in its SQL editor.
2. Copy `.env.example` to `.env.local` and fill in the Supabase URL and service-role key.
3. `npm install && npm run dev`, open http://localhost:3000, then add your AI key in Settings.

## Disclaimer

Nirdesh gives general information, not legal advice. Sample data is labelled as sample.
