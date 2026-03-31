# DinkDraw Supabase Starter

This is a clean starter for a real Supabase-backed version of DinkDraw.

## What is included
- Next.js app
- Supabase browser client
- Sign up / sign in
- Create tournament
- Join tournament by code
- Claim player spot
- Edit player names
- Read and update saved matches
- DinkDraw branding and dark UI

## Important
This is a starter foundation, not full feature parity with the local prototype yet.

## Before you deploy
1. Create your Supabase project
2. Run your SQL schema / RLS script
3. In Vercel, add these environment variables:
   - NEXT_PUBLIC_SUPABASE_URL
   - NEXT_PUBLIC_SUPABASE_ANON_KEY

## What to build next
1. Schedule generation that writes rows to matches
2. Organizer-only editing controls
3. Standings calculation from real match data
4. Finalize tournament and update event_results + lifetime_stats
