// @ts-nocheck
// CDP renewal license standalone app.
// This project intentionally does not read or deploy the existing CDP web app.

var APP = {
  SPREADSHEET_PROP: "RENEWAL_LICENSE_SPREADSHEET_ID",
  READ_SOURCE_URL_PROP: "READ_ONLY_SOURCE_SPREADSHEET_URL",
  READ_SOURCE_URL: "https://docs.google.com/spreadsheets/d/1GFMynPtdX1qHCC-GP0rI7XqfWBh_lbC5J_SV91NkN30/edit?gid=307646994#gid=307646994",
  READ_SOURCE_SPREADSHEET_ID: "1GFMynPtdX1qHCC-GP0rI7XqfWBh_lbC5J_SV91NkN30",
  READ_SOURCE_GID: 307646994,
  SHEET_MAIN: "免許更新管理",
  SHEET_SETTINGS: "設定",
  SHEET_LOG: "アラート送信履歴",
  DEFAULT_TITLE: "CDP免許更新管理",
  TIMEZONE: "Asia/Tokyo",
  STATUSES: [
    "免許証確認待ち",
    "案内前",
    "期限切れ",
    "手続き不可ライン",
    "更新証明期限注意",
    "3か月以内",
    "CDP講習・申請受付中",
    "更新講習受講可能",
    "案内済",
    "講習申込受付",
    "日程調整中",
    "講習予定",
    "講習済・申請待ち",
    "申請完了",
    "更新完了",
    "対象外"
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
    "更新日"
  ],
  SETTINGS: [
    ["内部アラート宛先", "", "複数ある場合はカンマ区切り。危険対象の通知先。"],
    ["日次アラート時刻", "9", "0-23時。installDailyAlertTriggerで使います。"],
    ["更新講習受講可（月前）", "9", "免許有効期限の9か月前から受講可能。"],
    ["CDP講習・申請受付（月前）", "6", "CDPでは6か月前から講習・申請対応。"],
    ["手続き停止ライン（月前）", "1", "免許有効期限の1か月前から手続き不可扱い。"],
    ["更新証明有効（月）", "3", "更新講習修了証明の期限を3か月で管理。"],
    ["日次通知対象", "P1,P2", "日次メールに含めるリスク。例: P1,P2,P3"],
    ["読み取り元スプレッドシートURL", "https://docs.google.com/spreadsheets/d/1GFMynPtdX1qHCC-GP0rI7XqfWBh_lbC5J_SV91NkN30/edit?gid=307646994#gid=307646994", "読み取り専用。ここには絶対に書き込みません。"]
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
    var result = upsertImportedRecord_(targetSheet, record, now);
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

function apiSaveRecord(record) {
  record = record || {};
  var ss = getSpreadsheet_();
  ensureWorkbook_(ss);
  var sheet = ss.getSheetByName(APP.SHEET_MAIN);
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
  setRowValue_(current, "更新講習日", parseDateOrBlank_(record.renewalCourseDate));
  setRowValue_(current, "更新証明発行日", parseDateOrBlank_(record.certificateIssueDate));
  setRowValue_(current, "ステータス", normalize_(record.status) || "免許証確認待ち");
  setRowValue_(current, "次回対応日", parseDateOrBlank_(record.nextActionDate));
  setRowValue_(current, "最終連絡日", parseDateOrBlank_(record.lastContactDate));
  setRowValue_(current, "担当者", normalize_(record.owner));
  setRowValue_(current, "内部アラート宛先", normalize_(record.alertEmail));
  setRowValue_(current, "メモ", normalize_(record.memo));
  if (!getRowValue_(current, "作成日")) setRowValue_(current, "作成日", now);
  setRowValue_(current, "更新日", now);

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
    "- CDP講習・申請受付は6か月前から",
    "- 更新証明は発行から3か月で期限管理",
    "- 有効期限1か月前から手続き不可ライン",
    "",
    "対象:"
  ];
  targets.forEach(function(record) {
    lines.push(
      record.risk + " | " + record.name + " | " + record.customerType +
      " | 免許期限 " + (record.licenseExpiryDate || "未確認") +
      " | " + record.phase +
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
    applyValidation_(sheet, "顧客区分", APP.CUSTOMER_TYPES);
    applyValidation_(sheet, "ステータス", APP.STATUSES);
    applyValidation_(sheet, "免許確認結果", ["未確認", "有効", "期限切れ", "不備あり"]);
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
    dailyRisks: (map["日次通知対象"] || "P1,P2").split(",").map(function(s) { return normalize_(s); }).filter(Boolean),
    sourceUrl: map["読み取り元スプレッドシートURL"] || APP.READ_SOURCE_URL
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
    certificateIssueDate: ["更新証明発行日", "証明発行日", "修了証明発行日", "更新証明日"],
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
  var status = rawStatus;
  var checkResult = normalize_(read("licenseCheckResult"));
  if (!checkResult && expiry && daysBetween_(stripTime_(new Date()), expiry) < 0) checkResult = "期限切れ";
  if (!status) status = "免許証確認待ち";

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
    renewalCourseDate: parseDateOrBlank_(read("renewalCourseDate")),
    certificateIssueDate: parseDateOrBlank_(read("certificateIssueDate")),
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

function upsertImportedRecord_(sheet, record, now) {
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

function buildViewRecord_(row, settings, today) {
  var expiry = parseDate_(row["免許有効期限"]);
  var issueDate = parseDate_(row["免許交付日"]);
  var expiryEstimated = false;
  if (!expiry && issueDate) {
    expiry = addYears_(issueDate, 3);
    expiryEstimated = true;
  }

  var courseDate = parseDate_(row["更新講習日"]);
  var certificateIssue = parseDate_(row["更新証明発行日"]) || courseDate;
  var certificateExpiry = certificateIssue ? addMonths_(certificateIssue, settings.certificateValidMonths) : null;
  var courseEligibleDate = expiry ? addMonths_(expiry, -settings.courseEligibleMonths) : null;
  var cdpStartDate = expiry ? addMonths_(expiry, -settings.cdpStartMonths) : null;
  var procedureStopDate = expiry ? addMonths_(expiry, -settings.procedureStopMonths) : null;
  var daysToExpiry = expiry ? daysBetween_(today, expiry) : null;
  var certDays = certificateExpiry ? daysBetween_(today, certificateExpiry) : null;
  var status = normalize_(row["ステータス"]) || "免許証確認待ち";
  var licenseCheckDate = parseDate_(row["免許確認日"]);
  var licenseCheckResult = normalize_(row["免許確認結果"]) || inferLicenseCheckResult_(expiry, licenseCheckDate, today);
  var riskInfo = evaluateRisk_({
    today: today,
    expiry: expiry,
    daysToExpiry: daysToExpiry,
    licenseCheckDate: licenseCheckDate,
    licenseCheckResult: licenseCheckResult,
    courseEligibleDate: courseEligibleDate,
    cdpStartDate: cdpStartDate,
    procedureStopDate: procedureStopDate,
    certificateExpiry: certificateExpiry,
    certDays: certDays,
    status: status
  });

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
    licenseExpiryDate: formatDate_(expiry),
    expiryEstimated: expiryEstimated,
    licenseCheckedDate: formatDate_(licenseCheckDate),
    licenseCheckResult: licenseCheckResult,
    courseEligibleDate: formatDate_(courseEligibleDate),
    cdpStartDate: formatDate_(cdpStartDate),
    applicationStartDate: formatDate_(cdpStartDate),
    procedureStopDate: formatDate_(procedureStopDate),
    renewalCourseDate: formatDate_(courseDate),
    certificateIssueDate: formatDate_(certificateIssue),
    certificateExpiryDate: formatDate_(certificateExpiry),
    daysToExpiry: daysToExpiry,
    certificateDaysLeft: certDays,
    status: status,
    risk: riskInfo.risk,
    phase: riskInfo.phase,
    alertReason: riskInfo.reason,
    recommendedAction: riskInfo.action,
    nextActionDate: formatDate_(row["次回対応日"]),
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
  if (status === "更新完了" || status === "対象外") {
    return { risk: "P5", phase: "完了・対象外", reason: "管理済み", action: "定期確認のみ" };
  }
  var sourcePhase = sourcePhaseFromStatus_(status);
  if (sourcePhase) return sourcePhase;
  if (!ctx.expiry) {
    return { risk: "P1", phase: "免許証確認待ち", reason: "ドローン免許証の有効期限が未登録", action: "免許証を確認し、有効期限内か記録" };
  }
  if (ctx.daysToExpiry < 0) {
    return { risk: "P1", phase: "期限切れ", reason: "免許有効期限を過ぎています", action: "講習可否と再取得手続きを即確認" };
  }
  if (!ctx.licenseCheckDate || ctx.licenseCheckResult !== "有効") {
    return { risk: "P1", phase: "免許証確認待ち", reason: "免許証の現物確認または有効判定が未完了", action: "免許証を確認し、有効期限内なら確認日を記録" };
  }
  if (ctx.certificateExpiry && ctx.certDays < 0 && status !== "申請完了") {
    return { risk: "P1", phase: "更新証明期限切れ", reason: "更新証明の3か月期限を過ぎています", action: "再講習または申請可否を確認" };
  }
  if (ctx.today >= ctx.procedureStopDate) {
    return { risk: "P1", phase: "手続き不可ライン", reason: "有効期限1か月前に入っています", action: "手続き可能か至急確認し、電話対応" };
  }
  if (ctx.certificateExpiry && ctx.certDays <= 30 && status !== "申請完了") {
    return { risk: "P2", phase: "更新証明期限注意", reason: "更新証明の期限が30日以内", action: "申請完了まで進める" };
  }
  if (ctx.daysToExpiry <= 90) {
    return { risk: "P2", phase: "3か月以内", reason: "免許有効期限が3か月以内", action: "講習日・申請状況を毎週確認" };
  }
  if (ctx.today >= ctx.cdpStartDate) {
    return { risk: "P2", phase: "CDP講習・申請受付中", reason: "6か月前に入りCDP講習対象", action: "案内送付、申込、日程確定" };
  }
  if (ctx.today >= ctx.courseEligibleDate) {
    return { risk: "P3", phase: "更新講習受講可能", reason: "9か月前に入り講習受講可能", action: "早期案内、希望時期確認" };
  }
  return { risk: "P5", phase: "期限余裕あり", reason: "まだ9か月前ではありません", action: "定期確認" };
}

function sourcePhaseFromStatus_(status) {
  var text = normalize_(status);
  var map = {
    "期限切れ": { risk: "P1", phase: "期限切れ", reason: "読み取り元の状態が期限切れ", action: "講習可否と再取得手続きを即確認" },
    "手続き不可ライン": { risk: "P1", phase: "手続き不可ライン", reason: "読み取り元の状態が手続き不可ライン", action: "手続き可能か至急確認し、電話対応" },
    "更新証明期限注意": { risk: "P2", phase: "更新証明期限注意", reason: "読み取り元の状態が更新証明期限注意", action: "申請完了まで進める" },
    "3か月以内": { risk: "P2", phase: "3か月以内", reason: "読み取り元の状態が3か月以内", action: "講習日・申請状況を毎週確認" },
    "CDP講習・申請受付中": { risk: "P2", phase: "CDP講習・申請受付中", reason: "読み取り元の状態がCDP講習・申請受付中", action: "案内送付、申込、日程確定" },
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
    "免許有効期限: " + (record.licenseExpiryDate || "未確認"),
    "免許確認: " + record.licenseCheckResult + " / " + (record.licenseCheckedDate || "未確認"),
    "状態: " + record.phase,
    "リスク: " + record.risk,
    "理由: " + record.alertReason,
    "推奨対応: " + record.recommendedAction,
    "更新講習受講可: " + (record.courseEligibleDate || "-"),
    "CDP講習・申請受付: " + (record.cdpStartDate || "-"),
    "手続き停止ライン: " + (record.procedureStopDate || "-"),
    "更新証明期限: " + (record.certificateExpiryDate || "-"),
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
  if (value instanceof Date && !isNaN(value.getTime())) return stripTime_(value);
  var text = normalize_(value);
  if (!text) return null;
  text = text.replace(/[年月.-]/g, "/").replace(/日/g, "").replace(/\s+/g, "");
  var m = text.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (!m) return null;
  var date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (isNaN(date.getTime())) return null;
  return stripTime_(date);
}

function stripTime_(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addMonths_(date, months) {
  if (!date) return null;
  return new Date(date.getFullYear(), date.getMonth() + months, date.getDate());
}

function addYears_(date, years) {
  if (!date) return null;
  return new Date(date.getFullYear() + years, date.getMonth(), date.getDate());
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
