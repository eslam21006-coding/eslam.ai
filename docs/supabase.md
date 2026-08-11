# Supabase foundation

Eslam.AI keeps database schema changes in `supabase/migrations/` and uses the project-local Supabase CLI pinned in `package.json`.

## Local workflow

1. Install dependencies with `npm ci`.
2. Start the local Supabase stack with `npm run supabase -- start`.
3. Apply migrations from scratch with `npm run supabase -- db reset` when validating schema changes.
4. Regenerate database types with `npm run db:types:local` after schema changes.

## Hosted project workflow

A dedicated Eslam.AI Supabase project must be provisioned before linking. Do not reuse another application's Supabase project.

After provisioning:

1. Link the repository with `npm run supabase -- link --project-ref <project-ref>`.
2. Push reviewed migrations with `npm run supabase -- db push`.
3. Regenerate committed types with `npm run db:types:linked`.
4. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in local/Vercel environments.

Never place a secret key or service-role key in a `NEXT_PUBLIC_*` variable. Browser access must rely on the publishable key plus Row Level Security.
