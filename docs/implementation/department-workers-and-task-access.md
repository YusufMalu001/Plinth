# Department workers and task access

**Status: IMPLEMENTED**

## Purpose

This document explains how shop-floor employees receive login accounts, how departments and workers are linked, and how the application limits operators to their assigned work.

## Source of truth and data flow

HR is the employee and login source of truth. A worker is an existing `Employee` profile linked to a `User` login; there is no separate worker table.

```text
Department
  └── Employee profile (Employee.departmentId)
        └── Login (User.employeeRefId)
              ├── department scope (User.assignedDepartmentId)
              └── shop_floor_operator RBAC role
                    ├── WorkerAssignment records for production batches
                    └── EmployeeTask records for portal subtasks
```

## Who can provision workers

| Actor | Create worker login | Scope |
| --- | --- | --- |
| Admin / Super Admin | Yes | Any active department |
| HR / HR Manager | Yes | Any active department |
| Department Head | Yes | Their assigned department only, and only as a shop-floor operator |
| Department In-Charge | No | Can use the existing department task/execution permissions |
| Shop-floor Operator | No | Can view and act on work assigned to their own employee profile |

The department tab is a roster view. Its **Add worker in HR** link opens the HR employee creation flow with the department preselected. HR/Admin can also create an employee in HR and assign a department there. A department head opening the same flow is restricted by the API to their own assigned department and the worker role. A free-text name in the Department Head field does not grant login rights; the account needs the appropriate RBAC role and assigned department.

## Worker role and access

`shop_floor_operator` is ensured by the API when a worker login is provisioned, so a missing local RBAC role no longer blocks worker creation. Its grants are reset to the application's limited operator permission set when ensured. The worker gets the legacy `employee` account type plus the `shop_floor_operator` RBAC role; this does not grant department-head or HR permissions.

Workers can see their own employee tasks and batches assigned through `WorkerAssignment`. Task APIs derive the worker identity from the authenticated account's `employeeRefId`, so a client-supplied employee ID cannot expand the worker's task list. Department supervisors and administrators use their separate department or management permissions.

## How to create and assign work

1. Create and activate the shop-floor department.
2. Ensure the department head has a real user account with a department-head RBAC role and `assignedDepartmentId` set to that department.
3. From the department roster, choose **Add worker in HR**, or create the employee from HR and select the department.
4. Enter the worker's name and unique work email. Worker mode assigns the operator title/role and department; the login gets a generated temporary password and must change it after first sign-in.
5. The new worker appears in that department's roster with login status.
6. Assign portal subtasks through the Employee Tasks workflow, or assign a production batch and optional station/subtask description through the production execution workflow. These are separate assignment records and screens.
7. The worker signs in and sees only their own assigned employee tasks and production assignments.

The employee roster shows basic profile and whether a login is active. It does not show passwords. The HR success screen displays the generated temporary password once; share it through a secure channel.

## API behavior

* `GET /employees/departments/:departmentId/workers` returns the permitted department roster without payroll or sensitive identity fields.
* `POST /employees/invite` is the HR/Admin/department-head onboarding endpoint. Department-head access is restricted server-side to the caller's department and to `shop_floor_operator`; the endpoint does not trust UI restrictions.
* `GET /employees/tasks/queue` forces operators to their own `employeeRefId`; supervisor views are limited to their department.
* `POST /employees/tasks/queue`, `PATCH /employees/tasks/queue/:id`, and `DELETE /employees/tasks/queue/:id` enforce supervisor/worker ownership rules server-side. A worker cannot self-approve.
* Production execution access remains separately controlled by department and `WorkerAssignment`.

## Data and operational notes

* No database migration or manual seed step is required for the operator role; the API ensures the built-in role and its limited grants at worker provisioning time.
* Employee records, login credentials, role grants, and onboarding details are written by the HR onboarding service. The flow uses the existing database models; there is no standalone worker model.
* Passwords are hashed with Argon2id. The generated temporary password is returned to the creating screen for one-time display; it is not included in the department roster.
* Duplicate email addresses are rejected. Existing employee/login records with conflicting departments or access roles require HR/Admin review rather than being silently reassigned.
* The current onboarding operations are performed as several database writes, not as one encompassing transaction. If a database failure occurs mid-provisioning, HR/Admin should inspect the employee/login record before retrying; transaction hardening is a follow-up reliability improvement.
* This implements initial department worker provisioning and task scoping. The broader Module 8 progress, loss, handover, and audit lifecycle remains in the production execution module.

## Manual acceptance checks

1. As Admin, add one worker to Department A from its roster. Confirm the HR form shows Department A selected, the account is created, and the roster shows the worker only in A.
2. As HR, create a worker and select Department B. Confirm the roster shows the worker in B and no other role was granted.
3. As a Department A head, open Add worker and confirm Department A is fixed. Attempt a request for Department B or a non-operator role and confirm the API rejects it.
4. Sign in as a worker. Confirm department-head and HR screens/actions are unavailable. Assign three tasks each to two workers and verify each worker sees only their own tasks; changing the request's employee ID must not expose a coworker's tasks.
5. Assign a production batch to a worker with a subtask description. Confirm that worker can access it, an unassigned coworker cannot, and supervisor completion/rejection remains separate.
6. On a fresh local database without `shop_floor_operator`, create a worker from HR. Confirm role creation succeeds and the granted permissions remain limited to the operator set.
