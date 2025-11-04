# Entities

**Purpose**          
TypeORM models for the database tables.

## Key Exports
| Name | Type | Description |
|------|------|-------------|
| GLUpload | class | Upload metadata entity |
| Industry | class | Industry lookup table |
| MappingSuggestion | class | Suggestion mapping table |
| MasterClient | class | Master client definitions |
| GLAccountRaw | class | Parsed account rows |

## Runbook Cross-References
§3 System Architecture, §4 Ingestion

## Relations & Cascades

- **MasterClient ⇨ GLUpload** — one `MasterClient` may own many `GLUpload` rows.  Deleting a client should cascade and remove its uploads.
- **GLUpload ⇨ GLAccountRaw** — each upload is associated with many raw account rows. Deleting an upload cascades to its raw rows.
- **GLAccountRaw ⇨ MappingSuggestion / FinalMapping** — suggestions and final mappings reference the raw row; when a raw row is removed both child tables cascade.

Refer to the ER diagram in `docs/runbook_detailed.html` (§4.4) for a visual overview.

## TODO (owner: @unassigned)
1. Link entity docs to ER diagram
