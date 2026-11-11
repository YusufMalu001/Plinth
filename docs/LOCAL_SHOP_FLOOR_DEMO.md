# Local shop-floor department demo

This local-only seed provisions a department-scoped in-charge login for each of the nine active shop-floor departments shown in the department list. It also creates a clearly labeled demo production plan and one execution batch per department so the execution and WIP pages have visible progress states.

## Run

From the repository root, start the local API and web app as usual, then run:

```powershell
npm run db:seed-shop-floor-demo
```

The script refuses to run against a non-local host or a database other than `plinth_erp`. It does not reset existing data or alter admin accounts. It upserts only its own demo users, route, plan, and batches, so rerunning it refreshes the same demo records.

## Demo logins

The usernames use the department name (for example, `buffing@plinth.local`); the seed prints the exact list after it runs. All use this local demo password:

```text
ShopFloor#26
```

Use a private/incognito browser window for each login, or log out before switching accounts. The users are assigned to one department, and the department in-charge role grants shop-floor execution and WIP permissions.

## Demo progress

The seed creates plan `DEMO-SHOPFLOOR-20261102` against the latest approved product BOM available locally. Its nine route stages show one completed stage, one in progress, one paused with a rejected quantity, and six awaiting receipt. Demo records are labeled in their notes and should not be used for actual production reporting.

## Remove demo records

Do not use a database reset. To remove the demo, delete the plan `DEMO-SHOPFLOOR-20261102` and route `DEMO-SHOPFLOOR-ROUTE-20261102` through the application or a reviewed cleanup script first, then remove only the `demo.*@plinth.local` accounts created by this seed. The current seed intentionally has no automatic cleanup behavior.
