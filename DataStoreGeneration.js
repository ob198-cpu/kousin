// @ts-nocheck
/**
 * records / roles are one logical dataset.  A destructive full replacement
 * is staged in two new sheets and becomes canonical only when the single
 * activeDataGeneration meta cell is switched.  Ordinary row updates continue
 * to target whichever generation that pointer selected.
 *
 * Constants and shared primitives intentionally remain in DataStore.js.
 * Apps Script loads these declarations into the same global runtime.
 */
function storeResolveSheet_(spreadsheet, sheetName) {
  if (sheetName !== "records" && sheetName !== "roles") {
    var ordinary = spreadsheet.getSheetByName(sheetName);
    if (!ordinary) storeFail_("STORE_SCHEMA_MISSING", "Required store sheet is missing.");
    return ordinary;
  }
  var generationId = storeReadActiveDataGeneration_(spreadsheet);
  storeAssertCompleteDataGeneration_(spreadsheet, generationId, false);
  var sheet = spreadsheet.getSheetByName(
    storeDataGenerationSheetName_(sheetName, generationId)
  );
  if (!sheet) storeFail_("STORE_DATA_GENERATION_INCOMPLETE", "Active data generation is incomplete.");
  return sheet;
}

function storeReadActiveDataGeneration_(spreadsheet) {
  var sheet = spreadsheet.getSheetByName("_meta");
  if (!sheet) storeFail_("STORE_SCHEMA_MISSING", "Store metadata sheet is missing.");
  var lastRow = sheet.getLastRow();
  var found = [];
  if (lastRow >= 2) {
    sheet.getRange(2, 1, lastRow - 1, 2).getValues().forEach(function (row, index) {
      if (String(row[0] || "") === RENEWAL_STORE.ACTIVE_DATA_GENERATION_META_KEY) {
        found.push({ value: String(row[1] || ""), rowNumber: index + 2 });
      }
    });
  }
  if (found.length > 1) {
    storeFail_("STORE_DATA_GENERATION_POINTER_INVALID", "Active data generation pointer is duplicated.");
  }
  // Existing V1 stores predate the pointer.  Until their first generation
  // commit, the original records/roles pair remains the canonical base.
  var value = found.length ? found[0].value : RENEWAL_STORE.BASE_DATA_GENERATION;
  return storeDataGenerationId_(value);
}

function storeEnsureActiveDataGenerationPointer_(spreadsheet) {
  var sheet = spreadsheet.getSheetByName("_meta");
  if (!sheet) storeFail_("STORE_SCHEMA_MISSING", "Store metadata sheet is missing.");
  var lastRow = sheet.getLastRow();
  var matches = [];
  if (lastRow >= 2) {
    sheet.getRange(2, 1, lastRow - 1, 2).getValues().forEach(function (row, index) {
      if (String(row[0] || "") === RENEWAL_STORE.ACTIVE_DATA_GENERATION_META_KEY) {
        matches.push({ value: String(row[1] || ""), rowNumber: index + 2 });
      }
    });
  }
  if (matches.length > 1) {
    storeFail_("STORE_DATA_GENERATION_POINTER_INVALID", "Active data generation pointer is duplicated.");
  }
  if (matches.length === 1) {
    storeDataGenerationId_(matches[0].value);
    return matches[0].rowNumber;
  }
  var rowNumber = Math.max(2, lastRow + 1);
  storeEnsureSheetRows_(sheet, rowNumber);
  sheet.getRange(rowNumber, 1, 1, 2).setValues([[
    RENEWAL_STORE.ACTIVE_DATA_GENERATION_META_KEY,
    RENEWAL_STORE.BASE_DATA_GENERATION
  ]]);
  SpreadsheetApp.flush();
  return rowNumber;
}

function storeDataGenerationId_(value) {
  var generationId = String(value || "");
  if (generationId === RENEWAL_STORE.BASE_DATA_GENERATION) return generationId;
  if (!/^g_[A-Za-z0-9-]{1,64}$/.test(generationId)) {
    storeFail_("STORE_DATA_GENERATION_POINTER_INVALID", "Active data generation pointer is invalid.");
  }
  return generationId;
}

function storeDataGenerationSheetName_(logicalName, generationId) {
  generationId = storeDataGenerationId_(generationId);
  if (generationId === RENEWAL_STORE.BASE_DATA_GENERATION) return logicalName;
  return logicalName + "__" + generationId;
}

function storeEnsureGenerationRegistry_(spreadsheet) {
  var name = RENEWAL_STORE.GENERATION_REGISTRY_SHEET;
  var headers = RENEWAL_STORE.GENERATION_REGISTRY_HEADERS;
  var sheet = spreadsheet.getSheetByName(name);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    return sheet;
  }
  var actual = sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0];
  if (storeStableStringify_(actual) !== storeStableStringify_(headers)) {
    storeFail_("STORE_GENERATION_REGISTRY_INVALID", "Data generation registry header is invalid.");
  }
  return sheet;
}

/**
 * Full replacements retain the old pair as a rollback generation.  Nothing is
 * deleted automatically: this inventory provides an early warning and a
 * conservative hard stop before an unbounded number of sheets can accumulate.
 * Incomplete staging left by an interrupted run also consumes one slot.
 */
function storeDataGenerationCapacity_(spreadsheet) {
  var warningCount = Number(RENEWAL_STORE.DATA_GENERATION_WARNING_COUNT);
  var hardLimit = Number(RENEWAL_STORE.DATA_GENERATION_HARD_LIMIT);
  var cellWarningLimit = Number(RENEWAL_STORE.SPREADSHEET_CELL_WARNING_LIMIT);
  var cellHardLimit = Number(RENEWAL_STORE.SPREADSHEET_CELL_HARD_LIMIT);
  if (!Number.isInteger(warningCount) || warningCount < 1 ||
      !Number.isInteger(hardLimit) || hardLimit <= warningCount ||
      !Number.isSafeInteger(cellWarningLimit) || cellWarningLimit < 1 ||
      !Number.isSafeInteger(cellHardLimit) ||
      cellHardLimit <= cellWarningLimit) {
    storeFail_(
      "STORE_DATA_GENERATION_CAPACITY_CONFIG_INVALID",
      "Data generation capacity configuration is invalid."
    );
  }

  var inventory = {};
  var unrecognizedGenerationSheets = 0;
  var allocatedCellCount = 0;
  spreadsheet.getSheets().forEach(function (sheet) {
    if (typeof sheet.getMaxRows !== "function" ||
        typeof sheet.getMaxColumns !== "function") {
      storeFail_(
        "STORE_SPREADSHEET_CAPACITY_INSPECTION_UNAVAILABLE",
        "Spreadsheet cell capacity cannot be inspected."
      );
    }
    var maxRows = Number(sheet.getMaxRows());
    var maxColumns = Number(sheet.getMaxColumns());
    var sheetCells = maxRows * maxColumns;
    if (!Number.isSafeInteger(maxRows) || maxRows < 1 ||
        !Number.isSafeInteger(maxColumns) || maxColumns < 1 ||
        !Number.isSafeInteger(sheetCells) ||
        !Number.isSafeInteger(allocatedCellCount + sheetCells)) {
      storeFail_(
        "STORE_SPREADSHEET_CAPACITY_INVALID",
        "Spreadsheet cell capacity is invalid."
      );
    }
    allocatedCellCount += sheetCells;
    var name = String(sheet.getName() || "");
    if (!/^(records|roles)__g_/.test(name)) return;
    var match = /^(records|roles)__(g_[A-Za-z0-9-]{1,64})$/.exec(name);
    if (!match) {
      unrecognizedGenerationSheets += 1;
      return;
    }
    var logicalName = match[1];
    var generationId = storeDataGenerationId_(match[2]);
    if (!inventory[generationId]) {
      inventory[generationId] = {
        generationId: generationId,
        records: false,
        roles: false,
        manifest: null
      };
    }
    inventory[generationId][logicalName] = true;
  });

  var registry = spreadsheet.getSheetByName(RENEWAL_STORE.GENERATION_REGISTRY_SHEET);
  if (registry) {
    var headers = RENEWAL_STORE.GENERATION_REGISTRY_HEADERS;
    var actual = registry.getRange(1, 1, 1, headers.length).getDisplayValues()[0];
    if (storeStableStringify_(actual) !== storeStableStringify_(headers)) {
      storeFail_(
        "STORE_GENERATION_REGISTRY_INVALID",
        "Data generation registry header is invalid."
      );
    }
    var lastRow = registry.getLastRow();
    if (lastRow >= 2) {
      registry.getRange(2, 1, lastRow - 1, headers.length).getValues()
        .forEach(function (values) {
          var rawId = String(values[0] || "");
          if (!rawId) return;
          var generationId = storeDataGenerationId_(rawId);
          if (!inventory[generationId]) {
            inventory[generationId] = {
              generationId: generationId,
              records: false,
              roles: false,
              manifest: null
            };
          }
          if (inventory[generationId].manifest) {
            storeFail_(
              "STORE_GENERATION_REGISTRY_INVALID",
              "Data generation manifest is duplicated."
            );
          }
          var manifest = {};
          headers.forEach(function (header, index) {
            manifest[header] = values[index];
          });
          inventory[generationId].manifest = manifest;
        });
    }
  }

  var completeCount = 0;
  var incompleteCount = 0;
  Object.keys(inventory).forEach(function (generationId) {
    var item = inventory[generationId];
    var manifest = item.manifest;
    var isComplete = Boolean(
      item.records &&
      item.roles &&
      manifest &&
      String(manifest.status || "") === "COMPLETE" &&
      String(manifest.recordsSheet || "") ===
        storeDataGenerationSheetName_("records", generationId) &&
      String(manifest.rolesSheet || "") ===
        storeDataGenerationSheetName_("roles", generationId)
    );
    if (isComplete) completeCount += 1;
    else incompleteCount += 1;
  });

  // Every unrecognized generation-prefixed sheet is charged as a full slot.
  // This intentionally under-utilizes capacity rather than risking a late
  // insertSheet failure in a store with manually altered or interrupted sheets.
  var retainedCount = Object.keys(inventory).length + unrecognizedGenerationSheets;
  var minimumGenerationCellCount =
    storeProjectedDataGenerationCells_(0, 0) +
    storeProjectedGenerationRegistryCells_(spreadsheet) +
    storeProjectedActiveGenerationPointerCells_(spreadsheet);
  var generationHardStop = retainedCount >= hardLimit;
  var cellHardStop =
    allocatedCellCount + minimumGenerationCellCount > cellHardLimit;
  var cellWarning =
    allocatedCellCount + minimumGenerationCellCount > cellWarningLimit;
  var hardStop = generationHardStop || cellHardStop;
  var warning = hardStop ||
    retainedCount >= warningCount ||
    incompleteCount > 0 ||
    unrecognizedGenerationSheets > 0 ||
    cellWarning;
  return {
    retainedCount: retainedCount,
    completeCount: completeCount,
    incompleteCount: incompleteCount,
    unrecognizedGenerationSheetCount: unrecognizedGenerationSheets,
    warningCount: warningCount,
    hardLimit: hardLimit,
    remainingCreateSlots: Math.max(0, hardLimit - retainedCount),
    allocatedCellCount: allocatedCellCount,
    minimumGenerationCellCount: minimumGenerationCellCount,
    cellWarningLimit: cellWarningLimit,
    cellHardLimit: cellHardLimit,
    remainingCellCapacity: Math.max(0, cellHardLimit - allocatedCellCount),
    warning: warning,
    hardStop: hardStop,
    generationHardStop: generationHardStop,
    cellHardStop: cellHardStop,
    cellWarning: cellWarning
  };
}

function storeProjectedDataGenerationCells_(recordRowCount, roleRowCount) {
  var recordCount = Number(recordRowCount);
  var roleCount = Number(roleRowCount);
  if (!Number.isSafeInteger(recordCount) || recordCount < 0 ||
      !Number.isSafeInteger(roleCount) || roleCount < 0) {
    storeFail_(
      "STORE_DATA_GENERATION_CAPACITY_INVALID",
      "Projected data generation row count is invalid."
    );
  }
  if (recordCount + 1 > RENEWAL_STORE.MAX_SHEET_ROWS ||
      roleCount + 1 > RENEWAL_STORE.MAX_SHEET_ROWS) {
    storeFail_(
      "STORE_SHEET_ROW_LIMIT",
      "Projected data generation rows exceed the safety limit."
    );
  }
  var defaultRows = Number(RENEWAL_STORE.NEW_SHEET_DEFAULT_ROWS);
  var defaultColumns = Number(RENEWAL_STORE.NEW_SHEET_DEFAULT_COLUMNS);
  if (!Number.isSafeInteger(defaultRows) || defaultRows < 1 ||
      !Number.isSafeInteger(defaultColumns) || defaultColumns < 1) {
    storeFail_(
      "STORE_DATA_GENERATION_CAPACITY_CONFIG_INVALID",
      "Data generation sheet projection configuration is invalid."
    );
  }
  var recordRows = Math.max(defaultRows, recordCount + 1);
  var roleRows = Math.max(defaultRows, roleCount + 1);
  var recordColumns = Math.max(
    defaultColumns, RENEWAL_STORE_SCHEMAS.records.length
  );
  var roleColumns = Math.max(
    defaultColumns, RENEWAL_STORE_SCHEMAS.roles.length
  );
  var projected = recordRows * recordColumns + roleRows * roleColumns;
  if (!Number.isSafeInteger(projected)) {
    storeFail_(
      "STORE_DATA_GENERATION_CAPACITY_INVALID",
      "Projected data generation cell count is invalid."
    );
  }
  return projected;
}

function storeProjectedGenerationRegistryCells_(spreadsheet) {
  var registry = spreadsheet.getSheetByName(
    RENEWAL_STORE.GENERATION_REGISTRY_SHEET
  );
  if (!registry) {
    return Number(RENEWAL_STORE.NEW_SHEET_DEFAULT_ROWS) *
      Number(RENEWAL_STORE.NEW_SHEET_DEFAULT_COLUMNS);
  }
  return storeProjectedSheetAppendCells_(
    registry, 1, "data generation registry"
  );
}

function storeProjectedActiveGenerationPointerCells_(spreadsheet) {
  var meta = spreadsheet.getSheetByName("_meta");
  if (!meta) {
    storeFail_("STORE_SCHEMA_MISSING", "Store metadata sheet is missing.");
  }
  var matches = 0;
  var lastRow = meta.getLastRow();
  if (lastRow >= 2) {
    meta.getRange(2, 1, lastRow - 1, 2).getValues().forEach(function (row) {
      if (String(row[0] || "") !==
          RENEWAL_STORE.ACTIVE_DATA_GENERATION_META_KEY) return;
      storeDataGenerationId_(row[1]);
      matches += 1;
    });
  }
  if (matches > 1) {
    storeFail_(
      "STORE_DATA_GENERATION_POINTER_INVALID",
      "Active data generation pointer is duplicated."
    );
  }
  return matches === 1 ? 0 :
    storeProjectedSheetAppendCells_(meta, 1, "generation pointer");
}

function storeProjectedBackupReconciliationAuditRows_(spreadsheet) {
  var rows = storeReadBackups_(spreadsheet);
  var candidates = {};
  var counts = {};
  rows.forEach(function (row) {
    var status = String(row.status || "");
    if (status !== "COMPLETE" && status !== "PREPARED") return;
    var backupId = String(row.backupId || "");
    var auditKey =
      storeSha256_(backupId) + "|" + storeAuditToken_(backupId);
    if (candidates[auditKey]) {
      storeFail_(
        "STORE_BACKUP_REGISTRY_DUPLICATE",
        "Backup registry contains a duplicate recovery candidate."
      );
    }
    candidates[auditKey] = { row: row, status: status };
    counts[auditKey] = { prepared: 0, committed: 0 };
  });
  storeReadObjects_(spreadsheet, "audit").forEach(function (audit) {
    if (String(audit.entityType || "") !== "BACKUP" ||
        String(audit.action || "") !== "BACKUP_CREATE") return;
    var auditKey = String(audit.entityKeyHash || "") + "|" +
      String(audit.correlationId || "");
    if (!counts[auditKey]) return;
    if (String(audit.eventState || "") === "PREPARED") {
      counts[auditKey].prepared += 1;
    }
    if (String(audit.eventState || "") === "COMMITTED") {
      counts[auditKey].committed += 1;
    }
  });
  var projected = 0;
  Object.keys(candidates).forEach(function (auditKey) {
    var auditCounts = counts[auditKey];
    if (auditCounts.prepared > 1 || auditCounts.committed > 1) {
      storeFail_(
        "STORE_BACKUP_AUDIT_DUPLICATE",
        "Backup audit markers are duplicated; automatic recovery stopped."
      );
    }
    if (candidates[auditKey].status === "PREPARED" ||
        auditCounts.committed === 0) {
      projected += 1;
    }
  });
  if (!Number.isSafeInteger(projected)) {
    storeFail_(
      "STORE_DATA_GENERATION_CAPACITY_INVALID",
      "Projected backup reconciliation audit rows are invalid."
    );
  }
  return projected;
}

function storeProjectedSheetAppendCells_(sheet, appendRows, label) {
  var additionalRows = Number(appendRows);
  if (!Number.isSafeInteger(additionalRows) || additionalRows < 0) {
    storeFail_(
      "STORE_DATA_GENERATION_CAPACITY_INVALID",
      "Projected " + String(label || "sheet") + " rows are invalid."
    );
  }
  if (!sheet || typeof sheet.getLastRow !== "function" ||
      typeof sheet.getMaxRows !== "function" ||
      typeof sheet.getMaxColumns !== "function") {
    storeFail_(
      "STORE_SPREADSHEET_CAPACITY_INSPECTION_UNAVAILABLE",
      "Projected " + String(label || "sheet") +
        " capacity cannot be inspected."
    );
  }
  var currentLastRow = Math.max(1, Number(sheet.getLastRow()));
  var currentMaxRows = Number(sheet.getMaxRows());
  var currentMaxColumns = Number(sheet.getMaxColumns());
  var requiredLastRow = currentLastRow + additionalRows;
  if (!Number.isSafeInteger(currentLastRow) ||
      !Number.isSafeInteger(currentMaxRows) || currentMaxRows < 1 ||
      !Number.isSafeInteger(currentMaxColumns) || currentMaxColumns < 1 ||
      !Number.isSafeInteger(requiredLastRow) ||
      requiredLastRow > RENEWAL_STORE.MAX_SHEET_ROWS) {
    storeFail_(
      "STORE_SHEET_ROW_LIMIT",
      "Projected " + String(label || "sheet") +
        " rows exceed the safety limit."
    );
  }
  var expandedRows = Math.max(0, requiredLastRow - currentMaxRows);
  var projectedCells = expandedRows * currentMaxColumns;
  if (!Number.isSafeInteger(projectedCells)) {
    storeFail_(
      "STORE_SPREADSHEET_CAPACITY_INVALID",
      "Projected " + String(label || "sheet") +
        " cell capacity is invalid."
    );
  }
  return projectedCells;
}

function storeProjectedBulkSideEffectCells_(spreadsheet, options) {
  options = options || {};
  var auditRows = Number(options.auditRows || 0);
  var backupRows = Number(options.backupRows || 0);
  if (options.reconcileBackups === true) {
    auditRows += storeProjectedBackupReconciliationAuditRows_(spreadsheet);
  } else if (options.reconcileBackups !== undefined &&
      options.reconcileBackups !== false) {
    storeFail_(
      "STORE_DATA_GENERATION_CAPACITY_INVALID",
      "Projected backup reconciliation option is invalid."
    );
  }
  if (!Number.isSafeInteger(auditRows) || auditRows < 0 ||
      !Number.isSafeInteger(backupRows) || backupRows < 0) {
    storeFail_(
      "STORE_DATA_GENERATION_CAPACITY_INVALID",
      "Projected bulk operation side effects are invalid."
    );
  }
  var projected = 0;
  if (auditRows) {
    projected += storeProjectedSheetAppendCells_(
      spreadsheet.getSheetByName("audit"), auditRows, "audit"
    );
  }
  if (backupRows) {
    projected += storeProjectedSheetAppendCells_(
      spreadsheet.getSheetByName("backups"), backupRows, "backup registry"
    );
  }
  if (!Number.isSafeInteger(projected)) {
    storeFail_(
      "STORE_SPREADSHEET_CAPACITY_INVALID",
      "Projected bulk operation cell capacity is invalid."
    );
  }
  return projected;
}

function storeAssertDataGenerationCapacityForCreate_(
  spreadsheet, recordRowCount, roleRowCount, options
) {
  var capacity = storeDataGenerationCapacity_(spreadsheet);
  if (capacity.generationHardStop) {
    storeFail_(
      "STORE_DATA_GENERATION_CAPACITY_LIMIT",
      "Rollback generations reached the safety limit. Bulk import and restore are stopped; ordinary row updates remain available. Do not delete sheets manually. An administrator must perform an approved archive and compaction."
    );
  }
  var projectedCellCount = storeProjectedDataGenerationCells_(
    recordRowCount, roleRowCount
  ) + storeProjectedGenerationRegistryCells_(spreadsheet) +
    storeProjectedActiveGenerationPointerCells_(spreadsheet);
  var projectedSideEffectCellCount =
    storeProjectedBulkSideEffectCells_(spreadsheet, options);
  if (capacity.allocatedCellCount + projectedCellCount +
      projectedSideEffectCellCount >
      capacity.cellHardLimit) {
    storeFail_(
      "STORE_SPREADSHEET_CELL_CAPACITY_LIMIT",
      "The projected data generation would exceed the spreadsheet cell safety limit. Bulk import and restore are stopped before any write. Do not delete sheets manually."
    );
  }
  capacity.projectedGenerationCellCount = projectedCellCount;
  capacity.projectedSideEffectCellCount = projectedSideEffectCellCount;
  capacity.projectedAllocatedCellCount =
    capacity.allocatedCellCount + projectedCellCount +
      projectedSideEffectCellCount;
  return capacity;
}

function storeFindGenerationManifest_(spreadsheet, generationId) {
  var sheet = spreadsheet.getSheetByName(RENEWAL_STORE.GENERATION_REGISTRY_SHEET);
  if (!sheet) return null;
  var headers = RENEWAL_STORE.GENERATION_REGISTRY_HEADERS;
  var actual = sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0];
  if (storeStableStringify_(actual) !== storeStableStringify_(headers)) {
    storeFail_("STORE_GENERATION_REGISTRY_INVALID", "Data generation registry header is invalid.");
  }
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  var matches = [];
  sheet.getRange(2, 1, lastRow - 1, headers.length).getValues()
    .forEach(function (values, index) {
      if (String(values[0] || "") !== generationId) return;
      var row = { _rowNumber: index + 2 };
      headers.forEach(function (header, column) { row[header] = values[column]; });
      matches.push(row);
    });
  if (matches.length > 1) {
    storeFail_("STORE_GENERATION_REGISTRY_INVALID", "Data generation manifest is duplicated.");
  }
  return matches[0] || null;
}

function storeActiveGenerationManifest_(spreadsheet) {
  var generationId = storeReadActiveDataGeneration_(spreadsheet);
  storeAssertCompleteDataGeneration_(spreadsheet, generationId, true);
  if (generationId === RENEWAL_STORE.BASE_DATA_GENERATION) return null;
  return storeFindGenerationManifest_(spreadsheet, generationId);
}

function storeAssertSheetHeader_(sheet, schemaName) {
  if (!sheet) storeFail_("STORE_DATA_GENERATION_INCOMPLETE", "Data generation sheet is missing.");
  var expected = RENEWAL_STORE_SCHEMAS[schemaName];
  var actual = sheet.getRange(1, 1, 1, expected.length).getDisplayValues()[0];
  if (storeStableStringify_(actual) !== storeStableStringify_(expected)) {
    storeFail_("STORE_DATA_GENERATION_INCOMPLETE", "Data generation header is invalid.");
  }
}

function storeGenerationRows_(sheet, schemaName) {
  var width = RENEWAL_STORE_SCHEMAS[schemaName].length;
  var count = Math.max(0, sheet.getLastRow() - 1);
  return count ? sheet.getRange(2, 1, count, width).getValues() : [];
}

function storeGenerationRowsHash_(rows) {
  return storeSha256_(storeStableStringify_(rows));
}

function storeDataGenerationObjectsFromRows_(rows, schemaName) {
  var headers = RENEWAL_STORE_SCHEMAS[schemaName];
  var objects = (rows || []).map(function (values, index) {
    var object = { _rowNumber: index + 2 };
    headers.forEach(function (header, column) {
      object[header] = values[column];
    });
    return object;
  });
  return schemaName === "records" ?
    storeParseRecordObjects_(objects) : storeParseRoleObjects_(objects);
}

function storeDataGenerationIntegrityFromRows_(
  generationId, recordRows, roleRows
) {
  var records = storeDataGenerationObjectsFromRows_(recordRows, "records");
  var roles = storeDataGenerationObjectsFromRows_(roleRows, "roles");
  return {
    generationId: storeDataGenerationId_(generationId),
    recordCount: recordRows.length,
    roleCount: roleRows.length,
    recordsHash: storeGenerationRowsHash_(recordRows),
    rolesHash: storeGenerationRowsHash_(roleRows),
    dataHash: storeDataFingerprint_(records, roles)
  };
}

function storeReadDataGenerationIntegrity_(spreadsheet, generationId) {
  generationId = storeDataGenerationId_(generationId);
  var recordsSheet = spreadsheet.getSheetByName(
    storeDataGenerationSheetName_("records", generationId)
  );
  var rolesSheet = spreadsheet.getSheetByName(
    storeDataGenerationSheetName_("roles", generationId)
  );
  storeAssertSheetHeader_(recordsSheet, "records");
  storeAssertSheetHeader_(rolesSheet, "roles");
  return storeDataGenerationIntegrityFromRows_(
    generationId,
    storeGenerationRows_(recordsSheet, "records"),
    storeGenerationRows_(rolesSheet, "roles")
  );
}

function storeExpectedActiveGenerationIntegrityForRow_(
  spreadsheet, sheetName, rowNumber, rowValues
) {
  if (["records", "roles"].indexOf(String(sheetName || "")) < 0) {
    storeFail_(
      "STORE_DATA_GENERATION_MUTATION_INVALID",
      "Generation integrity can only prepare records or roles."
    );
  }
  var generationId = storeReadActiveDataGeneration_(spreadsheet);
  if (generationId === RENEWAL_STORE.BASE_DATA_GENERATION) return null;
  storeAssertCompleteDataGeneration_(spreadsheet, generationId, true);
  var recordsSheet = spreadsheet.getSheetByName(
    storeDataGenerationSheetName_("records", generationId)
  );
  var rolesSheet = spreadsheet.getSheetByName(
    storeDataGenerationSheetName_("roles", generationId)
  );
  var recordRows = storeGenerationRows_(recordsSheet, "records");
  var roleRows = storeGenerationRows_(rolesSheet, "roles");
  var targetRows = sheetName === "records" ? recordRows : roleRows;
  var targetWidth = RENEWAL_STORE_SCHEMAS[sheetName].length;
  var index = Number(rowNumber) - 2;
  if (!Number.isInteger(index) || index < 0 || index > targetRows.length ||
      !Array.isArray(rowValues) || rowValues.length !== targetWidth) {
    storeFail_(
      "STORE_DATA_GENERATION_MUTATION_INVALID",
      "The audited row cannot be projected into the active generation."
    );
  }
  if (index === targetRows.length) targetRows.push(rowValues.slice());
  else targetRows[index] = rowValues.slice();
  return storeDataGenerationIntegrityFromRows_(
    generationId, recordRows, roleRows
  );
}

function storeAssertGenerationIntegrityMatches_(
  actual, expected, errorCode, message
) {
  var fields = [
    "generationId", "recordCount", "roleCount",
    "recordsHash", "rolesHash", "dataHash"
  ];
  if (!actual || !expected || !fields.every(function (field) {
    return String(actual[field]) === String(expected[field]);
  })) {
    storeFail_(errorCode, message);
  }
}

function storeCommitExpectedActiveGenerationIntegrity_(
  spreadsheet, expected
) {
  if (!expected) return null;
  var generationId = storeReadActiveDataGeneration_(spreadsheet);
  if (generationId !== String(expected.generationId || "")) {
    storeFail_(
      "STORE_DATA_GENERATION_MUTATION_DIVERGED",
      "The active generation changed while finalizing an audited row."
    );
  }
  var actual = storeReadDataGenerationIntegrity_(spreadsheet, generationId);
  storeAssertGenerationIntegrityMatches_(
    actual,
    expected,
    "STORE_DATA_GENERATION_MUTATION_DIVERGED",
    "The active generation contains changes beyond the prepared audited row."
  );
  var manifest = storeFindGenerationManifest_(spreadsheet, generationId);
  if (!manifest || String(manifest.status || "") !== "COMPLETE") {
    storeFail_(
      "STORE_DATA_GENERATION_INCOMPLETE",
      "The active generation manifest is missing."
    );
  }
  var next = {};
  RENEWAL_STORE.GENERATION_REGISTRY_HEADERS.forEach(function (header) {
    next[header] = manifest[header];
  });
  next.recordCount = expected.recordCount;
  next.roleCount = expected.roleCount;
  next.recordsHash = expected.recordsHash;
  next.rolesHash = expected.rolesHash;
  next.dataHash = expected.dataHash;
  var values = RENEWAL_STORE.GENERATION_REGISTRY_HEADERS.map(function (header) {
    return next[header] === undefined ? "" : next[header];
  });
  var registry = spreadsheet.getSheetByName(
    RENEWAL_STORE.GENERATION_REGISTRY_SHEET
  );
  try {
    registry.getRange(
      manifest._rowNumber, 1, 1, values.length
    ).setValues([values]);
    SpreadsheetApp.flush();
  } catch (writeError) {
    var afterFailure = storeFindGenerationManifest_(
      spreadsheet, generationId
    );
    var committedAfterFailure = afterFailure &&
      Number(afterFailure.recordCount) === Number(expected.recordCount) &&
      Number(afterFailure.roleCount) === Number(expected.roleCount) &&
      String(afterFailure.recordsHash || "") === expected.recordsHash &&
      String(afterFailure.rolesHash || "") === expected.rolesHash &&
      String(afterFailure.dataHash || "") === expected.dataHash;
    if (!committedAfterFailure) throw writeError;
  }
  storeAssertCompleteDataGeneration_(spreadsheet, generationId, true);
  return storeFindGenerationManifest_(spreadsheet, generationId);
}

function storeAssertCompleteDataGeneration_(spreadsheet, generationId, verifyHashes) {
  generationId = storeDataGenerationId_(generationId);
  var recordsSheet = spreadsheet.getSheetByName(
    storeDataGenerationSheetName_("records", generationId)
  );
  var rolesSheet = spreadsheet.getSheetByName(
    storeDataGenerationSheetName_("roles", generationId)
  );
  storeAssertSheetHeader_(recordsSheet, "records");
  storeAssertSheetHeader_(rolesSheet, "roles");
  if (generationId === RENEWAL_STORE.BASE_DATA_GENERATION) return true;

  var manifest = storeFindGenerationManifest_(spreadsheet, generationId);
  if (!manifest || String(manifest.status || "") !== "COMPLETE" ||
      String(manifest.recordsSheet || "") !== recordsSheet.getName() ||
      String(manifest.rolesSheet || "") !== rolesSheet.getName() ||
      !/^[a-f0-9]{64}$/i.test(String(manifest.dataHash || "")) ||
      !String(manifest.correlationId || "")) {
    storeFail_("STORE_DATA_GENERATION_INCOMPLETE", "Active data generation was not validated.");
  }
  if (verifyHashes === true) {
    var actualIntegrity = storeReadDataGenerationIntegrity_(
      spreadsheet, generationId
    );
    storeAssertGenerationIntegrityMatches_(
      actualIntegrity,
      {
        generationId: generationId,
        recordCount: Number(manifest.recordCount),
        roleCount: Number(manifest.roleCount),
        recordsHash: String(manifest.recordsHash || ""),
        rolesHash: String(manifest.rolesHash || ""),
        dataHash: String(manifest.dataHash || "")
      },
      "STORE_DATA_GENERATION_INCOMPLETE",
      "Staged data generation verification failed."
    );
    var parsedRecords = storeDataGenerationObjectsFromRows_(
      storeGenerationRows_(recordsSheet, "records"), "records"
    );
    var recordIds = {};
    parsedRecords.forEach(function (row, index) {
      if (recordIds[row.recordId]) {
        storeFail_("STORE_RECORD_ID_DUPLICATE", "Staged data generation contains a duplicate record.");
      }
      recordIds[row.recordId] = true;
      storeAssertUniqueRecordKeys_(
        parsedRecords.slice(0, index), row.recordId, row.managementId, row.invoiceNo
      );
    });
    var parsedRoles = storeDataGenerationObjectsFromRows_(
      storeGenerationRows_(rolesSheet, "roles"), "roles"
    );
    if (!parsedRoles.some(function (row) { return row.active && row.role === "admin"; })) {
      storeFail_("STORE_LAST_ADMIN", "Staged data generation has no active administrator.");
    }
    storeAssertActiveRolePolicy_(spreadsheet, parsedRoles);
  }
  return true;
}

function storeNormalizeGenerationRows_(rows, schemaName) {
  if (!Array.isArray(rows)) {
    storeFail_("STORE_DATA_GENERATION_INVALID", "Data generation rows are invalid.");
  }
  var width = RENEWAL_STORE_SCHEMAS[schemaName].length;
  if (rows.length + 1 > RENEWAL_STORE.MAX_SHEET_ROWS) {
    storeFail_("STORE_SHEET_ROW_LIMIT", "Data generation exceeds the row limit.");
  }
  return rows.map(function (row) {
    if (!Array.isArray(row) || row.length !== width) {
      storeFail_("STORE_DATA_GENERATION_INVALID", "Data generation row width is invalid.");
    }
    return row.map(storeCellValue_);
  });
}

function storeCommitDataGeneration_(spreadsheet, recordRows, roleRows, actor, options) {
  options = options || {};
  var normalizedRecords = storeNormalizeGenerationRows_(recordRows, "records");
  var normalizedRoles = storeNormalizeGenerationRows_(roleRows, "roles");
  storeAssertDataGenerationCapacityForCreate_(
    spreadsheet, normalizedRecords.length, normalizedRoles.length
  );
  var pointerRow = storeEnsureActiveDataGenerationPointer_(spreadsheet);
  var generationId = storeDataGenerationId_("g_" + storeUuid_());
  var recordsName = storeDataGenerationSheetName_("records", generationId);
  var rolesName = storeDataGenerationSheetName_("roles", generationId);
  if (spreadsheet.getSheetByName(recordsName) || spreadsheet.getSheetByName(rolesName)) {
    storeFail_("STORE_DATA_GENERATION_DUPLICATE", "Data generation already exists.");
  }

  var recordsSheet = spreadsheet.insertSheet(recordsName);
  recordsSheet.getRange(1, 1, 1, RENEWAL_STORE_SCHEMAS.records.length)
    .setValues([RENEWAL_STORE_SCHEMAS.records]);
  recordsSheet.setFrozenRows(1);
  if (normalizedRecords.length) {
    storeEnsureSheetRows_(recordsSheet, normalizedRecords.length + 1);
    recordsSheet.getRange(2, 1, normalizedRecords.length, RENEWAL_STORE_SCHEMAS.records.length)
      .setValues(normalizedRecords);
  }

  var rolesSheet = spreadsheet.insertSheet(rolesName);
  rolesSheet.getRange(1, 1, 1, RENEWAL_STORE_SCHEMAS.roles.length)
    .setValues([RENEWAL_STORE_SCHEMAS.roles]);
  rolesSheet.setFrozenRows(1);
  if (normalizedRoles.length) {
    storeEnsureSheetRows_(rolesSheet, normalizedRoles.length + 1);
    rolesSheet.getRange(2, 1, normalizedRoles.length, RENEWAL_STORE_SCHEMAS.roles.length)
      .setValues(normalizedRoles);
  }
  SpreadsheetApp.flush();

  // Validate the staged rows before registering them as complete.
  var parsedRecords = storeParseRecordObjects_(
    storeReadObjectsFromSheet_(recordsSheet, "records")
  );
  var parsedRoles = storeParseRoleObjects_(
    storeReadObjectsFromSheet_(rolesSheet, "roles")
  );
  if (storeGenerationRowsHash_(storeGenerationRows_(recordsSheet, "records")) !==
        storeGenerationRowsHash_(normalizedRecords) ||
      storeGenerationRowsHash_(storeGenerationRows_(rolesSheet, "roles")) !==
        storeGenerationRowsHash_(normalizedRoles)) {
    storeFail_("STORE_DATA_GENERATION_INCOMPLETE", "Staged data generation differs from the prepared rows.");
  }

  var registry = storeEnsureGenerationRegistry_(spreadsheet);
  var manifest = [
    generationId,
    recordsName,
    rolesName,
    normalizedRecords.length,
    normalizedRoles.length,
    storeGenerationRowsHash_(normalizedRecords),
    storeGenerationRowsHash_(normalizedRoles),
    storeDataFingerprint_(parsedRecords, parsedRoles),
    storeAuditToken_(options.correlationId || ("generation_" + generationId)),
    storeNowIso_(),
    storeEmail_(actor),
    "COMPLETE"
  ];
  var manifestRow = Math.max(2, registry.getLastRow() + 1);
  storeEnsureSheetRows_(registry, manifestRow);
  registry.getRange(manifestRow, 1, 1, manifest.length).setValues([manifest]);
  SpreadsheetApp.flush();
  storeAssertCompleteDataGeneration_(spreadsheet, generationId, true);

  // This is the only canonical cutover.  If execution stops before it, the
  // old generation remains active; after it, both validated sheets are active.
  spreadsheet.getSheetByName("_meta").getRange(pointerRow, 2).setValue(generationId);
  return {
    generationId: generationId,
    recordCount: normalizedRecords.length,
    roleCount: normalizedRoles.length
  };
}
