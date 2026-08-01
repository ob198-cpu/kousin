// @ts-nocheck
// 全体監査資料の表示補正を、対象者正本・正式会計台帳とは分離して版管理する。

var RENEWAL_AUDIT_MANUAL = {
  FORMAT: "CDP_RENEWAL_AUDIT_MANUAL_V1",
  SHEET: "__MANUAL_INPUT",
  MAX_ROWS: 1000,
  MAX_CELL_LENGTH: 1000,
  CHUNK_SIZE: 30000,
  SCHEMAS: {
    plan: {
      label: "登録更新講習機関実施計画書",
      headers: ["対象月", "実施予定日", "区分", "講習会場", "開始予定人数", "修了予定人数", "集計根拠"],
      types: ["month", "date", "licenseClass", "text", "number", "number", "text"]
    },
    status: {
      label: "登録更新講習機関実施状況報告書",
      headers: ["講習実施日", "区分", "実施場所", "修了人数", "集計根拠"],
      types: ["date", "licenseClass", "text", "number", "text"]
    },
    ledger: {
      label: "別添13 修了証明書発行台帳",
      headers: ["更新講習修了証明書番号", "受講者氏名", "修了証明書種別", "講習日", "交付の有無", "交付年月日", "有効年月日", "備考"],
      types: ["text", "text", "licenseClass", "date", "delivered", "date", "date", "text"]
    },
    payment: {
      label: "08_講習料金収納記録",
      headers: ["記録区分", "取引日", "対象者", "請求書番号", "税抜額", "消費税", "税込額", "取引種別", "入出金額", "請求残高", "状態・方法", "正本ID"],
      types: ["text", "date", "text", "text", "number", "number", "number", "text", "number", "number", "text", "text"]
    }
  }
};

function apiGetAuditWorkspaceEditor(request) {
  request = request || {};
  try {
    var authorization = artifactRequireCapability_("artifacts.admin");
    var bundle = auditWorkspaceEditorBundle_(request.fiscalYear, authorization);
    if (!bundle) {
      return {
        success: true,
        ready: false,
        fiscalYear: artifactText_(request.fiscalYear),
        message: "先に「全体監査資料を作成・更新」を実行してください。"
      };
    }
    return auditWorkspaceEditorResponse_(bundle);
  } catch (error) {
    return auditWorkspaceError_(error);
  }
}

function apiSaveAuditWorkspaceDocument(request) {
  return auditWorkspaceMutateManual_(request, false);
}

function apiResetAuditWorkspaceDocument(request) {
  return auditWorkspaceMutateManual_(request, true);
}

function auditWorkspaceMutateManual_(request, reset) {
  request = request || {};
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    return auditWorkspaceError_(new Error("別の監査資料更新が実行中です。しばらく待って再実行してください。"));
  }
  var bundle = null;
  var stateSaved = false;
  var outputUpdated = false;
  try {
    var authorization = artifactRequireCapability_("artifacts.admin");
    artifactAssertNoUnresolvedCleanupFailures_();
    bundle = auditWorkspaceEditorBundle_(request.fiscalYear, authorization);
    if (!bundle) throw new Error("全体監査資料がありません。先に作成・更新してください。");
    var key = auditWorkspaceManualKey_(request.documentKey);
    var reason = artifactText_(request.reason);
    if (reason.length < 2) throw new Error("変更理由を2文字以上で入力してください。");
    if (reason.length > 500) throw new Error("変更理由は500文字以内で入力してください。");
    var expectedVersion = Number(request.expectedManualVersion);
    if (!isFinite(expectedVersion) || expectedVersion !== bundle.manualState.version) {
      throw new Error("別の担当者が先に監査資料を変更しました。画面を再読込してからやり直してください。");
    }
    var now = artifactNowText_();
    var nextState = JSON.parse(JSON.stringify(bundle.manualState));
    nextState.version = bundle.manualState.version + 1;
    nextState.updatedAt = now;
    nextState.updatedBy = authorization.email;
    if (reset) {
      delete nextState.documents[key];
    } else {
      nextState.documents[key] = {
        active: true,
        rows: auditWorkspaceManualNormalizeRows_(key, request.rows),
        reason: reason,
        updatedAt: now,
        updatedBy: authorization.email,
        sourceContentHash: bundle.context.contentHash
      };
    }
    auditWorkspaceManualWrite_(bundle.resolved.spreadsheet, bundle.fiscalYear, nextState);
    stateSaved = true;
    bundle.manualState = nextState;
    bundle.context.manualState = nextState;
    complianceEnsureServerAudit_({
      actor: authorization.email,
      scopeKey: "audit-workspace:" + bundle.fiscalYear + ":" + key,
      kind: "auditWorkspaceManual",
      hash: artifactHashHex_(nextState),
      fileId: bundle.resolved.file.getId(),
      action: reset ? "AUDIT_WORKSPACE_MANUAL_RESET" : "AUDIT_WORKSPACE_MANUAL_SAVE",
      reasonCode: reason
    });
    auditWorkspaceUpdate_(bundle.resolved, bundle.context);
    outputUpdated = true;
    var pdf = renewalPdfExportAndSave_(
      bundle.resolved.file,
      "audit-workspace:" + bundle.fiscalYear,
      bundle.context.settings
    );
    complianceEnsureServerAudit_({
      actor: authorization.email,
      scopeKey: "audit-workspace:" + bundle.fiscalYear,
      kind: "auditWorkspace",
      hash: bundle.context.contentHash + ":manual-v" + nextState.version,
      fileId: bundle.resolved.file.getId() + ":" + pdf.fileId,
      action: "AUDIT_WORKSPACE_UPDATE"
    });
    var response = auditWorkspaceEditorResponse_(bundle);
    response.status = reset ? "reset" : "saved";
    response.url = bundle.resolved.file.getUrl();
    response.pdfUrl = pdf.url;
    response.pdfFolderUrl = pdf.folderUrl;
    response.message = reset
      ? RENEWAL_AUDIT_MANUAL.SCHEMAS[key].label + "を共有正本の自動集計へ戻し、スプレッドシートとPDFを更新しました。"
      : RENEWAL_AUDIT_MANUAL.SCHEMAS[key].label + "の監査用補正を保存し、スプレッドシートとPDFを更新しました。";
    return response;
  } catch (error) {
    var result = auditWorkspaceError_(error);
    if (stateSaved) {
      result.preservationRequired = true;
      result.url = bundle && bundle.resolved && bundle.resolved.file ? bundle.resolved.file.getUrl() : "";
      var preserved = auditWorkspaceEditorResponse_(bundle);
      result.fiscalYear = preserved.fiscalYear;
      result.manualVersion = preserved.manualVersion;
      result.documents = preserved.documents;
      result.message += outputUpdated
        ? " スプレッドシートへの反映は完了しています。PDF保存だけを再試行するため、全体監査資料の作成・更新を実行してください。"
        : " 入力した補正値は保存済みです。全体監査資料の作成・更新を実行して反映を再試行してください。";
    }
    return result;
  } finally {
    lock.releaseLock();
  }
}

function auditWorkspaceEditorBundle_(fiscalYearValue, authorization) {
  var fiscalYear = artifactText_(fiscalYearValue);
  if (!/^20\d{2}$/.test(fiscalYear)) throw new Error("監査対象年度が正しくありません。");
  var propertyKey = RENEWAL_AUDIT_WORKSPACE.PROPERTY_PREFIX + fiscalYear;
  var storedId = artifactText_(PropertiesService.getScriptProperties().getProperty(propertyKey));
  if (!storedId) return null;
  var settings = artifactLoadSettings_();
  var allowedEmails = personWorkbookAssertAdminOnlyAcl_(authorization.email);
  settings.allowedOutputEmails = allowedEmails;
  var outputFolderId = artifactOutputFolderForFiscalYear_(settings, fiscalYear);
  artifactRequireSafeOutputFolder_(
    outputFolderId,
    [settings.ledgerTemplateId, settings.certificateTemplateId],
    allowedEmails,
    fiscalYear
  );
  var autoRoot = artifactEnsureAutoRoot_(outputFolderId, allowedEmails);
  var archiveFolder = complianceEnsureArchiveFolder_(autoRoot, allowedEmails);
  var file;
  try { file = DriveApp.getFileById(storedId); }
  catch (error) { throw new Error("保存済み全体監査資料を取得できません。ID=" + storedId); }
  if (artifactText_(file.getDescription()) !== auditWorkspaceDescription_(fiscalYear)) {
    throw new Error("全体監査資料の管理識別情報が一致しないため編集を停止しました。");
  }
  artifactAssertReusableDriveItem_(file, archiveFolder.getId(), "全体監査資料", allowedEmails);
  var records = storeListRecords_({ includeDeleted: false }).map(function(row) {
    return artifactNormalizeRecord_(row);
  }).filter(function(record) {
    if (typeof complianceIsSyntheticSampleRecord_ === "function" &&
        complianceIsSyntheticSampleRecord_(record)) return false;
    var recordYear = artifactText_(record.fiscalYear);
    if (!recordYear && artifactValidIsoDateOrBlank_(record.courseDate)) {
      recordYear = artifactFiscalYearFromIso_(record.courseDate);
    }
    return recordYear === fiscalYear;
  });
  var finance = auditWorkspaceFinanceSnapshot_();
  var contentHash = artifactHashHex_({
    format: RENEWAL_AUDIT_WORKSPACE.FORMAT,
    fiscalYear: fiscalYear,
    records: records,
    financeRevision: finance ? finance.revision : 0,
    financeStateHash: finance ? finance.stateHash : ""
  });
  var resolved = {
    created: false,
    file: file,
    spreadsheet: artifactOpenSpreadsheetByIdWithRetry_(file.getId())
  };
  var manualState = auditWorkspaceManualLoad_(resolved.spreadsheet, fiscalYear);
  return {
    fiscalYear: fiscalYear,
    resolved: resolved,
    manualState: manualState,
    context: {
      fiscalYear: fiscalYear,
      records: records,
      finance: finance,
      settings: settings,
      contentHash: contentHash,
      authorization: authorization,
      manualState: manualState
    }
  };
}

function auditWorkspaceEditorResponse_(bundle) {
  var documents = {};
  Object.keys(RENEWAL_AUDIT_MANUAL.SCHEMAS).forEach(function(key) {
    var schema = RENEWAL_AUDIT_MANUAL.SCHEMAS[key];
    var manual = bundle.manualState.documents[key];
    documents[key] = {
      key: key,
      label: schema.label,
      headers: schema.headers.slice(),
      types: schema.types.slice(),
      rows: manual && manual.active === true
        ? manual.rows.map(function(row) { return row.slice(); })
        : auditWorkspaceAutoRows_(key, bundle.context),
      manual: !!(manual && manual.active === true),
      reason: manual ? artifactText_(manual.reason) : "",
      updatedAt: manual ? artifactText_(manual.updatedAt) : "",
      updatedBy: manual ? artifactText_(manual.updatedBy) : ""
    };
  });
  return {
    success: true,
    ready: true,
    fiscalYear: bundle.fiscalYear,
    manualVersion: bundle.manualState.version,
    manualUpdatedAt: bundle.manualState.updatedAt,
    manualUpdatedBy: bundle.manualState.updatedBy,
    documents: documents,
    url: bundle.resolved.file.getUrl(),
    message: "4資料を編集できます。保存した補正は対象者正本・正式会計台帳を変更しません。"
  };
}

function auditWorkspaceManualKey_(value) {
  var key = artifactText_(value);
  if (!Object.prototype.hasOwnProperty.call(RENEWAL_AUDIT_MANUAL.SCHEMAS, key)) {
    throw new Error("編集対象の監査資料が正しくありません。");
  }
  return key;
}

function auditWorkspaceManualNormalizeRows_(key, value) {
  var schema = RENEWAL_AUDIT_MANUAL.SCHEMAS[key];
  if (!Array.isArray(value)) throw new Error("編集行を読み取れません。");
  if (value.length > RENEWAL_AUDIT_MANUAL.MAX_ROWS) {
    throw new Error("編集できる行数は" + RENEWAL_AUDIT_MANUAL.MAX_ROWS + "行までです。");
  }
  var rows = value.map(function(inputRow, rowIndex) {
    if (!Array.isArray(inputRow) || inputRow.length !== schema.headers.length) {
      throw new Error((rowIndex + 1) + "行目の列数が一致しません。");
    }
    return inputRow.map(function(value, columnIndex) {
      var text = artifactText_(value);
      if (text.length > RENEWAL_AUDIT_MANUAL.MAX_CELL_LENGTH) {
        throw new Error((rowIndex + 1) + "行目「" + schema.headers[columnIndex] + "」が長すぎます。");
      }
      if (schema.types[columnIndex] === "number") {
        if (!text) return "";
        var number = Number(String(text).replace(/,/g, ""));
        if (!isFinite(number)) {
          throw new Error((rowIndex + 1) + "行目「" + schema.headers[columnIndex] + "」は数値で入力してください。");
        }
        return number;
      }
      return text;
    });
  });
  while (rows.length && rows[rows.length - 1].every(function(value) { return value === ""; })) rows.pop();
  return rows;
}

function auditWorkspaceManualDefault_(fiscalYear) {
  return {
    format: RENEWAL_AUDIT_MANUAL.FORMAT,
    fiscalYear: fiscalYear,
    version: 0,
    updatedAt: "",
    updatedBy: "",
    documents: {}
  };
}

function auditWorkspaceManualLoad_(spreadsheet, fiscalYear) {
  var sheet = spreadsheet.getSheetByName(RENEWAL_AUDIT_MANUAL.SHEET);
  if (!sheet) return auditWorkspaceManualDefault_(fiscalYear);
  var lastRow = sheet.getLastRow();
  if (lastRow < 1) return auditWorkspaceManualDefault_(fiscalYear);
  var values = sheet.getRange(1, 1, lastRow, 2).getValues();
  var map = {};
  values.forEach(function(row) { map[artifactText_(row[0])] = artifactText_(row[1]); });
  if (map.format !== RENEWAL_AUDIT_MANUAL.FORMAT || map.fiscalYear !== fiscalYear) {
    throw new Error("監査資料の編集データ識別情報が一致しません。");
  }
  var count = Number(map.chunkCount || 0);
  if (!Number.isInteger(count) || count < 1 || count > 100) {
    throw new Error("監査資料の編集データ構成が壊れています。");
  }
  var json = "";
  for (var index = 1; index <= count; index++) {
    if (!Object.prototype.hasOwnProperty.call(map, "chunk:" + index)) {
      throw new Error("監査資料の編集データが欠けています。");
    }
    json += map["chunk:" + index];
  }
  if (artifactHashHex_(json) !== map.contentHash) {
    throw new Error("監査資料の編集データ検査に失敗しました。自動更新を停止します。");
  }
  var state;
  try { state = JSON.parse(json); }
  catch (error) { throw new Error("監査資料の編集データを読み取れません。"); }
  if (!state || state.format !== RENEWAL_AUDIT_MANUAL.FORMAT || state.fiscalYear !== fiscalYear ||
      !Number.isInteger(Number(state.version)) || !state.documents || typeof state.documents !== "object") {
    throw new Error("監査資料の編集データの内容が正しくありません。");
  }
  state.version = Number(state.version);
  Object.keys(state.documents).forEach(function(key) {
    auditWorkspaceManualKey_(key);
    state.documents[key].rows = auditWorkspaceManualNormalizeRows_(key, state.documents[key].rows || []);
  });
  return state;
}

function auditWorkspaceManualWrite_(spreadsheet, fiscalYear, state) {
  var json = JSON.stringify(state);
  var chunks = [];
  for (var offset = 0; offset < json.length; offset += RENEWAL_AUDIT_MANUAL.CHUNK_SIZE) {
    chunks.push(json.slice(offset, offset + RENEWAL_AUDIT_MANUAL.CHUNK_SIZE));
  }
  if (!chunks.length) chunks.push("");
  var rows = [
    ["format", RENEWAL_AUDIT_MANUAL.FORMAT],
    ["fiscalYear", fiscalYear],
    ["version", state.version],
    ["updatedAt", state.updatedAt],
    ["updatedBy", state.updatedBy],
    ["contentHash", artifactHashHex_(json)],
    ["chunkCount", chunks.length]
  ].concat(chunks.map(function(chunk, index) { return ["chunk:" + (index + 1), chunk]; }));
  var sheet = spreadsheet.getSheetByName(RENEWAL_AUDIT_MANUAL.SHEET);
  if (!sheet) sheet = spreadsheet.insertSheet(RENEWAL_AUDIT_MANUAL.SHEET);
  sheet.clear();
  if (sheet.getMaxRows() < rows.length) sheet.insertRowsAfter(sheet.getMaxRows(), rows.length - sheet.getMaxRows());
  sheet.getRange(1, 1, rows.length, 2).setValues(rows);
  try { sheet.hideSheet(); } catch (ignored) {}
  SpreadsheetApp.flush();
  var verified = auditWorkspaceManualLoad_(spreadsheet, fiscalYear);
  if (verified.version !== state.version || artifactHashHex_(verified) !== artifactHashHex_(state)) {
    throw new Error("監査資料の編集データを保存後に照合できません。");
  }
}

function auditWorkspaceSelectRows_(key, autoRows, context) {
  var state = context && context.manualState;
  var manual = state && state.documents && state.documents[key];
  return manual && manual.active === true
    ? manual.rows.map(function(row) { return row.slice(); })
    : autoRows;
}

function auditWorkspaceSourceNote_(key, context, autoNote) {
  var state = context && context.manualState;
  var manual = state && state.documents && state.documents[key];
  if (!(manual && manual.active === true)) return autoNote;
  return "監査用補正を使用（対象者正本・正式会計台帳は不変更） / 理由: " +
    artifactText_(manual.reason) + " / " + artifactText_(manual.updatedBy) + " / " + artifactText_(manual.updatedAt);
}
