// @ts-nocheck
// Safe build: real-data access is intentionally disabled.

var SAFE_STATUS_OPTIONS = [
  "免許証確認待ち",
  "案内前",
  "案内済",
  "申込済み",
  "講習予定",
  "講習修了",
  "更新申請待ち",
  "DIPS申請中",
  "更新完了未確認",
  "更新完了",
  "期限超過・未確認",
  "対象外"
];

var SAFE_CUSTOMER_TYPES = [
  "既存",
  "新規（他講習機関）",
  "新規",
  "法人"
];

function doGet() {
  return HtmlService.createTemplateFromFile("Index")
    .evaluate()
    .setTitle("CDP免許更新管理")
    .addMetaTag("viewport", "width=device-width, initial-scale=1")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function apiGetSetupState() {
  return {
    success: true,
    configured: true,
    safeMode: true,
    spreadsheetId: "",
    spreadsheetUrl: "",
    title: "安全モード",
    message: "実データ接続は停止中です。"
  };
}

function apiSetupSystem() {
  return disabled_("セットアップ機能は停止中です。");
}

function apiGetDashboardData() {
  return {
    success: true,
    safeMode: true,
    spreadsheetUrl: "",
    generatedAt: formatSafeDateTime_(new Date()),
    records: [],
    allCount: 0,
    summary: {
      total: 0,
      danger: 0,
      warning: 0,
      guide: 0,
      ok: 0
    },
    statusOptions: SAFE_STATUS_OPTIONS,
    customerTypes: SAFE_CUSTOMER_TYPES,
    settings: {
      alertEmails: "",
      dailyAlertHour: "",
      dailyRisks: ""
    },
    message: "安全モードです。実データは読み込みません。"
  };
}

function apiReadSourceSpreadsheet() {
  return disabled_("読み取り元スプレッドシート読込は停止中です。");
}

function apiReadOperationFiles() {
  return disabled_("運用ファイル読込は停止中です。");
}

function apiSaveRecord() {
  return disabled_("保存機能は停止中です。");
}

function apiSendInternalAlert() {
  return disabled_("メール送信は停止中です。");
}

function apiSendDailyAlertSummary() {
  return disabled_("日次メール送信は停止中です。");
}

function apiInstallDailyAlertTrigger() {
  return disabled_("日次通知トリガー設定は停止中です。");
}

function disabled_(message) {
  return {
    success: false,
    safeMode: true,
    error: message
  };
}

function formatSafeDateTime_(date) {
  return [
    date.getFullYear(),
    pad2_(date.getMonth() + 1),
    pad2_(date.getDate())
  ].join("/") + " " + [pad2_(date.getHours()), pad2_(date.getMinutes())].join(":");
}

function pad2_(value) {
  return String(value).padStart(2, "0");
}
