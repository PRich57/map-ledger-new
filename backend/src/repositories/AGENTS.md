# Client File Persistence Guidelines

Use these schemas when handling client-file, client-file-entities, client-file-sheets, client-header-mapping, and file-records related payloads and database writes. The tables automatically stamp `INSERTED_DTTM` and default `IS_DELETED` to `0`; do not populate `UPDATED_DTTM`, `UPDATED_BY`, `IS_DELETED`, or `DELETED_DTTM` when inserting new rows.

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
