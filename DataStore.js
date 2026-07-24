// @ts-nocheck
// 更新講習システムの共有正本。既存の参照資料・原本には一切書き込まず、
// 明示セットアップで新規作成した専用 Spreadsheet だけを操作する。

var RENEWAL_STORE = {
  IDENTITY: "CDP_RENEWAL_DATA_STORE_V1",
  SCHEMA_VERSION: 1,
  BACKUP_FORMAT: "CDP_RENEWAL_DATA_STORE_BACKUP_V1",
  BACKUP_FORMAT_VERSION: 1,
  SPREADSHEET_ID_KEY: "CDP_RENEWAL_DATA_STORE_SPREADSHEET_ID_V1",
  DATA_FOLDER_ID_KEY: "CDP_RENEWAL_DATA_STORE_FOLDER_ID_V1",
  BACKUP_FOLDER_ID_KEY: "CDP_RENEWAL_DATA_STORE_BACKUP_FOLDER_ID_V1",
  DRIVE_FAILURE_PREFIX: "CDP_RENEWAL_DATA_STORE_DRIVE_FAILURE_V1_",
  PENDING_AUDIT_RECOVERY_KEY:
    "CDP_RENEWAL_PENDING_AUDIT_RECOVERY_V1",
  SETUP_CONFIRM: "CREATE_DEDICATED_RENEWAL_DATA_STORE",
  SETUP_MODE_WORKSPACE: "WORKSPACE_MULTIUSER",
  SETUP_MODE_PERSONAL: "PERSONAL_SINGLE_USER",
  PERSONAL_SETUP_CONFIRM:
    "CREATE_PERSONAL_SINGLE_USER_STORE_WITHOUT_WORKSPACE_TRANSFER",
  BOOTSTRAP_OWNERSHIP_FOLDER_ID:
    "1XmQirjBrQR-uC_GuBVXAyRK5zfqtoQwN",
  BOOTSTRAP_OWNERSHIP_FOLDER_NAME: "2026年度",
  RESTORE_CONFIRM: "RESTORE_REGISTERED_RENEWAL_BACKUP",
  LOCAL_MIGRATION_CONFIRM: "UPSERT_LOCAL_STORAGE_RECORD",
  LOCAL_BATCH_CONFIRM: "COMMIT_LOCAL_STORAGE_MIGRATION_BATCH",
  BROWSER_STORAGE_KEYSET_VERSION: "CDP_RENEWAL_BROWSER_PII_V2",
  BROWSER_STORAGE_KEYSET_COUNT: 4,
  SOURCE_IMPORT_CONFIRM: "COMMIT_SOURCE_IMPORT_BATCH",
  BACKUP_PRUNE_CONFIRM: "PRUNE_REGISTERED_BACKUPS",
  LOCK_TIMEOUT_MS: 30000,
  RESTORE_TOKEN_MINUTES: 15,
  IMPORT_TOKEN_MINUTES: 15,
  BACKUP_RETENTION_MONTHS: 36,
  MAX_PAYLOAD_CHARS: 45000,
  MAX_SHEET_ROWS: 200000,
  ACTIVE_DATA_GENERATION_META_KEY: "activeDataGeneration",
  BASE_DATA_GENERATION: "base",
  GENERATION_REGISTRY_SHEET: "_data_generations",
  DATA_GENERATION_WARNING_COUNT: 16,
  DATA_GENERATION_HARD_LIMIT: 24,
  SPREADSHEET_CELL_WARNING_LIMIT: 7000000,
  SPREADSHEET_CELL_HARD_LIMIT: 8000000,
  NEW_SHEET_DEFAULT_ROWS: 1000,
  NEW_SHEET_DEFAULT_COLUMNS: 26,
  SYSTEM_BACKUP_RUN_SHEET: "_system_backup_runs",
  SYSTEM_BACKUP_RUN_HEADERS: [
    "runId", "idempotencyKeyHash", "kind", "createdAt", "createdBy",
    "storeFingerprint", "financeConfigured", "financeRevision",
    "financeStateHash", "storeBackupId", "financeBackupId", "status",
    "updatedAt", "noteCode", "errorCode"
  ],
  GENERATION_REGISTRY_HEADERS: [
    "generationId", "recordsSheet", "rolesSheet", "recordCount", "roleCount",
    "recordsHash", "rolesHash", "dataHash", "correlationId",
    "createdAt", "createdBy", "status"
  ],
  DATA_FOLDER_NAME: "更新講習システム_共有正本",
  BACKUP_FOLDER_NAME: "バックアップ_管理者専用",
  FILE_NAME_PREFIX: "更新講習_共有正本",
  PROTECTED_SOURCE_IDS: [
    "14bzaYZ_9dz4BMHNVDx7AfpKFN-3pStoWjKdKOMVeiv0",
    "1b2gjUL0I2vfK-XOvbDhg8oXg36EdADajamivX7wfgC4",
    "1lAO89hPt2FRu-EoqfkS_xCFKVkfrglz5o-ms-qD92yE"
  ],
  ROLES: ["admin", "renewal", "accounting", "viewer"],
  PERMISSIONS: {
    admin: ["read", "record.write", "accounting.write", "role.write", "backup.create", "restore", "migrate", "records.import", "audit.read"],
    renewal: ["read", "record.write"],
    accounting: ["read", "accounting.write"],
    viewer: ["read"]
  },
  ACCOUNTING_FIELDS: [
    "billingRecipientName", "billingHonorific", "billingAddress", "serviceCategory",
    "feeExTax", "discountExTax", "taxRate", "taxRounding",
    "taxExceptionApprovalDate", "taxExceptionApprovedBy", "taxExceptionReason",
    "quoteNo", "quoteDate", "quoteExpiry",
    "invoiceNo", "invoiceStatus", "accountingDate", "invoiceDate", "paymentDueDate",
    "paidAmount", "paymentDate", "paymentMethod",
    "financeInvoiceId", "financeInvoiceImmutableKey"
  ],
  FORMAL_FINANCE_MIRROR_FIELDS: [
    "feeExTax", "discountExTax", "taxRate", "taxRounding",
    "taxExceptionApprovalDate", "taxExceptionApprovedBy", "taxExceptionReason",
    "invoiceNo", "invoiceStatus", "accountingDate", "invoiceDate",
    "paymentDueDate", "paidAmount", "paymentDate", "paymentMethod",
    "financeInvoiceId", "financeInvoiceImmutableKey"
  ],
  ACCOUNTING_DEFAULTS: {
    billingRecipientName: "",
    billingHonorific: "御中",
    billingAddress: "",
    serviceCategory: "更新講習",
    feeExTax: "0",
    discountExTax: "0",
    taxRate: "10",
    taxRounding: "切捨て",
    taxExceptionApprovalDate: "",
    taxExceptionApprovedBy: "",
    taxExceptionReason: "",
    quoteNo: "",
    quoteDate: "",
    quoteExpiry: "",
    invoiceNo: "",
    invoiceStatus: "未発行",
    accountingDate: "",
    invoiceDate: "",
    paymentDueDate: "",
    paidAmount: "0",
    paymentDate: "",
    paymentMethod: "",
    financeInvoiceId: "",
    financeInvoiceImmutableKey: ""
  }
};

var RENEWAL_STORE_SCHEMAS = {
  _meta: ["key", "value"],
  records: [
    "recordId", "managementId", "invoiceNo", "version", "deleted",
    "createdAt", "updatedAt", "createdBy", "updatedBy", "payloadJson", "payloadHash"
  ],
  roles: ["email", "role", "active", "version", "createdAt", "updatedAt", "updatedBy"],
  audit: [
    "auditId", "timestamp", "eventState", "entityType", "entityKeyHash", "action",
    "actor", "reasonCode", "approver", "beforeHash", "afterHash",
    "versionBefore", "versionAfter", "correlationId", "schemaVersion"
  ],
  backups: [
    "backupId", "createdAt", "createdBy", "kind", "recordCount", "activeCount",
    "roleCount", "contentHash", "driveFileId", "status", "noteCode", "schemaVersion"
  ],
  import_batches: [
    "batchId", "createdAt", "requestedBy", "operation", "sourceHash", "baseStoreHash",
    "tokenHash", "expiresAt", "status", "totalCount", "insertCount", "updateCount",
    "softDeleteCount", "skipCount", "errorCount", "backupId", "completedAt",
    "summaryHash", "reasonCode", "approver"
  ]
};

/**
 * 共有正本を一度だけ新規作成する。
 * input.confirm と deploymentMode の完全一致が必要。既存ファイルIDは受け取らない。
 * 個人アカウントの単独運用は、将来Workspaceへ自動移管しないことの追加確認も必須。
 */
function storeSetup_(input) {
  input = input || {};
  if (String(input.confirm || "") !== RENEWAL_STORE.SETUP_CONFIRM) {
    storeFail_("STORE_SETUP_CONFIRM_REQUIRED", "専用共有正本の作成確認がありません。");
  }
  return storeWithLock_(function () {
    var properties = PropertiesService.getScriptProperties();
    var existingId = String(properties.getProperty(RENEWAL_STORE.SPREADSHEET_ID_KEY) || "");
    if (existingId) {
      var existing = storeOpen_();
      var existingActor = storeActorEmail_();
      storeRequirePermission_(existing, existingActor, "read");
      return storeState_(existing);
    }
    storeAssertNoUnresolvedDriveSetupOutcome_();

    // Initial bootstrap is deliberately stricter than ordinary requests.  A
    // deploy-as-owner web app must never promote the deployer when the caller
    // identity is hidden by Google Workspace / consumer-account policy.
    var actor = storeBootstrapActorEmail_();
    var deploymentMode = storeAssertSetupDeploymentMode_(actor, input);
    storeAssertBootstrapOwnershipAnchor_(actor);
    var now = storeNowIso_();
    var suffix = now.slice(0, 10).replace(/-/g, "") + "_" + now.slice(11, 19).replace(/:/g, "");
    var rootFolder;
    var setupDriveFailureKeys = [];
    try {
      rootFolder = DriveApp.getRootFolder();
    } catch (rootFolderError) {
      storeFail_("STORE_ROOT_FOLDER_OPEN_FAILED", "The owner Drive root folder cannot be opened.");
    }
    var setupIdentityBase = "CDP_RENEWAL_DATA_STORE_SETUP_RESOURCE_V1|" + suffix;
    var dataFolderCreateOptions = {
      name: RENEWAL_STORE.DATA_FOLDER_NAME + "_" + suffix,
      mimeType: "application/vnd.google-apps.folder",
      parentId: rootFolder.getId(),
      description: setupIdentityBase + "|DATA_FOLDER",
      label: "data folder",
      scope: "SETUP"
    };
    setupDriveFailureKeys.push(
      storeDriveFailureKey_(storeDriveCreateOperation_(dataFolderCreateOptions))
    );
    var dataFolder = storeCreatePrivateDriveItemInParent_(
      dataFolderCreateOptions
    );
    var backupFolder = null;
    var spreadsheetFile = null;
    var spreadsheet = null;
    var spreadsheetId = "";
    try {
      var backupFolderCreateOptions = {
        name: RENEWAL_STORE.BACKUP_FOLDER_NAME,
        mimeType: "application/vnd.google-apps.folder",
        parentId: dataFolder.getId(),
        description: setupIdentityBase + "|BACKUP_FOLDER",
        label: "backup folder",
        scope: "SETUP"
      };
      setupDriveFailureKeys.push(
        storeDriveFailureKey_(
          storeDriveCreateOperation_(backupFolderCreateOptions)
        )
      );
      backupFolder = storeCreatePrivateDriveItemInParent_(
        backupFolderCreateOptions
      );
      var spreadsheetCreateOptions = {
        name: RENEWAL_STORE.FILE_NAME_PREFIX + "_" + suffix,
        mimeType: "application/vnd.google-apps.spreadsheet",
        parentId: dataFolder.getId(),
        description: setupIdentityBase + "|SPREADSHEET",
        label: "data spreadsheet",
        scope: "SETUP"
      };
      setupDriveFailureKeys.push(
        storeDriveFailureKey_(
          storeDriveCreateOperation_(spreadsheetCreateOptions)
        )
      );
      spreadsheetFile = storeCreatePrivateDriveItemInParent_(
        spreadsheetCreateOptions
      );
      spreadsheetId = spreadsheetFile.getId();
      storeAssertDedicatedId_(spreadsheetId);
      spreadsheet = SpreadsheetApp.openById(spreadsheetId);
      storeInitializeSpreadsheet_(spreadsheet, {
        createdAt: now,
        createdBy: actor,
        deploymentMode: deploymentMode,
        dataFolderId: dataFolder.getId(),
        backupFolderId: backupFolder.getId()
      });
      storeAssertDedicatedResourcesPrivate_(
        spreadsheetId, dataFolder.getId(), backupFolder.getId()
      );
    } catch (setupResourceError) {
      storeCleanupUnpublishedSetupResources_(
        [spreadsheetFile, backupFolder, dataFolder],
        setupResourceError,
        setupDriveFailureKeys
      );
    }

    var publishedIds = {
      CDP_RENEWAL_DATA_STORE_SPREADSHEET_ID_V1: spreadsheetId,
      CDP_RENEWAL_DATA_STORE_FOLDER_ID_V1: dataFolder.getId(),
      CDP_RENEWAL_DATA_STORE_BACKUP_FOLDER_ID_V1: backupFolder.getId()
    };
    var publicationOperation = {
      scope: "SETUP",
      action: "PUBLISH_PROPERTIES",
      name: spreadsheetId,
      mimeType: "application/vnd.google-apps.spreadsheet",
      parentId: dataFolder.getId(),
      label: "dedicated store publication"
    };
    try {
      properties.setProperties(publishedIds, false);
    } catch (propertyWriteError) {
      var propertySnapshotAfterError;
      try {
        propertySnapshotAfterError = properties.getProperties();
      } catch (propertyReadAfterWriteError) {
        storeStopForSetupPublicationUncertain_(
          properties,
          publishedIds,
          [spreadsheetFile, backupFolder, dataFolder],
          publicationOperation,
          propertyReadAfterWriteError,
          "STORE_SETUP_PROPERTY_PUBLICATION_UNCERTAIN",
          "Dedicated storage was created privately, but both Script Property publication and readback had uncertain outcomes. Manual review is required.",
          setupDriveFailureKeys
        );
      }
      var publicationMatches = Object.keys(publishedIds).every(function (key) {
        return String(propertySnapshotAfterError[key] || "") ===
          String(publishedIds[key] || "");
      });
      if (!publicationMatches) {
        var publicationHasAnyId = Object.keys(publishedIds).some(function (key) {
          return Boolean(String(propertySnapshotAfterError[key] || ""));
        });
        if (publicationHasAnyId) {
          storeStopForSetupPublicationUncertain_(
            properties,
            publishedIds,
            [spreadsheetFile, backupFolder, dataFolder],
            publicationOperation,
            propertyWriteError,
            "STORE_SETUP_PROPERTY_PUBLICATION_UNCERTAIN",
            "Dedicated storage was created privately, but its Script Property publication is incomplete. Manual review is required.",
            setupDriveFailureKeys
          );
        }
        storeCleanupUnpublishedSetupResources_(
          [spreadsheetFile, backupFolder, dataFolder],
          propertyWriteError,
          setupDriveFailureKeys
        );
      }
    }
    var publishedSnapshot;
    try {
      publishedSnapshot = properties.getProperties();
    } catch (propertyReadbackError) {
      storeStopForSetupPublicationUncertain_(
        properties,
        publishedIds,
        [spreadsheetFile, backupFolder, dataFolder],
        publicationOperation,
        propertyReadbackError,
        "STORE_SETUP_PROPERTY_READBACK_FAILED",
        "Dedicated storage was created privately, but Script Property readback failed. Manual review is required.",
        setupDriveFailureKeys
      );
    }
    Object.keys(publishedIds).forEach(function (key) {
      if (String(publishedSnapshot[key] || "") !== String(publishedIds[key] || "")) {
        storeStopForSetupPublicationUncertain_(
          properties,
          publishedIds,
          [spreadsheetFile, backupFolder, dataFolder],
          publicationOperation,
          new Error("Script Property readback mismatch for " + key),
          "STORE_SETUP_PROPERTY_READBACK_MISMATCH",
          "Dedicated storage Script Property readback did not match the created resources.",
          setupDriveFailureKeys
        );
      }
    });
    setupDriveFailureKeys.forEach(function (failureKey) {
      storeClearDriveFailureIfState_(failureKey, "CREATED_VERIFIED");
    });

    var opened = storeOpen_();
    storeRequirePermission_(opened, actor, "read");
    return storeState_(opened);
  });
}

/** 現在の共有正本設定を、個人データを含めずに返す。 */
/** Retain durable evidence, or verify unpublication before cleanup. */
function storeStopForSetupPublicationUncertain_(
  properties, publishedIds, createdItems, operation, cause, code, message,
  setupDriveFailureKeys
) {
  var failureKey = storeDriveFailureKey_(operation);
  try {
    storePersistDriveFailureVerified_(
      failureKey,
      "PUBLICATION_UNCERTAIN",
      operation,
      String(publishedIds[RENEWAL_STORE.SPREADSHEET_ID_KEY] || ""),
      cause
    );
  } catch (trackingError) {
    // If durable tracking itself is unavailable, rollback every publication
    // key and verify that rollback before deleting the unpublished Drive tree.
    // Never delete resources while a Script Property may still reference them.
    var unpublished = false;
    try {
      Object.keys(publishedIds).forEach(function (key) {
        properties.deleteProperty(key);
      });
      unpublished = Object.keys(publishedIds).every(function (key) {
        return !String(properties.getProperty(key) || "");
      });
    } catch (unpublishError) {
      unpublished = false;
    }
    if (unpublished) {
      storeCleanupUnpublishedSetupResources_(
        createdItems, cause, setupDriveFailureKeys
      );
    }
    var unsafe = new Error(
      message +
      " Tracking and verified publication rollback also failed; retain the private setup tree for manual review. dataFolderId=" +
      String(publishedIds[RENEWAL_STORE.DATA_FOLDER_ID_KEY] || "")
    );
    unsafe.code = "STORE_SETUP_PROPERTY_TRACKING_FAILED";
    unsafe.storeDriveResourceId = String(
      publishedIds[RENEWAL_STORE.DATA_FOLDER_ID_KEY] || ""
    );
    unsafe.cause = trackingError;
    throw unsafe;
  }
  storeFail_(code, message);
}

/** Return the current dedicated-store setup state without record payloads. */
function storeGetSetupState_() {
  var spreadsheetId = String(
    PropertiesService.getScriptProperties().getProperty(RENEWAL_STORE.SPREADSHEET_ID_KEY) || ""
  );
  if (!spreadsheetId) {
    return {
      configured: false,
      schemaVersion: RENEWAL_STORE.SCHEMA_VERSION,
      message: "専用共有正本は未作成です。"
    };
  }
  var spreadsheet = storeOpen_();
  var actor = storeActorEmail_();
  var role = storeRequirePermission_(spreadsheet, actor, "read");
  var state = storeState_(spreadsheet);
  state.role = role;
  return state;
}

/** 権限のある利用者向けにレコードを返す。削除済みは明示指定時だけ含める。 */
function storeListRecords_(options) {
  options = options || {};
  var context = storeContext_("read");
  return storeReadRecords_(context.spreadsheet)
    .filter(function (row) { return options.includeDeleted === true || !row.deleted; })
    .map(storePublicRecord_);
}

/** recordId を指定して1件読む。 */
function storeGetRecord_(recordId, options) {
  options = options || {};
  var context = storeContext_("read");
  var found = storeFindRecordById_(storeReadRecords_(context.spreadsheet), recordId);
  if (!found || (found.deleted && options.includeDeleted !== true)) return null;
  return storePublicRecord_(found);
}

/**
 * 通常更新。新規は expectedVersion=0、更新は現在の version と完全一致が必要。
 * 管理ID・請求書番号は削除済みを含む全行で一意とする。
 */
function storeUpsertRecord_(input) {
  input = input || {};
  return storeWithLock_(function () {
    var spreadsheet = storeOpen_();
    var actor = storeActorEmail_();
    var role = storeRoleForActor_(spreadsheet, actor);
    return storeUpsertRecordUnlocked_(spreadsheet, actor, role, input, {
      migration: false,
      allowDeletedRestore: false
    });
  });
}

/** 物理削除をせず削除フラグと版だけを進める。 */
function storeSoftDeleteRecord_(input) {
  input = input || {};
  storeAssertOrdinaryOperationHasNoApprover_(input.approver);
  return storeWithLock_(function () {
    var spreadsheet = storeOpen_();
    var actor = storeActorEmail_();
    var role = storeRoleForActor_(spreadsheet, actor);
    var rows = storeReadRecords_(spreadsheet);
    var current = storeFindRecordById_(rows, input.recordId);
    if (!current) storeFail_("STORE_RECORD_NOT_FOUND", "対象レコードがありません。");
    if (current.deleted) return storePublicRecord_(current);
    storeAssertExpectedVersion_(input.expectedVersion, current.version);

    var hasLegacyAccountingEvidence = storeRecordHasLegacyAccountingEvidence_(current);
    var hasFormalAccountingEvidence = hasLegacyAccountingEvidence ? false :
      storeCustomerHasFormalFinanceEvidence_(spreadsheet, current.recordId);
    if (hasLegacyAccountingEvidence || hasFormalAccountingEvidence) {
      storeFail_(
        "STORE_ACCOUNTING_RECORD_DELETE_FORBIDDEN",
        "請求・入金・会計履歴がある対象は削除扱いにできません。対象外等の業務状態で管理してください。"
      );
    }
    storeRequirePermission_(spreadsheet, actor, "record.write", role);

    var reasonCode = storeReasonCode_(input.reasonCode);
    var approver = "";
    var now = storeNowIso_();
    var next = storeCopyRecordRow_(current);
    next.deleted = true;
    next.version = current.version + 1;
    next.updatedAt = now;
    next.updatedBy = actor;
    var mutationStatus = storeWriteAuditedRow_(
      spreadsheet, "records", current._rowNumber, storeRecordToRow_(next),
      {
        entityType: "record",
        entityKey: current.recordId,
        action: "SOFT_DELETE",
        actor: actor,
        reasonCode: reasonCode,
        approver: approver,
        beforeHash: current.payloadHash,
        afterHash: next.payloadHash,
        versionBefore: current.version,
        versionAfter: next.version
      }
    );
    storeApplyCanonicalMutationLifecycle_(next, mutationStatus);
    return storeAttachMutationStatus_(storePublicRecord_(next), mutationStatus);
  });
}

/** 削除済みレコードの復帰。番号再利用を避けるため管理者専用。 */
function storeRestoreSoftDeletedRecord_(input) {
  input = input || {};
  storeAssertOrdinaryOperationHasNoApprover_(input.approver);
  return storeWithLock_(function () {
    var spreadsheet = storeOpen_();
    var actor = storeActorEmail_();
    storeRequirePermission_(spreadsheet, actor, "restore");
    var rows = storeReadRecords_(spreadsheet);
    var current = storeFindRecordById_(rows, input.recordId);
    if (!current) storeFail_("STORE_RECORD_NOT_FOUND", "対象レコードがありません。");
    if (!current.deleted) return storePublicRecord_(current);
    storeAssertExpectedVersion_(input.expectedVersion, current.version);
    storeAssertUniqueRecordKeys_(rows, current.recordId, current.managementId, current.invoiceNo);

    var next = storeCopyRecordRow_(current);
    next.deleted = false;
    next.version = current.version + 1;
    next.updatedAt = storeNowIso_();
    next.updatedBy = actor;
    var mutationStatus = storeWriteAuditedRow_(
      spreadsheet, "records", current._rowNumber, storeRecordToRow_(next),
      {
        entityType: "record",
        entityKey: current.recordId,
        action: "RESTORE_SOFT_DELETED",
        actor: actor,
        reasonCode: storeReasonCode_(input.reasonCode),
        approver: "",
        beforeHash: current.payloadHash,
        afterHash: next.payloadHash,
        versionBefore: current.version,
        versionAfter: next.version
      }
    );
    storeApplyCanonicalMutationLifecycle_(next, mutationStatus);
    return storeAttachMutationStatus_(storePublicRecord_(next), mutationStatus);
  });
}

/** 管理者が利用者ロールを追加・変更・無効化する。 */
function storeSetRole_(input) {
  input = input || {};
  storeAssertOrdinaryOperationHasNoApprover_(input.approver);
  return storeWithLock_(function () {
    var spreadsheet = storeOpen_();
    var actor = storeActorEmail_();
    storeRequirePermission_(spreadsheet, actor, "role.write");
    var email = storeEmail_(input.email);
    var role = String(input.role || "").trim().toLowerCase();
    if (RENEWAL_STORE.ROLES.indexOf(role) < 0) {
      storeFail_("STORE_ROLE_INVALID", "利用者ロールが正しくありません。");
    }
    var active = input.active !== false;
    var roles = storeReadRoles_(spreadsheet);
    var current = storeFindRoleByEmail_(roles, email);
    var expected = current ? current.version : 0;
    storeAssertExpectedVersion_(input.expectedVersion, expected);
    storeAssertRoleDomainPolicy_(spreadsheet, email, active, current);

    var nextRoles = roles.map(function (item) {
      return {
        email: item.email,
        role: item.role,
        active: item.active,
        version: item.version
      };
    });
    var candidate = {
      email: email,
      role: role,
      active: active,
      version: expected + 1
    };
    var replaced = false;
    nextRoles = nextRoles.map(function (item) {
      if (item.email !== email) return item;
      replaced = true;
      return candidate;
    });
    if (!replaced) nextRoles.push(candidate);
    if (!nextRoles.some(function (item) { return item.active && item.role === "admin"; })) {
      storeFail_("STORE_LAST_ADMIN", "有効な管理者を0名にはできません。");
    }

    var now = storeNowIso_();
    var next = {
      email: email,
      role: role,
      active: active,
      version: expected + 1,
      createdAt: current ? current.createdAt : now,
      updatedAt: now,
      updatedBy: actor
    };
    var mutationStatus = storeWriteAuditedRow_(
      spreadsheet, "roles",
      current ? current._rowNumber : storeNextRow_(spreadsheet, "roles"),
      storeRoleToRow_(next),
      {
        entityType: "role",
        entityKey: email,
        action: current ? "ROLE_UPDATE" : "ROLE_INSERT",
        actor: actor,
        reasonCode: storeReasonCode_(input.reasonCode),
        approver: "",
        beforeHash: current ? storeRoleHash_(current) : "",
        afterHash: storeRoleHash_(next),
        versionBefore: expected,
        versionAfter: next.version
      }
    );
    return storeAttachMutationStatus_(
      { email: next.email, role: next.role, active: next.active, version: next.version },
      mutationStatus
    );
  });
}

/** 管理者向けロール一覧。 */
function storeAssertRoleDomainPolicy_(spreadsheet, email, active, current) {
  if (!active) return true;
  var meta = storeReadMetaMap_(spreadsheet);
  return storeAssertRoleDomainPair_(
    meta.createdBy, email, meta.deploymentMode
  );
}

function storeAssertRoleDomainPair_(ownerValue, memberValue, deploymentModeValue) {
  var owner = storeEmail_(ownerValue);
  var member = storeEmail_(memberValue);
  if (owner === member) return true;
  var ownerDomain = owner.split("@")[1];
  var memberDomain = member.split("@")[1];
  var deploymentMode = String(deploymentModeValue || "").trim();
  if (deploymentMode === RENEWAL_STORE.SETUP_MODE_PERSONAL) {
    storeFail_(
      "STORE_WORKSPACE_REQUIRED",
      "A personal single-user store cannot activate another user."
    );
  }
  if (deploymentMode !== RENEWAL_STORE.SETUP_MODE_WORKSPACE) {
    storeFail_(
      "STORE_WORKSPACE_POLICY_UNVERIFIED",
      "This legacy store has no verified Workspace ownership mode. Keep it owner-only until an audited migration is completed."
    );
  }
  if (ownerDomain !== memberDomain) {
    storeFail_(
      "STORE_WORKSPACE_REQUIRED",
      "Active multi-user roles require the verified Workspace owner domain."
    );
  }
  return true;
}

/**
 * The canonical store permanently records its bootstrap owner.  Therefore a
 * consumer-account store cannot be initialized first and later "promoted" by
 * moving the Apps Script project to Workspace.  Force that choice before any
 * Drive side effect.
 */
function storeAssertSetupDeploymentMode_(actorValue, input) {
  input = input || {};
  var actor = storeEmail_(actorValue);
  var mode = String(input.deploymentMode || "").trim();
  if (
    mode !== RENEWAL_STORE.SETUP_MODE_WORKSPACE &&
    mode !== RENEWAL_STORE.SETUP_MODE_PERSONAL
  ) {
    storeFail_(
      "STORE_SETUP_MODE_REQUIRED",
      "Choose Workspace multi-user setup or explicitly confirmed personal single-user setup before creating the canonical store."
    );
  }
  var identity = storeVerifiedGoogleIdentityForActor_(actor);
  var actorDomain = actor.split("@")[1];
  if (mode === RENEWAL_STORE.SETUP_MODE_WORKSPACE) {
    if (!identity.hostedDomain || identity.hostedDomain !== actorDomain) {
      storeFail_(
        "STORE_WORKSPACE_OWNER_REQUIRED",
        "The signed Google identity does not identify this owner as a member of the requested Workspace domain. Move the project and approved Drive assets before initial setup."
      );
    }
  }
  if (mode === RENEWAL_STORE.SETUP_MODE_PERSONAL) {
    if (identity.hostedDomain) {
      storeFail_(
        "STORE_PERSONAL_SETUP_NOT_REQUIRED",
        "The signed Google identity is Workspace-owned. Use Workspace multi-user setup."
      );
    }
    if (
      String(input.personalSingleUserConfirm || "") !==
      RENEWAL_STORE.PERSONAL_SETUP_CONFIRM
    ) {
      storeFail_(
        "STORE_PERSONAL_SINGLE_USER_CONFIRM_REQUIRED",
        "Personal-account setup is single-user only and requires the exact manual confirmation."
      );
    }
  }
  return mode;
}

/**
 * ScriptApp itself issues this token.  Decode only the claims required for
 * bootstrap policy; never persist, log, or return the token.
 */
function storeVerifiedGoogleIdentityForActor_(actorValue) {
  var actor = storeEmail_(actorValue);
  var token = "";
  try {
    token = String(ScriptApp.getIdentityToken() || "");
  } catch (identityError) {
    storeFail_(
      "STORE_GOOGLE_IDENTITY_REQUIRED",
      "A signed Google identity token is required before initial setup."
    );
  }
  var parts = token.split(".");
  if (parts.length !== 3 || !parts[1]) {
    storeFail_(
      "STORE_GOOGLE_IDENTITY_REQUIRED",
      "A signed Google identity token is required before initial setup."
    );
  }
  var claims;
  try {
    var bytes = Utilities.base64DecodeWebSafe(parts[1]);
    claims = JSON.parse(
      Utilities.newBlob(bytes).getDataAsString("UTF-8")
    );
  } catch (decodeError) {
    storeFail_(
      "STORE_GOOGLE_IDENTITY_INVALID",
      "The Google identity token could not be verified for initial setup."
    );
  }
  var issuer = String(claims && claims.iss || "");
  var tokenEmail = storeEmail_(claims && claims.email);
  var hostedDomain = String(claims && claims.hd || "")
    .normalize("NFKC").trim().toLowerCase();
  var subject = String(claims && claims.sub || "").trim();
  var issuedAt = Number(claims && claims.iat);
  var expiresAt = Number(claims && claims.exp);
  var nowSeconds = Math.floor(Date.now() / 1000);
  if (
    (issuer !== "https://accounts.google.com" &&
      issuer !== "accounts.google.com") ||
    claims.email_verified !== true ||
    tokenEmail !== actor ||
    !subject ||
    !isFinite(issuedAt) ||
    issuedAt > nowSeconds + 300 ||
    !isFinite(expiresAt) ||
    expiresAt <= nowSeconds
  ) {
    storeFail_(
      "STORE_GOOGLE_IDENTITY_MISMATCH",
      "The signed Google identity is incomplete, expired, or does not match the bootstrap owner."
    );
  }
  if (hostedDomain && hostedDomain !== actor.split("@")[1]) {
    storeFail_(
      "STORE_GOOGLE_IDENTITY_MISMATCH",
      "The signed Workspace domain does not match the bootstrap owner."
    );
  }
  return {
    email: tokenEmail,
    hostedDomain: hostedDomain
  };
}

/**
 * The approved output root is an ownership anchor chosen by the operator.
 * Even if a deployment drifts to execute-as-user, another visitor cannot
 * become the first administrator because they do not own this exact folder.
 */
function storeAssertBootstrapOwnershipAnchor_(actorValue) {
  var actor = storeEmail_(actorValue);
  var folder;
  try {
    folder = DriveApp.getFolderById(
      RENEWAL_STORE.BOOTSTRAP_OWNERSHIP_FOLDER_ID
    );
  } catch (openError) {
    storeFail_(
      "STORE_BOOTSTRAP_OWNERSHIP_FOLDER_UNAVAILABLE",
      "The approved bootstrap ownership folder cannot be opened."
    );
  }
  var ownerEmail = "";
  try {
    var owner = folder.getOwner();
    ownerEmail = storeEmail_(owner && owner.getEmail());
  } catch (ownerError) {
    storeFail_(
      "STORE_BOOTSTRAP_OWNERSHIP_UNVERIFIED",
      "The approved bootstrap folder must be in My Drive and owned by the final deployment owner."
    );
  }
  if (
    String(folder.getId() || "") !==
      RENEWAL_STORE.BOOTSTRAP_OWNERSHIP_FOLDER_ID ||
    String(folder.getName() || "") !==
      RENEWAL_STORE.BOOTSTRAP_OWNERSHIP_FOLDER_NAME ||
    ownerEmail !== actor
  ) {
    storeFail_(
      "STORE_BOOTSTRAP_OWNER_MISMATCH",
      "The final deployment owner must own the exact approved 2026 output folder before initial setup."
    );
  }
  return true;
}

/**
 * Re-apply the live activation policy to every role reconstructed from a
 * backup.  Backup integrity proves what was saved, not that an old role is
 * still safe under the current owner/deployment policy.
 */
function storeAssertActiveRolePolicy_(spreadsheet, roles) {
  var meta = storeReadMetaMap_(spreadsheet);
  var activeAdmin = false;
  (roles || []).forEach(function (row) {
    var role = String(row.role || "").trim().toLowerCase();
    if (RENEWAL_STORE.ROLES.indexOf(role) < 0) {
      storeFail_("STORE_RESTORE_ROLE_INVALID", "A restored role is invalid.");
    }
    if (!storeBoolean_(row.active)) return;
    storeAssertRoleDomainPair_(
      meta.createdBy, row.email, meta.deploymentMode
    );
    if (role === "admin") activeAdmin = true;
  });
  if (!activeAdmin) {
    storeFail_("STORE_RESTORE_ADMIN_MISSING", "A restore must retain an active administrator.");
  }
  return true;
}

function storeListRoles_() {
  var context = storeContext_("role.write");
  return storeReadRoles_(context.spreadsheet).map(function (row) {
    return {
      email: row.email,
      role: row.role,
      active: row.active,
      version: row.version,
      updatedAt: row.updatedAt,
      updatedBy: row.updatedBy
    };
  });
}

/**
 * 手動バックアップを管理者専用フォルダへJSONで作成する。
 * 監査ログは災害復旧用の証跡として同梱するが、復元対象には含めず、
 * 復元操作は常に現在の監査ログへ追記する。
 */
function storeCreateManualBackup_(input) {
  input = input || {};
  return storeWithLock_(function () {
    var spreadsheet = storeOpen_();
    var actor = storeActorEmail_();
    storeRequirePermission_(spreadsheet, actor, "backup.create");
    return storeCreateSystemBackupUnlocked_(spreadsheet, actor, {
      kind: "MANUAL",
      noteCode: storeReasonCode_(input.reasonCode || "MANUAL_BACKUP"),
      idempotencyKey: input.idempotencyKey
    });
  });
}

/** 管理者向け。登録済みバックアップのメタデータだけを返す。 */
function storeCreateSystemBackupUnlocked_(spreadsheet, actor, input) {
  input = input || {};
  var kind = String(input.kind || "MANUAL").trim().toUpperCase();
  if (["MANUAL", "DAILY"].indexOf(kind) < 0) {
    storeFail_("STORE_SYSTEM_BACKUP_KIND_INVALID", "System backup kind is invalid.");
  }
  var noteCode = storeReasonCode_(
    input.noteCode || (kind === "DAILY" ? "DAILY_BACKUP" : "MANUAL_BACKUP")
  );
  var idempotencyKey = storeSystemBackupIdempotencyKey_(input.idempotencyKey);
  var idempotencyKeyHash = storeSha256_(idempotencyKey);
  var runSheet = storeEnsureSystemBackupRunSheet_(spreadsheet);

  for (var cycle = 0; cycle < 3; cycle += 1) {
    var runs = storeReadSystemBackupRuns_(runSheet).filter(function (row) {
      return row.idempotencyKeyHash === idempotencyKeyHash &&
        row.kind === kind && row.createdBy === storeEmail_(actor);
    });
    var activeRuns = runs.filter(function (row) {
      return row.status !== "ABORTED_PARTIAL";
    });
    if (activeRuns.length > 1) {
      storeFail_(
        "STORE_SYSTEM_BACKUP_RUN_DUPLICATE",
        "More than one active system backup run uses the same idempotency key."
      );
    }
    var run = activeRuns[0] || storeCreateSystemBackupRun_(
      spreadsheet, runSheet, actor, kind, noteCode,
      idempotencyKeyHash, runs.length + 1
    );
    if (run.noteCode !== noteCode) {
      storeFail_(
        "STORE_SYSTEM_BACKUP_IDEMPOTENCY_CONFLICT",
        "The idempotency key was already used with a different backup reason."
      );
    }
    storeEnsureSystemBackupRunAudit_(
      spreadsheet, run, actor, run.status !== "COMPLETE"
    );
    if (run.status === "COMPLETE") {
      var replayedStore = storeCreateBackupUnlocked_(
        spreadsheet,
        actor,
        kind === "DAILY" ? "DAILY" : "MANUAL",
        noteCode,
        { backupId: run.storeBackupId }
      );
      var replayedFinance = null;
      if (run.financeConfigured) {
        replayedFinance = financeStoreCreateRegisteredBackupUnlocked_(
          spreadsheet,
          actor,
          { callerRunId: run.runId, noteCode: noteCode }
        );
        if (String(replayedFinance.backupId || "") !== run.financeBackupId ||
            Number(replayedFinance.revision) !== Number(run.financeRevision) ||
            String(replayedFinance.stateHash || "") !== run.financeStateHash) {
          storeFail_(
            "STORE_SYSTEM_BACKUP_REPLAY_MISMATCH",
            "The completed system backup pair could not be verified."
          );
        }
      }
      var replayedResult = storeSystemBackupResult_(
        run, replayedStore, replayedFinance
      );
      replayedResult.idempotentReplay = true;
      return replayedResult;
    }

    var storeResult;
    try {
      var storeRow = storeFindBackup_(
        storeReadBackups_(spreadsheet), run.storeBackupId
      );
      if (!storeRow &&
          storeDataFingerprint_(
            storeReadRecords_(spreadsheet), storeReadRoles_(spreadsheet)
          ) !== run.storeFingerprint) {
        storeAbortSystemBackupRun_(
          spreadsheet, runSheet, run, actor, "STORE_SOURCE_CHANGED"
        );
        continue;
      }
      storeResult = storeCreateBackupUnlocked_(
        spreadsheet,
        actor,
        kind === "DAILY" ? "DAILY" : "MANUAL",
        noteCode,
        { backupId: run.storeBackupId }
      );
    } catch (storeError) {
      var failedStoreRow = storeFindBackup_(
        storeReadBackups_(spreadsheet), run.storeBackupId
      );
      if (failedStoreRow && failedStoreRow.status === "FAILED_NO_FILE") {
        storeAbortSystemBackupRun_(
          spreadsheet, runSheet, run, actor, "STORE_PREPARED_FILE_MISSING"
        );
        continue;
      }
      return storeMarkSystemBackupPartial_(
        spreadsheet, runSheet, run, actor, storeError, null, null
      );
    }

    run.status = "STORE_COMPLETE";
    run.updatedAt = storeNowIso_();
    run.errorCode = "";
    storeWriteSystemBackupRun_(runSheet, run);
    SpreadsheetApp.flush();

    if (!run.financeConfigured) {
      return storeCompleteSystemBackupRun_(
        spreadsheet, runSheet, run, actor, storeResult, null
      );
    }

    var financeResult;
    var financeIntent;
    try {
      financeIntent = financeStoreGetRegisteredBackupForCallerRunId_(
        spreadsheet, run.runId
      );
      if (financeIntent &&
          (Number(financeIntent.revision) !== Number(run.financeRevision) ||
           String(financeIntent.stateHash || "") !== run.financeStateHash)) {
        storeFail_(
          "STORE_SYSTEM_BACKUP_FINANCE_INTENT_MISMATCH",
          "The registered finance backup intent does not match the system run snapshot."
        );
      }
      if (!financeIntent) {
        var currentFinance = storeSystemBackupFinanceState_(spreadsheet);
        if (Number(currentFinance.revision) !== Number(run.financeRevision) ||
            String(currentFinance.stateHash || "") !== run.financeStateHash) {
          storeAbortSystemBackupRun_(
            spreadsheet, runSheet, run, actor, "FINANCE_SOURCE_CHANGED"
          );
          continue;
        }
      }
      financeResult = financeStoreCreateRegisteredBackupUnlocked_(
        spreadsheet,
        actor,
        { callerRunId: run.runId, noteCode: noteCode }
      );
      if (Number(financeResult.revision) !== Number(run.financeRevision) ||
          String(financeResult.stateHash || "") !== run.financeStateHash) {
        storeFail_(
          "STORE_SYSTEM_BACKUP_FINANCE_RESULT_MISMATCH",
          "The completed finance backup does not match the system run snapshot."
        );
      }
    } catch (financeError) {
      if (financeError &&
          financeError.code === "FINANCE_BACKUP_PREPARED_SOURCE_CHANGED") {
        storeAbortSystemBackupRun_(
          spreadsheet, runSheet, run, actor, "FINANCE_PREPARED_SOURCE_CHANGED"
        );
        continue;
      }
      return storeMarkSystemBackupPartial_(
        spreadsheet, runSheet, run, actor, financeError, storeResult, null
      );
    }

    run.financeBackupId = String(financeResult.backupId || "");
    return storeCompleteSystemBackupRun_(
      spreadsheet, runSheet, run, actor, storeResult, financeResult
    );
  }
  storeFail_(
    "STORE_SYSTEM_BACKUP_RESTART_LIMIT",
    "System backup state changed repeatedly; retry after reviewing the registered runs."
  );
}

function storeCreateSystemBackupRun_(
  spreadsheet, sheet, actor, kind, noteCode, idempotencyKeyHash, attempt
) {
  var financeConfigured =
    typeof financeStoreIsConfigured_ === "function" &&
    financeStoreIsConfigured_(spreadsheet);
  if (financeConfigured &&
      (typeof financeStoreCreateRegisteredBackupUnlocked_ !== "function" ||
       typeof financeStoreGetRegisteredBackupForCallerRunId_ !== "function")) {
    storeFail_(
      "STORE_FINANCE_BACKUP_UNAVAILABLE",
      "Finance is configured but its registered backup integration is unavailable."
    );
  }
  var financeState = financeConfigured ?
    storeSystemBackupFinanceState_(spreadsheet) :
    { revision: 0, stateHash: "" };
  var runId = "sysb_" + kind + "_" +
    idempotencyKeyHash.slice(0, 48) + "_" + String(attempt);
  var now = storeNowIso_();
  var run = {
    runId: runId,
    idempotencyKeyHash: idempotencyKeyHash,
    kind: kind,
    createdAt: now,
    createdBy: storeEmail_(actor),
    storeFingerprint: storeDataFingerprint_(
      storeReadRecords_(spreadsheet), storeReadRoles_(spreadsheet)
    ),
    financeConfigured: financeConfigured,
    financeRevision: financeState.revision,
    financeStateHash: financeState.stateHash,
    storeBackupId: "backup_" +
      storeSha256_("CDP_RENEWAL_SYSTEM_STORE_BACKUP_V1|" + runId),
    financeBackupId: "",
    status: "PREPARED",
    updatedAt: now,
    noteCode: noteCode,
    errorCode: ""
  };
  run._rowNumber = storeWriteSystemBackupRun_(sheet, run);
  SpreadsheetApp.flush();
  storeAppendAudit_(spreadsheet, {
    eventState: "PREPARED",
    entityType: "system_backup",
    entityKey: runId,
    action: "SYSTEM_BACKUP_RUN",
    actor: actor,
    reasonCode: noteCode,
    approver: "",
    beforeHash: run.storeFingerprint,
    afterHash: run.financeStateHash,
    versionBefore: 0,
    versionAfter: 0,
    correlationId: runId
  });
  return run;
}

function storeCompleteSystemBackupRun_(
  spreadsheet, sheet, run, actor, storeResult, financeResult
) {
  run.status = "COMPLETE";
  run.updatedAt = storeNowIso_();
  run.errorCode = "";
  if (financeResult) run.financeBackupId = String(financeResult.backupId || "");
  storeWriteSystemBackupRun_(sheet, run);
  SpreadsheetApp.flush();
  storeAppendAudit_(spreadsheet, {
    eventState: "COMMITTED",
    entityType: "system_backup",
    entityKey: run.runId,
    action: "SYSTEM_BACKUP_RUN",
    actor: actor,
    reasonCode: run.noteCode,
    approver: "",
    beforeHash: run.storeFingerprint,
    afterHash: run.financeConfigured ? run.financeStateHash : run.storeFingerprint,
    versionBefore: 0,
    versionAfter: 0,
    correlationId: run.runId
  });
  return storeSystemBackupResult_(run, storeResult, financeResult);
}

function storeMarkSystemBackupPartial_(
  spreadsheet, sheet, run, actor, error, storeResult, financeResult
) {
  run.status = "PARTIAL";
  run.updatedAt = storeNowIso_();
  run.errorCode = storeSystemBackupErrorCode_(error);
  storeWriteSystemBackupRun_(sheet, run);
  SpreadsheetApp.flush();
  storeAppendAudit_(spreadsheet, {
    eventState: "PARTIAL",
    entityType: "system_backup",
    entityKey: run.runId,
    action: "SYSTEM_BACKUP_PARTIAL",
    actor: actor,
    reasonCode: run.noteCode,
    approver: "",
    beforeHash: run.storeFingerprint,
    afterHash: run.financeStateHash,
    versionBefore: 0,
    versionAfter: 0,
    correlationId: run.runId
  });
  var result = storeSystemBackupResult_(run, storeResult, financeResult);
  result.success = false;
  result.partial = true;
  result.code = run.errorCode;
  result.error = String(error && error.message || error || "System backup is incomplete.");
  return result;
}

function storeAbortSystemBackupRun_(spreadsheet, sheet, run, actor, errorCode) {
  run.status = "ABORTED_PARTIAL";
  run.updatedAt = storeNowIso_();
  run.errorCode = storeAuditToken_(errorCode);
  storeWriteSystemBackupRun_(sheet, run);
  SpreadsheetApp.flush();
  storeAppendAudit_(spreadsheet, {
    eventState: "ABORTED",
    entityType: "system_backup",
    entityKey: run.runId,
    action: "SYSTEM_BACKUP_ABORT",
    actor: actor,
    reasonCode: run.noteCode,
    approver: "",
    beforeHash: run.storeFingerprint,
    afterHash: run.financeStateHash,
    versionBefore: 0,
    versionAfter: 0,
    correlationId: run.runId
  });
}

function storeSystemBackupResult_(run, storeResult, financeResult) {
  storeResult = storeResult || {};
  return {
    success: run.status === "COMPLETE",
    partial: run.status === "PARTIAL",
    runId: run.runId,
    status: run.status,
    mode: run.financeConfigured ? "STORE_AND_FINANCE" : "STORE_ONLY",
    storeBackupId: run.storeBackupId,
    financeBackupId: run.financeBackupId,
    backupId: run.storeBackupId,
    fileId: String(storeResult.fileId || ""),
    fileUrl: String(storeResult.fileUrl || ""),
    contentHash: String(storeResult.contentHash || ""),
    recordCount: Number(storeResult.recordCount || 0),
    backup: storeResult,
    financeBackup: financeResult || null,
    errorCode: run.errorCode || ""
  };
}

function storeEnsureSystemBackupRunAudit_(spreadsheet, run, actor, preparedOnly) {
  var keyHash = storeSha256_(run.runId);
  var rows = storeReadObjects_(spreadsheet, "audit").filter(function (row) {
    return String(row.entityKeyHash || "") === keyHash &&
      String(row.entityType || "") === "SYSTEM_BACKUP" &&
      String(row.action || "") === "SYSTEM_BACKUP_RUN" &&
      String(row.correlationId || "") === storeAuditToken_(run.runId);
  });
  var prepared = rows.filter(function (row) {
    return String(row.eventState || "") === "PREPARED";
  });
  var committed = rows.filter(function (row) {
    return String(row.eventState || "") === "COMMITTED";
  });
  if (prepared.length > 1 || committed.length > 1) {
    storeFail_(
      "STORE_SYSTEM_BACKUP_AUDIT_DUPLICATE",
      "System backup run audit markers are duplicated."
    );
  }
  function append(eventState) {
    storeAppendAudit_(spreadsheet, {
      eventState: eventState,
      entityType: "system_backup",
      entityKey: run.runId,
      action: "SYSTEM_BACKUP_RUN",
      actor: actor,
      reasonCode: run.noteCode,
      approver: "",
      beforeHash: run.storeFingerprint,
      afterHash: run.financeConfigured ?
        run.financeStateHash : run.storeFingerprint,
      versionBefore: 0,
      versionAfter: 0,
      correlationId: run.runId
    });
  }
  if (!prepared.length) append("PREPARED");
  if (!preparedOnly && !committed.length) append("COMMITTED");
}

function storeEnsureSystemBackupRunSheet_(spreadsheet) {
  var name = RENEWAL_STORE.SYSTEM_BACKUP_RUN_SHEET;
  var headers = RENEWAL_STORE.SYSTEM_BACKUP_RUN_HEADERS;
  var sheet = spreadsheet.getSheetByName(name);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    return sheet;
  }
  var actual = sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0];
  if (storeStableStringify_(actual) !== storeStableStringify_(headers)) {
    storeFail_(
      "STORE_SYSTEM_BACKUP_RUN_SCHEMA_INVALID",
      "System backup run registry header is invalid."
    );
  }
  return sheet;
}

function storeReadSystemBackupRuns_(sheet) {
  var headers = RENEWAL_STORE.SYSTEM_BACKUP_RUN_HEADERS;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, headers.length).getValues()
    .map(function (values, index) {
      var row = { _rowNumber: index + 2 };
      headers.forEach(function (header, column) { row[header] = values[column]; });
      row.runId = String(row.runId || "");
      row.idempotencyKeyHash = String(row.idempotencyKeyHash || "");
      row.kind = String(row.kind || "");
      row.createdBy = storeEmail_(row.createdBy);
      row.storeFingerprint = String(row.storeFingerprint || "");
      row.financeConfigured = storeBoolean_(row.financeConfigured);
      row.financeRevision = Number(row.financeRevision || 0);
      row.financeStateHash = String(row.financeStateHash || "");
      row.storeBackupId = String(row.storeBackupId || "");
      row.financeBackupId = String(row.financeBackupId || "");
      row.status = String(row.status || "");
      row.noteCode = String(row.noteCode || "");
      row.errorCode = String(row.errorCode || "");
      return row;
    });
}

function storeWriteSystemBackupRun_(sheet, run) {
  var headers = RENEWAL_STORE.SYSTEM_BACKUP_RUN_HEADERS;
  var rowNumber = Number(run._rowNumber || Math.max(2, sheet.getLastRow() + 1));
  storeEnsureSheetRows_(sheet, rowNumber);
  sheet.getRange(rowNumber, 1, 1, headers.length).setValues([headers.map(function (header) {
    return storeCellValue_(run[header] === undefined ? "" : run[header]);
  })]);
  run._rowNumber = rowNumber;
  return rowNumber;
}

function storeSystemBackupFinanceState_(spreadsheet) {
  var meta = financeStoreReadMeta_(spreadsheet);
  var revision = Number(meta.currentRevision);
  var stateHash = String(meta.currentStateHash || "");
  if (!Number.isInteger(revision) || revision < 0 ||
      !/^[a-f0-9]{64}$/i.test(stateHash)) {
    storeFail_(
      "STORE_FINANCE_BACKUP_STATE_INVALID",
      "Finance revision/state hash is invalid."
    );
  }
  return { revision: revision, stateHash: stateHash };
}

function storeSystemBackupIdempotencyKey_(value) {
  var key = String(value || "").normalize("NFKC").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:@-]{7,159}$/.test(key)) {
    storeFail_(
      "STORE_BACKUP_IDEMPOTENCY_REQUIRED",
      "A stable 8-160 character backup idempotency key is required."
    );
  }
  return key;
}

function storeSystemBackupErrorCode_(error) {
  var code = String(error && error.code || "STORE_SYSTEM_BACKUP_ERROR")
    .normalize("NFKC").trim().toUpperCase();
  return /^[A-Z0-9][A-Z0-9_.:-]{0,95}$/.test(code) ?
    code : "STORE_SYSTEM_BACKUP_ERROR";
}

function storeDailyBackupIdempotencyKey_(actor) {
  var day = "";
  try {
    var zone = Session.getScriptTimeZone ?
      Session.getScriptTimeZone() : "Asia/Tokyo";
    if (Utilities.formatDate) {
      day = Utilities.formatDate(new Date(), zone || "Asia/Tokyo", "yyyy-MM-dd");
    }
  } catch (ignored) {}
  if (!day) {
    day = new Date(Date.now() + 9 * 60 * 60000).toISOString().slice(0, 10);
  }
  return "DAILY:" + day + ":" + storeSha256_(storeEmail_(actor)).slice(0, 24);
}

function storeListRegisteredBackups_() {
  var context = storeContext_("backup.create");
  var runByStoreBackupId = {};
  var runSheet = context.spreadsheet.getSheetByName(
    RENEWAL_STORE.SYSTEM_BACKUP_RUN_SHEET
  );
  if (runSheet) {
    storeReadSystemBackupRuns_(runSheet).forEach(function (run) {
      if (run.storeBackupId) runByStoreBackupId[run.storeBackupId] = run;
    });
  }
  return storeReadBackups_(context.spreadsheet).map(function (row) {
    var run = runByStoreBackupId[row.backupId] || null;
    return {
      backupId: row.backupId,
      createdAt: String(row.createdAt || ""),
      createdBy: storeEmail_(row.createdBy),
      kind: String(row.kind || ""),
      recordCount: Number(row.recordCount || 0),
      activeCount: Number(row.activeCount || 0),
      roleCount: Number(row.roleCount || 0),
      contentHash: row.contentHash,
      status: row.status,
      noteCode: String(row.noteCode || ""),
      systemRunId: run ? run.runId : "",
      systemRunStatus: run ? run.status : "NOT_APPLICABLE",
      systemPairComplete: run ? run.status === "COMPLETE" : null,
      financeBackupId: run ? run.financeBackupId : ""
    };
  }).sort(function (a, b) {
    return String(b.createdAt).localeCompare(String(a.createdAt));
  });
}

/** Drive本文を画面へ返さず、登録行・保存先・hash・形式だけを検証する。 */
function storeVerifyRegisteredBackup_(input) {
  input = input || {};
  var context = storeContext_("backup.create");
  var backup = storeFindBackup_(storeReadBackups_(context.spreadsheet), input.backupId);
  if (!backup || backup.status !== "COMPLETE") {
    storeFail_("STORE_BACKUP_NOT_FOUND", "検証できる登録済みバックアップがありません。");
  }
  var loaded = storeLoadBackup_(backup);
  return {
    success: true,
    verified: true,
    backupId: backup.backupId,
    createdAt: String(backup.createdAt || ""),
    recordCount: Array.isArray(loaded.body.records) ? loaded.body.records.length : 0,
    roleCount: Array.isArray(loaded.body.roles) ? loaded.body.roles.length : 0,
    auditCount: Array.isArray(loaded.body.audit) ? loaded.body.audit.length : 0,
    auditIncluded: Array.isArray(loaded.body.audit),
    financeIncluded: !!loaded.body.finance,
    contentHash: loaded.contentHash
  };
}

/** Install one owner-owned daily backup trigger; this is not a user API. */
function storeInstallDailyBackupTrigger_(input) {
  input = input || {};
  if (String(input.confirm || "") !== "INSTALL_DAILY_RENEWAL_BACKUP") {
    storeFail_("STORE_TRIGGER_CONFIRM_REQUIRED", "Explicit daily backup trigger confirmation is required.");
  }
  var context = storeContext_("backup.create");
  if (context.role !== "admin") storeFail_("STORE_ADMIN_REQUIRED", "Administrator role is required.");
  if (typeof ScriptApp === "undefined") storeFail_("STORE_TRIGGER_UNAVAILABLE", "Script trigger service is unavailable.");
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction && trigger.getHandlerFunction() === "storeRunDailyBackup_") ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger("storeRunDailyBackup_").timeBased().everyDays(1).atHour(2).create();
  storeAppendAudit_(context.spreadsheet, { eventState: "COMMITTED", entityType: "backup", entityKey: "daily_trigger", action: "DAILY_BACKUP_TRIGGER_INSTALL", actor: context.actor, reasonCode: "DAILY_BACKUP", approver: "", beforeHash: "", afterHash: "", versionBefore: 0, versionAfter: 0, correlationId: "trigger_" + storeUuid_() });
  return { success: true, schedule: "daily around 02:00" };
}

/** Time-trigger entry point. It is intentionally not exposed by Code.js. */
function storeRunDailyBackup_() {
  return storeWithLock_(function() {
    var spreadsheet = storeOpen_();
    var meta = storeReadMetaMap_(spreadsheet);
    var effective = "";
    try { effective = Session.getEffectiveUser().getEmail(); } catch (ignored) {}
    effective = storeEmail_(effective);
    if (effective !== storeEmail_(meta.createdBy)) storeFail_("STORE_TRIGGER_OWNER_MISMATCH", "Daily backup trigger owner does not match store owner.");
    var result = storeCreateSystemBackupUnlocked_(spreadsheet, effective, {
      kind: "DAILY",
      noteCode: "DAILY_BACKUP",
      idempotencyKey: storeDailyBackupIdempotencyKey_(effective)
    });
    if (result.status !== "COMPLETE") {
      var error = new Error("Daily system backup is incomplete; the same run must be retried.");
      error.code = "STORE_SYSTEM_BACKUP_PARTIAL";
      error.backupRun = result;
      throw error;
    }
    return result;
  });
}

function storePreviewBackupPrune_() {
  var context = storeContext_("backup.create");
  var cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - RENEWAL_STORE.BACKUP_RETENTION_MONTHS);
  var candidates = storeReadBackups_(context.spreadsheet).filter(function(row) {
    return row.status === "COMPLETE" && new Date(row.createdAt).getTime() < cutoff.getTime();
  }).map(function(row) { return { backupId: row.backupId, createdAt: row.createdAt, fileId: row.driveFileId }; });
  return { dryRun: true, cutoff: cutoff.toISOString(), count: candidates.length, candidates: candidates, confirm: RENEWAL_STORE.BACKUP_PRUNE_CONFIRM };
}

function storeConfirmBackupPrune_(input) {
  input = input || {};
  if (String(input.confirm || "") !== RENEWAL_STORE.BACKUP_PRUNE_CONFIRM) storeFail_("STORE_PRUNE_CONFIRM_REQUIRED", "Explicit backup prune confirmation is required.");
  return storeWithLock_(function() {
    var spreadsheet = storeOpen_(), actor = storeActorEmail_();
    storeRequirePermission_(spreadsheet, actor, "backup.create");
    var preview = storePreviewBackupPrune_();
    var requested = Array.isArray(input.backupIds) ? input.backupIds.map(String) : preview.candidates.map(function(c){ return c.backupId; });
    var approved = {}, rows = storeReadBackups_(spreadsheet), meta = storeReadMetaMap_(spreadsheet), deleted = [];
    preview.candidates.forEach(function(c) { approved[c.backupId] = c; });
    requested.forEach(function(id) {
      if (!approved[id]) storeFail_("STORE_PRUNE_NOT_ELIGIBLE", "Only listed, registered backups may be pruned.");
      var row = storeFindBackup_(rows, id);
      if (!row || row.status !== "COMPLETE") storeFail_("STORE_PRUNE_BACKUP_INVALID", "Backup registry changed; preview again.");
      var file = DriveApp.getFileById(row.driveFileId);
      storeAssertBackupFileInFolder_(file, meta.backupFolderId);
      if (typeof file.setTrashed !== "function") storeFail_("STORE_PRUNE_UNAVAILABLE", "Backup deletion is unavailable.");
      file.setTrashed(true);
      row.status = "PRUNED";
      storeWriteObjectAt_(spreadsheet, "backups", row._rowNumber, row);
      deleted.push(id);
    });
    storeAppendAudit_(spreadsheet, { eventState: "COMMITTED", entityType: "backup", entityKey: storeSha256_(deleted.join("|")), action: "BACKUP_PRUNE", actor: actor, reasonCode: "BACKUP_PRUNE", approver: "", beforeHash: "", afterHash: "", versionBefore: 0, versionAfter: 0, correlationId: "prune_" + storeUuid_() });
    return { success: true, deletedBackupIds: deleted };
  });
}

function storeAssertBackupFileInFolder_(file, backupFolderId) {
  if (!file || typeof file.getParents !== "function") storeFail_("STORE_PRUNE_PARENT_CHECK_UNAVAILABLE", "Cannot verify backup folder membership.");
  var parents = file.getParents(), found = false;
  while (parents.hasNext && parents.hasNext()) if (parents.next().getId() === String(backupFolderId)) found = true;
  if (!found) storeFail_("STORE_PRUNE_FOLDER_MISMATCH", "Backup file is not in the dedicated backup folder.");
}

/**
 * 登録済みバックアップの復元予行。ここではレコード・ロールを変更しない。
 * 指定された別管理者だけが15分以内に確定できる。申請者へ確定権限は返さない。
 */
function storePrepareRestore_(input) {
  input = input || {};
  return storeWithLock_(function () {
    var spreadsheet = storeOpen_();
    var actor = storeActorEmail_();
    storeRequirePermission_(spreadsheet, actor, "restore");
    var reasonCode = storeReasonCode_(input.reasonCode);
    var approver = storeRequireAdminApprover_(spreadsheet, input.approver);
    if (approver === actor) {
      storeFail_("STORE_RESTORE_SELF_APPROVAL_FORBIDDEN", "復元の申請者と承認者は別の管理者である必要があります。");
    }
    var backupRow = storeFindBackup_(storeReadBackups_(spreadsheet), input.backupId);
    if (!backupRow || backupRow.status !== "COMPLETE") {
      storeFail_("STORE_BACKUP_NOT_FOUND", "登録済みバックアップがありません。");
    }
    var loaded = storeLoadBackup_(backupRow);
    var currentRecords = storeReadRecords_(spreadsheet);
    var currentRoles = storeReadRoles_(spreadsheet);
    var plan = storeBuildRestorePlan_(
      currentRecords, currentRoles, loaded.body, actor, [actor, approver],
      spreadsheet
    );
    storeAssertRestoreFinanceSafety_(spreadsheet, currentRecords, plan.records);
    var baseHash = storeDataFingerprint_(currentRecords, currentRoles);
    var createdAt = storeNowIso_();
    var expiresAt = new Date(Date.now() + RENEWAL_STORE.RESTORE_TOKEN_MINUTES * 60000).toISOString();
    var batchId = "restore_" + storeUuid_();
    var summary = {
      records: plan.recordSummary,
      roles: plan.roleSummary
    };
    var batch = {
      batchId: batchId,
      createdAt: createdAt,
      requestedBy: actor,
      operation: "RESTORE_BACKUP",
      sourceHash: loaded.contentHash,
      baseStoreHash: baseHash,
      tokenHash: storeSha256_(batchId + "|" + loaded.contentHash + "|" + baseHash),
      expiresAt: expiresAt,
      status: "AWAITING_APPROVAL",
      totalCount: plan.recordSummary.total,
      insertCount: plan.recordSummary.insert,
      updateCount: plan.recordSummary.update,
      softDeleteCount: plan.recordSummary.softDelete,
      skipCount: plan.recordSummary.skip,
      errorCount: 0,
      backupId: backupRow.backupId,
      completedAt: "",
      summaryHash: storeSha256_(storeStableStringify_(summary)),
      reasonCode: reasonCode,
      approver: approver
    };
    storeAppendObject_(spreadsheet, "import_batches", batch);
    storeAppendAudit_(spreadsheet, {
      eventState: "COMMITTED",
      entityType: "restore",
      entityKey: batchId,
      action: "RESTORE_DRY_RUN",
      actor: actor,
      reasonCode: reasonCode,
      approver: approver,
      beforeHash: baseHash,
      afterHash: baseHash,
      versionBefore: 0,
      versionAfter: 0,
      correlationId: batchId
    });
    return {
      dryRun: true,
      batchId: batchId,
      requestedBy: actor,
      approver: approver,
      expiresAt: expiresAt,
      summary: summary,
      message: "復元予行だけを行いました。指定した別管理者本人の確認待ちです。データは変更していません。"
    };
  });
}

/** 管理者向け。本人が申請または承認を担当する復元計画だけを返す。 */
function storeListPendingRestores_() {
  var context = storeContext_("restore");
  return storeReadImportBatches_(context.spreadsheet).filter(function (batch) {
    return batch.operation === "RESTORE_BACKUP" &&
      ["AWAITING_APPROVAL", "COMMITTING"].indexOf(batch.status) >= 0 &&
      (batch.requestedBy === context.actor || storeEmail_(batch.approver) === context.actor);
  }).map(function (batch) {
    return {
      batchId: batch.batchId,
      createdAt: String(batch.createdAt || ""),
      requestedBy: batch.requestedBy,
      approver: storeEmail_(batch.approver),
      expiresAt: String(batch.expiresAt || ""),
      status: batch.status,
      backupId: String(batch.backupId || ""),
      reasonCode: String(batch.reasonCode || ""),
      summary: {
        total: Number(batch.totalCount || 0),
        insert: Number(batch.insertCount || 0),
        update: Number(batch.updateCount || 0),
        softDelete: Number(batch.softDeleteCount || 0),
        skip: Number(batch.skipCount || 0)
      },
      canApprove: storeEmail_(batch.approver) === context.actor && batch.requestedBy !== context.actor
    };
  });
}

/** dry-run時の状態・ファイルが一致し、指定された別管理者本人が実行した場合だけ復元する。 */
function storeFindRestoreSafetyBackupEvidence_(spreadsheet, batchId) {
  var batchHash = storeSha256_(String(batchId || ""));
  var audits = storeReadObjects_(spreadsheet, "audit");
  var evidence = null;
  for (var i = audits.length - 1; i >= 0; i -= 1) {
    var row = audits[i];
    if (String(row.entityKeyHash || "") === batchHash &&
        String(row.action || "") === "RESTORE_SAFETY_BACKUP_CREATED" &&
        String(row.eventState || "") === "COMMITTED") {
      evidence = String(row.correlationId || "");
      break;
    }
  }
  if (!evidence) return null;
  return storeReadBackups_(spreadsheet).filter(function (row) {
    return String(row.backupId || "").toUpperCase() === evidence.toUpperCase() &&
      row.status === "COMPLETE" &&
      String(row.kind || "") === "PRE_RESTORE" &&
      String(row.noteCode || "") === "PRE_RESTORE_SAFETY_BACKUP";
  })[0] || null;
}

function storeConfirmRestore_(input) {
  input = input || {};
  if (String(input.confirm || "") !== RENEWAL_STORE.RESTORE_CONFIRM) {
    storeFail_("STORE_RESTORE_CONFIRM_REQUIRED", "復元の明示確認がありません。");
  }
  return storeWithLock_(function () {
    var spreadsheet = storeOpen_();
    var actor = storeActorEmail_();
    storeRequirePermission_(spreadsheet, actor, "restore");
    var batches = storeReadImportBatches_(spreadsheet);
    var batch = storeFindImportBatch_(batches, input.batchId);
    if (!batch || ["AWAITING_APPROVAL", "COMMITTING"].indexOf(batch.status) < 0) {
      storeFail_("STORE_RESTORE_BATCH_INVALID", "有効な復元予行がありません。");
    }
    if (batch.requestedBy === actor) {
      storeFail_("STORE_RESTORE_SELF_APPROVAL_FORBIDDEN", "復元の申請者本人は確定できません。");
    }
    if (storeEmail_(batch.approver) !== actor) {
      storeFail_("STORE_RESTORE_APPROVER_MISMATCH", "復元予行で指定された別管理者本人だけが確定できます。");
    }
    if (String(input.confirmBatchId || "") !== batch.batchId) {
      storeFail_("STORE_RESTORE_BATCH_CONFIRM_MISMATCH", "復元申請IDの再入力が一致しません。");
    }
    if (batch.status !== "COMMITTING" &&
        new Date(batch.expiresAt).getTime() < Date.now()) {
      storeFail_("STORE_RESTORE_TOKEN_EXPIRED", "復元確認の有効時間を過ぎています。");
    }
    var currentRecords = storeReadRecords_(spreadsheet);
    var currentRoles = storeReadRoles_(spreadsheet);
    var currentHash = storeDataFingerprint_(currentRecords, currentRoles);
    var resumeCommitting = false;
    if (batch.status === "COMMITTING") {
      var activeManifest = storeActiveGenerationManifest_(spreadsheet);
      if (activeManifest &&
          String(activeManifest.correlationId || "") === storeAuditToken_(batch.batchId) &&
          String(activeManifest.dataHash || "") === currentHash) {
        storeAppendAudit_(spreadsheet, {
          eventState: "COMMITTED",
          entityType: "restore",
          entityKey: batch.batchId,
          action: "RESTORE_BACKUP_RECOVERED",
          actor: actor,
          reasonCode: batch.reasonCode,
          approver: batch.approver,
          beforeHash: batch.baseStoreHash,
          afterHash: currentHash,
          versionBefore: 0,
          versionAfter: 0,
          correlationId: batch.batchId
        });
        batch.status = "COMPLETE";
        batch.completedAt = storeNowIso_();
        storeWriteObjectAt_(spreadsheet, "import_batches", batch._rowNumber, batch);
        return {
          success: true,
          restored: true,
          recovered: true,
          batchId: batch.batchId,
          safetyBackupId: "",
          summary: {
            records: {
              total: Number(batch.totalCount || 0),
              insert: Number(batch.insertCount || 0),
              update: Number(batch.updateCount || 0),
              softDelete: Number(batch.softDeleteCount || 0),
              skip: Number(batch.skipCount || 0)
            },
            roles: {
              total: Number(activeManifest.roleCount || currentRoles.length),
              recovered: true
            }
          }
        };
      }
      if (currentHash === batch.baseStoreHash) {
        // Execution stopped before the one-cell cutover.  The old generation
        // is still canonical, so the same designated approver may safely
        // re-verify the immutable plan and stage a fresh generation.
        resumeCommitting = true;
      } else {
        storeFail_(
          "STORE_RESTORE_RECOVERY_REQUIRED",
          "A restore stopped while committing and the active generation does not match the old or committed state."
        );
      }
    }
    if (currentHash !== batch.baseStoreHash) {
      storeFail_("STORE_RESTORE_STATE_CHANGED", "予行後に共有正本が更新されたため復元を停止しました。");
    }

    var backupRow = storeFindBackup_(storeReadBackups_(spreadsheet), batch.backupId);
    if (!backupRow) storeFail_("STORE_BACKUP_NOT_FOUND", "登録済みバックアップがありません。");
    var loaded = storeLoadBackup_(backupRow);
    if (loaded.contentHash !== batch.sourceHash) {
      storeFail_("STORE_BACKUP_CHANGED", "予行後にバックアップが変化したため復元を停止しました。");
    }
    var plan = storeBuildRestorePlan_(
      currentRecords,
      currentRoles,
      loaded.body,
      actor,
      [batch.requestedBy, batch.approver],
      spreadsheet
    );
    var confirmedSummary = {
      records: plan.recordSummary,
      roles: plan.roleSummary
    };
    if (storeSha256_(storeStableStringify_(confirmedSummary)) !== batch.summaryHash) {
      storeFail_(
        "STORE_RESTORE_PLAN_CHANGED",
        "予行時と確定時の復元計画が一致しないため停止しました。元バックアップを再検証して再申請してください。"
      );
    }
    storeAssertRestoreFinanceSafety_(spreadsheet, currentRecords, plan.records);
    storeAssertDataGenerationCapacityForCreate_(
      spreadsheet,
      plan.records.length,
      plan.roles.length,
      { auditRows: 5, backupRows: 1, reconcileBackups: true }
    );
    var safetyBackup = resumeCommitting ?
      storeFindRestoreSafetyBackupEvidence_(spreadsheet, batch.batchId) : null;
    if (!safetyBackup) {
      safetyBackup = storeCreateBackupUnlocked_(
        spreadsheet, actor, "PRE_RESTORE", "PRE_RESTORE_SAFETY_BACKUP"
      );
    }
    // Keep the restore source backup ID on the batch.  The safety backup is
    // linked separately so an interrupted response never makes either side
    // of the restore evidence ambiguous.
    storeAppendAudit_(spreadsheet, {
      eventState: "COMMITTED",
      entityType: "restore",
      entityKey: batch.batchId,
      action: "RESTORE_SAFETY_BACKUP_CREATED",
      actor: actor,
      reasonCode: "PRE_RESTORE_SAFETY_BACKUP",
      approver: batch.approver,
      beforeHash: currentHash,
      afterHash: safetyBackup.contentHash || "",
      versionBefore: 0,
      versionAfter: 0,
      correlationId: safetyBackup.backupId
    });
    var afterHash = storeDataFingerprint_(plan.records, plan.roles);
    var correlationId = batch.batchId;
    storeAppendAudit_(spreadsheet, {
      eventState: "PREPARED",
      entityType: "restore",
      entityKey: batch.batchId,
      action: "RESTORE_BACKUP",
      actor: actor,
      reasonCode: batch.reasonCode,
      approver: batch.approver,
      beforeHash: currentHash,
      afterHash: afterHash,
      versionBefore: 0,
      versionAfter: 0,
      correlationId: correlationId
    });

    try {
      batch.status = "COMMITTING";
      storeWriteObjectAt_(spreadsheet, "import_batches", batch._rowNumber, batch);
      SpreadsheetApp.flush();
      storeCommitDataGeneration_(
        spreadsheet,
        plan.records.map(storeRecordToRow_),
        plan.roles.map(storeRoleToRow_),
        actor,
        { correlationId: correlationId }
      );
      storeAppendAudit_(spreadsheet, {
        eventState: "COMMITTED",
        entityType: "restore",
        entityKey: batch.batchId,
        action: "RESTORE_BACKUP",
        actor: actor,
        reasonCode: batch.reasonCode,
        approver: batch.approver,
        beforeHash: currentHash,
        afterHash: afterHash,
        versionBefore: 0,
        versionAfter: 0,
        correlationId: correlationId
      });
      batch.status = "COMPLETE";
      batch.completedAt = storeNowIso_();
      storeWriteObjectAt_(spreadsheet, "import_batches", batch._rowNumber, batch);
      return {
        success: true,
        restored: true,
        batchId: batch.batchId,
        safetyBackupId: safetyBackup.backupId,
        summary: { records: plan.recordSummary, roles: plan.roleSummary }
      };
    } catch (error) {
      var observedAfterError = "";
      try {
        observedAfterError = storeDataFingerprint_(
          storeReadRecords_(spreadsheet),
          storeReadRoles_(spreadsheet)
        );
      } catch (ignoredObserved) {}
      // A post-cutover audit/finalization error must never be reported as if
      // the data were rolled back.  The COMMITTING batch is recoverable with
      // the same approver confirmation.
      if (observedAfterError === afterHash) {
        return {
          success: true,
          restored: true,
          recoveryRequired: true,
          warning: "The restore generation is active, but finalization must be retried.",
          batchId: batch.batchId,
          safetyBackupId: safetyBackup.backupId,
          summary: { records: plan.recordSummary, roles: plan.roleSummary }
        };
      }
      var rollbackError = null;
      try {
        // A failed staged generation never changed the active pointer, so the
        // old generation is already the rollback state.
        SpreadsheetApp.flush();
        var rolledBackHash = storeDataFingerprint_(
          storeReadRecords_(spreadsheet),
          storeReadRoles_(spreadsheet)
        );
        if (rolledBackHash !== currentHash) {
          storeFail_("STORE_RESTORE_ROLLBACK_MISMATCH", "復元失敗後の元データ照合に失敗しました。");
        }
      } catch (rollbackFailure) {
        rollbackError = rollbackFailure;
      }
      batch.status = rollbackError ? "RECOVERY_REQUIRED" : "FAILED_NO_CHANGE";
      batch.completedAt = storeNowIso_();
      batch.errorCount = 1;
      try { storeWriteObjectAt_(spreadsheet, "import_batches", batch._rowNumber, batch); } catch (ignored) {}
      try {
        storeAppendAudit_(spreadsheet, {
          eventState: rollbackError ? "RECOVERY_REQUIRED" : "FAILED_NO_CHANGE",
          entityType: "restore",
          entityKey: batch.batchId,
          action: "RESTORE_BACKUP",
          actor: actor,
          reasonCode: batch.reasonCode,
          approver: batch.approver,
          beforeHash: currentHash,
          afterHash: afterHash,
          versionBefore: 0,
          versionAfter: 0,
          correlationId: correlationId
        });
      } catch (ignoredAudit) {}
      if (rollbackError) {
        storeFail_(
          "STORE_RESTORE_RECOVERY_REQUIRED",
          "復元処理と元データへの復帰の両方に失敗しました。同じ操作を再実行せず、復元前安全バックアップ「" +
            safetyBackup.backupId + "」を使って管理者が隔離復旧してください。原因: " +
            String(error && error.message || error) + " / 復帰失敗: " +
            String(rollbackError && rollbackError.message || rollbackError)
        );
      }
      throw error;
    }
  });
}

/** 指定された承認管理者本人が、復元を行わず申請を却下する。 */
function storeRejectRestore_(input) {
  input = input || {};
  return storeWithLock_(function () {
    var spreadsheet = storeOpen_();
    var actor = storeActorEmail_();
    storeRequirePermission_(spreadsheet, actor, "restore");
    var batch = storeFindImportBatch_(storeReadImportBatches_(spreadsheet), input.batchId);
    if (!batch || batch.operation !== "RESTORE_BACKUP" || batch.status !== "AWAITING_APPROVAL") {
      storeFail_("STORE_RESTORE_BATCH_INVALID", "有効な復元申請がありません。");
    }
    if (batch.requestedBy === actor) {
      storeFail_("STORE_RESTORE_SELF_APPROVAL_FORBIDDEN", "復元の申請者本人は承認処理できません。");
    }
    if (storeEmail_(batch.approver) !== actor) {
      storeFail_("STORE_RESTORE_APPROVER_MISMATCH", "指定された別管理者本人だけが却下できます。");
    }
    var reasonCode = storeReasonCode_(input.reasonCode || "RESTORE_REJECTED");
    batch.status = "REJECTED";
    batch.completedAt = storeNowIso_();
    storeWriteObjectAt_(spreadsheet, "import_batches", batch._rowNumber, batch);
    storeAppendAudit_(spreadsheet, {
      eventState: "COMMITTED",
      entityType: "restore",
      entityKey: batch.batchId,
      action: "RESTORE_REJECT",
      actor: actor,
      reasonCode: reasonCode,
      approver: actor,
      beforeHash: batch.baseStoreHash,
      afterHash: batch.baseStoreHash,
      versionBefore: 0,
      versionAfter: 0,
      correlationId: batch.batchId
    });
    return { success: true, rejected: true, batchId: batch.batchId };
  });
}

/**
 * localStorage から1件ずつ移行する管理者専用upsert。
 * recordId がなければ管理IDで既存行を解決し、無言の重複作成をしない。
 */
/** Commit read-only roster data.  This function never opens or writes a source sheet. */
function storeImportSourceRecords_(batch) {
  batch = batch || {};
  return storeWithLock_(function () {
    var spreadsheet = storeOpen_();
    var actor = storeActorEmail_();
    var role = storeRequirePermission_(spreadsheet, actor, "records.import");
    if (String(batch.actorEmail || "").trim() && storeEmail_(batch.actorEmail) !== actor) {
      storeFail_("STORE_IMPORT_ACTOR_MISMATCH", "Source import actor changed.");
    }
    var rows = Array.isArray(batch.rows) ? batch.rows : [];
    var sourceHash = String(batch.sourceBatchHash || "");
    if (!rows.length || !/^[a-f0-9]{64}$/i.test(sourceHash)) {
      storeFail_("STORE_IMPORT_INVALID", "A verified source preview is required.");
    }
    var current = storeReadRecords_(spreadsheet);
    var plan = storeBuildSourceImportPlan_(current, rows);
    // All rows (including uniqueness) are checked before backup/write.
    plan.forEach(function (item, index) {
      storeAssertUniqueRecordKeys_(
        current.concat(plan.slice(0, index).map(function (x) { return x.proposed; })),
        item.recordId, item.businessKey, item.invoiceNo
      );
    });
    // payload size, next version, row layout and every resulting hash are
    // calculated before the first canonical record write.
    var mutation = storePrepareRecordBatchMutation_(
      spreadsheet, current, plan, actor, "SOURCE_IMPORT", "SOURCE_IMPORT"
    );
    if (!mutation.changes.length) {
      var unchangedHash = storeDataFingerprint_(
        current, storeReadRoles_(spreadsheet)
      );
      storeAppendAudit_(spreadsheet, {
        eventState: "COMMITTED",
        entityType: "source_import",
        entityKey: sourceHash,
        action: "SOURCE_IMPORT_NOOP",
        actor: actor,
        reasonCode: "SOURCE_IMPORT",
        approver: "",
        beforeHash: unchangedHash,
        afterHash: unchangedHash,
        versionBefore: 0,
        versionAfter: 0,
        correlationId: "source_noop_" + sourceHash.slice(0, 48)
      });
      return {
        success: true,
        committed: true,
        noOp: true,
        recoveryRequired: false,
        warning: "",
        sourceWritePolicy: "READ_ONLY_SOURCE",
        backupId: "",
        inserted: 0,
        updated: 0,
        skipped: mutation.skipped,
        total: plan.length
      };
    }
    storeAssertDataGenerationCapacityForCreate_(
      spreadsheet,
      mutation.records.length,
      storeReadRoles_(spreadsheet).length,
      {
        auditRows: 2 * mutation.changes.length + 4,
        backupRows: 1,
        reconcileBackups: true
      }
    );
    var safetyBackup = storeCreateBackupUnlocked_(spreadsheet, actor, "PRE_SOURCE_IMPORT", "PRE_SOURCE_IMPORT_BACKUP");
    var correlationId = "source_" + storeUuid_();
    var applied = storeApplyPreparedRecordBatch_(spreadsheet, mutation, {
      actor: actor,
      reasonCode: "SOURCE_IMPORT",
      entityType: "source_import",
      entityKey: sourceHash,
      action: "SOURCE_IMPORT",
      correlationId: correlationId
    });
    return {
      success: true,
      committed: true,
      recoveryRequired: !!applied.recoveryRequired,
      warning: applied.warning || "",
      sourceWritePolicy: "READ_ONLY_SOURCE",
      backupId: safetyBackup.backupId,
      inserted: mutation.inserted,
      updated: mutation.updated,
      skipped: mutation.skipped,
      total: plan.length
    };
  });
}

function storeBuildSourceImportPlan_(currentRows, sourceRows) {
  var byKey = {}, seen = {};
  currentRows.forEach(function (row) {
    var key = String(row.payload.sourceExternalKey || "");
    if (!key) return;
    if (byKey[key]) storeFail_("STORE_SOURCE_KEY_DUPLICATE", "Stored source key is duplicated.");
    byKey[key] = row;
  });
  var sourceFields = ["personId", "targetName", "email", "fiscalYear", "sessionNo", "renewalListNo", "licenseExpiry", "courseAvailableDate", "courseDeadlineDate", "noticeSixMonthDate", "noticeSixMonthStatus", "noticeThreeMonthDate", "noticeThreeMonthStatus", "noticeLetter1", "noticeLetter2", "courseScheduledDate", "sourceCourseScheduleText", "courseVenue", "renewalListAmount", "renewalListAmountTaxBasis", "renewalListMemo", "referenceSource", "sourceMemo", "sourceExternalKey", "sourceSpreadsheetId", "sourceSheetId", "sourceSheetName", "sourceRowNumber", "sourceImportStatus", "sourceRowHash"];
  return sourceRows.map(function (raw) {
    var source = storeNormalizePayload_(raw);
    var key = storeIdentifier_(source.sourceExternalKey, "sourceExternalKey", true);
    if (seen[key]) storeFail_("STORE_SOURCE_BATCH_DUPLICATE", "Source batch contains a duplicate key.");
    seen[key] = true;
    var current = byKey[key] || null;
    var payload = current ? JSON.parse(storeStableStringify_(current.payload)) : {};
    sourceFields.forEach(function (field) { payload[field] = source[field] === undefined ? "" : source[field]; });
    var recordId = current ? current.recordId : storeRecordId_("", true);
    payload.id = recordId;
    var businessKey = storeManagementId_(payload);
    var invoiceNo = storeInvoiceNo_(payload);
    var hash = storeSha256_(storeStableStringify_(payload));
    return {
      current: current,
      recordId: recordId,
      payload: payload,
      businessKey: businessKey,
      invoiceNo: invoiceNo,
      proposed: { recordId: recordId, managementId: businessKey, invoiceNo: invoiceNo },
      skip: Boolean(current && current.payloadHash === hash)
    };
  });
}

/** Preview → explicit commit migration for browser localStorage records. */
function storePreviewLocalRecordsBatch_(input) {
  input = input || {};
  var context = storeContext_("migrate");
  var records = storeNormalizeLocalBatch_(input.records);
  var operation = storeLocalBatchOperation_(input.operation);
  var expectedRecords = storeNormalizeExpectedRecords_(input.expectedRecords);
  var current = storeReadRecords_(context.spreadsheet);
  var plan = storeValidateLocalBatch_(current, records, {
    operation: operation,
    expectedRecords: expectedRecords,
    spreadsheet: context.spreadsheet
  });
  // Build every resulting row before issuing a preview token.  This catches
  // payload-size and layout errors while the operation is still read-only.
  storePrepareRecordBatchMutation_(
    context.spreadsheet, current, plan, context.actor,
    input.reasonCode || operation,
    operation
  );
  var baseHash = storeDataFingerprint_(current, storeReadRoles_(context.spreadsheet));
  var token = storeUuid_() + ":" + storeUuid_();
  var sourceHash = storeLocalBatchHash_(records, operation, expectedRecords);
  var batch = {
    batchId: (operation === "VALIDATED_CSV_IMPORT" ? "csv_" : "local_") + storeUuid_(),
    createdAt: storeNowIso_(), requestedBy: context.actor, operation: operation,
    sourceHash: sourceHash, baseStoreHash: baseHash, tokenHash: storeSha256_(token),
    expiresAt: new Date(Date.now() + RENEWAL_STORE.IMPORT_TOKEN_MINUTES * 60000).toISOString(), status: "AWAITING_CONFIRMATION",
    totalCount: plan.length, insertCount: plan.filter(function(p){ return !p.current; }).length, updateCount: plan.filter(function(p){ return !!p.current; }).length,
    softDeleteCount: 0, skipCount: plan.filter(function(p){ return p.skip; }).length, errorCount: 0, backupId: "", completedAt: "",
    summaryHash: storeLocalBatchPlanHash_(plan),
    reasonCode: storeReasonCode_(input.reasonCode || "LOCAL_STORAGE_MIGRATION"), approver: ""
  };
  storeAppendObject_(context.spreadsheet, "import_batches", batch);
  storeAppendAudit_(context.spreadsheet, {
    eventState: "COMMITTED", entityType: "migration", entityKey: batch.batchId,
    action: operation === "VALIDATED_CSV_IMPORT" ? "CSV_IMPORT_DRY_RUN" : "LOCAL_MIGRATION_DRY_RUN",
    actor: context.actor, reasonCode: batch.reasonCode, approver: "",
    beforeHash: baseHash, afterHash: baseHash, versionBefore: 0, versionAfter: 0,
    correlationId: batch.batchId
  });
  return {
    dryRun: true, operation: operation, batchId: batch.batchId,
    // UI-facing aliases are kept alongside canonical names to avoid callers
    // inventing a weaker, one-step migration API.
    confirmToken: token, previewToken: token,
    expiresAt: batch.expiresAt, sourceHash: batch.sourceHash,
    total: batch.totalCount, totalCount: batch.totalCount,
    insert: batch.insertCount, insertCount: batch.insertCount,
    update: batch.updateCount, updateCount: batch.updateCount,
    skip: batch.skipCount, skipCount: batch.skipCount
  };
}

function storeCommitLocalRecordsBatch_(input) {
  input = input || {};
  if (String(input.confirm || "") !== RENEWAL_STORE.LOCAL_BATCH_CONFIRM) storeFail_("STORE_MIGRATION_CONFIRM_REQUIRED", "Explicit migration confirmation is required.");
  return storeWithLock_(function () {
    var spreadsheet = storeOpen_(), actor = storeActorEmail_();
    storeRequirePermission_(spreadsheet, actor, "migrate");
    var batch = storeFindImportBatch_(storeReadImportBatches_(spreadsheet), input.batchId);
    if (!batch || ["AWAITING_CONFIRMATION", "COMMITTING"].indexOf(batch.status) < 0 ||
        ["LOCAL_STORAGE_MIGRATION", "VALIDATED_CSV_IMPORT"].indexOf(batch.operation) < 0) {
      storeFail_("STORE_MIGRATION_BATCH_INVALID", "Migration preview is not available.");
    }
    var operation = storeLocalBatchOperation_(input.operation || batch.operation);
    if (operation !== batch.operation) storeFail_("STORE_MIGRATION_OPERATION_CHANGED", "Migration operation changed after preview.");
    var suppliedToken = String(input.confirmToken || input.previewToken || "");
    if (batch.requestedBy !== actor || storeSha256_(suppliedToken) !== batch.tokenHash) {
      storeFail_("STORE_MIGRATION_TOKEN_INVALID", "Migration confirmation token is invalid.");
    }
    var records = storeNormalizeLocalBatch_(input.records);
    var expectedRecords = storeNormalizeExpectedRecords_(input.expectedRecords);
    if (storeLocalBatchHash_(records, operation, expectedRecords) !== batch.sourceHash) {
      storeFail_("STORE_MIGRATION_SOURCE_CHANGED", "Local data changed after preview. Preview again.");
    }
    var current = storeReadRecords_(spreadsheet);
    var roles = storeReadRoles_(spreadsheet);
    var resumeCommitting = false;
    if (batch.status === "COMMITTING") {
      if (storeBatchHasActiveGenerationCutover_(spreadsheet, batch)) {
        return storeFinalizeRecoveredLocalBatch_(
          spreadsheet, batch, actor, current, roles, "BATCH_COMMIT_RECOVERED_GENERATION"
        );
      }
      if (storeBatchDesiredPayloadsPresent_(spreadsheet, current, records)) {
        return storeFinalizeRecoveredLocalBatch_(
          spreadsheet, batch, actor, current, roles, "BATCH_COMMIT_RECOVERED"
        );
      }
      if (storeDataFingerprint_(current, roles) === batch.baseStoreHash) {
        resumeCommitting = true;
      } else {
        storeFail_("STORE_MIGRATION_RECOVERY_REQUIRED", "A previous commit did not reach a verifiable state. Inspect the safety backup before retrying.");
      }
    }
    if (!resumeCommitting && new Date(batch.expiresAt).getTime() < Date.now()) {
      storeFail_("STORE_MIGRATION_TOKEN_INVALID", "Migration confirmation token expired. Preview again.");
    }
    if (storeDataFingerprint_(current, roles) !== batch.baseStoreHash) {
      storeFail_("STORE_MIGRATION_STATE_CHANGED", "Shared store changed after preview. Preview again.");
    }
    var plan = storeValidateLocalBatch_(current, records, {
      operation: operation,
      expectedRecords: expectedRecords,
      spreadsheet: spreadsheet
    });
    if (storeLocalBatchPlanHash_(plan) !== batch.summaryHash) {
      storeFail_(
        "STORE_MIGRATION_PLAN_CHANGED",
        "Migration plan changed after preview. Preview again before committing."
      );
    }
    var mutation = storePrepareRecordBatchMutation_(
      spreadsheet, current, plan, actor, batch.reasonCode, operation
    );
    if (!mutation.changes.length) {
      batch.status = "COMPLETE";
      batch.backupId = "";
      batch.completedAt = storeNowIso_();
      storeWriteObjectAt_(
        spreadsheet, "import_batches", batch._rowNumber, batch
      );
      SpreadsheetApp.flush();
      var noOpHash = storeDataFingerprint_(current, roles);
      storeAppendAudit_(spreadsheet, {
        eventState: "COMMITTED",
        entityType: "migration",
        entityKey: batch.batchId,
        action: operation === "VALIDATED_CSV_IMPORT" ?
          "CSV_IMPORT_NOOP" : "LOCAL_MIGRATION_NOOP",
        actor: actor,
        reasonCode: batch.reasonCode,
        approver: "",
        beforeHash: noOpHash,
        afterHash: noOpHash,
        versionBefore: 0,
        versionAfter: 0,
        correlationId: batch.batchId
      });
      return {
        success: true,
        committed: true,
        noOp: true,
        recoveryRequired: false,
        warning: "",
        backupId: "",
        total: plan.length,
        inserted: 0,
        updated: 0,
        skipped: mutation.skipped
      };
    }
    storeAssertDataGenerationCapacityForCreate_(
      spreadsheet,
      mutation.records.length,
      roles.length,
      {
        auditRows: 2 * mutation.changes.length + 4,
        backupRows: 1,
        reconcileBackups: true
      }
    );
    var safetyBackup = resumeCommitting ?
      storeFindBackup_(storeReadBackups_(spreadsheet), batch.backupId) : null;
    if (!safetyBackup || safetyBackup.status !== "COMPLETE") {
      if (resumeCommitting) {
        storeFail_(
          "STORE_MIGRATION_RECOVERY_REQUIRED",
          "The pre-migration safety backup is unavailable; automatic resume was stopped."
        );
      }
      safetyBackup = storeCreateBackupUnlocked_(
        spreadsheet, actor, "PRE_LOCAL_MIGRATION", "PRE_LOCAL_MIGRATION_BACKUP"
      );
    }
    batch.status = "COMMITTING";
    batch.backupId = safetyBackup.backupId;
    storeWriteObjectAt_(spreadsheet, "import_batches", batch._rowNumber, batch);
    SpreadsheetApp.flush();
    var applied = storeApplyPreparedRecordBatch_(spreadsheet, mutation, {
      actor: actor,
      reasonCode: batch.reasonCode,
      entityType: "migration",
      entityKey: batch.batchId,
      action: operation === "VALIDATED_CSV_IMPORT" ? "CSV_IMPORT_COMMIT" : "LOCAL_MIGRATION_COMMIT",
      correlationId: batch.batchId
    });
    try {
      batch.status = "COMPLETE";
      batch.completedAt = storeNowIso_();
      storeWriteObjectAt_(spreadsheet, "import_batches", batch._rowNumber, batch);
      SpreadsheetApp.flush();
    } catch (finalizeError) {
      applied.recoveryRequired = true;
      applied.warning = "Records were committed, but batch finalization must be retried with the same token.";
    }
    return {
      success: true,
      committed: true,
      recoveryRequired: !!applied.recoveryRequired,
      warning: applied.warning || "",
      backupId: safetyBackup.backupId,
      total: plan.length,
      inserted: mutation.inserted,
      updated: mutation.updated,
      skipped: mutation.skipped
    };
  });
}

function storeImportLocalRecordsBatch_(input) { return storeCommitLocalRecordsBatch_(input); }

/**
 * 同一オリジンの旧ブラウザ保存を、移行完了後に利用者が別操作で削除した証跡を残す。
 * サーバーはブラウザの localStorage を直接検査できないため、これは削除処理そのもの
 * ではなく、完了済み移行batchへ結び付けた管理者の削除確認記録である。
 */
function storeRecordBrowserStoragePurge_(input) {
  input = input || {};
  if (String(input.confirm || "") !== "CONFIRM_BROWSER_STORAGE_PURGED") {
    storeFail_(
      "STORE_BROWSER_PURGE_CONFIRM_REQUIRED",
      "Explicit browser storage purge confirmation is required."
    );
  }
  if (String(input.storageKeySetVersion || "") !==
      RENEWAL_STORE.BROWSER_STORAGE_KEYSET_VERSION) {
    storeFail_(
      "STORE_BROWSER_PURGE_KEYSET_INVALID",
      "The browser storage key-set version is invalid."
    );
  }
  var purgedKeyCount = Number(input.purgedKeyCount);
  if (!isFinite(purgedKeyCount) ||
      Math.floor(purgedKeyCount) !== purgedKeyCount ||
      purgedKeyCount !== RENEWAL_STORE.BROWSER_STORAGE_KEYSET_COUNT) {
    storeFail_(
      "STORE_BROWSER_PURGE_COUNT_INVALID",
      "The browser storage purge count is invalid."
    );
  }
  return storeWithLock_(function () {
    var spreadsheet = storeOpen_();
    var actor = storeActorEmail_();
    storeRequirePermission_(spreadsheet, actor, "migrate");
    var batch = storeFindImportBatch_(
      storeReadImportBatches_(spreadsheet),
      input.batchId
    );
    if (!batch || batch.operation !== "LOCAL_STORAGE_MIGRATION" ||
        batch.status !== "COMPLETE" || batch.requestedBy !== actor) {
      storeFail_(
        "STORE_BROWSER_PURGE_BATCH_INVALID",
        "A completed browser-storage migration by the same administrator is required."
      );
    }
    if (String(input.sourceHash || "") !== String(batch.sourceHash || "")) {
      storeFail_(
        "STORE_BROWSER_PURGE_SOURCE_MISMATCH",
        "The purged browser source does not match the completed migration."
      );
    }
    var matchingAudit = storeReadObjects_(spreadsheet, "audit").filter(function (row) {
      return String(row.eventState || "") === "COMMITTED" &&
        String(row.entityType || "") === "MIGRATION" &&
        String(row.action || "") === "LOCAL_STORAGE_PURGE_ATTESTATION" &&
        String(row.correlationId || "") === storeAuditToken_(batch.batchId);
    });
    if (matchingAudit.length > 1) {
      storeFail_(
        "STORE_BROWSER_PURGE_AUDIT_DUPLICATE",
        "The browser storage purge audit is duplicated."
      );
    }
    if (matchingAudit.length === 1) {
      return {
        success: true,
        recorded: true,
        idempotentReplay: true,
        batchId: batch.batchId,
        purgedKeyCount: purgedKeyCount
      };
    }
    storeAppendAudit_(spreadsheet, {
      eventState: "COMMITTED",
      entityType: "migration",
      entityKey: batch.batchId,
      action: "LOCAL_STORAGE_PURGE_ATTESTATION",
      actor: actor,
      reasonCode: "BROWSER_STORAGE_PURGED",
      approver: "",
      beforeHash: batch.sourceHash,
      afterHash: storeSha256_(
        RENEWAL_STORE.BROWSER_STORAGE_KEYSET_VERSION +
          "|PURGED|" + String(purgedKeyCount)
      ),
      versionBefore: 0,
      versionAfter: 0,
      correlationId: batch.batchId
    });
    return {
      success: true,
      recorded: true,
      idempotentReplay: false,
      batchId: batch.batchId,
      purgedKeyCount: purgedKeyCount
    };
  });
}

function storeBatchHasActiveGenerationCutover_(spreadsheet, batch) {
  var manifest = storeActiveGenerationManifest_(spreadsheet);
  return !!manifest &&
    String(manifest.status || "") === "COMPLETE" &&
    String(manifest.correlationId || "") === storeAuditToken_(batch.batchId);
}

function storeFinalizeRecoveredLocalBatch_(
  spreadsheet, batch, actor, currentRecords, roles, action
) {
  batch.status = "COMPLETE";
  batch.completedAt = storeNowIso_();
  storeWriteObjectAt_(spreadsheet, "import_batches", batch._rowNumber, batch);
  SpreadsheetApp.flush();
  storeAppendAudit_(spreadsheet, {
    eventState: "COMMITTED",
    entityType: "migration",
    entityKey: batch.batchId,
    action: action,
    actor: actor,
    reasonCode: batch.reasonCode,
    approver: "",
    beforeHash: batch.baseStoreHash,
    afterHash: storeDataFingerprint_(currentRecords, roles),
    versionBefore: 0,
    versionAfter: 0,
    correlationId: batch.batchId
  });
  return {
    success: true,
    committed: true,
    recovered: true,
    backupId: batch.backupId,
    total: batch.totalCount,
    inserted: batch.insertCount,
    updated: batch.updateCount,
    skipped: batch.skipCount
  };
}

function storeNormalizeLocalBatch_(records) {
  if (!Array.isArray(records) || !records.length || records.length > 5000) storeFail_("STORE_MIGRATION_BATCH_INVALID", "Migration records must contain 1 to 5000 rows.");
  return records.map(function (record) {
    if (record && (record.archived === true || record.deleted === true)) {
      storeFail_("STORE_MIGRATION_ARCHIVED_UNSUPPORTED", "Archived/deleted rows require an explicit restore workflow and cannot be batch imported.");
    }
    return storeNormalizePayload_(record);
  });
}
function storeLocalBatchHash_(records, operation, expectedRecords) {
  return storeSha256_(storeStableStringify_({
    operation: storeLocalBatchOperation_(operation),
    records: records,
    expectedRecords: storeNormalizeExpectedRecords_(expectedRecords)
  }));
}
function storeLocalBatchPlanHash_(plan) {
  return storeSha256_(storeStableStringify_((plan || []).map(function(p) {
    return [
      p.businessKey,
      p.current ? p.current.version : 0,
      p.current ? p.current.payloadHash : "",
      p.desiredPayloadHash,
      p.skip
    ];
  })));
}
function storeValidateLocalBatch_(currentRows, records, options) {
  options = options || {};
  var operation = storeLocalBatchOperation_(options.operation);
  var expectedById = storeExpectedRecordMap_(options.expectedRecords);
  var seen = {}, plan = records.map(function (payload) {
    var businessKey = storeManagementId_(payload);
    var key = storeUniqueKey_(businessKey);
    if (seen[key]) storeFail_("STORE_MIGRATION_BUSINESS_KEY_DUPLICATE", "Migration batch has duplicate business keys.");
    seen[key] = true;
    var current = storeFindRecordByManagementId_(currentRows, businessKey);
    if (current && current.deleted) storeFail_("STORE_MIGRATION_DELETED", "A matching record is soft deleted; restore it explicitly first.");
    payload = storeNormalizeFormalFinanceMirrorForWrite_(
      options.spreadsheet,
      current ? current.payload : null,
      payload,
      { migration: true, formalFinanceMirror: false }
    );
    businessKey = storeManagementId_(payload);
    var invoiceNo = storeInvoiceNo_(payload);
    var recordId = current ? current.recordId : storeRecordId_(payload.id, true);
    payload.id = recordId;
    var desiredPayloadHash = storeSha256_(storeStableStringify_(payload));
    var skip = Boolean(current && current.payloadHash === desiredPayloadHash);
    if (operation === "LOCAL_STORAGE_MIGRATION" && current && !skip) {
      storeFail_(
        "STORE_MIGRATION_EXISTING_REVIEW_REQUIRED",
        "Local browser data may only insert new rows. Existing rows must be reconciled by version-checked CSV import."
      );
    }
    if (operation === "VALIDATED_CSV_IMPORT") {
      var expected = expectedById[recordId];
      if (!expected) storeFail_("STORE_CSV_EXPECTED_RECORD_REQUIRED", "CSV import requires the displayed record version and hash for every row.");
      if (current) {
        if (expected.expectedVersion !== current.version ||
            expected.expectedPayloadHash !== current.payloadHash) {
          storeFail_("STORE_CSV_STALE_RECORD", "A record changed after the CSV screen was loaded. Reload before importing.");
        }
      } else if (expected.expectedVersion !== 0 || expected.expectedPayloadHash) {
        storeFail_("STORE_CSV_NEW_RECORD_VERSION_INVALID", "A new CSV row must use version 0 without a prior hash.");
      }
    }
    return {
      current: current, recordId: recordId, payload: payload,
      businessKey: businessKey, invoiceNo: invoiceNo,
      desiredPayloadHash: desiredPayloadHash, skip: skip
    };
  });
  plan.forEach(function (item, index) { storeAssertUniqueRecordKeys_(currentRows.concat(plan.slice(0, index).map(function(p){ return { recordId: p.recordId, managementId: p.businessKey, invoiceNo: p.invoiceNo }; })), item.recordId, item.businessKey, item.invoiceNo); });
  return plan;
}

function storeLocalBatchOperation_(value) {
  var operation = String(value || "LOCAL_STORAGE_MIGRATION").trim().toUpperCase();
  if (["LOCAL_STORAGE_MIGRATION", "VALIDATED_CSV_IMPORT"].indexOf(operation) < 0) {
    storeFail_("STORE_MIGRATION_OPERATION_INVALID", "Unsupported migration operation.");
  }
  return operation;
}

function storeNormalizeExpectedRecords_(rows) {
  if (rows === undefined || rows === null || rows === "") return [];
  if (!Array.isArray(rows) || rows.length > 5000) {
    storeFail_("STORE_CSV_EXPECTED_RECORDS_INVALID", "CSV expected-record metadata is invalid.");
  }
  return rows.map(function (row) {
    row = row || {};
    var recordId = storeRecordId_(row.recordId, false);
    if (!recordId) storeFail_("STORE_CSV_EXPECTED_RECORD_ID_REQUIRED", "CSV expected recordId is required.");
    var version = Number(row.expectedVersion);
    if (!Number.isInteger(version) || version < 0) {
      storeFail_("STORE_CSV_EXPECTED_VERSION_INVALID", "CSV expected version is invalid.");
    }
    var hash = String(row.expectedPayloadHash || "").trim().toLowerCase();
    if (hash && !/^[a-f0-9]{64}$/.test(hash)) {
      storeFail_("STORE_CSV_EXPECTED_HASH_INVALID", "CSV expected payload hash is invalid.");
    }
    return {
      recordId: recordId,
      expectedVersion: version,
      expectedPayloadHash: hash
    };
  }).sort(function (a, b) { return a.recordId.localeCompare(b.recordId); });
}

function storeExpectedRecordMap_(rows) {
  var map = {};
  storeNormalizeExpectedRecords_(rows).forEach(function (row) {
    if (map[row.recordId]) storeFail_("STORE_CSV_EXPECTED_RECORD_DUPLICATE", "CSV expected record metadata is duplicated.");
    map[row.recordId] = row;
  });
  return map;
}

/**
 * Convert a fully validated plan into the complete next records table without
 * touching Sheets.  This prevents a late payload-size error from partially
 * applying an earlier row.
 */
function storePrepareRecordBatchMutation_(
  spreadsheet, currentRows, plan, actor, reasonCode, actionPrefix
) {
  var now = storeNowIso_();
  var records = currentRows.map(storeCopyRecordRow_);
  var indexById = {};
  records.forEach(function (row, index) { indexById[row.recordId] = index; });
  var changes = [];
  var inserted = 0;
  var updated = 0;
  var skipped = 0;
  plan.forEach(function (item) {
    var preparedPayload = storeNormalizeFormalFinanceMirrorForWrite_(
      spreadsheet,
      item.current ? item.current.payload : null,
      item.payload,
      { migration: true, formalFinanceMirror: false }
    );
    storeAssertFormalFinanceRecordWrite_(
      spreadsheet,
      item.recordId,
      item.current ? item.current.payload : null,
      preparedPayload,
      { migration: true, formalFinanceMirror: false }
    );
    if (item.skip) {
      skipped += 1;
      return;
    }
    var payload = preparedPayload;
    payload.id = item.recordId;
    var payloadJson = storeStableStringify_(payload);
    if (payloadJson.length > RENEWAL_STORE.MAX_PAYLOAD_CHARS) {
      storeFail_("STORE_PAYLOAD_TOO_LARGE", "対象レコードが保存上限を超えています。");
    }
    var current = item.current || null;
    var next = {
      recordId: item.recordId,
      managementId: item.businessKey,
      invoiceNo: item.invoiceNo,
      version: current ? current.version + 1 : 1,
      deleted: false,
      createdAt: current ? current.createdAt : now,
      updatedAt: now,
      createdBy: current ? current.createdBy : actor,
      updatedBy: actor,
      payloadJson: payloadJson,
      payload: payload,
      payloadHash: storeSha256_(payloadJson)
    };
    if (current) {
      records[indexById[current.recordId]] = next;
      updated += 1;
    } else {
      indexById[next.recordId] = records.length;
      records.push(next);
      inserted += 1;
    }
    changes.push({
      recordId: next.recordId,
      action: String(actionPrefix || "BATCH") + (current ? "_UPDATE" : "_INSERT"),
      beforeHash: current ? current.payloadHash : "",
      afterHash: next.payloadHash,
      versionBefore: current ? current.version : 0,
      versionAfter: next.version
    });
  });
  return {
    records: records,
    changes: changes,
    inserted: inserted,
    updated: updated,
    skipped: skipped,
    reasonCode: storeReasonCode_(reasonCode)
  };
}

/**
 * Write the full next table in one range operation.  If post-write audit
 * finalization fails, return committed+recoveryRequired instead of claiming
 * that no data was saved.
 */
function storeApplyPreparedRecordBatch_(spreadsheet, mutation, event) {
  var roles = storeReadRoles_(spreadsheet);
  var beforeRows = storeReadRecords_(spreadsheet);
  var beforeHash = storeDataFingerprint_(beforeRows, roles);
  var afterHash = storeDataFingerprint_(mutation.records, roles);
  if (!mutation.changes.length) {
    return {
      committed: true,
      noOp: true,
      recoveryRequired: false,
      warning: "",
      beforeHash: beforeHash,
      afterHash: afterHash
    };
  }
  storeAssertDataGenerationCapacityForCreate_(
    spreadsheet,
    mutation.records.length,
    roles.length,
    { auditRows: 2 * (mutation.changes.length + 1), backupRows: 0 }
  );
  var baseEvent = {
    entityType: event.entityType,
    entityKey: event.entityKey,
    action: event.action,
    actor: event.actor,
    reasonCode: event.reasonCode,
    approver: "",
    beforeHash: beforeHash,
    afterHash: afterHash,
    versionBefore: 0,
    versionAfter: 0,
    correlationId: event.correlationId
  };
  // Every PREPARED audit is written before the canonical range.
  mutation.changes.forEach(function (change) {
    storeAppendAudit_(spreadsheet, {
      eventState: "PREPARED",
      entityType: "record",
      entityKey: change.recordId,
      action: change.action,
      actor: event.actor,
      reasonCode: event.reasonCode,
      approver: "",
      beforeHash: change.beforeHash,
      afterHash: change.afterHash,
      versionBefore: change.versionBefore,
      versionAfter: change.versionAfter,
      correlationId: event.correlationId
    });
  });
  storeAppendAudit_(spreadsheet, Object.assign({ eventState: "PREPARED" }, baseEvent));

  try {
    storeCommitDataGeneration_(
      spreadsheet,
      mutation.records.map(storeRecordToRow_),
      roles.map(storeRoleToRow_),
      event.actor,
      { correlationId: event.correlationId }
    );
  } catch (writeError) {
    var observedHash = "";
    try {
      observedHash = storeDataFingerprint_(storeReadRecords_(spreadsheet), roles);
    } catch (ignoredRead) {}
    if (observedHash !== afterHash) {
      if (observedHash && observedHash !== beforeHash) {
        var unknown = new Error("Batch write ended in an unknown state. Inspect the safety backup before any retry.");
        unknown.code = "STORE_BATCH_STATE_UNKNOWN";
        unknown.dataMayHaveChanged = true;
        throw unknown;
      }
      throw writeError;
    }
  }

  var warning = "";
  try {
    mutation.changes.forEach(function (change) {
      storeAppendAudit_(spreadsheet, {
        eventState: "COMMITTED",
        entityType: "record",
        entityKey: change.recordId,
        action: change.action,
        actor: event.actor,
        reasonCode: event.reasonCode,
        approver: "",
        beforeHash: change.beforeHash,
        afterHash: change.afterHash,
        versionBefore: change.versionBefore,
        versionAfter: change.versionAfter,
        correlationId: event.correlationId
      });
    });
    storeAppendAudit_(spreadsheet, Object.assign({ eventState: "COMMITTED" }, baseEvent));
  } catch (auditError) {
    warning = "Canonical records were committed, but the COMMITTED audit marker requires recovery.";
  }
  return {
    committed: true,
    recoveryRequired: !!warning,
    warning: warning,
    beforeHash: beforeHash,
    afterHash: afterHash
  };
}

function storeBatchDesiredPayloadsPresent_(spreadsheet, currentRows, records) {
  return records.every(function (raw) {
    var payload = storeNormalizePayload_(raw);
    var businessKey = storeManagementId_(payload);
    var current = storeFindRecordByManagementId_(currentRows, businessKey);
    if (!current || current.deleted) return false;
    payload = storeNormalizeFormalFinanceMirrorForWrite_(
      spreadsheet,
      current.payload,
      payload,
      { migration: true, formalFinanceMirror: false }
    );
    payload.id = current.recordId;
    return current.payloadHash === storeSha256_(storeStableStringify_(payload));
  });
}

function storeUpsertLocalStorageRecord_(input) {
  input = input || {};
  if (String(input.confirm || "") !== RENEWAL_STORE.LOCAL_MIGRATION_CONFIRM) {
    storeFail_("STORE_MIGRATION_CONFIRM_REQUIRED", "ブラウザデータ移行の明示確認がありません。");
  }
  return storeWithLock_(function () {
    var spreadsheet = storeOpen_();
    var actor = storeActorEmail_();
    var role = storeRequirePermission_(spreadsheet, actor, "migrate");
    var payload = storeNormalizePayload_(input.record);
    var records = storeReadRecords_(spreadsheet);
    var requestedId = storeRecordId_(input.recordId || payload.id, false);
    var managementId = storeManagementId_(payload);
    var byId = requestedId ? storeFindRecordById_(records, requestedId) : null;
    var byManagement = storeFindRecordByManagementId_(records, managementId);
    if (byId && byManagement && byId.recordId !== byManagement.recordId) {
      storeFail_("STORE_MIGRATION_ID_CONFLICT", "管理IDとレコードIDが別の既存行を指すため移行を停止しました。");
    }
    var current = byId || byManagement;
    if (current && current.deleted && input.restoreDeleted !== true) {
      storeFail_("STORE_MIGRATION_DELETED", "削除済み行への移行は明示的な復帰指定が必要です。");
    }
    if (current) {
      payload.id = current.recordId;
      payload = storeNormalizeFormalFinanceMirrorForWrite_(
        spreadsheet,
        current.payload,
        payload,
        { migration: true, formalFinanceMirror: false }
      );
      payload.id = current.recordId;
      var desiredHash = storeSha256_(storeStableStringify_(payload));
      if (desiredHash !== current.payloadHash) {
        storeFail_(
          "STORE_MIGRATION_EXISTING_REVIEW_REQUIRED",
          "Existing canonical rows cannot be overwritten by one-step localStorage migration."
        );
      }
      return storePublicRecord_(current);
    }
    return storeUpsertRecordUnlocked_(spreadsheet, actor, role, {
      record: payload,
      recordId: current ? current.recordId : requestedId,
      expectedVersion: current ? current.version : 0,
      reasonCode: input.reasonCode || "LOCAL_STORAGE_MIGRATION",
      approver: input.approver
    }, {
      migration: true,
      allowDeletedRestore: input.restoreDeleted === true
    });
  });
}

/** 監査ログは管理者だけが読める。ログ本文には対象者データを保存しない。 */
function storeListAudit_(options) {
  options = options || {};
  var context = storeContext_("audit.read");
  var rows = storeReadObjects_(context.spreadsheet, "audit");
  var limit = Math.max(1, Math.min(1000, Number(options.limit || 200)));
  return rows.slice(Math.max(0, rows.length - limit));
}

function storeInitializeSpreadsheet_(spreadsheet, info) {
  var sheets = spreadsheet.getSheets();
  var metaSheet = sheets[0];
  metaSheet.setName("_meta");
  Object.keys(RENEWAL_STORE_SCHEMAS).forEach(function (sheetName) {
    var sheet = sheetName === "_meta" ? metaSheet : spreadsheet.insertSheet(sheetName);
    var headers = RENEWAL_STORE_SCHEMAS[sheetName];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  });

  storeWriteMetaMap_(spreadsheet, {
    storeIdentity: RENEWAL_STORE.IDENTITY,
    schemaVersion: String(RENEWAL_STORE.SCHEMA_VERSION),
    spreadsheetId: spreadsheet.getId(),
    createdAt: info.createdAt,
    createdBy: info.createdBy,
    deploymentMode: String(info.deploymentMode || "LEGACY_UNSPECIFIED"),
    dataFolderId: info.dataFolderId,
    backupFolderId: info.backupFolderId,
    deletionPolicy: "SOFT_DELETE_ONLY",
    auditPolicy: "APPEND_ONLY_NO_PAYLOAD",
    sourceWritePolicy: "DEDICATED_STORE_ONLY",
    activeDataGeneration: RENEWAL_STORE.BASE_DATA_GENERATION
  });
  storeAppendObject_(spreadsheet, "roles", {
    email: info.createdBy,
    role: "admin",
    active: true,
    version: 1,
    createdAt: info.createdAt,
    updatedAt: info.createdAt,
    updatedBy: info.createdBy
  });
  storeAppendAudit_(spreadsheet, {
    eventState: "COMMITTED",
    entityType: "store",
    entityKey: spreadsheet.getId(),
    action: "STORE_SETUP",
    actor: info.createdBy,
    reasonCode: "INITIAL_SETUP",
    approver: "",
    beforeHash: "",
    afterHash: storeSha256_(RENEWAL_STORE.IDENTITY + ":" + spreadsheet.getId()),
    versionBefore: 0,
    versionAfter: RENEWAL_STORE.SCHEMA_VERSION,
    correlationId: "setup_" + storeUuid_()
  });
  SpreadsheetApp.flush();
  // The mutable base tabs have no immutable aggregate manifest. Promote the
  // freshly initialized records/roles immediately into a fully hashed
  // generation so even the first normal record cannot be deleted or replaced
  // without count/hash verification on the next open.
  storeCommitDataGeneration_(
    spreadsheet,
    storeGenerationRows_(spreadsheet.getSheetByName("records"), "records"),
    storeGenerationRows_(spreadsheet.getSheetByName("roles"), "roles"),
    info.createdBy,
    { correlationId: "setup_generation_" + spreadsheet.getId() }
  );
}

function storeOpen_() {
  var properties = PropertiesService.getScriptProperties();
  var spreadsheetId = String(properties.getProperty(RENEWAL_STORE.SPREADSHEET_ID_KEY) || "");
  if (!spreadsheetId) storeFail_("STORE_NOT_CONFIGURED", "専用共有正本が未作成です。");
  storeAssertDedicatedId_(spreadsheetId);
  var spreadsheet;
  try {
    spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  } catch (error) {
    storeFail_("STORE_OPEN_FAILED", "専用共有正本を開けません。権限と設定を確認してください。");
  }
  storeValidateSchema_(spreadsheet);
  var meta = storeReadMetaMap_(spreadsheet);
  if (
    meta.storeIdentity !== RENEWAL_STORE.IDENTITY ||
    meta.spreadsheetId !== spreadsheetId ||
    meta.dataFolderId !== String(properties.getProperty(RENEWAL_STORE.DATA_FOLDER_ID_KEY) || "") ||
    meta.backupFolderId !== String(properties.getProperty(RENEWAL_STORE.BACKUP_FOLDER_ID_KEY) || "")
  ) {
    storeFail_("STORE_IDENTITY_MISMATCH", "共有正本の識別情報が一致しないため処理を停止しました。");
  }
  storeAssertDedicatedResourcesPrivate_(spreadsheetId, meta.dataFolderId, meta.backupFolderId);
  return spreadsheet;
}

function storeValidateSchema_(spreadsheet) {
  Object.keys(RENEWAL_STORE_SCHEMAS).forEach(function (sheetName) {
    if (sheetName === "records" || sheetName === "roles") return;
    var sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) storeFail_("STORE_SCHEMA_MISSING", "共有正本の必須シートがありません。");
    var headers = RENEWAL_STORE_SCHEMAS[sheetName];
    var actual = sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0];
    if (storeStableStringify_(actual) !== storeStableStringify_(headers)) {
      storeFail_("STORE_SCHEMA_HEADER_MISMATCH", "共有正本の列構成が一致しないため処理を停止しました。");
    }
  });
  storeAssertCompleteDataGeneration_(
    spreadsheet,
    storeReadActiveDataGeneration_(spreadsheet),
    true
  );
  var meta = storeReadMetaMap_(spreadsheet);
  if (Number(meta.schemaVersion) !== RENEWAL_STORE.SCHEMA_VERSION) {
    storeFail_("STORE_SCHEMA_VERSION_MISMATCH", "共有正本のスキーマ版が一致しません。");
  }
}

function storeState_(spreadsheet) {
  var meta = storeReadMetaMap_(spreadsheet);
  return {
    configured: true,
    schemaVersion: RENEWAL_STORE.SCHEMA_VERSION,
    spreadsheetId: spreadsheet.getId(),
    spreadsheetUrl: spreadsheet.getUrl(),
    createdAt: meta.createdAt,
    deploymentMode: String(meta.deploymentMode || "LEGACY_UNSPECIFIED"),
    dataGenerationCapacity: storeDataGenerationCapacity_(spreadsheet),
    message: "専用共有正本は設定済みです。"
  };
}

function storeContext_(permission) {
  var spreadsheet = storeOpen_();
  var actor = storeActorEmail_();
  var role = storeRequirePermission_(spreadsheet, actor, permission);
  return { spreadsheet: spreadsheet, actor: actor, role: role };
}

function storeRoleForActor_(spreadsheet, actor) {
  var found = storeFindRoleByEmail_(storeReadRoles_(spreadsheet), actor);
  if (!found || !found.active) {
    storeFail_("STORE_ACCESS_DENIED", "共有正本を利用する権限がありません。");
  }
  // Re-apply the live Workspace/domain policy on every authorization. This
  // blocks an unsafe active role inherited from an older store while still
  // allowing a valid administrator to list and deactivate that row.
  var meta = storeReadMetaMap_(spreadsheet);
  storeAssertRoleDomainPair_(
    meta.createdBy, actor, meta.deploymentMode
  );
  return found.role;
}

function storeRequirePermission_(spreadsheet, actor, permission, knownRole) {
  var role = knownRole || storeRoleForActor_(spreadsheet, actor);
  var allowed = RENEWAL_STORE.PERMISSIONS[role] || [];
  if (allowed.indexOf(permission) < 0) {
    storeFail_("STORE_ACCESS_DENIED", "この操作を行う権限がありません。");
  }
  return role;
}

/** Capability names are the only cross-module authorization surface. */
function storeRequireCapability_(capability) {
  var map = {
    "records.import": ["admin"],
    "artifacts.read": ["admin", "renewal", "accounting", "viewer"],
    "artifacts.write": ["admin", "renewal"],
    "artifacts.billing": ["admin", "accounting"],
    "artifacts.admin": ["admin"],
    "finance.read": ["admin", "accounting"],
    "finance.write": ["admin", "accounting"]
  };
  var allowed = map[String(capability || "")];
  if (!allowed) storeFail_("STORE_CAPABILITY_UNKNOWN", "Unknown capability.");
  var spreadsheet = storeOpen_();
  var actor = storeActorEmail_();
  var role = storeRoleForActor_(spreadsheet, actor);
  if (allowed.indexOf(role) < 0) storeFail_("STORE_ACCESS_DENIED", "Permission denied.");
  return { email: actor, role: role, capability: capability };
}

/**
 * 正式会計に一度でも参照された対象者は、対象者正本から削除扱いにしない。
 * 会計台帳が設定済みなのに検査APIを利用できない場合も安全側で停止する。
 */
function storeCustomerHasFormalFinanceEvidence_(spreadsheet, recordId) {
  return !!storeFormalFinanceCustomerIds_(spreadsheet)[String(recordId || "")];
}

function storeRecordHasLegacyAccountingEvidence_(row) {
  row = row || {};
  var payload = row.payload || {};
  return Boolean(
    row.invoiceNo ||
    String(payload.invoiceStatus || "") === "発行済" ||
    Number(payload.paidAmount || 0) !== 0
  );
}

function storeFormalFinanceCustomerIds_(spreadsheet) {
  if (typeof financeStoreIsConfigured_ !== "function" || !financeStoreIsConfigured_(spreadsheet)) {
    return {};
  }
  if (typeof financeStoreReadLatestSnapshot_ !== "function") {
    storeFail_("STORE_FINANCE_GUARD_UNAVAILABLE", "正式会計の参照検査を実行できないため削除を停止しました。");
  }
  var latest;
  try {
    latest = financeStoreReadLatestSnapshot_(spreadsheet);
  } catch (error) {
    storeFail_("STORE_FINANCE_GUARD_FAILED", "正式会計を検査できないため削除を停止しました。");
  }
  var state = latest && latest.state;
  if (!state) storeFail_("STORE_FINANCE_GUARD_FAILED", "正式会計の状態を確認できないため削除を停止しました。");
  var invoices = Array.isArray(state.invoices) ? state.invoices : [];
  var payments = Array.isArray(state.payments) ? state.payments : [];
  var credits = Array.isArray(state.credit_notes) ? state.credit_notes : [];
  var result = {};
  invoices.concat(payments, credits).forEach(function (row) {
    var customerId = String(row && row.customerId || "");
    if (customerId) result[customerId] = true;
  });
  return result;
}

function storeAssertRestoreFinanceSafety_(spreadsheet, currentRows, nextRows) {
  var currentById = {};
  (currentRows || []).forEach(function (row) { currentById[row.recordId] = row; });
  var nextById = {};
  (nextRows || []).forEach(function (row) { nextById[row.recordId] = row; });
  (nextRows || []).forEach(function (next) {
    var current = currentById[next.recordId] || null;
    storeAssertFormalFinanceRecordWrite_(
      spreadsheet,
      next.recordId,
      current ? current.payload : null,
      next.payload,
      { migration: true, formalFinanceMirror: false }
    );
  });
  var formalCustomerIds = storeFormalFinanceCustomerIds_(spreadsheet);
  (currentRows || []).forEach(function (current) {
    var next = nextById[current.recordId];
    var changed = !next ||
      current.payloadHash !== next.payloadHash ||
      current.deleted !== next.deleted ||
      current.managementId !== next.managementId ||
      current.invoiceNo !== next.invoiceNo;
    if (!changed) return;
    if (storeRecordHasLegacyAccountingEvidence_(current) ||
        (next && storeRecordHasLegacyAccountingEvidence_(next)) ||
        formalCustomerIds[current.recordId]) {
      storeFail_(
        "STORE_RESTORE_FINANCE_CONFLICT",
        "請求・入金・会計履歴がある対象者を変更する復元は実行できません。会計と対象者を照合した承認済み移行手順が必要です。"
      );
    }
  });
  (nextRows || []).forEach(function (next) {
    if (currentById[next.recordId]) return;
    if (storeRecordHasLegacyAccountingEvidence_(next) || formalCustomerIds[next.recordId]) {
      storeFail_(
        "STORE_RESTORE_FINANCE_CONFLICT",
        "会計履歴に関係する対象者の新規復元は実行できません。会計と対象者を照合した承認済み移行手順が必要です。"
      );
    }
  });
}

function storeRequireAdminApprover_(spreadsheet, approverValue) {
  var approver = storeApprover_(approverValue);
  if (!approver) storeFail_("STORE_APPROVER_REQUIRED", "管理者承認者が必要です。");
  var role = storeFindRoleByEmail_(storeReadRoles_(spreadsheet), approver);
  if (!role || !role.active || role.role !== "admin") {
    storeFail_("STORE_APPROVER_INVALID", "有効な管理者承認者ではありません。");
  }
  return approver;
}

function storeUpsertRecordUnlocked_(spreadsheet, actor, role, input, mode) {
  storeAssertOrdinaryOperationHasNoApprover_(input && input.approver);
  var payload = storeNormalizePayload_(input.record || input.payload);
  var recordId = storeRecordId_(input.recordId || payload.id, true);
  payload.id = recordId;
  var rows = storeReadRecords_(spreadsheet);
  var current = storeFindRecordById_(rows, recordId);
  mode = mode || {};
  payload = storeNormalizeFormalFinanceMirrorForWrite_(
    spreadsheet,
    current ? current.payload : null,
    payload,
    mode
  );
  payload.id = recordId;
  var managementId = storeManagementId_(payload);
  var invoiceNo = storeInvoiceNo_(payload);
  var currentVersion = current ? current.version : 0;
  storeAssertExpectedVersion_(input.expectedVersion, currentVersion);
  if (current && current.deleted && !mode.allowDeletedRestore) {
    storeFail_("STORE_RECORD_DELETED", "削除済みレコードは通常更新できません。");
  }

  storeAssertFormalFinanceRecordWrite_(
    spreadsheet,
    recordId,
    current ? current.payload : null,
    payload,
    mode
  );
  storeAssertRecordWritePermission_(spreadsheet, actor, role, current ? current.payload : null, payload, mode.migration);
  storeAssertUniqueRecordKeys_(rows, recordId, managementId, invoiceNo);
  var payloadJson = storeStableStringify_(payload);
  if (payloadJson.length > RENEWAL_STORE.MAX_PAYLOAD_CHARS) {
    storeFail_("STORE_PAYLOAD_TOO_LARGE", "対象レコードが保存上限を超えています。");
  }
  var now = storeNowIso_();
  var next = {
    recordId: recordId,
    managementId: managementId,
    invoiceNo: invoiceNo,
    version: currentVersion + 1,
    deleted: false,
    createdAt: current ? current.createdAt : now,
    updatedAt: now,
    createdBy: current ? current.createdBy : actor,
    updatedBy: actor,
    payloadJson: payloadJson,
    payloadHash: storeSha256_(payloadJson)
  };
  var action = current ? (current.deleted ? "RESTORE_AND_UPDATE" : "RECORD_UPDATE") : "RECORD_INSERT";
  var mutationStatus = storeWriteAuditedRow_(
    spreadsheet, "records",
    current ? current._rowNumber : storeNextRow_(spreadsheet, "records"),
    storeRecordToRow_(next),
    {
      entityType: "record",
      entityKey: recordId,
      action: mode.migration ? "LOCAL_MIGRATION_" + action : action,
      actor: actor,
      reasonCode: storeReasonCode_(input.reasonCode),
      approver: "",
      beforeHash: current ? current.payloadHash : "",
      afterHash: next.payloadHash,
      versionBefore: currentVersion,
      versionAfter: next.version
    }
  );
  storeApplyCanonicalMutationLifecycle_(next, mutationStatus);
  return storeAttachMutationStatus_(storePublicRecord_(next), mutationStatus);
}

/**
 * Once the append-only finance ledger exists, its invoice/payment fields are
 * authoritative.  Ordinary record updates may not create a second mutable
 * accounting truth.  The artifact module may copy a sealed issued invoice
 * into the canonical record only through the internal mode flag and only
 * after the copied values are rechecked against FinanceStore.
 */
function storeNormalizeFormalFinanceMirrorForWrite_(
  spreadsheet, currentPayload, submittedPayload, mode
) {
  var normalized = storeNormalizePayload_(submittedPayload);
  mode = mode || {};
  if (typeof financeStoreIsConfigured_ !== "function" ||
      !financeStoreIsConfigured_(spreadsheet) ||
      mode.formalFinanceMirror === true) return normalized;

  // The append-only finance ledger is authoritative after setup.  Browser and
  // import payloads are untrusted projections: discard every submitted mirror
  // value, then restore exactly the already-canonical mirror (if one exists).
  // This makes ordinary renewal edits safe even when an old UI submits finance
  // defaults, and it prevents omission from erasing a sealed issued invoice.
  RENEWAL_STORE.FORMAL_FINANCE_MIRROR_FIELDS.forEach(function (field) {
    delete normalized[field];
    if (currentPayload &&
        Object.prototype.hasOwnProperty.call(currentPayload, field)) {
      normalized[field] = currentPayload[field];
    }
  });
  return normalized;
}

function storeAssertFormalFinanceRecordWrite_(
  spreadsheet, recordId, before, after, mode
) {
  mode = mode || {};
  if (typeof financeStoreIsConfigured_ !== "function" ||
      !financeStoreIsConfigured_(spreadsheet)) return;
  var changed = RENEWAL_STORE.FORMAL_FINANCE_MIRROR_FIELDS.filter(function (key) {
    return storeFormalFinanceMirrorValue_(before, key) !==
      storeFormalFinanceMirrorValue_(after, key);
  });
  if (!changed.length) return;
  if (mode.formalFinanceMirror !== true || mode.migration === true) {
    storeFail_(
      "STORE_FORMAL_FINANCE_FIELD_FORBIDDEN",
      "正式会計台帳の設定後は、請求・税額・入金項目を対象者レコードから直接変更できません。正式会計操作を使用してください。"
    );
  }
  storeAssertFormalFinanceMirror_(spreadsheet, recordId, after, changed);
}

function storeFormalFinanceMirrorValue_(payload, field) {
  if (!payload || !Object.prototype.hasOwnProperty.call(payload, field) ||
      payload[field] === undefined || payload[field] === null ||
      payload[field] === "") return "";
  return storeStableStringify_(payload[field]);
}

function storeAssertFormalFinanceMirror_(spreadsheet, recordId, payload, changed) {
  if (typeof financeStoreReadLatestSnapshot_ !== "function") {
    storeFail_(
      "STORE_FINANCE_GUARD_UNAVAILABLE",
      "正式会計の発行済請求を検査できないため対象者への反映を停止しました。"
    );
  }
  var latest;
  try {
    latest = financeStoreReadLatestSnapshot_(spreadsheet);
  } catch (error) {
    storeFail_(
      "STORE_FINANCE_GUARD_FAILED",
      "正式会計を検査できないため対象者への反映を停止しました。"
    );
  }
  var state = latest && latest.state;
  var invoiceId = String(payload.financeInvoiceId || "");
  var immutableKey = String(payload.financeInvoiceImmutableKey || "");
  var invoices = state && Array.isArray(state.invoices) ? state.invoices : [];
  var invoice = invoices.filter(function (row) {
    return String(row && row.id || "") === invoiceId;
  })[0];
  if (!invoice || String(invoice.status || "") !== "ISSUED" ||
      String(invoice.customerId || "") !== String(recordId || "") ||
      !immutableKey || String(invoice.immutableKey || "") !== immutableKey) {
    storeFail_(
      "STORE_FORMAL_FINANCE_MIRROR_MISMATCH",
      "対象者へ反映する正式請求のID・対象者・改変防止キーが一致しません。"
    );
  }
  var lines = Array.isArray(state.invoice_lines) ? state.invoice_lines.filter(function (line) {
    return String(line && line.invoiceId || "") === invoiceId;
  }) : [];
  var feeExTax = 0;
  var discountExTax = 0;
  lines.forEach(function (line) {
    if (String(line.lineType || "") === "DISCOUNT") {
      discountExTax += Math.abs(Number(line.amount || 0));
    } else {
      feeExTax += Number(line.amount || 0);
    }
  });
  var groups = Array.isArray(invoice.taxGroups) ? invoice.taxGroups : [];
  var group = groups.length === 1 ? groups[0] : null;
  var taxRate = group && Number(group.rateBps) === 1000 ? "10" :
    (group && Number(group.rateBps) === 800 ? "8" : "");
  var rounding = { FLOOR: "切捨て", CEIL: "切上げ", HALF_UP: "四捨五入" }[
    String(invoice.taxRounding || "")
  ] || "";
  var expected = {
    feeExTax: String(feeExTax),
    discountExTax: String(discountExTax),
    taxRate: taxRate,
    taxRounding: rounding,
    taxExceptionApprovalDate: "",
    taxExceptionApprovedBy: "",
    taxExceptionReason: "",
    invoiceNo: String(invoice.invoiceNo || ""),
    invoiceStatus: "発行済",
    accountingDate: String(invoice.accountingDate || ""),
    invoiceDate: String(invoice.invoiceDate || ""),
    paymentDueDate: String(invoice.dueDate || ""),
    paidAmount: String((payload && payload.paidAmount) || "0"),
    paymentDate: String((payload && payload.paymentDate) || ""),
    paymentMethod: String((payload && payload.paymentMethod) || ""),
    financeInvoiceId: invoiceId,
    financeInvoiceImmutableKey: immutableKey
  };
  var allowedMirrorChanges = {
    feeExTax: true, discountExTax: true, taxRate: true, taxRounding: true,
    invoiceNo: true, invoiceStatus: true, accountingDate: true,
    invoiceDate: true, paymentDueDate: true,
    financeInvoiceId: true, financeInvoiceImmutableKey: true
  };
  changed.forEach(function (field) {
    if (!allowedMirrorChanges[field] ||
        String(payload[field] === undefined ? "" : payload[field]) !== expected[field]) {
      storeFail_(
        "STORE_FORMAL_FINANCE_MIRROR_MISMATCH",
        "正式請求と一致しない会計項目を対象者へ反映できません: " + field
      );
    }
  });
}

function storeAssertRecordWritePermission_(spreadsheet, actor, role, before, after, migration) {
  if (migration) {
    storeRequirePermission_(spreadsheet, actor, "migrate", role);
    return;
  }
  if (role === "admin") return;
  var accountingAfter = before ? after :
    Object.assign({}, RENEWAL_STORE.ACCOUNTING_DEFAULTS, after);
  var accountingChanges = storeChangedFields_(
    before || RENEWAL_STORE.ACCOUNTING_DEFAULTS,
    accountingAfter
  )
    .filter(function (key) { return RENEWAL_STORE.ACCOUNTING_FIELDS.indexOf(key) >= 0; });
  var generalChanges = storeChangedFields_(before || {}, after)
    .filter(function (key) {
      return key !== "id" && RENEWAL_STORE.ACCOUNTING_FIELDS.indexOf(key) < 0;
    });
  if (role === "renewal") {
    storeRequirePermission_(spreadsheet, actor, "record.write", role);
    if (accountingChanges.length) {
      storeFail_("STORE_ACCOUNTING_ROLE_REQUIRED", "経理項目は経理担当者または管理者だけが変更できます。");
    }
    return;
  }
  if (role === "accounting") {
    storeRequirePermission_(spreadsheet, actor, "accounting.write", role);
    if (generalChanges.length) {
      storeFail_("STORE_RENEWAL_ROLE_REQUIRED", "対象者・講習項目は更新担当者または管理者だけが変更できます。");
    }
    return;
  }
  storeFail_("STORE_ACCESS_DENIED", "この操作を行う権限がありません。");
}

function storeChangedFields_(before, after) {
  var keys = {};
  Object.keys(before || {}).forEach(function (key) { keys[key] = true; });
  Object.keys(after || {}).forEach(function (key) { keys[key] = true; });
  return Object.keys(keys).filter(function (key) {
    return storeStableStringify_((before || {})[key]) !== storeStableStringify_((after || {})[key]);
  });
}

function storeAssertUniqueRecordKeys_(rows, recordId, managementId, invoiceNo) {
  var managementKey = storeUniqueKey_(managementId);
  var invoiceKey = storeUniqueKey_(invoiceNo);
  rows.forEach(function (row) {
    if (row.recordId === recordId) return;
    if (managementKey && storeUniqueKey_(row.managementId) === managementKey) {
      storeFail_("STORE_MANAGEMENT_ID_DUPLICATE", "管理IDが既に共有正本へ登録されています。");
    }
    if (invoiceKey && storeUniqueKey_(row.invoiceNo) === invoiceKey) {
      storeFail_("STORE_INVOICE_NO_DUPLICATE", "請求書番号が既に共有正本へ登録されています。");
    }
  });
}

function storeCreateBackupUnlocked_(spreadsheet, actor, kind, noteCode, options) {
  options = options || {};
  var meta = storeReadMetaMap_(spreadsheet);
  var folder;
  try {
    folder = DriveApp.getFolderById(meta.backupFolderId);
  } catch (error) {
    storeFail_("STORE_BACKUP_FOLDER_OPEN_FAILED", "Dedicated backup folder cannot be opened.");
  }
  var recovered = storeReconcilePreparedBackups_(
    spreadsheet, folder, actor, options.backupId
  );
  if (recovered) {
    var recoveredResult = storeBackupResultFromRow_(
      recovered, folder, true
    );
    storeClearCompletedBackupDriveAttempt_(folder, recovered);
    return recoveredResult;
  }

  var records = storeReadRecords_(spreadsheet);
  var roles = storeReadRoles_(spreadsheet);
  var backupId = options.backupId ?
    String(options.backupId || "") : "backup_" + storeUuid_();
  if (!/^backup_[A-Za-z0-9-]{1,80}$/.test(backupId) ||
      storeFindBackup_(storeReadBackups_(spreadsheet), backupId)) {
    storeFail_("STORE_BACKUP_ID_INVALID", "Backup id is invalid or already registered.");
  }
  var body = {
    format: RENEWAL_STORE.BACKUP_FORMAT,
    formatVersion: RENEWAL_STORE.BACKUP_FORMAT_VERSION,
    schemaVersion: RENEWAL_STORE.SCHEMA_VERSION,
    createdAt: storeNowIso_(),
    sourceStoreIdentityHash: storeSha256_(RENEWAL_STORE.IDENTITY + ":" + spreadsheet.getId()),
    records: records.map(function (row) {
      return {
        recordId: row.recordId,
        managementId: row.managementId,
        invoiceNo: row.invoiceNo,
        version: row.version,
        deleted: row.deleted,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        createdBy: row.createdBy,
        updatedBy: row.updatedBy,
        payload: row.payload,
        payloadHash: row.payloadHash
      };
    }),
    roles: roles.map(function (row) {
      return {
        email: row.email,
        role: row.role,
        active: row.active,
        version: row.version,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        updatedBy: row.updatedBy
      };
    }),
    // Disaster-recovery evidence only. Restore never overwrites the live audit
    // sheet; the restore action is appended to the current audit history.
    audit: storeReadObjects_(spreadsheet, "audit").map(function (row) {
      var copy = {};
      RENEWAL_STORE_SCHEMAS.audit.forEach(function (header) {
        copy[header] = row[header] === undefined ? "" : row[header];
      });
      return copy;
    })
  };
  // Include the full append-only finance history when that ledger has been
  // initialized.  Restore intentionally does not replay it: finance is never
  // overwritten by a records/roles restore.
  if (typeof financeStoreIsConfigured_ === "function" && financeStoreIsConfigured_(spreadsheet)) {
    var financeMeta = financeStoreReadMeta_(spreadsheet);
    body.finance = financeStoreBackupBody_(spreadsheet, {
      backupId: backupId, createdAt: body.createdAt, createdBy: actor,
      revision: Number(financeMeta.currentRevision), stateHash: String(financeMeta.currentStateHash || "")
    });
  }
  var contentHash = storeSha256_(storeStableStringify_(body));
  var wrapper = { contentHash: contentHash, body: body };
  var correlationId = backupId;
  var backupRow = {
    backupId: backupId,
    createdAt: body.createdAt,
    createdBy: actor,
    kind: kind,
    recordCount: records.length,
    activeCount: records.filter(function (row) { return !row.deleted; }).length,
    roleCount: roles.length,
    contentHash: contentHash,
    driveFileId: "",
    status: "PREPARED",
    noteCode: noteCode,
    schemaVersion: RENEWAL_STORE.SCHEMA_VERSION
  };
  backupRow._rowNumber = storeAppendObject_(spreadsheet, "backups", backupRow);
  SpreadsheetApp.flush();
  storeAppendAudit_(spreadsheet, {
    eventState: "PREPARED",
    entityType: "backup",
    entityKey: backupId,
    action: "BACKUP_CREATE",
    actor: actor,
    reasonCode: noteCode,
    approver: "",
    beforeHash: storeDataFingerprint_(records, roles),
    afterHash: contentHash,
    versionBefore: 0,
    versionAfter: 0,
    correlationId: correlationId
  });
  var meta = storeReadMetaMap_(spreadsheet);
  var folder;
  try {
    folder = DriveApp.getFolderById(meta.backupFolderId);
  } catch (error) {
    storeFail_("STORE_BACKUP_FOLDER_OPEN_FAILED", "管理者用バックアップフォルダを開けません。");
  }
  var fileName = storeBackupFileName_(backupRow);
  var blob = Utilities.newBlob(
    storeStableStringify_(wrapper),
    "application/json",
    fileName
  );
  // Parent, MIME type and private default are fixed in the create request.
  // A lost Drive response leaves the PREPARED row intact so the exact
  // parent/name/hash recovery below can adopt the committed file on retry.
  var file = storeCreatePrivateDriveItemInParent_({
    name: fileName,
    mimeType: "application/json",
    parentId: folder.getId(),
    blob: blob,
    label: "store backup",
    scope: "BACKUP"
  });
  backupRow.driveFileId = file.getId();
  backupRow.status = "COMPLETE";
  storeWriteObjectAt_(spreadsheet, "backups", backupRow._rowNumber, backupRow);
  SpreadsheetApp.flush();
  storeAppendAudit_(spreadsheet, {
    eventState: "COMMITTED",
    entityType: "backup",
    entityKey: backupId,
    action: "BACKUP_CREATE",
    actor: actor,
    reasonCode: noteCode,
    approver: "",
    beforeHash: storeDataFingerprint_(records, roles),
    afterHash: contentHash,
    versionBefore: 0,
    versionAfter: 0,
    correlationId: correlationId
  });
  var result = storeBackupResultFromRow_(backupRow, folder, false);
  storeClearCompletedBackupDriveAttempt_(folder, backupRow);
  return result;
}

function storeBackupFileName_(backupRow) {
  return "renewal_store_" +
    String(backupRow.createdAt || "").replace(/[-:TZ.]/g, "").slice(0, 14) +
    "_" + String(backupRow.backupId || "") + ".json";
}

function storeBackupDriveOperation_(folder, backupRow) {
  return storeDriveCreateOperation_({
    scope: "BACKUP",
    name: storeBackupFileName_(backupRow),
    mimeType: "application/json",
    parentId: folder.getId(),
    label: "store backup"
  });
}

function storeClearCompletedBackupDriveAttempt_(folder, backupRow) {
  if (!backupRow || String(backupRow.status || "") !== "COMPLETE" ||
      !String(backupRow.driveFileId || "")) {
    storeFail_(
      "STORE_BACKUP_DRIVE_ATTEMPT_NOT_DURABLE",
      "Backup Drive attempt cannot be cleared before the COMPLETE registry identity is durable."
    );
  }
  var operation = storeBackupDriveOperation_(folder, backupRow);
  var failureKey = storeDriveFailureKey_(operation);
  var tracked = storeReadDriveFailure_(failureKey);
  if (!tracked) return true;
  var matches = [
    "scope", "action", "name", "mimeType", "parentId", "label"
  ].every(function (field) {
    return String(tracked[field] || "") === String(operation[field] || "");
  });
  if (!matches ||
      (String(tracked.resourceId || "") &&
       String(tracked.resourceId) !== String(backupRow.driveFileId))) {
    storeFail_(
      "STORE_BACKUP_DRIVE_ATTEMPT_MISMATCH",
      "Backup Drive attempt evidence does not match the completed backup."
    );
  }
  storeClearDriveFailure_(failureKey);
  return true;
}

function storeBackupResultFromRow_(backupRow, folder, recovered) {
  var file;
  try {
    file = DriveApp.getFileById(backupRow.driveFileId);
    storeAssertBackupFileInFolder_(file, folder.getId());
    storeSecureBackupFile_(file, "store backup");
  } catch (error) {
    if (error && error.code) throw error;
    storeFail_("STORE_BACKUP_FILE_OPEN_FAILED", "Registered backup file cannot be opened.");
  }
  return {
    success: true,
    backupId: backupRow.backupId,
    fileId: backupRow.driveFileId,
    fileUrl: file.getUrl(),
    contentHash: backupRow.contentHash,
    recordCount: Number(backupRow.recordCount || 0),
    recovered: recovered === true
  };
}

/**
 * The registry intent is durable before Drive receives PII.  If execution
 * stopped after createFile, register that one exact private-folder file on the
 * next backup call instead of creating an untracked duplicate.
 */
function storeReconcilePreparedBackups_(spreadsheet, folder, actor, requestedBackupId) {
  if (!folder || typeof folder.getFilesByName !== "function") {
    storeFail_("STORE_BACKUP_RECOVERY_UNAVAILABLE", "Backup folder recovery listing is unavailable.");
  }
  var requestedRecovery = null;
  var rows = storeReadBackups_(spreadsheet).sort(function (a, b) {
    return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
  });

  // COMPLETE is not sufficient evidence by itself: a hard stop immediately
  // after the registry flush can leave the matching COMMITTED audit absent.
  rows.filter(function (row) {
    return row.status === "COMPLETE";
  }).forEach(function (row) {
    var auditCounts = storeBackupAuditCounts_(spreadsheet, row.backupId);
    if (auditCounts.committed === 0) {
      var completeFile;
      try {
        completeFile = DriveApp.getFileById(row.driveFileId);
        storeAssertBackupFileInFolder_(completeFile, folder.getId());
        storeSecureBackupFile_(completeFile, "store backup");
        storeLoadBackup_(row);
      } catch (error) {
        if (error && error.code) throw error;
        storeFail_(
          "STORE_BACKUP_RECOVERY_HASH_MISMATCH",
          "A COMPLETE backup without audit proof could not be verified."
        );
      }
      storeAppendBackupCommittedAudit_(spreadsheet, row, actor);
    }
    if (String(row.backupId || "") === String(requestedBackupId || "")) {
      requestedRecovery = row;
    }
  });

  rows.filter(function (row) {
    return row.status === "PREPARED";
  }).forEach(function (row) {
    var auditCounts = storeBackupAuditCounts_(spreadsheet, row.backupId);
    var iterator = folder.getFilesByName(storeBackupFileName_(row));
    var candidates = [];
    while (iterator && iterator.hasNext && iterator.hasNext()) {
      candidates.push(iterator.next());
    }
    if (!candidates.length) {
      var missingFileFailureKey = storeDriveFailureKey_({
        scope: "BACKUP",
        action: "CREATE",
        name: storeBackupFileName_(row),
        mimeType: "application/json",
        parentId: folder.getId(),
        label: "store backup"
      });
      var missingFileTracking = storeReadDriveFailure_(
        missingFileFailureKey
      );
      if (missingFileTracking) {
        storeFail_(
          "STORE_BACKUP_RECOVERY_FILE_VISIBILITY_UNCERTAIN",
          "The prepared backup has no visible file, but its Drive create attempt is tracked as " +
          String(missingFileTracking.state || "UNKNOWN") +
          ". Search propagation or a lost response is possible; the PREPARED row and tracking were retained for manual confirmation."
        );
      }
      // No create-attempt evidence means execution stopped before Drive was
      // called (or a verified cleanup already removed an unsafe new file).
      // Only that case may be closed as FAILED_NO_FILE and allow a new backup.
      row.status = "FAILED_NO_FILE";
      storeWriteObjectAt_(spreadsheet, "backups", row._rowNumber, row);
      storeAppendAudit_(spreadsheet, {
        eventState: "ABORTED",
        entityType: "backup",
        entityKey: row.backupId,
        action: "BACKUP_CREATE_NO_FILE",
        actor: actor,
        reasonCode: row.noteCode,
        approver: "",
        beforeHash: "",
        afterHash: row.contentHash,
        versionBefore: 0,
        versionAfter: 0,
        correlationId: row.backupId
      });
      return;
    }
    if (candidates.length !== 1) {
      storeFail_(
        "STORE_BACKUP_RECOVERY_AMBIGUOUS",
        "More than one file has the prepared backup name; automatic recovery stopped."
      );
    }
    var file = candidates[0];
    storeSecureBackupFile_(file, "store backup");
    var parsed;
    try {
      parsed = JSON.parse(file.getBlob().getDataAsString("UTF-8"));
    } catch (error) {
      storeFail_(
        "STORE_BACKUP_RECOVERY_HASH_MISMATCH",
        "The prepared backup file is not valid registered backup JSON."
      );
    }
    var actualHash = parsed && parsed.body ?
      storeSha256_(storeStableStringify_(parsed.body)) : "";
    if (!parsed || actualHash !== String(parsed.contentHash || "") ||
        actualHash !== String(row.contentHash || "")) {
      storeFail_(
        "STORE_BACKUP_RECOVERY_HASH_MISMATCH",
        "The prepared backup file does not match the registered content hash."
      );
    }
    storeValidateBackupBody_(parsed.body);
    row.driveFileId = file.getId();
    row.status = "COMPLETE";
    storeWriteObjectAt_(spreadsheet, "backups", row._rowNumber, row);
    SpreadsheetApp.flush();
    if (auditCounts.committed === 0) {
      storeAppendBackupCommittedAudit_(spreadsheet, row, actor);
    }
    if (String(row.backupId || "") === String(requestedBackupId || "")) {
      requestedRecovery = row;
    }
  });
  return requestedRecovery;
}

function storeBackupAuditCounts_(spreadsheet, backupId) {
  var entityKeyHash = storeSha256_(String(backupId || ""));
  var counts = { prepared: 0, committed: 0 };
  storeReadObjects_(spreadsheet, "audit").forEach(function (row) {
    if (String(row.entityKeyHash || "") !== entityKeyHash ||
        String(row.entityType || "") !== "BACKUP" ||
        String(row.action || "") !== "BACKUP_CREATE" ||
        String(row.correlationId || "") !== storeAuditToken_(backupId)) return;
    if (String(row.eventState || "") === "PREPARED") counts.prepared += 1;
    if (String(row.eventState || "") === "COMMITTED") counts.committed += 1;
  });
  if (counts.prepared > 1 || counts.committed > 1) {
    storeFail_(
      "STORE_BACKUP_AUDIT_DUPLICATE",
      "Backup audit markers are duplicated; automatic recovery stopped."
    );
  }
  return counts;
}

function storeAppendBackupCommittedAudit_(spreadsheet, row, actor) {
  storeAppendAudit_(spreadsheet, {
    eventState: "COMMITTED",
    entityType: "backup",
    entityKey: row.backupId,
    action: "BACKUP_CREATE",
    actor: actor,
    reasonCode: row.noteCode,
    approver: "",
    beforeHash: "",
    afterHash: row.contentHash,
    versionBefore: 0,
    versionAfter: 0,
    correlationId: row.backupId
  });
}

function storeLoadBackup_(backupRow) {
  var text;
  try {
    var file = DriveApp.getFileById(backupRow.driveFileId);
    if (typeof file.getId === "function" &&
        String(file.getId()) !== String(backupRow.driveFileId || "")) {
      storeFail_("STORE_BACKUP_FILE_ID_MISMATCH", "Registered backup file ID changed.");
    }
    storeSecureBackupFile_(file, "store backup");
    text = file.getBlob().getDataAsString("UTF-8");
  } catch (error) {
    if (error && error.code) throw error;
    storeFail_("STORE_BACKUP_FILE_OPEN_FAILED", "バックアップファイルを開けません。");
  }
  var parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    storeFail_("STORE_BACKUP_JSON_INVALID", "バックアップJSONが壊れています。");
  }
  if (!parsed || !parsed.body || !parsed.contentHash) {
    storeFail_("STORE_BACKUP_FORMAT_INVALID", "バックアップ形式が正しくありません。");
  }
  var actualHash = storeSha256_(storeStableStringify_(parsed.body));
  if (actualHash !== parsed.contentHash || actualHash !== backupRow.contentHash) {
    storeFail_("STORE_BACKUP_HASH_MISMATCH", "バックアップの整合性検査に失敗しました。");
  }
  storeValidateBackupBody_(parsed.body);
  return { contentHash: actualHash, body: parsed.body };
}

function storeValidateBackupBody_(body) {
  if (
    body.format !== RENEWAL_STORE.BACKUP_FORMAT ||
    Number(body.formatVersion) !== RENEWAL_STORE.BACKUP_FORMAT_VERSION ||
    Number(body.schemaVersion) !== RENEWAL_STORE.SCHEMA_VERSION ||
    !Array.isArray(body.records) ||
    !Array.isArray(body.roles)
  ) {
    storeFail_("STORE_BACKUP_SCHEMA_MISMATCH", "バックアップの版または構造が一致しません。");
  }
  var normalizedRecords = body.records.map(storeNormalizeBackupRecord_);
  normalizedRecords.forEach(function (row, index) {
    storeAssertUniqueRecordKeys_(normalizedRecords.slice(0, index), row.recordId, row.managementId, row.invoiceNo);
  });
  var seenEmails = {};
  var activeAdmin = false;
  body.roles.forEach(function (role) {
    var email = storeEmail_(role.email);
    if (seenEmails[email]) storeFail_("STORE_BACKUP_ROLE_DUPLICATE", "バックアップ内の利用者が重複しています。");
    seenEmails[email] = true;
    var roleName = String(role.role || "").toLowerCase();
    if (RENEWAL_STORE.ROLES.indexOf(roleName) < 0) {
      storeFail_("STORE_BACKUP_ROLE_INVALID", "バックアップ内の利用者ロールが不正です。");
    }
    if (storeBoolean_(role.active) && roleName === "admin") activeAdmin = true;
  });
  if (!activeAdmin) storeFail_("STORE_BACKUP_ADMIN_MISSING", "バックアップに有効な管理者がいません。");
  if (body.audit !== undefined) storeValidateBackupAudit_(body.audit);
  storeAssertBackupFinance_(body);
}

function storeValidateBackupAudit_(rows) {
  if (!Array.isArray(rows)) {
    storeFail_("STORE_BACKUP_AUDIT_INVALID", "バックアップ内の監査ログ形式が不正です。");
  }
  var seen = {};
  rows.forEach(function (row) {
    var auditId = String(row.auditId || "");
    if (!auditId || seen[auditId]) {
      storeFail_("STORE_BACKUP_AUDIT_INVALID", "バックアップ内の監査IDが欠落または重複しています。");
    }
    seen[auditId] = true;
    if (isNaN(new Date(String(row.timestamp || "")).getTime()) ||
        Number(row.schemaVersion) !== RENEWAL_STORE.SCHEMA_VERSION ||
        !/^[0-9a-f]{64}$/i.test(String(row.entityKeyHash || "")) ||
        (String(row.beforeHash || "") && !/^[0-9a-f]{64}$/i.test(String(row.beforeHash))) ||
        (String(row.afterHash || "") && !/^[0-9a-f]{64}$/i.test(String(row.afterHash))) ||
        !Number.isInteger(Number(row.versionBefore)) ||
        !Number.isInteger(Number(row.versionAfter))) {
      storeFail_("STORE_BACKUP_AUDIT_INVALID", "バックアップ内の監査ログ整合性に問題があります。");
    }
    storeAuditToken_(row.eventState);
    storeAuditToken_(row.entityType);
    storeAuditToken_(row.action);
    storeEmail_(row.actor);
    storeReasonCode_(row.reasonCode);
    if (String(row.approver || "")) storeEmail_(row.approver);
    storeAuditToken_(row.correlationId);
  });
}

// Keep finance validation separate so DataStore remains usable before the
// optional FinanceStore module is installed.
function storeAssertBackupFinance_(body) {
  if (body.finance === undefined) return;
  if (typeof financeStoreValidateBackupBody_ !== "function") {
    storeFail_("STORE_BACKUP_FINANCE_VALIDATOR_MISSING", "Finance backup validator is unavailable.");
  }
  financeStoreValidateBackupBody_(body.finance);
}

function storeNormalizeBackupRecord_(row) {
  var payload = storeNormalizePayload_(row.payload);
  var recordId = storeRecordId_(row.recordId, false);
  if (!recordId) storeFail_("STORE_BACKUP_RECORD_ID_INVALID", "バックアップ内のレコードIDが不正です。");
  var managementId = storeManagementId_(payload);
  var invoiceNo = storeInvoiceNo_(payload);
  var payloadJson = storeStableStringify_(payload);
  var payloadHash = storeSha256_(payloadJson);
  if (
    managementId !== storeIdentifier_(row.managementId, "管理ID", true) ||
    invoiceNo !== storeIdentifier_(row.invoiceNo, "請求書番号", false) ||
    payloadHash !== String(row.payloadHash || "")
  ) {
    storeFail_("STORE_BACKUP_RECORD_HASH_INVALID", "バックアップ内のレコード整合性検査に失敗しました。");
  }
  return {
    recordId: recordId,
    managementId: managementId,
    invoiceNo: invoiceNo,
    version: storePositiveInteger_(row.version),
    deleted: storeBoolean_(row.deleted),
    createdAt: String(row.createdAt || ""),
    updatedAt: String(row.updatedAt || ""),
    createdBy: storeEmail_(row.createdBy),
    updatedBy: storeEmail_(row.updatedBy),
    payloadJson: payloadJson,
    payload: payload,
    payloadHash: payloadHash
  };
}

function storeBuildRestorePlan_(
  currentRecords, currentRoles, body, actor, protectedAdmins, spreadsheet
) {
  var now = storeNowIso_();
  var protectedAdminMap = {};
  (protectedAdmins || [actor]).forEach(function (email) {
    protectedAdminMap[storeEmail_(email)] = true;
  });
  var backupRecords = body.records.map(storeNormalizeBackupRecord_);
  var backupById = {};
  backupRecords.forEach(function (row) { backupById[row.recordId] = row; });
  var currentById = {};
  currentRecords.forEach(function (row) { currentById[row.recordId] = row; });
  var records = [];
  var recordSummary = { total: 0, insert: 0, update: 0, softDelete: 0, skip: 0 };

  currentRecords.forEach(function (current) {
    var backup = backupById[current.recordId];
    if (!backup) {
      var absent = storeCopyRecordRow_(current);
      if (!absent.deleted) {
        absent.deleted = true;
        absent.version = current.version + 1;
        absent.updatedAt = now;
        absent.updatedBy = actor;
        recordSummary.softDelete += 1;
      } else {
        recordSummary.skip += 1;
      }
      records.push(absent);
      return;
    }
    var same = (
      current.payloadHash === backup.payloadHash &&
      current.deleted === backup.deleted &&
      current.managementId === backup.managementId &&
      current.invoiceNo === backup.invoiceNo
    );
    if (same) {
      records.push(storeCopyRecordRow_(current));
      recordSummary.skip += 1;
    } else {
      records.push({
        recordId: current.recordId,
        managementId: backup.managementId,
        invoiceNo: backup.invoiceNo,
        version: current.version + 1,
        deleted: backup.deleted,
        createdAt: current.createdAt,
        updatedAt: now,
        createdBy: current.createdBy,
        updatedBy: actor,
        payloadJson: backup.payloadJson,
        payload: backup.payload,
        payloadHash: backup.payloadHash
      });
      recordSummary.update += 1;
    }
  });
  backupRecords.forEach(function (backup) {
    if (currentById[backup.recordId]) return;
    records.push({
      recordId: backup.recordId,
      managementId: backup.managementId,
      invoiceNo: backup.invoiceNo,
      version: 1,
      deleted: backup.deleted,
      createdAt: now,
      updatedAt: now,
      createdBy: actor,
      updatedBy: actor,
      payloadJson: backup.payloadJson,
      payload: backup.payload,
      payloadHash: backup.payloadHash
    });
    recordSummary.insert += 1;
  });
  recordSummary.total = records.length;
  records.forEach(function (row, index) {
    storeAssertUniqueRecordKeys_(records.slice(0, index), row.recordId, row.managementId, row.invoiceNo);
  });

  var backupRoles = body.roles.map(function (row) {
    return {
      email: storeEmail_(row.email),
      role: String(row.role || "").toLowerCase(),
      active: storeBoolean_(row.active),
      version: storePositiveInteger_(row.version),
      createdAt: String(row.createdAt || ""),
      updatedAt: String(row.updatedAt || ""),
      updatedBy: storeEmail_(row.updatedBy)
    };
  });
  var backupRoleByEmail = {};
  backupRoles.forEach(function (row) { backupRoleByEmail[row.email] = row; });
  var currentRoleByEmail = {};
  currentRoles.forEach(function (row) { currentRoleByEmail[row.email] = row; });
  var roles = [];
  var roleSummary = { total: 0, insert: 0, update: 0, deactivate: 0, skip: 0 };
  currentRoles.forEach(function (current) {
    var backup = backupRoleByEmail[current.email];
    var desired = backup || {
      email: current.email,
      role: current.role,
      active: false
    };
    if (protectedAdminMap[current.email]) {
      desired = { email: current.email, role: "admin", active: true };
    }
    var same = current.role === desired.role && current.active === desired.active;
    roles.push({
      email: current.email,
      role: desired.role,
      active: desired.active,
      version: same ? current.version : current.version + 1,
      createdAt: current.createdAt,
      updatedAt: same ? current.updatedAt : now,
      updatedBy: same ? current.updatedBy : actor
    });
    if (same) roleSummary.skip += 1;
    else if (!desired.active) roleSummary.deactivate += 1;
    else roleSummary.update += 1;
  });
  backupRoles.forEach(function (backup) {
    if (currentRoleByEmail[backup.email]) return;
    roles.push({
      email: backup.email,
      role: backup.role,
      active: backup.active,
      version: 1,
      createdAt: now,
      updatedAt: now,
      updatedBy: actor
    });
    roleSummary.insert += 1;
  });
  if (!roles.some(function (row) { return row.active && row.role === "admin"; })) {
    storeFail_("STORE_RESTORE_ADMIN_MISSING", "復元後に有効な管理者がいないため停止しました。");
  }
  storeAssertActiveRolePolicy_(spreadsheet, roles);
  roleSummary.total = roles.length;
  return { records: records, roles: roles, recordSummary: recordSummary, roleSummary: roleSummary };
}

function storeDataFingerprint_(records, roles) {
  return storeSha256_(storeStableStringify_({
    records: records.map(function (row) {
      return [
        storeSha256_(row.recordId), row.version, row.deleted, row.payloadHash,
        storeSha256_(row.managementId), storeSha256_(row.invoiceNo)
      ];
    }).sort(function (a, b) { return String(a[0]).localeCompare(String(b[0])); }),
    roles: roles.map(function (row) {
      return [storeSha256_(row.email), row.role, row.active, row.version];
    }).sort(function (a, b) { return String(a[0]).localeCompare(String(b[0])); })
  }));
}

function storeAuditedRowLifecycleProof_(
  sheetName, rowNumber, rowValues
) {
  var headers = RENEWAL_STORE_SCHEMAS[sheetName] || [];
  var createdAtIndex = headers.indexOf("createdAt");
  var updatedAtIndex = headers.indexOf("updatedAt");
  var createdAt = createdAtIndex >= 0 ?
    String(rowValues[createdAtIndex] || "") : "";
  var updatedAt = updatedAtIndex >= 0 ?
    String(rowValues[updatedAtIndex] || "") : "";
  var isoTimestamp =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
  if (createdAtIndex < 0 || updatedAtIndex < 0 ||
      !isoTimestamp.test(createdAt) ||
      !isoTimestamp.test(updatedAt)) {
    storeFail_(
      "STORE_AUDIT_LIFECYCLE_INVALID",
      "Canonical row lifecycle timestamps are invalid."
    );
  }
  var normalized = rowValues.slice();
  normalized[createdAtIndex] = "__CANONICAL_CREATED_AT__";
  normalized[updatedAtIndex] = "__CANONICAL_UPDATED_AT__";
  return {
    sheetName: sheetName,
    rowNumber: Number(rowNumber),
    intentHash: storeSha256_(storeStableStringify_(normalized)),
    createdAt: createdAt,
    updatedAt: updatedAt
  };
}

function storeApplyPendingAuditedRowLifecycle_(
  pending, sheetName, rowNumber, rowValues
) {
  if (!pending || pending.format !==
      "CDP_RENEWAL_PENDING_AUDIT_RECOVERY_V3") {
    storeFail_(
      "STORE_AUDIT_RECOVERY_LIFECYCLE_PROOF_MISSING",
      "The prepared mutation predates exact lifecycle recovery. Manual confirmation is required before retry."
    );
  }
  var incomingProof = storeAuditedRowLifecycleProof_(
    sheetName, rowNumber, rowValues
  );
  var storedProof = pending.rowProof;
  if (!storedProof ||
      storedProof.sheetName !== sheetName ||
      Number(storedProof.rowNumber) !== Number(rowNumber) ||
      storedProof.intentHash !== incomingProof.intentHash) {
    storeFail_(
      "STORE_PREPARED_MUTATION_PENDING",
      "The retry does not exactly match the prepared canonical row intent."
    );
  }
  var headers = RENEWAL_STORE_SCHEMAS[sheetName];
  var restored = rowValues.slice();
  restored[headers.indexOf("createdAt")] = storedProof.createdAt;
  restored[headers.indexOf("updatedAt")] = storedProof.updatedAt;
  var restoredProof = storeAuditedRowLifecycleProof_(
    sheetName, rowNumber, restored
  );
  if (storeStableStringify_(restoredProof) !==
      storeStableStringify_(storedProof)) {
    storeFail_(
      "STORE_AUDIT_RECOVERY_LIFECYCLE_PROOF_MISMATCH",
      "The prepared lifecycle proof does not match the retried row."
    );
  }
  return restored;
}

function storeWriteAuditedRow_(spreadsheet, sheetName, rowNumber, rowValues, event) {
  if (["records", "roles"].indexOf(sheetName) < 0 ||
      !Array.isArray(rowValues) ||
      rowValues.length !== RENEWAL_STORE_SCHEMAS[sheetName].length) {
    storeFail_("STORE_AUDITED_ROW_INVALID", "Audited row write is invalid.");
  }
  var correlationId = storeAuditedMutationCorrelation_(
    sheetName, rowNumber, event
  );
  var base = {
    entityType: event.entityType,
    entityKey: event.entityKey,
    action: event.action,
    actor: event.actor,
    reasonCode: event.reasonCode,
    approver: event.approver,
    beforeHash: event.beforeHash,
    afterHash: event.afterHash,
    versionBefore: event.versionBefore,
    versionAfter: event.versionAfter,
    correlationId: correlationId
  };
  var targetSheet = storeResolveSheet_(spreadsheet, sheetName);
  storeEnsureSheetRows_(targetSheet, rowNumber);
  var evidence = storeAuditedMutationEvidence_(
    spreadsheet, base, correlationId
  );
  storeAssertNoOtherPreparedAuditedMutation_(
    spreadsheet, base, correlationId
  );
  var pendingBeforePrepare = storeReadPendingAuditRecovery_();
  if (pendingBeforePrepare &&
      pendingBeforePrepare.correlationId !== correlationId) {
    storeFail_(
      "STORE_PREPARED_MUTATION_PENDING",
      "Another audited mutation recovery is unresolved."
    );
  }
  if (pendingBeforePrepare) {
    rowValues = storeApplyPendingAuditedRowLifecycle_(
      pendingBeforePrepare, sheetName, rowNumber, rowValues
    );
  }
  var rowProof = storeAuditedRowLifecycleProof_(
    sheetName, rowNumber, rowValues
  );
  var expectedGenerationIntegrity =
    storeExpectedActiveGenerationIntegrityForRow_(
      spreadsheet, sheetName, rowNumber, rowValues
    );
  var rowState = storeAuditedRowState_(
    targetSheet, sheetName, rowNumber, rowValues, event
  );
  if (evidence.committed) {
    if (rowState !== "AFTER") {
      storeFail_(
        "STORE_AUDITED_ROW_DIVERGED",
        "Committed audit evidence does not match the canonical row."
      );
    }
    return {
      committed: true,
      recoveryNeeded: false,
      recoveryRequired: false,
      warning: "",
      idempotentReplay: true,
      correlationId: correlationId,
      canonicalLifecycle: {
        createdAt: rowProof.createdAt,
        updatedAt: rowProof.updatedAt
      }
    };
  }
  if (pendingBeforePrepare &&
      (storeStableStringify_(
        pendingBeforePrepare.expectedGenerationIntegrity
      ) !== storeStableStringify_(expectedGenerationIntegrity) ||
       storeStableStringify_(pendingBeforePrepare.rowProof) !==
         storeStableStringify_(rowProof))) {
    storeFail_(
      "STORE_PREPARED_MUTATION_PENDING",
      "Another audited mutation recovery is unresolved."
    );
  }
  if (!evidence.prepared) {
    storeAppendAudit_(
      spreadsheet, Object.assign({ eventState: "PREPARED" }, base)
    );
  } else if (rowState === "DIVERGED") {
    storeFail_(
      "STORE_AUDITED_ROW_DIVERGED",
      "Prepared audit evidence no longer matches the canonical row."
    );
  }
  // This marker contains only hashes/counts and is persisted with exact
  // readback before the canonical row is touched.  It lets recovery update a
  // mutable generation manifest without ever blessing unrelated manual edits.
  storeWritePendingAuditRecovery_(
    correlationId,
    expectedGenerationIntegrity,
    rowProof
  );

  if (rowState !== "AFTER") {
    try {
      targetSheet
        .getRange(
          rowNumber, 1, 1, RENEWAL_STORE_SCHEMAS[sheetName].length
        )
        .setValues([rowValues]);
      SpreadsheetApp.flush();
    } catch (writeError) {
      var observedState = storeAuditedRowState_(
        targetSheet, sheetName, rowNumber, rowValues, event
      );
      if (observedState === "BEFORE") throw writeError;
      if (observedState !== "AFTER") {
        var unknown = new Error(
          "Audited row write ended in an unknown state; inspect the canonical row before retrying."
        );
        unknown.code = "STORE_AUDITED_ROW_STATE_UNKNOWN";
        unknown.dataMayHaveChanged = true;
        throw unknown;
      }
    }
  }
  storeCommitExpectedActiveGenerationIntegrity_(
    spreadsheet, expectedGenerationIntegrity
  );

  var warning = "";
  try {
    storeAppendAudit_(
      spreadsheet, Object.assign({ eventState: "COMMITTED" }, base)
    );
  } catch (auditError) {
    // The canonical row is already durable.  Read both row and audit back
    // before reporting an outcome so a post-append transport error is not
    // mistaken for an uncommitted business mutation.
    var afterState = storeAuditedRowState_(
      targetSheet, sheetName, rowNumber, rowValues, event
    );
    if (afterState !== "AFTER") {
      var auditUnknown = new Error(
        "Canonical row state changed while finalizing its audit marker."
      );
      auditUnknown.code = "STORE_AUDITED_ROW_STATE_UNKNOWN";
      auditUnknown.dataMayHaveChanged = true;
      throw auditUnknown;
    }
    var afterEvidence = storeAuditedMutationEvidence_(
      spreadsheet, base, correlationId
    );
    if (!afterEvidence.committed) {
      warning =
        "Canonical data was committed, but its COMMITTED audit marker requires deterministic recovery.";
    }
  }
  if (!warning) storeClearPendingAuditRecovery_(correlationId);
  return {
    committed: true,
    recoveryNeeded: !!warning,
    recoveryRequired: !!warning,
    warning: warning,
    idempotentReplay: evidence.prepared && rowState === "AFTER",
    correlationId: correlationId,
    canonicalLifecycle: {
      createdAt: rowProof.createdAt,
      updatedAt: rowProof.updatedAt
    }
  };
}

function storeAuditedMutationCorrelation_(sheetName, rowNumber, event) {
  var material = {
    sheetName: String(sheetName || ""),
    rowNumber: Number(rowNumber || 0),
    entityType: storeAuditToken_(event.entityType),
    entityKeyHash: storeSha256_(String(event.entityKey || "")),
    action: storeAuditToken_(event.action),
    actor: storeEmail_(event.actor),
    reasonCode: storeReasonCode_(event.reasonCode),
    approver: event.approver ? storeEmail_(event.approver) : "",
    beforeHash: String(event.beforeHash || ""),
    afterHash: String(event.afterHash || ""),
    versionBefore: Number(event.versionBefore || 0),
    versionAfter: Number(event.versionAfter || 0)
  };
  return storeAuditToken_(
    "mutation_" + storeSha256_(storeStableStringify_(material))
  );
}

function storeAuditedMutationEvidence_(spreadsheet, event, correlationId) {
  var keyHash = storeSha256_(String(event.entityKey || ""));
  var expectedCorrelation = storeAuditToken_(correlationId);
  var rows = storeReadObjects_(spreadsheet, "audit").filter(function (row) {
    return String(row.entityKeyHash || "") === keyHash &&
      String(row.entityType || "") === storeAuditToken_(event.entityType) &&
      String(row.action || "") === storeAuditToken_(event.action) &&
      String(row.actor || "") === storeEmail_(event.actor) &&
      String(row.reasonCode || "") === storeReasonCode_(event.reasonCode) &&
      String(row.approver || "") ===
        (event.approver ? storeEmail_(event.approver) : "") &&
      String(row.beforeHash || "") === String(event.beforeHash || "") &&
      String(row.afterHash || "") === String(event.afterHash || "") &&
      Number(row.versionBefore || 0) === Number(event.versionBefore || 0) &&
      Number(row.versionAfter || 0) === Number(event.versionAfter || 0) &&
      String(row.correlationId || "") === expectedCorrelation;
  });
  var prepared = rows.filter(function (row) {
    return String(row.eventState || "") === "PREPARED";
  });
  var committed = rows.filter(function (row) {
    return String(row.eventState || "") === "COMMITTED";
  });
  if (prepared.length > 1 || committed.length > 1) {
    storeFail_(
      "STORE_AUDITED_ROW_AUDIT_DUPLICATE",
      "Audited row markers are duplicated; automatic recovery stopped."
    );
  }
  return {
    prepared: prepared.length === 1,
    committed: committed.length === 1
  };
}

function storeAuditedRowState_(
  targetSheet, sheetName, rowNumber, rowValues, event
) {
  var width = RENEWAL_STORE_SCHEMAS[sheetName].length;
  var observed = targetSheet.getRange(rowNumber, 1, 1, width).getValues()[0];
  if (storeStableStringify_(observed) === storeStableStringify_(rowValues)) {
    return "AFTER";
  }
  var expectedVersion = Number(event.versionBefore || 0);
  if (expectedVersion === 0 &&
      observed.every(function (value) {
        return value === "" || value === null || value === undefined;
      })) {
    return "BEFORE";
  }
  var observedKey = String(observed[0] || "").trim().toLowerCase();
  var expectedKey = String(event.entityKey || "").trim().toLowerCase();
  if (observedKey === expectedKey &&
      Number(observed[3] || 0) === expectedVersion) {
    return "BEFORE";
  }
  return "DIVERGED";
}

function storeAttachMutationStatus_(result, status) {
  result = result || {};
  status = status || {};
  result.committed = status.committed === true;
  result.recoveryNeeded = status.recoveryNeeded === true;
  result.recoveryRequired = status.recoveryRequired === true;
  result.warning = String(status.warning || "");
  result.idempotentReplay = status.idempotentReplay === true;
  result.correlationId = String(status.correlationId || "");
  return result;
}

function storeApplyCanonicalMutationLifecycle_(row, status) {
  var lifecycle = status && status.canonicalLifecycle;
  if (!row || !lifecycle) return row;
  row.createdAt = String(lifecycle.createdAt || "");
  row.updatedAt = String(lifecycle.updatedAt || "");
  return row;
}

/**
 * A PREPARED marker from a definitively committed canonical row is finalized
 * before the next locked mutation.  This is the operational recovery path for
 * a transport/service failure after the business row was already durable.
 *
 * PREPARED markers whose row is still in the BEFORE state are intentionally
 * left for an idempotent retry of that exact mutation.  A different mutation
 * for the same entity is rejected by
 * storeAssertNoOtherPreparedAuditedMutation_ below.
 */
function storePendingAuditRecoveryInfo_(raw) {
  var text = String(raw || "");
  if (!text) return null;
  if (/^MUTATION_[0-9A-F]{64}$/.test(text)) {
    return {
      format: "LEGACY",
      correlationId: text,
      expectedGenerationIntegrity: null,
      rowProof: null
    };
  }
  var parsed;
  try {
    parsed = JSON.parse(text);
  } catch (parseError) {
    storeFail_(
      "STORE_AUDIT_RECOVERY_MARKER_INVALID",
      "The pending mutation audit recovery marker is invalid."
    );
  }
  if (!parsed || [
        "CDP_RENEWAL_PENDING_AUDIT_RECOVERY_V2",
        "CDP_RENEWAL_PENDING_AUDIT_RECOVERY_V3"
      ].indexOf(String(parsed.format || "")) < 0 ||
      !/^MUTATION_[0-9A-F]{64}$/.test(
        String(parsed.correlationId || "")
      )) {
    storeFail_(
      "STORE_AUDIT_RECOVERY_MARKER_INVALID",
      "The pending mutation audit recovery marker is invalid."
    );
  }
  var integrity = parsed.expectedGenerationIntegrity;
  if (integrity !== null) {
    var hashesValid = ["recordsHash", "rolesHash", "dataHash"].every(
      function (field) {
        return /^[a-f0-9]{64}$/i.test(String(integrity && integrity[field] || ""));
      }
    );
    if (!integrity ||
        !/^g_[A-Za-z0-9-]{1,64}$/.test(
          String(integrity.generationId || "")
        ) ||
        !Number.isSafeInteger(Number(integrity.recordCount)) ||
        Number(integrity.recordCount) < 0 ||
        !Number.isSafeInteger(Number(integrity.roleCount)) ||
        Number(integrity.roleCount) < 0 ||
        !hashesValid) {
      storeFail_(
        "STORE_AUDIT_RECOVERY_MARKER_INVALID",
        "The pending generation integrity proof is invalid."
      );
    }
    integrity = {
      generationId: String(integrity.generationId),
      recordCount: Number(integrity.recordCount),
      roleCount: Number(integrity.roleCount),
      recordsHash: String(integrity.recordsHash),
      rolesHash: String(integrity.rolesHash),
      dataHash: String(integrity.dataHash)
    };
  }
  var rowProof = null;
  if (parsed.format === "CDP_RENEWAL_PENDING_AUDIT_RECOVERY_V3") {
    var proof = parsed.rowProof;
    var timestampPattern =
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
    if (!proof ||
        ["records", "roles"].indexOf(String(proof.sheetName || "")) < 0 ||
        !Number.isSafeInteger(Number(proof.rowNumber)) ||
        Number(proof.rowNumber) < 2 ||
        !/^[a-f0-9]{64}$/i.test(String(proof.intentHash || "")) ||
        !timestampPattern.test(String(proof.createdAt || "")) ||
        !timestampPattern.test(String(proof.updatedAt || ""))) {
      storeFail_(
        "STORE_AUDIT_RECOVERY_MARKER_INVALID",
        "The pending canonical row lifecycle proof is invalid."
      );
    }
    rowProof = {
      sheetName: String(proof.sheetName),
      rowNumber: Number(proof.rowNumber),
      intentHash: String(proof.intentHash).toLowerCase(),
      createdAt: String(proof.createdAt),
      updatedAt: String(proof.updatedAt)
    };
  }
  return {
    format: parsed.format,
    correlationId: String(parsed.correlationId),
    expectedGenerationIntegrity: integrity,
    rowProof: rowProof
  };
}

function storeReadPendingAuditRecovery_() {
  var raw;
  try {
    raw = PropertiesService.getScriptProperties().getProperty(
      RENEWAL_STORE.PENDING_AUDIT_RECOVERY_KEY
    );
  } catch (readError) {
    storeFail_(
      "STORE_AUDIT_RECOVERY_MARKER_READ_FAILED",
      "The pending mutation recovery marker could not be read."
    );
  }
  return storePendingAuditRecoveryInfo_(raw);
}

function storeWritePendingAuditRecovery_(
  correlationId, expectedIntegrity, rowProof
) {
  var normalizedCorrelation = storeAuditToken_(correlationId);
  if (!/^MUTATION_[0-9A-F]{64}$/.test(normalizedCorrelation)) {
    storeFail_(
      "STORE_AUDIT_RECOVERY_MARKER_INVALID",
      "The pending mutation correlation ID is invalid."
    );
  }
  var marker = {
    format: "CDP_RENEWAL_PENDING_AUDIT_RECOVERY_V3",
    correlationId: normalizedCorrelation,
    expectedGenerationIntegrity: expectedIntegrity ? {
      generationId: String(expectedIntegrity.generationId || ""),
      recordCount: Number(expectedIntegrity.recordCount),
      roleCount: Number(expectedIntegrity.roleCount),
      recordsHash: String(expectedIntegrity.recordsHash || ""),
      rolesHash: String(expectedIntegrity.rolesHash || ""),
      dataHash: String(expectedIntegrity.dataHash || "")
    } : null,
    rowProof: rowProof ? {
      sheetName: String(rowProof.sheetName || ""),
      rowNumber: Number(rowProof.rowNumber),
      intentHash: String(rowProof.intentHash || "").toLowerCase(),
      createdAt: String(rowProof.createdAt || ""),
      updatedAt: String(rowProof.updatedAt || "")
    } : null
  };
  // Reuse the strict parser as the schema validator before persistence.
  var normalizedMarker =
    storePendingAuditRecoveryInfo_(JSON.stringify(marker));
  var properties = PropertiesService.getScriptProperties();
  var existingRaw = "";
  try {
    existingRaw = String(
      properties.getProperty(RENEWAL_STORE.PENDING_AUDIT_RECOVERY_KEY) || ""
    );
  } catch (readError) {
    storeFail_(
      "STORE_AUDIT_RECOVERY_MARKER_READ_FAILED",
      "The pending mutation recovery marker could not be read before write."
    );
  }
  if (existingRaw) {
    var existing = storePendingAuditRecoveryInfo_(existingRaw);
    if (storeStableStringify_(existing) !==
        storeStableStringify_(normalizedMarker)) {
      storeFail_(
        "STORE_PREPARED_MUTATION_PENDING",
        "Another audited mutation recovery is unresolved."
      );
    }
  }
  var serialized = JSON.stringify(marker);
  try {
    properties.setProperty(
      RENEWAL_STORE.PENDING_AUDIT_RECOVERY_KEY, serialized
    );
  } catch (writeError) {
    // Readback below decides whether a transport error happened after commit.
  }
  var readback = "";
  try {
    readback = String(
      properties.getProperty(RENEWAL_STORE.PENDING_AUDIT_RECOVERY_KEY) || ""
    );
  } catch (readbackError) {
    storeFail_(
      "STORE_AUDIT_RECOVERY_MARKER_READ_FAILED",
      "The pending mutation recovery marker could not be verified; the canonical row was not changed."
    );
  }
  if (readback !== serialized) {
    storeFail_(
      "STORE_AUDIT_RECOVERY_MARKER_WRITE_FAILED",
      "The pending mutation recovery marker was not saved exactly; the canonical row was not changed."
    );
  }
  return marker;
}

function storeClearPendingAuditRecovery_(correlationId) {
  var properties = PropertiesService.getScriptProperties();
  var existing;
  try {
    existing = storePendingAuditRecoveryInfo_(
      properties.getProperty(RENEWAL_STORE.PENDING_AUDIT_RECOVERY_KEY)
    );
  } catch (readError) {
    return false;
  }
  if (!existing) return true;
  if (existing.correlationId !== String(correlationId || "")) {
    storeFail_(
      "STORE_PREPARED_MUTATION_PENDING",
      "A different audited mutation recovery marker is active."
    );
  }
  try {
    properties.deleteProperty(RENEWAL_STORE.PENDING_AUDIT_RECOVERY_KEY);
    return true;
  } catch (deleteError) {
    return false;
  }
}

function storeRecoverPreparedAuditedRowsIfConfigured_() {
  var properties = PropertiesService.getScriptProperties();
  var pending = storeReadPendingAuditRecovery_();
  if (!pending) return { recovered: 0, pending: 0 };
  var pendingCorrelationId = pending.correlationId;
  var spreadsheetId = String(
    properties.getProperty(RENEWAL_STORE.SPREADSHEET_ID_KEY) || ""
  );
  if (!spreadsheetId) {
    storeFail_(
      "STORE_AUDIT_RECOVERY_STORE_MISSING",
      "The canonical store for pending audit recovery is not configured."
    );
  }
  var spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  var result = storeRecoverPreparedAuditedRows_(spreadsheet, pending);
  if (storeAuditedMutationIsCommitted_(
    spreadsheet, pendingCorrelationId
  )) {
    storeAssertCompleteDataGeneration_(
      spreadsheet,
      storeReadActiveDataGeneration_(spreadsheet),
      true
    );
    storeClearPendingAuditRecovery_(pendingCorrelationId);
  }
  return result;
}

function storeRecoverPreparedAuditedRows_(spreadsheet, pendingRecovery) {
  var auditRows = storeReadObjects_(spreadsheet, "audit");
  var groups = {};
  auditRows.forEach(function (row) {
    var correlationId = String(row.correlationId || "");
    if (!/^MUTATION_[0-9A-F]{64}$/.test(correlationId)) return;
    if (!groups[correlationId]) {
      groups[correlationId] = { prepared: [], committed: [] };
    }
    if (String(row.eventState || "") === "PREPARED") {
      groups[correlationId].prepared.push(row);
    } else if (String(row.eventState || "") === "COMMITTED") {
      groups[correlationId].committed.push(row);
    }
  });
  var records = null;
  var roles = null;
  var recovered = 0;
  var pending = 0;
  Object.keys(groups).sort().forEach(function (correlationId) {
    var group = groups[correlationId];
    if (group.prepared.length > 1 || group.committed.length > 1) {
      storeFail_(
        "STORE_AUDITED_ROW_AUDIT_DUPLICATE",
        "Audited row markers are duplicated; automatic recovery stopped."
      );
    }
    if (!group.prepared.length || group.committed.length) return;
    var prepared = group.prepared[0];
    var entityType = String(prepared.entityType || "").toUpperCase();
    var state;
    if (entityType === "RECORD") {
      if (records === null) records = storeReadRecords_(spreadsheet);
      state = storePreparedRecordAuditState_(records, prepared);
    } else if (entityType === "ROLE") {
      if (roles === null) roles = storeReadRoles_(spreadsheet);
      state = storePreparedRoleAuditState_(roles, prepared);
    } else {
      return;
    }
    if (state === "AFTER") {
      var activeGeneration = storeReadActiveDataGeneration_(spreadsheet);
      if (activeGeneration !== RENEWAL_STORE.BASE_DATA_GENERATION) {
        if (!pendingRecovery ||
            String(pendingRecovery.correlationId || "") !== correlationId ||
            !pendingRecovery.expectedGenerationIntegrity) {
          storeFail_(
            "STORE_DATA_GENERATION_RECOVERY_PROOF_MISSING",
            "An audited row changed in a generated dataset without its exact aggregate integrity proof."
          );
        }
        storeCommitExpectedActiveGenerationIntegrity_(
          spreadsheet,
          pendingRecovery.expectedGenerationIntegrity
        );
      }
      storeAppendRecoveredAuditCommit_(spreadsheet, prepared);
      recovered += 1;
    } else if (state === "BEFORE") {
      pending += 1;
    } else {
      storeFail_(
        "STORE_AUDITED_ROW_DIVERGED",
        "Prepared audit evidence no longer matches the canonical row."
      );
    }
  });
  if (recovered) SpreadsheetApp.flush();
  return { recovered: recovered, pending: pending };
}

function storePreparedRecordAuditState_(records, prepared) {
  var keyHash = String(prepared.entityKeyHash || "");
  var row = (records || []).filter(function (item) {
    return storeSha256_(item.recordId) === keyHash;
  })[0] || null;
  var versionBefore = Number(prepared.versionBefore || 0);
  var versionAfter = Number(prepared.versionAfter || 0);
  if (!row) return versionBefore === 0 ? "BEFORE" : "DIVERGED";
  var currentHash = String(row.payloadHash || "");
  if (row.version === versionAfter &&
      currentHash === String(prepared.afterHash || "")) {
    var action = String(prepared.action || "");
    var expectedDeleted = action === "SOFT_DELETE";
    if (["RECORD_INSERT", "RECORD_UPDATE", "RESTORE_AND_UPDATE",
         "RESTORE_SOFT_DELETED"].indexOf(action) >= 0) {
      expectedDeleted = false;
    }
    if (row.deleted !== expectedDeleted ||
        storeManagementId_(row.payload) !== row.managementId ||
        storeInvoiceNo_(row.payload) !== row.invoiceNo ||
        row.updatedBy !== String(prepared.actor || "")) {
      return "DIVERGED";
    }
    return "AFTER";
  }
  if (row.version === versionBefore &&
      currentHash === String(prepared.beforeHash || "")) {
    return "BEFORE";
  }
  return "DIVERGED";
}

function storePreparedRoleAuditState_(roles, prepared) {
  var keyHash = String(prepared.entityKeyHash || "");
  var row = (roles || []).filter(function (item) {
    return storeSha256_(item.email) === keyHash;
  })[0] || null;
  var versionBefore = Number(prepared.versionBefore || 0);
  if (!row) return versionBefore === 0 ? "BEFORE" : "DIVERGED";
  var currentHash = storeRoleHash_(row);
  if (row.version === Number(prepared.versionAfter || 0) &&
      currentHash === String(prepared.afterHash || "") &&
      row.updatedBy === String(prepared.actor || "")) {
    return "AFTER";
  }
  if (row.version === versionBefore &&
      currentHash === String(prepared.beforeHash || "")) {
    return "BEFORE";
  }
  return "DIVERGED";
}

function storeAppendRecoveredAuditCommit_(spreadsheet, prepared) {
  var row = {};
  RENEWAL_STORE_SCHEMAS.audit.forEach(function (header) {
    row[header] = prepared[header];
  });
  row.auditId = "audit_" + storeUuid_();
  row.timestamp = storeNowIso_();
  row.eventState = "COMMITTED";
  storeAppendObject_(spreadsheet, "audit", row);
}

function storeAuditedMutationIsCommitted_(spreadsheet, correlationId) {
  var committed = 0;
  storeReadObjects_(spreadsheet, "audit").forEach(function (row) {
    if (String(row.correlationId || "") === correlationId &&
        String(row.eventState || "") === "COMMITTED") {
      committed += 1;
    }
  });
  if (committed > 1) {
    storeFail_(
      "STORE_AUDITED_ROW_AUDIT_DUPLICATE",
      "Audited row markers are duplicated; automatic recovery stopped."
    );
  }
  return committed === 1;
}

function storeAssertNoOtherPreparedAuditedMutation_(
  spreadsheet, event, correlationId
) {
  var keyHash = storeSha256_(String(event.entityKey || ""));
  var groups = {};
  storeReadObjects_(spreadsheet, "audit").forEach(function (row) {
    var candidate = String(row.correlationId || "");
    if (!/^MUTATION_[0-9A-F]{64}$/.test(candidate) ||
        String(row.entityType || "") !== storeAuditToken_(event.entityType) ||
        String(row.entityKeyHash || "") !== keyHash) {
      return;
    }
    if (!groups[candidate]) groups[candidate] = {
      prepared: 0, committed: 0
    };
    if (String(row.eventState || "") === "PREPARED") {
      groups[candidate].prepared += 1;
    } else if (String(row.eventState || "") === "COMMITTED") {
      groups[candidate].committed += 1;
    }
  });
  Object.keys(groups).forEach(function (candidate) {
    var group = groups[candidate];
    if (group.prepared > 1 || group.committed > 1) {
      storeFail_(
        "STORE_AUDITED_ROW_AUDIT_DUPLICATE",
        "Audited row markers are duplicated; automatic recovery stopped."
      );
    }
    if (candidate !== correlationId &&
        group.prepared === 1 && group.committed === 0) {
      storeFail_(
        "STORE_PREPARED_MUTATION_PENDING",
        "A previous mutation for this entity is unresolved; automatic overwrite stopped."
      );
    }
  });
}

function storeConfirmAuditedMutation_(input) {
  input = input || {};
  return storeWithLock_(function () {
    var spreadsheet = storeOpen_();
    var actor = storeActorEmail_();
    storeRequirePermission_(spreadsheet, actor, "read");
    var correlationId = storeAuditToken_(input.correlationId);
    if (!/^MUTATION_[0-9A-F]{64}$/.test(correlationId)) {
      storeFail_(
        "STORE_AUDIT_CORRELATION_INVALID",
        "The mutation audit correlation ID is invalid."
      );
    }
    storeRecoverPreparedAuditedRows_(spreadsheet);
    var prepared = 0;
    var committed = 0;
    storeReadObjects_(spreadsheet, "audit").forEach(function (row) {
      if (String(row.correlationId || "") !== correlationId) return;
      if (String(row.eventState || "") === "PREPARED") prepared += 1;
      if (String(row.eventState || "") === "COMMITTED") committed += 1;
    });
    if (prepared !== 1 || committed > 1) {
      storeFail_(
        "STORE_AUDIT_EVIDENCE_INVALID",
        "Mutation audit evidence is missing or duplicated."
      );
    }
    if (committed !== 1) {
      storeFail_(
        "STORE_AUDIT_RECOVERY_INCOMPLETE",
        "Canonical data is committed, but its audit marker is not yet confirmed."
      );
    }
    return {
      success: true,
      committed: true,
      recoveryNeeded: false,
      recoveryRequired: false,
      correlationId: correlationId
    };
  });
}

function storeAppendAudit_(spreadsheet, event) {
  var row = {
    auditId: "audit_" + storeUuid_(),
    timestamp: storeNowIso_(),
    eventState: String(event.eventState || "COMMITTED"),
    entityType: storeAuditToken_(event.entityType),
    entityKeyHash: storeSha256_(String(event.entityKey || "")),
    action: storeAuditToken_(event.action),
    actor: storeEmail_(event.actor),
    reasonCode: storeReasonCode_(event.reasonCode),
    approver: event.approver ? storeEmail_(event.approver) : "",
    beforeHash: String(event.beforeHash || ""),
    afterHash: String(event.afterHash || ""),
    versionBefore: Number(event.versionBefore || 0),
    versionAfter: Number(event.versionAfter || 0),
    correlationId: storeAuditToken_(event.correlationId || ("event_" + storeUuid_())),
    schemaVersion: RENEWAL_STORE.SCHEMA_VERSION
  };
  storeAppendObject_(spreadsheet, "audit", row);
}

function storeReadRecords_(spreadsheet) {
  return storeParseRecordObjects_(storeReadObjects_(spreadsheet, "records"));
}

function storeParseRecordObjects_(rows) {
  return rows.map(function (row) {
    var payloadJson = String(row.payloadJson || "");
    var payload;
    try {
      payload = JSON.parse(payloadJson);
    } catch (error) {
      storeFail_("STORE_RECORD_JSON_INVALID", "共有正本の対象レコードが壊れています。");
    }
    var payloadHash = storeSha256_(storeStableStringify_(payload));
    if (payloadHash !== String(row.payloadHash || "")) {
      storeFail_("STORE_RECORD_HASH_MISMATCH", "共有正本の対象レコード整合性検査に失敗しました。");
    }
    return {
      recordId: storeRecordId_(row.recordId, false),
      managementId: storeIdentifier_(row.managementId, "管理ID", true),
      invoiceNo: storeIdentifier_(row.invoiceNo, "請求書番号", false),
      version: storePositiveInteger_(row.version),
      deleted: storeBoolean_(row.deleted),
      createdAt: String(row.createdAt || ""),
      updatedAt: String(row.updatedAt || ""),
      createdBy: storeEmail_(row.createdBy),
      updatedBy: storeEmail_(row.updatedBy),
      payloadJson: payloadJson,
      payload: payload,
      payloadHash: payloadHash,
      _rowNumber: row._rowNumber
    };
  });
}

function storeReadRoles_(spreadsheet) {
  return storeParseRoleObjects_(storeReadObjects_(spreadsheet, "roles"));
}

function storeParseRoleObjects_(rows) {
  var seen = {};
  return rows.map(function (row) {
    var email = storeEmail_(row.email);
    if (seen[email]) storeFail_("STORE_ROLE_DUPLICATE", "共有正本の利用者が重複しています。");
    seen[email] = true;
    var role = String(row.role || "").trim().toLowerCase();
    if (RENEWAL_STORE.ROLES.indexOf(role) < 0) {
      storeFail_("STORE_ROLE_INVALID", "共有正本の利用者ロールが不正です。");
    }
    return {
      email: email,
      role: role,
      active: storeBoolean_(row.active),
      version: storePositiveInteger_(row.version),
      createdAt: String(row.createdAt || ""),
      updatedAt: String(row.updatedAt || ""),
      updatedBy: storeEmail_(row.updatedBy),
      _rowNumber: row._rowNumber
    };
  });
}

function storeReadBackups_(spreadsheet) {
  return storeReadObjects_(spreadsheet, "backups").map(function (row) {
    row.backupId = String(row.backupId || "");
    row.status = String(row.status || "");
    row.contentHash = String(row.contentHash || "");
    row.driveFileId = String(row.driveFileId || "");
    return row;
  });
}

function storeReadImportBatches_(spreadsheet) {
  return storeReadObjects_(spreadsheet, "import_batches").map(function (row) {
    row.batchId = String(row.batchId || "");
    row.requestedBy = storeEmail_(row.requestedBy);
    row.status = String(row.status || "");
    row.tokenHash = String(row.tokenHash || "");
    row.baseStoreHash = String(row.baseStoreHash || "");
    row.sourceHash = String(row.sourceHash || "");
    return row;
  });
}

function storeReadObjects_(spreadsheet, sheetName) {
  return storeReadObjectsFromSheet_(storeResolveSheet_(spreadsheet, sheetName), sheetName);
}

function storeReadObjectsFromSheet_(sheet, schemaName) {
  if (!sheet) storeFail_("STORE_SCHEMA_MISSING", "Canonical data sheet is missing.");
  var headers = RENEWAL_STORE_SCHEMAS[schemaName];
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, headers.length).getValues().map(function (values, index) {
    var object = { _rowNumber: index + 2 };
    headers.forEach(function (header, column) { object[header] = values[column]; });
    return object;
  });
}

function storeAppendObject_(spreadsheet, sheetName, object) {
  var rowNumber = storeNextRow_(spreadsheet, sheetName);
  storeWriteObjectAt_(spreadsheet, sheetName, rowNumber, object);
  return rowNumber;
}

function storeWriteObjectAt_(spreadsheet, sheetName, rowNumber, object) {
  var headers = RENEWAL_STORE_SCHEMAS[sheetName];
  var values = headers.map(function (header) {
    return storeCellValue_(object[header] === undefined ? "" : object[header]);
  });
  var sheet = storeResolveSheet_(spreadsheet, sheetName);
  storeEnsureSheetRows_(sheet, rowNumber);
  sheet.getRange(rowNumber, 1, 1, headers.length).setValues([values]);
}

function storeWriteWholeTable_(spreadsheet, sheetName, rows) {
  if (sheetName === "records" || sheetName === "roles") {
    storeFail_(
      "STORE_GENERATION_COMMIT_REQUIRED",
      "Canonical records and roles must be replaced through one validated generation commit."
    );
  }
  var sheet = storeResolveSheet_(spreadsheet, sheetName);
  var width = RENEWAL_STORE_SCHEMAS[sheetName].length;
  var oldRows = Math.max(0, sheet.getLastRow() - 1);
  if (oldRows) sheet.getRange(2, 1, oldRows, width).clearContent();
  if (!rows.length) return;
  storeEnsureSheetRows_(sheet, rows.length + 1);
  sheet.getRange(2, 1, rows.length, width).setValues(rows);
}

function storeEnsureSheetRows_(sheet, requiredLastRow) {
  var required = Number(requiredLastRow);
  if (!Number.isInteger(required) || required < 1 || required > RENEWAL_STORE.MAX_SHEET_ROWS) {
    storeFail_("STORE_SHEET_ROW_LIMIT", "共有正本の行数が安全上限を超えるため停止しました。");
  }
  if (typeof sheet.getMaxRows !== "function" || typeof sheet.insertRowsAfter !== "function") return;
  var current = sheet.getMaxRows();
  if (current < required) sheet.insertRowsAfter(current, required - current);
}

function storeNextRow_(spreadsheet, sheetName) {
  return Math.max(2, storeResolveSheet_(spreadsheet, sheetName).getLastRow() + 1);
}

function storeWriteMetaMap_(spreadsheet, values) {
  var rows = Object.keys(values).sort().map(function (key) {
    return [key, storeCellValue_(values[key])];
  });
  if (rows.length) {
    var sheet = spreadsheet.getSheetByName("_meta");
    storeEnsureSheetRows_(sheet, rows.length + 1);
    sheet.getRange(2, 1, rows.length, 2).setValues(rows);
  }
}

function storeReadMetaMap_(spreadsheet) {
  var rows = storeReadObjects_(spreadsheet, "_meta");
  var result = {};
  rows.forEach(function (row) {
    var key = String(row.key || "");
    if (!key || Object.prototype.hasOwnProperty.call(result, key)) {
      storeFail_("STORE_META_INVALID", "共有正本の管理情報が不正です。");
    }
    result[key] = String(row.value || "");
  });
  return result;
}

function storeRecordToRow_(row) {
  return [
    storeCellValue_(row.recordId),
    storeCellValue_(row.managementId),
    storeCellValue_(row.invoiceNo),
    row.version,
    row.deleted,
    row.createdAt,
    row.updatedAt,
    row.createdBy,
    row.updatedBy,
    row.payloadJson,
    row.payloadHash
  ];
}

function storeRoleToRow_(row) {
  return [
    row.email, row.role, row.active, row.version,
    row.createdAt, row.updatedAt, row.updatedBy
  ];
}

function storePublicRecord_(row) {
  return {
    recordId: row.recordId,
    managementId: row.managementId,
    invoiceNo: row.invoiceNo,
    version: row.version,
    deleted: row.deleted,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    payloadHash: row.payloadHash,
    record: JSON.parse(storeStableStringify_(row.payload || JSON.parse(String(row.payloadJson || "{}"))))
  };
}

function storeCopyRecordRow_(row) {
  return {
    recordId: row.recordId,
    managementId: row.managementId,
    invoiceNo: row.invoiceNo,
    version: row.version,
    deleted: row.deleted,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    payloadJson: row.payloadJson,
    payload: JSON.parse(storeStableStringify_(row.payload)),
    payloadHash: row.payloadHash,
    _rowNumber: row._rowNumber
  };
}

function storeFindRecordById_(rows, recordId) {
  var normalized = storeRecordId_(recordId, false);
  if (!normalized) return null;
  return rows.filter(function (row) { return row.recordId === normalized; })[0] || null;
}

function storeFindRecordByManagementId_(rows, managementId) {
  var key = storeUniqueKey_(managementId);
  if (!key) return null;
  return rows.filter(function (row) { return storeUniqueKey_(row.managementId) === key; })[0] || null;
}

function storeFindRoleByEmail_(rows, email) {
  var normalized = storeEmail_(email);
  return rows.filter(function (row) { return row.email === normalized; })[0] || null;
}

function storeFindBackup_(rows, backupId) {
  var id = String(backupId || "");
  return rows.filter(function (row) { return row.backupId === id; })[0] || null;
}

function storeFindImportBatch_(rows, batchId) {
  var id = String(batchId || "");
  return rows.filter(function (row) { return row.batchId === id; })[0] || null;
}

function storeRoleHash_(role) {
  return storeSha256_(storeStableStringify_({
    emailHash: storeSha256_(role.email),
    role: role.role,
    active: role.active,
    version: role.version
  }));
}

function storeNormalizePayload_(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    storeFail_("STORE_PAYLOAD_INVALID", "対象レコードの形式が正しくありません。");
  }
  var normalized;
  try {
    normalized = JSON.parse(storeStableStringify_(value));
  } catch (error) {
    if (error && error.code) throw error;
    storeFail_("STORE_PAYLOAD_INVALID", "対象レコードをJSONへ変換できません。");
  }
  // Row lifecycle/version timestamps belong to the canonical table, not to
  // caller-controlled payload JSON.
  Object.keys(normalized).forEach(function (key) {
    if (key.charAt(0) === "_") delete normalized[key];
  });
  delete normalized.archived;
  delete normalized.deleted;
  delete normalized.createdAt;
  delete normalized.updatedAt;
  return normalized;
}

function storeManagementId_(payload) {
  // Persist a business key: a person can legitimately have records in another
  // fiscal year or for another attendance number.
  var personId = storeIdentifier_(payload.personId !== undefined ? payload.personId : payload.managementId, "personId", true);
  var fiscalYear = storeIdentifier_(payload.fiscalYear, "fiscalYear", true);
  var sessionNo = storeIdentifier_(payload.sessionNo, "sessionNo", true);
  if (!/^20\d{2}$/.test(fiscalYear) || !/^\d+$/.test(sessionNo) || Number(sessionNo) < 1) {
    storeFail_("STORE_BUSINESS_KEY_INVALID", "Fiscal year must be four digits and session number must be a positive integer.");
  }
  return personId + "|" + fiscalYear + "|" + sessionNo;
}

function storeInvoiceNo_(payload) {
  return storeIdentifier_(payload.invoiceNo, "請求書番号", false);
}

function storeIdentifier_(value, label, required) {
  var text = String(value === undefined || value === null ? "" : value).normalize("NFKC").trim();
  if (required && !text) storeFail_("STORE_IDENTIFIER_REQUIRED", label + "が必要です。");
  if (text.length > 120 || /[\r\n\t]/.test(text) || /^[=+\-@]/.test(text)) {
    storeFail_("STORE_IDENTIFIER_INVALID", label + "の形式が正しくありません。");
  }
  return text;
}

function storeRecordId_(value, createWhenBlank) {
  var text = String(value === undefined || value === null ? "" : value).normalize("NFKC").trim();
  if (!text && createWhenBlank) text = "rec_" + storeUuid_();
  if (text && (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(text) || RENEWAL_STORE.PROTECTED_SOURCE_IDS.indexOf(text) >= 0)) {
    storeFail_("STORE_RECORD_ID_INVALID", "レコードIDの形式が正しくありません。");
  }
  return text;
}

function storeUniqueKey_(value) {
  return String(value || "").normalize("NFKC").trim().toLowerCase();
}

function storeEmail_(value) {
  var email = String(value || "").normalize("NFKC").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) {
    storeFail_("STORE_EMAIL_INVALID", "利用者メールアドレスの形式が正しくありません。");
  }
  return email;
}

/**
 * Never fall back to the effective/deploying user for an ordinary API call.
 * That fallback would turn an anonymous caller into the owner on a web app
 * deployed as the owner.  Configure Google sign-in / Workspace visibility
 * first; until then this fails closed.
 */
function storeActorEmail_() {
  var value = "";
  try { value = Session.getActiveUser().getEmail(); } catch (ignored) {}
  if (!String(value || "").trim()) {
    storeFail_("STORE_ACTIVE_USER_REQUIRED", "ログイン利用者のメールアドレスを取得できないため、安全のため操作を停止しました。");
  }
  return storeEmail_(value);
}

/** Only the initial owner setup may compare active and effective identities. */
function storeBootstrapActorEmail_() {
  var active = "";
  var effective = "";
  try { active = Session.getActiveUser().getEmail(); } catch (ignoredActive) {}
  try { effective = Session.getEffectiveUser().getEmail(); } catch (ignoredEffective) {}
  if (!String(active || "").trim() || !String(effective || "").trim()) {
    storeFail_("STORE_BOOTSTRAP_IDENTITY_REQUIRED", "初回設定にはログイン利用者と所有者のメールアドレスが必要です。");
  }
  active = storeEmail_(active);
  effective = storeEmail_(effective);
  if (active !== effective) {
    storeFail_("STORE_BOOTSTRAP_OWNER_REQUIRED", "初回設定はスクリプト所有者本人だけが実行できます。");
  }
  return active;
}

function storeApprover_(value) {
  var text = String(value || "").trim();
  return text ? storeEmail_(text) : "";
}

/**
 * Ordinary CRUD has no approval workflow.  A caller-supplied email must
 * therefore never be copied into the approver audit column: doing so would
 * manufacture approval evidence.  Only the dedicated two-person restore
 * workflow may write a server-validated approver.
 */
function storeAssertOrdinaryOperationHasNoApprover_(value) {
  if (String(value || "").trim()) {
    storeFail_(
      "STORE_APPROVER_NOT_ALLOWED",
      "This operation has no approval workflow; approver must be empty."
    );
  }
  return "";
}

function storeReasonCode_(value) {
  var code = String(value || "").normalize("NFKC").trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{1,63}$/.test(code)) {
    storeFail_("STORE_REASON_CODE_INVALID", "個人情報を含まない2〜64文字の理由コードが必要です。");
  }
  return code;
}

function storeAuditToken_(value) {
  var token = String(value || "").normalize("NFKC").trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_.:-]{0,95}$/.test(token)) {
    storeFail_("STORE_AUDIT_TOKEN_INVALID", "監査識別子の形式が正しくありません。");
  }
  return token;
}

function storeAssertExpectedVersion_(received, current) {
  var version = Number(received);
  if (!Number.isInteger(version) || version < 0) {
    storeFail_("STORE_VERSION_REQUIRED", "更新前の版番号が必要です。");
  }
  if (version !== Number(current)) {
    storeFail_("STORE_VERSION_CONFLICT", "別の担当者が先に更新しました。再読込してからやり直してください。");
  }
}

function storePositiveInteger_(value) {
  var number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    storeFail_("STORE_INTEGER_INVALID", "共有正本の版番号が不正です。");
  }
  return number;
}

function storeBoolean_(value) {
  if (value === true || value === "TRUE" || value === 1 || value === "1") return true;
  if (value === false || value === "FALSE" || value === 0 || value === "0" || value === "") return false;
  storeFail_("STORE_BOOLEAN_INVALID", "共有正本の真偽値が不正です。");
}

function storeCellValue_(value) {
  if (typeof value !== "string") return value;
  return /^[\s]*[=+\-@]/.test(value) ? "'" + value : value;
}

function storeAssertDedicatedId_(spreadsheetId) {
  var id = String(spreadsheetId || "").trim();
  if (!id || RENEWAL_STORE.PROTECTED_SOURCE_IDS.indexOf(id) >= 0) {
    storeFail_("STORE_PROTECTED_SOURCE", "既存参照資料は共有正本として使用できません。");
  }
}

/**
 * Create a Drive item in its final parent without a default-visibility window.
 * The Advanced Drive response and a second metadata read must both prove the
 * same ID, name, MIME type and single parent before the caller can use it.
 */
function storeCreatePrivateDriveItemInParent_(options) {
  options = options || {};
  var name = String(options.name || "");
  var mimeType = String(options.mimeType || "");
  var parentId = String(options.parentId || "");
  var description = String(options.description || "");
  var label = String(options.label || "Drive item");
  var scope = String(options.scope || "GENERAL").toUpperCase();
  if (!name || !mimeType || !parentId) {
    storeFail_("STORE_DRIVE_CREATE_ARGUMENT_INVALID", label + " create metadata is incomplete.");
  }
  if (typeof Drive === "undefined" || !Drive.Files ||
      typeof Drive.Files.create !== "function" ||
      typeof Drive.Files.get !== "function") {
    storeFail_("STORE_DRIVE_API_UNAVAILABLE", "Advanced Drive API v3 is required for safe storage creation.");
  }
  var operation = storeDriveCreateOperation_(options);
  var failureKey = storeDriveFailureKey_(operation);
  storeAssertNoUnresolvedDriveCleanup_(failureKey, label);
  // Persist and read back the exact create intent before Drive is called.
  // Therefore a PREPARED backup with no matching file can distinguish a
  // genuine pre-Drive stop from Drive search/index propagation uncertainty.
  storePersistDriveFailureVerified_(
    failureKey, "ATTEMPT_STARTED", operation, "", null
  );
  var resource;
  try {
    resource = Drive.Files.create({
      name: name,
      mimeType: mimeType,
      parents: [parentId],
      description: description
    }, options.blob || null, {
      fields: "id,name,mimeType,parents,description,trashed",
      supportsAllDrives: true,
      ignoreDefaultVisibility: true
    });
  } catch (createError) {
    var outcomeTracked = false;
    try {
      storePersistDriveFailureVerified_(
        failureKey, "OUTCOME_UNCERTAIN", operation, "", createError
      );
      outcomeTracked = true;
    } catch (ignoredOutcomeTrackingError) {
      // The previously verified ATTEMPT_STARTED marker remains sufficient to
      // block a zero-result recovery if the OUTCOME_UNCERTAIN update failed.
    }
    var uncertain = new Error(
      label + " create result is unknown. The prepared operation was retained for safe recovery: " +
      String(createError && createError.message || createError) +
      (outcomeTracked ? "" : " Drive failure tracking also failed; inspect execution logs.")
    );
    uncertain.code = scope === "BACKUP" ?
      "STORE_BACKUP_DRIVE_OUTCOME_UNCERTAIN" :
      "STORE_DRIVE_CREATE_OUTCOME_UNCERTAIN";
    uncertain.storeDriveOutcomeUncertain = true;
    uncertain.storeDriveFailureKey = failureKey;
    uncertain.storeDriveTrackingFailed = !outcomeTracked;
    throw uncertain;
  }

  var resourceId = String(resource && resource.id || "");
  var item = null;
  try {
    storeAssertDriveMetadataValues_(
      resource, resourceId, name, mimeType, parentId, description, label
    );
    item = mimeType === "application/vnd.google-apps.folder" ?
      DriveApp.getFolderById(resourceId) : DriveApp.getFileById(resourceId);
    if (!item || typeof item.getId !== "function" ||
        String(item.getId()) !== resourceId) {
      storeFail_("STORE_DRIVE_ID_READBACK_MISMATCH", label + " DriveApp ID readback failed.");
    }
    var readback = Drive.Files.get(resourceId, {
      fields: "id,name,mimeType,parents,description,trashed",
      supportsAllDrives: true
    });
    storeAssertDriveMetadataValues_(
      readback, resourceId, name, mimeType, parentId, description, label
    );
    storeMakePrivate_(item);
    storeAssertResourcePrivate_(item, label);
    if (scope === "SETUP" || scope === "BACKUP") {
      // Keep exact evidence until all three setup IDs have been published and
      // read back, or until a backup registry row and audit are complete. A
      // process death between Drive verification and durable publication must
      // not leave an untracked private item that a later retry duplicates.
      storePersistDriveFailureVerified_(
        failureKey, "CREATED_VERIFIED", operation, resourceId, null
      );
    } else {
      storeClearDriveFailure_(failureKey);
    }
    return item;
  } catch (validationError) {
    storePermanentlyDeleteNewDriveItem_(
      item, resourceId, label, mimeType, validationError, failureKey, operation
    );
    throw validationError;
  }
}

function storeDriveCreateOperation_(options) {
  options = options || {};
  return {
    scope: String(options.scope || "GENERAL").toUpperCase(),
    action: "CREATE",
    name: String(options.name || ""),
    mimeType: String(options.mimeType || ""),
    parentId: String(options.parentId || ""),
    label: String(options.label || "Drive item")
  };
}

function storeAssertDriveMetadataValues_(
  metadata, expectedId, expectedName, expectedMimeType,
  expectedParentId, expectedDescription, label
) {
  var parents = metadata && Array.isArray(metadata.parents) ?
    metadata.parents.map(function (value) { return String(value || ""); }) : [];
  if (!expectedId ||
      String(metadata && metadata.id || "") !== expectedId ||
      String(metadata && metadata.name || "") !== expectedName ||
      String(metadata && metadata.mimeType || "") !== expectedMimeType ||
      parents.length !== 1 ||
      parents[0] !== expectedParentId ||
      String(metadata && metadata.description || "") !== expectedDescription ||
      (metadata && metadata.trashed === true)) {
    storeFail_(
      "STORE_DRIVE_METADATA_READBACK_MISMATCH",
      label + " was not created with the exact requested ID, name, MIME type and parent."
    );
  }
}

function storeDriveFailureKey_(operation) {
  return RENEWAL_STORE.DRIVE_FAILURE_PREFIX +
    String(operation.scope || "GENERAL") + "_" +
    storeSha256_(storeStableStringify_(operation)).slice(0, 24);
}

function storePersistDriveFailure_(key, state, operation, resourceId, error) {
  try {
    PropertiesService.getScriptProperties().setProperty(key, JSON.stringify({
      detectedAt: storeNowIso_(),
      state: String(state || ""),
      scope: String(operation && operation.scope || ""),
      action: String(operation && operation.action || ""),
      name: String(operation && operation.name || ""),
      mimeType: String(operation && operation.mimeType || ""),
      parentId: String(operation && operation.parentId || ""),
      label: String(operation && operation.label || ""),
      resourceId: String(resourceId || ""),
      error: String(error && error.message || error || "")
    }));
    return true;
  } catch (ignoredDriveFailurePersistenceError) {
    return false;
  }
}

function storeReadDriveFailure_(key) {
  var raw;
  try {
    raw = String(
      PropertiesService.getScriptProperties().getProperty(String(key || "")) ||
      ""
    );
  } catch (readError) {
    storeFail_(
      "STORE_DRIVE_FAILURE_TRACKING_READ_FAILED",
      "Drive operation tracking could not be read."
    );
  }
  if (!raw) return null;
  var tracked;
  try {
    tracked = JSON.parse(raw);
  } catch (parseError) {
    storeFail_(
      "STORE_DRIVE_FAILURE_TRACKING_INVALID",
      "Drive operation tracking is malformed; manual review is required."
    );
  }
  if (!tracked || typeof tracked !== "object" || Array.isArray(tracked)) {
    storeFail_(
      "STORE_DRIVE_FAILURE_TRACKING_INVALID",
      "Drive operation tracking is malformed; manual review is required."
    );
  }
  return tracked;
}

function storePersistDriveFailureVerified_(
  key, state, operation, resourceId, error
) {
  if (!storePersistDriveFailure_(
    key, state, operation, resourceId, error
  )) {
    storeFail_(
      "STORE_DRIVE_FAILURE_TRACKING_WRITE_FAILED",
      "Drive operation tracking could not be saved."
    );
  }
  var tracked = storeReadDriveFailure_(key);
  var expected = {
    state: String(state || ""),
    scope: String(operation && operation.scope || ""),
    action: String(operation && operation.action || ""),
    name: String(operation && operation.name || ""),
    mimeType: String(operation && operation.mimeType || ""),
    parentId: String(operation && operation.parentId || ""),
    label: String(operation && operation.label || ""),
    resourceId: String(resourceId || "")
  };
  var matches = tracked && String(tracked.detectedAt || "") &&
    Object.keys(expected).every(function (field) {
      return String(tracked[field] || "") === expected[field];
    });
  if (!matches) {
    storeFail_(
      "STORE_DRIVE_FAILURE_TRACKING_READBACK_FAILED",
      "Drive operation tracking readback did not match."
    );
  }
  return tracked;
}

function storeClearDriveFailure_(key) {
  try {
    PropertiesService.getScriptProperties().deleteProperty(String(key || ""));
  } catch (ignoredDriveFailureClearError) {}
}

function storeClearDriveFailureIfState_(key, expectedState) {
  try {
    var properties = PropertiesService.getScriptProperties();
    var raw = String(properties.getProperty(String(key || "")) || "");
    if (!raw) return;
    var tracked = JSON.parse(raw);
    if (String(tracked.state || "") === String(expectedState || "")) {
      properties.deleteProperty(String(key || ""));
    }
  } catch (ignoredConditionalDriveFailureClearError) {}
}

function storeAssertNoUnresolvedDriveCleanup_(key, label) {
  var raw = "";
  try {
    raw = String(
      PropertiesService.getScriptProperties().getProperty(String(key || "")) ||
      ""
    );
  } catch (failureReadError) {
    storeFail_(
      "STORE_DRIVE_FAILURE_TRACKING_READ_FAILED",
      label + " cleanup tracking could not be read."
    );
  }
  if (!raw) return;
  var tracked;
  try { tracked = JSON.parse(raw); }
  catch (parseError) {
    storeFail_(
      "STORE_DRIVE_CLEANUP_UNRESOLVED",
      label + " has malformed Drive cleanup tracking; manual review is required."
    );
  }
  if (String(tracked.state || "") === "CLEANUP_FAILED") {
    storeFail_(
      "STORE_DRIVE_CLEANUP_UNRESOLVED",
      label + " has an unresolved permanent-delete failure; manual review is required before retry."
    );
  }
  if ([
    "ATTEMPT_STARTED", "OUTCOME_UNCERTAIN",
    "CREATED_VERIFIED", "PUBLICATION_UNCERTAIN"
  ].indexOf(String(tracked.state || "")) >= 0) {
    storeFail_(
      "STORE_DRIVE_OUTCOME_UNRESOLVED",
      label + " has an unresolved Drive operation outcome; inspect the exact tracked resource before retry."
    );
  }
}

function storeAssertNoUnresolvedDriveSetupOutcome_() {
  var properties = PropertiesService.getScriptProperties().getProperties();
  var unresolved = Object.keys(properties || {}).filter(function (key) {
    if (key.indexOf(RENEWAL_STORE.DRIVE_FAILURE_PREFIX + "SETUP_") !== 0) return false;
    try {
      return [
        "ATTEMPT_STARTED", "OUTCOME_UNCERTAIN", "CREATED_VERIFIED",
        "PUBLICATION_UNCERTAIN", "CLEANUP_FAILED"
      ].indexOf(
        String(JSON.parse(String(properties[key] || "{}")).state || "")
      ) >= 0;
    } catch (parseError) {
      return true;
    }
  });
  if (unresolved.length) {
    storeFail_(
      "STORE_SETUP_DRIVE_OUTCOME_UNRESOLVED",
      "A prior setup Drive create has an unknown outcome. Inspect the tracked resource before retrying setup."
    );
  }
}

function storePermanentlyDeleteNewDriveItem_(
  item, resourceId, label, mimeType, originalError, failureKey, operation
) {
  var id = String(resourceId || "");
  try {
    if (!id && item && typeof item.getId === "function") id = String(item.getId() || "");
  } catch (ignoredDeleteIdReadError) {}
  var deleteError = null;
  try {
    if (!id || typeof Drive === "undefined" || !Drive.Files ||
        typeof Drive.Files.remove !== "function") {
      throw new Error("Advanced Drive permanent delete is unavailable.");
    }
    Drive.Files.remove(id, { supportsAllDrives: true });
    storeClearDriveFailure_(failureKey);
    return true;
  } catch (error) {
    deleteError = error;
  }

  try {
    if (item && typeof item.setShareableByEditors === "function") {
      item.setShareableByEditors(false);
    }
  } catch (ignoredReshareFallbackError) {}
  try { if (item) storeMakePrivate_(item); } catch (ignoredPrivateFallbackError) {}
  try {
    var permissionPage = Drive.Permissions &&
      typeof Drive.Permissions.list === "function" ?
      Drive.Permissions.list(id, {
        pageSize: 100,
        supportsAllDrives: true,
        fields: "permissions(id,role,deleted),nextPageToken"
      }) : null;
    if (permissionPage && Array.isArray(permissionPage.permissions) &&
        !permissionPage.nextPageToken &&
        Drive.Permissions &&
        typeof Drive.Permissions.remove === "function") {
      permissionPage.permissions.forEach(function (permission) {
        permission = permission || {};
        if (permission.deleted === true ||
            String(permission.role || "").toLowerCase() === "owner" ||
            !String(permission.id || "")) return;
        Drive.Permissions.remove(
          id, String(permission.id), { supportsAllDrives: true }
        );
      });
    }
  } catch (ignoredPermissionFallbackError) {}
  try {
    if (item && typeof item.setTrashed === "function") item.setTrashed(true);
  } catch (ignoredTrashFallbackError) {}
  var cleanupTracked = storePersistDriveFailure_(
    failureKey,
    "CLEANUP_FAILED",
    operation || {
      scope: "GENERAL", action: "DELETE", name: "", mimeType: mimeType,
      parentId: "", label: label
    },
    id,
    deleteError
  );
  var cleanupError = new Error(
    String(originalError && originalError.message || originalError) +
    " The newly created " + label + " could not be permanently deleted; manual review is required. ID=" +
    (id || "unknown") +
    (cleanupTracked ? "" : " Drive failure tracking also failed; inspect execution logs.")
  );
  cleanupError.code = "STORE_DRIVE_CLEANUP_FAILED";
  cleanupError.storeDriveCleanupFailed = true;
  cleanupError.storeDriveResourceId = id;
  cleanupError.storeDriveTrackingFailed = !cleanupTracked;
  throw cleanupError;
}

function storeCleanupUnpublishedSetupResources_(
  items, originalError, setupDriveFailureKeys
) {
  // Every setup resource is a descendant of the new dedicated data folder.
  // Permanently deleting that unpublished folder removes the whole partial
  // tree as one unit and avoids leaving a child behind between delete calls.
  var dataFolder = items && items.length ? items[items.length - 1] : null;
  var dataFolderId = "";
  try {
    dataFolderId = String(dataFolder && dataFolder.getId ?
      dataFolder.getId() : "");
  } catch (ignoredSetupCleanupIdError) {}
  var cleanupOperation = {
    scope: "SETUP",
    action: "CLEANUP",
    name: dataFolderId,
    mimeType: "application/vnd.google-apps.folder",
    parentId: "",
    label: "unpublished setup tree"
  };
  storePermanentlyDeleteNewDriveItem_(
    dataFolder,
    dataFolderId,
    "unpublished setup tree",
    "application/vnd.google-apps.folder",
    originalError,
    storeDriveFailureKey_(cleanupOperation),
    cleanupOperation
  );
  (setupDriveFailureKeys || []).forEach(function (failureKey) {
    storeClearDriveFailure_(failureKey);
  });
  if (originalError && originalError.storeDriveFailureKey) {
    storeClearDriveFailure_(originalError.storeDriveFailureKey);
  }
  throw originalError;
}

/** Make the dedicated resources private before storing their IDs. */
function storeMakePrivate_(resource) {
  if (!resource) storeFail_("STORE_ACL_RESOURCE_MISSING", "Dedicated storage resource is missing.");
  if (typeof resource.setSharing === "function" && typeof DriveApp.Access !== "undefined" && typeof DriveApp.Permission !== "undefined") {
    resource.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
  }
}

function storeSecureBackupFile_(file, label) {
  try {
    ["setSharing", "getSharingAccess", "getEditors", "getViewers"].forEach(function (method) {
      if (!file || typeof file[method] !== "function") {
        storeFail_(
          "STORE_BACKUP_ACL_INSPECTION_UNAVAILABLE",
          "The backup ACL API is unavailable; backup use was stopped."
        );
      }
    });
    storeMakePrivate_(file);
    storeAssertResourcePrivate_(file, label || "store backup");
  } catch (error) {
    if (error && error.code) throw error;
    storeFail_(
      "STORE_BACKUP_ACL_INSPECTION_FAILED",
      "The backup sharing settings could not be made private and verified."
    );
  }
  return file;
}

/**
 * Fail closed when an ACL API reports public/domain/link sharing or direct
 * collaborators. DriveApp's convenience methods are retained, and Advanced
 * Drive must independently enumerate every permission page.  A partial ACL
 * listing is not owner-only evidence.
 */
function storeAssertResourcePrivate_(resource, label) {
  if (!resource) storeFail_("STORE_ACL_RESOURCE_MISSING", label + " missing.");
  if (typeof resource.getSharingAccess === "function") {
    var access = String(resource.getSharingAccess());
    var privateValue = (typeof DriveApp.Access !== "undefined" && DriveApp.Access.PRIVATE) ? String(DriveApp.Access.PRIVATE) : "PRIVATE";
    if (access !== privateValue && access !== "PRIVATE") {
      storeFail_("STORE_ACL_NOT_PRIVATE", label + " is shared by link/domain/anyone.");
    }
  }
  ["getEditors", "getViewers", "getCommenters"].forEach(function(method) {
    if (typeof resource[method] !== "function") return;
    var people = resource[method]() || [];
    if (people.length) storeFail_("STORE_ACL_UNEXPECTED_COLLABORATOR", label + " has direct collaborators.");
  });
  storeAssertAdvancedDriveOwnerOnly_(resource, label);
}

function storeAssertAdvancedDriveOwnerOnly_(resource, label) {
  var resourceId = "";
  try {
    if (resource && typeof resource.getId === "function") {
      resourceId = String(resource.getId() || "");
    }
  } catch (idError) {
    storeFail_(
      "STORE_ACL_PERMISSION_LIST_FAILED",
      label + " ID could not be read for permission inspection."
    );
  }
  if (!resourceId) {
    storeFail_(
      "STORE_ACL_PERMISSION_LIST_FAILED",
      label + " ID is unavailable for permission inspection."
    );
  }
  if (typeof Drive === "undefined" || !Drive.Permissions ||
      typeof Drive.Permissions.list !== "function") {
    storeFail_(
      "STORE_ACL_PERMISSION_LIST_UNAVAILABLE",
      "Advanced Drive permission inspection is unavailable; " +
      label + " use was stopped."
    );
  }

  var pageToken = "";
  var seenTokens = {};
  var ownerCount = 0;
  var pageCount = 0;
  do {
    if (pageToken && seenTokens[pageToken]) {
      storeFail_(
        "STORE_ACL_PERMISSION_PAGING_INVALID",
        label + " permission pagination repeated a token."
      );
    }
    if (pageToken) seenTokens[pageToken] = true;
    pageCount += 1;
    if (pageCount > 10000) {
      storeFail_(
        "STORE_ACL_PERMISSION_PAGING_INVALID",
        label + " permission pagination exceeded the safety limit."
      );
    }

    var page;
    try {
      var listOptions = {
        pageSize: 100,
        supportsAllDrives: true,
        fields:
          "nextPageToken,permissions(id,type,role,deleted,emailAddress,domain,pendingOwner)"
      };
      if (pageToken) listOptions.pageToken = pageToken;
      page = Drive.Permissions.list(resourceId, listOptions);
    } catch (listError) {
      if (listError && listError.code) throw listError;
      storeFail_(
        "STORE_ACL_PERMISSION_LIST_FAILED",
        label + " permissions could not be completely listed."
      );
    }
    if (!page || !Array.isArray(page.permissions)) {
      storeFail_(
        "STORE_ACL_PERMISSION_LIST_FAILED",
        label + " permission page is incomplete."
      );
    }
    page.permissions.forEach(function (permission) {
      permission = permission || {};
      if (permission.deleted === true) return;
      var role = String(permission.role || "").toLowerCase();
      var type = String(permission.type || "").toLowerCase();
      if (!String(permission.id || "") || !role || !type) {
        storeFail_(
          "STORE_ACL_PERMISSION_ENTRY_INVALID",
          label + " contains an incomplete permission entry."
        );
      }
      if (role !== "owner" || type !== "user" ||
          permission.pendingOwner === true) {
        storeFail_(
          "STORE_ACL_UNEXPECTED_PERMISSION",
          label + " has a non-owner permission."
        );
      }
      ownerCount += 1;
    });
    var nextToken = page.nextPageToken;
    if (nextToken !== undefined && nextToken !== null &&
        typeof nextToken !== "string") {
      storeFail_(
        "STORE_ACL_PERMISSION_PAGING_INVALID",
        label + " permission pagination token is invalid."
      );
    }
    pageToken = String(nextToken || "");
  } while (pageToken);

  if (ownerCount !== 1) {
    storeFail_(
      "STORE_ACL_OWNER_INVALID",
      label + " must have exactly one owner permission."
    );
  }
}

function storeAssertDedicatedResourcesPrivate_(spreadsheetId, dataFolderId, backupFolderId) {
  try {
    storeAssertResourcePrivate_(DriveApp.getFileById(spreadsheetId), "data spreadsheet");
    storeAssertResourcePrivate_(DriveApp.getFolderById(dataFolderId), "data folder");
    storeAssertResourcePrivate_(DriveApp.getFolderById(backupFolderId), "backup folder");
  } catch (error) {
    if (error && error.code) throw error;
    storeFail_("STORE_ACL_INSPECTION_FAILED", "Cannot verify dedicated storage sharing settings.");
  }
}

function storeWithLock_(callback) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(RENEWAL_STORE.LOCK_TIMEOUT_MS)) {
    storeFail_("STORE_LOCK_TIMEOUT", "別の更新処理が実行中です。しばらく待って再実行してください。");
  }
  try {
    var auditRecovery = storeRecoverPreparedAuditedRowsIfConfigured_();
    return callback(auditRecovery);
  } finally {
    lock.releaseLock();
  }
}

function storeSha256_(value) {
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(value),
    Utilities.Charset.UTF_8
  );
  return bytes.map(function (byte) {
    return (byte & 255).toString(16).padStart(2, "0");
  }).join("");
}

function storeStableStringify_(value) {
  var seen = [];
  function normalize(item) {
    if (item === null || typeof item === "string" || typeof item === "boolean") return item;
    if (typeof item === "number") {
      if (!Number.isFinite(item)) storeFail_("STORE_JSON_NUMBER_INVALID", "数値に保存できない値があります。");
      return item;
    }
    if (item === undefined) return null;
    if (typeof item !== "object") storeFail_("STORE_JSON_TYPE_INVALID", "保存できないデータ型があります。");
    if (seen.indexOf(item) >= 0) storeFail_("STORE_JSON_CYCLE", "循環参照を含むデータは保存できません。");
    seen.push(item);
    var result;
    if (Array.isArray(item)) {
      result = item.map(normalize);
    } else {
      result = {};
      Object.keys(item).sort().forEach(function (key) {
        if (key === "__proto__" || key === "constructor" || key === "prototype") {
          storeFail_("STORE_JSON_KEY_INVALID", "保存できない項目名があります。");
        }
        if (item[key] !== undefined) result[key] = normalize(item[key]);
      });
    }
    seen.pop();
    return result;
  }
  return JSON.stringify(normalize(value));
}

function storeUuid_() {
  return String(Utilities.getUuid()).replace(/[^A-Za-z0-9-]/g, "");
}

function storeNowIso_() {
  return new Date().toISOString();
}

function storeFail_(code, message) {
  var error = new Error(message);
  error.code = code;
  throw error;
}
