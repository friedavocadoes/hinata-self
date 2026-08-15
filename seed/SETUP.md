# Supabase setup for the Landed Costing app

## 1. Create the project
Create a Supabase project on the Free plan.

## 2. Run the schema
Supabase Dashboard -> SQL Editor -> New query.
Paste `schema.sql` and Run.

## 3. Run the seed
Open another SQL Editor query.
Paste `seed.sql` and Run.

The seed imports:
- 87 product rows from Table 2 + Table 3
- unique suppliers from the product master
- transport rates from Table 8
- DWC transport surcharges
- delivery destinations
- incoterms
- payment terms
- supplier/customer bank fee rules
- insurance rules
- global settings
- one demo warehouse

Customers are intentionally NOT invented because the workbook does not contain a clean customer master.

## 4. Connect Next.js
Install:

    npm install @supabase/supabase-js @supabase/ssr

Add to `.env.local`:

    NEXT_PUBLIC_SUPABASE_URL=your_project_url
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_publishable_key

Use `@supabase/ssr` for the browser/server Supabase clients.

## 5. Create your first user
Supabase Dashboard -> Authentication -> Users -> Add user.

The database trigger automatically creates a `profiles` row.

The first user is `sales_rep` by default.

To make the first user Finance/Admin, run:

    update public.profiles
    set role = 'finance_admin'
    where id = 'AUTH_USER_UUID';

## Important
The schema intentionally does NOT expose sensitive costing fields as a separate sales-facing API contract yet.
When we build the Next.js server-side costing action, sales reps will receive only the fields required for quoting, while Finance/Admin can access the complete costing breakdown.

Also, the Excel's customs matrix has ambiguous column headings in the supplied workbook. The schema includes `customs_charge_rules`, but we should NOT blindly seed all of Table 6 until the client confirms what each scenario column represents.
