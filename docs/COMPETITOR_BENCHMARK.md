# WWHSS Competitor Benchmark — October 2026

This benchmark is used to select improvements without destabilizing the existing architecture.

| Capability | Market pattern | WWHSS position | Decision |
|---|---|---|---|
| Admissions | SchoolPortal.pk, SchoolDesk, CampusCore emphasize enquiry/admission workflows | Admission enquiry pipeline is implemented and connected to the existing student identity model | Extend conversion/document checklist workflows |
| Fees | Pakistani products emphasize PKR vouchers, online payments, reminders and reconciliation | Funding-first finance, billing periods, payments, waivers and reports are stronger transactionally | Add payment-provider adapters without changing finance invariants |
| Attendance | Parent alerts and optional biometric/device integration are common | Attendance and enrollment authorization are strong | Add provider-neutral notification/device adapters later |
| Exams/results | Report cards, datesheets, award lists and exports are common | Exams/results lifecycle and document engine are strong | Preserve teacher final authority; continue report templates |
| Parent communication | WhatsApp/SMS/app alerts are a major adoption differentiator | Notifications/parent portal exist | Add provider-neutral WhatsApp/SMS integrations only through explicit consent and audit |
| Payroll/HR | SchoolPortal.pk, SchoolDesk and CampusCore emphasize payroll/HR | Staff profiles, leave approvals, payroll periods/records and payment state are now implemented | Continue extending statutory deductions/payslip templates only where required |
| Timetable | Common across all serious platforms | Strong conflict-aware timetable exists | Preserve and extend only where useful |
| Library | OpenEduCat/Frappe include library workflows | WWHSS has library copy/loan logic | Preserve transactional copy protection |
| Documents | Excel/PDF exports are expected | PDF/HTML/CSV plus newly added XLSX | Completed |
| Self-hosting | Open-source ERP products emphasize extensibility/self-hosting | WWHSS Docker + Cloud Run architecture is strong | Preserve both deployment modes |
| Authorization | Mature products increasingly use role/scoped access | WWHSS has unusually deep RBAC/object scope | Preserve; do not replace with simple role checks |
| Backups/DR | Daily backups are common; true restore verification is less common | Encrypted backups + restore checkpoints + object reconciliation | Keep as a differentiator; operational DR drill remains required |
| AI | Newer platforms add report remarks, insights and automation | WWHSS has bounded, permission-aware AI and Assessment Studio | Keep AI advisory/approval boundaries |
| Multi-campus | SchoolPortal.pk and CampusCore emphasize multi-campus | Current architecture has campus-ready scope patterns but is not yet a full multi-tenant SaaS | Do not introduce multi-tenancy until explicitly required |
| UX/mobile | SkoolPro and SchoolDesk emphasize fast mobile workflows | React/Vite/PWA and role-aware portal exist | Prioritize simple teacher/parent mobile flows and offline-safe UX |

## High-value integrations selected

1. Provider-neutral payment adapters for Pakistan payment methods, keeping finance transactions server-authoritative.
2. Provider-neutral SMS/WhatsApp notification adapters with consent, templates, audit events and rate limits.
3. Optional biometric attendance adapter with reconciliation rather than direct database writes.
4. Admissions/enquiry lifecycle connected to the existing student identity model.
5. PTM scheduling as a scoped workflow linked to timetable/teacher/student/parent data.
6. Continued PDF/XLSX document templates and print-quality output.

## Explicitly not copied

- No framework migration.
- No SaaS multi-tenancy added merely because competitors advertise it.
- No frontend-only authorization.
- No AI mutation authority.
- No destructive replacement of the existing finance/LMS/exams architecture.
- No proprietary vendor lock-in in the core domain model.
