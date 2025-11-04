# Types

**Purpose**    
Shared TypeScript types and interfaces.

## Key Exports
| Name | Type | Description |
|------|------|-------------|
| User | interface | Authenticated user fields |
| ClientProfile | interface | Client metadata structure |
| GLUpload | interface | GL upload session record |
| GLAccountRaw | interface | Parsed trial balance row |
| MappingSuggestion | interface | AI suggested mapping |
| FinalMapping | interface | Approved final mapping |

## Runbook Cross-References
§3 System Architecture

## Field Mapping
Backend API uses snake_case JSON whereas the UI consumes camelCase. Example:
`GLUploadID` → `glUploadId`, `FileURL` → `fileUrl`.

| Backend field | Frontend field |
|---------------|----------------|
| `gl_upload_id` | `glUploadId` |
| `master_client_id` | `masterClientId` |
| `uploaded_by` | `uploadedBy` |
| `file_name` | `fileName` |
| `file_url` | `fileUrl` |
| `operation_ids` | `operationIds` |
| `allocation_rules` | `allocationRules` |
| `upload_date` | `uploadDate` |
| `status` | `status` |
| `error_message` | `errorMessage` |
| `gl_account_raw_id` | `glAccountRawId` |
| `account_code` | `accountCode` |
| `description` | `description` |
| `debit` | `debit` |
| `credit` | `credit` |
| `balance` | `balance` |
| `mapping_suggestion_id` | `id` (MappingSuggestion) |
| `suggested_coa_code` | `suggestedCOACode` |
| `suggested_coa_desc` | `suggestedCOADesc` |
| `confidence_score` | `confidenceScore` |
| `ai_response_json` | `aiResponseJson` |
| `created_date` | `createdDate` |
| `final_mapping_id` | `id` (FinalMapping) |
| `mapped_coa_account_id` | `mappedCOAAccountId` |
| `mapped_by` | `mappedBy` |
| `mapped_date` | `mappedDate` |

## TODO (owner: @unassigned)
1. Document mapping between API and UI fields
