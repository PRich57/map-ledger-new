# Client File Persistence Guidelines

Use these schemas when handling client-file, client-file-entities, client-file-sheets, client-header-mapping, file-records, and entity-mapping/distribution related payloads and database writes. The tables automatically stamp `INSERTED_DTTM` and default `IS_DELETED` to `0`; do not populate `UPDATED_DTTM`, `UPDATED_BY`, `IS_DELETED`, or `DELETED_DTTM` when inserting new rows. For the tables below, omit `INSERTED_DTTM` from insert statements so the timestamp is generated automatically.

## ml.CLIENT_FILES

```sql
INSERT INTO ml.CLIENT_FILES (
    CLIENT_ID,
    FILE_UPLOAD_GUID,
    SOURCE_FILE_NAME,
    FILE_STORAGE_URI,
    GL_PERIOD_START,
    GL_PERIOD_END,
    INSERTED_BY,
    INSERTED_DTTM,
    FILE_STATUS,
    LAST_STEP_COMPLETED_DTTM,
    IS_DELETED,
    DELETED_DTTM
)
VALUES (
    0,
    '',
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    DEFAULT,
    NULL,
    NULL,
    DEFAULT,
    NULL
);
```

## ml.CLIENT_FILE_ENTITIES

```sql
INSERT INTO ml.CLIENT_FILE_ENTITIES (
    FILE_UPLOAD_GUID,
    ENTITY_ID,
    IS_SELECTED,
    INSERTED_DTTM,
    UPDATED_DTTM,
    UPDATED_BY
)
VALUES (
    '',
    0,
    NULL,
    DEFAULT,
    NULL,
    NULL
);
```

## ml.CLIENT_FILE_SHEETS

```sql
INSERT INTO ml.CLIENT_FILE_SHEETS (
    FILE_UPLOAD_GUID,
    SHEET_NAME,
    IS_SELECTED,
    FIRST_DATA_ROW_INDEX,
    ROW_COUNT,
    INSERTED_DTTM,
    UPDATED_DTTM,
    UPDATED_BY
)
VALUES (
    '',
    '',
    NULL,
    NULL,
    NULL,
    DEFAULT,
    NULL,
    NULL
);
```

## ml.FILE_RECORDS

```sql
INSERT INTO ml.FILE_RECORDS (
    FILE_UPLOAD_GUID,
    SOURCE_SHEET_NAME,
    ENTITY_ID,
    ACCOUNT_ID,
    ACCOUNT_NAME,
    OPENING_BALANCE,
    CLOSING_BALANCE,
    ACTIVITY_AMOUNT,
    GL_MONTH,
    USER_DEFINED1,
    USER_DEFINED2,
    USER_DEFINED3,
    INSERTED_DTTM,
    UPDATED_DTTM,
    UPDATED_BY
)
VALUES (
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    DEFAULT,
    NULL,
    NULL
);
```

## ml.CLIENT_HEADER_MAPPING

```sql
INSERT INTO ml.CLIENT_HEADER_MAPPING (
    CLIENT_ID,
    SOURCE_HEADER,
    TEMPLATE_HEADER,
    MAPPING_METHOD,
    INSERTED_DTTM,
    UPDATED_DTTM,
    UPDATED_BY
)
VALUES (
    NULL,
    NULL,
    NULL,
    NULL,
    DEFAULT,
    NULL,
    NULL
);
```

## ml.ENTITY_ACCOUNT_MAPPING

```sql
INSERT INTO ml.ENTITY_ACCOUNT_MAPPING (
    ENTITY_ID,
    ENTITY_ACCOUNT_ID, -- varchar(100); may contain dashes/alpha, do not cast to int
    POLARITY,
    MAPPING_TYPE,
    PRESET_ID,
    MAPPING_STATUS,
    EXCLUSION_PCT,
    UPDATED_DTTM,
    UPDATED_BY
)
VALUES (
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL
);
```

## ml.ENTITY_ACCOUNTS

```sql
INSERT INTO ml.ENTITY_ACCOUNTS (
    ENTITY_ID,
    ACCOUNT_ID,
    ACCOUNT_NAME,
    UPDATED_DTTM,
    UPDATED_BY
)
VALUES (
    NULL,
    NULL,
    NULL,
    NULL,
    NULL
);
```

## ml.ENTITY_DISTRIBUTION_PRESETS

```sql
INSERT INTO ml.ENTITY_DISTRIBUTION_PRESETS (
    ENTITY_ID,
    PRESET_GUID,
    PRESET_TYPE,
    PRESET_DESCRIPTION,
    ENTITY_ACCOUNT_ID,
    SCOA_ACCOUNT_ID,
    METRIC,
    INSERTED_DTTM,
    UPDATED_DTTM,
    UPDATED_BY
)
VALUES (
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    DEFAULT,
    NULL,
    NULL
);
```

## ml.ENTITY_DISTRIBUTION_PRESET_DETAIL

```sql
INSERT INTO ml.ENTITY_DISTRIBUTION_PRESET_DETAIL (
    PRESET_GUID,
    OPERATION_CD,
    IS_CALCULATED,
    SPECIFIED_PCT,
    INSERTED_DTTM,
    UPDATED_DTTM,
    UPDATED_BY
)
VALUES (
    NULL,
    NULL,
    NULL,
    NULL,
    DEFAULT,
    NULL,
    NULL
);
```

## ml.ENTITY_MAPPING_PRESETS

```sql
INSERT INTO ml.ENTITY_MAPPING_PRESETS (
    ENTITY_ID,
    PRESET_TYPE,
    PRESET_DESCRIPTION
)
VALUES (
    NULL,
    NULL,
    NULL
);
```

## ml.ENTITY_MAPPING_PRESET_DETAIL

```sql
INSERT INTO ml.ENTITY_MAPPING_PRESET_DETAIL (
    PRESET_GUID,
    BASIS_DATAPOINT,
    TARGET_DATAPOINT,
    IS_CALCULATED,
    SPECIFIED_PCT,
    UPDATED_DTTM,
    UPDATED_BY
)
VALUES (
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL
);
```

## ml.ENTITY_PRESET_MAPPING

```sql
INSERT INTO ml.ENTITY_PRESET_MAPPING (
    PRESET_GUID,
    BASIS_DATAPOINT,
    TARGET_DATAPOINT,
    APPLIED_PCT,
    INSERTED_DTTM,
    UPDATED_DTTM,
    UPDATED_BY
)
VALUES (
    NULL,    -- PRESET_GUID varchar(36)
    NULL,    -- BASIS_DATAPOINT varchar(max)
    NULL,    -- TARGET_DATAPOINT varchar(max)
    NULL,    -- APPLIED_PCT decimal(4, 3)
    DEFAULT, -- INSERTED_DTTM datetime
    NULL,    -- UPDATED_DTTM datetime
    NULL     -- UPDATED_BY varchar(100)
);
```

## ml.ENTITY_SCOA_ACTIVITY

```sql
INSERT INTO ml.ENTITY_SCOA_ACTIVITY (
    ENTITY_ID,
    SCOA_ACCOUNT_ID,
    ACTIVITY_MONTH,
    ACTIVITY_VALUE,
    UPDATED_DTTM,
    UPDATED_BY
)
VALUES (
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL
);
```

## ml.ENTITY_SCOA_DISTRIBUTION

```sql
INSERT INTO ml.ENTITY_SCOA_DISTRIBUTION (
    ENTITY_ID,
    ENTITY_ACCOUNT_ID,
    SCOA_ACCOUNT_ID,
    DISTRIBUTION_TYPE,
    PRESET_GUID,
    DISTRIBUTION_STATUS,
    INSERTED_DTTM,
    UPDATED_DTTM,
    UPDATED_BY
)
VALUES (
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    DEFAULT,
    NULL,
    NULL
);
```

## ml.OPERATION_SCOA_ACTIVITY

```sql
INSERT INTO ml.OPERATION_SCOA_ACTIVITY (
    OPERATION_CD,
    SCOA_ACCOUNT_ID,
    ACTIVITY_MONTH,
    ACTIVITY_VALUE,
    INSERTED_DTTM,
    UPDATED_DTTM,
    UPDATED_BY
)
VALUES (
    NULL,
    NULL,
    NULL,
    NULL,
    DEFAULT,
    NULL,
    NULL
);
```

## Notes for Entity / Mapping / Distribution Tables

For all of the new ml.ENTITY_* and ml.OPERATION_SCOA_ACTIVITY tables, leave UPDATED_DTTM and UPDATED_BY as NULL on insert. These fields are only to be populated when records are updated.

All `GL_MONTH` and `ACTIVITY_MONTH` columns use the `DATE` data type and must hold the first day of the represented month (e.g., `2024-08-01`). Normalize inputs to a `YYYY-MM-01` pattern before persisting to enforce the updated schema.

Do not include INSERTED_DTTM in insert statements for these tables. Each table automatically generates an INSERTED_DTTM timestamp when a record is inserted.
