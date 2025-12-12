# Utils

**Purpose**    
Helper functions for data transformation.

## Key Exports
| Name | Type | Description |
|------|------|-------------|
| allocationCalculationService | function | Computes allocation ratios |
| parseTrialBalanceWorkbook | function | Parses Excel GL data |
| suggestColumnMatch | function | Finds likely column matches |

## Runbook Cross-References
A4 Ingestion

## Common Errors
- **Invalid column headers** ƒ?" thrown when required fields like `AccountCode` or `Description` are missing. Handled by `parseTrialBalanceWorkbook`.

## File Format Assumptions
- Trial balance uploads are Excel `.xlsx` workbooks with a single header row followed by data rows.
- Numeric values may be formatted as strings or numbers; parsing trims whitespace and converts numbers as needed.

## CSV Example
A typical trial balance exported to CSV might look like:

```csv
AccountCode,Description,Debit,Credit
1000,Cash,5000,0
1200,Accounts Receivable,1500,0
2200,Accounts Payable,0,2000
```

Headers must include account identifier and description fields; additional
numeric columns are allowed in any order.

## Multiƒ?`Sheet Parsing
`parseTrialBalanceWorkbook.ts` iterates over every worksheet in the uploaded
workbook. For each sheet it:

1. Reads metadata from cells `B1`, `B2`, and `B4` (entity, report name, GL month).
2. Detects the first row containing more than two values as the header row.
3. Collects all subsequent rows with values. If a row has more cells than
   headers, placeholder names such as `Column A` are assigned.

Sheets lacking a header row or any data are skipped. The sheet name (minus the
`"Export "` prefix) becomes the parsed period so multiple months can be processed
in a single file.
