// @ts-nocheck
/*
 * Finance V2 disaster recovery.
 *
 * The active ledger is never rolled back in place. A full spreadsheet
 * generation is copied, repaired, validated, backed up, and only then
 * activated by changing the dedicated-store Script Property pointer.
 */

var FINANCE_DISASTER_RESTORE = {
  CONFIRM: "FINANCE_DISASTER_RESTORE_LATEST_BACKUP",
  TTL_MINUTES: 15,
  STAGE_FORMAT: "CDP_RENEWAL_FINANCE_RESTORE_STAGE_V1"
};

/*
 * This optional control sheet is intentionally outside the Finance V2 event
 * and projection schemas, so enabling recovery never migrates the ledger.
 */
var FINANCE_STORE_RESTORE_SCHEMA = [
  "requestId", "requestedAt", "requestedBy", "sourceStoreId",
  "backupId", "backupCreatedAt", "backupRevision", "backupStateHash",
  "backupContentHash", "expectedRawFingerprint", "expectedEventDataRows",
  "approver", "reasonCode", "expiresAt", "status", "confirmedAt",
  "confirmedBy", "stagingStoreId", "safetyStoreId", "noOp",
  "resultHash", "resultJson", "schemaVersion"
];

function financeStorePrepareDisasterRestore_(input) {
  input = input || {};
  return storeWithLock_(function () {
    var spreadsheet = storeOpen_();
    var actor = storeActorEmail_();
    financeStoreRequireRestoreAdmin_(spreadsheet, actor);
    financeStoreAssertSchema_(spreadsheet);
    financeStoreEnsureBackupRegistry_(spreadsheet);
    financeStoreEnsureRestoreRequests_(spreadsheet);

    var approver = financeStoreRequireDifferentRestoreAdmin_(
      spreadsheet, actor, input.approver
    );
    var reasonCode = financeStoreReasonCode_(input.reasonCode);
    var backup = financeStoreLoadRegisteredBackup_(
      spreadsheet, String(input.backupId || "").trim(), true
    );
    financeStoreControlEvidenceAfterBackup_(spreadsheet, backup);
    financeStoreAssertNoPostBackupEventRows_(
      spreadsheet, backup.replayed.state.revision, backup.body.events.length
    );
    var inspection = financeStoreInspectLiveLedger_(spreadsheet);
    var noOp = inspection.healthy === true &&
      inspection.revision === backup.replayed.state.revision &&
      inspection.stateHash === backup.replayed.stateHash;
    if (inspection.healthy && !noOp) {
      financeStoreFail_(
        "FINANCE_RESTORE_HEALTHY_LEDGER_DIFFERS",
        "The current finance ledger is healthy and differs from the backup. Disaster recovery cannot be used as a historical rollback."
      );
    }

    var rawFingerprint = financeStoreRawFingerprint_(spreadsheet);
    var now = financeStoreNow_();
    var nowMs = new Date(now).getTime();
    var rows = financeStoreReadRestoreRequests_(spreadsheet);
    rows.forEach(function (row) {
      if (row.status === "AWAITING_APPROVAL" &&
          new Date(row.expiresAt).getTime() <= nowMs) {
        financeStoreUpdateRestoreRequest_(spreadsheet, row, {
          status: "EXPIRED",
          confirmedAt: now,
          confirmedBy: actor
        });
        row.status = "EXPIRED";
      }
    });
    var same = rows.filter(function (row) {
      return row.status === "AWAITING_APPROVAL" &&
        row.sourceStoreId === spreadsheet.getId() &&
        row.backupId === backup.row.backupId &&
        row.backupContentHash === backup.contentHash &&
        row.expectedRawFingerprint === rawFingerprint &&
        row.requestedBy === actor &&
        row.approver === approver &&
        row.reasonCode === reasonCode;
    });
    if (same.length === 1) {
      var prior = financeStorePublicRestoreRequest_(same[0], actor);
      prior.idempotentReplay = true;
      return prior;
    }
    if (same.length > 1 || rows.some(function (row) {
      return ["AWAITING_APPROVAL", "COMMITTING"].indexOf(row.status) >= 0 &&
        row.sourceStoreId === spreadsheet.getId();
    })) {
      financeStoreFail_(
        "FINANCE_RESTORE_REQUEST_ALREADY_PENDING",
        "A finance disaster-recovery request is already pending for this store."
      );
    }

    var request = {
      requestId: "finance_restore_" + Utilities.getUuid(),
      requestedAt: now,
      requestedBy: actor,
      sourceStoreId: spreadsheet.getId(),
      backupId: backup.row.backupId,
      backupCreatedAt: backup.row.createdAt,
      backupRevision: backup.replayed.state.revision,
      backupStateHash: backup.replayed.stateHash,
      backupContentHash: backup.contentHash,
      expectedRawFingerprint: rawFingerprint,
      expectedEventDataRows: financeStoreEventDataRowCount_(spreadsheet),
      approver: approver,
      reasonCode: reasonCode,
      expiresAt: new Date(
        nowMs + FINANCE_DISASTER_RESTORE.TTL_MINUTES * 60 * 1000
      ).toISOString(),
      status: "AWAITING_APPROVAL",
      confirmedAt: "",
      confirmedBy: "",
      stagingStoreId: "",
      safetyStoreId: spreadsheet.getId(),
      noOp: noOp,
      resultHash: "",
      resultJson: "",
      schemaVersion: FINANCE_STORE.SCHEMA_VERSION
    };
    financeStoreAppendRestoreRequest_(spreadsheet, request);
    SpreadsheetApp.flush();
    return financeStorePublicRestoreRequest_(request, actor);
  });
}

function financeStoreListDisasterRestores_(input) {
  input = input || {};
  var spreadsheet = storeOpen_();
  var actor = storeActorEmail_();
  financeStoreRequireRestoreAdmin_(spreadsheet, actor);
  financeStoreEnsureRestoreRequests_(spreadsheet);
  var includeCompleted = input.includeCompleted === true;
  return financeStoreReadRestoreRequests_(spreadsheet)
    .filter(function (row) {
      return includeCompleted ||
        ["AWAITING_APPROVAL", "COMMITTING", "EXPIRED"].indexOf(row.status) >= 0;
    })
    .sort(function (left, right) {
      return String(right.requestedAt).localeCompare(String(left.requestedAt));
    })
    .slice(0, includeCompleted ? 100 : 50)
    .map(function (row) {
      return financeStorePublicRestoreRequest_(row, actor);
    });
}

function financeStoreConfirmDisasterRestore_(input) {
  input = input || {};
  if (String(input.confirm || "") !== FINANCE_DISASTER_RESTORE.CONFIRM) {
    financeStoreFail_(
      "FINANCE_RESTORE_CONFIRM_REQUIRED",
      "The fixed finance disaster-recovery confirmation text is required."
    );
  }
  var requestId = String(input.requestId || "");
  if (!requestId || String(input.confirmRequestId || "") !== requestId) {
    financeStoreFail_(
      "FINANCE_RESTORE_REQUEST_ID_CONFIRM_MISMATCH",
      "The finance restore request ID must be re-entered exactly."
    );
  }
  return storeWithLock_(function () {
    var active = storeOpen_();
    var actor = storeActorEmail_();
    financeStoreRequireRestoreAdmin_(active, actor);
    financeStoreEnsureRestoreRequests_(active);
    var request = financeStoreFindRestoreRequest_(active, requestId);
    if (!request) {
      financeStoreFail_("FINANCE_RESTORE_REQUEST_NOT_FOUND", "The finance restore request was not found.");
    }
    if (request.status === "COMPLETED") {
      var completedResult =
        financeStoreCompletedRestoreResult_(active, request, actor);
      if (request.noOp !== true &&
          String(request.stagingStoreId || "")) {
        financeStoreClearPublishedDriveAttempt_(
          financeStoreRestoreStageDriveOperation_(active, request),
          request.stagingStoreId
        );
      }
      return completedResult;
    }
    financeStoreAssertRestoreApproval_(request, actor);
    if (request.sourceStoreId !== active.getId()) {
      financeStoreFail_(
        "FINANCE_RESTORE_SOURCE_CHANGED",
        "The active store is not the source generation recorded by this request."
      );
    }
    if (request.status === "AWAITING_APPROVAL" &&
        new Date(request.expiresAt).getTime() <= Date.now()) {
      financeStoreUpdateRestoreRequest_(active, request, {
        status: "EXPIRED",
        confirmedAt: financeStoreNow_(),
        confirmedBy: actor
      });
      financeStoreFail_("FINANCE_RESTORE_REQUEST_EXPIRED", "The 15-minute approval window has expired.");
    }

    var backup = financeStoreLoadRegisteredBackup_(active, request.backupId, true);
    financeStoreAssertRestoreRequestBackup_(request, backup);
    var controlEvidence = financeStoreControlEvidenceAfterBackup_(active, backup);
    var currentFingerprint = financeStoreRawFingerprint_(active);
    if (currentFingerprint !== request.expectedRawFingerprint ||
        financeStoreEventDataRowCount_(active) !== request.expectedEventDataRows) {
      financeStoreFail_(
        "FINANCE_RESTORE_SOURCE_CHANGED",
        "The finance store changed after the restore request was prepared."
      );
    }
    financeStoreAssertNoPostBackupEventRows_(
      active, backup.replayed.state.revision, backup.body.events.length
    );
    var inspection = financeStoreInspectLiveLedger_(active);
    var noOp = inspection.healthy === true &&
      inspection.revision === backup.replayed.state.revision &&
      inspection.stateHash === backup.replayed.stateHash;
    if (inspection.healthy && !noOp) {
      financeStoreFail_(
        "FINANCE_RESTORE_HEALTHY_LEDGER_DIFFERS",
        "The current finance ledger is healthy and differs from the backup. No data was changed."
      );
    }
    if (noOp !== request.noOp) {
      financeStoreFail_(
        "FINANCE_RESTORE_PLAN_CHANGED",
        "The current ledger health no longer matches the approved recovery plan."
      );
    }

    if (request.status === "AWAITING_APPROVAL") {
      var committingAt = financeStoreNow_();
      financeStoreUpdateRestoreRequest_(active, request, {
        status: "COMMITTING",
        confirmedAt: committingAt,
        confirmedBy: actor
      });
      request.status = "COMMITTING";
      request.confirmedAt = committingAt;
      request.confirmedBy = actor;
      SpreadsheetApp.flush();
      financeStoreRestoreFaultPoint_("AFTER_COMMITTING");
    }

    if (noOp) {
      var noOpResult = financeStoreBuildRestoreResult_(
        request,
        active.getId(),
        active.getId(),
        true,
        ""
      );
      financeStoreRestoreFaultPoint_("NOOP_BEFORE_COMPLETE");
      financeStoreCompleteRestoreRequest_(
        active, request, actor, noOpResult, active.getId(), active.getId()
      );
      financeStoreRestoreFaultPoint_("NOOP_AFTER_COMPLETE");
      financeStoreEnsureRestoreAudit_(active, request, actor);
      SpreadsheetApp.flush();
      return noOpResult;
    }

    financeStoreRestoreFaultPoint_("BEFORE_COPY");
    var stage = financeStoreGetOrCreateRestoreStage_(active, request);
    var stagingSpreadsheet = stage.spreadsheet;
    financeStoreAssertStageRequest_(stagingSpreadsheet, request);
    financeStoreRestoreStageFinance_(
      stagingSpreadsheet, request, backup, controlEvidence, actor
    );
    financeStoreRestoreFaultPoint_("AFTER_STAGE_FINANCE_WRITE");
    financeStoreValidateRestoredGeneration_(
      stagingSpreadsheet, request, backup, actor
    );
    var baselineBackup = financeStoreEnsurePostRestoreBaselineBackup_(
      stagingSpreadsheet, request, backup, actor
    );
    financeStoreRestoreFaultPoint_("AFTER_BASELINE_BACKUP");
    financeStoreValidateRestoredGeneration_(
      stagingSpreadsheet, request, backup, actor
    );

    var result = financeStoreBuildRestoreResult_(
      request,
      stagingSpreadsheet.getId(),
      active.getId(),
      false,
      baselineBackup.backupId
    );
    var stageRequest = financeStoreFindRestoreRequest_(
      stagingSpreadsheet, request.requestId
    );
    financeStoreCompleteRestoreRequest_(
      stagingSpreadsheet,
      stageRequest,
      actor,
      result,
      stagingSpreadsheet.getId(),
      active.getId()
    );
    financeStoreEnsureRestoreAudit_(stagingSpreadsheet, stageRequest, actor);
    SpreadsheetApp.flush();
    financeStoreValidateRestoredGeneration_(
      stagingSpreadsheet, stageRequest, backup, actor
    );

    financeStoreRestoreFaultPoint_("BEFORE_POINTER_SWITCH");
    var scriptProperties = PropertiesService.getScriptProperties();
    scriptProperties.setProperty(
      RENEWAL_STORE.SPREADSHEET_ID_KEY,
      stagingSpreadsheet.getId()
    );
    if (String(
      scriptProperties.getProperty(RENEWAL_STORE.SPREADSHEET_ID_KEY) || ""
    ) !== stagingSpreadsheet.getId()) {
      financeStoreFail_(
        "FINANCE_RESTORE_POINTER_READBACK_FAILED",
        "The restored store pointer did not match its exact staged generation."
      );
    }
    financeStoreRestoreFaultPoint_("AFTER_POINTER_SWITCH");
    // Keep the copy marker through the exact active-pointer readback. If the
    // process stops after the switch, the COMPLETED replay path above clears
    // the same marker without creating another staging copy.
    financeStoreClearPublishedDriveAttempt_(
      financeStoreRestoreStageDriveOperation_(
        stagingSpreadsheet, stageRequest
      ),
      stagingSpreadsheet.getId()
    );
    return result;
  });
}

function financeStoreRejectDisasterRestore_(input) {
  input = input || {};
  var requestId = String(input.requestId || "");
  if (!requestId || String(input.confirmRequestId || "") !== requestId ||
      String(input.confirm || "") !== "REJECT_FINANCE_DISASTER_RESTORE") {
    financeStoreFail_(
      "FINANCE_RESTORE_REJECT_CONFIRM_REQUIRED",
      "The exact request ID and rejection confirmation are required."
    );
  }
  return storeWithLock_(function () {
    var spreadsheet = storeOpen_();
    var actor = storeActorEmail_();
    financeStoreRequireRestoreAdmin_(spreadsheet, actor);
    financeStoreEnsureRestoreRequests_(spreadsheet);
    var request = financeStoreFindRestoreRequest_(spreadsheet, requestId);
    if (!request) {
      financeStoreFail_("FINANCE_RESTORE_REQUEST_NOT_FOUND", "The finance restore request was not found.");
    }
    if (request.status === "REJECTED") {
      return financeStorePublicRestoreRequest_(request, actor);
    }
    financeStoreAssertRestoreApproval_(request, actor);
    var confirmedAt = financeStoreNow_();
    financeStoreUpdateRestoreRequest_(spreadsheet, request, {
      status: "REJECTED",
      confirmedAt: confirmedAt,
      confirmedBy: actor
    });
    SpreadsheetApp.flush();
    request.status = "REJECTED";
    request.confirmedAt = confirmedAt;
    request.confirmedBy = actor;
    return financeStorePublicRestoreRequest_(request, actor);
  });
}

function financeStoreInspectLiveLedger_(spreadsheet) {
  try {
    financeStoreAssertSchema_(spreadsheet);
    var events = financeStoreReadEvents_(spreadsheet);
    var replayed = financeStoreReplayEvents_(events);
    var checkpoint = financeStoreValidateCheckpointRows_(
      financeStoreReadObjects_(spreadsheet, "finance_state_chunks"),
      replayed.events
    );
    var meta = financeStoreReadMeta_(spreadsheet);
    var approvals = financeStoreReadObjects_(
      spreadsheet, "finance_approval_requests"
    );
    var audit = financeStoreReadObjects_(spreadsheet, "finance_audit");
    financeStoreValidateBackupApprovals_(replayed.events, approvals);
    financeStoreValidateBackupAudit_(replayed.events, audit, approvals);
    if (checkpoint.revision !== replayed.state.revision ||
        checkpoint.stateHash !== replayed.stateHash ||
        String(meta.currentRevision) !== String(replayed.state.revision) ||
        String(meta.currentStateHash || "") !== replayed.stateHash ||
        String(meta.checkpointRevision) !== String(replayed.state.revision) ||
        String(meta.checkpointStateHash || "") !== replayed.stateHash ||
        String(meta.projectionRevision) !== String(replayed.state.revision) ||
        String(meta.projectionStateHash || "") !== replayed.stateHash ||
        String(meta.setupState || "") !== "READY" ||
        !financeStoreProjectionsValid_(spreadsheet, replayed.state)) {
      financeStoreFail_("FINANCE_LIVE_DERIVED_MISMATCH", "Finance derived state does not match the event ledger.");
    }
    return {
      healthy: true,
      revision: replayed.state.revision,
      stateHash: replayed.stateHash,
      state: replayed.state
    };
  } catch (error) {
    return {
      healthy: false,
      code: String(error && error.code || "FINANCE_LIVE_LEDGER_INVALID"),
      message: String(error && error.message || error || "")
    };
  }
}

function financeStoreEventDataRowCount_(spreadsheet) {
  var sheet = spreadsheet.getSheetByName("finance_events");
  return sheet ? Math.max(0, sheet.getLastRow() - 1) : 0;
}

function financeStoreAssertNoPostBackupEventRows_(spreadsheet, revision, backupEventCount) {
  var sheet = spreadsheet.getSheetByName("finance_events");
  if (!sheet) {
    financeStoreFail_("FINANCE_SCHEMA_MISSING", "finance_events is missing.");
  }
  var width = FINANCE_STORE_SCHEMAS.finance_events.length;
  if (typeof sheet.getLastColumn === "function" &&
      sheet.getLastColumn() > width) {
    financeStoreFail_(
      "FINANCE_RESTORE_UNKNOWN_EVENT_COLUMNS",
      "Unknown columns exist in finance_events. No rows will be discarded automatically."
    );
  }
  var count = Math.max(0, sheet.getLastRow() - 1);
  if (count > Number(backupEventCount)) {
    financeStoreFail_(
      "FINANCE_RESTORE_POST_BACKUP_ROWS",
      "Rows exist after the backup event boundary. Disaster recovery stopped to avoid losing transactions."
    );
  }
  if (!count) return;
  var rows = sheet.getRange(2, 1, count, width).getValues();
  rows.forEach(function (values) {
    var nonEmpty = values.some(function (value) {
      return value !== "" && value !== null && value !== undefined;
    });
    if (!nonEmpty) return;
    var storedRevision = Number(values[1]);
    if (Number.isInteger(storedRevision) && storedRevision > Number(revision)) {
      financeStoreFail_(
        "FINANCE_RESTORE_POST_BACKUP_EVENT",
        "A finance event newer than the backup exists. Disaster recovery stopped."
      );
    }
  });
}

function financeStoreRawFingerprint_(spreadsheet) {
  var names = Object.keys(FINANCE_STORE_SCHEMAS).concat(["finance_backups"]);
  var snapshot = names.map(function (name) {
    var sheet = spreadsheet.getSheetByName(name);
    if (!sheet) return { name: name, missing: true };
    var lastRow = Math.max(1, sheet.getLastRow());
    var width = name === "finance_backups" ?
      FINANCE_STORE_BACKUP_SCHEMA.length :
      FINANCE_STORE_SCHEMAS[name].length;
    return {
      name: name,
      lastRow: lastRow,
      lastColumn: typeof sheet.getLastColumn === "function" ?
        Number(sheet.getLastColumn() || 0) : width,
      values: sheet.getRange(1, 1, lastRow, width).getValues()
    };
  });
  return financeHash_(snapshot);
}

function financeStoreControlEvidenceAfterBackup_(spreadsheet, backup) {
  var liveApprovals = financeStoreReadObjects_(
    spreadsheet, "finance_approval_requests"
  ).map(financeStoreStripRowNumber_);
  if (financeStoreStableStringify_(liveApprovals) !==
      financeStoreStableStringify_(backup.body.approvalRequests)) {
    financeStoreFail_(
      "FINANCE_RESTORE_POST_BACKUP_CONTROL_ROWS",
      "Approval rows changed after the backup. Disaster recovery stopped so control evidence is not discarded."
    );
  }
  var liveAudit = financeStoreReadObjects_(
    spreadsheet, "finance_audit"
  ).map(financeStoreStripRowNumber_);
  var prefixLength = backup.body.audit.length;
  if (liveAudit.length !== prefixLength + 1 ||
      financeStoreStableStringify_(liveAudit.slice(0, prefixLength)) !==
        financeStoreStableStringify_(backup.body.audit)) {
    financeStoreFail_(
      "FINANCE_RESTORE_POST_BACKUP_CONTROL_ROWS",
      "Audit rows other than the backup completion marker exist after the backup. They will not be discarded automatically."
    );
  }
  var marker = liveAudit[prefixLength] || {};
  if (String(marker.eventState || "") !== "COMMITTED" ||
      String(marker.action || "") !== "BACKUP_CREATE" ||
      String(marker.actor || "").toLowerCase() !== backup.row.createdBy ||
      String(marker.reasonCode || "") !== String(backup.row.noteCode || "") ||
      Number(marker.fromRevision) !== backup.row.revision ||
      Number(marker.toRevision) !== backup.row.revision ||
      String(marker.beforeHash || "") !== backup.row.stateHash ||
      String(marker.afterHash || "") !== backup.row.stateHash ||
      String(marker.correlationId || "") !== backup.row.backupId ||
      String(marker.snapshotId || "") ||
      String(marker.approvalRequestId || "") ||
      Number(marker.schemaVersion) !== FINANCE_STORE.SCHEMA_VERSION) {
    financeStoreFail_(
      "FINANCE_RESTORE_BACKUP_COMPLETION_AUDIT_INVALID",
      "The finance backup completion audit marker is missing or invalid."
    );
  }
  financeStoreValidateBackupAudit_(
    backup.replayed.events,
    backup.body.audit.concat([marker]),
    backup.body.approvalRequests
  );
  return { auditSuffix: [marker] };
}

function financeStoreRequireRestoreAdmin_(spreadsheet, actor) {
  var role = storeRequirePermission_(spreadsheet, actor, "restore");
  if (String(role || "") !== "admin") {
    financeStoreFail_("FINANCE_RESTORE_ADMIN_REQUIRED", "Only an active administrator can use finance disaster recovery.");
  }
  return role;
}

function financeStoreRequireDifferentRestoreAdmin_(spreadsheet, actor, value) {
  if (typeof storeRequireAdminApprover_ !== "function") {
    financeStoreFail_("FINANCE_RESTORE_ADMIN_DIRECTORY_UNAVAILABLE", "The administrator directory cannot be verified.");
  }
  var approver = storeRequireAdminApprover_(spreadsheet, value);
  if (approver === actor) {
    financeStoreFail_("FINANCE_RESTORE_SELF_APPROVAL_FORBIDDEN", "The requester cannot approve their own disaster recovery.");
  }
  return approver;
}

function financeStoreAssertRestoreApproval_(request, actor) {
  if (["AWAITING_APPROVAL", "COMMITTING"].indexOf(request.status) < 0) {
    financeStoreFail_("FINANCE_RESTORE_REQUEST_NOT_PENDING", "The finance restore request is no longer awaiting approval.");
  }
  if (request.requestedBy === actor) {
    financeStoreFail_("FINANCE_RESTORE_SELF_APPROVAL_FORBIDDEN", "The requester cannot approve their own disaster recovery.");
  }
  if (request.approver !== actor) {
    financeStoreFail_("FINANCE_RESTORE_WRONG_APPROVER", "Only the administrator named in the request can approve it.");
  }
  if (request.status === "COMMITTING" &&
      request.confirmedBy !== actor) {
    financeStoreFail_(
      "FINANCE_RESTORE_COMMITTING_IDENTITY_MISMATCH",
      "Only the administrator who started this approved recovery may resume it."
    );
  }
}

function financeStoreEnsureRestoreRequests_(spreadsheet) {
  var name = "finance_restore_requests";
  var sheet = spreadsheet.getSheetByName(name);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(name);
    sheet.getRange(1, 1, 1, FINANCE_STORE_RESTORE_SCHEMA.length)
      .setValues([FINANCE_STORE_RESTORE_SCHEMA]);
    sheet.setFrozenRows(1);
    return sheet;
  }
  var actual = sheet.getRange(
    1, 1, 1, FINANCE_STORE_RESTORE_SCHEMA.length
  ).getDisplayValues()[0];
  if (financeStoreStableStringify_(actual) !==
      financeStoreStableStringify_(FINANCE_STORE_RESTORE_SCHEMA)) {
    financeStoreFail_(
      "FINANCE_RESTORE_REQUEST_SCHEMA_INVALID",
      "The optional finance restore request sheet schema is invalid."
    );
  }
  return sheet;
}

function financeStoreReadRestoreRequests_(spreadsheet) {
  var sheet = financeStoreEnsureRestoreRequests_(spreadsheet);
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(
    2, 1, sheet.getLastRow() - 1, FINANCE_STORE_RESTORE_SCHEMA.length
  ).getValues().map(function (values, index) {
    var row = { _rowNumber: index + 2 };
    FINANCE_STORE_RESTORE_SCHEMA.forEach(function (header, column) {
      row[header] = values[column];
    });
    row.requestId = String(row.requestId || "");
    row.requestedAt = String(row.requestedAt || "");
    row.requestedBy = String(row.requestedBy || "").toLowerCase();
    row.sourceStoreId = String(row.sourceStoreId || "");
    row.backupId = String(row.backupId || "");
    row.backupCreatedAt = String(row.backupCreatedAt || "");
    row.backupRevision = Number(row.backupRevision);
    row.backupStateHash = String(row.backupStateHash || "");
    row.backupContentHash = String(row.backupContentHash || "");
    row.expectedRawFingerprint = String(row.expectedRawFingerprint || "");
    row.expectedEventDataRows = Number(row.expectedEventDataRows);
    row.approver = String(row.approver || "").toLowerCase();
    row.reasonCode = String(row.reasonCode || "");
    row.expiresAt = String(row.expiresAt || "");
    row.status = String(row.status || "");
    row.confirmedAt = String(row.confirmedAt || "");
    row.confirmedBy = String(row.confirmedBy || "").toLowerCase();
    row.stagingStoreId = String(row.stagingStoreId || "");
    row.safetyStoreId = String(row.safetyStoreId || "");
    row.noOp = row.noOp === true || row.noOp === "TRUE";
    row.resultHash = String(row.resultHash || "");
    row.resultJson = String(row.resultJson || "");
    row.schemaVersion = Number(row.schemaVersion);
    financeStoreValidateRestoreRequestRow_(row);
    return row;
  });
}

function financeStoreValidateRestoreRequestRow_(row) {
  var completedResult = null;
  if (row.resultJson) {
    try { completedResult = JSON.parse(row.resultJson); }
    catch (error) {
      financeStoreFail_("FINANCE_RESTORE_COMPLETION_INVALID", "A completed finance restore result is invalid JSON.");
    }
  }
  if (!/^finance_restore_[A-Za-z0-9_-]+$/.test(row.requestId) ||
      !isFinite(new Date(row.requestedAt).getTime()) ||
      !row.requestedBy || !row.sourceStoreId || !row.backupId ||
      !isFinite(new Date(row.backupCreatedAt).getTime()) ||
      !Number.isInteger(row.backupRevision) || row.backupRevision < 0 ||
      !/^[0-9a-f]{64}$/.test(row.backupStateHash) ||
      !/^[0-9a-f]{64}$/.test(row.backupContentHash) ||
      !/^[0-9a-f]{64}$/.test(row.expectedRawFingerprint) ||
      !Number.isInteger(row.expectedEventDataRows) ||
      row.expectedEventDataRows < 0 ||
      !row.approver || row.approver === row.requestedBy ||
      !/^[A-Z0-9][A-Z0-9_-]{1,63}$/.test(row.reasonCode) ||
      !isFinite(new Date(row.expiresAt).getTime()) ||
      new Date(row.expiresAt).getTime() <= new Date(row.requestedAt).getTime() ||
      ["AWAITING_APPROVAL", "COMMITTING", "COMPLETED", "REJECTED", "EXPIRED"]
        .indexOf(row.status) < 0 ||
      Number(row.schemaVersion) !== FINANCE_STORE.SCHEMA_VERSION) {
    financeStoreFail_("FINANCE_RESTORE_REQUEST_INVALID", "A finance restore request row is invalid.");
  }
  if (row.status === "COMPLETED") {
    if (!row.confirmedAt || !row.confirmedBy || !row.stagingStoreId ||
        !row.safetyStoreId ||
        !/^[0-9a-f]{64}$/.test(row.resultHash) || !completedResult ||
        financeHash_(completedResult) !== row.resultHash) {
      financeStoreFail_("FINANCE_RESTORE_COMPLETION_INVALID", "A completed finance restore request is invalid.");
    }
  } else if (row.resultHash || row.resultJson || row.stagingStoreId) {
    financeStoreFail_("FINANCE_RESTORE_REQUEST_INVALID", "An incomplete finance restore request contains completion data.");
  }
  if (row.status === "COMMITTING" &&
      (!row.confirmedAt || row.confirmedBy !== row.approver)) {
    financeStoreFail_(
      "FINANCE_RESTORE_REQUEST_INVALID",
      "A COMMITTING restore request must identify the designated approving administrator."
    );
  }
}

function financeStoreRestoreRequestValues_(object) {
  return FINANCE_STORE_RESTORE_SCHEMA.map(function (header) {
    return financeStoreCell_(
      object[header] === undefined ? "" : object[header]
    );
  });
}

function financeStoreAppendRestoreRequest_(spreadsheet, request) {
  var sheet = financeStoreEnsureRestoreRequests_(spreadsheet);
  var row = Math.max(2, sheet.getLastRow() + 1);
  financeStoreEnsureSheetCapacity_(sheet, row);
  sheet.getRange(row, 1, 1, FINANCE_STORE_RESTORE_SCHEMA.length)
    .setValues([financeStoreRestoreRequestValues_(request)]);
}

function financeStoreUpdateRestoreRequest_(spreadsheet, current, changes) {
  var rows = financeStoreReadRestoreRequests_(spreadsheet);
  var live = rows.filter(function (row) {
    return row.requestId === current.requestId;
  });
  if (live.length !== 1 ||
      (current._rowNumber && live[0]._rowNumber !== current._rowNumber)) {
    financeStoreFail_("FINANCE_RESTORE_REQUEST_CHANGED", "The finance restore request changed concurrently.");
  }
  var next = {};
  FINANCE_STORE_RESTORE_SCHEMA.forEach(function (header) {
    next[header] = live[0][header];
  });
  Object.keys(changes || {}).forEach(function (key) {
    if (FINANCE_STORE_RESTORE_SCHEMA.indexOf(key) >= 0) next[key] = changes[key];
  });
  spreadsheet.getSheetByName("finance_restore_requests")
    .getRange(live[0]._rowNumber, 1, 1, FINANCE_STORE_RESTORE_SCHEMA.length)
    .setValues([financeStoreRestoreRequestValues_(next)]);
  return next;
}

function financeStoreFindRestoreRequest_(spreadsheet, requestId) {
  var matches = financeStoreReadRestoreRequests_(spreadsheet).filter(function (row) {
    return row.requestId === String(requestId || "");
  });
  if (matches.length > 1) {
    financeStoreFail_("FINANCE_RESTORE_REQUEST_DUPLICATE", "The finance restore request ID is duplicated.");
  }
  return matches[0] || null;
}

function financeStorePublicRestoreRequest_(row, actor) {
  return {
    success: true,
    requestId: row.requestId,
    requestedAt: row.requestedAt,
    requestedBy: row.requestedBy,
    backupId: row.backupId,
    backupCreatedAt: row.backupCreatedAt,
    backupRevision: Number(row.backupRevision),
    backupStateHash: row.backupStateHash,
    backupContentHash: row.backupContentHash,
    approver: row.approver,
    reasonCode: row.reasonCode,
    expiresAt: row.expiresAt,
    status: row.status,
    noOp: row.noOp === true,
    canApprove: ["AWAITING_APPROVAL", "COMMITTING"].indexOf(row.status) >= 0 &&
      row.approver === actor && row.requestedBy !== actor,
    confirmedAt: row.confirmedAt || "",
    confirmedBy: row.confirmedBy || ""
  };
}

function financeStoreAssertRestoreRequestBackup_(request, backup) {
  if (request.backupId !== backup.row.backupId ||
      request.backupCreatedAt !== backup.row.createdAt ||
      request.backupRevision !== backup.replayed.state.revision ||
      request.backupStateHash !== backup.replayed.stateHash ||
      request.backupContentHash !== backup.contentHash) {
    financeStoreFail_(
      "FINANCE_RESTORE_BACKUP_CHANGED",
      "The registered backup no longer matches the approved restore request."
    );
  }
}

function financeStoreStageIdentity_(request) {
  return financeStoreStableStringify_({
    format: FINANCE_DISASTER_RESTORE.STAGE_FORMAT,
    requestId: request.requestId,
    sourceStoreId: request.sourceStoreId,
    backupContentHash: request.backupContentHash
  });
}

function financeStoreStageName_(request) {
  return "renewal_finance_restore_stage_" +
    request.requestId + "_" + request.backupContentHash.slice(0, 12);
}

function financeStoreRestoreStageDriveOperation_(spreadsheet, request) {
  var meta = storeReadMetaMap_(spreadsheet);
  var parentId = String(meta.dataFolderId || "");
  if (!parentId) {
    financeStoreFail_(
      "FINANCE_RESTORE_DATA_FOLDER_OPEN_FAILED",
      "The dedicated data folder ID is missing."
    );
  }
  return {
    action: "COPY",
    operationId: request.requestId,
    sourceId: request.sourceStoreId,
    name: financeStoreStageName_(request),
    mimeType: "application/vnd.google-apps.spreadsheet",
    parentId: parentId,
    label: "finance restore staging spreadsheet"
  };
}

function financeStoreGetOrCreateRestoreStage_(source, request) {
  var meta = storeReadMetaMap_(source);
  var folder;
  try { folder = DriveApp.getFolderById(String(meta.dataFolderId || "")); }
  catch (error) {
    financeStoreFail_("FINANCE_RESTORE_DATA_FOLDER_OPEN_FAILED", "The dedicated data folder cannot be opened.");
  }
  var name = financeStoreStageName_(request);
  var identity = financeStoreStageIdentity_(request);
  var files = [];
  var iterator = folder.getFilesByName(name);
  while (iterator.hasNext() && files.length < 3) files.push(iterator.next());
  if (files.length > 1) {
    financeStoreFail_("FINANCE_RESTORE_STAGE_AMBIGUOUS", "Multiple finance restore staging copies exist.");
  }
  var file = files[0] || null;
  var stageDriveOperation =
    financeStoreRestoreStageDriveOperation_(source, request);
  var stageDriveFailureKey =
    financeStoreDriveFailureKey_(stageDriveOperation);
  if (file) {
    if (String(file.getDescription() || "") !== identity) {
      financeStoreFail_(
        "FINANCE_RESTORE_STAGE_IDENTITY_MISMATCH",
        "A staging file with the expected name has a different or missing identity."
      );
    }
    try {
      financeStoreAssertPrivateDriveFileInParent_(
        file,
        folder.getId(),
        name,
        "application/vnd.google-apps.spreadsheet",
        identity,
        "finance restore staging spreadsheet"
      );
    } catch (existingStageSafetyError) {
      financeStorePermanentlyDeleteNewDriveItem_(
        file,
        file.getId(),
        "unsafe prepared finance restore staging spreadsheet",
        existingStageSafetyError,
        stageDriveFailureKey,
        stageDriveOperation
      );
      throw existingStageSafetyError;
    }
  } else {
    try {
      file = financeStoreCopyPrivateSpreadsheetInParent_({
        sourceId: source.getId(),
        name: name,
        parentId: folder.getId(),
        description: identity,
        label: "finance restore staging spreadsheet",
        operationId: request.requestId
      });
    } catch (error) {
      if (error && error.code) throw error;
      financeStoreFail_("FINANCE_RESTORE_STAGE_COPY_FAILED", "The full-store staging copy could not be created.");
    }
    financeStoreRestoreFaultPoint_("AFTER_STAGE_COPY");
  }
  financeStoreAssertPrivateDriveFileInParent_(
    file,
    folder.getId(),
    name,
    "application/vnd.google-apps.spreadsheet",
    identity,
    "finance restore staging spreadsheet"
  );
  var staging;
  try { staging = SpreadsheetApp.openById(file.getId()); }
  catch (error) {
    financeStoreFail_("FINANCE_RESTORE_STAGE_OPEN_FAILED", "The staging spreadsheet cannot be opened.");
  }
  financeStoreUpdateDataStoreSpreadsheetId_(staging, file.getId());
  financeStoreEnsureRestoreRequests_(staging);
  return {
    file: file,
    spreadsheet: staging,
    driveFailureKey: stageDriveFailureKey
  };
}

function financeStoreUpdateDataStoreSpreadsheetId_(spreadsheet, spreadsheetId) {
  var sheet = spreadsheet.getSheetByName("_meta");
  if (!sheet || sheet.getLastRow() < 2) {
    financeStoreFail_("FINANCE_RESTORE_STORE_META_MISSING", "The staging store metadata is missing.");
  }
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
  var matches = [];
  values.forEach(function (row, index) {
    if (String(row[0] || "") === "spreadsheetId") matches.push(index + 2);
  });
  if (matches.length !== 1) {
    financeStoreFail_("FINANCE_RESTORE_STORE_META_INVALID", "The staging spreadsheetId metadata is missing or duplicated.");
  }
  sheet.getRange(matches[0], 2).setValue(spreadsheetId);
  SpreadsheetApp.flush();
  if (String(storeReadMetaMap_(spreadsheet).spreadsheetId || "") !== spreadsheetId) {
    financeStoreFail_("FINANCE_RESTORE_STORE_META_WRITE_FAILED", "The staging spreadsheet identity was not saved.");
  }
}

function financeStoreAssertStageRequest_(staging, request) {
  var staged = financeStoreFindRestoreRequest_(staging, request.requestId);
  if (!staged ||
      staged.sourceStoreId !== request.sourceStoreId ||
      staged.backupId !== request.backupId ||
      staged.backupContentHash !== request.backupContentHash ||
      staged.expectedRawFingerprint !== request.expectedRawFingerprint ||
      staged.approver !== request.approver ||
      staged.requestedBy !== request.requestedBy ||
      staged.reasonCode !== request.reasonCode) {
    financeStoreFail_("FINANCE_RESTORE_STAGE_REQUEST_MISMATCH", "The staging restore request does not match the source request.");
  }
}

function financeStoreRestoreStageFinance_(
  staging, request, backup, controlEvidence, actor
) {
  var baselineAudit = financeStoreReadStageBaselineAudit_(
    staging, request, backup
  );
  financeStoreReplaceRows_(staging, "finance_events", backup.body.events);
  financeStoreReplaceRows_(
    staging, "finance_state_chunks", backup.body.checkpointChunks
  );
  financeStoreReplaceRows_(
    staging,
    "finance_audit",
    backup.body.audit
      .concat((controlEvidence && controlEvidence.auditSuffix) || [])
      .concat(baselineAudit)
  );
  financeStoreReplaceRows_(
    staging, "finance_approval_requests", backup.body.approvalRequests
  );
  var replayed = backup.replayed;
  var lastEvent = replayed.event;
  var checkpoint = financeStoreValidateCheckpointRows_(
    backup.body.checkpointChunks, replayed.events
  );
  var oldMeta = {};
  try { oldMeta = financeStoreReadMeta_(staging); } catch (ignored) {}
  var meta = {
    schemaVersion: FINANCE_STORE.SCHEMA_VERSION,
    financeSchemaVersion: FINANCE_SCHEMA_VERSION,
    setupState: "READY",
    initialPolicyJson: financeStoreStableStringify_(
      replayed.state.companyPolicy || {}
    ),
    initializedAt: String(oldMeta.initializedAt || backup.body.createdAt),
    initializedBy: String(oldMeta.initializedBy || backup.body.createdBy),
    currentRevision: replayed.state.revision,
    currentStateHash: replayed.stateHash,
    checkpointId: checkpoint.checkpointId,
    checkpointRevision: replayed.state.revision,
    checkpointStateHash: replayed.stateHash,
    projectionRevision: replayed.state.revision,
    projectionStateHash: replayed.stateHash,
    lastCommittedAt: lastEvent.committedAt,
    lastCommittedBy: lastEvent.actor,
    fullReplayVerifiedAt: financeStoreNow_(),
    fullReplayVerifiedRevision: replayed.state.revision,
    fullReplayVerifiedStateHash: replayed.stateHash,
    disasterRestoredAt: financeStoreNow_(),
    disasterRestoredBy: actor,
    disasterRestoreRequestId: request.requestId,
    disasterRestoreBackupId: request.backupId,
    disasterRestoreBackupContentHash: request.backupContentHash
  };
  var metaRows = Object.keys(meta).sort().map(function (key) {
    return { key: key, value: meta[key] };
  });
  financeStoreReplaceRows_(staging, "finance_meta", metaRows);
  financeStoreRebuildProjections_(staging, replayed.state);
  SpreadsheetApp.flush();
}

function financeStoreReadStageBaselineAudit_(staging, request, backup) {
  var backupId = "finance_backup_post_" + request.requestId;
  var rows = financeStoreReadObjects_(
    staging, "finance_audit"
  ).filter(function (row) {
    return String(row.correlationId || "") === backupId;
  }).map(financeStoreStripRowNumber_);
  if (!rows.length) return [];
  var prepared = 0;
  var committed = 0;
  rows.forEach(function (row) {
    var state = String(row.eventState || "");
    if (state === "PREPARED") prepared += 1;
    if (state === "COMMITTED") committed += 1;
    if (["PREPARED", "COMMITTED"].indexOf(state) < 0 ||
        String(row.auditId || "") === "" ||
        !isFinite(new Date(String(row.timestamp || "")).getTime()) ||
        String(row.action || "") !== "BACKUP_CREATE" ||
        String(row.actor || "").toLowerCase() !== request.approver ||
        String(row.reasonCode || "") !==
          "POST_DISASTER_RESTORE_BASELINE" ||
        String(row.approver || "") ||
        Number(row.fromRevision) !== backup.replayed.state.revision ||
        Number(row.toRevision) !== backup.replayed.state.revision ||
        String(row.beforeHash || "") !== backup.replayed.stateHash ||
        String(row.afterHash || "") !== backup.replayed.stateHash ||
        String(row.snapshotId || "") ||
        String(row.approvalRequestId || "") ||
        Number(row.schemaVersion) !== FINANCE_STORE.SCHEMA_VERSION) {
      financeStoreFail_(
        "FINANCE_RESTORE_BASELINE_AUDIT_INVALID",
        "The staged post-restore baseline audit is invalid."
      );
    }
  });
  if (prepared !== 1 || committed > 1 ||
      (committed === 1 &&
       rows.findIndex(function (row) {
         return row.eventState === "COMMITTED";
       }) < rows.findIndex(function (row) {
         return row.eventState === "PREPARED";
       }))) {
    financeStoreFail_(
      "FINANCE_RESTORE_BASELINE_AUDIT_INVALID",
      "The staged post-restore baseline audit is incomplete or duplicated."
    );
  }
  return rows;
}

function financeStoreValidateRestoredGeneration_(staging, request, backup, actor) {
  if (staging.getId() === request.sourceStoreId) {
    financeStoreFail_("FINANCE_RESTORE_STAGE_IS_SOURCE", "The source store cannot be used as a staging generation.");
  }
  storeAssertResourcePrivate_(
    DriveApp.getFileById(staging.getId()),
    "finance restore staging spreadsheet"
  );
  storeValidateSchema_(staging);
  var meta = storeReadMetaMap_(staging);
  if (String(meta.spreadsheetId || "") !== staging.getId()) {
    financeStoreFail_("FINANCE_RESTORE_STORE_META_INVALID", "The staging store identity does not match its file ID.");
  }
  var inspection = financeStoreInspectLiveLedger_(staging);
  if (!inspection.healthy ||
      inspection.revision !== backup.replayed.state.revision ||
      inspection.stateHash !== backup.replayed.stateHash) {
    financeStoreFail_("FINANCE_RESTORE_STAGE_VALIDATION_FAILED", "The restored staging ledger did not pass full replay and projection validation.");
  }
  financeStoreAssertRestoredCustomers_(staging, inspection.state);
  financeStoreAssertRestoredArtifacts_(inspection.state);
  financeStoreAssertRestoreAdminStillActive_(
    staging, request.requestedBy, request.approver, actor
  );
  return inspection;
}

function financeStoreAssertRestoredCustomers_(spreadsheet, state) {
  if (typeof storeReadRecords_ !== "function") return;
  var records = storeReadRecords_(spreadsheet);
  var active = {};
  records.forEach(function (row) {
    if (!row.deleted) active[String(row.recordId || "")] = true;
  });
  var customers = {};
  ["invoices", "payments", "credit_notes"].forEach(function (name) {
    (state[name] || []).forEach(function (row) {
      var customerId = String(row.customerId || "");
      if (customerId) customers[customerId] = true;
    });
  });
  Object.keys(customers).forEach(function (customerId) {
    if (!active[customerId]) {
      financeStoreFail_(
        "FINANCE_RESTORE_CUSTOMER_MISSING",
        "A finance customer does not exist as an active canonical record: " + customerId
      );
    }
  });
}

function financeStoreAssertRestoredArtifacts_(state) {
  if (typeof artifactReadAllRegistryRows_ !== "function" ||
      typeof artifactLoadSettings_ !== "function") return;
  var settings = artifactLoadSettings_();
  var rows = artifactReadAllRegistryRows_(settings.allowedOutputEmails);
  var invoices = {};
  (state.invoices || []).forEach(function (invoice) {
    invoices[String(invoice.id || "")] = invoice;
  });
  rows.forEach(function (row) {
    if (["created", "prepared"].indexOf(String(row.status || "")) < 0 ||
        String(row.kind || "") !== "billing") return;
    var metadata;
    try { metadata = JSON.parse(String(row.metadataJson || "")); }
    catch (error) {
      financeStoreFail_("FINANCE_RESTORE_ARTIFACT_METADATA_INVALID", "A created billing artifact has invalid metadata.");
    }
    var formal = metadata && metadata.financeInvoice;
    var invoiceId = String(formal && formal.financeInvoiceId || "");
    var immutableKey = String(formal && formal.immutableKey || "");
    var invoice = invoices[invoiceId];
    if (!invoiceId || !immutableKey || !invoice ||
        String(invoice.immutableKey || "") !== immutableKey ||
        String(invoice.customerId || "") !== String(row.recordId || "")) {
      financeStoreFail_(
        "FINANCE_RESTORE_ARTIFACT_INCOMPATIBLE",
        "A created billing artifact is incompatible with the backup invoice identity."
      );
    }
  });
}

function financeStoreAssertRestoreAdminStillActive_(
  spreadsheet, requester, approver, actor
) {
  if (typeof storeReadRoles_ !== "function") return;
  var roles = storeReadRoles_(spreadsheet);
  [requester, approver, actor].forEach(function (email) {
    var matches = roles.filter(function (row) {
      return row.email === email && row.active && row.role === "admin";
    });
    if (matches.length !== 1) {
      financeStoreFail_(
        "FINANCE_RESTORE_ADMIN_CHANGED",
        "Both named administrators must remain active administrators in the staged generation."
      );
    }
  });
}

function financeStoreEnsurePostRestoreBaselineBackup_(
  spreadsheet, request, restoredBackup, actor
) {
  var backupId = "finance_backup_post_" + request.requestId;
  var created = financeStoreCreateRegisteredBackupUnlocked_(
    spreadsheet,
    actor,
    {
      backupId: backupId,
      noteCode: "POST_DISASTER_RESTORE_BASELINE"
    }
  );
  var verified = financeStoreLoadRegisteredBackup_(
    spreadsheet, backupId, true
  );
  if (verified.replayed.state.revision !==
        restoredBackup.replayed.state.revision ||
      verified.replayed.stateHash !==
        restoredBackup.replayed.stateHash) {
    financeStoreFail_(
      "FINANCE_RESTORE_BASELINE_STATE_MISMATCH",
      "The post-restore baseline backup state does not match the restored ledger."
    );
  }
  return {
    backupId: backupId,
    contentHash: verified.contentHash,
    fileId: verified.row.driveFileId,
    idempotentReplay: created.idempotentReplay === true
  };
}

function financeStoreBuildRestoreResult_(
  request, activeStoreId, safetyStoreId, noOp, safetyFinanceBackupId
) {
  return {
    success: true,
    restored: true,
    noOp: noOp === true,
    requestId: request.requestId,
    backupId: request.backupId,
    backupRevision: Number(request.backupRevision),
    backupStateHash: request.backupStateHash,
    backupContentHash: request.backupContentHash,
    sourceStoreId: request.sourceStoreId,
    activeStoreId: activeStoreId,
    safetyStoreId: safetyStoreId,
    safetyFinanceBackupId: String(safetyFinanceBackupId || ""),
    requestedBy: request.requestedBy,
    approvedBy: request.approver
  };
}

function financeStoreCompleteRestoreRequest_(
  spreadsheet, request, actor, result, stagingStoreId, safetyStoreId
) {
  var resultJson = financeStoreStableStringify_(result);
  financeStoreUpdateRestoreRequest_(spreadsheet, request, {
    status: "COMPLETED",
    confirmedAt: financeStoreNow_(),
    confirmedBy: actor,
    stagingStoreId: stagingStoreId,
    safetyStoreId: safetyStoreId,
    noOp: result.noOp === true,
    resultHash: financeHash_(result),
    resultJson: resultJson
  });
}

function financeStoreEnsureRestoreAudit_(spreadsheet, request, actor) {
  var existing = storeReadObjects_(spreadsheet, "audit").filter(function (row) {
    return String(row.correlationId || "") === request.requestId &&
      String(row.action || "") === "FINANCE_DISASTER_RESTORE_SWITCH";
  });
  if (existing.length > 1) {
    financeStoreFail_("FINANCE_RESTORE_AUDIT_DUPLICATE", "The finance restore generation-switch audit is duplicated.");
  }
  if (!existing.length) {
    storeAppendAudit_(spreadsheet, {
      eventState: "COMMITTED",
      entityType: "finance_restore",
      entityKey: request.requestId,
      action: "FINANCE_DISASTER_RESTORE_SWITCH",
      actor: request.requestedBy,
      reasonCode: request.reasonCode,
      approver: actor,
      beforeHash: request.expectedRawFingerprint,
      afterHash: request.backupStateHash,
      versionBefore: Number(request.expectedEventDataRows),
      versionAfter: Number(request.backupRevision),
      correlationId: request.requestId
    });
  }
}

function financeStoreCompletedRestoreResult_(spreadsheet, request, actor) {
  if (request.status !== "COMPLETED") {
    financeStoreFail_("FINANCE_RESTORE_REQUEST_NOT_COMPLETED", "The finance restore request is not complete.");
  }
  var result;
  try { result = JSON.parse(request.resultJson); }
  catch (error) {
    financeStoreFail_("FINANCE_RESTORE_COMPLETION_INVALID", "The completed finance restore result cannot be read.");
  }
  if (financeHash_(result) !== request.resultHash ||
      result.requestId !== request.requestId ||
      result.activeStoreId !== spreadsheet.getId()) {
    financeStoreFail_("FINANCE_RESTORE_COMPLETION_INVALID", "The completed finance restore result does not match the active store.");
  }
  financeStoreRequireRestoreAdmin_(spreadsheet, actor);
  financeStoreEnsureRestoreAudit_(
    spreadsheet,
    request,
    request.confirmedBy || actor
  );
  SpreadsheetApp.flush();
  result.idempotentReplay = true;
  return result;
}

function financeStoreRestoreFaultPoint_(point) {
  financeStoreFaultPoint_(point);
}
