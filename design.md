# OmniCampus Design

## 1. Product Overview

OmniCampus is an admin-mediated university brand-ambassador platform. It connects verified students with companies that need campus marketing support, while keeping payment, identity verification, matching, assignment, and contact sharing under administrative control.

The product has three role-specific experiences:

- **Admin:** reviews registrations and payments, verifies users, manages campaigns, matches students, controls contact visibility, and reviews task proofs.
- **Company:** submits ambassador requests, tracks campaign status, and views students assigned by the admin.
- **Student:** maintains a campus profile, views assigned campaigns, and submits proof of completed work.

The primary product promise is controlled access: users only see the records and contact details needed for their current stage of the workflow.

## 2. Design Principles

### Trust before access

A user does not receive dashboard access until the required registration fee is confirmed and the admin verifies the registration documents or business details.

### Admin as curator

Companies do not browse the full student database and students do not browse companies. The admin owns matching and assignment decisions, with AI suggestions used as decision support rather than automatic placement.

### Progressive disclosure

Sensitive information appears only when it is useful and authorized. In particular, company and student contact details remain hidden until the admin approves a match.

### Evidence-based workflow

Payments, identity documents, receipts, and task proofs are represented as reviewable records with clear statuses and downloadable files.

### Quiet operational UI

The interface prioritizes scanning, status recognition, and repeated actions over marketing presentation. Each role should be able to understand what is waiting, what is blocked, and what action comes next.

## 3. Core User Flows

### Student or company onboarding

1. Choose a role on the registration screen.
2. Submit profile information and required documents.
3. See the fixed registration fee in PKR by default.
4. Submit a JazzCash, Easypaisa, bank-transfer, or demo payment reference.
5. Wait for admin payment confirmation.
6. Wait for admin verification.
7. Enter the role dashboard after both gates pass.

Student registration requires university information and an ID photo. Company registration requires business information and a primary contact.

### Company campaign flow

1. Create a campaign request with title, cities, universities, duration, responsibilities, skills, interests, headcount, and incentives.
2. Track the request as `Requested`, `Active`, or `Completed`.
3. Wait for the admin to review AI match suggestions and assign students.
4. View assigned talent and approved task progress.
5. See contact details only after the admin reveals them.

### Admin matching flow

1. Review pending registrations and payment state.
2. Approve or reject a user after the fee gate is satisfied.
3. Open a campaign and inspect ranked match suggestions.
4. Review fit score explanations based on skills, interests, location, university, performance, and existing assignments.
5. Assign or remove students.
6. Reveal or hide contact information for each assignment.
7. Change campaign state and review student task submissions.

### Student work flow

1. Open an assigned campaign.
2. Read responsibilities, duration, incentives, and brand information.
3. Complete the assigned work.
4. Submit a written note and optional proof file.
5. Track whether the submission is `Pending`, `Approved`, or `Rejected`.
6. View contact details only when the admin has approved sharing.

## 4. Information Architecture

### Public and gated screens

- **Sign in:** email/password authentication and demo account shortcuts when demo data is enabled.
- **Create account:** student/company role switch, fee preview, role-specific fields, and document upload.
- **Registration fee:** amount, payment instructions, payment method, transaction reference, receipt upload, and status.
- **Awaiting verification:** clear explanation of the current review stage and a status refresh action.

### Admin workspace

Tabs:

- **Overview:** fee totals, review queues, verification counts, assignment counts, and proof counts.
- **Verification:** pending users, documents, fee state, approve/reject actions.
- **Payments:** submitted references, receipts, confirmation/rejection actions, and rejection notes.
- **Campaigns:** campaign state, requirements, assignments, AI suggestions, and contact visibility.
- **Students:** verified student pool, status, skills, interests, contact, and performance.
- **Submissions:** task proof review with approve/reject actions.

### Company workspace

Tabs:

- **My campaigns:** campaign cards with lifecycle state and assignment progress.
- **New campaign:** structured campaign request form.
- **Assigned talent:** admin-approved students, campaign association, status, approved task count, and contact visibility.

### Student workspace

Tabs:

- **My campaigns:** assigned campaign cards, responsibilities, incentives, contact state, proof submission, and submission history.
- **Profile:** university identity, degree, batch, city, skills, interests, social handle, verification status, and performance score.

## 5. Visual Design System

### Direction

The current product uses a light neumorphic interface: soft elevation, recessed fields, rounded panels, and a calm operational tone. Keep the visual language restrained so status and actions remain the strongest signals.

### Color tokens

- `--bg`: cool light gray-blue page background.
- `--s1`: darker cool shadow used for raised and inset surfaces.
- `--s2`: white highlight used for the opposing shadow.
- `--tx`: deep blue-gray primary text.
- `--mut`: muted blue-gray secondary text.
- `--ac`: periwinkle accent for active navigation, focus, and primary emphasis.
- `--ok`: green for confirmed, verified, approved, and positive actions.
- `--warn`: amber for pending or awaiting review.
- `--bad`: red-pink for rejected, destructive, or blocked states.

Do not rely on color alone: pair status colors with readable labels such as `Confirmed`, `Pending`, or `Rejected`.

### Components

- **Raised panel:** primary grouping surface for dashboards and forms.
- **Inset field:** form input with recessed shadow and visible focus ring.
- **Status tag:** compact state label with semantic color.
- **Tab button:** role workspace navigation; the active tab uses an inset state.
- **Stat tile:** concise dashboard metric with a large value and supporting label.
- **Item row:** repeatable record for users, payments, assignments, and submissions.
- **Progress bar:** fit-score visualization for AI suggestions.
- **Toast:** short-lived confirmation or server error message.

### Layout

- Center the application within a maximum content width of approximately 1100px.
- Use generous but consistent spacing between panels.
- Use two-column forms on wider screens and collapse to one column below 560px.
- Preserve stable controls and readable text on mobile.
- Keep role dashboards dense enough for review work without introducing nested card structures.

## 6. Status Model

### Account verification

- `pending`: registration is awaiting admin review.
- `verified`: dashboard access is unlocked once payment is confirmed.
- `rejected`: registration was rejected and the user remains blocked.

### Payment

- `Unpaid`: no valid payment has been submitted.
- `Submitted`: reference is awaiting admin confirmation.
- `Confirmed`: payment gate is satisfied.
- `Rejected`: user can correct and resubmit the payment.

### Campaign

- `Requested`: submitted by a company and awaiting or undergoing curation.
- `Active`: campaign is in progress.
- `Completed`: campaign work is finished.

### Task submission

- `Pending`: waiting for admin review.
- `Approved`: proof accepted and counted toward progress.
- `Rejected`: proof needs correction or was not accepted.

## 7. Privacy and Security Boundaries

The server is the authority for all access decisions. The client must never be treated as a security boundary.

- State responses are filtered by role.
- Students never receive company records outside their own assignments.
- Companies never receive the student database.
- Contact details are returned only for revealed assignments.
- Verification cannot succeed before payment confirmation.
- Uploaded files are stored outside the web root and served only to the admin or owning user.
- Passwords use scrypt and login/registration/payment attempts are rate limited.
- Auth tokens are HMAC-signed and expire after seven days.
- Payment amounts are fixed on the server; the client only displays them.

## 8. Technical Architecture

```text
React + Vite client
        |
        | /api requests
        v
Node.js HTTP server
        |
        +-- HMAC authentication and RBAC
        +-- payment and verification gates
        +-- matching engine
        +-- protected file handling
        v
SQLite database + data/uploads/
```

### Frontend boundaries

- `App.jsx` owns session state, metadata, gated screens, refresh, sign-out, and toasts.
- `ctx.js` exposes shared application actions and state.
- `api.js` owns HTTP requests, tokens, and protected file access.
- `ui.jsx` contains shared fields, tags, tabs, money formatting, file links, and student cards.
- `views/Auth.jsx` owns authentication, registration, payment, and waiting states.
- `views/Admin.jsx`, `views/Company.jsx`, and `views/Student.jsx` own role workflows.
- `styles.css` defines the shared visual system.

### Backend boundaries

- `server.js` exposes the API, serves the production client, initializes SQLite, seeds demo data, and enforces role and privacy rules.
- SQLite stores users, campaigns, assignments, files, payments, and submissions.
- `data/uploads/` stores uploaded binary files outside the public client directory.

## 9. Future Design Considerations

- Replace manual payment review with a gateway webhook while preserving the server-side confirmation gate.
- Add explicit audit history for verification, payment, assignment, and contact-sharing decisions.
- Add filters and bulk actions to admin queues as data volume grows.
- Add accessible file previews and clearer upload validation feedback.
- Add notification delivery for payment confirmation, verification decisions, assignments, and rejected submissions.
- Keep AI matching explainable and editable; never make automatic assignment the only path.

## 10. Definition of Done for UI Changes

A new feature is complete when:

- The correct role can reach it through the existing workspace navigation.
- Loading, empty, success, pending, rejected, and error states are represented.
- Server-side authorization and data isolation are preserved.
- Sensitive data is hidden until the existing approval rule allows it.
- The experience remains usable at mobile widths.
- The existing light neumorphic visual system and semantic status model remain consistent.
- Backend integration tests and the production client build pass.
