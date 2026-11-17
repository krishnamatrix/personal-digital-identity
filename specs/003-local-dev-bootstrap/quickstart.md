# Quickstart: Local development bootstrap

1. Install the repository's dependencies using its documented package manager.
2. Create `.env.local` from `.env.example` and fill in only the local settings needed for the features you plan to use. Keep secrets private.
3. Run `npm run dev:local` from the repository.
4. To use the existing development behavior without requiring `.env.local`, run `npm run dev`.

The local launcher starts the web app only. It does not start Supabase, apply migrations, or establish that configured services are reachable.
