# WWHSS Digital Campus — Data Classification & Privacy Policy

WWHSS handles children's identity, academic, attendance, financial, guardian and document data. Authorization must be applied at the field level for sensitive student information.

## Classification

| Class | Examples | Default exposure |
|---|---|---|
| Public | Published notices, events, public pages | Anonymous/public |
| Internal | School operational schedules and catalog data | Authenticated staff by scope |
| Student-private | Academic, attendance, LMS and document records | Student/guardian/authorized staff |
| Guardian-private | Guardian contact and relationship data | Authorized staff/linked guardian |
| Admin-restricted | Funding, fee adjustments, role/permission administration | Authorized administrative roles |
| Highly-sensitive | Medical notes, blood group, sensitive funding evidence | Explicit sensitive-field permission |

## Sensitive-field rules

`medicalNotes`, `bloodGroup`, and funding-category mutation require dedicated sensitive student permissions. Ordinary student profile access is redacted by default.

Sensitive data must not be copied into browser localStorage, the PWA service-worker cache, public CMS content, or AI prompts unless the requesting user is explicitly authorized and the task requires that field.

## Retention and deletion

Retention periods must follow the school's legal/board requirements before production. Deletion must be a controlled administrative workflow with audit evidence; records required for statutory finance, academic history or safeguarding must not be silently deleted.

## AI and research

External AI/web-research providers receive only the minimum authorized context needed for a task. Retrieved web content is untrusted data and must never override application/system instructions or school authorization rules.
