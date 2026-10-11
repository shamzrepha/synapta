# Synapta — Administrator Operations Guide

This guide outlines platform management procedures for system administrators using the **Platform Operations Console** (`/admin`).

---

## 1. Access & Security Invariants

- Access to `/admin` requires an active Firebase session for an account with `role: "admin"`.
- Administrator status is granted dynamically when an account email is present in the `ADMIN_EMAILS` environment variable and has `email_verified: true`.
- **Self-Lockout Prevention**: The console prohibits an administrator from disabling their own account or revoking their own administrator role.
- **Audit Trails**: Every mutation (role change, user disable, report resolution, class deletion) automatically writes an immutable record to the `auditLogs` collection containing actor UID, target ID, action details, and timestamp.

---

## 2. User & Teacher Management (Users Tab)

### Elevating a User to Teacher
1. Navigate to the **Teacher Requests** or **Users** tab.
2. Locate the user by UID, username, or display name.
3. Review their requested rationale and credentials.
4. Click **Approve Teacher**.
   - The user's role is updated to `teacher`.
   - Their monthly token cap is automatically set to `TEACHER_TOKEN_LIMIT` (default 200,000).
   - Custom claims on Firebase Auth are synchronized immediately without invalidating their active session.
   - All preexisting class enrollments remain preserved.

### Disabling / Enabling an Account
- Click **Disable Account** on any non-admin user row.
- Setting `disabled: true` immediately revokes active refresh tokens and denies future API calls.

---

## 3. Bug Reports & Flagged Content Triage (Reports Tab)

Users and teachers can flag AI-generated learning materials (quizzes, explanations, flashcards) or report platform bugs.

### Triage Workflow
1. Navigate to the **Bug Reports** tab.
2. Review report context: reporter name, target type (`ai_content`, `kc`, `class`, `bug`), description, and linked class ID.
3. Update Status:
   - **Investigating**: Mark as actively being triaged.
   - **Hide Content**: Sets the underlying item to `status: "hidden"` so learners no longer see it.
   - **Regenerate Content**: Invokes the Gemini synthesis pipeline to generate a fresh, verified replacement item.
   - **Resolved**: Marks the report as closed and notifies the reporter.
   - **Dismissed**: Closes duplicate, invalid, or non-actionable reports.

---

## 4. Course Management (Classes Tab)

- **Browse All Courses**: Search public, private, and archived classrooms across the platform.
- **Inspect Concept Map**: View Knowledge Components, prerequisites, and BKT mastery distributions.
- **Delete Class**: Performs soft removal with an atomic entry logged in `auditLogs`.

---

## 5. Token Usage & Cost Telemetry (Usage Tab)

- **Total Token Consumption**: Track input vs. output tokens across tutor chat, structured generation, and document extraction tasks.
- **Active Model Breakdown**: Monitor requests dispatched to `gemini-3.5-flash-lite`, `gemini-3.6-flash`, etc.
- **Monthly Budget Guard**: Review token consumption against global quotas to prevent runaway cost.
