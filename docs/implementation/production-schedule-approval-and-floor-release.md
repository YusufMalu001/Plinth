# Production Schedule Approval and Floor Release

## IMPLEMENTED workflow

Production schedules have separate approval and floor-release actions:

1. Store Managers and other non-Admin schedule creators submit a schedule as `PENDING_APPROVAL`.
2. An Admin reviews the schedule and approves it. It becomes `APPROVED`; approval does not issue materials or create shop-floor batches.
3. An Admin-created schedule is marked `APPROVED` at creation. It also waits for a separate floor-release action.
4. An Admin selects **Release to floor** from the Production Overview table or schedule details. The API revalidates the schedule and inventory, issues/allocates materials, creates department execution batches, records the release event, and sets the status to `RELEASED`.
5. Released schedules are available to department execution. Department work starts only after floor release.

An approved schedule may be edited by an Admin before release. The edit preserves `APPROVED` and does not release the plan. Release performs inventory validation again because available stock may change while approval is waiting.

## Permissions and audit

- Schedule approval is restricted to Admins in the production service.
- Floor release uses the `release` ProductionPlan permission and is exposed to Admin users in the UI.
- Approval and release remain separate production plan events. Department notifications are sent by the release workflow after the release transaction.
- Inventory issue and execution batch creation remain transactional in `ParallelExecutionService.release`.

## Status display

`PENDING_APPROVAL` means awaiting Admin review; `APPROVED` means approved and waiting for release; `RELEASED` means released to the floor; execution statuses follow after work begins.
