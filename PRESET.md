# Preset and Mapping Flow Expectations

This document captures the required behaviors for handling presets and mapping logic across the mapping workflow and associated database tables.

## Core Goals
- Preserve imported chart of accounts on navigation to the Mapping table; every selected sheet’s accounts must appear for user mapping.
- Auto-map accounts whenever historical mappings exist; fall back to manual mapping when none exist.
- Generate a `PRESET_GUID` (UUID string) for every mapping operation and reuse it across related table inserts.
- Prefer automatic application of existing presets before asking the user for input.

## Data Model Overview

### ml.ENTITY_ACCOUNT_MAPPING
- **Key fields:**
  - `ENTITY_ID` (INT): Entity for the account record.
  - `ENTITY_ACCOUNT_ID` (INT): Account identifier from the import.
  - `POLARITY` (VARCHAR(12)): `debit`, `credit`, or `absolute`.
  - `MAPPING_TYPE` (VARCHAR(12)): `direct`, `percentage`, or `dynamic`.
  - `PRESET_GUID` (VARCHAR(36)): Shared GUID for related preset records (replaces prior `PRESET_ID`).
  - `MAPPING_STATUS` (VARCHAR(12)): `mapped`, `unmapped`, `new`, or `excluded`.
  - `EXCLUSION_PCT` (DECIMAL(4,3)): Portion excluded; usually `0`, `100` when fully excluded.
  - `INSERTED_DTTM`: Auto-generated; never set in inserts.
  - `UPDATED_DTTM`: Null on insert; timestamp only on updates.
  - `UPDATED_BY` (VARCHAR(100)): User email for updates.
  - `RECORD_ID`: Auto-increment; never included in inserts.
- **Behavior:** One row per entity-account mapping with status tracking and linkage to preset details via `PRESET_GUID`.

### ml.ENTITY_MAPPING_PRESETS
- **Purpose:** Source of truth for preset identity, type, description, and entity ownership.
- **Fields:**
  - `ENTITY_ID` (INT).
  - `PRESET_GUID` (VARCHAR(36)): Unique preset identifier (generated client-side/app-side).
  - `PRESET_TYPE` (VARCHAR(12)): `direct`, `percentage`, or `dynamic`.
  - `PRESET_DESCRIPTION` (VARCHAR(MAX)): Human-readable summary of the mapping (see description rules below).
- **Description rules:**
  - `direct`: "<Imported Account> -> <SCOA Account>".
  - `percentage`: "<Imported Account> -> <SCOA Account 1>, <SCOA Account 2>, ..." ordered by splits.
  - `dynamic`: Name supplied by user via preset builder.

### ml.ENTITY_MAPPING_PRESET_DETAIL
- **Purpose:** Stores line items for each preset split or dynamic rule.
- **Fields:**
  - `PRESET_GUID` (VARCHAR(36)).
  - `BASIS_DATAPOINT` (VARCHAR(MAX)): SCOA account description of the basis datapoint (only for `dynamic`; null otherwise).
  - `TARGET_DATAPOINT` (VARCHAR(MAX)): Target SCOA account description.
  - `IS_CALCULATED` (BIT): `1` for dynamic-calculated records; `0` for direct/percentage records.
  - `SPECIFIED_PCT` (DECIMAL(4,3)): Percentage allocation; `100` for direct, splits totaling `100` for percentage, null for dynamic.
  - `INSERTED_DTTM`: Auto-generated; never set on insert.
  - `UPDATED_DTTM`: Null on insert; only set on update.
  - `UPDATED_BY` (VARCHAR(100)).
  - `RECORD_ID`: Auto-increment; never set on insert.
- **Multiplicity:** Multiple rows share a `PRESET_GUID` when a mapping has splits (percentage/dynamic) or multiple dynamic relationships.

## Workflow Expectations

1. **Carry over import accounts**: After import confirmation, populate the Mapping table with all accounts from selected sheets; no blanks.
2. **Attempt automated mapping**:
   - Query existing `ml.ENTITY_ACCOUNT_MAPPING` records for the relevant `ENTITY_ID`(s).
   - If matches exist, apply mappings and associated presets automatically, preserving `MAPPING_TYPE`, `POLARITY`, `EXCLUSION_PCT`, and other stored values.
   - If no records exist, skip automation and present all imported accounts for manual mapping.
3. **Preset reuse**: When historical mappings exist, pull matching preset configurations (`PRESET_GUID` across `ENTITY_MAPPING_PRESETS` and `ENTITY_MAPPING_PRESET_DETAIL`) and apply them to the incoming accounts.
4. **Preset generation**: For every new user mapping (manual or edited), generate a new `PRESET_GUID` and insert coordinated records into all three tables.
5. **Updates**: When a user edits a mapping, update all affected records in the relevant tables, setting `UPDATED_DTTM` and `UPDATED_BY` appropriately.
6. **Status handling**: Maintain `MAPPING_STATUS` (`mapped`, `unmapped`, `new`, `excluded`) to reflect current mapping state; adjust `EXCLUSION_PCT` when exclusions occur.

## CRUD Requirements

- **Create**:
  - Always generate a `PRESET_GUID` client-side/app-side before inserting related rows.
  - Insert coordinated records into `ENTITY_ACCOUNT_MAPPING`, `ENTITY_MAPPING_PRESETS`, and `ENTITY_MAPPING_PRESET_DETAIL` using the same `PRESET_GUID`.
  - Omit auto fields (`INSERTED_DTTM`, `UPDATED_DTTM`, `RECORD_ID`) from inserts.
- **Read**:
  - On entering the Mapping view, fetch existing mappings and presets by `ENTITY_ID` to auto-apply known configurations.
  - Respect `MAPPING_TYPE` semantics when applying presets (direct single target, percentage splits totaling 100, dynamic calculated relationships).
- **Update**:
  - Modify existing rows when users change mappings; set `UPDATED_DTTM` and `UPDATED_BY` while preserving `INSERTED_DTTM`.
  - Keep `PRESET_GUID` stable for updated mappings unless a new preset is being created; new presets require a new GUID and associated rows.
- **Delete/Exclude**:
  - Exclusions should update `MAPPING_STATUS` to `excluded` and set `EXCLUSION_PCT` accordingly; do not remove historical records unless explicitly required by separate retention rules.

## Automation and User Experience
- Prefer silent auto-mapping when matching presets exist; surface results for confirmation.
- When no historical data exists, still pre-populate the Mapping table with imported accounts to streamline manual mapping.
- Ensure all preset descriptions remain informative to aid reuse and review.
- Guarantee consistency across tables by using the same `PRESET_GUID` for every related insert and by synchronizing updates across all three tables.
