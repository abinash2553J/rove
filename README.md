# ROVE

**Go somewhere that feels like you.**

ROVE is an AI-powered trip planner that turns your travel ideas into a day-by-day itinerary. Describe the kind of trip you have in mind, set your dates, group size, budget style, and interests, then refine the plan until it feels right for you.

**Live demo:** [rove-rust.vercel.app](https://rove-rust.vercel.app)  
**Repository:** [abinash2553J/rove](https://github.com/abinash2553J/rove)

## Features

- **Personalized itineraries** — generate trips from a natural-language description, travel dates, duration, number of travelers, budget preference, and interests.
- **Day-by-day plans** — get suggested morning, afternoon, and evening activities, an area to stay in, practical notes, and an estimated budget per person.
- **Interactive destination map** — view the destination with Leaflet and OpenStreetMap.
- **Editable plans** — adjust itinerary details inline and ask the AI to rethink an individual day with extra instructions.
- **Save and revisit trips** — sign in to keep itineraries in your account and return to them later.
- **Shareable itineraries** — create a private-by-default share link for a saved trip and revoke it when you no longer want to share it.
- **Start without an account** — create an itinerary first; sign-in is needed to save and revisit trips.
- **Responsive interface** — plan and review trips through a clean, browser-based interface.

## Tech stack

| Area | Technology |
| --- | --- |
| Framework | Next.js App Router |
| UI | React, TypeScript, Tailwind CSS |
| AI itinerary generation | Google Gemini 2.5 Flash API |
| Authentication and database | Supabase Auth and PostgreSQL |
| Maps and geocoding | Leaflet, OpenStreetMap, Nominatim |
| Icons | Lucide React |
| Package manager | pnpm |
| Deployment | Vercel |

## Getting started

### Prerequisites

- Node.js 20.9 or newer ([Next.js 16 system requirements](https://nextjs.org/docs/app/getting-started/installation))
- pnpm (the repository declares `pnpm@12.3.4`)
- A Google AI Studio API key for itinerary generation
- A Supabase project for authentication, saved itineraries, and sharing

### 1. Clone the repository

```bash
git clone https://github.com/abinash2553J/rove.git
cd rove
```

### 2. Install dependencies

```bash
corepack enable
pnpm install
```

### 3. Configure environment variables

Create a local environment file from the example:

```bash
cp .env.example .env.local
```

On Windows PowerShell, use:

```powershell
Copy-Item .env.example .env.local
```

Fill in the values in `.env.local`:

| Variable | Required for | Description |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase features | Your Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase features | Your Supabase publishable key. The legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` is also supported. |
| `GEMINI_API_KEY` | AI planning | Your Google AI Studio API key. This is used on the server and must **not** be prefixed with `NEXT_PUBLIC_`. |

Do not commit `.env.local` or expose your Gemini API key in client-side code.

### 4. Set up Supabase

1. Create a Supabase project and copy its project URL and publishable key into `.env.local`.
2. In the Supabase SQL Editor, run the SQL files in `supabase/migrations/` in timestamp order. These create the saved-trip table, owner-only access policies, itinerary updates, public share links, and trip update timestamps.
3. In **Authentication → Providers**, enable email sign-in for magic links. Google sign-in is also supported; configure a Google OAuth client and add the Supabase callback URL shown by the Google provider settings to the OAuth client's authorized redirect URIs.
4. In **Authentication → URL Configuration**, set the local Site URL and add `http://localhost:3000/**` to the redirect allow list. Add your deployed app URL there too when configuring production authentication.

More detailed backend notes are available in [`supabase/README.md`](supabase/README.md).

**Note:** AI itinerary generation can be used without signing in. Supabase authentication is needed to save, revisit, and share trips.

### 5. Run the development server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Available scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | Start the local development server. |
| `pnpm build` | Create a production build. |
| `pnpm start` | Serve the production build locally (run `pnpm build` first). |

## Project structure

```text
rove/
├── app/
│   ├── api/
│   │   ├── map-location/       # Destination geocoding endpoint
│   │   ├── plan/               # Generate an itinerary with Gemini
│   │   │   └── regenerate-day/ # Regenerate one itinerary day
│   │   └── share/[token]/      # Fetch a shared itinerary
│   ├── components/             # App-specific UI components, including the map
│   ├── share/[token]/          # Public shared-trip page
│   ├── layout.tsx
│   ├── page.tsx                # Main trip planner
│   └── globals.css
├── components/ui/               # Reusable UI components
├── lib/
│   ├── rate-limit.ts            # API request rate limiting
│   ├── supabase.ts              # Browser Supabase client
│   └── trip-plan.ts             # Trip types and response validation
├── public/                      # App icons and static assets
├── supabase/
│   ├── migrations/              # Database schema and policy migrations
│   └── README.md                # Supabase setup notes
├── .env.example
├── package.json
└── README.md
```

## Important notes

- Trip descriptions are sent to Google Gemini to generate itineraries. Saved itineraries are stored in Supabase for signed-in users.
- Itinerary content and budget numbers are AI-generated estimates, not booking confirmations. Verify prices, opening hours, transport options, and availability with current local sources before relying on them.
- Destination lookup uses the OpenStreetMap Nominatim service. Use is subject to the [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/), and maps should retain OpenStreetMap attribution.
- Shared itineraries can be viewed by anyone who has the share link. Use **Stop sharing** to revoke a link.

## Contributing

Suggestions, bug reports, and pull requests are welcome. For larger changes, consider opening an issue first to discuss the proposed approach.

## License

A license has not yet been specified in this repository.
