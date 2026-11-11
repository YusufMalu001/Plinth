# Plinth daily AI insights

The Intelligence → AI Insights page uses the existing Executive advisor and certified Plinth metrics. It saves each brief as an Intelligence run; it does not create or update ERP transactions.

## Generate and review

1. Sign in with Executive Intelligence access and open `/intelligence/insights`.
2. Select **Generate today's brief**. The worker captures metrics from midnight India time through the request time, reads up to eight open saved operational recommendations for context, and requests a structured brief.
3. The page shows the queued or running state, then displays the summary, updates, risks, focus items, source metrics, and limitations. The saved brief remains available in the paginated history table.
4. Select **Refresh today's brief** to capture a newer snapshot. A refresh creates a new saved revision; earlier revisions remain in history.

The first manual request and the scheduled request for a business date share one idempotency key. Concurrent requests reuse the same run. Refreshes create new runs.

## Automatic daily brief

With the Intelligence worker running and Intelligence schedules enabled, the worker queues one daily brief after 08:00 Asia/Kolkata. The same schedule setting also enables the existing department and Executive recommendation schedules. The AI Insights page displays whether automatic scheduling is enabled.

Enable schedules through `INTELLIGENCE_SCHEDULES_ENABLED=true` in the deployment environment, then recreate the API and worker services. The persisted Intelligence controls can pause schedules separately. Keep the setting off when automatic model requests are not desired, especially on a limited free account.

A successfully generated scheduled brief sends an internal notification to Executive reviewers when notifications are enabled and shadow mode is off. Notification failure does not change the saved brief status.

## Status and evidence

- **Ready:** validated brief with certified evidence and no caveats.
- **Partial:** validated brief with explicit data limitations.
- **Source unavailable:** the current snapshot cannot support a reliable assessment.
- **Provider unavailable:** provider access, capacity, or runtime blocked the request.

Every update, risk, and focus item must cite at least one exact certified metric key. Unsupported citations or a missing structured brief fail validation. Saved recommendations provide context only; an accepted recommendation is not treated as an executed ERP action.

This workflow uses Plinth's current Sales, Inventory, Procurement, Production, and Fulfillment evidence. Public-source collection and unrelated ERP modules are outside this feature.
