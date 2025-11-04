# Azure SQL Integration Implementation Guide

This guide provides the exact steps required to implement an Azure Functions API that performs CRUD operations against Azure SQL for the MapLedger project. Follow every step in order; each builds on the previous ones.

## 1. Prerequisites
1. **Install tooling locally**
   1. Install Node.js 18 LTS (includes npm).
   2. Install the Azure Functions Core Tools v4 (`npm i -g azure-functions-core-tools@4`).
   3. Install the Azure CLI (`https://aka.ms/installazurecliwindows` or platform-specific installer).
   4. Install SQL Server tools: Azure Data Studio _or_ SQL Server Management Studio for querying the database.
   5. Confirm Git is available and you have access to the MapLedger repository.
2. **Verify repository layout**
   1. Clone the repository locally and `cd map-ledger`.
   2. Ensure the backend Azure Functions project resides at `map-ledger/backend`.
   3. Ensure the frontend React application resides at `map-ledger/frontend`.
3. **Collect required credentials**
   1. Azure subscription ID with contributor rights.
   2. Azure Static Web Apps resource name.
   3. Azure SQL Server name, database name, admin login, and firewall configuration permissions.
   4. Azure Active Directory tenant information if managed identities will be used.

## 2. Prepare local backend configuration
1. Copy `backend/local.settings.json.sample` (or create a new file if missing) to `backend/local.settings.json`.
2. Populate `Values` with:
   1. `AzureWebJobsStorage`: Use `UseDevelopmentStorage=true` for local development.
   2. `SQL_CONNECTION_STRING`: Add the full connection string to the target Azure SQL database.
   3. `JWT_ISSUER`, `JWT_AUDIENCE`, and `JWT_JWKS_URI`: Provide values that match your Azure AD app registration for token validation.
3. Run `npm install` inside `backend/` if dependencies are not yet installed.
4. Run `npm run build` to confirm TypeScript compilation succeeds.

## 3. Convert Express handlers to Azure Functions
1. Review `backend/src/index.ts` to identify the current Express app export (the default exported `app`).
2. For each handler folder under `backend/src/functions`:
   1. Open the `index.ts` file and examine the Express-style handler (`userClientsRouter`, etc.).
   2. Create a new file `function.ts` in the same folder using the Azure Functions v4 model:
      1. Import `app` from `@azure/functions`.
      2. Import the existing handler logic (`handleUserClients` or similar).
      3. Register an HTTP trigger using `app.http('userClients', { methods: ['GET'], authLevel: 'function', handler: handleUserClients })`.
      4. Repeat for POST, PUT, DELETE, or PATCH methods as needed for CRUD endpoints.
   3. Update imports so the shared logic is separate from the transport layer.
3. Delete or deprecate Express-specific `Router` usage once all endpoints are registered with `app.http`.
4. Ensure each function file exports nothing (Azure runtime scans the registration side effects).
5. Run `npm run lint` to confirm TypeScript and ESLint pass.

## 4. Expose CRUD operations
1. Identify domain entities in `backend/src/entities` (e.g., `MasterClient`).
2. For each CRUD requirement:
   1. Define request/response DTOs in `backend/src/types`.
   2. Implement repository functions in `backend/src/repositories` that wrap `runQuery` for Create, Read, Update, Delete.
   3. Write handler functions in `backend/src/functions/<feature>/handlers.ts` that:
      1. Validate input payloads (use `zod` or built-in guards).
      2. Call repository functions.
      3. Return structured JSON responses with status codes (`201`, `200`, `204`, `400`, `404`, `500`).
3. Update the HTTP trigger registrations to reference the new handlers for each HTTP verb.
4. Add unit tests in `backend/tests` that mock `runQuery` and cover success and failure paths to maintain ≥80% coverage.

## 5. Update OpenAPI documentation
1. Open `backend/src/openapi.ts` and append new path definitions for each CRUD endpoint.
2. Define request bodies, response schemas, and authentication requirements in the OpenAPI document.
3. Regenerate any API documentation assets if automation exists (e.g., `npm run generate:openapi`).

## 6. Run the API locally
1. In `backend/`, execute `npm run build` to compile TypeScript.
2. Start the Functions host: `npm run start` (alias for `func start --typescript` if configured).
3. Confirm the host logs indicate each function is registered (look for `[info] Worker process started and initialized` and function names).
4. From a separate terminal, send requests to the local endpoints:
   1. `curl http://localhost:7071/api/user-clients?email=test@example.com` for GET operations.
   2. `curl -X POST http://localhost:7071/api/user-clients -H "Content-Type: application/json" -d '{"name":"Example"}'` for create.
   3. Adjust URLs and payloads for update/delete tests.
5. Ensure successful responses (HTTP 200/201/204). Investigate logs for any 500 errors.

## 7. Wire the frontend to the Functions API
1. Open `frontend/src/store/organizationStore.ts`.
2. Confirm API calls use `API_BASE_URL` that resolves to `/api` in production.
3. No changes should be needed once the Functions API is working; the SPA will proxy to the deployed backend.
4. If new endpoints were added, update the store hooks or API utilities accordingly.

## 8. Configure deployment for Azure Static Web Apps
1. Open `.github/workflows/azure-static-web-apps.yml` (or the deployment pipeline file).
2. Ensure `api_location: backend` and `app_location: frontend` (or `.` if using root package.json).
3. Add `output_location` if a build output directory is used (e.g., `frontend/dist`).
4. Commit the new Function files and workflow updates.
5. Push to the main branch or create a pull request so the GitHub Action deploys the updated API and SPA.

## 9. Provision Azure resources for SQL connectivity
1. In the Azure Portal or CLI:
   1. Create or reuse an Azure Function App in the same region as the Static Web App backend.
   2. Enable managed identity on the Function App.
   3. Add the managed identity to the Azure SQL Server with `db_datareader` and `db_datawriter` roles.
   4. Update SQL firewall rules to allow Azure services or the Function App outbound IP addresses.
2. Store the SQL connection string securely:
   1. In the Function App configuration (`SQL_CONNECTION_STRING`).
   2. Optionally, store secrets in Azure Key Vault and reference them via `@Microsoft.KeyVault(SecretUri=...)`.
3. Configure JWT validation environment variables on the Function App (`JWT_ISSUER`, `JWT_AUDIENCE`, `JWT_JWKS_URI`).

## 10. Deploy and verify
1. Trigger the Static Web Apps workflow and wait for completion.
2. Navigate to the deployed site and open browser dev tools.
3. Verify API requests to `/api/...` return successful responses from Azure Functions.
4. Use Azure Application Insights (if enabled) to monitor for errors.
5. Run end-to-end tests (manual or automated) to verify CRUD flows.

## 11. Operational checklist
1. Set up alerts for Function App failures and SQL DTU/CPU thresholds.
2. Schedule regular database backups or confirm geo-replication is active.
3. Document runbooks in the `/docs` directory for future team onboarding.
4. Review logs monthly to ensure no unauthorized access attempts.

Following this procedure will replace the unsupported direct SQL access from the frontend with a secure, fully managed Azure Functions API capable of performing CRUD operations against Azure SQL.
