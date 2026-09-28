# Regal Tulip School Administration

A responsive pupil-registration, school-fee, and transport-payment administration portal built with React and Supabase.

## Included

- Dashboard with fee, pupil, and school-bus summaries
- New and returning pupil registration
- Search by name, admission number, or guardian phone
- Complete pupil profile and payment history
- School-fee and school-bus payment tracking
- Automatic Paid / Part Payment / Not Paid calculation
- Daily payment summary and CSV export
- Supabase schema, Row Level Security, private photo bucket, and audit log
- Scheduled daily-report Edge Function foundation
- Demo mode when Supabase credentials have not been configured

## Start locally

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

Add the project URL and publishable key from the Supabase Connect dialog to `.env.local`.

## Connect Supabase

1. Create a Supabase project.
2. Run the migrations in filename order in the SQL Editor:
   - `supabase/migrations/001_initial_schema.sql`
   - `supabase/migrations/002_payment_safety.sql`
   - `supabase/migrations/003_fee_schedules.sql`
   - `supabase/migrations/004_location_fee_bands.sql`
   - `supabase/migrations/005_two_admin_roles.sql`
   - `supabase/migrations/006_shared_pupil_registration.sql`
   - `supabase/migrations/007_admin_usernames.sql`
   - `supabase/migrations/008_admin_self_activation.sql`
   - `supabase/migrations/009_standard_admin_signup.sql`
   - `supabase/migrations/010_repair_admin_signup.sql`
   - `supabase/migrations/011_fix_admin_profile_login.sql`
   - `supabase/migrations/012_repair_existing_admin_roles.sql`
   - Continue with each later migration in numerical order through
     `supabase/migrations/020_term_scoped_payment_dashboard.sql`.
3. On the application login page, select **Create an account**. Signup accepts only:
   - `regaltulipschool@gmail.com` — main administrator
   - `ogechukwuifunanya@gmail.com` — payment administrator

Each administrator enters their required email, chooses a unique username and password in the standard signup form, and confirms the email when confirmation is enabled. They subsequently sign in with that username. The role migrations assign access automatically and reject application access for every other email.

5. Add your Supabase URL and publishable key to `.env.local`.
6. Deploy the function in `supabase/functions/daily-payment-report`.
7. Configure an email or WhatsApp provider secret and complete the delivery block.
8. Configure Vault values and run `supabase/cron.sql`.

Do not put the Supabase secret/service-role key or messaging-provider secrets in `.env.local`; browser-facing Vite variables are public.

When Supabase is configured, demo mode is disabled automatically. Administrators must sign in, and pupil records, private photos, invoices, bus enrollments, and payments are stored in Supabase.
