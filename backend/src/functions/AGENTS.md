# Functions

**Purpose**    
Azure Functions implementing REST endpoints.

## Key Exports
| Name | Type | Description |
|------|------|-------------|
| glUpload | function | Handles GL file uploads |
| industries | function | Lists industries |
| masterclients | function | Lists master clients |
| mappingSuggest | function | Returns mapping suggestions |

## Runbook Cross-References
§3 System Architecture, §4 Ingestion

## Endpoint Details

### glUpload (`/gl/upload`)
Handles a POST request to upload a general ledger file. The endpoint accepts a
multipart form field named `file` and stores the workbook for processing.
Defined in `openapi.ts` under the `/gl/upload` path.

```bash
curl -F "file=@sample.xlsx" http://localhost:7071/api/gl/upload
```

### industries (`/industries`)
Returns the list of supported industries. The handler is located at
`src/functions/industries/index.ts` and the path is `/industries` in
`openapi.ts`.

```bash
curl http://localhost:7071/api/industries
```

### masterclients (`/masterclients`)
Lists master client definitions. Referenced in `openapi.ts` as the
`/masterclients` path.

```bash
curl http://localhost:7071/api/masterclients
```

### mappingSuggest (`/mapping/suggest`)
Suggests account mappings for a given upload. The endpoint is defined in
`openapi.ts` under `/mapping/suggest`.

```bash
curl "http://localhost:7071/api/mapping/suggest?glUploadId=1"
```
