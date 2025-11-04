# MapLedger Universal Guidelines

This repository contains a React frontend and an Azure Functions backend. Follow these rules for all code:

- Use TypeScript throughout the project.
- Keep a modular folder layout with dedicated folders for API/functions, components, hooks, styles, and tests【F:MapLedger Runbook 3.html†L848-L850】【F:MapLedger Runbook 3.html†L972-L982】【F:MapLedger Runbook 3.html†L1017-L1025】.
- Enforce linting and formatting with ESLint (Airbnb config) and Prettier; run via Husky pre‑commit hook【F:MapLedger Runbook 3.html†L851-L852】【F:MapLedger Runbook 3.html†L985-L991】【F:MapLedger Runbook 3.html†L1016-L1016】.
- Maintain ≥80% unit and integration test coverage using Jest for both frontend and backend【F:MapLedger Runbook 3.html†L853-L854】【F:MapLedger Runbook 3.html†L1341-L1372】.
- Secure the system: all traffic must use HTTPS/TLS and secrets should be stored in Azure Key Vault【F:MapLedger Runbook 3.html†L823-L827】.
- Provide high availability using multi‑region Azure Functions and SQL geo‑replication; monitor failures and implement retry policies【F:MapLedger Runbook 3.html†L833-L837】.
- UIs must comply with WCAG 2.1 AA accessibility standards and be responsive【F:MapLedger Runbook 3.html†L840-L844】.
- Document all API endpoints with Swagger/OpenAPI【F:MapLedger Runbook 3.html†L852-L852】【F:MapLedger Runbook 3.html†L931-L939】.
