# ROVE backend setup

1. Run the SQL files in `migrations/` in timestamp order in the Supabase SQL Editor. `20261008060000_create_trip_plans.sql` creates the saved-trip table and owner-only read/insert/delete policies. `20261008070000_allow_trip_plan_updates.sql` adds owner-only updates so edited itineraries can be saved. If the first migration was already applied, run only the second one.
2. Copy the repository-root `.env.example` to `.env.local` in the repository root. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from the Supabase project API settings. The legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` variable is also supported.
3. Create a Google AI Studio API key and set it as `GEMINI_API_KEY`. This key is only used by the server-side `/api/plan` route; do not prefix it with `NEXT_PUBLIC_`.
4. To enable Google sign-in:
   - In Google Cloud Console, configure the OAuth consent screen and create an OAuth client ID with application type **Web application**.
   - Copy the callback URL shown in Supabase **Authentication → Providers → Google** into the Google OAuth client's **Authorized redirect URIs**. It is usually `https://<project-ref>.supabase.co/auth/v1/callback`.
   - In Supabase **Authentication → Providers → Google**, enable the provider and enter the Google client ID and client secret.
   - In Supabase **Authentication → URL Configuration**, set the Site URL to your app origin and add `http://localhost:3000/**` plus your deployed app origin/pattern to the redirect allow list.
5. Enable email sign-in if you also want to keep magic-link login. Its redirect returns to the app root.
6. Restart the app with `pnpm dev`.

### Google sign-in troubleshooting

If Supabase redirects back with `error_code=unexpected_failure` and `Unable to exchange external code`, the failure occurs when Supabase exchanges the Google authorization code for tokens. Check that the client ID and client secret saved in Supabase are from the same Google Cloud **Web application** OAuth client. If you rotated or recreated the Google client secret, update the secret in Supabase too. Also confirm that Google's **Authorized redirect URI** exactly matches the callback URL shown by Supabase (not the app's `localhost` URL). After changing provider settings, try a fresh sign-in in a private window; authorization codes can only be exchanged once.

Itinerary generation works without signing in. Signing in with Google or an email magic link is needed to save and revisit trips. A generated trip is sent to Google Gemini to create its itinerary; trips saved by signed-in users are stored in Supabase.

The trip-length and traveler-count controls include quick presets and a **Custom** option. Custom values support 1–21 days and 1–12 travelers.

Saved itineraries can be edited inline. While editing, use **Rethink this day** to regenerate a single day with additional instructions; save changes to update the existing trip in Supabase.

The planner also accepts optional travel dates. Select a start and return date (up to 21 inclusive days); the trip length stays in sync with the selected range, and Gemini can account for the season and day of week when suggesting activities. Dates are stored inside the itinerary JSON, so this feature does not require another database migration.
