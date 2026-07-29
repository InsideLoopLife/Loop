# What this automates

## Automated

- Creates core beta/security tables
- Enables and forces RLS on public tables
- Adds an event trigger to RLS-protect future public tables
- Reports tables missing RLS or policies
- Creates owner policies for obvious ownership columns
- Creates household policies for obvious household tables
- Adds invite-code-only beta account creation
- Adds admin access-code generation
- Adds one-button account purge backend + UI component

## Not fully automated

These still need human review:

- Tables without `user_id`, `owner_id`, `profile_id`, `created_by`, `profiles.id`, or `household_id`
- Complex household roles
- Shared child/profile permission logic
- Financial data visibility rules
- Storage bucket RLS policies
- Supabase dashboard auth settings
- Legal review of privacy/terms
- Real backup restore testing
- Production monitoring provider setup
