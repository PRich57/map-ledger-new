# Backend Guidelines

The backend consists of Azure Functions written in TypeScript.

- Project layout should include `src/functions`, `src/entities`, `src/repositories`, `src/utils`, and `tests` folders【F:MapLedger Runbook 3.html†L972-L982】.
- Configure `tsconfig.json` to target ES2020, use commonjs modules, and enable `strict` mode【F:MapLedger Runbook 3.html†L984-L984】.
- Install dependencies such as `@azure/storage-blob`, `typeorm`, `mssql`, and set up Jest, ESLint, and Prettier with Husky【F:MapLedger Runbook 3.html†L985-L991】.
- Validate JWT tokens for API calls and enforce RBAC based on Azure AD group claims【F:MapLedger Runbook 3.html†L312-L321】.
- Document endpoints using Swagger/OpenAPI【F:MapLedger Runbook 3.html†L852-L852】【F:MapLedger Runbook 3.html†L931-L939】.
- Provide Jest unit tests mocking Azure Function bindings; maintain ≥80% coverage【F:MapLedger Runbook 3.html†L1341-L1372】.
