// @ts-nocheck
// CDP renewal license standalone app.
// This project intentionally does not read or deploy the existing CDP web app.

var APP = {
  SPREADSHEET_PROP: "RENEWAL_LICENSE_SPREADSHEET_ID",
  READ_SOURCE_URL_PROP: "READ_ONLY_SOURCE_SPREADSHEET_URL",
  READ_SOURCE_URL: "https://docs.google.com/spreadsheets/d/1GFMynPtdX1qHCC-GP0rI7XqfWBh_lbC5J_SV91NkN30/edit?gid=307646994#gid=307646994",
  READ_SOURCE_SPREADSHEET_ID: "1GFMynPtdX1qHCC-GP0rI7XqfWBh_lbC5J_SV91NkN30",
  READ_SOURCE_GID: 307646994,
  OPERATION_ROSTER_URL: "https://docs.google.com/spreadsheets/d/14bzaYZ_9dz4BMHNVDx7AfpKFN-3pStoWjKdKOMVeiv0/edit?usp=drive_link",
  OPERATION_GUIDE_DOC_URL: "https://docs.google.com/document/d/1jmjiJCrmqi_yWNp_hPLfAFmjVctaVqUZDguhRZ-HRks/edit?usp=drive_link",
  OPERATION_TRAINING_LOG_URL: "https://docs.google.com/spreadsheets/d/1b2gjUL0I2vfK-XOvbDhg8oXg36EdADajamivX7wfgC4/edit?usp=drive_link",
  SHEET_MAIN: "免許更新管理",
  SHEET_SETTINGS: "設定",
  SHEET_LOG: "アラート送信履歴",
  DEFAULT_TITLE: "CDP免許更新管理",
  TIMEZONE: "Asia/Tokyo",
  STATUSES: [
    "免許証確認待ち",
    "案内前",
    "案内済",
    "申込済み",
    "日程調整中",
    "講習申込受付",
    "講習予定",
    "講習修了",
    "更新申請待ち",
    "DIPS申請中",
    "更新完了未確認",
    "更新完了",
    "期限超過・未確認",
    "対象外",
    "期限切れ",
    "手続き不可ライン",
    "更新証明期限注意",
    "3か月以内",
    "CDP講習・申請受付中",
    "更新講習受講可能"
  ],
  CUSTOMER_TYPES: [
    "既存",
    "新規（他講習機関）",
    "新規",
    "法人"
  ],
  HEADERS: [
    "管理ID",
    "顧客区分",
    "氏名",
    "フリガナ",
    "会社名",
    "メール",
    "電話",
    "免許区分",
    "免許番号",
    "免許交付日",
    "免許有効期限",
    "免許確認日",
    "免許確認結果",
    "更新講習日",
    "更新証明発行日",
    "ステータス",
    "次回対応日",
    "最終連絡日",
    "担当者",
    "内部アラート宛先",
    "メモ",
    "作成日",
    "更新日",
    "更新講習申込日",
    "更新講習受講日",
    "更新講習修了日",
    "修了証明書番号",
    "修了証明書有効期限",
    "更新申請開始可能日",
    "更新申請期限",
    "DIPS申請日",
    "更新完了確認日",
    "新しい技能証明有効期限",
    "更新申請フォロー期限",
    "身体適性確認日",
    "身体適性確認結果"
  ],
  SETTINGS: [
    ["内部アラート宛先", "", "複数ある場合はカンマ区切り。危険対象の通知先。"],
    ["日次アラート時刻", "9", "0-23時。installDailyAlertTriggerで使います。"],
    ["更新講習受講可（月前）", "9", "免許有効期限の9か月前から受講可能。"],
    ["CDP講習・申請受付（月前）", "6", "CDPでは6か月前から講習・申請対応。"],
    ["手続き停止ライン（月前）", "1", "免許有効期限の1か月前から手続き不可扱い。"],
    ["更新証明有効（月）", "3", "更新講習修了証明の期限を3か月で管理。"],
    ["DIPS申請後確認（日）", "14", "DIPS申請中の新有効期限確認タスク期限。"],
    ["日次通知対象", "P1,P2", "日次メールに含めるリスク。例: P1,P2,P3"],
    ["読み取り元スプレッドシートURL", "https://docs.google.com/spreadsheets/d/1GFMynPtdX1qHCC-GP0rI7XqfWBh_lbC5J_SV91NkN30/edit?gid=307646994#gid=307646994", "読み取り専用。ここには絶対に書き込みません。"],
    ["運用ファイル_更新者一覧URL", "https://docs.google.com/spreadsheets/d/14bzaYZ_9dz4BMHNVDx7AfpKFN-3pStoWjKdKOMVeiv0/edit?usp=drive_link", "担当共有予定の更新者一覧。読み取り専用。"],
    ["運用ファイル_案内文テンプレートURL", "https://docs.google.com/document/d/1jmjiJCrmqi_yWNp_hPLfAFmjVctaVqUZDguhRZ-HRks/edit?usp=drive_link", "案内文テンプレート。読み取り専用。"],
    ["運用ファイル_講習記録簿URL", "https://docs.google.com/spreadsheets/d/1b2gjUL0I2vfK-XOvbDhg8oXg36EdADajamivX7wfgC4/edit?usp=drive_link", "講習記録簿。読み取り専用。"]
  ]
};

var COL = {};
for (var i = 0; i < APP.HEADERS.length; i++) {
  COL[APP.HEADERS[i]] = i;
}

function doGet() {
  return HtmlService.createTemplateFromFile("Index")
    .evaluate()
    .setTitle("CDP免許更新管理")
    .addMetaTag("viewport", "width=device-width, initial-scale=1")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function apiSetupSystem(options) {
  options = options || {};
  var ss = resolveOrCreateSpreadsheet_(options);
  ensureWorkbook_(ss);
  return {
    success: true,
    spreadsheetId: ss.getId(),
    spreadsheetUrl: ss.getUrl(),
    title: ss.getName()
  };
}

function apiGetDashboardData(filters) {
  filters = filters || {};
  var ss = getSpreadsheet_();
  ensureWorkbook_(ss);
  var sheet = ss.getSheetByName(APP.SHEET_MAIN);
  var settings = getSettings_(ss);
  var rows = readLicenseRows_(sheet);
  var today = stripTime_(new Date());
  var data = rows.map(function(row) {
    return buildViewRecord_(row, settings, today);
  });

  var query = normalize_(filters.query).toLowerCase();
  var risk = normalize_(filters.risk);
  var status = normalize_(filters.status);
  var customerType = normalize_(filters.customerType);
  var showAll = filters.showAll === true || filters.showAll === "true";

  var visible = data.filter(function(item) {
    if (!showAll && item.risk === "P5") return false;
    if (risk && item.risk !== risk) return false;
    if (status && item.status !== status) return false;
    if (customerType && item.customerType !== customerType) return false;
    if (!query) return true;
    return [
      item.managementId,
      item.customerType,
      item.name,
      item.kana,
      item.company,
      item.email,
      item.phone,
      item.licenseType,
      item.licenseNumber,
      item.memo
    ].some(function(value) {
      return normalize_(value).toLowerCase().indexOf(query) >= 0;
    });
  }).sort(sortRecords_);

  return {
    success: true,
    spreadsheetUrl: ss.getUrl(),
    generatedAt: formatDateTime_(new Date()),
    records: visible,
    allCount: data.length,
    summary: summarizeRecords_(data),
    statusOptions: APP.STATUSES,
    customerTypes: APP.CUSTOMER_TYPES,
    settings: {
      alertEmails: settings.alertEmails,
      dailyAlertHour: settings.dailyAlertHour,
      dailyRisks: settings.dailyRisks
    }
  };
}

function apiReadSourceSpreadsheet(options) {
  options = options || {};
  var targetSs = getSpreadsheet_();
  ensureWorkbook_(targetSs);
  var targetSheet = targetSs.getSheetByName(APP.SHEET_MAIN);
  var settings = getSettings_(targetSs);
  var sourceUrl = normalize_(options.sourceUrl) || settings.sourceUrl || APP.READ_SOURCE_URL;
  var sourceId = extractSpreadsheetId_(sourceUrl) || APP.READ_SOURCE_SPREADSHEET_ID;
  var sourceGid = extractGid_(sourceUrl);
  if (sourceGid == null) sourceGid = APP.READ_SOURCE_GID;

  // READ ONLY: the source spreadsheet is opened only for reading.
  // Do not call setValue/setValues/appendRow/clear/etc. on sourceSs or sourceSheet.
  var sourceSs = SpreadsheetApp.openById(sourceId);
  var sourceSheet = getSheetByGid_(sourceSs, sourceGid) || sourceSs.getSheets()[0];
  if (!sourceSheet) return { success: false, error: "読み取り元シートが見つかりません。" };

  var values = sourceSheet.getDataRange().getValues();
  if (!values || values.length === 0) {
    return { success: true, imported: 0, updated: 0, skipped: 0, sourceTitle: sourceSs.getName(), sourceSheetName: sourceSheet.getName() };
  }

  var headerInfo = detectSourceHeader_(values);
  if (!headerInfo) {
    return { success: false, error: "読み取り元のヘッダーを判定できません。氏名・免許期限などの見出し行が必要です。" };
  }

  var imported = 0;
  var updated = 0;
  var skipped = 0;
  var now = new Date();
  for (var r = headerInfo.rowIndex + 1; r < values.length; r++) {
    var record = buildRecordFromSourceRow_(values[r], headerInfo.map, {
      sourceSheetId: sourceSheet.getSheetId(),
      sourceRowNumber: r + 1,
      now: now
    });
    if (!record) {
      skipped++;
      continue;
    }
    var result = upsertImportedRecord_(targetSheet, record, now, settings);
    if (result.created) imported++;
    else updated++;
  }
  formatMainSheet_(targetSheet);

  return {
    success: true,
    imported: imported,
    updated: updated,
    skipped: skipped,
    sourceTitle: sourceSs.getName(),
    sourceSheetName: sourceSheet.getName(),
    sourceUrl: sourceUrl,
    sourceSpreadsheetId: sourceId,
    sourceGid: sourceSheet.getSheetId()
  };
}

function apiReadOperationFiles(options) {
  options = options || {};
  var targetSs = getSpreadsheet_();
  ensureWorkbook_(targetSs);
  var targetSheet = targetSs.getSheetByName(APP.SHEET_MAIN);
  var settings = getSettings_(targetSs);
  var now = new Date();
  var summary = {
    roster: { imported: 0, updated: 0, skipped: 0, sheets: 0 },
    trainingLog: { imported: 0, updated: 0, skipped: 0, sheets: 0 },
    guide: { read: false, dates: [], price: "", phone: "", email: "" },
    warnings: []
  };

  var rosterUrl = normalize_(options.rosterUrl) || settings.operationRosterUrl;
  var guideDocUrl = normalize_(options.guideDocUrl) || settings.operationGuideDocUrl;
  var trainingLogUrl = normalize_(options.trainingLogUrl) || settings.operationTrainingLogUrl;

  if (rosterUrl) {
    try {
      var rosterResult = importOperationRoster_(targetSheet, rosterUrl, settings, now);
      summary.roster = rosterResult;
    } catch (e) {
      summary.warnings.push("更新者一覧を読み取れませんでした: " + e.message);
    }
  }

  if (trainingLogUrl) {
    try {
      var logResult = importTrainingLog_(targetSheet, trainingLogUrl, settings, now);
      summary.trainingLog = logResult;
    } catch (e2) {
      summary.warnings.push("講習記録簿を読み取れませんでした: " + e2.message);
    }
  }

  if (guideDocUrl) {
    try {
      summary.guide = readGuideDocument_(guideDocUrl);
    } catch (e3) {
      summary.warnings.push("案内文テンプレートを読み取れませんでした: " + e3.message);
    }
  }

  formatMainSheet_(targetSheet);
  return {
    success: summary.warnings.length < 3,
    imported: summary.roster.imported + summary.trainingLog.imported,
    updated: summary.roster.updated + summary.trainingLog.updated,
    skipped: summary.roster.skipped + summary.trainingLog.skipped,
    summary: summary
  };
}

function apiSaveRecord(record) {
  record = record || {};
  var ss = getSpreadsheet_();
  ensureWorkbook_(ss);
  var sheet = ss.getSheetByName(APP.SHEET_MAIN);
  var settings = getSettings_(ss);
  var now = new Date();
  var id = normalize_(record.managementId);
  var rowNumber = id ? findRowById_(sheet, id) : -1;
  if (!id) id = createManagementId_();

  var current = rowNumber >= 2
    ? sheet.getRange(rowNumber, 1, 1, APP.HEADERS.length).getValues()[0]
    : blankRow_();

  setRowValue_(current, "管理ID", id);
  setRowValue_(current, "顧客区分", normalize_(record.customerType) || "既存");
  setRowValue_(current, "氏名", normalize_(record.name));
  setRowValue_(current, "フリガナ", normalize_(record.kana));
  setRowValue_(current, "会社名", normalize_(record.company));
  setRowValue_(current, "メール", normalize_(record.email));
  setRowValue_(current, "電話", normalize_(record.phone));
  setRowValue_(current, "免許区分", normalize_(record.licenseType));
  setRowValue_(current, "免許番号", normalize_(record.licenseNumber));
  setRowValue_(current, "免許交付日", parseDateOrBlank_(record.licenseIssueDate));
  setRowValue_(current, "免許有効期限", parseDateOrBlank_(record.licenseExpiryDate));
  setRowValue_(current, "免許確認日", parseDateOrBlank_(record.licenseCheckedDate));
  setRowValue_(current, "免許確認結果", normalize_(record.licenseCheckResult));
  var courseAttendedDate = parseDateOrBlank_(record.courseAttendedDate || record.renewalCourseDate);
  var courseCompletionDate = parseDateOrBlank_(record.courseCompletionDate || record.certificateIssueDate);
  setRowValue_(current, "更新講習日", courseAttendedDate);
  setRowValue_(current, "更新証明発行日", courseCompletionDate);
  setRowValue_(current, "ステータス", normalizeStatus_(record.status) || "免許証確認待ち");
  setRowValue_(current, "次回対応日", parseDateOrBlank_(record.nextActionDate));
  setRowValue_(current, "最終連絡日", parseDateOrBlank_(record.lastContactDate));
  setRowValue_(current, "担当者", normalize_(record.owner));
  setRowValue_(current, "内部アラート宛先", normalize_(record.alertEmail));
  setRowValue_(current, "メモ", normalize_(record.memo));
  if (!getRowValue_(current, "作成日")) setRowValue_(current, "作成日", now);
  setRowValue_(current, "更新日", now);
  setRowValue_(current, "更新講習申込日", parseDateOrBlank_(record.courseApplicationDate));
  setRowValue_(current, "更新講習受講日", courseAttendedDate);
  setRowValue_(current, "更新講習修了日", courseCompletionDate);
  setRowValue_(current, "修了証明書番号", normalize_(record.certificateNumber));
  setRowValue_(current, "DIPS申請日", parseDateOrBlank_(record.dipsApplicationDate));
  setRowValue_(current, "更新完了確認日", parseDateOrBlank_(record.renewalCompletedDate));
  setRowValue_(current, "新しい技能証明有効期限", parseDateOrBlank_(record.newLicenseExpiryDate));
  setRowValue_(current, "身体適性確認日", parseDateOrBlank_(record.medicalCheckDate));
  setRowValue_(current, "身体適性確認結果", normalize_(record.medicalCheckResult));
  applyDerivedDatesToRow_(current, settings);

  if (rowNumber >= 2) {
    sheet.getRange(rowNumber, 1, 1, APP.HEADERS.length).setValues([current]);
  } else {
    sheet.appendRow(current);
    rowNumber = sheet.getLastRow();
  }
  formatMainSheet_(sheet);
  return { success: true, managementId: id, rowNumber: rowNumber };
}

function apiSendInternalAlert(payload) {
  payload = payload || {};
  var ss = getSpreadsheet_();
  ensureWorkbook_(ss);
  var settings = getSettings_(ss);
  var sheet = ss.getSheetByName(APP.SHEET_MAIN);
  var rowNumber = findRowById_(sheet, normalize_(payload.managementId));
  if (rowNumber < 2) return { success: false, error: "対象が見つかりません。" };

  var row = sheet.getRange(rowNumber, 1, 1, APP.HEADERS.length).getValues()[0];
  var record = buildViewRecord_(rowToObject_(row), settings, stripTime_(new Date()));
  var to = normalize_(payload.to) || record.alertEmail || settings.alertEmails;
  if (!to) return { success: false, error: "送信先メールアドレスが未設定です。" };

  var subject = "[CDP免許更新アラート] " + record.risk + " " + record.name + " / " + record.phase;
  var body = buildAlertMailBody_(record, payload.message);
  MailApp.sendEmail({ to: to, subject: subject, body: body });
  appendAlertLog_(ss, {
    sentAt: new Date(),
    to: to,
    managementId: record.managementId,
    name: record.name,
    risk: record.risk,
    phase: record.phase,
    subject: subject
  });
  sheet.getRange(rowNumber, COL["最終連絡日"] + 1).setValue(new Date());
  sheet.getRange(rowNumber, COL["更新日"] + 1).setValue(new Date());

  return { success: true, to: to, subject: subject };
}

function apiSendDailyAlertSummary(toOverride) {
  return sendDailyAlertSummary(toOverride);
}

function sendDailyAlertSummary(toOverride) {
  var ss = getSpreadsheet_();
  ensureWorkbook_(ss);
  var settings = getSettings_(ss);
  var to = normalize_(toOverride) || settings.alertEmails;
  if (!to) return { success: false, error: "設定シートの内部アラート宛先が未設定です。" };

  var data = apiGetDashboardData({ showAll: true });
  var targetRisks = settings.dailyRisks || ["P1", "P2"];
  var targets = data.records.filter(function(record) {
    return targetRisks.indexOf(record.risk) >= 0;
  }).sort(sortRecords_);

  if (targets.length === 0) {
    return { success: true, skipped: true, message: "通知対象はありません。" };
  }

  var subject = "[CDP免許更新] 要対応 " + targets.length + "件 (" + formatDate_(new Date()) + ")";
  var lines = [
    "免許更新の要対応者一覧です。",
    "",
    "運用ルール:",
    "- 免許更新は3年に1度",
    "- 更新講習は9か月前から受講可能",
    "- 更新申請は有効期限6か月前から1か月前まで",
    "- 講習修了は更新完了ではなく、DIPS申請と新有効期限確認が必要",
    "- 修了証明書は修了日から3か月後の前日までで期限管理",
    "- 講習後のフォロー期限は「有効期限1か月前」と「修了証明書期限」の早い方",
    "",
    "対象:"
  ];
  targets.forEach(function(record) {
    lines.push(
      record.risk + " | " + record.name + " | " + record.customerType +
      " | 現期限 " + (record.currentLicenseExpiryDate || record.licenseExpiryDate || "未確認") +
      " | " + record.phase +
      " | タスク " + (record.taskName || "-") +
      " | 次対応 " + (record.nextActionDate || "-")
    );
  });
  lines.push("");
  lines.push("管理表: " + ss.getUrl());

  MailApp.sendEmail({ to: to, subject: subject, body: lines.join("\n") });
  appendAlertLog_(ss, {
    sentAt: new Date(),
    to: to,
    managementId: "DAILY",
    name: "日次サマリー",
    risk: targetRisks.join(","),
    phase: "日次通知",
    subject: subject
  });
  return { success: true, to: to, count: targets.length, subject: subject };
}

function apiInstallDailyAlertTrigger(hour) {
  hour = Number(hour);
  if (!isFinite(hour) || hour < 0 || hour > 23) hour = Number(getSettings_(getSpreadsheet_()).dailyAlertHour) || 9;
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction && trigger.getHandlerFunction() === "sendDailyAlertSummary") {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  ScriptApp.newTrigger("sendDailyAlertSummary").timeBased().everyDays(1).atHour(hour).create();
  return { success: true, hour: hour };
}

function apiGetSetupState() {
  var id = PropertiesService.getScriptProperties().getProperty(APP.SPREADSHEET_PROP);
  if (!id) return { success: true, configured: false };
  try {
    var ss = SpreadsheetApp.openById(id);
    return { success: true, configured: true, spreadsheetId: id, spreadsheetUrl: ss.getUrl(), title: ss.getName() };
  } catch (e) {
    return { success: true, configured: false, error: e.message };
  }
}

function resolveOrCreateSpreadsheet_(options) {
  var id = extractSpreadsheetId_(options.spreadsheetId || options.spreadsheetUrl);
  var ss;
  if (id) {
    ss = SpreadsheetApp.openById(id);
  } else {
    var title = normalize_(options.title) || APP.DEFAULT_TITLE + "_" + Utilities.formatDate(new Date(), APP.TIMEZONE, "yyyyMMdd");
    ss = SpreadsheetApp.create(title);
  }
  PropertiesService.getScriptProperties().setProperty(APP.SPREADSHEET_PROP, ss.getId());
  return ss;
}

function getSpreadsheet_() {
  var id = PropertiesService.getScriptProperties().getProperty(APP.SPREADSHEET_PROP);
  if (!id) throw new Error("専用スプレッドシートが未設定です。初回セットアップを実行してください。");
  return SpreadsheetApp.openById(id);
}

function ensureWorkbook_(ss) {
  var main = ss.getSheetByName(APP.SHEET_MAIN) || ss.insertSheet(APP.SHEET_MAIN);
  ensureHeaders_(main, APP.HEADERS);
  formatMainSheet_(main);

  var settings = ss.getSheetByName(APP.SHEET_SETTINGS) || ss.insertSheet(APP.SHEET_SETTINGS);
  ensureSettingsSheet_(settings);

  var log = ss.getSheetByName(APP.SHEET_LOG) || ss.insertSheet(APP.SHEET_LOG);
  ensureHeaders_(log, ["送信日時", "送信先", "管理ID", "氏名", "リスク", "状態", "件名"]);
  log.setFrozenRows(1);
}

function ensureHeaders_(sheet, headers) {
  if (sheet.getMaxColumns() < headers.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
  }
  var current = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  var changed = false;
  for (var i = 0; i < headers.length; i++) {
    if (normalize_(current[i]) !== headers[i]) {
      current[i] = headers[i];
      changed = true;
    }
  }
  if (changed) sheet.getRange(1, 1, 1, headers.length).setValues([current]);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#102a43").setFontColor("#ffffff");
  sheet.setFrozenRows(1);
}

function ensureSettingsSheet_(sheet) {
  ensureHeaders_(sheet, ["項目", "値", "説明"]);
  var lastRow = sheet.getLastRow();
  var existing = {};
  if (lastRow >= 2) {
    var values = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
    values.forEach(function(row) {
      existing[normalize_(row[0])] = true;
    });
  }
  APP.SETTINGS.forEach(function(row) {
    if (!existing[row[0]]) sheet.appendRow(row);
  });
  sheet.autoResizeColumns(1, 3);
}

function formatMainSheet_(sheet) {
  try {
    sheet.getRange(2, COL["免許交付日"] + 1, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat("yyyy/mm/dd");
    sheet.getRange(2, COL["免許有効期限"] + 1, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat("yyyy/mm/dd");
    sheet.getRange(2, COL["免許確認日"] + 1, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat("yyyy/mm/dd");
    sheet.getRange(2, COL["更新講習日"] + 1, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat("yyyy/mm/dd");
    sheet.getRange(2, COL["更新証明発行日"] + 1, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat("yyyy/mm/dd");
    sheet.getRange(2, COL["次回対応日"] + 1, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat("yyyy/mm/dd");
    sheet.getRange(2, COL["最終連絡日"] + 1, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat("yyyy/mm/dd");
    [
      "更新講習申込日",
      "更新講習受講日",
      "更新講習修了日",
      "修了証明書有効期限",
      "更新申請開始可能日",
      "更新申請期限",
      "DIPS申請日",
      "更新完了確認日",
      "新しい技能証明有効期限",
      "更新申請フォロー期限",
      "身体適性確認日"
    ].forEach(function(header) {
      sheet.getRange(2, COL[header] + 1, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat("yyyy/mm/dd");
    });
    applyValidation_(sheet, "顧客区分", APP.CUSTOMER_TYPES);
    applyValidation_(sheet, "ステータス", APP.STATUSES);
    applyValidation_(sheet, "免許確認結果", ["未確認", "有効", "期限切れ", "不備あり"]);
    applyValidation_(sheet, "身体適性確認結果", ["未確認", "確認済み", "不備あり", "不要"]);
    sheet.autoResizeColumns(1, Math.min(APP.HEADERS.length, 12));
  } catch (e) {
    Logger.log("formatMainSheet skipped: " + e.message);
  }
}

function applyValidation_(sheet, header, values) {
  var rule = SpreadsheetApp.newDataValidation().requireValueInList(values, true).setAllowInvalid(true).build();
  sheet.getRange(2, COL[header] + 1, Math.max(sheet.getMaxRows() - 1, 1), 1).setDataValidation(rule);
}

function getSettings_(ss) {
  var sheet = ss.getSheetByName(APP.SHEET_SETTINGS);
  ensureSettingsSheet_(sheet);
  var values = sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 0), 3).getValues();
  var map = {};
  values.forEach(function(row) {
    map[normalize_(row[0])] = normalize_(row[1]);
  });
  return {
    alertEmails: map["内部アラート宛先"] || "",
    dailyAlertHour: Number(map["日次アラート時刻"] || 9),
    courseEligibleMonths: Number(map["更新講習受講可（月前）"] || 9),
    cdpStartMonths: Number(map["CDP講習・申請受付（月前）"] || 6),
    procedureStopMonths: Number(map["手続き停止ライン（月前）"] || 1),
    certificateValidMonths: Number(map["更新証明有効（月）"] || 3),
    dipsFollowDays: Number(map["DIPS申請後確認（日）"] || 14),
    dailyRisks: (map["日次通知対象"] || "P1,P2").split(",").map(function(s) { return normalize_(s); }).filter(Boolean),
    sourceUrl: map["読み取り元スプレッドシートURL"] || APP.READ_SOURCE_URL,
    operationRosterUrl: map["運用ファイル_更新者一覧URL"] || APP.OPERATION_ROSTER_URL,
    operationGuideDocUrl: map["運用ファイル_案内文テンプレートURL"] || APP.OPERATION_GUIDE_DOC_URL,
    operationTrainingLogUrl: map["運用ファイル_講習記録簿URL"] || APP.OPERATION_TRAINING_LOG_URL
  };
}

function importOperationRoster_(targetSheet, rosterUrl, settings, now) {
  var sourceId = extractSpreadsheetId_(rosterUrl);
  if (!sourceId) throw new Error("URLからスプレッドシートIDを取得できません。");
  // READ ONLY: SpreadsheetApp is used only with getValues() on the operation file.
  var sourceSs = SpreadsheetApp.openById(sourceId);
  var sheets = sourceSs.getSheets();
  var result = { imported: 0, updated: 0, skipped: 0, sheets: 0, sourceTitle: sourceSs.getName() };
  sheets.forEach(function(sheet) {
    var sheetName = sheet.getName();
    if (!/更新者一覧/.test(sheetName)) return;
    var values = sheet.getDataRange().getValues();
    result.sheets++;
    for (var r = 3; r < values.length; r++) {
      var record = buildRecordFromOperationRosterRow_(values[r], {
        sourceSheetId: sheet.getSheetId(),
        sourceRowNumber: r + 1,
        sheetName: sheetName,
        now: now
      });
      if (!record) {
        result.skipped++;
        continue;
      }
      var upsert = upsertImportedRecord_(targetSheet, record, now, settings);
      if (upsert.created) result.imported++;
      else result.updated++;
    }
  });
  return result;
}

function buildRecordFromOperationRosterRow_(row, meta) {
  var number = normalize_(row[0]);
  var name = normalize_(row[1]);
  var email = normalize_(row[2]);
  var expiry = parseDate_(row[3]);
  if (!name || !expiry) return null;

  var guideSent = toBoolean_(row[7]) || toBoolean_(row[9]) || normalize_(row[10]) !== "" || normalize_(row[11]) !== "";
  var courseDate = parseOperationCourseDate_(row[13], expiry);
  var venue = normalize_(row[14]);
  var memoParts = [];
  if (normalize_(row[16])) memoParts.push(normalize_(row[16]));
  if (normalize_(row[15]) && !/^\d+(\.\d+)?$/.test(normalize_(row[15]))) memoParts.push(normalize_(row[15]));
  memoParts.push("運用更新者一覧: " + meta.sheetName + " " + (number || meta.sourceRowNumber));

  var status = "案内前";
  if (courseDate) status = "講習予定";
  else if (guideSent) status = "案内済";

  return {
    managementId: "OPS-" + meta.sourceSheetId + "-" + meta.sourceRowNumber,
    customerType: "既存",
    name: name,
    email: email,
    licenseExpiryDate: expiry,
    licenseCheckResult: "未確認",
    courseAttendedDate: courseDate || "",
    renewalCourseDate: courseDate || "",
    status: status,
    lastContactDate: guideSent ? stripTime_(meta.now) : "",
    memo: memoParts.filter(Boolean).join(" / "),
    sourceStatusProvided: true
  };
}

function importTrainingLog_(targetSheet, trainingLogUrl, settings, now) {
  var sourceId = extractSpreadsheetId_(trainingLogUrl);
  if (!sourceId) throw new Error("URLからスプレッドシートIDを取得できません。");
  // READ ONLY: the training log is opened only for reading.
  var sourceSs = SpreadsheetApp.openById(sourceId);
  var sheets = sourceSs.getSheets();
  var result = { imported: 0, updated: 0, skipped: 0, sheets: 0, sourceTitle: sourceSs.getName() };
  sheets.forEach(function(sheet) {
    var record = buildRecordFromTrainingLogSheet_(sheet, now);
    if (!record) {
      result.skipped++;
      return;
    }
    result.sheets++;
    var upsert = upsertImportedRecord_(targetSheet, record, now, settings);
    if (upsert.created) result.imported++;
    else result.updated++;
  });
  return result;
}

function buildRecordFromTrainingLogSheet_(sheet, now) {
  var sheetName = sheet.getName();
  var values = sheet.getDataRange().getValues();
  var titleText = normalize_(sheetName + " " + ((values[0] && values[0][0]) || ""));
  var nameMatch = titleText.match(/受講者氏名[（(]([^）)]+)[）)]/);
  var name = nameMatch ? normalize_(nameMatch[1]).replace(/[　\s]+/g, " ") : "";
  if (!name || /^[＿_\s　]+$/.test(name)) return null;

  var courseDate = null;
  var venue = "";
  for (var r = 0; r < Math.min(values.length, 12); r++) {
    for (var c = 0; c < Math.min(values[r].length, 8); c++) {
      var text = normalize_(values[r][c]);
      if (!courseDate && text.indexOf("受講日") >= 0) courseDate = parseDateFromText_(text);
      if (!venue && text.indexOf("場所") >= 0) venue = extractParenthesizedText_(text);
    }
  }
  if (!courseDate) return null;

  return {
    managementId: "LOG-" + sheet.getSheetId(),
    customerType: "既存",
    name: name,
    courseAttendedDate: courseDate,
    courseCompletionDate: courseDate,
    renewalCourseDate: courseDate,
    certificateIssueDate: courseDate,
    status: "講習修了",
    memo: "講習記録簿反映: " + formatDate_(courseDate) + (venue ? " / 会場 " + venue : ""),
    sourceStatusProvided: true
  };
}

function readGuideDocument_(guideDocUrl) {
  var docId = extractDocumentId_(guideDocUrl);
  if (!docId) throw new Error("URLからドキュメントIDを取得できません。");
  // READ ONLY: the guide document is opened only to extract template metadata.
  var doc = DocumentApp.openById(docId);
  var text = doc.getBody().getText();
  var dates = [];
  var dateRegex = /(\d{1,2}月\d{1,2}日[^\n\r\t]*)/g;
  var m;
  while ((m = dateRegex.exec(text)) && dates.length < 20) {
    var item = normalize_(m[1]);
    if (dates.indexOf(item) < 0) dates.push(item);
  }
  var priceMatch = text.match(/([0-9,]+円（税込）?)/);
  var phoneMatch = text.match(/電話番号：([^\n\r]+)/);
  var emailMatch = text.match(/メールアドレス：([^\s\n\r]+)/);
  return {
    read: true,
    title: doc.getName(),
    dates: dates,
    price: priceMatch ? normalize_(priceMatch[1]) : "",
    phone: phoneMatch ? normalize_(phoneMatch[1]) : "",
    email: emailMatch ? normalize_(emailMatch[1]) : ""
  };
}

function detectSourceHeader_(values) {
  var best = null;
  var maxRows = Math.min(values.length, 12);
  for (var r = 0; r < maxRows; r++) {
    var map = buildSourceHeaderMap_(values[r]);
    var score = Object.keys(map).length;
    if (map.name != null) score += 3;
    if (map.licenseExpiryDate != null) score += 3;
    if (map.managementId != null || map.licenseNumber != null) score += 1;
    if (!best || score > best.score) best = { rowIndex: r, map: map, score: score };
  }
  if (!best || best.score < 4 || best.map.name == null) return null;
  return best;
}

function buildSourceHeaderMap_(headerRow) {
  var aliases = getSourceAliases_();
  var map = {};
  var normalizedHeaders = headerRow.map(function(value) {
    return normalizeHeader_(value);
  });
  Object.keys(aliases).forEach(function(field) {
    var names = aliases[field].map(normalizeHeader_);
    for (var c = 0; c < normalizedHeaders.length; c++) {
      if (names.indexOf(normalizedHeaders[c]) >= 0) {
        map[field] = c;
        return;
      }
    }
    for (var c2 = 0; c2 < normalizedHeaders.length; c2++) {
      for (var n = 0; n < names.length; n++) {
        if (normalizedHeaders[c2] && names[n] && normalizedHeaders[c2].indexOf(names[n]) >= 0) {
          map[field] = c2;
          return;
        }
      }
    }
  });
  return map;
}

function getSourceAliases_() {
  return {
    managementId: ["管理ID", "ID", "受講生ID", "顧客ID", "更新ID", "免許管理ID"],
    customerType: ["顧客区分", "区分", "顧客種別", "種別"],
    name: ["氏名", "名前", "受講者", "受講者氏名", "受講生", "受講生氏名", "顧客名"],
    kana: ["フリガナ", "ふりがな", "カナ"],
    company: ["会社名", "法人名", "所属", "勤務先"],
    email: ["メール", "メールアドレス", "email", "e-mail"],
    phone: ["電話", "電話番号", "携帯", "携帯番号", "連絡先"],
    licenseType: ["免許区分", "資格区分", "免許種別", "種別", "免許"],
    licenseNumber: ["免許番号", "技能証明番号", "証明番号", "資格番号", "ライセンス番号"],
    licenseIssueDate: ["免許交付日", "交付日", "発行日", "免許発行日"],
    licenseExpiryDate: ["免許有効期限", "有効期限", "免許期限", "期限", "免許更新期限"],
    licenseCheckedDate: ["免許確認日", "確認日", "免許証確認日"],
    licenseCheckResult: ["免許確認結果", "確認結果", "確認", "免許証確認"],
    renewalCourseDate: ["更新講習日", "講習日", "受講日", "更新受講日"],
    courseApplicationDate: ["更新講習申込日", "講習申込日", "申込日", "受付日"],
    courseAttendedDate: ["更新講習受講日", "受講日", "講習受講日", "更新受講日"],
    courseCompletionDate: ["更新講習修了日", "講習修了日", "修了日", "修了証明発行日"],
    certificateIssueDate: ["更新証明発行日", "証明発行日", "修了証明発行日", "更新証明日"],
    certificateNumber: ["修了証明書番号", "更新講習修了証明書番号", "証明書番号", "修了番号"],
    certificateExpiryDate: ["修了証明書有効期限", "更新証明期限", "修了証明期限", "証明期限"],
    dipsApplicationDate: ["DIPS申請日", "申請日", "更新申請日"],
    renewalCompletedDate: ["更新完了確認日", "更新完了日", "DIPS更新完了日", "完了確認日"],
    newLicenseExpiryDate: ["新しい技能証明有効期限", "新有効期限", "更新後有効期限", "次回有効期限"],
    followDeadline: ["更新申請フォロー期限", "フォロー期限", "申請フォロー期限"],
    medicalCheckDate: ["身体適性確認日", "身体検査確認日", "身体適性検査日"],
    medicalCheckResult: ["身体適性確認結果", "身体適性結果", "身体検査結果"],
    status: ["ステータス", "状態", "対応状況"],
    nextActionDate: ["次回対応日", "対応日", "次アクション", "次回連絡日"],
    lastContactDate: ["最終連絡日", "連絡日", "最終対応日"],
    owner: ["担当者", "担当"],
    alertEmail: ["内部アラート宛先", "アラート宛先", "通知先"],
    memo: ["メモ", "備考", "備考欄"]
  };
}

function buildRecordFromSourceRow_(row, map, meta) {
  function read(field) {
    var index = map[field];
    return index == null ? "" : row[index];
  }

  var nameInfo = splitSourceNameCell_(read("name"));
  var name = nameInfo.name;
  var licenseNumber = normalize_(read("licenseNumber"));
  var expiry = parseDate_(read("licenseExpiryDate"));
  if (!name && !licenseNumber && !expiry) return null;

  var managementId = normalize_(read("managementId"));
  if (!managementId && nameInfo.id) managementId = nameInfo.id;
  if (!managementId) managementId = "SRC-" + meta.sourceSheetId + "-" + meta.sourceRowNumber;

  var customerType = normalize_(read("customerType")) || "既存";
  if (customerType === "新規（他講習）") customerType = "新規（他講習機関）";
  if (customerType.indexOf("他講習") >= 0) customerType = "新規（他講習機関）";

  var rawStatus = normalize_(read("status"));
  var status = normalizeStatus_(rawStatus);
  var checkResult = normalize_(read("licenseCheckResult"));
  if (!checkResult && expiry && daysBetween_(stripTime_(new Date()), expiry) < 0) checkResult = "期限切れ";
  if (!status) status = "免許証確認待ち";
  var courseAttendedDate = parseDateOrBlank_(read("courseAttendedDate") || read("renewalCourseDate"));
  var courseCompletionDate = parseDateOrBlank_(read("courseCompletionDate") || read("certificateIssueDate"));

  return {
    managementId: managementId,
    customerType: customerType,
    name: name,
    kana: normalize_(read("kana")),
    company: normalize_(read("company")),
    email: normalize_(read("email")),
    phone: normalize_(read("phone")),
    licenseType: normalize_(read("licenseType")),
    licenseNumber: licenseNumber,
    licenseIssueDate: parseDateOrBlank_(read("licenseIssueDate")),
    licenseExpiryDate: expiry || "",
    licenseCheckedDate: parseDateOrBlank_(read("licenseCheckedDate")),
    licenseCheckResult: checkResult,
    renewalCourseDate: courseAttendedDate,
    courseApplicationDate: parseDateOrBlank_(read("courseApplicationDate")),
    courseAttendedDate: courseAttendedDate,
    courseCompletionDate: courseCompletionDate,
    certificateIssueDate: courseCompletionDate,
    certificateNumber: normalize_(read("certificateNumber")),
    certificateExpiryDate: parseDateOrBlank_(read("certificateExpiryDate")),
    dipsApplicationDate: parseDateOrBlank_(read("dipsApplicationDate")),
    renewalCompletedDate: parseDateOrBlank_(read("renewalCompletedDate")),
    newLicenseExpiryDate: parseDateOrBlank_(read("newLicenseExpiryDate")),
    followDeadline: parseDateOrBlank_(read("followDeadline")),
    medicalCheckDate: parseDateOrBlank_(read("medicalCheckDate")),
    medicalCheckResult: normalize_(read("medicalCheckResult")),
    status: status,
    nextActionDate: parseDateOrBlank_(read("nextActionDate")),
    lastContactDate: parseDateOrBlank_(read("lastContactDate")),
    owner: normalize_(read("owner")),
    alertEmail: normalize_(read("alertEmail")),
    memo: normalize_(read("memo")),
    sourceRowNumber: meta.sourceRowNumber,
    importedAt: meta.now,
    sourceStatusProvided: !!rawStatus
  };
}

function splitSourceNameCell_(value) {
  var text = normalize_(value);
  if (!text) return { name: "", id: "" };
  var parts = text.split(/\r?\n/).map(function(part) { return normalize_(part); }).filter(Boolean);
  if (parts.length <= 1) return { name: text, id: "" };
  return {
    name: parts[0],
    id: parts.slice(1).find(function(part) { return /^[A-Za-z]{1,8}[-_][A-Za-z0-9-]+$/.test(part) || /\d/.test(part); }) || ""
  };
}

function upsertImportedRecord_(sheet, record, now, settings) {
  var rowNumber = findImportedTargetRow_(sheet, record);
  var created = rowNumber < 2;
  var row = created
    ? blankRow_()
    : sheet.getRange(rowNumber, 1, 1, APP.HEADERS.length).getValues()[0];

  setIfPresent_(row, "管理ID", record.managementId, true);
  setIfPresent_(row, "顧客区分", record.customerType, true);
  setIfPresent_(row, "氏名", record.name, true);
  setIfPresent_(row, "フリガナ", record.kana);
  setIfPresent_(row, "会社名", record.company);
  setIfPresent_(row, "メール", record.email);
  setIfPresent_(row, "電話", record.phone);
  setIfPresent_(row, "免許区分", record.licenseType);
  setIfPresent_(row, "免許番号", record.licenseNumber);
  setIfPresent_(row, "免許交付日", record.licenseIssueDate);
  setIfPresent_(row, "免許有効期限", record.licenseExpiryDate);
  setIfPresent_(row, "免許確認日", record.licenseCheckedDate);
  setIfPresent_(row, "免許確認結果", record.licenseCheckResult);
  setIfPresent_(row, "更新講習日", record.renewalCourseDate);
  setIfPresent_(row, "更新証明発行日", record.certificateIssueDate);
  setIfPresent_(row, "ステータス", record.status, created || record.sourceStatusProvided);
  setIfPresent_(row, "次回対応日", record.nextActionDate);
  setIfPresent_(row, "最終連絡日", record.lastContactDate);
  setIfPresent_(row, "担当者", record.owner);
  setIfPresent_(row, "内部アラート宛先", record.alertEmail);
  setIfPresent_(row, "メモ", record.memo);
  if (!getRowValue_(row, "作成日")) setRowValue_(row, "作成日", now);
  setRowValue_(row, "更新日", now);
  setIfPresent_(row, "更新講習申込日", record.courseApplicationDate);
  setIfPresent_(row, "更新講習受講日", record.courseAttendedDate || record.renewalCourseDate);
  setIfPresent_(row, "更新講習修了日", record.courseCompletionDate || record.certificateIssueDate);
  setIfPresent_(row, "修了証明書番号", record.certificateNumber);
  setIfPresent_(row, "修了証明書有効期限", record.certificateExpiryDate);
  setIfPresent_(row, "DIPS申請日", record.dipsApplicationDate);
  setIfPresent_(row, "更新完了確認日", record.renewalCompletedDate);
  setIfPresent_(row, "新しい技能証明有効期限", record.newLicenseExpiryDate);
  setIfPresent_(row, "更新申請フォロー期限", record.followDeadline);
  setIfPresent_(row, "身体適性確認日", record.medicalCheckDate);
  setIfPresent_(row, "身体適性確認結果", record.medicalCheckResult);
  applyDerivedDatesToRow_(row, settings);

  if (created) {
    sheet.appendRow(row);
    rowNumber = sheet.getLastRow();
  } else {
    sheet.getRange(rowNumber, 1, 1, APP.HEADERS.length).setValues([row]);
  }
  return { created: created, rowNumber: rowNumber };
}

function findImportedTargetRow_(sheet, record) {
  var rowNumber = findRowById_(sheet, record.managementId);
  if (rowNumber >= 2) return rowNumber;
  if (record.licenseNumber) {
    rowNumber = findRowByColumnValue_(sheet, "免許番号", record.licenseNumber);
    if (rowNumber >= 2) return rowNumber;
  }
  if (record.name && record.licenseExpiryDate) {
    return findRowByNameAndExpiry_(sheet, record.name, record.licenseExpiryDate);
  }
  if (record.name) {
    rowNumber = findRowByColumnValue_(sheet, "氏名", record.name);
    if (rowNumber >= 2) return rowNumber;
  }
  return -1;
}

function findRowByColumnValue_(sheet, header, value) {
  if (!value || sheet.getLastRow() < 2) return -1;
  var values = sheet.getRange(2, COL[header] + 1, sheet.getLastRow() - 1, 1).getValues();
  var needle = normalize_(value);
  for (var i = 0; i < values.length; i++) {
    if (normalize_(values[i][0]) === needle) return i + 2;
  }
  return -1;
}

function findRowByNameAndExpiry_(sheet, name, expiry) {
  if (!name || !expiry || sheet.getLastRow() < 2) return -1;
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, APP.HEADERS.length).getValues();
  var targetName = normalize_(name);
  var targetExpiry = formatDate_(expiry);
  for (var i = 0; i < values.length; i++) {
    var rowName = normalize_(values[i][COL["氏名"]]);
    var rowExpiry = formatDate_(values[i][COL["免許有効期限"]]);
    if (rowName === targetName && rowExpiry === targetExpiry) return i + 2;
  }
  return -1;
}

function readLicenseRows_(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, APP.HEADERS.length).getValues().map(rowToObject_).filter(function(row) {
    return normalize_(row["管理ID"]) || normalize_(row["氏名"]) || normalize_(row["免許番号"]);
  });
}

function rowToObject_(row) {
  var obj = {};
  APP.HEADERS.forEach(function(header, idx) {
    obj[header] = row[idx];
  });
  return obj;
}

function applyDerivedDatesToRow_(row, settings) {
  settings = settings || {};
  var status = normalizeStatus_(getRowValue_(row, "ステータス"));
  var currentExpiry = parseDate_(getRowValue_(row, "免許有効期限"));
  var newExpiry = parseDate_(getRowValue_(row, "新しい技能証明有効期限"));
  var baseExpiry = status === "更新完了" && newExpiry ? newExpiry : currentExpiry;
  var completionDate = parseDate_(getRowValue_(row, "更新講習修了日")) || parseDate_(getRowValue_(row, "更新証明発行日"));
  var storedCertificateExpiry = parseDate_(getRowValue_(row, "修了証明書有効期限"));
  var storedFollowDeadline = parseDate_(getRowValue_(row, "更新申請フォロー期限"));
  var certificateExpiry = completionDate
    ? addDays_(addMonths_(completionDate, Number(settings.certificateValidMonths || 3)), -1)
    : storedCertificateExpiry;
  var applicationStart = baseExpiry ? addMonths_(baseExpiry, -Number(settings.cdpStartMonths || 6)) : null;
  var applicationDeadline = baseExpiry ? addMonths_(baseExpiry, -Number(settings.procedureStopMonths || 1)) : null;
  var followDeadline = certificateExpiry && applicationDeadline ? minDate_(certificateExpiry, applicationDeadline) : storedFollowDeadline;

  setRowValue_(row, "修了証明書有効期限", certificateExpiry || "");
  setRowValue_(row, "更新申請開始可能日", applicationStart || "");
  setRowValue_(row, "更新申請期限", applicationDeadline || "");
  setRowValue_(row, "更新申請フォロー期限", followDeadline || "");
}

function buildViewRecord_(row, settings, today) {
  var expiry = parseDate_(row["免許有効期限"]);
  var issueDate = parseDate_(row["免許交付日"]);
  var status = normalizeStatus_(row["ステータス"]) || "免許証確認待ち";
  var expiryEstimated = false;
  if (!expiry && issueDate) {
    expiry = addYears_(issueDate, 3);
    expiryEstimated = true;
  }

  var newExpiry = parseDate_(row["新しい技能証明有効期限"]);
  var renewalCompletedDate = parseDate_(row["更新完了確認日"]);
  var effectiveExpiry = status === "更新完了" && newExpiry ? newExpiry : expiry;
  var windowExpiry = effectiveExpiry || expiry;
  var courseApplicationDate = parseDate_(row["更新講習申込日"]);
  var courseAttendedDate = parseDate_(row["更新講習受講日"]) || parseDate_(row["更新講習日"]);
  var courseCompletionDate = parseDate_(row["更新講習修了日"]) || parseDate_(row["更新証明発行日"]);
  var certificateIssue = courseCompletionDate;
  var storedCertificateExpiry = parseDate_(row["修了証明書有効期限"]);
  var certificateExpiry = storedCertificateExpiry || (certificateIssue ? addDays_(addMonths_(certificateIssue, settings.certificateValidMonths), -1) : null);
  var applicationStartDate = windowExpiry ? addMonths_(windowExpiry, -settings.cdpStartMonths) : null;
  var applicationDeadline = windowExpiry ? addMonths_(windowExpiry, -settings.procedureStopMonths) : null;
  var followDeadline = parseDate_(row["更新申請フォロー期限"]) || (certificateExpiry && applicationDeadline ? minDate_(certificateExpiry, applicationDeadline) : null);
  var dipsApplicationDate = parseDate_(row["DIPS申請日"]);
  var dipsFollowDue = dipsApplicationDate ? addDays_(dipsApplicationDate, settings.dipsFollowDays) : null;
  var courseEligibleDate = windowExpiry ? addMonths_(windowExpiry, -settings.courseEligibleMonths) : null;
  var cdpStartDate = applicationStartDate;
  var procedureStopDate = applicationDeadline;
  var daysToExpiry = effectiveExpiry ? daysBetween_(today, effectiveExpiry) : null;
  var daysToCurrentExpiry = expiry ? daysBetween_(today, expiry) : null;
  var certDays = certificateExpiry ? daysBetween_(today, certificateExpiry) : null;
  var licenseCheckDate = parseDate_(row["免許確認日"]);
  var licenseCheckResult = normalize_(row["免許確認結果"]) || inferLicenseCheckResult_(expiry, licenseCheckDate, today);
  var riskInfo = evaluateRisk_({
    today: today,
    expiry: effectiveExpiry,
    currentExpiry: expiry,
    newExpiry: newExpiry,
    daysToExpiry: daysToExpiry,
    daysToCurrentExpiry: daysToCurrentExpiry,
    licenseCheckDate: licenseCheckDate,
    licenseCheckResult: licenseCheckResult,
    courseEligibleDate: courseEligibleDate,
    cdpStartDate: cdpStartDate,
    procedureStopDate: procedureStopDate,
    applicationDeadline: applicationDeadline,
    courseAttendedDate: courseAttendedDate,
    courseCompletionDate: courseCompletionDate,
    certificateExpiry: certificateExpiry,
    certDays: certDays,
    followDeadline: followDeadline,
    dipsApplicationDate: dipsApplicationDate,
    dipsFollowDue: dipsFollowDue,
    renewalCompletedDate: renewalCompletedDate,
    status: status
  });
  var storedNextActionDate = parseDate_(row["次回対応日"]);
  var computedNextActionDate = storedNextActionDate || riskInfo.nextActionDate || null;

  return {
    managementId: normalize_(row["管理ID"]),
    customerType: normalize_(row["顧客区分"]) || "既存",
    name: normalize_(row["氏名"]),
    kana: normalize_(row["フリガナ"]),
    company: normalize_(row["会社名"]),
    email: normalize_(row["メール"]),
    phone: normalize_(row["電話"]),
    licenseType: normalize_(row["免許区分"]),
    licenseNumber: normalize_(row["免許番号"]),
    licenseIssueDate: formatDate_(issueDate),
    licenseExpiryDate: formatDate_(effectiveExpiry),
    currentLicenseExpiryDate: formatDate_(expiry),
    effectiveLicenseExpiryDate: formatDate_(effectiveExpiry),
    newLicenseExpiryDate: formatDate_(newExpiry),
    expiryEstimated: expiryEstimated,
    licenseCheckedDate: formatDate_(licenseCheckDate),
    licenseCheckResult: licenseCheckResult,
    courseEligibleDate: formatDate_(courseEligibleDate),
    cdpStartDate: formatDate_(cdpStartDate),
    applicationStartDate: formatDate_(applicationStartDate),
    procedureStopDate: formatDate_(procedureStopDate),
    applicationDeadlineDate: formatDate_(applicationDeadline),
    renewalCourseDate: formatDate_(courseAttendedDate),
    courseApplicationDate: formatDate_(courseApplicationDate),
    courseAttendedDate: formatDate_(courseAttendedDate),
    courseCompletionDate: formatDate_(courseCompletionDate),
    certificateIssueDate: formatDate_(certificateIssue),
    certificateNumber: normalize_(row["修了証明書番号"]),
    certificateExpiryDate: formatDate_(certificateExpiry),
    followDeadlineDate: formatDate_(followDeadline),
    dipsApplicationDate: formatDate_(dipsApplicationDate),
    dipsFollowDueDate: formatDate_(dipsFollowDue),
    renewalCompletedDate: formatDate_(renewalCompletedDate),
    medicalCheckDate: formatDate_(row["身体適性確認日"]),
    medicalCheckResult: normalize_(row["身体適性確認結果"]),
    daysToExpiry: daysToExpiry,
    daysToCurrentExpiry: daysToCurrentExpiry,
    certificateDaysLeft: certDays,
    status: status,
    risk: riskInfo.risk,
    phase: riskInfo.phase,
    alertReason: riskInfo.reason,
    recommendedAction: riskInfo.action,
    taskName: riskInfo.taskName || "",
    nextActionDate: formatDate_(computedNextActionDate),
    lastContactDate: formatDate_(row["最終連絡日"]),
    owner: normalize_(row["担当者"]),
    alertEmail: normalize_(row["内部アラート宛先"]),
    memo: normalize_(row["メモ"]),
    createdAt: formatDateTimeOrBlank_(row["作成日"]),
    updatedAt: formatDateTimeOrBlank_(row["更新日"])
  };
}

function evaluateRisk_(ctx) {
  var status = ctx.status || "";
  if (status === "対象外") return { risk: "P5", phase: "対象外", reason: "管理対象外", action: "定期確認のみ" };
  var sourcePhase = sourcePhaseFromStatus_(status);
  if (sourcePhase) return sourcePhase;
  if (status === "更新完了") {
    if (!ctx.newExpiry || !ctx.renewalCompletedDate) {
      return {
        risk: "P1",
        phase: "新有効期限確認タスク",
        reason: "更新完了になっていますが、DIPSまたは新しい技能証明書の新有効期限・更新完了確認日が未入力です。",
        action: "更新後の技能証明書に記載された新しい有効期限へ差し替えてください。",
        taskName: "次回更新期限差し替え"
      };
    }
    if (ctx.daysToExpiry != null && ctx.daysToExpiry < 0) {
      return { risk: "P1", phase: "新有効期限超過", reason: "新しい技能証明有効期限を過ぎています", action: "DIPSで現在の有効期限を再確認", taskName: "新有効期限再確認" };
    }
    if (ctx.daysToExpiry != null && ctx.daysToExpiry <= 90) {
      return { risk: "P2", phase: "次回更新3か月以内", reason: "更新後の新しい技能証明有効期限が3か月以内です", action: "次回更新案内を開始", taskName: "次回更新案内" };
    }
    if (ctx.today >= ctx.cdpStartDate) {
      return { risk: "P2", phase: "次回CDP講習・申請受付中", reason: "更新後の新有効期限を基準に6か月前へ入りました", action: "次回更新の案内・申込状況を確認", taskName: "次回更新案内" };
    }
    if (ctx.today >= ctx.courseEligibleDate) {
      return { risk: "P3", phase: "次回更新講習受講可能", reason: "更新後の新有効期限を基準に9か月前へ入りました", action: "次回講習の希望時期を確認", taskName: "次回講習案内" };
    }
    return { risk: "P5", phase: "更新完了", reason: "DIPSまたは新しい技能証明書で新有効期限を確認済み", action: "次回更新時期まで定期確認", taskName: "定期確認" };
  }
  if (!ctx.currentExpiry) {
    return { risk: "P1", phase: "免許証確認待ち", reason: "ドローン免許証の有効期限が未登録", action: "免許証を確認し、有効期限内か記録" };
  }
  if (ctx.daysToCurrentExpiry < 0) {
    return { risk: "P1", phase: "期限超過・未確認", reason: "現在の技能証明有効期限を過ぎていますが、更新完了が確認できていません。", action: "DIPSまたは新しい技能証明書で更新完了の有無を至急確認", taskName: "更新未完了疑い" };
  }
  if (!ctx.licenseCheckDate || ctx.licenseCheckResult !== "有効") {
    return { risk: "P1", phase: "免許証確認待ち", reason: "免許証の現物確認または有効判定が未完了", action: "免許証を確認し、有効期限内なら確認日を記録" };
  }
  if ((status === "講習修了" || status === "更新申請待ち") && !ctx.courseCompletionDate) {
    return { risk: "P1", phase: "講習修了日未確認", reason: "講習修了ステータスですが、更新講習修了日が未入力です。", action: "修了証明書の発行日を確認し、修了証明書有効期限を確定", taskName: "修了証明書確認" };
  }
  if ((status === "講習修了" || status === "更新申請待ち") && ctx.followDeadline) {
    var followDays = daysBetween_(ctx.today, ctx.followDeadline);
    if (followDays < 0) {
      return { risk: "P1", phase: "更新未完了疑い", reason: "更新申請フォロー期限を過ぎても新しい有効期限が未入力です。", action: "DIPSで更新申請が完了しているか確認してください。", taskName: "DIPS更新申請確認", nextActionDate: ctx.followDeadline };
    }
    if (followDays <= 30) {
      return { risk: "P2", phase: "更新申請フォロー期限注意", reason: "更新申請期限または修了証明書の有効期限が30日以内です。", action: "DIPSで更新申請が完了しているか確認してください。", taskName: "DIPS更新申請確認", nextActionDate: ctx.followDeadline };
    }
  }
  if (status === "DIPS申請中" || status === "更新完了未確認") {
    if (!ctx.dipsApplicationDate) {
      return { risk: "P2", phase: "DIPS申請日未確認", reason: "DIPS申請中ですが、申請日が未入力です。", action: "DIPS申請日を確認し、新有効期限確認タスクの期限を確定", taskName: "新有効期限確認" };
    }
    if (ctx.applicationDeadline && daysBetween_(ctx.today, ctx.applicationDeadline) < 0) {
      return { risk: "P1", phase: "更新未完了疑い", reason: "更新申請期限を過ぎていますが、新有効期限が未確認です。", action: "DIPSや新しい技能証明書で更新完了を確認", taskName: "新有効期限確認", nextActionDate: ctx.applicationDeadline };
    }
    if (ctx.dipsFollowDue) {
      var dipsDays = daysBetween_(ctx.today, ctx.dipsFollowDue);
      if (dipsDays < 0) {
        return { risk: "P1", phase: "新有効期限未確認", reason: "DIPS申請から確認期限を過ぎていますが、新しい技能証明有効期限が未入力です。", action: "DIPS申請状況または新しい技能証明書を確認", taskName: "新有効期限確認", nextActionDate: ctx.dipsFollowDue };
      }
      if (dipsDays <= 7) {
        return { risk: "P2", phase: "更新完了未確認", reason: "DIPS申請後の新有効期限確認期限が近づいています。", action: "DIPS申請状況を確認", taskName: "新有効期限確認", nextActionDate: ctx.dipsFollowDue };
      }
    }
    return { risk: "P2", phase: "更新完了未確認", reason: "DIPS申請中ですが、新しい技能証明有効期限は未確認です。", action: "DIPSまたは新証明書で新有効期限を確認", taskName: "新有効期限確認", nextActionDate: ctx.dipsFollowDue };
  }
  if (ctx.certificateExpiry && ctx.certDays < 0) {
    return { risk: "P1", phase: "修了証明書期限切れ", reason: "更新講習修了証明書の有効期限を過ぎています。", action: "再講習リスクを確認し、DIPS申請可否を判断", taskName: "更新未完了疑い", nextActionDate: ctx.certificateExpiry };
  }
  if (ctx.followDeadline) {
    var generalFollowDays = daysBetween_(ctx.today, ctx.followDeadline);
    if (generalFollowDays < 0) {
      return { risk: "P1", phase: "更新未完了疑い", reason: "更新申請フォロー期限を過ぎても更新完了が確認できていません。", action: "DIPSで更新申請・更新完了状況を確認", taskName: "DIPS更新申請確認", nextActionDate: ctx.followDeadline };
    }
    if (generalFollowDays <= 30) {
      return { risk: "P2", phase: "期限注意", reason: "更新申請期限または修了証明書の有効期限が30日以内です。", action: "DIPS更新申請の完了状況を確認", taskName: "DIPS更新申請確認", nextActionDate: ctx.followDeadline };
    }
  }
  if (ctx.certificateExpiry && ctx.certDays <= 30) {
    return { risk: "P2", phase: "修了証明書期限注意", reason: "更新講習修了証明書の有効期限が30日以内です。", action: "DIPS申請完了まで進める", taskName: "DIPS更新申請確認", nextActionDate: ctx.certificateExpiry };
  }
  if (ctx.applicationDeadline && ctx.today >= ctx.applicationDeadline) {
    return { risk: "P1", phase: "更新申請期限", reason: "有効期限1か月前に入っています。", action: "手続き可能か至急確認し、電話対応", taskName: "DIPS更新申請確認", nextActionDate: ctx.applicationDeadline };
  }
  if (ctx.applicationDeadline && daysBetween_(ctx.today, ctx.applicationDeadline) <= 30) {
    return { risk: "P2", phase: "更新申請期限注意", reason: "更新申請期限が30日以内です。", action: "申込・講習修了・DIPS申請状況を確認", taskName: "DIPS更新申請確認", nextActionDate: ctx.applicationDeadline };
  }
  if (ctx.daysToCurrentExpiry <= 90) {
    return { risk: "P2", phase: "3か月以内", reason: "現在の技能証明有効期限が3か月以内", action: "講習日・DIPS申請状況を毎週確認", taskName: "更新状況確認" };
  }
  if (ctx.today >= ctx.cdpStartDate) {
    return { risk: "P2", phase: "CDP講習・申請受付中", reason: "6か月前に入り更新申請可能期間です", action: "案内送付、申込、講習日程、DIPS申請準備を確認", taskName: "更新講習案内" };
  }
  if (ctx.today >= ctx.courseEligibleDate) {
    return { risk: "P3", phase: "更新講習受講可能", reason: "9か月前に入り講習受講可能", action: "早期案内、希望時期確認", taskName: "更新講習案内" };
  }
  return { risk: "P5", phase: "期限余裕あり", reason: "まだ9か月前ではありません", action: "定期確認", taskName: "定期確認" };
}

function sourcePhaseFromStatus_(status) {
  var text = normalize_(status);
  var map = {
    "期限超過・未確認": { risk: "P1", phase: "期限超過・未確認", reason: "更新完了が確認できていません。", action: "DIPSまたは新しい技能証明書で更新完了の有無を至急確認" },
    "期限切れ": { risk: "P1", phase: "期限超過・未確認", reason: "読み取り元の状態が期限切れ", action: "DIPSまたは新しい技能証明書で更新完了の有無を至急確認" },
    "手続き不可ライン": { risk: "P1", phase: "更新申請期限", reason: "読み取り元の状態が手続き不可ライン", action: "手続き可能か至急確認し、電話対応" },
    "更新証明期限注意": { risk: "P2", phase: "修了証明書期限注意", reason: "読み取り元の状態が更新証明期限注意", action: "DIPS申請完了まで進める" },
    "3か月以内": { risk: "P2", phase: "3か月以内", reason: "読み取り元の状態が3か月以内", action: "講習日・DIPS申請状況を毎週確認" },
    "CDP講習・申請受付中": { risk: "P2", phase: "CDP講習・申請受付中", reason: "読み取り元の状態がCDP講習・申請受付中", action: "案内送付、申込、講習日程、DIPS申請準備を確認" },
    "更新講習受講可能": { risk: "P3", phase: "更新講習受講可能", reason: "読み取り元の状態が更新講習受講可能", action: "早期案内、希望時期確認" }
  };
  return map[text] || null;
}

function inferLicenseCheckResult_(expiry, checkedDate, today) {
  if (!expiry) return "未確認";
  if (daysBetween_(today, expiry) < 0) return "期限切れ";
  if (!checkedDate) return "未確認";
  return "有効";
}

function summarizeRecords_(records) {
  var summary = {
    total: records.length,
    p1: 0,
    p2: 0,
    p3: 0,
    p5: 0,
    existing: 0,
    externalNew: 0
  };
  records.forEach(function(r) {
    if (r.risk === "P1") summary.p1++;
    else if (r.risk === "P2") summary.p2++;
    else if (r.risk === "P3") summary.p3++;
    else summary.p5++;
    if (r.customerType === "既存") summary.existing++;
    if (r.customerType.indexOf("他講習機関") >= 0) summary.externalNew++;
  });
  return summary;
}

function sortRecords_(a, b) {
  var order = { P1: 1, P2: 2, P3: 3, P5: 5 };
  var diff = (order[a.risk] || 9) - (order[b.risk] || 9);
  if (diff !== 0) return diff;
  var ad = a.daysToExpiry == null ? 99999 : a.daysToExpiry;
  var bd = b.daysToExpiry == null ? 99999 : b.daysToExpiry;
  if (ad !== bd) return ad - bd;
  return a.name.localeCompare(b.name, "ja");
}

function buildAlertMailBody_(record, extraMessage) {
  return [
    "免許更新の対応が必要です。",
    "",
    "氏名: " + record.name,
    "顧客区分: " + record.customerType,
    "免許区分: " + record.licenseType,
    "免許番号: " + record.licenseNumber,
    "現在の技能証明有効期限: " + (record.currentLicenseExpiryDate || record.licenseExpiryDate || "未確認"),
    "新しい技能証明有効期限: " + (record.newLicenseExpiryDate || "未確認"),
    "免許確認: " + record.licenseCheckResult + " / " + (record.licenseCheckedDate || "未確認"),
    "状態: " + record.phase,
    "リスク: " + record.risk,
    "タスク: " + (record.taskName || "-"),
    "理由: " + record.alertReason,
    "推奨対応: " + record.recommendedAction,
    "更新講習受講可: " + (record.courseEligibleDate || "-"),
    "更新申請開始可能日: " + (record.applicationStartDate || "-"),
    "更新申請期限: " + (record.applicationDeadlineDate || record.procedureStopDate || "-"),
    "更新講習申込日: " + (record.courseApplicationDate || "-"),
    "更新講習受講日: " + (record.courseAttendedDate || "-"),
    "更新講習修了日: " + (record.courseCompletionDate || "-"),
    "修了証明書番号: " + (record.certificateNumber || "-"),
    "修了証明書有効期限: " + (record.certificateExpiryDate || "-"),
    "更新申請フォロー期限: " + (record.followDeadlineDate || "-"),
    "DIPS申請日: " + (record.dipsApplicationDate || "-"),
    "更新完了確認日: " + (record.renewalCompletedDate || "-"),
    "身体適性確認: " + (record.medicalCheckResult || "-") + " / " + (record.medicalCheckDate || "-"),
    "連絡先: " + (record.email || record.phone || "-"),
    "メモ: " + (record.memo || "-"),
    "",
    extraMessage ? "追加メッセージ:\n" + extraMessage + "\n" : "",
    "この通知は独立した免許更新管理アプリから送信されています。"
  ].filter(function(line) { return line !== ""; }).join("\n");
}

function appendAlertLog_(ss, log) {
  var sheet = ss.getSheetByName(APP.SHEET_LOG);
  ensureHeaders_(sheet, ["送信日時", "送信先", "管理ID", "氏名", "リスク", "状態", "件名"]);
  sheet.appendRow([log.sentAt, log.to, log.managementId, log.name, log.risk, log.phase, log.subject]);
}

function extractSpreadsheetId_(value) {
  var text = normalize_(value);
  if (!text) return "";
  var m = text.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (m) return m[1];
  if (/^[a-zA-Z0-9-_]{20,}$/.test(text)) return text;
  return "";
}

function extractDocumentId_(value) {
  var text = normalize_(value);
  if (!text) return "";
  var m = text.match(/\/document\/d\/([a-zA-Z0-9-_]+)/);
  if (m) return m[1];
  if (/^[a-zA-Z0-9-_]{20,}$/.test(text)) return text;
  return "";
}

function extractGid_(value) {
  var text = normalize_(value);
  if (!text) return null;
  var m = text.match(/[?&#]gid=(\d+)/);
  return m ? Number(m[1]) : null;
}

function getSheetByGid_(ss, gid) {
  if (gid == null || isNaN(Number(gid))) return null;
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getSheetId && sheets[i].getSheetId() === Number(gid)) return sheets[i];
  }
  return null;
}

function normalizeHeader_(value) {
  return normalize_(value)
    .replace(/[ 　\t\r\n]/g, "")
    .replace(/[（）()［］\[\]【】]/g, "")
    .toLowerCase();
}

function blankRow_() {
  return APP.HEADERS.map(function() { return ""; });
}

function setRowValue_(row, header, value) {
  row[COL[header]] = value == null ? "" : value;
}

function setIfPresent_(row, header, value, force) {
  var hasValue = value instanceof Date || normalize_(value) !== "";
  if (force || hasValue) setRowValue_(row, header, value);
}

function getRowValue_(row, header) {
  return row[COL[header]];
}

function findRowById_(sheet, id) {
  if (!id || sheet.getLastRow() < 2) return -1;
  var values = sheet.getRange(2, COL["管理ID"] + 1, sheet.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < values.length; i++) {
    if (normalize_(values[i][0]) === id) return i + 2;
  }
  return -1;
}

function createManagementId_() {
  return "REN-" + Utilities.formatDate(new Date(), APP.TIMEZONE, "yyyyMMdd-HHmmss") + "-" + Math.floor(Math.random() * 900 + 100);
}

function parseDateOrBlank_(value) {
  return parseDate_(value) || "";
}

function parseDate_(value) {
  if (value && typeof value.getTime === "function" && !isNaN(value.getTime())) return stripTime_(value);
  var text = normalize_(value);
  if (!text) return null;
  text = text.replace(/[年月.-]/g, "/").replace(/日/g, "").replace(/\s+/g, "");
  var m = text.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (!m) return null;
  var date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (isNaN(date.getTime())) return null;
  return stripTime_(date);
}

function parseDateFromText_(value) {
  var text = normalize_(value);
  if (!text) return null;
  var m = text.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (m) return stripTime_(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return parseDate_(text);
}

function parseOperationCourseDate_(value, expiry) {
  var full = parseDateFromText_(value);
  if (full) return full;
  var text = normalize_(value);
  if (!text) return null;
  var m = text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (!m || !expiry) return null;
  var month = Number(m[1]);
  var day = Number(m[2]);
  var year = expiry.getFullYear();
  if (month > expiry.getMonth() + 1) year--;
  return stripTime_(new Date(year, month - 1, day));
}

function extractParenthesizedText_(value) {
  var text = normalize_(value);
  var m = text.match(/[（(]([^）)]+)[）)]/);
  return m ? normalize_(m[1]) : "";
}

function toBoolean_(value) {
  if (value === true) return true;
  var text = normalize_(value).toLowerCase();
  return text === "true" || text === "yes" || text === "1" || text === "済" || text === "送付済";
}

function stripTime_(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addMonths_(date, months) {
  if (!date) return null;
  return new Date(date.getFullYear(), date.getMonth() + months, date.getDate());
}

function addDays_(date, days) {
  if (!date) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function addYears_(date, years) {
  if (!date) return null;
  return new Date(date.getFullYear() + years, date.getMonth(), date.getDate());
}

function minDate_(a, b) {
  if (!a) return b || null;
  if (!b) return a || null;
  return a.getTime() <= b.getTime() ? a : b;
}

function daysBetween_(from, to) {
  return Math.floor((stripTime_(to).getTime() - stripTime_(from).getTime()) / 86400000);
}

function formatDate_(date) {
  if (!date) return "";
  var d = parseDate_(date);
  return d ? Utilities.formatDate(d, APP.TIMEZONE, "yyyy/MM/dd") : "";
}

function formatDateTime_(date) {
  return Utilities.formatDate(date, APP.TIMEZONE, "yyyy/MM/dd HH:mm");
}

function formatDateTimeOrBlank_(value) {
  if (!value) return "";
  if (value instanceof Date && !isNaN(value.getTime())) return formatDateTime_(value);
  return normalize_(value);
}

function normalize_(value) {
  return String(value == null ? "" : value).trim();
}

function normalizeStatus_(value) {
  var text = normalize_(value);
  var map = {
    "申込済": "申込済み",
    "講習申込受付": "申込済み",
    "講習済": "講習修了",
    "講習済・申請待ち": "講習修了",
    "申請待ち": "更新申請待ち",
    "DIPS申請済": "DIPS申請中",
    "申請完了": "DIPS申請中",
    "更新完了確認待ち": "更新完了未確認"
  };
  return map[text] || text;
}
