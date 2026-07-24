/**
 * Official holiday CSV validation, persisted holiday calendars, and DIPS business-day calculations.
 *
 * This file is an Apps Script global module. Shared constants and general helpers
 * remain in Artifacts.js; do not duplicate those globals here.
 */

function artifactNormalizeIsoDateList_(value) {
  var raw = Array.isArray(value) ? value.join("\n") : String(value === null || value === undefined ? "" : value);
  var seen = {};
  var result = [];
  raw.split(/[\s,;]+/).forEach(function(part) {
    var token = artifactText_(part);
    if (token && !seen[token]) {
      seen[token] = true;
      result.push(token);
    }
  });
  return result.sort();
}

function artifactParseCsvMatrixStrict_(value) {
  var text = String(value === null || value === undefined ? "" : value).replace(/^\uFEFF/, "");
  if (!text || text.length > 500000) throw new Error("公式祝日CSVは1文字以上500,000文字以内で指定してください。");
  if (text.indexOf("\u0000") >= 0) throw new Error("公式祝日CSVにNUL文字があるため取込を停止しました。");
  var rows = [];
  var row = [];
  var field = "";
  var quoted = false;
  for (var i = 0; i < text.length; i++) {
    var character = text.charAt(i);
    if (quoted) {
      if (character === '"') {
        if (text.charAt(i + 1) === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
      continue;
    }
    if (character === '"' && !field) {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\r" || character === "\n") {
      if (character === "\r" && text.charAt(i + 1) === "\n") i++;
      row.push(field);
      field = "";
      if (row.some(function(cell) { return artifactText_(cell); })) rows.push(row);
      row = [];
      if (rows.length > 5000) throw new Error("公式祝日CSVの行数が5,000行を超えています。");
    } else {
      field += character;
    }
  }
  if (quoted) throw new Error("公式祝日CSVの引用符が閉じていません。");
  row.push(field);
  if (row.some(function(cell) { return artifactText_(cell); })) rows.push(row);
  if (!rows.length) throw new Error("公式祝日CSVにデータ行がありません。");
  for (var rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    if (rows[rowIndex].length > 20) throw new Error("公式祝日CSVの列数が想定上限を超えています。");
  }
  return rows;
}

function artifactParseOfficialHolidayCsv_(csvText, yearValue, sourceUrlValue) {
  var year = Number(yearValue);
  if (!isFinite(year) || Math.floor(year) !== year || year < 2028 || year > 2099) {
    throw new Error("追加する公式祝日年は2028～2099の整数で指定してください。2026・2027年はコード固定版を使用します。");
  }
  var sourceUrl = artifactText_(sourceUrlValue);
  if (sourceUrl !== RENEWAL_ARTIFACT.OFFICIAL_HOLIDAY_CSV_URL) {
    throw new Error("祝日CSVの出典URLは内閣府公式CSVを指定してください。");
  }
  var matrix = artifactParseCsvMatrixStrict_(csvText);
  var rows = [];
  var seenDates = {};
  for (var i = 0; i < matrix.length; i++) {
    var dateText = artifactText_(matrix[i][0]).replace(/\./g, "/").replace(/-/g, "/");
    var match = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(dateText);
    if (!match || Number(match[1]) !== year) continue;
    var isoDate = match[1] + "-" + artifactPad_(Number(match[2]), 2) + "-" + artifactPad_(Number(match[3]), 2);
    if (!artifactValidIsoDateOrBlank_(isoDate)) throw new Error(year + "年の公式祝日CSVに実在しない日付があります: " + dateText);
    if (seenDates[isoDate]) throw new Error(year + "年の公式祝日CSVに重複日付があります: " + isoDate);
    var name = artifactText_(matrix[i][1]);
    if (!name || name.length > 50) throw new Error(year + "年の公式祝日名が空欄または50文字超です: " + isoDate);
    seenDates[isoDate] = true;
    rows.push({ date: isoDate, name: name });
  }
  rows.sort(function(a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); });
  if (rows.length < 16 || rows.length > 25) {
    throw new Error(year + "年の公式祝日・休日件数が想定範囲16～25件外です。内閣府CSVの更新完了と対象年を確認してください。");
  }
  var required = {
    "元日": "01-01",
    "建国記念の日": "02-11",
    "天皇誕生日": "02-23",
    "昭和の日": "04-29",
    "憲法記念日": "05-03",
    "みどりの日": "05-04",
    "こどもの日": "05-05",
    "山の日": "08-11",
    "文化の日": "11-03",
    "勤労感謝の日": "11-23"
  };
  Object.keys(required).forEach(function(name) {
    if (!rows.some(function(row) { return row.name === name && row.date.slice(5) === required[name]; })) {
      throw new Error(year + "年の公式祝日CSVに法定の固定祝日「" + name + "」がありません。法改正の可能性を担当部署で確認し、コード承認なしに続行しないでください。");
    }
  });
  ["春分の日", "秋分の日"].forEach(function(name) {
    if (rows.filter(function(row) { return row.name === name; }).length !== 1) {
      throw new Error(year + "年の公式祝日CSVで「" + name + "」を一意に確認できません。");
    }
  });
  var normalizedRaw = String(csvText).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return {
    year: year,
    rows: rows,
    sourceUrl: sourceUrl,
    csvHash: artifactHashHex_(normalizedRaw),
    sourceHash: artifactHashHex_({ year: year, sourceUrl: sourceUrl, rows: rows })
  };
}

function artifactAssertImportedHolidayCalendarStore_(store) {
  if (!store || store.schemaVersion !== 1 || !store.years || typeof store.years !== "object" || Array.isArray(store.years)) {
    throw new Error("追加公式祝日マスタの保存形式が不正です。");
  }
  Object.keys(store.years).forEach(function(yearKey) {
    var entry = store.years[yearKey];
    var year = Number(yearKey);
    if (!entry || year < 2028 || year > 2099 || Math.floor(year) !== year || Number(entry.year) !== year) {
      throw new Error("追加公式祝日マスタの年情報が不正です: " + yearKey);
    }
    if (entry.sourceUrl !== RENEWAL_ARTIFACT.OFFICIAL_HOLIDAY_CSV_URL || !Array.isArray(entry.rows)) {
      throw new Error(year + "年の追加公式祝日マスタの出典または行構造が不正です。");
    }
    if (!artifactValidIsoDateOrBlank_(entry.confirmedDate) || !artifactText_(entry.confirmedBy)) {
      throw new Error(year + "年の追加公式祝日マスタに確認日・確認者がありません。");
    }
    var seen = {};
    for (var i = 0; i < entry.rows.length; i++) {
      var row = entry.rows[i] || {};
      var date = artifactValidIsoDateOrBlank_(row.date);
      if (!date || Number(date.slice(0, 4)) !== year || seen[date] || !artifactText_(row.name)) {
        throw new Error(year + "年の追加公式祝日マスタに不正・重複行があります。");
      }
      seen[date] = true;
    }
    if (entry.rows.length < 16 || entry.rows.length > 25) throw new Error(year + "年の追加公式祝日件数が不正です。");
    var expectedHash = artifactHashHex_({ year: year, sourceUrl: entry.sourceUrl, rows: entry.rows });
    if (
      !/^[0-9a-f]{64}$/.test(artifactText_(entry.sourceHash)) ||
      !/^[0-9a-f]{64}$/.test(artifactText_(entry.csvHash)) ||
      entry.sourceHash !== expectedHash
    ) {
      throw new Error(year + "年の追加公式祝日マスタhashが一致しません。改変の可能性があるため停止しました。");
    }
  });
  return true;
}

function artifactLoadImportedHolidayCalendars_() {
  var raw = PropertiesService.getScriptProperties().getProperty(RENEWAL_ARTIFACT.HOLIDAY_CALENDAR_KEY);
  if (!raw) return { schemaVersion: 1, years: {} };
  var stored;
  try { stored = JSON.parse(raw); }
  catch (parseError) { throw new Error("追加公式祝日マスタを読み取れないためDIPS成果物を停止しました。"); }
  artifactAssertImportedHolidayCalendarStore_(stored);
  return stored;
}

function artifactLoadEffectiveHolidayMaster_() {
  var imported = artifactLoadImportedHolidayCalendars_();
  var years = {};
  Object.keys(RENEWAL_JAPAN_HOLIDAYS.years).forEach(function(year) {
    years[year] = RENEWAL_JAPAN_HOLIDAYS.years[year].slice();
  });
  var hashes = [];
  Object.keys(imported.years).sort().forEach(function(year) {
    years[year] = imported.years[year].rows.map(function(row) { return row.date.slice(5); }).sort();
    hashes.push(year + ":" + imported.years[year].sourceHash);
  });
  return {
    version: RENEWAL_JAPAN_HOLIDAYS.version + (hashes.length ? "|OFFICIAL_CSV_" + artifactHashHex_(hashes) : ""),
    years: years
  };
}

function artifactValidateDipsCalendarSettings_(settings, todayIso, required, errors) {
  settings = settings || {};
  errors = errors || [];
  var closedDates = artifactNormalizeIsoDateList_(settings.dipsAdditionalClosedDates);
  for (var i = 0; i < closedDates.length; i++) {
    if (!artifactValidIsoDateOrBlank_(closedDates[i])) errors.push("DIPS追加閉庁日はyyyy-MM-dd形式の実在日で入力してください: " + closedDates[i]);
  }
  var confirmedText = artifactText_(settings.dipsCalendarConfirmedDate);
  var confirmedDate = artifactValidIsoDateOrBlank_(confirmedText);
  var confirmedBy = artifactText_(settings.dipsCalendarConfirmedBy);
  if (required && !confirmedText) errors.push("DIPS営業日カレンダーの確認日が必要です。");
  if (confirmedText && !confirmedDate) errors.push("DIPS営業日カレンダー確認日はyyyy-MM-dd形式の実在日で入力してください。");
  var today = artifactValidIsoDateOrBlank_(todayIso);
  if (confirmedDate && today && confirmedDate > today) errors.push("DIPS営業日カレンダー確認日に未来日は指定できません。");
  if (required && !confirmedBy) errors.push("DIPS営業日カレンダーの確認者が必要です。");
  if (!required && ((confirmedText && !confirmedBy) || (!confirmedText && confirmedBy))) {
    errors.push("DIPS営業日カレンダーの確認日と確認者は両方入力してください。");
  }
  return closedDates;
}

function artifactAddIsoDaysUtc_(isoDate, days) {
  var parts = artifactIsoParts_(isoDate);
  if (!parts) throw new Error("営業日計算の基準日が正しくありません。");
  var date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + Number(days || 0)));
  return date.getUTCFullYear() + "-" + artifactPad_(date.getUTCMonth() + 1, 2) + "-" + artifactPad_(date.getUTCDate(), 2);
}

function artifactDipsSubmissionDeadline_(issuedDateValue, additionalClosedDates, holidayMaster) {
  var issuedDate = artifactValidIsoDateOrBlank_(issuedDateValue);
  if (!issuedDate) throw new Error("DIPS連携期限の計算には正しい証明書発行日が必要です。");
  var master = holidayMaster || RENEWAL_JAPAN_HOLIDAYS;
  var additional = {};
  artifactNormalizeIsoDateList_(additionalClosedDates).forEach(function(date) {
    if (!artifactValidIsoDateOrBlank_(date)) throw new Error("DIPS追加閉庁日が正しくありません: " + date);
    additional[date] = true;
  });
  var cursor = issuedDate;
  var businessDays = 0;
  while (businessDays < 5) {
    cursor = artifactAddIsoDaysUtc_(cursor, 1);
    var year = cursor.slice(0, 4);
    if (!master || !master.years || !Array.isArray(master.years[year])) {
      throw new Error(
        year + "年の内閣府公式祝日マスタが未収録のため、DIPS連携期限を推測できません。" +
        "内閣府公表後に公式CSVを担当者が確認・取込するまで停止します。"
      );
    }
    var parts = artifactIsoParts_(cursor);
    var dayOfWeek = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
    var holiday = master.years[year].indexOf(cursor.slice(5)) >= 0;
    if (dayOfWeek === 0 || dayOfWeek === 6 || holiday || additional[cursor]) continue;
    businessDays++;
  }
  return cursor;
}

function artifactValidateDipsSubmission_(settings, issuedDate, linkedDateValue, todayIso, errors, warnings) {
  artifactValidateDipsCalendarSettings_(settings, todayIso, true, errors);
  warnings.push("【担当部署に確認が必要】営業日の定義は公開資料で未確認です。民法140条の初日不算入として翌日から暫定計算しています。");
  var deadline = "";
  try {
    deadline = artifactDipsSubmissionDeadline_(
      issuedDate,
      settings && settings.dipsAdditionalClosedDates,
      artifactLoadEffectiveHolidayMaster_()
    );
  } catch (deadlineError) {
    errors.push(artifactErrorMessage_(deadlineError));
    return "";
  }
  var today = artifactValidIsoDateOrBlank_(todayIso);
  if (today && today > deadline) warnings.push("DIPS修了者情報連携の暫定期限（" + deadline + "）を超過しています。担当部署へ直ちに確認してください。");
  var linkedDate = artifactValidateOptionalIso_(linkedDateValue, "DIPS修了者情報連携日", errors);
  var validIssuedDate = artifactValidIsoDateOrBlank_(issuedDate);
  if (linkedDate && validIssuedDate && linkedDate < validIssuedDate) errors.push("DIPS修了者情報連携日は証明書発行日以後にしてください。");
  if (linkedDate && today && linkedDate > today) errors.push("DIPS修了者情報連携日に未来日は指定できません。");
  if (linkedDate && linkedDate > deadline) warnings.push("DIPS修了者情報連携日が暫定連携期限（" + deadline + "）を超過しています。遅延理由を記録し、担当部署へ確認してください。");
  return deadline;
}
