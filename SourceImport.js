// @ts-nocheck
// 更新予定者一覧を「読取専用」で共有正本へ取り込む。
// 元スプレッドシートへは一切書き込まず、確定時にもサーバー側で再読込・再検査する。

var RENEWAL_SOURCE_IMPORT = {
  SCHEMA_VERSION: 1,
  ROSTER_SPREADSHEET_ID: "14bzaYZ_9dz4BMHNVDx7AfpKFN-3pStoWjKdKOMVeiv0",
  MAX_ROWS: 5000,
  SHEETS: {
    "2026": { name: "2026年名簿", sheetId: 1544892163 },
    "2027": { name: "2027年名簿", sheetId: 1849359331 }
  },
  HEADER_KEYS: [
    "番号", "氏名", "メールアドレス", "有効期限",
    "講習実施可能期間|講習実施可能日", "講習実施可能期間|講習締切日",
    "六ヶ月前|日付", "六ヶ月前|案内送付",
    "三ヶ月前|日付", "三ヶ月前|案内送付",
    "案内文送付①", "案内文送付②",
    "講習|講習日", "講習|会場", "金額", "備考"
  ]
};

/** 取込候補を表示するだけで、共有正本には書き込まない。 */
function apiPreviewRenewalSourceImport(input) {
  try {
    sourceRequireCapability_("records.import");
    var preview = sourceBuildRenewalRosterPreview_(input || {});
    return {
      success: true,
      dryRun: true,
      year: preview.year,
      sourceSheetName: preview.sourceSheetName,
      sourceModifiedTime: preview.sourceModifiedTime,
      sourceHeaderHash: preview.sourceHeaderHash,
      sourceBatchHash: preview.sourceBatchHash,
      rowCount: preview.rows.length,
      rows: preview.rows.map(sourcePublicPreviewRow_),
      warnings: preview.warnings,
      message: preview.rows.length + "件を読取専用で検査しました。確定するまで共有正本は変更されません。"
    };
  } catch (error) {
    return sourceErrorResponse_(error);
  }
}

/**
 * プレビュー時のhashを受け取り、元シートを再読込して一致した場合だけ共有正本へ反映する。
 * sourceBatchHashが変わっていれば、元シートが更新されたものとして停止する。
 */
function apiCommitRenewalSourceImport(input) {
  input = input || {};
  try {
    var actor = sourceRequireCapability_("records.import");
    var expectedHash = sourceText_(input.sourceBatchHash);
    if (!expectedHash) throw new Error("取込確定には作成直前の検査結果が必要です。");
    var preview = sourceBuildRenewalRosterPreview_({ year: input.year });
    if (preview.sourceBatchHash !== expectedHash) {
      throw new Error("検査後に更新予定者一覧が変更されました。再度プレビューしてください。");
    }
    if (typeof storeImportSourceRecords_ !== "function") {
      throw new Error("共有正本の取込機能が有効ではありません。先に運用正本をセットアップしてください。");
    }
    return storeImportSourceRecords_({
      sourceType: "renewal_roster",
      sourceSpreadsheetId: RENEWAL_SOURCE_IMPORT.ROSTER_SPREADSHEET_ID,
      sourceSheetName: preview.sourceSheetName,
      sourceSheetId: preview.sourceSheetId,
      sourceModifiedTime: preview.sourceModifiedTime,
      sourceHeaderHash: preview.sourceHeaderHash,
      sourceBatchHash: preview.sourceBatchHash,
      actorEmail: actor && actor.email ? actor.email : "",
      reason: sourceText_(input.reason) || "更新予定者一覧からの確定取込",
      rows: preview.rows
    });
  } catch (error) {
    return sourceErrorResponse_(error);
  }
}

function sourceBuildRenewalRosterPreview_(input) {
  var year = sourceText_(input && input.year);
  var source = RENEWAL_SOURCE_IMPORT.SHEETS[year];
  if (!source) throw new Error("取込年度は承認済みの2026年または2027年を指定してください。");

  var spreadsheet = SpreadsheetApp.openById(RENEWAL_SOURCE_IMPORT.ROSTER_SPREADSHEET_ID);
  var sheet = spreadsheet.getSheetByName(source.name);
  if (!sheet || Number(sheet.getSheetId()) !== Number(source.sheetId)) {
    throw new Error("更新予定者一覧の対象シート名またはsheetIdが承認時と一致しません。担当者が原本変更を確認してください。");
  }
  var lastRow = Math.min(Number(sheet.getLastRow() || 0), RENEWAL_SOURCE_IMPORT.MAX_ROWS);
  if (lastRow < 4) throw new Error("更新予定者一覧の見出しを確認できません。");
  if (Number(sheet.getLastRow() || 0) > RENEWAL_SOURCE_IMPORT.MAX_ROWS) {
    throw new Error("更新予定者一覧が取込上限を超えています。範囲を担当者が確認してください。");
  }

  var headerRows = sheet.getRange(3, 1, 2, 16).getDisplayValues();
  var actualHeaderKeys = sourceCompositeHeaders_(headerRows[0], headerRows[1]);
  if (JSON.stringify(actualHeaderKeys) !== JSON.stringify(RENEWAL_SOURCE_IMPORT.HEADER_KEYS)) {
    throw new Error("更新予定者一覧の列構造が承認済み形式と一致しません。自動推測で取り込まず、項目対応を再確認してください。");
  }

  var displayRows = lastRow >= 5 ? sheet.getRange(5, 1, lastRow - 4, 16).getDisplayValues() : [];
  var valueRows = lastRow >= 5 ? sheet.getRange(5, 1, lastRow - 4, 16).getValues() : [];
  var warnings = [];
  var mapped = [];
  for (var index = 0; index < displayRows.length; index++) {
    var display = displayRows[index];
    var values = valueRows[index];
    if (sourceRowIsBlank_(display)) continue;
    var rowNumber = index + 5;
    var mappedRow = sourceMapRosterRow_(year, source, rowNumber, values, display);
    if (!mappedRow.renewalListNo) {
      throw new Error(rowNumber + "行目の番号が空欄です。元シートで確認してください。");
    }
    if (!mappedRow.targetName) {
      throw new Error(rowNumber + "行目の氏名が空欄です。個人を推測せず元シートで確認してください。");
    }
    if (!mappedRow.licenseExpiry) {
      warnings.push(rowNumber + "行目は有効期限が未入力のため、取込後に要確認となります。");
    }
    mapped.push(mappedRow);
  }

  var sourceModifiedTime = sourceDriveModifiedTime_(RENEWAL_SOURCE_IMPORT.ROSTER_SPREADSHEET_ID);
  var headerHash = sourceSha256_(JSON.stringify(actualHeaderKeys));
  var batchHash = sourceSha256_(JSON.stringify({
    schemaVersion: RENEWAL_SOURCE_IMPORT.SCHEMA_VERSION,
    spreadsheetId: RENEWAL_SOURCE_IMPORT.ROSTER_SPREADSHEET_ID,
    sheetId: source.sheetId,
    year: year,
    headerHash: headerHash,
    modifiedTime: sourceModifiedTime,
    rows: mapped.map(function(row) {
      return {
        sourceExternalKey: row.sourceExternalKey,
        sourceRowHash: row.sourceRowHash
      };
    })
  }));
  return {
    year: year,
    sourceSheetName: source.name,
    sourceSheetId: source.sheetId,
    sourceModifiedTime: sourceModifiedTime,
    sourceHeaderHash: headerHash,
    sourceBatchHash: batchHash,
    rows: mapped,
    warnings: warnings
  };
}

function sourceMapRosterRow_(year, source, rowNumber, values, display) {
  var numberText = sourceText_(display[0]);
  var sourceExternalKey = [
    RENEWAL_SOURCE_IMPORT.ROSTER_SPREADSHEET_ID,
    source.sheetId,
    numberText
  ].join(":");
  var courseText = sourceText_(display[12]);
  var record = {
    id: "",
    personId: "REN-" + year + "-" + sourcePad_(numberText, 4),
    targetName: sourceText_(display[1]),
    email: sourceText_(display[2]),
    fiscalYear: year,
    sessionNo: "1",
    renewalListNo: numberText,
    licenseExpiry: sourceIsoDate_(values[3], display[3], year),
    courseAvailableDate: sourceIsoDate_(values[4], display[4], year),
    courseDeadlineDate: sourceIsoDate_(values[5], display[5], year),
    noticeSixMonthDate: sourceIsoDate_(values[6], display[6], year),
    noticeSixMonthStatus: sourceBooleanStatus_(values[7], display[7]),
    noticeThreeMonthDate: sourceIsoDate_(values[8], display[8], year),
    noticeThreeMonthStatus: sourceBooleanStatus_(values[9], display[9]),
    noticeLetter1: sourceText_(display[10]),
    noticeLetter2: sourceText_(display[11]),
    courseScheduledDate: sourceIsoDate_(values[12], display[12], year),
    sourceCourseScheduleText: courseText,
    courseVenue: sourceText_(display[13]),
    renewalListAmount: sourceText_(display[14]),
    renewalListAmountTaxBasis: "未確認",
    renewalListMemo: sourceText_(display[15]),
    referenceSource: "更新予定者一覧",
    sourceMemo: source.name + " " + rowNumber + "行目",
    sourceExternalKey: sourceExternalKey,
    sourceSpreadsheetId: RENEWAL_SOURCE_IMPORT.ROSTER_SPREADSHEET_ID,
    sourceSheetId: String(source.sheetId),
    sourceSheetName: source.name,
    sourceRowNumber: String(rowNumber),
    sourceImportStatus: "要確認"
  };
  record.sourceRowHash = sourceSha256_(JSON.stringify({
    sourceExternalKey: sourceExternalKey,
    values: display.map(sourceText_)
  }));
  return record;
}

function sourceCompositeHeaders_(top, bottom) {
  var currentGroup = "";
  var keys = [];
  for (var index = 0; index < 16; index++) {
    var topValue = sourceText_(top[index]);
    var bottomValue = sourceText_(bottom[index]);
    if (topValue) currentGroup = topValue;
    if (bottomValue) {
      keys.push((topValue || currentGroup) + "|" + bottomValue);
    } else {
      keys.push(topValue || currentGroup);
    }
  }
  return keys;
}

function sourceIsoDate_(rawValue, displayValue, defaultYear) {
  if (Object.prototype.toString.call(rawValue) === "[object Date]" && !isNaN(rawValue.getTime())) {
    return Utilities.formatDate(rawValue, "Asia/Tokyo", "yyyy-MM-dd");
  }
  var text = sourceText_(displayValue);
  if (!text) return "";
  var isoMatch = text.match(/^(\d{4})[\/.-](\d{1,2})[\/.-](\d{1,2})$/);
  if (isoMatch) return sourceValidIsoDate_(isoMatch[1], isoMatch[2], isoMatch[3]);
  var jpMatch = text.match(/(?:^|\D)(\d{1,2})月(\d{1,2})日/);
  if (jpMatch) return sourceValidIsoDate_(defaultYear, jpMatch[1], jpMatch[2]);
  return "";
}

function sourceValidIsoDate_(year, month, day) {
  var y = Number(year);
  var m = Number(month);
  var d = Number(day);
  var date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return "";
  return String(y) + "-" + sourcePad_(m, 2) + "-" + sourcePad_(d, 2);
}

function sourceBooleanStatus_(rawValue, displayValue) {
  var text = sourceText_(displayValue).toLowerCase();
  if (rawValue === true || text === "true" || text === "済" || text === "送付済") return "送付済";
  if (rawValue === false || text === "false" || text === "未" || text === "未送付") return "未送付";
  return "未送付";
}

function sourcePublicPreviewRow_(row) {
  return {
    sourceExternalKey: row.sourceExternalKey,
    sourceRowNumber: row.sourceRowNumber,
    renewalListNo: row.renewalListNo,
    personId: row.personId,
    targetName: row.targetName,
    licenseExpiry: row.licenseExpiry,
    courseScheduledDate: row.courseScheduledDate,
    courseVenue: row.courseVenue,
    renewalListAmount: row.renewalListAmount,
    sourceImportStatus: row.sourceImportStatus
  };
}

function sourceDriveModifiedTime_(fileId) {
  try {
    if (typeof Drive !== "undefined" && Drive.Files && typeof Drive.Files.get === "function") {
      var resource = Drive.Files.get(fileId, { fields: "modifiedTime" });
      return sourceText_(resource && resource.modifiedTime);
    }
  } catch (ignore) {}
  return "";
}

function sourceRequireCapability_(capability) {
  if (typeof storeRequireCapability_ !== "function") {
    throw new Error("共有正本の権限機能が利用できないため、元シート取込を停止しました。");
  }
  return storeRequireCapability_(capability);
}

function sourceRowIsBlank_(row) {
  return !row.some(function(value) { return sourceText_(value) !== ""; });
}

function sourceSha256_(value) {
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(value == null ? "" : value),
    Utilities.Charset.UTF_8
  );
  return bytes.map(function(byte) {
    var normalized = byte < 0 ? byte + 256 : byte;
    return ("0" + normalized.toString(16)).slice(-2);
  }).join("");
}

function sourcePad_(value, width) {
  var text = sourceText_(value);
  while (text.length < Number(width || 0)) text = "0" + text;
  return text;
}

function sourceText_(value) {
  return String(value == null ? "" : value).trim();
}

function sourceErrorResponse_(error) {
  var message = sourceText_(error && error.message ? error.message : error);
  return { success: false, dryRun: true, error: message, message: message };
}
