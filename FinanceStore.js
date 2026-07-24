// @ts-nocheck
/*
 * CDP 更新講習システム - 会計イベントストア
 *
 * Finance.js の純粋な会計ドメインを、DataStore.js が作成した専用 Spreadsheet
 * に保存する。正本は append-only の finance_events だけであり、現在状態は
 * 30,000文字ごとの checkpoint、一覧シートは再生成できる派生物である。
 *
 * コミット順序は event -> checkpoint -> meta -> projection -> audit。
 * event 追加後のどこで停止しても、次回読込時に event を決定論的に再生して
 * checkpoint と派生物を自己修復する。既存資料スプレッドシートには書き込まない。
 */

var FINANCE_STORE = {
  SCHEMA_VERSION: 2,
  EVENT_FORMAT: "CDP_RENEWAL_FINANCE_EVENT_V2",
  CHECKPOINT_FORMAT: "CDP_RENEWAL_FINANCE_CHECKPOINT_V2",
  BACKUP_FORMAT: "CDP_RENEWAL_FINANCE_BACKUP_V2",
  BACKUP_FORMAT_VERSION: 2,
  APPROVAL_TTL_HOURS: 48,
  FULL_REPLAY_INTERVAL_HOURS: 24,
  CELL_CHAR_LIMIT: 50000,
  CHUNK_CHAR_SIZE: 30000,
  MAX_COMMAND_CHARS: 30000,
  MAX_SHEET_ROWS: 200000,
  IDEMPOTENCY_KEY_MAX_CHARS: 160,
  DRIVE_FAILURE_PREFIX: "CDP_RENEWAL_FINANCE_DRIVE_FAILURE_V1_",
  SETUP_CONFIRM: "CREATE_FINANCE_LEDGER_IN_DEDICATED_STORE",
  HIGH_RISK_COMMANDS: [
    "CREATE_CREDIT_NOTE",
    "REVERSE_INVOICE",
    "CORRECT_INVOICE",
    "REVERSE_CREDIT_NOTE",
    "REVERSE_ALLOCATION",
    "REVERSE_RECEIPT",
    "REVERSE_REFUND",
    "REVERSE_SETTLEMENT",
    "RECORD_REFUND",
    "RECORD_SETTLEMENT",
    "CLOSE_PERIOD",
    "POST_JOURNAL",
    "REVERSE_JOURNAL"
  ]
};

var FINANCE_STORE_SCHEMAS = {
  finance_meta: ["key", "value"],
  finance_events: [
    "eventId", "revision", "committedAt", "actor", "commandType",
    "commandHash", "commandJson", "previousStateHash", "stateHash",
    "previousEventHash", "eventHash", "approvalRequestId", "requestedBy",
    "reasonCode", "correlationId", "format", "schemaVersion"
  ],
  finance_state_chunks: [
    "checkpointId", "revision", "stateHash", "chunkIndex", "chunkCount",
    "chunkHash", "stateChunk", "createdAt", "createdBy", "format", "schemaVersion"
  ],
  finance_audit: [
    "auditId", "timestamp", "eventState", "action", "actor", "reasonCode",
    "approver", "fromRevision", "toRevision", "beforeHash", "afterHash",
    "snapshotId", "approvalRequestId", "correlationId", "schemaVersion"
  ],
  finance_approval_requests: [
    "requestId", "requestedAt", "requestedBy", "expiresAt", "status",
    "expectedRevision", "commandType", "commandHash", "commandJson",
    "reasonCode", "approvedAt", "approvedBy", "executedRevision",
    "correlationId", "schemaVersion"
  ],
  invoices: [
    "entityId", "revision", "invoiceNo", "customerId", "status",
    "invoiceDate", "accountingDate", "dueDate", "totalExTax", "totalTax",
    "totalInclTax", "immutableKey", "payloadHash", "payloadJson"
  ],
  invoice_lines: [
    "entityId", "revision", "invoiceId", "description", "quantity",
    "unitAmount", "amount", "taxCategory", "payloadHash", "payloadJson"
  ],
  payments: [
    "entityId", "revision", "customerId", "kind", "transactionDate",
    "amount", "method", "immutableKey", "payloadHash", "payloadJson"
  ],
  payment_allocations: [
    "entityId", "revision", "paymentId", "invoiceId", "allocationDate",
    "amount", "reversalOfAllocationId", "immutableKey", "payloadHash", "payloadJson"
  ],
  credit_notes: [
    "entityId", "revision", "creditNoteNo", "invoiceId", "kind",
    "accountingDate", "amount", "immutableKey", "payloadHash", "payloadJson"
  ],
  closing_periods: [
    "entityId", "revision", "startDate", "endDate", "closedAt",
    "closedBy", "immutableKey", "payloadHash", "payloadJson"
  ],
  journal_entries: [
    "entityId", "revision", "accountingDate", "description", "sourceType",
    "sourceId", "immutableKey", "payloadHash", "payloadJson"
  ]
};

// バックアップ台帳は正本・投影ではないため、必要時に追加する。
var FINANCE_STORE_BACKUP_SCHEMA = [
  "backupId", "createdAt", "createdBy", "revision", "stateHash",
  "contentHash", "driveFileId", "status", "noteCode", "schemaVersion"
];

function financeStoreSetup_(input) {
  input = input || {};
  if (String(input.confirm || "") !== FINANCE_STORE.SETUP_CONFIRM) {
    financeStoreFail_("FINANCE_SETUP_CONFIRM_REQUIRED", "会計台帳作成の確認文字列が一致しません。");
  }
  return storeWithLock_(function () {
    var spreadsheet = storeOpen_();
    var actor = storeActorEmail_();
    storeRequirePermission_(spreadsheet, actor, "role.write");

    if (financeStoreIsConfigured_(spreadsheet)) {
      financeStoreAssertSchema_(spreadsheet);
      var existingEvents = financeStoreReadEvents_(spreadsheet);
      var existingMeta = financeStoreReadMeta_(spreadsheet);
      if (!existingEvents.length && String(existingMeta.setupState || "") === "INITIALIZING") {
        financeStoreResumeGenesis_(spreadsheet, actor, existingMeta);
      }
      return financeStoreState_(spreadsheet, actor);
    }

    financeStoreCreateSheets_(spreadsheet);
    var initial = financeCreateState_(input.companyPolicy || {});
    var initialPolicyJson = financeStoreStableStringify_(initial.companyPolicy);
    financeStoreAssertCommandSize_(initialPolicyJson);
    var now = financeStoreNow_();
    financeStoreWriteMeta_(spreadsheet, {
      schemaVersion: FINANCE_STORE.SCHEMA_VERSION,
      financeSchemaVersion: FINANCE_SCHEMA_VERSION,
      setupState: "INITIALIZING",
      initialPolicyJson: initialPolicyJson,
      initializedAt: now,
      initializedBy: actor,
      currentRevision: "",
      currentStateHash: "",
      projectionRevision: ""
    });

    var genesis = financeStoreBuildEvent_({
      revision: 0,
      committedAt: now,
      actor: actor,
      command: { type: "INITIALIZE", data: { companyPolicy: initial.companyPolicy } },
      previousStateHash: "",
      stateHash: financeHash_(initial),
      previousEventHash: "",
      approvalRequestId: "",
      requestedBy: actor,
      reasonCode: "INITIALIZE"
    });
    financeStoreAppendEventDurably_(spreadsheet, genesis);
    var recovery = financeStoreTryFinalizeDerived_(spreadsheet, initial, genesis, actor);
    var result = financeStoreStateResult_(spreadsheet, actor, initial, genesis, recovery);
    result.success = true;
    result.committed = true;
    return result;
  });
}

function financeStoreResumeGenesis_(spreadsheet, actor, meta) {
  var policy;
  try { policy = JSON.parse(String(meta.initialPolicyJson || "")); }
  catch (error) {
    financeStoreFail_("FINANCE_SETUP_RECOVERY_INVALID", "初期設定の復旧情報が不正です。");
  }
  var initial = financeCreateState_(policy || {});
  var now = financeStoreNow_();
  var genesis = financeStoreBuildEvent_({
    revision: 0,
    committedAt: now,
    actor: String(meta.initializedBy || actor),
    command: { type: "INITIALIZE", data: { companyPolicy: initial.companyPolicy } },
    previousStateHash: "",
    stateHash: financeHash_(initial),
    previousEventHash: "",
    approvalRequestId: "",
    requestedBy: String(meta.initializedBy || actor),
    reasonCode: "INITIALIZE"
  });
  financeStoreAppendEventDurably_(spreadsheet, genesis);
  financeStoreTryFinalizeDerived_(spreadsheet, initial, genesis, actor);
}

function financeStoreGetState_() {
  var spreadsheet = storeOpen_();
  var actor = storeActorEmail_();
  var role = storeRequirePermission_(
    spreadsheet, actor, "accounting.write"
  );
  financeStoreAssertSchema_(spreadsheet);
  var current = financeStoreReadCurrent_(spreadsheet, actor);
  return {
    configured: true,
    role: role,
    revision: current.state.revision,
    stateHash: current.stateHash,
    state: current.state,
    positions: financeStoreBuildPositions_(current.state),
    recoveryNeeded: current.recoveryNeeded === true,
    recoveryCode: current.recoveryCode || ""
  };
}

function financeStoreExecute_(input) {
  input = input || {};
  var command = input.command || {};
  var commandType = String(command.type || "");
  if (financeStoreNeedsApproval_(commandType)) {
    financeStoreFail_(
      "FINANCE_SECOND_APPROVAL_REQUIRED",
      "この会計操作は別担当者の承認が必要です。承認依頼を作成してください。"
    );
  }
  return financeStoreExecuteApproved_(input, "", "");
}

function financeStoreRequestApproval_(input) {
  input = input || {};
  return storeWithLock_(function () {
    var spreadsheet = storeOpen_();
    var actor = storeActorEmail_();
    storeRequirePermission_(spreadsheet, actor, "accounting.write");
    financeStoreAssertSchema_(spreadsheet);
    var submittedCommand = input.command || {};
    var commandType = String(submittedCommand.type || "");
    if (!financeStoreNeedsApproval_(commandType)) {
      financeStoreFail_("FINANCE_APPROVAL_NOT_REQUIRED", "この操作は二者承認の対象ではありません。");
    }
    var reasonCode = financeStoreReasonCode_(input.reasonCode);
    var expectedRevision = financeStoreRevision_(input.expectedRevision);
    var requestIdempotencyKey = financeStoreResolveIdempotencyKey_(
      input.idempotencyKey,
      actor,
      expectedRevision,
      submittedCommand,
      "REQUEST_APPROVAL"
    );
    financeStoreRecoverApprovalStatuses_(spreadsheet);
    var existingRequest = financeStoreFindApprovalByCorrelation_(
      spreadsheet, requestIdempotencyKey
    );
    if (existingRequest) {
      return financeStorePriorApprovalRequestResult_(
        spreadsheet,
        existingRequest,
        actor,
        expectedRevision,
        submittedCommand,
        reasonCode,
        requestIdempotencyKey
      );
    }
    var current = financeStoreReadCurrent_(spreadsheet, actor);
    if (current.state.revision !== expectedRevision) {
      financeStoreFail_("CONCURRENT_MODIFICATION", "会計台帳が更新されています。再読込してください。");
    }
    // 発行者・振込先はブラウザ入力を信用しない。承認依頼へ保存する前に、
    // 共有正本とサーバー側事業者設定から正式スナップショットを封印する。
    var command = financeStorePrepareServerCommand_(
      spreadsheet, current.state, submittedCommand
    );
    if (financeStoreIsSealedReversalCommand_(commandType) ||
        commandType === "CORRECT_INVOICE") {
      // 不可能な訂正（部分取消指定、消込・返金残存、二重反転、
      // 締め済日など）は、
      // 承認待ちへ積む前に純粋ドメインで検査する。検査用stateは破棄する。
      financeApplyCommand_(current.state, command, {
        actorId: actor,
        at: financeStoreNow_()
      });
    }
    var commandJson = financeStoreCanonicalCommandJson_(command);
    var now = financeStoreNow_();
    var expiresAt = new Date(
      new Date(now).getTime() + FINANCE_STORE.APPROVAL_TTL_HOURS * 60 * 60 * 1000
    ).toISOString();
    var requestId = Utilities.getUuid();
    var correlationId = requestIdempotencyKey;
    financeStoreAppend_(spreadsheet, "finance_approval_requests", {
      requestId: requestId,
      requestedAt: now,
      requestedBy: actor,
      expiresAt: expiresAt,
      status: "PENDING",
      expectedRevision: expectedRevision,
      commandType: commandType,
      commandHash: financeHash_(command),
      commandJson: commandJson,
      reasonCode: reasonCode,
      approvedAt: "",
      approvedBy: "",
      executedRevision: "",
      correlationId: correlationId,
      schemaVersion: FINANCE_STORE.SCHEMA_VERSION
    });
    financeStoreAppendAudit_(spreadsheet, {
      eventState: "PENDING_APPROVAL",
      action: commandType,
      actor: actor,
      reasonCode: reasonCode,
      fromRevision: expectedRevision,
      toRevision: "",
      beforeHash: current.stateHash,
      afterHash: "",
      approvalRequestId: requestId,
      correlationId: correlationId
    });
    return {
      success: true,
      pendingApproval: true,
      requestId: requestId,
      idempotencyKey: correlationId,
      requestedAt: now,
      expiresAt: expiresAt,
      expectedRevision: expectedRevision,
      status: "PENDING",
      idempotentReplay: false
    };
  });
}

function financeStoreFindApprovalByCorrelation_(spreadsheet, correlationId) {
  var key = String(correlationId || "");
  var matches = financeStoreReadObjects_(
    spreadsheet, "finance_approval_requests"
  ).filter(function (row) {
    return String(row.correlationId || "") === key;
  });
  if (matches.length > 1) {
    financeStoreFail_(
      "FINANCE_IDEMPOTENCY_DUPLICATE",
      "同じidempotencyKeyの承認依頼が複数あります。"
    );
  }
  return matches[0] || null;
}

function financeStorePriorApprovalRequestResult_(
  spreadsheet, request, actor, expectedRevision, submittedCommand,
  reasonCode, idempotencyKey
) {
  var storedCommand;
  try {
    storedCommand = JSON.parse(String(request.commandJson || ""));
  } catch (error) {
    financeStoreFail_("FINANCE_APPROVAL_TAMPERED", "承認依頼を読み取れません。");
  }
  var storedCommandJson = financeStoreStableStringify_(storedCommand);
  var same = String(request.requestedBy || "").toLowerCase() ===
      String(actor || "").toLowerCase() &&
    Number(request.expectedRevision) === Number(expectedRevision) &&
    String(request.commandType || "") === String((submittedCommand || {}).type || "") &&
    String(request.commandJson || "") === storedCommandJson &&
    String(request.commandHash || "") === financeHash_(storedCommand) &&
    financeStoreSubmittedCommandMatches_(storedCommand, submittedCommand) &&
    String(request.reasonCode || "") === String(reasonCode || "");
  if (!same) {
    financeStoreFail_(
      "FINANCE_IDEMPOTENCY_CONFLICT",
      "同じidempotencyKeyが別の承認依頼に使用されています。再実行を停止しました。"
    );
  }
  financeStoreEnsureApprovalRequestAudit_(spreadsheet, request);
  var status = String(request.status || "");
  return {
    success: true,
    pendingApproval: status === "PENDING",
    requestId: String(request.requestId || ""),
    idempotencyKey: String(idempotencyKey || ""),
    requestedAt: String(request.requestedAt || ""),
    expiresAt: String(request.expiresAt || ""),
    expectedRevision: Number(request.expectedRevision),
    status: status,
    approvedAt: String(request.approvedAt || ""),
    approvedBy: String(request.approvedBy || ""),
    executedRevision: request.executedRevision === "" ?
      "" : Number(request.executedRevision),
    idempotentReplay: true
  };
}

function financeStoreEnsureApprovalRequestAudit_(spreadsheet, request) {
  var matches = financeStoreReadObjects_(
    spreadsheet, "finance_audit"
  ).filter(function (row) {
    return String(row.eventState || "") === "PENDING_APPROVAL" &&
      String(row.correlationId || "") === String(request.correlationId || "") &&
      String(row.approvalRequestId || "") === String(request.requestId || "");
  });
  if (matches.length > 1) {
    financeStoreFail_(
      "FINANCE_APPROVAL_AUDIT_DUPLICATE",
      "承認依頼の監査行が重複しています。"
    );
  }
  var chain = financeStoreValidateEventChain_(
    financeStoreReadEvents_(spreadsheet)
  );
  var expectedRevision = financeStoreRevision_(request.expectedRevision);
  var expectedEvent = chain.events[expectedRevision];
  if (!expectedEvent) {
    financeStoreFail_(
      "FINANCE_APPROVAL_AUDIT_MISMATCH",
      "承認依頼の対象版が会計イベントにありません。"
    );
  }
  if (!matches.length) {
    financeStoreAppendAudit_(spreadsheet, {
      eventState: "PENDING_APPROVAL",
      action: request.commandType,
      actor: request.requestedBy,
      reasonCode: request.reasonCode,
      fromRevision: expectedRevision,
      toRevision: "",
      beforeHash: expectedEvent.stateHash,
      afterHash: "",
      approvalRequestId: request.requestId,
      correlationId: request.correlationId
    });
    return;
  }
  var audit = matches[0];
  if (String(audit.action || "") !== String(request.commandType || "") ||
      String(audit.actor || "").toLowerCase() !==
        String(request.requestedBy || "").toLowerCase() ||
      String(audit.reasonCode || "") !== String(request.reasonCode || "") ||
      Number(audit.fromRevision) !== expectedRevision ||
      String(audit.toRevision || "") !== "" ||
      String(audit.beforeHash || "") !== expectedEvent.stateHash ||
      String(audit.afterHash || "") !== "" ||
      String(audit.approver || "") !== "") {
    financeStoreFail_(
      "FINANCE_APPROVAL_AUDIT_MISMATCH",
      "承認依頼と監査行が一致しません。"
    );
  }
}

function financeStoreApprove_(input) {
  input = input || {};
  return storeWithLock_(function () {
    var spreadsheet = storeOpen_();
    var approver = storeActorEmail_();
    storeRequirePermission_(spreadsheet, approver, "accounting.write");
    financeStoreAssertSchema_(spreadsheet);
    financeStoreRecoverApprovalStatuses_(spreadsheet);
    var request = financeStoreFindApproval_(spreadsheet, input.requestId);
    if (!request) {
      financeStoreFail_("FINANCE_APPROVAL_NOT_PENDING", "有効な承認待ち依頼が見つかりません。");
    }
    var command;
    try { command = JSON.parse(request.commandJson); }
    catch (error) {
      financeStoreFail_("FINANCE_APPROVAL_TAMPERED", "承認依頼を読み取れません。");
    }
    if (financeStoreStableStringify_(command) !== request.commandJson ||
        financeHash_(command) !== request.commandHash ||
        String(command.type || "") !== request.commandType) {
      financeStoreFail_("FINANCE_APPROVAL_TAMPERED", "承認依頼の内容が一致しないため停止しました。");
    }
    if (request.status === "APPROVED_EXECUTED") {
      var approvedCurrent = financeStoreReadCurrent_(spreadsheet, approver);
      var approvedEvent = approvedCurrent.events.filter(function (event) {
        return event.approvalRequestId === request.requestId;
      })[0];
      if (!approvedEvent || approvedEvent.actor !== approver) {
        financeStoreFail_("FINANCE_APPROVAL_NOT_PENDING", "この承認依頼は別の担当者が処理済みです。");
      }
      if (String(input.idempotencyKey || "").trim() &&
          String(input.idempotencyKey || "").normalize("NFKC").trim() !==
            approvedEvent.correlationId) {
        financeStoreFail_(
          "FINANCE_IDEMPOTENCY_CONFLICT",
          "承認済み操作と異なるidempotencyKeyが指定されています。"
        );
      }
      var replayResult = financeStorePriorCommitResult_(
        approvedCurrent,
        approvedEvent,
        command,
        approver,
        request.requestId,
        request.requestedBy,
        request.reasonCode
      );
      replayResult.approvalRequestId = request.requestId;
      return replayResult;
    }
    if (request.status !== "PENDING") {
      financeStoreFail_("FINANCE_APPROVAL_NOT_PENDING", "有効な承認待ち依頼が見つかりません。");
    }
    if (request.requestedBy === approver) {
      financeStoreFail_("FINANCE_SELF_APPROVAL_FORBIDDEN", "申請者本人は承認できません。");
    }
    if (new Date(request.expiresAt).getTime() <= Date.now()) {
      financeStoreUpdateApproval_(spreadsheet, request, {
        status: "EXPIRED",
        approvedAt: financeStoreNow_(),
        approvedBy: approver
      });
      financeStoreFail_("FINANCE_APPROVAL_EXPIRED", "承認期限が切れています。再申請してください。");
    }
    var result;
    try {
      result = financeStoreCommitUnlocked_(spreadsheet, {
        expectedRevision: request.expectedRevision,
        command: command,
        reasonCode: request.reasonCode,
        idempotencyKey: input.idempotencyKey
      }, approver, request.requestId, request.requestedBy);
    } catch (error) {
      if (error && error.code === "CONCURRENT_MODIFICATION") {
        financeStoreUpdateApproval_(spreadsheet, request, { status: "STALE" });
        financeStoreAppendAudit_(spreadsheet, {
          eventState: "STALE",
          action: request.commandType,
          actor: request.requestedBy,
          reasonCode: request.reasonCode,
          approver: approver,
          fromRevision: request.expectedRevision,
          toRevision: "",
          approvalRequestId: request.requestId,
          correlationId: request.correlationId
        });
      }
      throw error;
    }
    try {
      financeStoreUpdateApproval_(spreadsheet, request, {
        status: "APPROVED_EXECUTED",
        approvedAt: financeStoreNow_(),
        approvedBy: approver,
        executedRevision: result.state.revision
      });
    } catch (approvalError) {
      result.recoveryNeeded = true;
      result.recoveryCode = result.recoveryCode || "FINANCE_APPROVAL_STATUS_RECOVERY_NEEDED";
    }
    result.approvalRequestId = request.requestId;
    return result;
  });
}

function financeStoreRejectApproval_(input) {
  input = input || {};
  return storeWithLock_(function () {
    var spreadsheet = storeOpen_();
    var actor = storeActorEmail_();
    storeRequirePermission_(spreadsheet, actor, "accounting.write");
    financeStoreAssertSchema_(spreadsheet);
    financeStoreRecoverApprovalStatuses_(spreadsheet);
    var request = financeStoreFindApproval_(spreadsheet, input.requestId);
    if (!request || request.status !== "PENDING") {
      financeStoreFail_("FINANCE_APPROVAL_NOT_PENDING", "有効な承認待ち依頼が見つかりません。");
    }
    if (request.requestedBy === actor) {
      financeStoreFail_("FINANCE_SELF_APPROVAL_FORBIDDEN", "申請者本人は承認・却下できません。");
    }
    var reasonCode = financeStoreReasonCode_(input.reasonCode);
    financeStoreUpdateApproval_(spreadsheet, request, {
      status: "REJECTED",
      approvedAt: financeStoreNow_(),
      approvedBy: actor
    });
    financeStoreAppendAudit_(spreadsheet, {
      eventState: "REJECTED",
      action: request.commandType,
      actor: actor,
      reasonCode: reasonCode,
      approver: actor,
      fromRevision: request.expectedRevision,
      toRevision: "",
      approvalRequestId: request.requestId,
      correlationId: request.correlationId
    });
    return { success: true, rejected: true, requestId: request.requestId };
  });
}

function financeStoreListApprovals_(options) {
  options = options || {};
  var context = storeContext_("accounting.write");
  financeStoreAssertSchema_(context.spreadsheet);
  financeStoreRecoverApprovalStatuses_(context.spreadsheet);
  var current = financeStoreReadCurrent_(context.spreadsheet, context.actor);
  return financeStoreReadObjects_(context.spreadsheet, "finance_approval_requests")
    .filter(function (row) {
      return options.includeCompleted === true || row.status === "PENDING";
    })
    .map(function (row) {
      return {
        requestId: String(row.requestId || ""),
        requestedAt: String(row.requestedAt || ""),
        requestedBy: String(row.requestedBy || ""),
        expiresAt: String(row.expiresAt || ""),
        status: String(row.status || ""),
        expectedRevision: Number(row.expectedRevision),
        commandType: String(row.commandType || ""),
        commandHash: String(row.commandHash || ""),
        commandSummary: financeStoreApprovalCommandSummary_(row, current.state),
        reasonCode: String(row.reasonCode || ""),
        approvedAt: String(row.approvedAt || ""),
        approvedBy: String(row.approvedBy || ""),
        executedRevision: row.executedRevision === "" ? "" : Number(row.executedRevision)
      };
    });
}

function financeStoreApprovalCommandSummary_(request, state) {
  var command;
  try { command = JSON.parse(String(request.commandJson || "")); }
  catch (error) {
    financeStoreFail_("FINANCE_APPROVAL_TAMPERED", "承認依頼を読み取れません。");
  }
  if (financeStoreStableStringify_(command) !== String(request.commandJson || "") ||
      financeHash_(command) !== String(request.commandHash || "") ||
      String(command.type || "") !== String(request.commandType || "")) {
    financeStoreFail_("FINANCE_APPROVAL_TAMPERED", "承認依頼の内容が一致しません。");
  }
  var type = String(command.type || "");
  var data = command.data || {};
  var serverTarget = null;
  if (financeStoreIsSealedReversalCommand_(type)) {
    var reSealed = financeStorePrepareSealedReversalCommand_(state, command);
    if (financeStoreStableStringify_(reSealed) !==
        financeStoreStableStringify_(command)) {
      financeStoreFail_(
        "FINANCE_APPROVAL_TAMPERED",
        "反対取引の元取引封印が正本と一致しないため、承認内容を表示できません。"
      );
    }
    serverTarget = reSealed.serverTargetSnapshot;
  } else if (type === "CORRECT_INVOICE") {
    if (String(request.status || "PENDING") === "PENDING") {
      var reSealedCorrection = financeStoreResealCorrectionCommand_(
        state, command
      );
      if (financeStoreStableStringify_(reSealedCorrection) !==
          financeStoreStableStringify_(command)) {
        financeStoreFail_(
          "FINANCE_APPROVAL_TAMPERED",
          "請求訂正の元請求残額・実取消額・新請求額の封印が正本と一致しないため、承認内容を表示できません。"
        );
      }
      serverTarget = reSealedCorrection.serverTargetSnapshot;
    } else {
      // 実行後の現在stateでは元請求が既に全額取消済みであるため、
      // 過去承認を現在残額で再封印しない。保存済み封印と追記済み取引を照合する。
      serverTarget = financeStoreValidateStoredCorrectionSeal_(
        state, command, String(request.status || "")
      );
    }
  }
  var summary = { type: type };
  function set(key, value) {
    if (value !== undefined && value !== null && value !== "") {
      summary[key] = value;
    }
  }
  function find(collection, id) {
    var target = String(id || "");
    return (collection || []).filter(function (item) {
      return String(item.id || "") === target;
    })[0] || null;
  }
  function lineAmount(lines, pricingMode) {
    if (!(lines || []).length) return "";
    try {
      return financeCalculateInvoice_({
        lines: lines,
        pricingMode: pricingMode
      }, state.companyPolicy).totalInclTax;
    } catch (error) {
      return "";
    }
  }
  function setReference(value) {
    var reference = String(value || "").normalize("NFKC").trim();
    if (!reference) return;
    set("referenceNoLast4", reference.slice(-4));
    set("referenceNoHash", financeHash_(reference.toLowerCase()));
  }

  if (type === "CREATE_CREDIT_NOTE" || type === "REVERSE_INVOICE") {
    var sourceInvoice = find(state.invoices, data.invoiceId);
    set("transactionId", data.id);
    set("targetType", "invoice");
    set("targetId", data.invoiceId);
    set("customerId", sourceInvoice && sourceInvoice.customerId);
    var sourceRemaining = "";
    if (sourceInvoice && !(data.lines || []).length) {
      try {
        sourceRemaining = financeRemainingBillingCalculation_(
          state, sourceInvoice
        ).totalInclTax;
      } catch (error) {
        sourceRemaining = sourceInvoice.totalInclTax;
      }
    }
    set("amount", lineAmount(
      data.lines, sourceInvoice && sourceInvoice.pricingMode
    ) || sourceRemaining);
    set("accountingDate", data.accountingDate || data.date);
  } else if (type === "CORRECT_INVOICE") {
    var reversal = data.reversal || {};
    var replacement = data.replacementInvoice || {};
    set("transactionId", reversal.id);
    set("targetType", "invoice");
    set("targetId", reversal.invoiceId);
    set("customerId", serverTarget && serverTarget.customerId);
    set("originalInvoiceAmount",
      serverTarget && serverTarget.originalInvoiceAmount);
    set("cancellationAmount",
      serverTarget && serverTarget.cancellationAmount);
    set("cancellationScope",
      serverTarget && serverTarget.cancellationScope);
    set("expectedOriginalEffectiveBilledAfter",
      serverTarget && serverTarget.expectedOriginalEffectiveBilledAfter);
    set("replacementTargetId", replacement.id);
    set("replacementAmount",
      serverTarget && serverTarget.replacementAmount);
    set("accountingDate",
      reversal.accountingDate || (data.replacementIssue || {}).accountingDate);
  } else if (type === "REVERSE_CREDIT_NOTE") {
    var originalCredit = find(state.credit_notes, data.originalCreditNoteId);
    set("transactionId", data.id);
    set("targetType", "creditNote");
    set("targetId", data.originalCreditNoteId);
    set("customerId", originalCredit && originalCredit.customerId);
    set("amount", originalCredit && originalCredit.totalInclTax);
    set("accountingDate", data.accountingDate);
  } else if (type === "REVERSE_ALLOCATION") {
    var allocation = find(state.payment_allocations, data.originalAllocationId);
    set("transactionId", data.id);
    set("targetType", "allocation");
    set("targetId", data.originalAllocationId);
    set("customerId", allocation && allocation.customerId);
    set("amount", allocation && allocation.amount);
    set("accountingDate", data.accountingDate);
  } else if (type === "REVERSE_RECEIPT" || type === "REVERSE_REFUND") {
    set("transactionId", data.id);
    set("targetType", type === "REVERSE_RECEIPT" ? "receipt" : "refund");
    set("targetId", data.originalPaymentId);
    set("targetKind", serverTarget && serverTarget.targetKind);
    set("customerId", serverTarget && serverTarget.customerId);
    set("amount", serverTarget && serverTarget.amount);
    set("accountingDate", data.accountingDate);
    set("amountSource", "SERVER_ORIGINAL_TRANSACTION");
  } else if (type === "REVERSE_SETTLEMENT") {
    set("transactionId", data.id);
    set("targetType", "settlement");
    set("targetId", data.originalSettlementId);
    set("targetKind", serverTarget && serverTarget.targetKind);
    set("customerId", serverTarget && serverTarget.customerId);
    set("invoiceId", serverTarget && serverTarget.invoiceId);
    set("amount", serverTarget && serverTarget.amount);
    set("accountingDate", data.accountingDate);
    set("amountSource", "SERVER_ORIGINAL_TRANSACTION");
  } else if (type === "RECORD_REFUND") {
    set("transactionId", data.id);
    set("targetType", "customer");
    set("targetId", data.customerId);
    set("customerId", data.customerId);
    set("amount", data.amount);
    set("accountingDate", data.accountingDate || data.paymentDate);
    setReference(data.referenceNo);
  } else if (type === "RECORD_SETTLEMENT") {
    var settlementInvoice = find(state.invoices, data.invoiceId);
    set("transactionId", data.id);
    set("targetType", "invoice");
    set("targetId", data.invoiceId);
    set("customerId", settlementInvoice && settlementInvoice.customerId);
    set("amount", data.amount);
    set("accountingDate", data.accountingDate);
    setReference(data.referenceNo || data.creditNoteNo);
  } else if (type === "CLOSE_PERIOD") {
    set("transactionId", data.id);
    set("targetType", "accountingPeriod");
    set("periodStart", data.startDate);
    set("periodEnd", data.endDate);
  } else if (type === "POST_JOURNAL") {
    var debit = 0;
    (data.lines || []).forEach(function (line) {
      if (String(line.side || "") === "D") debit += Number(line.amount || 0);
    });
    set("transactionId", data.id);
    set("targetType", "journal");
    set("targetId", data.id);
    set("amount", debit);
    set("accountingDate", data.accountingDate);
  } else if (type === "REVERSE_JOURNAL") {
    var originalJournal = find(state.journal_entries, data.originalJournalEntryId);
    var journalAmount = 0;
    ((originalJournal || {}).lines || []).forEach(function (line) {
      if (String(line.side || "") === "D") journalAmount += Number(line.amount || 0);
    });
    set("transactionId", data.id);
    set("targetType", "journal");
    set("targetId", data.originalJournalEntryId);
    set("amount", journalAmount);
    set("accountingDate", data.accountingDate);
  }
  if (summary.amount !== undefined ||
      summary.cancellationAmount !== undefined ||
      summary.replacementAmount !== undefined) {
    summary.amountBasis = [
      "CREATE_CREDIT_NOTE", "REVERSE_INVOICE", "CORRECT_INVOICE",
      "REVERSE_CREDIT_NOTE"
    ].indexOf(type) >= 0 ? "TAX_INCLUDED_JPY" : "JPY";
  }
  return summary;
}

function financeStoreCreateBackup_(input) {
  input = input || {};
  return storeWithLock_(function () {
    var spreadsheet = storeOpen_();
    var actor = storeActorEmail_();
    storeRequirePermission_(spreadsheet, actor, "backup.create");
    return financeStoreCreateRegisteredBackupUnlocked_(
      spreadsheet, actor, input
    );
  });
}

function financeStoreFaultPoint_(point) {
  if (typeof financeStoreRestoreFaultInjection_ === "function") {
    financeStoreRestoreFaultInjection_(String(point || ""));
  }
}

function financeStoreCreatePrivateDriveFileInParent_(options) {
  options = options || {};
  var name = String(options.name || "");
  var mimeType = String(options.mimeType || "");
  var parentId = String(options.parentId || "");
  var description = String(options.description || "");
  var label = String(options.label || "finance Drive file");
  var operation = {
    action: "CREATE",
    operationId: String(options.operationId || ""),
    name: name,
    mimeType: mimeType,
    parentId: parentId,
    label: label
  };
  if (!name || !mimeType || !parentId || !options.blob) {
    financeStoreFail_(
      "FINANCE_DRIVE_CREATE_ARGUMENT_INVALID",
      "The finance Drive create metadata is incomplete."
    );
  }
  financeStoreRequireAdvancedDriveCreation_();
  var failureKey = financeStoreDriveFailureKey_(operation);
  financeStoreAssertNoUnresolvedDriveCleanup_(failureKey, label);
  financeStoreBeginDriveAttempt_(failureKey, operation);
  var resource;
  try {
    resource = Drive.Files.create({
      name: name,
      mimeType: mimeType,
      parents: [parentId],
      description: description
    }, options.blob, {
      fields: "id,name,mimeType,parents,description,trashed",
      supportsAllDrives: true,
      ignoreDefaultVisibility: true
    });
  } catch (createError) {
    var createOutcomeTracked = financeStorePersistDriveFailure_(
      failureKey, "OUTCOME_UNCERTAIN", operation, "", createError
    );
    var createOutcomeError = financeStoreDriveOutcomeUncertainError_(
      "FINANCE_BACKUP_FILE_OUTCOME_UNCERTAIN",
      label + " create result is unknown; the PREPARED intent was retained." +
        (createOutcomeTracked ? "" : " Drive failure tracking also failed; inspect execution logs."),
      createError,
      failureKey
    );
    createOutcomeError.financeDriveTrackingFailed = !createOutcomeTracked;
    throw createOutcomeError;
  }
  return financeStoreFinishNewPrivateDriveFile_(
    resource, name, mimeType, parentId, description, label,
    failureKey, operation
  );
}

function financeStoreCopyPrivateSpreadsheetInParent_(options) {
  options = options || {};
  var sourceId = String(options.sourceId || "");
  var name = String(options.name || "");
  var parentId = String(options.parentId || "");
  var description = String(options.description || "");
  var label = String(options.label || "finance restore staging spreadsheet");
  var mimeType = "application/vnd.google-apps.spreadsheet";
  var operation = {
    action: "COPY",
    operationId: String(options.operationId || ""),
    sourceId: sourceId,
    name: name,
    mimeType: mimeType,
    parentId: parentId,
    label: label
  };
  if (!sourceId || !name || !parentId) {
    financeStoreFail_(
      "FINANCE_DRIVE_COPY_ARGUMENT_INVALID",
      "The finance Drive copy metadata is incomplete."
    );
  }
  financeStoreRequireAdvancedDriveCreation_();
  if (typeof Drive.Files.copy !== "function") {
    financeStoreFail_(
      "FINANCE_DRIVE_API_UNAVAILABLE",
      "Advanced Drive API v3 copy is required for safe restore staging."
    );
  }
  var failureKey = financeStoreDriveFailureKey_(operation);
  financeStoreAssertNoUnresolvedDriveCleanup_(failureKey, label);
  financeStoreBeginDriveAttempt_(failureKey, operation);
  var resource;
  try {
    resource = Drive.Files.copy({
      name: name,
      parents: [parentId],
      description: description
    }, sourceId, {
      fields: "id,name,mimeType,parents,description,trashed",
      supportsAllDrives: true,
      ignoreDefaultVisibility: true
    });
  } catch (copyError) {
    var copyOutcomeTracked = financeStorePersistDriveFailure_(
      failureKey, "OUTCOME_UNCERTAIN", operation, "", copyError
    );
    var copyOutcomeError = financeStoreDriveOutcomeUncertainError_(
      "FINANCE_RESTORE_STAGE_COPY_OUTCOME_UNCERTAIN",
      label + " copy result is unknown; retry the same restore request." +
        (copyOutcomeTracked ? "" : " Drive failure tracking also failed; inspect execution logs."),
      copyError,
      failureKey
    );
    copyOutcomeError.financeDriveTrackingFailed = !copyOutcomeTracked;
    throw copyOutcomeError;
  }
  return financeStoreFinishNewPrivateDriveFile_(
    resource, name, mimeType, parentId, description, label,
    failureKey, operation
  );
}

function financeStoreRequireAdvancedDriveCreation_() {
  if (typeof Drive === "undefined" || !Drive.Files ||
      typeof Drive.Files.create !== "function" ||
      typeof Drive.Files.get !== "function") {
    financeStoreFail_(
      "FINANCE_DRIVE_API_UNAVAILABLE",
      "Advanced Drive API v3 is required for safe finance storage creation."
    );
  }
}

function financeStoreFinishNewPrivateDriveFile_(
  resource, name, mimeType, parentId, description, label,
  failureKey, operation
) {
  var resourceId = String(resource && resource.id || "");
  var file = null;
  try {
    financeStoreAssertDriveMetadataValues_(
      resource, resourceId, name, mimeType, parentId, description, label
    );
    file = DriveApp.getFileById(resourceId);
    if (!file || typeof file.getId !== "function" ||
        String(file.getId()) !== resourceId) {
      financeStoreFail_(
        "FINANCE_DRIVE_ID_READBACK_MISMATCH",
        label + " DriveApp ID readback failed."
      );
    }
    financeStoreAssertPrivateDriveFileInParent_(
      file, parentId, name, mimeType, description, label
    );
    financeStoreMarkDriveCreatedVerified_(
      failureKey, operation, resourceId
    );
    return file;
  } catch (validationError) {
    financeStorePermanentlyDeleteNewDriveItem_(
      file, resourceId, label, validationError, failureKey, operation
    );
    throw validationError;
  }
}

function financeStoreAssertPrivateDriveFileInParent_(
  file, parentId, name, mimeType, description, label
) {
  if (!file || typeof file.getId !== "function") {
    financeStoreFail_(
      "FINANCE_DRIVE_FILE_MISSING",
      label + " Drive file is unavailable."
    );
  }
  var fileId = String(file.getId() || "");
  var readback;
  try {
    readback = Drive.Files.get(fileId, {
      fields: "id,name,mimeType,parents,description,trashed",
      supportsAllDrives: true
    });
  } catch (readError) {
    financeStoreFail_(
      "FINANCE_DRIVE_METADATA_READ_FAILED",
      label + " Drive metadata could not be read."
    );
  }
  financeStoreAssertDriveMetadataValues_(
    readback, fileId, name, mimeType, parentId, description, label
  );
  if (typeof storeMakePrivate_ !== "function" ||
      typeof storeAssertResourcePrivate_ !== "function") {
    financeStoreFail_(
      "FINANCE_DRIVE_ACL_API_UNAVAILABLE",
      label + " private ACL verification is unavailable."
    );
  }
  storeMakePrivate_(file);
  storeAssertResourcePrivate_(file, label);
  return file;
}

function financeStoreAssertDriveMetadataValues_(
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
    financeStoreFail_(
      "FINANCE_DRIVE_METADATA_READBACK_MISMATCH",
      label + " does not match its exact Drive ID, name, MIME type, parent or identity."
    );
  }
}

function financeStoreDriveOperationSafeJson_(value) {
  var result = {};
  Object.keys(value || {}).sort().forEach(function (key) {
    result[key] = String(value[key] || "");
  });
  return JSON.stringify(result);
}

function financeStoreDriveFailureKey_(operation) {
  return FINANCE_STORE.DRIVE_FAILURE_PREFIX +
    financeHash_(financeStoreDriveOperationSafeJson_(operation)).slice(0, 24);
}

function financeStorePersistDriveFailure_(
  key, state, operation, resourceId, error
) {
  try {
    PropertiesService.getScriptProperties().setProperty(key, JSON.stringify({
      detectedAt: financeStoreNow_(),
      state: String(state || ""),
      action: String(operation && operation.action || ""),
      operationId: String(operation && operation.operationId || ""),
      sourceId: String(operation && operation.sourceId || ""),
      name: String(operation && operation.name || ""),
      mimeType: String(operation && operation.mimeType || ""),
      parentId: String(operation && operation.parentId || ""),
      label: String(operation && operation.label || ""),
      resourceId: String(resourceId || ""),
      error: String(error && error.message || error || "")
    }));
    return true;
  } catch (ignoredFinanceDriveFailurePersistenceError) {
    return false;
  }
}

function financeStoreClearDriveFailure_(key) {
  try {
    var properties = PropertiesService.getScriptProperties();
    if (typeof properties.deleteProperty === "function") {
      properties.deleteProperty(String(key || ""));
    }
  } catch (ignoredFinanceDriveFailureClearError) {}
}

function financeStoreReadDriveFailure_(key, label) {
  var raw = "";
  try {
    raw = String(
      PropertiesService.getScriptProperties().getProperty(String(key || "")) ||
      ""
    );
  } catch (failureReadError) {
    financeStoreFail_(
      "FINANCE_DRIVE_FAILURE_TRACKING_READ_FAILED",
      label + " Drive attempt tracking could not be read."
    );
  }
  if (!raw) return null;
  try {
    var tracked = JSON.parse(raw);
    if (!tracked || typeof tracked !== "object" || Array.isArray(tracked) ||
        !String(tracked.state || "")) {
      throw new Error("invalid tracking object");
    }
    return tracked;
  } catch (parseError) {
    financeStoreFail_(
      "FINANCE_DRIVE_CLEANUP_UNRESOLVED",
      label + " has malformed Drive attempt tracking; manual review is required."
    );
  }
}

function financeStoreBeginDriveAttempt_(key, operation) {
  var label = String(operation && operation.label || "Drive item");
  if (!financeStorePersistDriveFailure_(
    key, "ATTEMPT_STARTED", operation, "", new Error("Drive request not sent yet.")
  )) {
    financeStoreFail_(
      "FINANCE_DRIVE_ATTEMPT_TRACKING_FAILED",
      label + " Drive attempt could not be recorded before the request."
    );
  }
  var tracked = financeStoreReadDriveFailure_(key, label);
  if (!tracked ||
      String(tracked.state || "") !== "ATTEMPT_STARTED" ||
      String(tracked.action || "") !== String(operation.action || "") ||
      String(tracked.operationId || "") !== String(operation.operationId || "") ||
      String(tracked.name || "") !== String(operation.name || "") ||
      String(tracked.mimeType || "") !== String(operation.mimeType || "") ||
      String(tracked.parentId || "") !== String(operation.parentId || "")) {
    financeStoreFail_(
      "FINANCE_DRIVE_ATTEMPT_TRACKING_FAILED",
      label + " Drive attempt tracking readback did not match the request."
    );
  }
}

function financeStoreDriveTrackingMatchesOperation_(tracked, operation) {
  return !!tracked && [
    "action", "operationId", "sourceId", "name",
    "mimeType", "parentId", "label"
  ].every(function (field) {
    return String(tracked[field] || "") ===
      String(operation && operation[field] || "");
  });
}

function financeStoreMarkDriveCreatedVerified_(
  key, operation, resourceId
) {
  var id = String(resourceId || "");
  var label = String(operation && operation.label || "finance Drive item");
  if (!id || !financeStorePersistDriveFailure_(
    key, "CREATED_VERIFIED", operation, id, null
  )) {
    financeStoreFail_(
      "FINANCE_DRIVE_ATTEMPT_TRACKING_FAILED",
      label + " verified Drive ID could not be recorded."
    );
  }
  var tracked = financeStoreReadDriveFailure_(key, label);
  if (!financeStoreDriveTrackingMatchesOperation_(tracked, operation) ||
      String(tracked.state || "") !== "CREATED_VERIFIED" ||
      String(tracked.resourceId || "") !== id) {
    financeStoreFail_(
      "FINANCE_DRIVE_ATTEMPT_TRACKING_FAILED",
      label + " verified Drive ID readback did not match."
    );
  }
  return tracked;
}

function financeStoreClearPublishedDriveAttempt_(
  operation, expectedResourceId
) {
  var label = String(operation && operation.label || "finance Drive item");
  var key = financeStoreDriveFailureKey_(operation);
  var tracked = financeStoreReadDriveFailure_(key, label);
  if (!tracked) return true;
  var expectedId = String(expectedResourceId || "");
  if (!expectedId ||
      !financeStoreDriveTrackingMatchesOperation_(tracked, operation) ||
      (String(tracked.resourceId || "") &&
       String(tracked.resourceId) !== expectedId)) {
    financeStoreFail_(
      "FINANCE_DRIVE_ATTEMPT_PUBLICATION_MISMATCH",
      label + " Drive attempt does not match the durably published resource."
    );
  }
  financeStoreClearDriveFailure_(key);
  if (financeStoreReadDriveFailure_(key, label)) {
    financeStoreFail_(
      "FINANCE_DRIVE_ATTEMPT_CLEAR_FAILED",
      label + " is published, but its Drive attempt marker could not be cleared."
    );
  }
  return true;
}

function financeStoreAssertNoUnresolvedDriveCleanup_(key, label) {
  var tracked = financeStoreReadDriveFailure_(key, label);
  if (!tracked) return;
  var state = String(tracked.state || "");
  if (state === "CLEANUP_FAILED") {
    financeStoreFail_(
      "FINANCE_DRIVE_CLEANUP_UNRESOLVED",
      label + " has an unresolved permanent-delete failure; manual review is required before retry."
    );
  }
  if (state === "ATTEMPT_STARTED" ||
      state === "OUTCOME_UNCERTAIN" ||
      state === "CREATED_VERIFIED") {
    financeStoreFail_(
      "FINANCE_DRIVE_OUTCOME_UNRESOLVED",
      label + " has a prior Drive request with an unknown outcome. " +
      "Inspect the exact parent, name and identity before retrying."
    );
  }
}

function financeStoreDriveOutcomeUncertainError_(
  code, message, originalError, failureKey
) {
  var error = new Error(
    String(message || "") + " " +
    String(originalError && originalError.message || originalError || "")
  );
  error.code = code;
  error.financeDriveOutcomeUncertain = true;
  error.financeDriveFailureKey = failureKey;
  return error;
}

function financeStorePermanentlyDeleteNewDriveItem_(
  file, resourceId, label, originalError, failureKey, operation
) {
  var id = String(resourceId || "");
  try {
    if (!id && file && typeof file.getId === "function") {
      id = String(file.getId() || "");
    }
  } catch (ignoredFinanceDeleteIdReadError) {}
  var deleteError = null;
  try {
    if (!id || typeof Drive === "undefined" || !Drive.Files ||
        typeof Drive.Files.remove !== "function") {
      throw new Error("Advanced Drive permanent delete is unavailable.");
    }
    Drive.Files.remove(id, { supportsAllDrives: true });
    financeStoreClearDriveFailure_(failureKey);
    return true;
  } catch (error) {
    deleteError = error;
  }
  try {
    if (file && typeof file.setShareableByEditors === "function") {
      file.setShareableByEditors(false);
    }
  } catch (ignoredFinanceReshareFallbackError) {}
  try {
    if (file && typeof storeMakePrivate_ === "function") {
      storeMakePrivate_(file);
    }
  } catch (ignoredFinancePrivateFallbackError) {}
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
  } catch (ignoredFinancePermissionFallbackError) {}
  try {
    if (file && typeof file.setTrashed === "function") file.setTrashed(true);
  } catch (ignoredFinanceTrashFallbackError) {}
  var cleanupTracked = financeStorePersistDriveFailure_(
    failureKey, "CLEANUP_FAILED", operation, id, deleteError
  );
  var cleanupError = new Error(
    String(originalError && originalError.message || originalError || "") +
    " The newly created " + label +
    " could not be permanently deleted; manual review is required. ID=" +
    (id || "unknown") +
    (cleanupTracked ? "" : " Drive failure tracking also failed; inspect execution logs.")
  );
  cleanupError.code = "FINANCE_DRIVE_CLEANUP_FAILED";
  cleanupError.financeDriveCleanupFailed = true;
  cleanupError.financeDriveResourceId = id;
  cleanupError.financeDriveTrackingFailed = !cleanupTracked;
  throw cleanupError;
}

function financeStoreBackupDriveOperation_(spreadsheet, backupId) {
  var folder = financeStoreBackupFolder_(spreadsheet);
  return {
    folder: folder,
    operation: {
      action: "CREATE",
      operationId: String(backupId || ""),
      name: "renewal_finance_" + String(backupId || "") + ".json",
      mimeType: "application/json",
      parentId: folder.getId(),
      label: "finance backup"
    }
  };
}

function financeStoreCreateRegisteredBackupUnlocked_(spreadsheet, actor, input) {
  input = input || {};
  financeStoreAssertSchema_(spreadsheet);
  var noteCode = financeStoreOptionalReasonCode_(input.noteCode) || "MANUAL";
  var explicitId = String(input.backupId || "").trim();
  var callerRunId = String(input.callerRunId || "").trim();
  var idempotencyKey = String(input.idempotencyKey || "").trim();
  if (callerRunId && idempotencyKey && callerRunId !== idempotencyKey) {
    financeStoreFail_(
      "FINANCE_BACKUP_IDEMPOTENCY_CONFLICT",
      "callerRunId and idempotencyKey must identify the same backup run."
    );
  }
  idempotencyKey = idempotencyKey || callerRunId;
  var deterministicId = idempotencyKey ?
    financeStoreBackupIdForCallerRunId_(idempotencyKey) : "";
  if (explicitId && deterministicId && explicitId !== deterministicId) {
    financeStoreFail_(
      "FINANCE_BACKUP_IDEMPOTENCY_CONFLICT",
      "The explicit finance backup ID does not match callerRunId."
    );
  }
  var backupId = explicitId || deterministicId ||
    "finance_backup_" + Utilities.getUuid();
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{9,190}$/.test(backupId)) {
    financeStoreFail_("FINANCE_BACKUP_ID_INVALID", "The finance backup ID is invalid.");
  }
  financeStoreEnsureBackupRegistry_(spreadsheet);
  var matches = financeStoreReadBackupRegistry_(spreadsheet).filter(function (row) {
    return String(row.backupId || "") === backupId;
  });
  if (matches.length > 1) {
    financeStoreFail_("FINANCE_BACKUP_REGISTRY_DUPLICATE", "The finance backup registry contains a duplicate backup ID.");
  }
  var row = matches[0] || null;
  var current = financeStoreReadCurrent_(spreadsheet, actor);
  if (row) {
    if (String(row.noteCode || "") !== noteCode) {
      financeStoreFail_("FINANCE_BACKUP_IDEMPOTENCY_CONFLICT", "The existing finance backup intent does not match this request.");
    }
    if (String(row.status || "") === "COMPLETE") {
      financeStoreEnsureRegisteredBackupAudit_(
        spreadsheet, String(row.createdBy || actor), backupId, noteCode,
        financeStoreRevision_(row.revision),
        String(row.stateHash || ""), false
      );
      var completed = financeStoreLoadRegisteredBackup_(
        spreadsheet, backupId, false
      );
      var completedBackupDrive =
        financeStoreBackupDriveOperation_(spreadsheet, backupId);
      financeStoreClearPublishedDriveAttempt_(
        completedBackupDrive.operation,
        completed.row.driveFileId
      );
      return {
        success: true,
        backupId: backupId,
        revision: completed.replayed.state.revision,
        stateHash: completed.replayed.stateHash,
        contentHash: completed.contentHash,
        fileId: completed.row.driveFileId,
        fileUrl: completed.file && typeof completed.file.getUrl === "function" ?
          completed.file.getUrl() : "",
        idempotentReplay: true
      };
    }
    if (financeStoreRevision_(row.revision) !== current.state.revision ||
        String(row.stateHash || "") !== current.stateHash) {
      financeStoreFail_(
        "FINANCE_BACKUP_PREPARED_SOURCE_CHANGED",
        "The ledger changed after the finance backup intent was prepared."
      );
    }
    if (String(row.status || "") !== "PREPARED" ||
        String(row.contentHash || "") || String(row.driveFileId || "")) {
      financeStoreFail_("FINANCE_BACKUP_INTENT_INVALID", "The finance backup intent is not safely resumable.");
    }
  } else {
    var now = financeStoreNow_();
    financeStoreEnsureRegisteredBackupAudit_(
      spreadsheet, actor, backupId, noteCode,
      current.state.revision, current.stateHash, true
    );
    financeStoreAppendBackupRegistry_(spreadsheet, {
      backupId: backupId,
      createdAt: now,
      createdBy: actor,
      revision: current.state.revision,
      stateHash: current.stateHash,
      contentHash: "",
      driveFileId: "",
      status: "PREPARED",
      noteCode: noteCode,
      schemaVersion: FINANCE_STORE.SCHEMA_VERSION
    });
    SpreadsheetApp.flush();
    row = financeStoreReadBackupRegistry_(spreadsheet).filter(function (item) {
      return String(item.backupId || "") === backupId;
    })[0];
    financeStoreFaultPoint_("AFTER_BACKUP_INTENT");
  }

  financeStoreEnsureRegisteredBackupAudit_(
    spreadsheet, actor, backupId, noteCode,
    current.state.revision, current.stateHash, true
  );
  var body = financeStoreBackupBody_(spreadsheet, {
    backupId: backupId,
    createdAt: String(row.createdAt || ""),
    createdBy: actor,
    revision: current.state.revision,
    stateHash: current.stateHash
  });
  var contentHash = financeHash_(body);
  var fileName = "renewal_finance_" + backupId + ".json";
  var identity = financeStoreStableStringify_({
    format: "CDP_RENEWAL_FINANCE_BACKUP_FILE_V1",
    backupId: backupId,
    spreadsheetId: spreadsheet.getId(),
    contentHash: contentHash
  });
  var folder = financeStoreBackupFolder_(spreadsheet);
  var files = [];
  var iterator = folder.getFilesByName(fileName);
  while (iterator.hasNext() && files.length < 3) files.push(iterator.next());
  if (files.length > 1) {
    financeStoreFail_("FINANCE_BACKUP_FILE_AMBIGUOUS", "Multiple files exist for one finance backup intent.");
  }
  var file = files[0] || null;
  var wrapperText = financeStoreStableStringify_({
    contentHash: contentHash,
    body: body
  });
  var backupDriveOperation = {
    action: "CREATE",
    operationId: backupId,
    name: fileName,
    mimeType: "application/json",
    parentId: folder.getId(),
    label: "finance backup"
  };
  var backupDriveFailureKey =
    financeStoreDriveFailureKey_(backupDriveOperation);
  if (file) {
    if (String(file.getDescription() || "") !== identity ||
        file.getBlob().getDataAsString("UTF-8") !== wrapperText) {
      financeStoreFail_("FINANCE_BACKUP_FILE_IDENTITY_MISMATCH", "The existing finance backup file does not match its prepared intent.");
    }
    try {
      financeStoreAssertPrivateDriveFileInParent_(
        file, folder.getId(), fileName, "application/json",
        identity, "finance backup"
      );
    } catch (existingBackupSafetyError) {
      financeStorePermanentlyDeleteNewDriveItem_(
        file,
        file.getId(),
        "unsafe prepared finance backup",
        existingBackupSafetyError,
        backupDriveFailureKey,
        backupDriveOperation
      );
      throw existingBackupSafetyError;
    }
  } else {
    file = financeStoreCreatePrivateDriveFileInParent_({
      name: fileName,
      mimeType: "application/json",
      parentId: folder.getId(),
      description: identity,
      blob: Utilities.newBlob(wrapperText, "application/json", fileName),
      label: "finance backup",
      operationId: backupId
    });
    financeStoreFaultPoint_("AFTER_BACKUP_FILE");
  }
  financeStoreUpdateBackupRegistry_(spreadsheet, row, {
    contentHash: contentHash,
    driveFileId: file.getId(),
    status: "COMPLETE"
  });
  SpreadsheetApp.flush();
  financeStoreFaultPoint_("AFTER_BACKUP_REGISTRY");
  financeStoreEnsureRegisteredBackupAudit_(
    spreadsheet, actor, backupId, noteCode,
    current.state.revision, current.stateHash, false
  );
  SpreadsheetApp.flush();
  var verified = financeStoreLoadRegisteredBackup_(
    spreadsheet, backupId, false
  );
  financeStoreClearPublishedDriveAttempt_(
    backupDriveOperation,
    verified.row.driveFileId
  );
  return {
    success: true,
    backupId: backupId,
    revision: verified.replayed.state.revision,
    stateHash: verified.replayed.stateHash,
    contentHash: verified.contentHash,
    fileId: verified.row.driveFileId,
    fileUrl: file && typeof file.getUrl === "function" ? file.getUrl() : ""
  };
}

function financeStoreBackupIdForCallerRunId_(callerRunId) {
  callerRunId = String(callerRunId || "").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{7,159}$/.test(callerRunId)) {
    financeStoreFail_(
      "FINANCE_BACKUP_IDEMPOTENCY_KEY_INVALID",
      "The finance backup callerRunId is invalid."
    );
  }
  return "finance_backup_req_" +
    financeHash_("CDP_RENEWAL_FINANCE_BACKUP_RUN_V1|" + callerRunId);
}

function financeStoreGetRegisteredBackupForCallerRunId_(
  spreadsheet, callerRunId
) {
  financeStoreAssertSchema_(spreadsheet);
  var backupId = financeStoreBackupIdForCallerRunId_(callerRunId);
  if (!spreadsheet.getSheetByName("finance_backups")) return null;
  var matches = financeStoreReadBackupRegistry_(spreadsheet).filter(
    function (row) {
      return String(row.backupId || "") === backupId;
    }
  );
  if (matches.length > 1) {
    financeStoreFail_(
      "FINANCE_BACKUP_REGISTRY_DUPLICATE",
      "The finance backup registry contains a duplicate callerRunId."
    );
  }
  if (!matches.length) return null;
  var row = matches[0];
  var status = String(row.status || "");
  if (["PREPARED", "COMPLETE"].indexOf(status) < 0) {
    financeStoreFail_(
      "FINANCE_BACKUP_INTENT_INVALID",
      "The finance backup callerRunId has an invalid registry state."
    );
  }
  return {
    backupId: backupId,
    status: status,
    revision: financeStoreRevision_(row.revision),
    stateHash: String(row.stateHash || ""),
    contentHash: String(row.contentHash || ""),
    noteCode: String(row.noteCode || "")
  };
}

function financeStoreEnsureRegisteredBackupAudit_(
  spreadsheet, actor, backupId, noteCode, revision, stateHash, preparedOnly
) {
  var rows = financeStoreReadObjects_(
    spreadsheet, "finance_audit"
  ).filter(function (row) {
    return String(row.correlationId || "") === backupId &&
      String(row.action || "") === "BACKUP_CREATE";
  });
  var prepared = rows.filter(function (row) {
    return String(row.eventState || "") === "PREPARED";
  });
  var committed = rows.filter(function (row) {
    return String(row.eventState || "") === "COMMITTED";
  });
  if (prepared.length > 1 || committed.length > 1) {
    financeStoreFail_("FINANCE_BACKUP_AUDIT_DUPLICATE", "The finance backup audit marker is duplicated.");
  }
  function append(eventState) {
    financeStoreAppendAudit_(spreadsheet, {
      eventState: eventState,
      action: "BACKUP_CREATE",
      actor: actor,
      reasonCode: noteCode,
      fromRevision: revision,
      toRevision: revision,
      beforeHash: stateHash,
      afterHash: stateHash,
      correlationId: backupId
    });
  }
  if (!prepared.length) append("PREPARED");
  if (!preparedOnly && !committed.length) append("COMMITTED");
}

function financeStoreUpdateBackupRegistry_(spreadsheet, current, changes) {
  var rows = financeStoreReadBackupRegistry_(spreadsheet).filter(function (row) {
    return String(row.backupId || "") === String(current.backupId || "");
  });
  if (rows.length !== 1 ||
      (current._rowNumber && rows[0]._rowNumber !== current._rowNumber)) {
    financeStoreFail_("FINANCE_BACKUP_INTENT_CHANGED", "The finance backup registry intent changed concurrently.");
  }
  var next = {};
  FINANCE_STORE_BACKUP_SCHEMA.forEach(function (header) {
    next[header] = rows[0][header];
  });
  Object.keys(changes || {}).forEach(function (key) {
    if (FINANCE_STORE_BACKUP_SCHEMA.indexOf(key) >= 0) next[key] = changes[key];
  });
  var values = FINANCE_STORE_BACKUP_SCHEMA.map(function (header) {
    return financeStoreCell_(next[header] === undefined ? "" : next[header]);
  });
  spreadsheet.getSheetByName("finance_backups")
    .getRange(rows[0]._rowNumber, 1, 1, values.length)
    .setValues([values]);
  return next;
}

function financeStoreListBackups_() {
  var context = storeContext_("backup.create");
  financeStoreAssertSchema_(context.spreadsheet);
  financeStoreEnsureBackupRegistry_(context.spreadsheet);
  var rows = financeStoreReadBackupRegistry_(context.spreadsheet).map(function (row) {
    return {
      backupId: String(row.backupId || ""),
      createdAt: String(row.createdAt || ""),
      createdBy: String(row.createdBy || ""),
      revision: financeStoreRevision_(row.revision),
      stateHash: String(row.stateHash || ""),
      contentHash: String(row.contentHash || ""),
      status: String(row.status || ""),
      noteCode: String(row.noteCode || ""),
      _registryRow: Number(row._rowNumber || 0)
    };
  });
  rows.sort(function (left, right) {
    return String(right.createdAt).localeCompare(String(left.createdAt)) ||
      Number(right.revision) - Number(left.revision) ||
      Number(right._registryRow) - Number(left._registryRow) ||
      String(right.contentHash).localeCompare(String(left.contentHash)) ||
      String(right.backupId).localeCompare(String(left.backupId));
  });
  var marked = false;
  rows.forEach(function (row) {
    row.latestRestoreCandidate = !marked && row.status === "COMPLETE";
    if (row.latestRestoreCandidate) marked = true;
    delete row._registryRow;
  });
  return rows;
}

function financeStoreVerifyBackup_(input) {
  input = input || {};
  var context = storeContext_("backup.create");
  financeStoreAssertSchema_(context.spreadsheet);
  financeStoreEnsureBackupRegistry_(context.spreadsheet);
  var backupId = String(input.backupId || "").trim();
  var row = financeStoreReadBackupRegistry_(context.spreadsheet).filter(function (item) {
    return String(item.backupId || "") === backupId && String(item.status || "") === "COMPLETE";
  })[0];
  if (!row) financeStoreFail_("FINANCE_BACKUP_NOT_FOUND", "指定した会計バックアップがありません。");
  var text;
  try {
    text = DriveApp.getFileById(String(row.driveFileId || ""))
      .getBlob().getDataAsString("UTF-8");
  } catch (error) {
    financeStoreFail_("FINANCE_BACKUP_FILE_OPEN_FAILED", "会計バックアップファイルを開けません。");
  }
  var parsed;
  try { parsed = JSON.parse(text); }
  catch (error) {
    financeStoreFail_("FINANCE_BACKUP_JSON_INVALID", "会計バックアップのJSON形式が不正です。");
  }
  if (!parsed || !parsed.body ||
      financeHash_(parsed.body) !== String(parsed.contentHash || "") ||
      String(parsed.contentHash || "") !== String(row.contentHash || "")) {
    financeStoreFail_("FINANCE_BACKUP_HASH_MISMATCH", "会計バックアップの整合性検査に失敗しました。");
  }
  var latest = financeStoreValidateBackupBody_(parsed.body);
  if (latest.state.revision !== financeStoreRevision_(row.revision) ||
      latest.stateHash !== String(row.stateHash || "")) {
    financeStoreFail_("FINANCE_BACKUP_STATE_MISMATCH", "会計バックアップの最新版が台帳記録と一致しません。");
  }
  return {
    success: true,
    backupId: backupId,
    createdAt: String(row.createdAt || ""),
    revision: latest.state.revision,
    stateHash: latest.stateHash,
    contentHash: String(row.contentHash || "")
  };
}


function financeStoreLoadRegisteredBackup_(spreadsheet, backupId, requireLatest) {
  financeStoreEnsureBackupRegistry_(spreadsheet);
  var rows = financeStoreReadBackupRegistry_(spreadsheet);
  var seen = {};
  var complete = [];
  rows.forEach(function (raw) {
    var id = String(raw.backupId || "");
    if (!id || seen[id]) {
      financeStoreFail_("FINANCE_BACKUP_REGISTRY_DUPLICATE", "The finance backup registry contains a missing or duplicate backup ID.");
    }
    seen[id] = true;
    if (String(raw.status || "") !== "COMPLETE") return;
    var createdAt = String(raw.createdAt || "");
    var createdMs = new Date(createdAt).getTime();
    var revision = financeStoreRevision_(raw.revision);
    var stateHash = String(raw.stateHash || "");
    var contentHash = String(raw.contentHash || "");
    var fileId = String(raw.driveFileId || "");
    if (!isFinite(createdMs) ||
        !/^[0-9a-f]{64}$/.test(stateHash) ||
        !/^[0-9a-f]{64}$/.test(contentHash) ||
        !fileId ||
        Number(raw.schemaVersion) !== FINANCE_STORE.SCHEMA_VERSION) {
      financeStoreFail_("FINANCE_BACKUP_REGISTRY_INVALID", "A COMPLETE finance backup registry row is invalid.");
    }
    complete.push({
      backupId: id,
      createdAt: createdAt,
      createdBy: String(raw.createdBy || "").toLowerCase(),
      revision: revision,
      stateHash: stateHash,
      contentHash: contentHash,
      driveFileId: fileId,
      noteCode: String(raw.noteCode || ""),
      _registryRow: Number(raw._rowNumber || 0),
      _createdMs: createdMs
    });
  });
  complete.sort(function (left, right) {
    return right._createdMs - left._createdMs ||
      right.revision - left.revision ||
      right._registryRow - left._registryRow ||
      right.contentHash.localeCompare(left.contentHash) ||
      right.backupId.localeCompare(left.backupId);
  });
  if (!complete.length) {
    financeStoreFail_("FINANCE_BACKUP_NOT_FOUND", "No registered COMPLETE finance backup exists.");
  }
  var latest = complete[0];
  var row = complete.filter(function (item) {
    return item.backupId === String(backupId || "");
  })[0];
  if (!row) {
    financeStoreFail_("FINANCE_BACKUP_NOT_FOUND", "The registered COMPLETE finance backup was not found.");
  }
  if (requireLatest && row.backupId !== latest.backupId) {
    financeStoreFail_(
      "FINANCE_RESTORE_LATEST_BACKUP_REQUIRED",
      "Only the latest registered COMPLETE finance backup can be used for disaster recovery."
    );
  }
  var file;
  var text;
  try {
    file = DriveApp.getFileById(row.driveFileId);
    if (typeof file.getId === "function" && file.getId() !== row.driveFileId) {
      financeStoreFail_("FINANCE_BACKUP_FILE_ID_MISMATCH", "The finance backup Drive file ID does not match its registry row.");
    }
    if (typeof storeAssertResourcePrivate_ === "function") {
      storeAssertResourcePrivate_(file, "finance backup");
    }
    text = file.getBlob().getDataAsString("UTF-8");
  } catch (error) {
    if (error && error.code) throw error;
    financeStoreFail_("FINANCE_BACKUP_FILE_OPEN_FAILED", "The finance backup file cannot be opened.");
  }
  var parsed;
  try { parsed = JSON.parse(text); }
  catch (error) {
    financeStoreFail_("FINANCE_BACKUP_JSON_INVALID", "The finance backup JSON is invalid.");
  }
  if (!parsed || !parsed.body ||
      financeHash_(parsed.body) !== String(parsed.contentHash || "") ||
      String(parsed.contentHash || "") !== row.contentHash) {
    financeStoreFail_("FINANCE_BACKUP_HASH_MISMATCH", "The finance backup content hash does not match.");
  }
  var body = parsed.body;
  var replayed = financeStoreValidateBackupBody_(body);
  if (String(body.backupId || "") !== row.backupId ||
      String(body.createdAt || "") !== row.createdAt ||
      String(body.createdBy || "").toLowerCase() !== row.createdBy ||
      String(body.spreadsheetId || "") !== spreadsheet.getId() ||
      replayed.state.revision !== row.revision ||
      replayed.stateHash !== row.stateHash) {
    financeStoreFail_("FINANCE_BACKUP_STATE_MISMATCH", "The finance backup body does not match its registered identity.");
  }
  return {
    row: row,
    body: body,
    replayed: replayed,
    contentHash: row.contentHash,
    file: file,
    latest: row.backupId === latest.backupId
  };
}


function financeStoreExecuteApproved_(input, approvalRequestId, requestedBy) {
  return storeWithLock_(function () {
    var spreadsheet = storeOpen_();
    var actor = storeActorEmail_();
    storeRequirePermission_(spreadsheet, actor, "accounting.write");
    financeStoreAssertSchema_(spreadsheet);
    return financeStoreCommitUnlocked_(
      spreadsheet,
      input || {},
      actor,
      approvalRequestId || "",
      requestedBy || actor
    );
  });
}

function financeStoreCommitUnlocked_(spreadsheet, input, actor, approvalRequestId, requestedBy) {
  var submittedCommand = input.command || {};
  var commandType = String(submittedCommand.type || "");
  if (!commandType) financeStoreFail_("UNKNOWN_FINANCE_COMMAND", "会計操作が指定されていません。");
  if (financeStoreNeedsApproval_(commandType) && !approvalRequestId) {
    financeStoreFail_("FINANCE_SECOND_APPROVAL_REQUIRED", "この操作には二者承認が必要です。");
  }
  if (approvalRequestId && String(requestedBy || "") === String(actor || "")) {
    financeStoreFail_("FINANCE_SELF_APPROVAL_FORBIDDEN", "申請者本人は承認できません。");
  }
  var expectedRevision = financeStoreRevision_(input.expectedRevision);
  var idempotencyKey = financeStoreResolveIdempotencyKey_(
    input.idempotencyKey,
    actor,
    expectedRevision,
    submittedCommand,
    approvalRequestId
  );
  var reasonCode = financeStoreNeedsReason_(commandType) ?
    financeStoreReasonCode_(input.reasonCode) :
    financeStoreOptionalReasonCode_(input.reasonCode);
  var current = financeStoreReadCurrent_(spreadsheet, actor);
  var priorEvent = financeStoreFindEventByIdempotency_(
    current.events, idempotencyKey
  );
  if (priorEvent) {
    return financeStorePriorCommitResult_(
      current,
      priorEvent,
      submittedCommand,
      actor,
      approvalRequestId,
      requestedBy,
      reasonCode
    );
  }
  if (current.recoveryNeeded) {
    financeStoreFail_(
      "FINANCE_RECOVERY_REQUIRED",
      "会計派生データの復旧が完了していません。再読込後も続く場合は管理者が確認してください。"
    );
  }
  if (current.state.revision !== expectedRevision) {
    financeStoreFail_("CONCURRENT_MODIFICATION", "別の担当者が先に更新しました。再読込してください。");
  }
  // 承認済みコマンドは、承認依頼へ保存したサーバー封印済み本文を使う。
  // 通常操作はここで共有正本と非公開設定から正式請求情報を作り直す。
  var command;
  if (approvalRequestId && financeStoreIsSealedReversalCommand_(commandType)) {
    var reSealedCommand = financeStorePrepareSealedReversalCommand_(
      current.state, submittedCommand
    );
    if (financeStoreStableStringify_(reSealedCommand) !==
        financeStoreStableStringify_(submittedCommand)) {
      financeStoreFail_(
        "FINANCE_REVERSAL_TARGET_CHANGED",
        "承認申請時の元取引・元仕訳と現在の正本が一致しないため、反対取引を停止しました。再読込して再申請してください。"
      );
    }
    command = reSealedCommand;
  } else if (approvalRequestId && commandType === "CORRECT_INVOICE") {
    var reSealedCorrectionCommand = financeStoreResealCorrectionCommand_(
      current.state, submittedCommand
    );
    if (financeStoreStableStringify_(reSealedCorrectionCommand) !==
        financeStoreStableStringify_(submittedCommand)) {
      financeStoreFail_(
        "FINANCE_CORRECTION_TARGET_CHANGED",
        "承認申請時の元請求残額・実取消額・新請求額と現在の正本が一致しないため、請求訂正を停止しました。再読込して再申請してください。"
      );
    }
    command = reSealedCorrectionCommand;
  } else {
    command = approvalRequestId ?
      financeStoreCloneCommand_(submittedCommand) :
      financeStorePrepareServerCommand_(
        spreadsheet, current.state, submittedCommand
      );
  }
  var commandJson = financeStoreCanonicalCommandJson_(command);
  var context = { actorId: actor, at: financeStoreNow_() };
  var next = financeApplyCommand_(current.state, command, context);
  financeValidateState_(next);
  if (next.revision !== expectedRevision + 1) {
    financeStoreFail_("FINANCE_REVISION_INVALID", "会計台帳の版番号が連続していません。");
  }
  var nextHash = financeHash_(next);
  var event = financeStoreBuildEvent_({
    revision: next.revision,
    committedAt: context.at,
    actor: actor,
    command: command,
    commandJson: commandJson,
    previousStateHash: current.stateHash,
    stateHash: nextHash,
    previousEventHash: current.event.eventHash,
    approvalRequestId: approvalRequestId,
    requestedBy: requestedBy || actor,
    reasonCode: reasonCode,
    idempotencyKey: idempotencyKey
  });

  // これ以降、event が追記済みなら会計処理そのものは確定している。
  financeStoreAppendEventDurably_(spreadsheet, event);
  var recovery = financeStoreTryFinalizeDerived_(spreadsheet, next, event, actor);
  return {
    success: true,
    committed: true,
    recoveryNeeded: recovery.recoveryNeeded,
    recoveryCode: recovery.recoveryCode,
    revision: next.revision,
    stateHash: nextHash,
    snapshotId: event.eventId,
    eventId: event.eventId,
    idempotencyKey: event.correlationId,
    idempotentReplay: false,
    state: next,
    positions: financeStoreBuildPositions_(next)
  };
}

function financeStoreCloneCommand_(command) {
  return JSON.parse(financeStoreStableStringify_(command || {}));
}

/**
 * billingSnapshot はサーバーだけが決める値であり、ブラウザ要求の同一性
 * 判定には含めない。これにより、発行応答が失われた後に事業者設定が
 * 変更されても、同じ idempotencyKey の再送は最初の確定結果を返せる。
 */
function financeStoreCommandWithoutServerSnapshot_(command) {
  var copy = financeStoreCloneCommand_(command);
  var type = String(copy.type || "");
  var data = copy.data || {};
  delete copy.serverTargetSnapshot;
  if (type === "CREATE_DRAFT_INVOICE" || type === "UPDATE_DRAFT_INVOICE" ||
      type === "ISSUE_INVOICE") {
    delete data.billingSnapshot;
  } else if (type === "CORRECT_INVOICE") {
    if (data.replacementInvoice) {
      delete data.replacementInvoice.billingSnapshot;
      delete data.replacementInvoice.correctionOfInvoiceId;
    }
    if (data.replacementIssue) delete data.replacementIssue.billingSnapshot;
  }
  return copy;
}

function financeStoreSubmittedCommandMatches_(storedCommand, submittedCommand) {
  return financeStoreStableStringify_(
    financeStoreCommandWithoutServerSnapshot_(storedCommand)
  ) === financeStoreStableStringify_(
    financeStoreCommandWithoutServerSnapshot_(submittedCommand)
  );
}

function financeStoreEventCommandMatches_(event, submittedCommand) {
  var eventCommand;
  try {
    eventCommand = JSON.parse(String(event && event.commandJson || ""));
  } catch (error) {
    financeStoreFail_("FINANCE_EVENT_COMMAND_INVALID", "確定済み会計操作を読み取れません。");
  }
  if (financeStoreStableStringify_(eventCommand) !==
        String(event && event.commandJson || "") ||
      financeHash_(eventCommand) !== String(event && event.commandHash || "")) {
    financeStoreFail_("FINANCE_EVENT_COMMAND_INVALID", "確定済み会計操作のハッシュが一致しません。");
  }
  return financeStoreSubmittedCommandMatches_(eventCommand, submittedCommand);
}

/**
 * 正式請求の宛先・発行者・振込先は、クライアント本文を破棄し、
 * 共有正本とサーバー側の非公開設定から作る。発行済みイベントへ封印
 * された後はこの関数で再計算せず、イベント本文をそのまま再生する。
 */
function financeStorePrepareServerCommand_(spreadsheet, state, submittedCommand) {
  var command = financeStoreCloneCommand_(submittedCommand);
  var type = String(command.type || "");
  var data = command.data || {};
  command.data = data;

  if (financeStoreIsSealedReversalCommand_(type)) {
    return financeStorePrepareSealedReversalCommand_(state, command);
  }
  if (type === "CREATE_DRAFT_INVOICE" || type === "UPDATE_DRAFT_INVOICE") {
    // 下書きにブラウザ由来の発行者・口座情報を残さない。
    data.billingSnapshot = null;
    return command;
  }
  if (type === "CORRECT_INVOICE") {
    if (Object.prototype.hasOwnProperty.call(command, "serverTargetSnapshot")) {
      financeStoreFail_(
        "FINANCE_CORRECTION_SEAL_CLIENT_FORBIDDEN",
        "請求訂正の元請求残額・取消額・新請求額の封印はサーバーだけが作成します。"
      );
    }
    return financeStorePrepareCorrectionCommand_(
      spreadsheet, state, command
    );
  }
  if (type !== "ISSUE_INVOICE") return command;
  if (typeof artifactBuildFormalBillingSnapshotForFinance_ !== "function") {
    financeStoreFail_(
      "FINANCE_BILLING_SNAPSHOT_PROVIDER_UNAVAILABLE",
      "正式請求の発行者情報をサーバーで確認できないため停止しました。"
    );
  }

  var customerId = "";
  if (type === "ISSUE_INVOICE") {
    var invoiceId = String(command.invoiceId || data.invoiceId || "");
    var invoice = (state.invoices || []).filter(function (row) {
      return String(row && row.id || "") === invoiceId;
    })[0];
    if (!invoice) {
      financeStoreFail_("INVOICE_NOT_FOUND", "発行する請求下書きが見つかりません。");
    }
    customerId = String(invoice.customerId || "");
    data.billingSnapshot = artifactBuildFormalBillingSnapshotForFinance_(
      spreadsheet, customerId
    );
    return command;
  }

  return command;
}

/**
 * 訂正依頼は、元請求の「現在有効な請求残額」の全額取消と、新請求の発行を
 * 一つのサーバー封印へまとめる。ブラウザは取消明細・税額・封印値を指定できない。
 */
function financeStorePrepareCorrectionCommand_(
  spreadsheet, state, submittedCommand
) {
  if (typeof artifactBuildFormalBillingSnapshotForFinance_ !== "function") {
    financeStoreFail_(
      "FINANCE_BILLING_SNAPSHOT_PROVIDER_UNAVAILABLE",
      "正式請求の発行者情報をサーバーで確認できないため停止しました。"
    );
  }
  var command = financeStoreCloneCommand_(submittedCommand);
  var data = financeStoreValidateCorrectionCommandShape_(command, false);
  var customerId = String(data.replacementInvoice.customerId || "");
  data.replacementInvoice.billingSnapshot =
    artifactBuildFormalBillingSnapshotForFinance_(spreadsheet, customerId);
  data.replacementIssue.billingSnapshot =
    financeStoreCloneCommand_(data.replacementInvoice.billingSnapshot);
  data.replacementInvoice.correctionOfInvoiceId =
    String(data.reversal.invoiceId || "");
  return financeStoreSealCorrectionCommand_(state, command);
}

/**
 * 承認表示・承認実行では、申請時に固定した正式請求snapshotは変更せず、
 * 元請求の有効残額と両金額だけを現在の正本から再計算して封印を照合する。
 */
function financeStoreResealCorrectionCommand_(state, storedCommand) {
  var command = financeStoreCloneCommand_(storedCommand);
  financeStoreValidateCorrectionCommandShape_(command, true);
  return financeStoreSealCorrectionCommand_(state, command);
}

function financeStoreValidateCorrectionCommandShape_(command, allowSeal) {
  if (!command || typeof command !== "object" || Array.isArray(command) ||
      String(command.type || "") !== "CORRECT_INVOICE") {
    financeStoreFail_(
      "INVALID_CORRECTION_INPUT", "請求訂正の操作本文が不正です。"
    );
  }
  Object.keys(command).forEach(function (key) {
    if (key !== "type" && key !== "data" &&
        !(allowSeal && key === "serverTargetSnapshot")) {
      financeStoreFail_(
        "FINANCE_CORRECTION_COMMAND_FIELD_INVALID",
        "請求訂正の操作本文に未対応の項目があります: " + key
      );
    }
  });
  var data = command.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    financeStoreFail_(
      "INVALID_CORRECTION_INPUT", "請求訂正の入力形式が不正です。"
    );
  }
  Object.keys(data).forEach(function (key) {
    if (["reversal", "replacementInvoice", "replacementIssue"].indexOf(key) < 0) {
      financeStoreFail_(
        "FINANCE_CORRECTION_COMMAND_FIELD_INVALID",
        "請求訂正の" + key + "は指定できません。"
      );
    }
  });
  financeAssertOnlyReversalFields_(data.reversal || {}, {
    id: true,
    creditNoteNo: true,
    invoiceId: true,
    accountingDate: true,
    date: true,
    reason: true,
    journalEntryId: true
  });
  if (!data.replacementInvoice ||
      typeof data.replacementInvoice !== "object" ||
      Array.isArray(data.replacementInvoice) ||
      !data.replacementIssue ||
      typeof data.replacementIssue !== "object" ||
      Array.isArray(data.replacementIssue)) {
    financeStoreFail_(
      "INVALID_CORRECTION_INPUT",
      "請求訂正には取消取引・新請求・新請求発行情報が必要です。"
    );
  }
  return data;
}

function financeStoreSealCorrectionCommand_(state, command) {
  var data = command.data;
  var originalInvoice = financeFindIssuedInvoice_(
    state, financeRequiredText_(data.reversal.invoiceId, "訂正元請求ID")
  );
  var cancellation = financeRemainingBillingCalculation_(
    state, originalInvoice
  );
  var replacement = financeCalculateInvoice_({
    pricingMode: data.replacementInvoice.pricingMode,
    taxRounding: data.replacementInvoice.taxRounding,
    lines: data.replacementInvoice.lines
  }, state.companyPolicy);
  command.serverTargetSnapshot = {
    format: "CDP_FINANCE_CORRECTION_TARGET_V1",
    commandType: "CORRECT_INVOICE",
    targetType: "invoice",
    targetId: originalInvoice.id,
    customerId: originalInvoice.customerId,
    originalInvoiceAmount: originalInvoice.totalInclTax,
    cancellationAmount: cancellation.totalInclTax,
    cancellationTotalExTax: cancellation.totalExTax,
    cancellationTax: cancellation.totalTax,
    cancellationTaxGroups: financeStoreCloneCommand_(
      cancellation.taxGroups
    ),
    cancellationTaxGroupsHash: financeHash_(cancellation.taxGroups),
    cancellationScope: "FULL_ACTIVE_BILLING_BALANCE",
    expectedOriginalEffectiveBilledAfter: 0,
    replacementInvoiceId: String(data.replacementInvoice.id || ""),
    replacementAmount: replacement.totalInclTax,
    replacementTotalExTax: replacement.totalExTax,
    replacementTax: replacement.totalTax,
    replacementTaxGroupsHash: financeHash_(replacement.taxGroups),
    originalInvoiceHash: financeHash_(originalInvoice),
    originalInvoiceIntegrityKey: String(originalInvoice.immutableKey || "")
  };
  return command;
}

function financeStoreValidateStoredCorrectionSeal_(state, command, status) {
  var data = financeStoreValidateCorrectionCommandShape_(command, true);
  var seal = command.serverTargetSnapshot;
  if (!seal || typeof seal !== "object" || Array.isArray(seal) ||
      seal.format !== "CDP_FINANCE_CORRECTION_TARGET_V1" ||
      seal.commandType !== "CORRECT_INVOICE" ||
      seal.targetType !== "invoice" ||
      seal.targetId !== String(data.reversal.invoiceId || "") ||
      seal.replacementInvoiceId !== String(data.replacementInvoice.id || "") ||
      seal.cancellationScope !== "FULL_ACTIVE_BILLING_BALANCE" ||
      seal.expectedOriginalEffectiveBilledAfter !== 0) {
    financeStoreFail_(
      "FINANCE_APPROVAL_TAMPERED",
      "請求訂正の金額封印形式が一致しません。"
    );
  }
  var originalInvoice = financeFindIssuedInvoice_(state, seal.targetId);
  if (seal.customerId !== originalInvoice.customerId ||
      seal.originalInvoiceAmount !== originalInvoice.totalInclTax ||
      seal.originalInvoiceHash !== financeHash_(originalInvoice) ||
      seal.originalInvoiceIntegrityKey !==
        String(originalInvoice.immutableKey || "")) {
    financeStoreFail_(
      "FINANCE_APPROVAL_TAMPERED",
      "請求訂正の元請求封印が正本と一致しません。"
    );
  }
  var cancellationGroups = seal.cancellationTaxGroups;
  if (!Array.isArray(cancellationGroups) ||
      financeHash_(cancellationGroups) !== seal.cancellationTaxGroupsHash ||
      !financeIsInteger_(seal.cancellationTotalExTax) ||
      !financeIsInteger_(seal.cancellationTax) ||
      !financeIsInteger_(seal.cancellationAmount) ||
      seal.cancellationAmount <= 0 ||
      seal.cancellationAmount > seal.originalInvoiceAmount ||
      seal.cancellationTotalExTax + seal.cancellationTax !==
        seal.cancellationAmount) {
    financeStoreFail_(
      "FINANCE_APPROVAL_TAMPERED",
      "請求訂正の実取消額封印が不正です。"
    );
  }
  var replacement = financeCalculateInvoice_({
    pricingMode: data.replacementInvoice.pricingMode,
    taxRounding: data.replacementInvoice.taxRounding,
    lines: data.replacementInvoice.lines
  }, state.companyPolicy);
  if (seal.replacementAmount !== replacement.totalInclTax ||
      seal.replacementTotalExTax !== replacement.totalExTax ||
      seal.replacementTax !== replacement.totalTax ||
      seal.replacementTaxGroupsHash !== financeHash_(replacement.taxGroups)) {
    financeStoreFail_(
      "FINANCE_APPROVAL_TAMPERED",
      "請求訂正の新請求額封印が請求明細の再計算結果と一致しません。"
    );
  }
  if (status === "APPROVED_EXECUTED") {
    var cancellation = financeFindRequired_(
      state.credit_notes,
      financeRequiredText_(data.reversal.id, "取消取引ID"),
      "FINANCE_APPROVAL_TAMPERED",
      "承認済み請求訂正の取消取引が見つかりません。"
    );
    if (cancellation.invoiceId !== originalInvoice.id ||
        cancellation.kind !== FINANCE_CREDIT_KIND.REVERSAL ||
        cancellation.effect !== "BILLING_REDUCTION" ||
        cancellation.direction !== -1 ||
        cancellation.totalExTax !== seal.cancellationTotalExTax ||
        cancellation.totalTax !== seal.cancellationTax ||
        cancellation.totalInclTax !== seal.cancellationAmount ||
        financeHash_(cancellation.taxGroups) !==
          seal.cancellationTaxGroupsHash) {
      financeStoreFail_(
        "FINANCE_APPROVAL_TAMPERED",
        "承認済み請求訂正の実取消取引が申請時封印と一致しません。"
      );
    }
  }
  return seal;
}

function financeStoreIsSealedReversalCommand_(commandType) {
  return [
    "REVERSE_RECEIPT",
    "REVERSE_REFUND",
    "REVERSE_SETTLEMENT"
  ].indexOf(String(commandType || "")) >= 0;
}

function financeStorePrepareSealedReversalCommand_(state, submittedCommand) {
  var command = financeStoreCloneCommand_(submittedCommand);
  var type = String(command.type || "");
  var data = command.data || {};
  Object.keys(command).forEach(function (key) {
    if (["type", "data", "serverTargetSnapshot"].indexOf(key) < 0) {
      financeStoreFail_(
        "FINANCE_REVERSAL_COMMAND_FIELD_INVALID",
        "反対取引の操作本文に未対応の項目があります: " + key
      );
    }
  });
  var allowed;
  var original;
  var sourceJournalType;
  var targetType;
  var originalId;
  if (type === "REVERSE_RECEIPT" || type === "REVERSE_REFUND") {
    allowed = {
      id: true,
      originalPaymentId: true,
      accountingDate: true,
      reason: true,
      journalEntryId: true
    };
    financeAssertOnlyReversalFields_(data, allowed);
    originalId = financeRequiredText_(data.originalPaymentId, "元入出金ID");
    original = financeFindRequired_(
      state.payments,
      originalId,
      "PAYMENT_NOT_FOUND",
      "訂正対象の入出金が見つかりません。"
    );
    var expectedPaymentKind = type === "REVERSE_RECEIPT" ?
      FINANCE_PAYMENT_KIND.RECEIPT : FINANCE_PAYMENT_KIND.REFUND;
    if (original.kind !== expectedPaymentKind ||
        financeOptionalText_(original.reversalOfPaymentId)) {
      financeFail_("INVALID_REVERSAL_TARGET", "元の正の入金・返金取引だけを訂正できます。");
    }
    sourceJournalType = type === "REVERSE_RECEIPT" ? "PAYMENT" : "REFUND";
    targetType = type === "REVERSE_RECEIPT" ? "receipt" : "refund";
  } else if (type === "REVERSE_SETTLEMENT") {
    allowed = {
      id: true,
      originalSettlementId: true,
      accountingDate: true,
      reason: true,
      journalEntryId: true
    };
    financeAssertOnlyReversalFields_(data, allowed);
    originalId = financeRequiredText_(
      data.originalSettlementId, "元相殺・貸倒ID"
    );
    original = financeFindRequired_(
      state.credit_notes,
      originalId,
      "SETTLEMENT_NOT_FOUND",
      "訂正対象の相殺・貸倒が見つかりません。"
    );
    if ((original.kind !== FINANCE_CREDIT_KIND.OFFSET &&
         original.kind !== FINANCE_CREDIT_KIND.BAD_DEBT) ||
        original.effect !== "SETTLEMENT" || original.direction !== -1 ||
        financeOptionalText_(original.reversalOfCreditNoteId)) {
      financeFail_("INVALID_REVERSAL_TARGET", "元の正の相殺・貸倒取引だけを訂正できます。");
    }
    sourceJournalType = "SETTLEMENT";
    targetType = "settlement";
  } else {
    financeStoreFail_("UNKNOWN_FINANCE_COMMAND", "サーバー封印対象の会計操作が不正です。");
  }
  var originalJournal = financeFindUniqueSourceJournal_(
    state, sourceJournalType, original.id, "訂正対象の元仕訳"
  );
  var cleanData = {};
  Object.keys(allowed).forEach(function (key) {
    if (Object.prototype.hasOwnProperty.call(data, key)) cleanData[key] = data[key];
  });
  command = { type: type, data: cleanData };
  command.serverTargetSnapshot = {
    format: "CDP_FINANCE_REVERSAL_TARGET_V1",
    commandType: type,
    targetType: targetType,
    targetId: original.id,
    targetKind: original.kind,
    customerId: original.customerId,
    invoiceId: financeOptionalText_(original.invoiceId),
    amount: type === "REVERSE_SETTLEMENT" ?
      original.totalInclTax : original.amount,
    targetHash: financeHash_(original),
    sourceJournalId: originalJournal.id,
    sourceJournalHash: financeHash_(originalJournal)
  };
  return command;
}

function financeStoreResolveIdempotencyKey_(
  value, actor, expectedRevision, command, approvalRequestId
) {
  var raw = String(value || "").normalize("NFKC").trim();
  if (raw) {
    if (raw.length < 8 || raw.length > FINANCE_STORE.IDEMPOTENCY_KEY_MAX_CHARS ||
        !/^[A-Za-z0-9][A-Za-z0-9._:@\/-]*$/.test(raw)) {
      financeStoreFail_(
        "FINANCE_IDEMPOTENCY_KEY_INVALID",
        "idempotencyKeyは英数字で始まる8～160文字で指定してください。"
      );
    }
    return raw;
  }
  // 旧クライアントも同じactor・revision・commandの再送を二重計上しない。
  return "legacy:" + financeHash_({
    actor: String(actor || "").toLowerCase(),
    expectedRevision: Number(expectedRevision),
    command: command || {},
    approvalRequestId: String(approvalRequestId || "")
  });
}

function financeStoreFindEventByIdempotency_(events, idempotencyKey) {
  var key = String(idempotencyKey || "");
  var found = null;
  (events || []).forEach(function (event) {
    if (event.correlationId !== key) return;
    if (found) {
      financeStoreFail_(
        "FINANCE_IDEMPOTENCY_DUPLICATE",
        "同じidempotencyKeyの会計イベントが複数あります。"
      );
    }
    found = event;
  });
  return found;
}

function financeStorePriorCommitResult_(
  current, event, command, actor, approvalRequestId, requestedBy, reasonCode
) {
  var same = financeStoreEventCommandMatches_(event, command) &&
    event.commandType === String((command || {}).type || "") &&
    event.actor === String(actor || "").toLowerCase() &&
    event.approvalRequestId === String(approvalRequestId || "") &&
    event.requestedBy === String(requestedBy || actor || "").toLowerCase() &&
    event.reasonCode === String(reasonCode || "");
  if (!same) {
    financeStoreFail_(
      "FINANCE_IDEMPOTENCY_CONFLICT",
      "同じidempotencyKeyが別の会計操作に使用されています。再実行を停止しました。"
    );
  }
  var prior = event.revision === current.state.revision ?
    { state: current.state, stateHash: current.stateHash } :
    financeStoreReplayValidatedEvents_(
      current.events.slice(0, event.revision + 1),
      null,
      -1
    );
  return {
    success: true,
    committed: true,
    recoveryNeeded: current.recoveryNeeded === true,
    recoveryCode: current.recoveryCode || "",
    revision: event.revision,
    stateHash: event.stateHash,
    snapshotId: event.eventId,
    eventId: event.eventId,
    idempotencyKey: event.correlationId,
    idempotentReplay: true,
    state: prior.state,
    positions: financeStoreBuildPositions_(prior.state)
  };
}

function financeStoreBuildEvent_(input) {
  var command = input.command || {};
  var commandJson = input.commandJson || financeStoreCanonicalCommandJson_(command);
  var eventId = Utilities.getUuid();
  var event = {
    eventId: eventId,
    revision: financeStoreRevision_(input.revision),
    committedAt: String(input.committedAt || ""),
    actor: String(input.actor || "").toLowerCase(),
    commandType: String(command.type || ""),
    commandHash: financeHash_(command),
    commandJson: commandJson,
    previousStateHash: String(input.previousStateHash || ""),
    stateHash: String(input.stateHash || ""),
    previousEventHash: String(input.previousEventHash || ""),
    eventHash: "",
    approvalRequestId: String(input.approvalRequestId || ""),
    requestedBy: String(input.requestedBy || input.actor || "").toLowerCase(),
    reasonCode: String(input.reasonCode || ""),
    correlationId: String(input.idempotencyKey || ("event:" + eventId)),
    format: FINANCE_STORE.EVENT_FORMAT,
    schemaVersion: FINANCE_STORE.SCHEMA_VERSION
  };
  event.eventHash = financeHash_(financeStoreEventHashPayload_(event));
  return event;
}

function financeStoreAppendEventDurably_(spreadsheet, event) {
  var appendError = null;
  var writeReturned = false;
  try {
    financeStoreAppend_(spreadsheet, "finance_events", event);
    writeReturned = true;
    SpreadsheetApp.flush();
    return true;
  } catch (error) {
    appendError = error;
  }
  var matching;
  try {
    matching = financeStoreReadObjects_(spreadsheet, "finance_events").filter(function (row) {
      return String(row.eventId || "") === event.eventId;
    });
  } catch (verificationError) {
    if (writeReturned) {
      financeStoreFail_(
        "FINANCE_COMMIT_STATUS_UNKNOWN",
        "会計イベントの保存状態を確認できません。再実行せず管理者がイベント台帳を確認してください。"
      );
    }
    throw appendError || verificationError;
  }
  if (matching.length === 1) {
    var stored = financeStoreNormalizeEvent_(matching[0]);
    if (stored.eventHash === event.eventHash &&
        financeHash_(financeStoreEventHashPayload_(stored)) === event.eventHash) {
      return true;
    }
    financeStoreFail_(
      "FINANCE_COMMIT_STATUS_UNKNOWN",
      "会計イベントの追記結果を確認できません。再実行せず管理者がイベント台帳を確認してください。"
    );
  }
  if (matching.length > 1) {
    financeStoreFail_(
      "FINANCE_COMMIT_STATUS_UNKNOWN",
      "同じ会計イベントが複数見つかりました。再実行せず管理者が確認してください。"
    );
  }
  if (appendError) throw appendError;
  financeStoreFail_("FINANCE_EVENT_APPEND_FAILED", "会計イベントを保存できませんでした。");
}

function financeStoreTryFinalizeDerived_(spreadsheet, state, event, actor) {
  try {
    financeStoreFinalizeDerived_(spreadsheet, state, event, actor);
    return { recoveryNeeded: false, recoveryCode: "" };
  } catch (error) {
    return {
      recoveryNeeded: true,
      recoveryCode: String((error && error.code) || "FINANCE_DERIVED_RECOVERY_NEEDED")
    };
  }
}

function financeStoreFinalizeDerived_(spreadsheet, state, event, actor) {
  var checkpoint = financeStoreWriteCheckpoint_(spreadsheet, state, actor);
  financeStoreWriteMeta_(spreadsheet, {
    schemaVersion: FINANCE_STORE.SCHEMA_VERSION,
    financeSchemaVersion: FINANCE_SCHEMA_VERSION,
    setupState: "READY",
    currentRevision: state.revision,
    currentStateHash: event.stateHash,
    checkpointId: checkpoint.checkpointId,
    checkpointRevision: state.revision,
    checkpointStateHash: event.stateHash,
    lastCommittedAt: event.committedAt,
    lastCommittedBy: event.actor
  });
  financeStoreRebuildProjections_(spreadsheet, state);
  financeStoreWriteMeta_(spreadsheet, {
    projectionRevision: state.revision,
    projectionStateHash: event.stateHash
  });
  financeStoreRepairCommittedAudits_(
    spreadsheet,
    financeStoreValidateEventChain_(financeStoreReadEvents_(spreadsheet)).events
  );
  SpreadsheetApp.flush();
}

/*
 * 通常読込はイベントの構造・hash chainをO(events)で検査し、最新checkpointを
 * O(current state)で読む。checkpointが欠落・破損・旧版なら必要なeventだけを
 * financeApplyCommand_で再生し、派生物を自己修復する。
 */
function financeStoreReadCurrent_(spreadsheet, actor) {
  var chain = financeStoreValidateEventChain_(financeStoreReadEvents_(spreadsheet));
  var state = null;
  var checkpoint = null;
  var checkpointError = null;
  try {
    checkpoint = financeStoreValidateCheckpointRows_(
      financeStoreReadObjects_(spreadsheet, "finance_state_chunks"),
      chain.events
    );
    state = checkpoint.state;
  } catch (error) {
    checkpointError = error;
  }

  if (!state) {
    var replayed = financeStoreReplayValidatedEvents_(chain.events, null, -1);
    state = replayed.state;
  } else if (state.revision < chain.latest.revision) {
    state = financeStoreReplayValidatedEvents_(
      chain.events,
      state,
      state.revision
    ).state;
  }
  financeValidateState_(state);
  var stateHash = financeHash_(state);
  if (state.revision !== chain.latest.revision || stateHash !== chain.latest.stateHash) {
    financeStoreFail_("FINANCE_EVENT_STATE_MISMATCH", "会計イベントと現在状態が一致しません。");
  }

  var meta = financeStoreReadMeta_(spreadsheet);
  var needsRepair = !!checkpointError ||
    !checkpoint ||
    checkpoint.revision !== chain.latest.revision ||
    String(meta.currentRevision) !== String(chain.latest.revision) ||
    String(meta.currentStateHash || "") !== chain.latest.stateHash ||
    String(meta.checkpointRevision) !== String(chain.latest.revision) ||
    String(meta.checkpointStateHash || "") !== chain.latest.stateHash ||
    String(meta.projectionRevision) !== String(chain.latest.revision) ||
    String(meta.projectionStateHash || "") !== chain.latest.stateHash ||
    String(meta.setupState || "") !== "READY" ||
    !financeStoreProjectionsValid_(spreadsheet, state) ||
    financeStoreHasMissingCommittedAudit_(spreadsheet, chain.events);

  var recovery = { recoveryNeeded: false, recoveryCode: "" };
  if (needsRepair) {
    recovery = financeStoreTryFinalizeDerived_(
      spreadsheet,
      state,
      chain.latest,
      actor || chain.latest.actor
    );
  }
  return {
    state: state,
    stateHash: stateHash,
    event: chain.latest,
    events: chain.events,
    derivedRepaired: needsRepair && !recovery.recoveryNeeded,
    recoveryNeeded: recovery.recoveryNeeded,
    recoveryCode: recovery.recoveryCode
  };
}

function financeStoreReadEvents_(spreadsheet) {
  return financeStoreReadObjects_(spreadsheet, "finance_events");
}

function financeStoreValidateEventChain_(rows) {
  if (!rows || !rows.length) {
    financeStoreFail_("FINANCE_EVENT_MISSING", "会計イベント正本がありません。");
  }
  var events = rows.map(financeStoreNormalizeEvent_).sort(function (a, b) {
    return a.revision - b.revision;
  });
  var eventIds = {};
  var idempotencyKeys = {};
  var previous = null;
  events.forEach(function (event, index) {
    if (event.revision !== index) {
      financeStoreFail_("FINANCE_EVENT_GAP", "会計イベントの版番号に欠落または重複があります。");
    }
    if (!event.eventId || eventIds[event.eventId]) {
      financeStoreFail_("FINANCE_EVENT_ID_INVALID", "会計イベントIDが欠落または重複しています。");
    }
    eventIds[event.eventId] = true;
    if (!event.correlationId ||
        event.correlationId.length > FINANCE_STORE.IDEMPOTENCY_KEY_MAX_CHARS ||
        idempotencyKeys[event.correlationId]) {
      financeStoreFail_(
        "FINANCE_IDEMPOTENCY_DUPLICATE",
        "会計イベントのidempotencyKeyが欠落または重複しています。"
      );
    }
    idempotencyKeys[event.correlationId] = true;
    if (event.format !== FINANCE_STORE.EVENT_FORMAT ||
        event.schemaVersion !== FINANCE_STORE.SCHEMA_VERSION) {
      financeStoreFail_("FINANCE_EVENT_FORMAT_INVALID", "会計イベントの形式が一致しません。");
    }
    if (!event.actor || !event.committedAt || isNaN(new Date(event.committedAt).getTime())) {
      financeStoreFail_("FINANCE_EVENT_ACTOR_INVALID", "会計イベントの操作者または日時が不正です。");
    }
    if (!event.commandJson || event.commandJson.length > FINANCE_STORE.MAX_COMMAND_CHARS) {
      financeStoreFail_("FINANCE_EVENT_COMMAND_SIZE_INVALID", "会計イベントの操作内容サイズが不正です。");
    }
    var command;
    try { command = JSON.parse(event.commandJson); }
    catch (error) {
      financeStoreFail_("FINANCE_EVENT_COMMAND_JSON_INVALID", "会計イベントの操作内容を読めません。");
    }
    if (financeStoreStableStringify_(command) !== event.commandJson ||
        financeHash_(command) !== event.commandHash ||
        String(command.type || "") !== event.commandType) {
      financeStoreFail_("FINANCE_EVENT_COMMAND_TAMPERED", "会計イベントの操作内容が改変されています。");
    }
    if (financeHash_(financeStoreEventHashPayload_(event)) !== event.eventHash) {
      financeStoreFail_("FINANCE_EVENT_HASH_MISMATCH", "会計イベントのハッシュが一致しません。");
    }
    if (index === 0) {
      if (event.commandType !== "INITIALIZE" ||
          event.previousStateHash || event.previousEventHash) {
        financeStoreFail_("FINANCE_EVENT_GENESIS_INVALID", "会計イベントの初期行が不正です。");
      }
      var genesisPolicy = ((command || {}).data || {}).companyPolicy || {};
      var genesisState = financeCreateState_(genesisPolicy);
      financeValidateState_(genesisState);
      if (financeHash_(genesisState) !== event.stateHash) {
        financeStoreFail_("FINANCE_EVENT_GENESIS_INVALID", "会計イベントの初期状態ハッシュが不正です。");
      }
    } else {
      if (event.commandType === "INITIALIZE" ||
          event.previousStateHash !== previous.stateHash ||
          event.previousEventHash !== previous.eventHash) {
        financeStoreFail_("FINANCE_EVENT_CHAIN_BROKEN", "会計イベントの履歴チェーンが一致しません。");
      }
    }
    if (financeStoreNeedsApproval_(event.commandType)) {
      if (!event.approvalRequestId || !event.requestedBy ||
          event.requestedBy === event.actor) {
        financeStoreFail_("FINANCE_EVENT_APPROVAL_INVALID", "二者承認イベントの承認情報が不正です。");
      }
    } else if (event.approvalRequestId || event.requestedBy !== event.actor) {
      financeStoreFail_("FINANCE_EVENT_APPROVAL_INVALID", "承認対象外イベントの操作者情報が不正です。");
    }
    event.command = command;
    previous = event;
  });
  return { events: events, latest: events[events.length - 1] };
}

function financeStoreNormalizeEvent_(row) {
  return {
    eventId: String(row.eventId || ""),
    revision: financeStoreRevision_(row.revision),
    committedAt: String(row.committedAt || ""),
    actor: String(row.actor || "").toLowerCase(),
    commandType: String(row.commandType || ""),
    commandHash: String(row.commandHash || ""),
    commandJson: String(row.commandJson || ""),
    previousStateHash: String(row.previousStateHash || ""),
    stateHash: String(row.stateHash || ""),
    previousEventHash: String(row.previousEventHash || ""),
    eventHash: String(row.eventHash || ""),
    approvalRequestId: String(row.approvalRequestId || ""),
    requestedBy: String(row.requestedBy || "").toLowerCase(),
    reasonCode: String(row.reasonCode || ""),
    correlationId: String(row.correlationId || ""),
    format: String(row.format || ""),
    schemaVersion: Number(row.schemaVersion)
  };
}

function financeStoreEventHashPayload_(event) {
  return {
    eventId: String(event.eventId || ""),
    revision: Number(event.revision),
    committedAt: String(event.committedAt || ""),
    actor: String(event.actor || ""),
    commandType: String(event.commandType || ""),
    commandHash: String(event.commandHash || ""),
    commandJson: String(event.commandJson || ""),
    previousStateHash: String(event.previousStateHash || ""),
    stateHash: String(event.stateHash || ""),
    previousEventHash: String(event.previousEventHash || ""),
    approvalRequestId: String(event.approvalRequestId || ""),
    requestedBy: String(event.requestedBy || ""),
    reasonCode: String(event.reasonCode || ""),
    correlationId: String(event.correlationId || ""),
    format: String(event.format || ""),
    schemaVersion: Number(event.schemaVersion)
  };
}

/*
 * 全イベント再生検査。バックアップ検証、手動監査、checkpoint喪失時に使用する。
 * 各 revision で financeApplyCommand_ の結果hashを照合するため、過去stateは保持しない。
 */
function financeStoreReplayEvents_(rows) {
  var chain = financeStoreValidateEventChain_(rows);
  return financeStoreReplayValidatedEvents_(chain.events, null, -1);
}

function financeStoreReplayValidatedEvents_(events, startingState, startingRevision) {
  var state = startingState;
  var start = Number(startingRevision);
  if (!state) {
    var genesis = events[0];
    var policy = ((genesis.command || {}).data || {}).companyPolicy || {};
    state = financeCreateState_(policy);
    financeValidateState_(state);
    if (state.revision !== 0 || financeHash_(state) !== genesis.stateHash) {
      financeStoreFail_("FINANCE_EVENT_REPLAY_MISMATCH", "初期会計イベントの再生結果が一致しません。");
    }
    start = 0;
  } else {
    financeValidateState_(state);
    if (state.revision !== start || start < 0 ||
        !events[start] || financeHash_(state) !== events[start].stateHash) {
      financeStoreFail_("FINANCE_CHECKPOINT_EVENT_MISMATCH", "チェックポイントと会計イベントが一致しません。");
    }
  }
  var index;
  for (index = start + 1; index < events.length; index += 1) {
    var event = events[index];
    state = financeApplyCommand_(state, event.command, {
      actorId: event.actor,
      at: event.committedAt
    });
    financeValidateState_(state);
    if (state.revision !== event.revision || financeHash_(state) !== event.stateHash) {
      financeStoreFail_(
        "FINANCE_EVENT_REPLAY_MISMATCH",
        "会計イベントの再生結果が一致しません: revision " + event.revision
      );
    }
  }
  return {
    state: state,
    stateHash: financeHash_(state),
    event: events[events.length - 1],
    events: events
  };
}

function financeStoreVerifyFullReplay_(spreadsheet) {
  financeStoreAssertSchema_(spreadsheet);
  var replayed = financeStoreReplayEvents_(financeStoreReadEvents_(spreadsheet));
  return {
    success: true,
    revision: replayed.state.revision,
    stateHash: replayed.stateHash
  };
}

/*
 * 管理画面または日次トリガーから呼ぶ健全性検査。
 * 通常の画面読込はcheckpoint/chain/projection検査だけに留め、全再生は
 * 24時間ごと、またはforceFullReplay指定時だけ実施する。
 */
function financeStoreHealthCheck_(options) {
  options = options || {};
  return storeWithLock_(function () {
    var spreadsheet = storeOpen_();
    var actor = storeActorEmail_();
    var mayWrite = options.runFullReplay !== false;
    storeRequirePermission_(
      spreadsheet,
      actor,
      mayWrite ? "accounting.write" : "read"
    );
    financeStoreAssertSchema_(spreadsheet);
    var current = financeStoreReadCurrent_(spreadsheet, actor);
    var meta = financeStoreReadMeta_(spreadsheet);
    var lastAtText = String(meta.fullReplayVerifiedAt || "");
    var lastAt = new Date(lastAtText).getTime();
    var verifiedRevision = Number(meta.fullReplayVerifiedRevision);
    var due = !isFinite(lastAt) ||
      lastAt > Date.now() + 5 * 60 * 1000 ||
      Date.now() - lastAt >=
        FINANCE_STORE.FULL_REPLAY_INTERVAL_HOURS * 60 * 60 * 1000 ||
      !Number.isInteger(verifiedRevision) ||
      verifiedRevision > current.state.revision ||
      (verifiedRevision === current.state.revision &&
       String(meta.fullReplayVerifiedStateHash || "") !== current.stateHash);
    var performed = false;
    if (options.forceFullReplay === true ||
        (mayWrite && due)) {
      var replayed = financeStoreReplayEvents_(current.events);
      if (replayed.stateHash !== current.stateHash ||
          replayed.state.revision !== current.state.revision) {
        financeStoreFail_(
          "FINANCE_FULL_REPLAY_MISMATCH",
          "全イベント再生結果が現在状態と一致しません。"
        );
      }
      if (!financeStoreProjectionsValid_(spreadsheet, replayed.state)) {
        financeStoreRebuildProjections_(spreadsheet, replayed.state);
      }
      var verifiedAt = financeStoreNow_();
      financeStoreWriteMeta_(spreadsheet, {
        fullReplayVerifiedAt: verifiedAt,
        fullReplayVerifiedRevision: replayed.state.revision,
        fullReplayVerifiedStateHash: replayed.stateHash
      });
      financeStoreAppendAudit_(spreadsheet, {
        eventState: "VERIFIED",
        action: "FULL_REPLAY_VERIFY",
        actor: actor,
        reasonCode: options.forceFullReplay === true ? "MANUAL" : "PERIODIC",
        fromRevision: replayed.state.revision,
        toRevision: replayed.state.revision,
        beforeHash: replayed.stateHash,
        afterHash: replayed.stateHash,
        correlationId: "health:" + Utilities.getUuid()
      });
      SpreadsheetApp.flush();
      lastAtText = verifiedAt;
      performed = true;
      due = false;
    }
    return {
      success: true,
      healthy: !current.recoveryNeeded &&
        financeStoreProjectionsValid_(spreadsheet, current.state),
      revision: current.state.revision,
      stateHash: current.stateHash,
      recoveryNeeded: current.recoveryNeeded,
      recoveryCode: current.recoveryCode || "",
      fullReplayPerformed: performed,
      fullReplayDue: due,
      fullReplayVerifiedAt: lastAtText
    };
  });
}

function financeStoreWriteCheckpoint_(spreadsheet, state, actor) {
  financeValidateState_(state);
  var stateJson = financeStoreStableStringify_(state);
  var chunks = financeStoreChunkText_(stateJson);
  var checkpointId = Utilities.getUuid();
  var createdAt = financeStoreNow_();
  var stateHash = financeHash_(state);
  var rows = chunks.map(function (chunk, index) {
    return {
      checkpointId: checkpointId,
      revision: state.revision,
      stateHash: stateHash,
      chunkIndex: index,
      chunkCount: chunks.length,
      chunkHash: financeHash_(chunk),
      // "~" is a storage marker.  It prevents a later chunk beginning with
      // =,+,-,@ from being interpreted as a spreadsheet formula.
      stateChunk: "~" + chunk,
      createdAt: createdAt,
      createdBy: actor,
      format: FINANCE_STORE.CHECKPOINT_FORMAT,
      schemaVersion: FINANCE_STORE.SCHEMA_VERSION
    };
  });
  financeStoreReplaceRows_(spreadsheet, "finance_state_chunks", rows);
  return {
    checkpointId: checkpointId,
    revision: state.revision,
    stateHash: stateHash,
    chunkCount: chunks.length
  };
}

function financeStoreValidateCheckpointRows_(rows, events) {
  rows = (rows || []).filter(function (row) {
    return String(row.checkpointId || "") || String(row.stateChunk || "");
  });
  if (!rows.length) {
    financeStoreFail_("FINANCE_CHECKPOINT_MISSING", "会計チェックポイントがありません。");
  }
  var first = rows[0];
  var checkpointId = String(first.checkpointId || "");
  var revision = financeStoreRevision_(first.revision);
  var stateHash = String(first.stateHash || "");
  var chunkCount = Number(first.chunkCount);
  if (!checkpointId || !Number.isInteger(chunkCount) || chunkCount < 1 ||
      chunkCount !== rows.length) {
    financeStoreFail_("FINANCE_CHECKPOINT_CHUNKS_INVALID", "会計チェックポイントの分割数が不正です。");
  }
  var byIndex = {};
  rows.forEach(function (row) {
    var index = Number(row.chunkIndex);
    var storedChunk = String(row.stateChunk || "");
    var chunk = storedChunk.charAt(0) === "~" ? storedChunk.slice(1) : "";
    if (String(row.checkpointId || "") !== checkpointId ||
        financeStoreRevision_(row.revision) !== revision ||
        String(row.stateHash || "") !== stateHash ||
        Number(row.chunkCount) !== chunkCount ||
        String(row.format || "") !== FINANCE_STORE.CHECKPOINT_FORMAT ||
        Number(row.schemaVersion) !== FINANCE_STORE.SCHEMA_VERSION ||
        !Number.isInteger(index) || index < 0 || index >= chunkCount ||
        Object.prototype.hasOwnProperty.call(byIndex, index) ||
        !storedChunk || storedChunk.length > FINANCE_STORE.CHUNK_CHAR_SIZE ||
        financeHash_(chunk) !== String(row.chunkHash || "")) {
      financeStoreFail_("FINANCE_CHECKPOINT_CHUNKS_INVALID", "会計チェックポイントが破損しています。");
    }
    byIndex[index] = chunk;
  });
  var text = "";
  var index;
  for (index = 0; index < chunkCount; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(byIndex, index)) {
      financeStoreFail_("FINANCE_CHECKPOINT_CHUNKS_INVALID", "会計チェックポイントに欠落があります。");
    }
    text += byIndex[index];
  }
  var state;
  try { state = JSON.parse(text); }
  catch (error) {
    financeStoreFail_("FINANCE_CHECKPOINT_JSON_INVALID", "会計チェックポイントを読み取れません。");
  }
  financeValidateState_(state);
  if (financeStoreStableStringify_(state) !== text ||
      state.revision !== revision ||
      financeHash_(state) !== stateHash ||
      !events[revision] ||
      events[revision].stateHash !== stateHash) {
    financeStoreFail_("FINANCE_CHECKPOINT_TAMPERED", "会計チェックポイントの内容が一致しません。");
  }
  return {
    checkpointId: checkpointId,
    revision: revision,
    stateHash: stateHash,
    chunkCount: chunkCount,
    state: state
  };
}

function financeStoreChunkText_(text) {
  var value = String(text || "");
  var chunks = [];
  // Reserve one character for the safe storage marker.
  var payloadSize = FINANCE_STORE.CHUNK_CHAR_SIZE - 1;
  var index;
  for (index = 0; index < value.length; index += payloadSize) {
    chunks.push(value.slice(index, index + payloadSize));
  }
  if (!chunks.length) chunks.push("");
  return chunks;
}

function financeStoreReadLatestSnapshot_(spreadsheet) {
  // 旧内部呼出しとの互換名。返す正本は snapshot ではなく最新 event。
  var current = financeStoreReadCurrent_(spreadsheet, storeActorEmail_());
  return {
    state: current.state,
    stateHash: current.stateHash,
    row: current.event,
    event: current.event,
    recoveryNeeded: current.recoveryNeeded
  };
}

function financeStoreBuildPositions_(state) {
  return state.invoices.map(function (invoice) {
    if (invoice.status === FINANCE_INVOICE_STATUS.ISSUED) {
      var issued = financeInvoicePosition_(state, invoice.id);
      issued.status = FINANCE_INVOICE_STATUS.ISSUED;
      issued.provisionalAmount = 0;
      issued.accountingImpact = true;
      return issued;
    }
    return {
      invoiceId: invoice.id,
      customerId: invoice.customerId,
      status: FINANCE_INVOICE_STATUS.DRAFT,
      originalBilled: invoice.totalInclTax,
      billingReduction: 0,
      effectiveBilled: invoice.totalInclTax,
      nonCashSettled: 0,
      cashAllocated: 0,
      applied: 0,
      overapplied: 0,
      outstanding: 0,
      provisionalAmount: invoice.totalInclTax,
      accountingImpact: false
    };
  });
}

function financeStoreProjectionConfigs_(state) {
  return {
    invoices: function (item) {
      return {
        entityId: item.id, revision: state.revision, invoiceNo: item.invoiceNo,
        customerId: item.customerId, status: item.status, invoiceDate: item.invoiceDate,
        accountingDate: item.accountingDate, dueDate: item.dueDate,
        totalExTax: item.totalExTax, totalTax: item.totalTax,
        totalInclTax: item.totalInclTax, immutableKey: item.immutableKey
      };
    },
    invoice_lines: function (item) {
      return {
        entityId: item.id, revision: state.revision, invoiceId: item.invoiceId,
        description: item.description, quantity: item.quantity, unitAmount: item.unitAmount,
        amount: item.amount, taxCategory: item.taxCategory
      };
    },
    payments: function (item) {
      return {
        entityId: item.id, revision: state.revision, customerId: item.customerId,
        kind: item.kind,
        transactionDate: item.transactionDate || item.paymentDate || item.refundDate,
        amount: item.amount, method: item.method, immutableKey: item.immutableKey
      };
    },
    payment_allocations: function (item) {
      return {
        entityId: item.id, revision: state.revision, paymentId: item.paymentId,
        invoiceId: item.invoiceId, allocationDate: item.allocationDate, amount: item.amount,
        reversalOfAllocationId: item.reversalOfAllocationId, immutableKey: item.immutableKey
      };
    },
    credit_notes: function (item) {
      return {
        entityId: item.id, revision: state.revision, creditNoteNo: item.creditNoteNo,
        invoiceId: item.invoiceId, kind: item.kind, accountingDate: item.accountingDate,
        amount: item.amount, immutableKey: item.immutableKey
      };
    },
    closing_periods: function (item) {
      return {
        entityId: item.id, revision: state.revision, startDate: item.startDate,
        endDate: item.endDate, closedAt: item.createdAt || item.closedAt,
        closedBy: item.createdBy || item.closedBy, immutableKey: item.immutableKey
      };
    },
    journal_entries: function (item) {
      return {
        entityId: item.id, revision: state.revision, accountingDate: item.accountingDate,
        description: item.description, sourceType: item.sourceType,
        sourceId: item.sourceId, immutableKey: item.immutableKey
      };
    }
  };
}

function financeStoreRebuildProjections_(spreadsheet, state) {
  var configs = financeStoreProjectionConfigs_(state);
  Object.keys(configs).forEach(function (sheetName) {
    var rows = state[sheetName].map(function (item) {
      var projected = configs[sheetName](item);
      projected.payloadJson = financeStoreStableStringify_(item);
      projected.payloadHash = financeHash_(item);
      return projected;
    });
    financeStoreReplaceProjection_(spreadsheet, sheetName, rows);
  });
}

function financeStoreProjectionsValid_(spreadsheet, state) {
  try {
    var configs = financeStoreProjectionConfigs_(state);
    var sheetNames = Object.keys(configs);
    var sheetIndex;
    for (sheetIndex = 0; sheetIndex < sheetNames.length; sheetIndex += 1) {
      var sheetName = sheetNames[sheetIndex];
      var sourceRows = state[sheetName];
      var projectionRows = financeStoreReadObjects_(spreadsheet, sheetName);
      if (projectionRows.length !== sourceRows.length) return false;
      var expectedById = {};
      sourceRows.forEach(function (item) {
        expectedById[String(item.id || "")] = item;
      });
      var seen = {};
      var rowIndex;
      for (rowIndex = 0; rowIndex < projectionRows.length; rowIndex += 1) {
        var row = projectionRows[rowIndex];
        var storedEntityId = String(row.entityId || "");
        var entityId = storedEntityId.charAt(0) === "'" &&
          /^[\s]*[=+\-@]/.test(storedEntityId.slice(1)) ?
          storedEntityId.slice(1) : storedEntityId;
        var item = expectedById[entityId];
        if (!entityId || !item || seen[entityId] ||
            Number(row.revision) !== state.revision) {
          return false;
        }
        seen[entityId] = true;
        var payloadJson = financeStoreStableStringify_(item);
        if (String(row.payloadJson || "") !== payloadJson ||
            String(row.payloadHash || "") !== financeHash_(item)) {
          return false;
        }
        var parsed;
        try { parsed = JSON.parse(String(row.payloadJson || "")); }
        catch (error) { return false; }
        if (financeStoreStableStringify_(parsed) !== payloadJson) return false;
      }
    }
    return true;
  } catch (error) {
    return false;
  }
}

function financeStoreRebuildDerived_() {
  return storeWithLock_(function () {
    var spreadsheet = storeOpen_();
    var actor = storeActorEmail_();
    storeRequirePermission_(spreadsheet, actor, "accounting.write");
    financeStoreAssertSchema_(spreadsheet);
    var replayed = financeStoreReplayEvents_(financeStoreReadEvents_(spreadsheet));
    financeStoreFinalizeDerived_(spreadsheet, replayed.state, replayed.event, actor);
    return {
      success: true,
      revision: replayed.state.revision,
      stateHash: replayed.stateHash
    };
  });
}

function financeStoreBackupBody_(spreadsheet, info) {
  info = info || {};
  financeStoreAssertSchema_(spreadsheet);
  var current = financeStoreReadCurrent_(spreadsheet, info.createdBy || storeActorEmail_());
  financeStoreRecoverApprovalStatuses_(spreadsheet);
  if (!current.derivedRepaired && info.revision !== undefined &&
      financeStoreRevision_(info.revision) !== current.state.revision) {
    financeStoreFail_("FINANCE_BACKUP_SOURCE_CHANGED", "会計正本がバックアップ準備中に更新されました。");
  }
  if (!current.derivedRepaired && info.stateHash !== undefined &&
      String(info.stateHash || "") !== current.stateHash) {
    financeStoreFail_("FINANCE_BACKUP_SOURCE_CHANGED", "会計正本がバックアップ準備中に更新されました。");
  }
  var body = {
    format: FINANCE_STORE.BACKUP_FORMAT,
    formatVersion: FINANCE_STORE.BACKUP_FORMAT_VERSION,
    schemaVersion: FINANCE_STORE.SCHEMA_VERSION,
    financeSchemaVersion: FINANCE_SCHEMA_VERSION,
    backupId: String(info.backupId || ""),
    createdAt: String(info.createdAt || financeStoreNow_()),
    createdBy: String(info.createdBy || ""),
    spreadsheetId: spreadsheet.getId(),
    revision: current.state.revision,
    stateHash: current.stateHash,
    events: financeStoreReadEvents_(spreadsheet).map(financeStoreStripRowNumber_),
    checkpointChunks: financeStoreReadObjects_(
      spreadsheet, "finance_state_chunks"
    ).map(financeStoreStripRowNumber_),
    audit: financeStoreReadObjects_(spreadsheet, "finance_audit")
      .map(financeStoreStripRowNumber_),
    approvalRequests: financeStoreReadObjects_(
      spreadsheet, "finance_approval_requests"
    ).map(financeStoreStripRowNumber_)
  };
  financeStoreValidateBackupBody_(body);
  return body;
}

function financeStoreValidateBackupBody_(body) {
  if (!body || body.format !== FINANCE_STORE.BACKUP_FORMAT ||
      Number(body.formatVersion) !== FINANCE_STORE.BACKUP_FORMAT_VERSION ||
      Number(body.schemaVersion) !== FINANCE_STORE.SCHEMA_VERSION ||
      String(body.financeSchemaVersion || "") !== FINANCE_SCHEMA_VERSION ||
      !Array.isArray(body.events) ||
      !Array.isArray(body.checkpointChunks) ||
      !Array.isArray(body.audit) ||
      !Array.isArray(body.approvalRequests)) {
    financeStoreFail_("FINANCE_BACKUP_FORMAT_INVALID", "会計バックアップの形式または版が一致しません。");
  }
  var replayed = financeStoreReplayEvents_(body.events);
  var checkpoint = financeStoreValidateCheckpointRows_(
    body.checkpointChunks,
    replayed.events
  );
  if (replayed.state.revision !== financeStoreRevision_(body.revision) ||
      replayed.stateHash !== String(body.stateHash || "") ||
      checkpoint.revision !== replayed.state.revision ||
      checkpoint.stateHash !== replayed.stateHash) {
    financeStoreFail_("FINANCE_BACKUP_STATE_MISMATCH", "会計バックアップの最新版が一致しません。");
  }
  financeStoreValidateBackupApprovals_(replayed.events, body.approvalRequests);
  financeStoreValidateBackupAudit_(
    replayed.events,
    body.audit,
    body.approvalRequests
  );
  return replayed;
}

function financeStoreValidateBackupApprovals_(events, requests) {
  var byId = {};
  var requestCorrelations = {};
  var eventByRequest = {};
  events.forEach(function (event) {
    if (!event.approvalRequestId) return;
    if (eventByRequest[event.approvalRequestId]) {
      financeStoreFail_(
        "FINANCE_BACKUP_APPROVAL_DUPLICATE",
        "同じ承認依頼に複数の会計イベントがあります。"
      );
    }
    eventByRequest[event.approvalRequestId] = event;
  });
  (requests || []).forEach(function (row) {
    var requestId = String(row.requestId || "");
    var correlationId = String(row.correlationId || "");
    if (!requestId || byId[requestId] ||
        !correlationId || requestCorrelations[correlationId]) {
      financeStoreFail_(
        "FINANCE_BACKUP_APPROVAL_DUPLICATE",
        "会計バックアップの承認依頼IDが欠落または重複しています。"
      );
    }
    byId[requestId] = row;
    requestCorrelations[correlationId] = true;
    var requestedAt = new Date(String(row.requestedAt || "")).getTime();
    var expiresAt = new Date(String(row.expiresAt || "")).getTime();
    var requestedBy = String(row.requestedBy || "").toLowerCase();
    var status = String(row.status || "");
    var expectedRevision = Number(row.expectedRevision);
    var commandJson = String(row.commandJson || "");
    var command;
    try { command = JSON.parse(commandJson); }
    catch (error) {
      financeStoreFail_("FINANCE_BACKUP_APPROVAL_INVALID", "承認依頼の操作内容を読めません。");
    }
    if (!requestedBy || !Number.isInteger(expectedRevision) || expectedRevision < 0 ||
        !isFinite(requestedAt) || !isFinite(expiresAt) || expiresAt <= requestedAt ||
        Number(row.schemaVersion) !== FINANCE_STORE.SCHEMA_VERSION ||
        financeStoreStableStringify_(command) !== commandJson ||
        financeHash_(command) !== String(row.commandHash || "") ||
        String(command.type || "") !== String(row.commandType || "") ||
        !financeStoreNeedsApproval_(row.commandType) ||
        !/^[A-Z0-9][A-Z0-9_-]{1,63}$/.test(String(row.reasonCode || "")) ||
        ["PENDING", "APPROVED_EXECUTED", "REJECTED", "EXPIRED", "STALE"]
          .indexOf(status) < 0) {
      financeStoreFail_("FINANCE_BACKUP_APPROVAL_INVALID", "承認依頼の内容または状態が不正です。");
    }
    var event = eventByRequest[requestId] || null;
    var approvedAtText = String(row.approvedAt || "");
    var approvedBy = String(row.approvedBy || "").toLowerCase();
    var executedRevision = row.executedRevision === "" ?
      "" : Number(row.executedRevision);
    if (status === "APPROVED_EXECUTED") {
      var approvedAt = new Date(approvedAtText).getTime();
      if (!event || !isFinite(approvedAt) ||
          approvedAt < new Date(event.committedAt).getTime() ||
          approvedBy !== event.actor ||
          executedRevision !== event.revision ||
          event.requestedBy !== requestedBy ||
          event.revision - 1 !== expectedRevision ||
          event.commandType !== String(row.commandType || "") ||
          event.commandHash !== String(row.commandHash || "") ||
          event.reasonCode !== String(row.reasonCode || "")) {
        financeStoreFail_(
          "FINANCE_BACKUP_APPROVAL_MISMATCH",
          "承認済み依頼の承認者・日時・実行版がイベントと一致しません。"
        );
      }
    } else {
      if (event || executedRevision !== "") {
        financeStoreFail_(
          "FINANCE_BACKUP_APPROVAL_MISMATCH",
          "未実行の承認依頼に確定イベントまたは実行版があります。"
        );
      }
      if ((status === "PENDING" || status === "STALE") &&
          (approvedAtText || approvedBy)) {
        financeStoreFail_("FINANCE_BACKUP_APPROVAL_INVALID", "未承認依頼に承認情報があります。");
      }
      if ((status === "REJECTED" || status === "EXPIRED") &&
          (!approvedAtText || !approvedBy ||
           approvedBy === requestedBy ||
           !isFinite(new Date(approvedAtText).getTime()) ||
           new Date(approvedAtText).getTime() < requestedAt)) {
        financeStoreFail_("FINANCE_BACKUP_APPROVAL_INVALID", "却下・期限切れの処理情報が不足しています。");
      }
    }
  });
  events.forEach(function (event) {
    if (!financeStoreNeedsApproval_(event.commandType)) return;
    var request = byId[event.approvalRequestId];
    if (!request || String(request.status || "") !== "APPROVED_EXECUTED") {
      financeStoreFail_(
        "FINANCE_BACKUP_APPROVAL_MISMATCH",
        "会計バックアップの二者承認履歴がイベントと一致しません。"
      );
    }
  });
}

function financeStoreValidateBackupAudit_(events, auditRows, approvalRows) {
  var auditIds = {};
  var rows = auditRows || [];
  var eventAuditKeys = {};
  events.forEach(function (event) {
    eventAuditKeys[event.correlationId + "|" + event.eventId] = true;
  });
  var approvalById = {};
  var pendingAuditKeys = {};
  (approvalRows || []).forEach(function (request) {
    var requestId = String(request.requestId || "");
    approvalById[requestId] = request;
    pendingAuditKeys[
      String(request.correlationId || "") + "|" + requestId
    ] = true;
  });
  rows.forEach(function (row) {
    var auditId = String(row.auditId || "");
    if (!auditId || auditIds[auditId] ||
        !String(row.eventState || "") ||
        !String(row.action || "") ||
        !String(row.actor || "") ||
        !String(row.correlationId || "") ||
        !isFinite(new Date(String(row.timestamp || "")).getTime()) ||
        Number(row.schemaVersion) !== FINANCE_STORE.SCHEMA_VERSION) {
      financeStoreFail_(
        "FINANCE_BACKUP_AUDIT_INVALID",
        "会計バックアップの監査行が欠落・重複・不正です。"
      );
    }
    auditIds[auditId] = true;
    var state = String(row.eventState || "");
    var action = String(row.action || "");
    var correlation = String(row.correlationId || "");
    var approvalRequestId = String(row.approvalRequestId || "");
    var recognized = false;
    if (state === "COMMITTED" &&
        eventAuditKeys[correlation + "|" + String(row.snapshotId || "")]) {
      recognized = true;
    } else if (state === "PENDING_APPROVAL" &&
        pendingAuditKeys[correlation + "|" + approvalRequestId]) {
      recognized = true;
    } else if ((state === "STALE" || state === "REJECTED") &&
        approvalById[approvalRequestId] &&
        String(approvalById[approvalRequestId].status || "") === state &&
        String(approvalById[approvalRequestId].correlationId || "") === correlation) {
      recognized = true;
    } else if ((state === "PREPARED" || state === "COMMITTED") &&
        action === "BACKUP_CREATE" &&
        !String(row.snapshotId || "") && !approvalRequestId &&
        String(row.beforeHash || "") === String(row.afterHash || "") &&
        String(row.fromRevision) === String(row.toRevision)) {
      recognized = true;
    } else if (state === "VERIFIED" &&
        action === "FULL_REPLAY_VERIFY" &&
        !String(row.snapshotId || "") && !approvalRequestId &&
        String(row.beforeHash || "") === String(row.afterHash || "") &&
        String(row.fromRevision) === String(row.toRevision) &&
        ["MANUAL", "PERIODIC"].indexOf(String(row.reasonCode || "")) >= 0) {
      recognized = true;
    }
    if (!recognized) {
      financeStoreFail_(
        "FINANCE_BACKUP_AUDIT_INVALID",
        "会計バックアップに対応先を確認できない監査行があります。"
      );
    }
  });
  events.forEach(function (event) {
    var matches = rows.filter(function (row) {
      return String(row.eventState || "") === "COMMITTED" &&
        String(row.correlationId || "") === event.correlationId &&
        String(row.snapshotId || "") === event.eventId;
    });
    if (matches.length !== 1) {
      financeStoreFail_(
        "FINANCE_BACKUP_AUDIT_INCOMPLETE",
        "確定会計イベントに対応する監査行が一意に存在しません。"
      );
    }
    var audit = matches[0];
    var expectedFrom = event.revision === 0 ? "" : event.revision - 1;
    if (String(audit.action || "") !== event.commandType ||
        String(audit.actor || "").toLowerCase() !==
          String(event.requestedBy || event.actor).toLowerCase() ||
        String(audit.reasonCode || "") !== event.reasonCode ||
        String(audit.approver || "").toLowerCase() !==
          (event.approvalRequestId ? event.actor : "") ||
        String(audit.fromRevision) !== String(expectedFrom) ||
        Number(audit.toRevision) !== event.revision ||
        String(audit.beforeHash || "") !== event.previousStateHash ||
        String(audit.afterHash || "") !== event.stateHash ||
        String(audit.approvalRequestId || "") !== event.approvalRequestId ||
        new Date(String(audit.timestamp || "")).getTime() <
          new Date(event.committedAt).getTime()) {
      financeStoreFail_(
        "FINANCE_BACKUP_AUDIT_MISMATCH",
        "確定会計イベントと監査内容が一致しません。"
      );
    }
  });
  (approvalRows || []).forEach(function (request) {
    var matches = rows.filter(function (row) {
      return String(row.eventState || "") === "PENDING_APPROVAL" &&
        String(row.correlationId || "") === String(request.correlationId || "") &&
        String(row.approvalRequestId || "") === String(request.requestId || "");
    });
    if (matches.length !== 1) {
      financeStoreFail_(
        "FINANCE_BACKUP_AUDIT_INCOMPLETE",
        "承認依頼に対応する監査行が一意に存在しません。"
      );
    }
    var audit = matches[0];
    var expectedRevision = Number(request.expectedRevision);
    var expectedEvent = events[expectedRevision];
    if (String(audit.action || "") !== String(request.commandType || "") ||
        String(audit.actor || "").toLowerCase() !==
          String(request.requestedBy || "").toLowerCase() ||
        String(audit.reasonCode || "") !== String(request.reasonCode || "") ||
        Number(audit.fromRevision) !== expectedRevision ||
        String(audit.toRevision || "") !== "" ||
        !expectedEvent ||
        String(audit.beforeHash || "") !== expectedEvent.stateHash ||
        String(audit.afterHash || "") !== "" ||
        String(audit.approver || "") !== "" ||
        new Date(String(audit.timestamp || "")).getTime() <
          new Date(String(request.requestedAt || "")).getTime()) {
      financeStoreFail_(
        "FINANCE_BACKUP_AUDIT_MISMATCH",
        "承認依頼と監査内容が一致しません。"
      );
    }
    var status = String(request.status || "");
    if (status === "STALE" || status === "REJECTED") {
      var outcomeMatches = rows.filter(function (row) {
        return String(row.eventState || "") === status &&
          String(row.correlationId || "") ===
            String(request.correlationId || "") &&
          String(row.approvalRequestId || "") ===
            String(request.requestId || "");
      });
      if (outcomeMatches.length !== 1) {
        financeStoreFail_(
          "FINANCE_BACKUP_AUDIT_INCOMPLETE",
          "承認依頼の失効・却下に対応する監査行が一意に存在しません。"
        );
      }
      var outcome = outcomeMatches[0];
      if (String(outcome.action || "") !== String(request.commandType || "") ||
          String(outcome.fromRevision) !==
            String(request.expectedRevision) ||
          String(outcome.approver || "").toLowerCase() ===
            String(request.requestedBy || "").toLowerCase() ||
          (status === "STALE" &&
           (String(outcome.actor || "").toLowerCase() !==
              String(request.requestedBy || "").toLowerCase() ||
            String(outcome.reasonCode || "") !==
              String(request.reasonCode || ""))) ||
          (status === "REJECTED" &&
           (String(outcome.actor || "").toLowerCase() !==
              String(request.approvedBy || "").toLowerCase() ||
            String(outcome.approver || "").toLowerCase() !==
              String(request.approvedBy || "").toLowerCase()))) {
        financeStoreFail_(
          "FINANCE_BACKUP_AUDIT_MISMATCH",
          "承認依頼の失効・却下監査が依頼内容と一致しません。"
        );
      }
    }
  });
}

function financeStoreBackupFolder_(spreadsheet) {
  if (typeof storeReadMetaMap_ !== "function") {
    financeStoreFail_("FINANCE_BACKUP_STORE_UNAVAILABLE", "共有正本のバックアップ設定を確認できません。");
  }
  var meta = storeReadMetaMap_(spreadsheet);
  var folderId = String(meta.backupFolderId || "");
  if (!folderId) {
    financeStoreFail_("FINANCE_BACKUP_FOLDER_MISSING", "会計バックアップ用フォルダが未設定です。");
  }
  try { return DriveApp.getFolderById(folderId); }
  catch (error) {
    financeStoreFail_("FINANCE_BACKUP_FOLDER_OPEN_FAILED", "会計バックアップ用フォルダを開けません。");
  }
}

function financeStoreEnsureBackupRegistry_(spreadsheet) {
  var sheet = spreadsheet.getSheetByName("finance_backups");
  if (!sheet) {
    sheet = spreadsheet.insertSheet("finance_backups");
    sheet.getRange(1, 1, 1, FINANCE_STORE_BACKUP_SCHEMA.length)
      .setValues([FINANCE_STORE_BACKUP_SCHEMA]);
    sheet.setFrozenRows(1);
    return sheet;
  }
  var actual = sheet.getRange(
    1, 1, 1, FINANCE_STORE_BACKUP_SCHEMA.length
  ).getDisplayValues()[0];
  if (financeStoreStableStringify_(actual) !==
      financeStoreStableStringify_(FINANCE_STORE_BACKUP_SCHEMA)) {
    financeStoreFail_(
      "FINANCE_BACKUP_REGISTRY_SCHEMA_INVALID",
      "会計バックアップ台帳の列構成が不正です。"
    );
  }
  return sheet;
}

function financeStoreReadBackupRegistry_(spreadsheet) {
  var sheet = spreadsheet.getSheetByName("finance_backups");
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(
    2, 1, sheet.getLastRow() - 1, FINANCE_STORE_BACKUP_SCHEMA.length
  ).getValues().map(function (values, index) {
    var object = { _rowNumber: index + 2 };
    FINANCE_STORE_BACKUP_SCHEMA.forEach(function (header, column) {
      object[header] = values[column];
    });
    return object;
  });
}

function financeStoreAppendBackupRegistry_(spreadsheet, object) {
  var sheet = spreadsheet.getSheetByName("finance_backups");
  var values = FINANCE_STORE_BACKUP_SCHEMA.map(function (header) {
    return financeStoreCell_(object[header] === undefined ? "" : object[header]);
  });
  var rowNumber = Math.max(2, sheet.getLastRow() + 1);
  financeStoreEnsureSheetCapacity_(sheet, rowNumber);
  sheet.getRange(rowNumber, 1, 1, values.length).setValues([values]);
}

function financeStoreStripRowNumber_(row) {
  var copy = {};
  Object.keys(row || {}).forEach(function (key) {
    if (key !== "_rowNumber" && key !== "command") copy[key] = row[key];
  });
  return copy;
}

function financeStoreCreateSheets_(spreadsheet) {
  Object.keys(FINANCE_STORE_SCHEMAS).forEach(function (sheetName) {
    if (spreadsheet.getSheetByName(sheetName)) {
      financeStoreFail_(
        "FINANCE_SHEET_ALREADY_EXISTS",
        "同名シートがあるため安全のため停止しました: " + sheetName
      );
    }
    var sheet = spreadsheet.insertSheet(sheetName);
    var headers = FINANCE_STORE_SCHEMAS[sheetName];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  });
}

function financeStoreAssertSchema_(spreadsheet) {
  if (!financeStoreIsConfigured_(spreadsheet)) {
    financeStoreFail_("FINANCE_NOT_CONFIGURED", "会計台帳は未設定です。管理者が初期設定してください。");
  }
  Object.keys(FINANCE_STORE_SCHEMAS).forEach(function (sheetName) {
    var sheet = spreadsheet.getSheetByName(sheetName);
    var expected = FINANCE_STORE_SCHEMAS[sheetName];
    if (!sheet) {
      financeStoreFail_("FINANCE_SCHEMA_MISSING", "会計シートが不足しています: " + sheetName);
    }
    var actual = sheet.getRange(1, 1, 1, expected.length).getDisplayValues()[0];
    if (financeStoreStableStringify_(actual) !== financeStoreStableStringify_(expected)) {
      financeStoreFail_(
        "FINANCE_SCHEMA_HEADER_MISMATCH",
        "会計シートの列構成が一致しません: " + sheetName
      );
    }
  });
  var meta = financeStoreReadMeta_(spreadsheet);
  if (Number(meta.schemaVersion) !== FINANCE_STORE.SCHEMA_VERSION ||
      String(meta.financeSchemaVersion || "") !== FINANCE_SCHEMA_VERSION) {
    financeStoreFail_("FINANCE_SCHEMA_VERSION_MISMATCH", "会計台帳のスキーマ版が一致しません。");
  }
}

function financeStoreIsConfigured_(spreadsheet) {
  return !!spreadsheet.getSheetByName("finance_meta");
}

function financeStoreState_(spreadsheet, actor) {
  var current = financeStoreReadCurrent_(spreadsheet, actor);
  return financeStoreStateResult_(
    spreadsheet,
    actor,
    current.state,
    current.event,
    {
      recoveryNeeded: current.recoveryNeeded,
      recoveryCode: current.recoveryCode
    }
  );
}

function financeStoreStateResult_(spreadsheet, actor, state, event, recovery) {
  return {
    configured: true,
    spreadsheetId: spreadsheet.getId(),
    role: storeRoleForActor_(spreadsheet, actor),
    revision: state.revision,
    stateHash: event.stateHash,
    recoveryNeeded: recovery && recovery.recoveryNeeded === true,
    recoveryCode: (recovery && recovery.recoveryCode) || ""
  };
}

function financeStoreFindApproval_(spreadsheet, requestId) {
  var id = String(requestId || "").trim();
  if (!id) return null;
  var rows = financeStoreReadObjects_(spreadsheet, "finance_approval_requests");
  var index;
  for (index = rows.length - 1; index >= 0; index -= 1) {
    if (String(rows[index].requestId || "") === id) {
      rows[index].expectedRevision = financeStoreRevision_(rows[index].expectedRevision);
      rows[index].commandHash = String(rows[index].commandHash || "");
      rows[index].commandJson = String(rows[index].commandJson || "");
      rows[index].requestedBy = String(rows[index].requestedBy || "").toLowerCase();
      rows[index].status = String(rows[index].status || "");
      rows[index].commandType = String(rows[index].commandType || "");
      return rows[index];
    }
  }
  return null;
}

function financeStoreUpdateApproval_(spreadsheet, current, changes) {
  var next = {};
  FINANCE_STORE_SCHEMAS.finance_approval_requests.forEach(function (header) {
    next[header] = current[header] === undefined ? "" : current[header];
  });
  Object.keys(changes || {}).forEach(function (key) { next[key] = changes[key]; });
  financeStoreWriteRow_(
    spreadsheet, "finance_approval_requests", current._rowNumber, next
  );
}

function financeStoreRecoverApprovalStatuses_(spreadsheet) {
  var events = financeStoreValidateEventChain_(financeStoreReadEvents_(spreadsheet)).events;
  var eventByRequest = {};
  events.forEach(function (event) {
    if (event.approvalRequestId) eventByRequest[event.approvalRequestId] = event;
  });
  financeStoreReadObjects_(spreadsheet, "finance_approval_requests").forEach(function (row) {
    if (String(row.status || "") !== "PENDING") return;
    var event = eventByRequest[String(row.requestId || "")];
    if (!event) return;
    if (String(row.requestedBy || "").toLowerCase() !== event.requestedBy ||
        Number(row.expectedRevision) !== event.revision - 1 ||
        String(row.commandType || "") !== event.commandType ||
        String(row.commandHash || "") !== event.commandHash) {
      financeStoreFail_("FINANCE_APPROVAL_TAMPERED", "承認依頼と確定イベントが一致しません。");
    }
    financeStoreUpdateApproval_(spreadsheet, row, {
      status: "APPROVED_EXECUTED",
      approvedAt: event.committedAt,
      approvedBy: event.actor,
      executedRevision: event.revision
    });
  });
}

function financeStoreHasMissingCommittedAudit_(spreadsheet, events) {
  var seen = {};
  financeStoreReadObjects_(spreadsheet, "finance_audit").forEach(function (row) {
    if (String(row.eventState || "") === "COMMITTED") {
      seen[
        String(row.correlationId || "") + "|" + String(row.snapshotId || "")
      ] = true;
    }
  });
  return events.some(function (event) {
    return !seen[event.correlationId + "|" + event.eventId];
  });
}

function financeStoreRepairCommittedAudits_(spreadsheet, events) {
  var seen = {};
  financeStoreReadObjects_(spreadsheet, "finance_audit").forEach(function (row) {
    if (String(row.eventState || "") === "COMMITTED") {
      seen[
        String(row.correlationId || "") + "|" + String(row.snapshotId || "")
      ] = true;
    }
  });
  events.forEach(function (event) {
    var auditKey = event.correlationId + "|" + event.eventId;
    if (seen[auditKey]) return;
    financeStoreAppendAudit_(spreadsheet, {
      eventState: "COMMITTED",
      action: event.commandType,
      actor: event.requestedBy || event.actor,
      reasonCode: event.reasonCode,
      approver: event.approvalRequestId ? event.actor : "",
      fromRevision: event.revision === 0 ? "" : event.revision - 1,
      toRevision: event.revision,
      beforeHash: event.previousStateHash,
      afterHash: event.stateHash,
      snapshotId: event.eventId,
      approvalRequestId: event.approvalRequestId,
      correlationId: event.correlationId
    });
    seen[auditKey] = true;
  });
}

function financeStoreAppendAudit_(spreadsheet, input) {
  financeStoreAppend_(spreadsheet, "finance_audit", {
    auditId: Utilities.getUuid(),
    timestamp: financeStoreNow_(),
    eventState: input.eventState || "",
    action: input.action || "",
    actor: input.actor || "",
    reasonCode: input.reasonCode || "",
    approver: input.approver || "",
    fromRevision: input.fromRevision === undefined ? "" : input.fromRevision,
    toRevision: input.toRevision === undefined ? "" : input.toRevision,
    beforeHash: input.beforeHash || "",
    afterHash: input.afterHash || "",
    snapshotId: input.snapshotId || "",
    approvalRequestId: input.approvalRequestId || "",
    correlationId: input.correlationId || Utilities.getUuid(),
    schemaVersion: FINANCE_STORE.SCHEMA_VERSION
  });
}

function financeStoreReadMeta_(spreadsheet) {
  var map = {};
  financeStoreReadObjects_(spreadsheet, "finance_meta").forEach(function (row) {
    map[String(row.key || "")] = row.value;
  });
  return map;
}

function financeStoreWriteMeta_(spreadsheet, values) {
  var existing = financeStoreReadObjects_(spreadsheet, "finance_meta");
  var byKey = {};
  existing.forEach(function (row) { byKey[String(row.key || "")] = row; });
  Object.keys(values).forEach(function (key) {
    var object = { key: key, value: values[key] };
    if (byKey[key]) {
      financeStoreWriteRow_(
        spreadsheet, "finance_meta", byKey[key]._rowNumber, object
      );
    } else {
      financeStoreAppend_(spreadsheet, "finance_meta", object);
    }
  });
}

function financeStoreReplaceProjection_(spreadsheet, sheetName, objects) {
  financeStoreReplaceRows_(spreadsheet, sheetName, objects);
}

function financeStoreReplaceRows_(spreadsheet, sheetName, objects) {
  var sheet = spreadsheet.getSheetByName(sheetName);
  var headers = FINANCE_STORE_SCHEMAS[sheetName];
  if (objects.length) financeStoreEnsureSheetCapacity_(sheet, objects.length + 1);
  var oldRows = Math.max(0, sheet.getLastRow() - 1);
  if (oldRows) sheet.getRange(2, 1, oldRows, headers.length).clearContent();
  if (!objects.length) return;
  var values = objects.map(function (object) {
    return headers.map(function (header) {
      return financeStoreCell_(
        object[header] === undefined ? "" : object[header]
      );
    });
  });
  sheet.getRange(2, 1, values.length, headers.length).setValues(values);
}

function financeStoreReadObjects_(spreadsheet, sheetName) {
  var sheet = spreadsheet.getSheetByName(sheetName);
  var headers = FINANCE_STORE_SCHEMAS[sheetName];
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(
    2, 1, sheet.getLastRow() - 1, headers.length
  ).getValues().map(function (values, index) {
    var object = { _rowNumber: index + 2 };
    headers.forEach(function (header, column) {
      object[header] = values[column];
    });
    return object;
  });
}

function financeStoreAppend_(spreadsheet, sheetName, object) {
  var sheet = spreadsheet.getSheetByName(sheetName);
  var rowNumber = Math.max(2, sheet.getLastRow() + 1);
  financeStoreWriteRow_(spreadsheet, sheetName, rowNumber, object);
  return rowNumber;
}

function financeStoreWriteRow_(spreadsheet, sheetName, rowNumber, object) {
  var headers = FINANCE_STORE_SCHEMAS[sheetName];
  var values = headers.map(function (header) {
    return financeStoreCell_(object[header] === undefined ? "" : object[header]);
  });
  var sheet = spreadsheet.getSheetByName(sheetName);
  financeStoreEnsureSheetCapacity_(sheet, rowNumber);
  sheet.getRange(rowNumber, 1, 1, headers.length).setValues([values]);
}

function financeStoreEnsureSheetCapacity_(sheet, requiredLastRow) {
  var required = Number(requiredLastRow);
  if (!Number.isInteger(required) || required < 1 ||
      required > FINANCE_STORE.MAX_SHEET_ROWS) {
    financeStoreFail_(
      "FINANCE_SHEET_ROW_LIMIT",
      "会計シートの行数が運用上限を超えるため停止しました。"
    );
  }
  if (!sheet || typeof sheet.getMaxRows !== "function") return;
  var current = Number(sheet.getMaxRows());
  if (current >= required) return;
  var additional = required - current;
  if (typeof sheet.insertRowsAfter !== "function") {
    financeStoreFail_(
      "FINANCE_SHEET_EXPANSION_UNAVAILABLE",
      "会計シートの行追加機能を利用できません。"
    );
  }
  sheet.insertRowsAfter(current, additional);
  if (Number(sheet.getMaxRows()) < required) {
    financeStoreFail_(
      "FINANCE_SHEET_EXPANSION_FAILED",
      "会計シートの行数を確保できませんでした。"
    );
  }
}

function financeStoreNeedsApproval_(commandType) {
  return FINANCE_STORE.HIGH_RISK_COMMANDS.indexOf(String(commandType || "")) >= 0;
}

function financeStoreNeedsReason_(commandType) {
  return financeStoreNeedsApproval_(commandType) ||
    ["ISSUE_INVOICE", "ALLOCATE_RECEIPT"].indexOf(String(commandType || "")) >= 0;
}

function financeStoreReasonCode_(value) {
  var code = String(value || "").normalize("NFKC").trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{1,63}$/.test(code)) {
    financeStoreFail_(
      "FINANCE_REASON_REQUIRED",
      "操作理由コード（英数字2～64文字）が必要です。"
    );
  }
  return code;
}

function financeStoreOptionalReasonCode_(value) {
  return String(value || "").trim() ? financeStoreReasonCode_(value) : "";
}

function financeStoreRevision_(value) {
  var revision = Number(value);
  if (!Number.isInteger(revision) || revision < 0) {
    financeStoreFail_("FINANCE_REVISION_REQUIRED", "会計台帳の版番号が不正です。");
  }
  return revision;
}

function financeStoreCanonicalCommandJson_(command) {
  var json = financeStoreStableStringify_(command || {});
  financeStoreAssertCommandSize_(json);
  return json;
}

function financeStoreAssertCommandSize_(json) {
  if (String(json || "").length > FINANCE_STORE.MAX_COMMAND_CHARS) {
    financeStoreFail_(
      "FINANCE_COMMAND_TOO_LARGE",
      "1回の会計操作が保存上限を超えています。明細を分けて登録してください。"
    );
  }
}

function financeStoreCell_(value) {
  if (typeof value !== "string") return value;
  if (value.length > FINANCE_STORE.CELL_CHAR_LIMIT) {
    financeStoreFail_(
      "FINANCE_CELL_TOO_LARGE",
      "会計保存セルが50,000文字上限を超えるため停止しました。"
    );
  }
  var safe = /^[\s]*[=+\-@]/.test(value) ? "'" + value : value;
  if (safe.length > FINANCE_STORE.CELL_CHAR_LIMIT) {
    financeStoreFail_(
      "FINANCE_CELL_TOO_LARGE",
      "会計保存セルが50,000文字上限を超えるため停止しました。"
    );
  }
  return safe;
}

function financeStoreStableStringify_(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return "[" + value.map(financeStoreStableStringify_).join(",") + "]";
  }
  return "{" + Object.keys(value).sort().map(function (key) {
    return JSON.stringify(key) + ":" + financeStoreStableStringify_(value[key]);
  }).join(",") + "}";
}

function financeStoreNow_() {
  return new Date().toISOString();
}

function financeStoreFail_(code, message) {
  var error = new Error(message);
  error.code = code;
  throw error;
}
