# Frontend Guidelines

The frontend is a React + TypeScript single page application.

- Configure TailwindCSS and import its directives in `index.css`【F:MapLedger Runbook 3.html†L1005-L1012】.
- Use ESLint with Airbnb + TypeScript rules【F:MapLedger Runbook 3.html†L1016-L1016】.
- Maintain the following directory structure under `src/`: `components`, `pages`, `hooks`, `context`, `services`, `utils`, and `tests`【F:MapLedger Runbook 3.html†L1017-L1025】.
- Implement routes with React Router v6 for paths such as `/login`, `/dashboard`, `/gl/upload`, `/gl/mapping/{glUploadId}`, `/admin/industries`, `/admin/clients`, `/admin/users`, and `/reports`【F:MapLedger Runbook 3.html†L1028-L1037】.
- Integrate MSAL.js for Azure AD authentication and enforce role‑based routes【F:MapLedger Runbook 3.html†L312-L321】.
- MSAL expects env vars `AAD_CLIENT_ID`, `AAD_TENANT_ID`, `AAD_REDIRECT_URI`,
  `AAD_ADMIN_GROUP_ID`, and `AAD_EMPLOYEE_DOMAINS` (also exposed as
  `VITE_`‑prefixed versions)【F:docs/runbook_detailed.html†L140-L150】.
- Ensure responsive, accessible UI compliant with WCAG 2.1 AA【F:MapLedger Runbook 3.html†L840-L844】.
