// @ts-nocheck
// 個人別成果物と分離した、年度単位の全体監査資料を維持する。

var RENEWAL_AUDIT_WORKSPACE = {
  FORMAT: "CDP_RENEWAL_AUDIT_WORKSPACE_V1",
  PROPERTY_PREFIX: "RENEWAL_AUDIT_WORKSPACE_",
  SYSTEM_SHEET: "__SYSTEM",
  SHEETS: [
    { key: "plan", name: "02_別添04_実施計画書" },
    { key: "status", name: "03_別添05_実施状況報告書" },
    { key: "ledger", name: "04_別添13_発行台帳" },
    { key: "payment", name: "08_講習料金収納記録" }
  ]
};

function apiCreateOrUpdateAuditWorkspace(request) {
  return auditWorkspaceCreateOrUpdate_(request, false);
}

function apiCreateOrUpdateAuditWorkspaceSample(request) {
  return auditWorkspaceCreateOrUpdate_(request, true);
}

function auditWorkspaceCreateOrUpdate_(request, sampleMode) {
  request = request || {};
  sampleMode = sampleMode === true;
  var authorization;
  try {
    authorization = artifactRequireCapability_("artifacts.admin");
  } catch (error) {
    return auditWorkspaceError_(error);
  }
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    return auditWorkspaceError_(new Error("別の成果物作成が実行中です。しばらく待って再実行してください。"));
  }
  var resolved = null;
  var updateCompleted = false;
  try {
    authorization = artifactRequireCapability_("artifacts.admin");
    artifactAssertNoUnresolvedCleanupFailures_();
    var fiscalYear = artifactText_(request.fiscalYear);
    if (!/^20\d{2}$/.test(fiscalYear)) throw new Error("監査対象年度が正しくありません。");
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
    var records = sampleMode
      ? auditWorkspaceBuildSampleRecords_(fiscalYear)
      : storeListRecords_({ includeDeleted: false }).map(function(row) {
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
    if (!sampleMode && records.length === 0) {
      return {
        success: false,
        ready: false,
        empty: true,
        sampleMode: false,
        fiscalYear: fiscalYear,
        recordCount: 0,
        error: fiscalYear + "年度の正式対象者は0件です。空の正式監査資料は作成・更新しません。",
        message: fiscalYear + "年度の正式対象者は0件です。空の正式監査資料は作成・更新しません。サンプル検査は「サンプル監査資料をテスト作成」を使用してください。",
        errors: [fiscalYear + "年度の正式対象者は0件です。空の正式監査資料は作成・更新しません。"]
      };
    }
    var autoRoot = artifactEnsureAutoRoot_(outputFolderId, allowedEmails);
    var targetFolder = sampleMode
      ? complianceEnsureSampleFolder_(autoRoot, allowedEmails)
      : complianceEnsureArchiveFolder_(autoRoot, allowedEmails);
    var finance = sampleMode ? null : auditWorkspaceFinanceSnapshot_();
    var contentHash = artifactHashHex_({
      format: RENEWAL_AUDIT_WORKSPACE.FORMAT,
      fiscalYear: fiscalYear,
      sampleMode: sampleMode,
      records: records,
      financeRevision: finance ? finance.revision : 0,
      financeStateHash: finance ? finance.stateHash : ""
    });
    var context = {
      fiscalYear: fiscalYear,
      records: records,
      finance: finance,
      settings: settings,
      contentHash: contentHash,
      authorization: authorization,
      sampleMode: sampleMode
    };
    var rowCounts = auditWorkspaceValidateRows_(context, sampleMode);
    resolved = auditWorkspaceResolve_(
      targetFolder, fiscalYear, allowedEmails, sampleMode
    );
    context.manualState = sampleMode
      ? { version: 0, documents: {} }
      : auditWorkspaceManualLoad_(resolved.spreadsheet, fiscalYear);
    rowCounts = auditWorkspaceValidateRows_(context, sampleMode);
    auditWorkspaceUpdate_(resolved, context);
    updateCompleted = true;
    var verification = auditWorkspaceVerifyOutput_(resolved.spreadsheet, context, rowCounts);
    var pdf = renewalPdfExportAndSave_(
      resolved.file,
      (sampleMode ? "audit-workspace-sample:" : "audit-workspace:") + fiscalYear,
      settings
    );
    complianceEnsureServerAudit_({
      actor: authorization.email,
      scopeKey: (sampleMode ? "audit-workspace-sample:" : "audit-workspace:") + fiscalYear,
      kind: sampleMode ? "auditWorkspaceSample" : "auditWorkspace",
      hash: contentHash,
      fileId: resolved.file.getId() + ":" + pdf.fileId,
      action: sampleMode
        ? (resolved.created ? "AUDIT_WORKSPACE_SAMPLE_CREATE" : "AUDIT_WORKSPACE_SAMPLE_UPDATE")
        : (resolved.created ? "AUDIT_WORKSPACE_CREATE" : "AUDIT_WORKSPACE_UPDATE")
    });
    return {
      success: true,
      ready: true,
      sampleMode: sampleMode,
      status: resolved.created ? "created" : "updated",
      fiscalYear: fiscalYear,
      fileId: resolved.file.getId(),
      fileName: resolved.file.getName(),
      url: resolved.file.getUrl(),
      pdfFileId: pdf.fileId,
      pdfUrl: pdf.url,
      pdfFolderUrl: pdf.folderUrl,
      recordCount: records.length,
      sheetRowCounts: rowCounts,
      verification: verification,
      sheetNames: RENEWAL_AUDIT_WORKSPACE.SHEETS.map(function(spec) { return spec.name; }),
      message: sampleMode
        ? fiscalYear + "年度のサンプル監査資料を正式資料と分離して作成し、4シート・PDF・読戻し検査を完了しました。"
        : fiscalYear + "年度の全体監査資料4シートとPDFを同じファイルIDで更新しました。",
      warnings: sampleMode || finance
        ? []
        : ["正式会計台帳が未設定のため、講習料金収納記録は見出しだけです。"]
    };
  } catch (error) {
    var result = auditWorkspaceError_(error);
    result.sampleMode = sampleMode;
    if (resolved && resolved.file && updateCompleted) {
      result.preservationRequired = true;
      result.url = resolved.file.getUrl();
      result.message += " Googleスプレッドシートは更新済みです。同じ操作を連打せず、PDF保存先と監査ログを確認してください。";
    }
    return result;
  } finally {
    lock.releaseLock();
  }
}

function auditWorkspaceError_(error) {
  var message = artifactErrorMessage_(error);
  return { success: false, ready: false, error: message, message: message, errors: [message] };
}

function auditWorkspaceFinanceSnapshot_() {
  if (typeof financeStoreGetState_ !== "function") return null;
  try {
    var envelope = financeStoreGetState_();
    if (!envelope || envelope.configured !== true || !envelope.state) return null;
    if (envelope.recoveryNeeded === true) {
      throw new Error("正式会計台帳が復旧待ちのため、全体監査資料を更新できません。");
    }
    financeValidateState_(envelope.state);
    return {
      revision: Number(envelope.revision || envelope.state.revision || 0),
      stateHash: artifactText_(envelope.stateHash),
      state: envelope.state
    };
  } catch (error) {
    if (artifactText_(error && error.code) === "FINANCE_NOT_CONFIGURED") return null;
    throw error;
  }
}

function auditWorkspaceFileName_(fiscalYear) {
  var sampleMode = arguments.length > 1 && arguments[1] === true;
  return (sampleMode ? "サンプル_正式使用禁止_" : "") +
    "更新講習_全体監査資料_" + fiscalYear + "年度";
}

function auditWorkspaceBuildSampleRecords_(fiscalYear) {
  var courseDate = fiscalYear + "-07-15";
  var issuedDate = fiscalYear + "-07-16";
  var expiryDate = fiscalYear + "-10-15";
  return [
    {
      recordId: "SAMPLE-AUDIT-FIRST-" + fiscalYear,
      personId: "SAMPLE-AUDIT-FIRST-" + fiscalYear,
      managementId: "SAMPLE-AUDIT-FIRST-" + fiscalYear,
      targetName: "サンプル太郎（監査試験・一等）",
      companyName: "サンプル株式会社（試験用）",
      fiscalYear: fiscalYear,
      licenseClass: "一等",
      courseScheduledDate: courseDate,
      courseDate: courseDate,
      courseVenue: "CDP北海道校（試験用）",
      certificateNo: "SAMPLE-UC1-" + fiscalYear + "-0001",
      certificateIssuedDate: issuedDate,
      certificateDelivered: "有り",
      certificateDeliveredDate: issuedDate,
      certificateExpiry: expiryDate,
      certificateLedgerMemo: "合成サンプル（正式使用禁止）",
      renewalListAmount: 16500
    },
    {
      recordId: "SAMPLE-AUDIT-SECOND-" + fiscalYear,
      personId: "SAMPLE-AUDIT-SECOND-" + fiscalYear,
      managementId: "SAMPLE-AUDIT-SECOND-" + fiscalYear,
      targetName: "サンプル花子（監査試験・二等）",
      companyName: "サンプル株式会社（試験用）",
      fiscalYear: fiscalYear,
      licenseClass: "二等",
      courseScheduledDate: courseDate,
      courseDate: courseDate,
      courseVenue: "CDP北海道校（試験用）",
      certificateNo: "SAMPLE-UC2-" + fiscalYear + "-0002",
      certificateIssuedDate: issuedDate,
      certificateDelivered: "有り",
      certificateDeliveredDate: issuedDate,
      certificateExpiry: expiryDate,
      certificateLedgerMemo: "合成サンプル（正式使用禁止）",
      renewalListAmount: 13200
    }
  ];
}

function auditWorkspaceValidateRows_(context, requireAllRows) {
  var counts = {};
  RENEWAL_AUDIT_WORKSPACE.SHEETS.forEach(function(spec) {
    var rows = auditWorkspaceSelectRows_(
      spec.key,
      auditWorkspaceAutoRows_(spec.key, context),
      context
    );
    counts[spec.key] = rows.length;
    if (requireAllRows && rows.length === 0) {
      throw new Error("サンプル検査を停止しました。" + spec.name + "の明細を生成できません。");
    }
  });
  return counts;
}

function auditWorkspaceVerifyOutput_(spreadsheet, context, expectedCounts) {
  var sheets = [];
  RENEWAL_AUDIT_WORKSPACE.SHEETS.forEach(function(spec) {
    var sheet = spreadsheet.getSheetByName(spec.name);
    if (!sheet) throw new Error(spec.name + "を保存後に確認できません。");
    var title = artifactText_(sheet.getRange("A1").getDisplayValue());
    var header = artifactText_(sheet.getRange("A3").getDisplayValue());
    var rowCount = Math.max(0, sheet.getLastRow() - 3);
    if (!title || !header) throw new Error(spec.name + "の見出しを保存後に確認できません。");
    if (rowCount !== Number(expectedCounts[spec.key] || 0)) {
      throw new Error(spec.name + "の保存件数が一致しません。予定=" +
        expectedCounts[spec.key] + "件 / 読戻し=" + rowCount + "件");
    }
    if (context.sampleMode && (rowCount === 0 || title.indexOf("サンプル・正式使用禁止") < 0)) {
      throw new Error(spec.name + "のサンプル識別または明細を確認できません。");
    }
    sheets.push({ key: spec.key, name: spec.name, rowCount: rowCount, passed: true });
  });
  return { passed: true, sheetCount: sheets.length, sheets: sheets };
}

function auditWorkspaceDescription_(fiscalYear) {
  var sampleMode = arguments.length > 1 && arguments[1] === true;
  var identity = { fiscalYear: fiscalYear };
  if (sampleMode) identity.sampleMode = true;
  return RENEWAL_AUDIT_WORKSPACE.FORMAT + "\n" + artifactCanonicalJson_(identity);
}

function auditWorkspaceResolve_(folder, fiscalYear, allowedEmails, sampleMode) {
  sampleMode = sampleMode === true;
  var propertyKey = RENEWAL_AUDIT_WORKSPACE.PROPERTY_PREFIX +
    (sampleMode ? "SAMPLE_" : "") + fiscalYear;
  var label = sampleMode ? "サンプル監査資料" : "全体監査資料";
  var props = PropertiesService.getScriptProperties();
  var storedId = artifactText_(props.getProperty(propertyKey));
  var file = null;
  if (storedId) {
    try { file = DriveApp.getFileById(storedId); }
    catch (error) { throw new Error("保存済み全体監査資料を取得できません。ID=" + storedId); }
  } else {
    var matches = [];
    var iterator = folder.getFilesByName(auditWorkspaceFileName_(fiscalYear, sampleMode));
    while (iterator.hasNext()) {
      var candidate = iterator.next();
      if (candidate.getMimeType() === MimeType.GOOGLE_SHEETS && !candidate.isTrashed()) matches.push(candidate);
    }
    if (matches.length > 1) throw new Error("同名の全体監査資料が複数あります。自動更新を停止しました。");
    if (matches.length === 1) file = matches[0];
  }
  var created = false;
  if (!file) {
    var createdItem = artifactCreateSpreadsheetInFolder_(
      auditWorkspaceFileName_(fiscalYear, sampleMode), folder, label, allowedEmails, false
    );
    file = createdItem.file;
    created = true;
    file.setDescription(auditWorkspaceDescription_(fiscalYear, sampleMode));
  }
  if (artifactText_(file.getDescription()) !== auditWorkspaceDescription_(fiscalYear, sampleMode)) {
    throw new Error(label + "の管理識別情報が一致しないため上書きしません。");
  }
  artifactAssertReusableDriveItem_(file, folder.getId(), label, allowedEmails);
  props.setProperty(propertyKey, file.getId());
  if (props.getProperty(propertyKey) !== file.getId()) {
    throw new Error("全体監査資料の固定IDを保存・読戻しできません。");
  }
  if (created) {
    artifactClearPublishedDriveAttempt_(
      artifactDriveAttemptOperation_(
        "CREATE", "", auditWorkspaceFileName_(fiscalYear, sampleMode),
        "application/vnd.google-apps.spreadsheet", folder.getId()
      ),
      file.getId(),
      label
    );
  }
  return {
    created: created,
    file: file,
    spreadsheet: artifactOpenSpreadsheetByIdWithRetry_(file.getId())
  };
}

function auditWorkspaceUpdate_(resolved, context) {
  var spreadsheet = resolved.spreadsheet;
  spreadsheet.setSpreadsheetTimeZone("Asia/Tokyo");
  spreadsheet.getSheets().forEach(function(sheet) {
    if (!/^__準備_/.test(sheet.getName())) return;
    var interruptedName = ("__中断_" + sheet.getName().replace(/^__準備_/, "")).slice(0, 90);
    var candidate = interruptedName;
    var suffix = 2;
    while (spreadsheet.getSheetByName(candidate)) {
      candidate = (interruptedName.slice(0, 86) + "_" + suffix).slice(0, 90);
      suffix++;
    }
    sheet.setName(candidate);
    try { sheet.hideSheet(); } catch (ignored) {}
  });
  var tag = artifactShortKey_(context.contentHash + "|" + Utilities.getUuid()).slice(0, 10);
  var prepared = [];
  var backups = [];
  try {
    RENEWAL_AUDIT_WORKSPACE.SHEETS.forEach(function(spec, index) {
      var sheet = spreadsheet.insertSheet("__準備_" + tag + "_" + (index + 1));
      prepared.push({ spec: spec, sheet: sheet });
      auditWorkspaceRenderSheet_(sheet, spec.key, context);
      if (!artifactText_(sheet.getRange("A1").getDisplayValue())) {
        throw new Error(spec.name + "の作成結果を読戻しできません。");
      }
    });
    SpreadsheetApp.flush();
    prepared.forEach(function(item, index) {
      var old = spreadsheet.getSheetByName(item.spec.name);
      if (old) {
        old.setName("__旧_" + tag + "_" + (index + 1));
        backups.push({ targetName: item.spec.name, sheet: old });
      }
      item.sheet.setName(item.spec.name);
    });
    RENEWAL_AUDIT_WORKSPACE.SHEETS.forEach(function(spec, index) {
      var sheet = spreadsheet.getSheetByName(spec.name);
      spreadsheet.setActiveSheet(sheet);
      spreadsheet.moveActiveSheet(index + 1);
    });
    var system = spreadsheet.getSheetByName(RENEWAL_AUDIT_WORKSPACE.SYSTEM_SHEET);
    if (!system) system = spreadsheet.insertSheet(RENEWAL_AUDIT_WORKSPACE.SYSTEM_SHEET);
    system.clear();
    system.getRange(1, 1, 8, 2).setValues([
      ["format", RENEWAL_AUDIT_WORKSPACE.FORMAT],
      ["fiscalYear", context.fiscalYear],
      ["sampleMode", context.sampleMode === true],
      ["contentHash", context.contentHash],
      ["recordCount", context.records.length],
      ["manualVersion", context.manualState ? context.manualState.version : 0],
      ["updatedAt", artifactNowText_()],
      ["updatedBy", context.authorization.email]
    ]);
    system.hideSheet();
    spreadsheet.setActiveSheet(spreadsheet.getSheetByName(RENEWAL_AUDIT_WORKSPACE.SHEETS[0].name));
    SpreadsheetApp.flush();
    backups.forEach(function(backup) {
      try { spreadsheet.deleteSheet(backup.sheet); }
      catch (error) { try { backup.sheet.hideSheet(); } catch (ignored) {} }
    });
    if (resolved.created) {
      spreadsheet.getSheets().forEach(function(sheet) {
        var name = sheet.getName();
        var managed = name === RENEWAL_AUDIT_WORKSPACE.SYSTEM_SHEET ||
          name === RENEWAL_AUDIT_MANUAL.SHEET ||
          RENEWAL_AUDIT_WORKSPACE.SHEETS.some(function(spec) { return spec.name === name; });
        if (!managed && spreadsheet.getSheets().length > 5) {
          try { spreadsheet.deleteSheet(sheet); } catch (ignoredDelete) {}
        }
      });
    }
    SpreadsheetApp.flush();
  } catch (error) {
    prepared.forEach(function(item) {
      try { if (spreadsheet.getSheetByName(item.sheet.getName())) spreadsheet.deleteSheet(item.sheet); }
      catch (ignored) {}
    });
    backups.forEach(function(backup) {
      try {
        if (!spreadsheet.getSheetByName(backup.targetName)) backup.sheet.setName(backup.targetName);
      } catch (ignoredRestore) {}
    });
    throw error;
  }
}

function auditWorkspaceRenderSheet_(sheet, key, context) {
  if (key === "plan") return auditWorkspaceRenderPlan_(sheet, context);
  if (key === "status") return auditWorkspaceRenderStatus_(sheet, context);
  if (key === "ledger") return auditWorkspaceRenderLedger_(sheet, context);
  if (key === "payment") return auditWorkspaceRenderPayment_(sheet, context);
  throw new Error("未対応の全体監査シートです。");
}

function auditWorkspaceBase_(sheet, title, headers, widths, rows) {
  var columnCount = headers.length;
  if (sheet.getMaxColumns() < columnCount) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), columnCount - sheet.getMaxColumns());
  }
  if (sheet.getMaxRows() < Math.max(30, rows.length + 5)) {
    sheet.insertRowsAfter(sheet.getMaxRows(), Math.max(30, rows.length + 5) - sheet.getMaxRows());
  }
  sheet.getRange(1, 1, 1, columnCount).merge();
  sheet.getRange(1, 1).setValue(title).setFontSize(14).setFontWeight("bold")
    .setFontColor("#ffffff").setBackground("#0b4f86").setVerticalAlignment("middle");
  sheet.setRowHeight(1, 34);
  sheet.getRange(3, 1, 1, columnCount).setValues([headers])
    .setBackground("#dbe8f4").setFontWeight("bold").setWrap(true)
    .setBorder(true, true, true, true, true, true);
  if (rows.length) {
    sheet.getRange(4, 1, rows.length, columnCount).setValues(artifactSafeSheetMatrix_(rows))
      .setWrap(true).setVerticalAlignment("middle")
      .setBorder(true, true, true, true, true, true);
  }
  widths.forEach(function(width, index) { sheet.setColumnWidth(index + 1, width); });
  sheet.setFrozenRows(3);
  sheet.getDataRange().setFontFamily("Noto Sans JP");
}

function auditWorkspaceSortRecords_(records) {
  return records.slice().sort(function(a, b) {
    return artifactText_(a.courseDate || a.courseScheduledDate).localeCompare(
      artifactText_(b.courseDate || b.courseScheduledDate)
    ) || artifactRecordName_(a).localeCompare(artifactRecordName_(b));
  });
}

function auditWorkspaceAutoRows_(key, context) {
  if (key === "plan") return auditWorkspacePlanRows_(context);
  if (key === "status") return auditWorkspaceStatusRows_(context);
  if (key === "ledger") return auditWorkspaceLedgerRows_(context);
  if (key === "payment") return auditWorkspacePaymentRows_(context);
  throw new Error("未対応の全体監査シートです。");
}

function auditWorkspacePlanRows_(context) {
  var groups = {};
  auditWorkspaceSortRecords_(context.records).forEach(function(record) {
    var date = artifactValidIsoDateOrBlank_(record.courseScheduledDate) ||
      artifactValidIsoDateOrBlank_(record.courseDate);
    if (!date) return;
    var key = [date, record.licenseClass, record.courseVenue].join("|");
    if (!groups[key]) groups[key] = { date: date, licenseClass: record.licenseClass, venue: record.courseVenue, count: 0 };
    groups[key].count++;
  });
  return Object.keys(groups).sort().map(function(key) {
    var row = groups[key];
    return [row.date.slice(0, 7), row.date, row.licenseClass, row.venue, row.count, row.count, "共有正本から自動集計"];
  });
}

function auditWorkspaceStatusRows_(context) {
  var groups = {};
  auditWorkspaceSortRecords_(context.records).forEach(function(record) {
    var date = artifactValidIsoDateOrBlank_(record.courseDate);
    if (!date) return;
    var key = [date, record.licenseClass, record.courseVenue].join("|");
    if (!groups[key]) groups[key] = { date: date, licenseClass: record.licenseClass, venue: record.courseVenue, count: 0 };
    groups[key].count++;
  });
  return Object.keys(groups).sort().map(function(key) {
    var row = groups[key];
    return [row.date, row.licenseClass, row.venue, row.count, "共有正本の講習修了日から自動集計"];
  });
}

function auditWorkspaceLedgerRows_(context) {
  return auditWorkspaceSortRecords_(context.records).filter(function(record) {
    return artifactText_(record.certificateNo) || artifactValidIsoDateOrBlank_(record.certificateIssuedDate);
  }).map(function(record) {
    var delivered = artifactText_(record.certificateDelivered) === "有り" ||
      !!artifactValidIsoDateOrBlank_(record.certificateDeliveredDate);
    return [
      record.certificateNo,
      artifactRecordName_(record),
      record.licenseClass,
      artifactValidIsoDateOrBlank_(record.courseDate),
      delivered ? "☑有り" : "□有り",
      artifactValidIsoDateOrBlank_(record.certificateDeliveredDate) || artifactValidIsoDateOrBlank_(record.certificateIssuedDate),
      artifactValidIsoDateOrBlank_(record.certificateExpiry),
      record.certificateLedgerMemo
    ];
  });
}

function auditWorkspacePaymentRows_(context) {
  if (context.sampleMode) return auditWorkspaceSamplePaymentRows_(context);
  var finance = context.finance;
  var recordMap = {};
  context.records.forEach(function(record) { recordMap[record.recordId || record.id] = record; });
  var rows = [];
  if (finance) {
    finance.state.invoices.filter(function(invoice) {
      return !!recordMap[artifactText_(invoice.customerId)];
    }).forEach(function(invoice) {
      var record = recordMap[artifactText_(invoice.customerId)];
      var position = financeInvoicePosition_(finance.state, invoice.id);
      rows.push([
        "請求", invoice.accountingDate, artifactRecordName_(record), invoice.invoiceNo,
        Number(invoice.totalExTax || 0), Number(invoice.totalTax || 0), Number(invoice.totalInclTax || 0),
        "", "", Number(position.outstanding || 0), invoice.status, invoice.id
      ]);
    });
    finance.state.payments.filter(function(payment) {
      return !!recordMap[artifactText_(payment.customerId)];
    }).forEach(function(payment) {
      var record = recordMap[artifactText_(payment.customerId)];
      rows.push([
        "入出金", payment.accountingDate, artifactRecordName_(record), "",
        "", "", "", payment.kind, Number(payment.amount || 0), "", payment.method, payment.id
      ]);
    });
  }
  rows.sort(function(a, b) { return artifactText_(a[1]).localeCompare(artifactText_(b[1])) || artifactText_(a[2]).localeCompare(artifactText_(b[2])); });
  return rows;
}

function auditWorkspaceSamplePaymentRows_(context) {
  var rows = [];
  auditWorkspaceSortRecords_(context.records).forEach(function(record, index) {
    var total = Math.round(Number(record.renewalListAmount || 0));
    var exTax = Math.round(total / 1.1);
    var tax = total - exTax;
    var date = artifactValidIsoDateOrBlank_(record.courseDate) || context.fiscalYear + "-07-15";
    var serial = String(index + 1);
    rows.push([
      "請求", date, artifactRecordName_(record), "SAMPLE-INV-" + context.fiscalYear + "-" + serial,
      exTax, tax, total, "", "", 0, "サンプル・入金済", "SAMPLE-INVOICE-" + context.fiscalYear + "-" + serial
    ]);
    rows.push([
      "入出金", date, artifactRecordName_(record), "",
      "", "", "", "サンプル入金", total, "", "サンプル・銀行振込", "SAMPLE-PAYMENT-" + context.fiscalYear + "-" + serial
    ]);
  });
  return rows;
}

function auditWorkspaceDisplayTitle_(title, context) {
  return context && context.sampleMode
    ? "【サンプル・正式使用禁止】" + title
    : title;
}

function auditWorkspaceRenderPlan_(sheet, context) {
  var rows = auditWorkspaceSelectRows_("plan", auditWorkspacePlanRows_(context), context);
  auditWorkspaceBase_(sheet,
    auditWorkspaceDisplayTitle_("登録更新講習機関実施計画書（" + context.fiscalYear + "年度・全体）", context),
    ["対象月", "実施予定日", "区分", "講習会場", "開始予定人数", "修了予定人数", "集計根拠"],
    [110, 120, 90, 240, 120, 120, 230], rows);
  sheet.getRange("A2").setValue(auditWorkspaceSourceNote_("plan", context, "共有正本から自動集計"));
}

function auditWorkspaceRenderStatus_(sheet, context) {
  var rows = auditWorkspaceSelectRows_("status", auditWorkspaceStatusRows_(context), context);
  auditWorkspaceBase_(sheet,
    auditWorkspaceDisplayTitle_("登録更新講習機関実施状況報告書（" + context.fiscalYear + "年度・全体）", context),
    ["講習実施日", "区分", "実施場所", "修了人数", "集計根拠"],
    [130, 100, 260, 110, 300], rows);
  sheet.getRange("A2").setValue(auditWorkspaceSourceNote_("status", context, "共有正本の講習修了日から自動集計"));
}

function auditWorkspaceRenderLedger_(sheet, context) {
  var rows = auditWorkspaceSelectRows_("ledger", auditWorkspaceLedgerRows_(context), context);
  auditWorkspaceBase_(sheet,
    auditWorkspaceDisplayTitle_("別添13 無人航空機更新講習修了証明書発行台帳（" + context.fiscalYear + "年度・全体）", context),
    ["更新講習修了証明書番号", "受講者氏名", "修了証明書種別", "講習日", "交付の有無", "交付年月日", "有効年月日", "備考"],
    [220, 180, 140, 120, 120, 130, 130, 260], rows);
  sheet.getRange("A2").setValue(auditWorkspaceSourceNote_("ledger", context, "共有正本の修了証明書情報から自動集計"));
}

function auditWorkspaceRenderPayment_(sheet, context) {
  var finance = context.finance;
  var rows = auditWorkspaceSelectRows_("payment", auditWorkspacePaymentRows_(context), context);
  auditWorkspaceBase_(sheet,
    auditWorkspaceDisplayTitle_("08_講習料金収納記録（" + context.fiscalYear + "年度・全体）", context),
    ["記録区分", "取引日", "対象者", "請求書番号", "税抜額", "消費税", "税込額", "取引種別", "入出金額", "請求残高", "状態・方法", "正本ID"],
    [100, 120, 180, 160, 110, 100, 110, 140, 110, 110, 150, 220], rows);
  if (rows.length) sheet.getRange(4, 5, rows.length, 6).setNumberFormat("#,##0");
  sheet.getRange("A2").setValue(auditWorkspaceSourceNote_("payment", context, context.sampleMode
    ? "合成サンプル請求・入金（正式会計台帳は不使用）"
    : (finance
      ? "正式会計台帳 revision " + finance.revision + " / stateHash " + finance.stateHash
      : "正式会計台帳未設定のため明細なし")));
}
