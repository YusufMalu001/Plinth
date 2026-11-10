# Production schedule status tracking

## Schedule status meanings

- `APPROVED`: Admin approved the schedule; it has not been released to the floor.
- `RELEASED`: The schedule is available for department execution; work has not started.
- `IN_PROGRESS`: A department task or assembly wave has started. Department task progress is recorded separately from accepted finished output.
- `PARTIALLY_COMPLETED`: Assembly has passed QC for some, but not all, of the scheduled finished quantity.
- `COMPLETED`: Assembly has passed QC for the full scheduled finished quantity.

## Status transitions

The first department batch start or progress update moves a `RELEASED` schedule to `IN_PROGRESS`. The status transition, production-plan event, and intelligence event are written in the same transaction as the shop-floor action. Creating an assembly wave also starts a released schedule.

Department batch completion does not by itself complete the production schedule. The schedule reaches `PARTIALLY_COMPLETED` or `COMPLETED` after Assembly QC accepts finished output. Department route progress and finished output progress answer different questions, so the schedule detail page labels the former as **Department route progress**.

## Refresh behavior

Shop-floor actions invalidate department execution, production schedule, and dashboard queries in the current browser session. Active production schedule lists refresh every ten seconds. Schedule detail and department queues already refresh periodically.
