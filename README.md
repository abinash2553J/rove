# ROVE

**Go somewhere that feels like you.**

ROVE is an AI-powered trip planner that turns your travel ideas into a day-by-day itinerary. Describe the kind of trip you have in mind, set your dates, group size, budget style, and interests, then refine the plan until it feels right for you. Save your trip, share the itinerary, and keep group expenses organised in one place.

**Live demo:** [rove-rust.vercel.app](https://rove-rust.vercel.app)  
**Repository:** [abinash2553J/rove](https://github.com/abinash2553J/rove)

## Features

### Trip planning

- **Personalized itineraries** — generate trips from a natural-language description, travel dates, duration, number of travelers, budget preference, and interests.
- **Day-by-day plans** — get suggested morning, afternoon, and evening activities, an area to stay in, practical notes, and an estimated budget per person.
- **Interactive destination map** — view the destination with Leaflet and OpenStreetMap.
- **Editable plans** — adjust itinerary details inline and ask the AI to rethink an individual day with extra instructions.
- **Save and revisit trips** — sign in to keep itineraries in your account and return to them later.
- **Shareable itineraries** — create a private-by-default share link for a saved trip and revoke it when you no longer want to share it.
- **Start without an account** — create an itinerary first; sign-in is needed to save and revisit trips.

### Group expense splitting

- **Invite travel companions** — create an invite link for a saved trip. Invited collaborators sign in before joining; a trip supports up to 12 members.
- **Shared expense ledger** — members can record an expense with a description, amount in INR, payer, and the people sharing the cost.
- **Equal expense splits** — divide an expense evenly among selected participants, with any leftover paise distributed one paise at a time.
- **Live balance calculations** — see each member's net balance as expenses are added.
- **Suggested settlements** — calculate transfers between members to settle outstanding balances with fewer payments.
- **Optional UPI IDs** — members can add a UPI ID to make settlement instructions easier to follow.
- **Separate expense data** — members, expenses, and individual shares are stored separately from the itinerary JSON.
- **Member-only access** — trip members can view the group's expense information; only the member who created an expense can remove it.

ROVE does not initiate, process, or verify payments. Always confirm the recipient and UPI ID in your payment app before transferring money.

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
- A Supabase project for authentication, saved itineraries, sharing, and group expenses

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
2. In the Supabase SQL Editor, run the SQL files in `supabase/migrations/` in timestamp order. This creates the saved-trip table, owner-only access policies, itinerary updates, public share links, and the group expense-splitting schema and policies. Make sure to apply `20261105000000_add_trip_expense_splitting.sql` for Trip Split.
3. In **Authentication → Providers**, enable email sign-in for magic links. Google sign-in is also supported; configure a Google OAuth client and add the Supabase callback URL shown by the Google provider settings to the OAuth client's authorized redirect URIs.
4. In **Authentication → URL Configuration**, set the local Site URL and add `http://localhost:3000/**` to the redirect allow list. Add your deployed app URL there too when configuring production authentication.

More detailed backend notes are available in [`supabase/README.md`](supabase/README.md).

**Note:** AI itinerary generation can be used without signing in. Supabase authentication is needed to save, revisit, and share trips. Group expense splitting is available for saved trips and requires signed-in trip members.

### 5. Run the development server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Using Trip Split

1. Sign in and save an itinerary.
2. Open the saved trip and choose **Split expenses** to create a group expense space and invite link.
3. Share the invite link with your travel companions. They must sign in before joining the trip.
4. Members can add their name and optional UPI ID, then record expenses by entering a description, amount, payer, and participants.
5. Review the group spend, each person's balance, and the suggested transfers in **Settle up**.
6. Confirm payment details independently and settle through your preferred UPI app.

The saved-trip owner is added as the first member. A trip can have up to 12 members. Expense amounts are represented as integer paise to avoid floating-point rounding errors. Expense records and per-person shares live in dedicated database tables rather than inside the itinerary JSON. Only trip members can access the trip's member and expense information, and only the member who created an expense can delete it. Creating a replacement invite link invalidates the previous invite.

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
│   │   ├── map-location/          # Destination geocoding endpoint
│   │   ├── plan/                  # Generate an itinerary with Gemini
│   │   │   └── regenerate-day/    # Regenerate one itinerary day
│   │   ├── share/[token]/         # Fetch a shared itinerary
│   │   └── trip-split/            # Create and manage trip expense splits
│   ├── components/                # App-specific UI components, including the map
│   ├── share/[token]/             # Public shared-trip page
│   ├── trip-split/[token]/        # Group expense-splitting page
│   ├── layout.tsx
│   ├── page.tsx                   # Main trip planner and saved trips
│   └── globals.css
├── components/ui/                 # Reusable UI components
├── lib/
│   ├── rate-limit.ts              # API request rate limiting
│   ├── supabase.ts                # Browser Supabase client
│   ├── trip-plan.ts               # Trip types and response validation
│   └── trip-split.ts              # Expense balances and settlement calculations
├── public/                        # App icons and static assets
├── supabase/
│   ├── migrations/                # Database schema and policy migrations
│   └── README.md                  # Supabase setup notes
├── .env.example
├── package.json
└── README.md
```

## Important notes

- Trip descriptions are sent to Google Gemini to generate itineraries. Saved itineraries are stored in Supabase for signed-in users.
- Itinerary content and budget numbers are AI-generated estimates, not booking confirmations. Verify prices, opening hours, transport options, and availability with current local sources before relying on them.
- Destination lookup uses the OpenStreetMap Nominatim service. Use is subject to the [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/), and maps should retain OpenStreetMap attribution.
- Shared itineraries can be viewed by anyone who has the share link. Use **Stop sharing** to revoke a link.
- Trip Split uses a separate invite link and member-based access rules. Do not confuse a trip's public itinerary share link with its expense-splitting invite link.
- UPI IDs are optional settlement information. ROVE does not transfer money or confirm that a payment has been made.

## Contributing

Suggestions, bug reports, and pull requests are welcome. For larger changes, consider opening an issue first to discuss the proposed approach.

## License

A license has not yet been specified in this repository.
