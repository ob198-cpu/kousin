// @ts-nocheck
// Webアプリの公開API。保存・権限・監査・会計の実処理は各専用モジュールへ委譲する。

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

var WEB_ACCESS_DENIED_MESSAGE =
  "この画面は利用できません。組織のシステム管理者へ連絡してください。";

function doGet() {
  try {
    apiAssertWebAccess_();
    return HtmlService.createTemplateFromFile("Index")
      .evaluate()
      .setTitle("CDP免許更新管理")
      .addMetaTag("viewport", "width=device-width, initial-scale=1");
  } catch (ignored) {
    return apiAccessDeniedHtml_();
  }
}

/**
 * Web画面とWeb APIに共通の入口検査。
 * 初回設定前は、active/effectiveがともに取得できて一致するデプロイ所有者だけを許可する。
 * 設定後はactive userが共有正本の有効なread権限を持つ場合だけ許可する。
 * Google認可・設定・権限・正本のどこで失敗しても、外部へ理由を区別して返さない。
 */
function apiAssertWebAccess_() {
  try {
    var properties = PropertiesService.getScriptProperties();
    var key = (typeof RENEWAL_STORE !== "undefined" &&
      RENEWAL_STORE.SPREADSHEET_ID_KEY) ||
      "CDP_RENEWAL_DATA_STORE_SPREADSHEET_ID_V1";
    var configured = !!String(properties.getProperty(key) || "");
    var active = apiNormalizeWebEmail_(
      Session.getActiveUser().getEmail()
    );

    if (!configured) {
      var effective = apiNormalizeWebEmail_(
        Session.getEffectiveUser().getEmail()
      );
      if (active && effective && active === effective) {
        storeAssertBootstrapOwnershipAnchor_(active);
        return { configured: false, role: "bootstrap-owner" };
      }
    } else if (active) {
      var spreadsheet = storeOpen_();
      var role = storeRequirePermission_(spreadsheet, active, "read");
      return { configured: true, role: role };
    }
  } catch (ignored) {
    // Fail closed below.  Do not expose authorization, store, or identity details.
  }
  throw apiError_("ACCESS_DENIED", WEB_ACCESS_DENIED_MESSAGE);
}

function apiNormalizeWebEmail_(value) {
  return String(value || "").normalize("NFKC").trim().toLowerCase();
}

function apiAccessDeniedHtml_() {
  return HtmlService.createHtmlOutput(
    '<!doctype html><html lang="ja"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    "<title>利用できません</title></head><body>" +
    '<main style="max-width:40rem;margin:4rem auto;padding:1rem;' +
    'font-family:-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,sans-serif">' +
    "<h1>利用できません</h1><p>" + WEB_ACCESS_DENIED_MESSAGE +
    "</p></main></body></html>"
  ).setTitle("利用できません");
}

/**
 * デプロイ所有者がApps Scriptエディタから一度だけ実行する認可確認。
 * 認可URLやOAuth tokenをWeb画面へ送らず、実行ログ／戻り値だけで確認する。
 */
/**
 * Editor-visible owner-only entry point. Index.html must not call it.
 * The private core re-checks the actor, deployment owner, and fixed folder owner.
 */
function ownerAuthorizeDeployment() {
  return authorizeDeploymentOwner_();
}

function authorizeDeploymentOwner_() {
  var active = String(Session.getActiveUser().getEmail() || "").trim().toLowerCase();
  var effective = String(Session.getEffectiveUser().getEmail() || "").trim().toLowerCase();
  if (!active || !effective || active !== effective) {
    throw apiError_("OWNER_AUTHORIZATION_REQUIRED", "デプロイ所有者本人としてApps Scriptエディタから実行してください。");
  }
  storeAssertBootstrapOwnershipAnchor_(active);
  var info = ScriptApp.getAuthorizationInfo(ScriptApp.AuthMode.FULL);
  var required = info.getAuthorizationStatus() === ScriptApp.AuthorizationStatus.REQUIRED;
  return {
    authorized: !required,
    authorizationRequired: required,
    authorizationUrl: required ? String(info.getAuthorizationUrl() || "") : "",
    authorizedScopes: info.getAuthorizedScopes() || []
  };
}

/**
 * Apps Scriptエディタから所有者が実行する初回セットアップ用の引数なし関数。
 * 既存の参照シートを指定できない設計とし、専用の非公開正本だけを新規作成する。
 */
/** Editor-visible Workspace setup entry point; never called by the web UI. */
function ownerSetupWorkspaceSystem() {
  return setupDedicatedSystemAsOwner_();
}

function setupDedicatedSystemAsOwner_() {
  var authorization = authorizeDeploymentOwner_();
  if (!authorization.authorized) {
    throw apiError_(
      "OWNER_AUTHORIZATION_REQUIRED",
      "Google認可が未完了です。表示された同意画面を所有者本人が確認し、authorizeDeploymentOwner_()がauthorized:trueになってから再実行してください。"
    );
  }
  return apiSetupSystem_({
    confirm: RENEWAL_STORE.SETUP_CONFIRM,
    deploymentMode: RENEWAL_STORE.SETUP_MODE_WORKSPACE,
    financeConfirm: FINANCE_STORE.SETUP_CONFIRM
  });
}

/**
 * 個人Googleアカウントで単独運用すると決めた場合だけ、Apps Script
 * エディタから確認文字列を引数にして実行する。後日のWorkspace移管を
 * 自動化しないため、複数担当者運用を予定する場合は使用しない。
 */
/**
 * Editor-visible personal single-user setup entry point.
 * Selecting this explicitly is the operator confirmation; the private core
 * still validates the exact confirmation constant and Google identity.
 */
function ownerSetupPersonalSingleUserSystem() {
  return setupDedicatedSingleUserAsOwner_(
    RENEWAL_STORE.PERSONAL_SETUP_CONFIRM
  );
}

function setupDedicatedSingleUserAsOwner_(confirmText) {
  var authorization = authorizeDeploymentOwner_();
  if (!authorization.authorized) {
    throw apiError_(
      "OWNER_AUTHORIZATION_REQUIRED",
      "Google認可が未完了です。authorizeDeploymentOwner_()がauthorized:trueになってから再実行してください。"
    );
  }
  if (
    String(confirmText || "") !==
    RENEWAL_STORE.PERSONAL_SETUP_CONFIRM
  ) {
    throw apiError_(
      "PERSONAL_SINGLE_USER_CONFIRM_REQUIRED",
      "個人アカウントの単独運用を明示する正確な確認文字列が必要です。"
    );
  }
  return apiSetupSystem_({
    confirm: RENEWAL_STORE.SETUP_CONFIRM,
    deploymentMode: RENEWAL_STORE.SETUP_MODE_PERSONAL,
    personalSingleUserConfirm: RENEWAL_STORE.PERSONAL_SETUP_CONFIRM,
    financeConfirm: FINANCE_STORE.SETUP_CONFIRM
  });
}

/**
 * 初回セットアップ後、所有者がApps Scriptエディタから一度だけ実行する。
 * 同名トリガーは置換され、毎日午前2時頃に専用フォルダへバックアップする。
 */
/** Editor-visible owner-only trigger installer; never called by the web UI. */
function ownerInstallDailyBackupTrigger() {
  return installDailyBackupTriggerAsOwner_();
}

function installDailyBackupTriggerAsOwner_() {
  var authorization = authorizeDeploymentOwner_();
  if (!authorization.authorized) {
    throw apiError_(
      "OWNER_AUTHORIZATION_REQUIRED",
      "Google認可が未完了です。authorizeDeploymentOwner_()がauthorized:trueになってから再実行してください。"
    );
  }
  return apiResult_(function () {
    return storeInstallDailyBackupTrigger_({
      confirm: "INSTALL_DAILY_RENEWAL_BACKUP"
    });
  });
}

function apiGetSetupState() {
  return apiResult_(function () {
    var state = storeGetSetupState_();
    state.success = true;
    state.safeMode = !state.configured;
    return state;
  });
}

function apiSetupSystem_(input) {
  input = input || {};
  return apiResult_(function () {
    var storeState = storeSetup_(input);
    var financeState = null;
    if (String(input.financeConfirm || "") === FINANCE_STORE.SETUP_CONFIRM) {
      financeState = financeStoreSetup_({
        confirm: input.financeConfirm,
        companyPolicy: input.companyPolicy || {}
      });
    }
    return {
      success: true,
      configured: true,
      store: storeState,
      finance: financeState,
      message: financeState ?
        "専用共有正本と会計台帳を準備しました。" :
        "専用共有正本を準備しました。会計台帳は未設定です。"
    };
  });
}

function apiGetDashboardData(input) {
  input = input || {};
  return apiResult_(function () {
    var setup = storeGetSetupState_();
    if (!setup.configured) {
      return {
        success: true,
        configured: false,
        safeMode: true,
        generatedAt: formatSafeDateTime_(new Date()),
        records: [],
        audit: [],
        roles: [],
        statusOptions: SAFE_STATUS_OPTIONS,
        customerTypes: SAFE_CUSTOMER_TYPES,
        message: "専用共有正本は未設定です。"
      };
    }
    var records = storeListRecords_({ includeDeleted: input.includeDeleted === true });
    var audit = [];
    var roles = [];
    if (setup.role === "admin") {
      audit = storeListAudit_({ limit: input.auditLimit || 500 });
      roles = storeListRoles_();
    }
    return {
      success: true,
      configured: true,
      safeMode: false,
      role: setup.role,
      spreadsheetUrl: setup.spreadsheetUrl,
      dataGenerationCapacity: setup.dataGenerationCapacity || null,
      generatedAt: formatSafeDateTime_(new Date()),
      records: records,
      audit: audit,
      roles: roles,
      allCount: records.length,
      summary: apiRecordSummary_(records),
      statusOptions: SAFE_STATUS_OPTIONS,
      customerTypes: SAFE_CUSTOMER_TYPES,
      message: "専用共有正本から読み込みました。"
    };
  });
}

function apiReadSourceSpreadsheet() {
  return disabled_("読み取り元スプレッドシート読込は停止中です。");
}

function apiReadOperationFiles() {
  return disabled_("運用ファイル読込は停止中です。");
}

function apiSaveRecord(input) {
  return apiResult_(function () {
    return apiStoreMutationEnvelope_(
      "record", storeUpsertRecord_(input || {})
    );
  });
}

function apiSoftDeleteRecord(input) {
  return apiResult_(function () {
    return apiStoreMutationEnvelope_(
      "record", storeSoftDeleteRecord_(input || {})
    );
  });
}

function apiRestoreRecord(input) {
  return apiResult_(function () {
    return apiStoreMutationEnvelope_(
      "record", storeRestoreSoftDeletedRecord_(input || {})
    );
  });
}

function apiSetUserRole(input) {
  return apiResult_(function () {
    return apiStoreMutationEnvelope_(
      "role", storeSetRole_(input || {})
    );
  });
}

function apiConfirmMutationAudit(input) {
  return apiResult_(function () {
    return storeConfirmAuditedMutation_(input || {});
  });
}

function apiStoreMutationEnvelope_(key, value) {
  var response = { success: true };
  response[key] = value;
  response.committed = value && value.committed !== false;
  response.recoveryNeeded = !!(value && value.recoveryNeeded);
  response.recoveryRequired = !!(value && value.recoveryRequired);
  response.warning = String(value && value.warning || "");
  response.correlationId = String(value && value.correlationId || "");
  response.idempotentReplay = !!(value && value.idempotentReplay);
  return response;
}

function apiCreateSharedBackup(input) {
  input = input || {};
  return apiResult_(function () {
    var result = storeCreateManualBackup_(input);
    if (result && result.success === true) {
      result.message = result.financeBackup ?
        "対象者・権限と会計全履歴を同じ実行単位でバックアップしました。" :
        "対象者・権限をバックアップしました。会計台帳は未設定です。";
    }
    return result;
  });
}

function apiListSharedBackups() {
  return apiResult_(function () {
    return { success: true, backups: storeListRegisteredBackups_() };
  });
}

function apiVerifySharedBackup(input) {
  return apiResult_(function () { return storeVerifyRegisteredBackup_(input || {}); });
}

function apiPrepareSharedRestore(input) {
  return apiResult_(function () {
    var result = storePrepareRestore_(input || {});
    result.success = true;
    return result;
  });
}

function apiListPendingSharedRestores() {
  return apiResult_(function () {
    return { success: true, restores: storeListPendingRestores_() };
  });
}

function apiConfirmSharedRestore(input) {
  return apiResult_(function () { return storeConfirmRestore_(input || {}); });
}

function apiRejectSharedRestore(input) {
  return apiResult_(function () { return storeRejectRestore_(input || {}); });
}

function apiCreateFinanceBackup(input) {
  return apiResult_(function () { return financeStoreCreateBackup_(input || {}); });
}

function apiListFinanceBackups() {
  return apiResult_(function () {
    return { success: true, backups: financeStoreListBackups_() };
  });
}

function apiVerifyFinanceBackup(input) {
  return apiResult_(function () { return financeStoreVerifyBackup_(input || {}); });
}

function apiPrepareFinanceDisasterRestore(input) {
  return apiResult_(function () {
    return financeStorePrepareDisasterRestore_(input || {});
  });
}

function apiListFinanceDisasterRestores(input) {
  return apiResult_(function () {
    return {
      success: true,
      restores: financeStoreListDisasterRestores_(input || {})
    };
  });
}

function apiConfirmFinanceDisasterRestore(input) {
  return apiResult_(function () {
    return financeStoreConfirmDisasterRestore_(input || {});
  });
}

function apiRejectFinanceDisasterRestore(input) {
  return apiResult_(function () {
    return financeStoreRejectDisasterRestore_(input || {});
  });
}

function apiPreviewBrowserMigration(input) {
  return apiResult_(function () {
    if (typeof storePreviewLocalRecordsBatch_ !== "function") {
      throw apiError_("STORE_MIGRATION_UNAVAILABLE", "安全な一括移行モジュールが未設定です。");
    }
    var result = storePreviewLocalRecordsBatch_(input || {});
    result.success = true;
    return result;
  });
}

function apiCommitBrowserMigration(input) {
  return apiResult_(function () {
    if (typeof storeCommitLocalRecordsBatch_ !== "function") {
      throw apiError_("STORE_MIGRATION_UNAVAILABLE", "安全な一括移行モジュールが未設定です。");
    }
    var result = storeCommitLocalRecordsBatch_(input || {});
    result.success = true;
    return result;
  });
}

function apiRecordBrowserStoragePurge(input) {
  return apiResult_(function () {
    if (typeof storeRecordBrowserStoragePurge_ !== "function") {
      throw apiError_(
        "STORE_BROWSER_PURGE_UNAVAILABLE",
        "ブラウザ保存データの削除証跡機能を利用できません。"
      );
    }
    var result = storeRecordBrowserStoragePurge_(input || {});
    result.success = true;
    return result;
  });
}

function apiImportBrowserCsv(input) {
  return apiResult_(function () {
    if (typeof storeImportLocalRecordsBatch_ !== "function") {
      throw apiError_("STORE_CSV_IMPORT_UNAVAILABLE", "安全な一括CSV取込モジュールが未設定です。");
    }
    var result = storeImportLocalRecordsBatch_(input || {});
    result.success = true;
    return result;
  });
}

function apiSetupFinanceLedger(input) {
  return apiResult_(function () {
    var result = financeStoreSetup_(input || {});
    result.success = true;
    return result;
  });
}

function apiGetFinanceLedger() {
  return apiResult_(function () {
    var result = financeStoreGetState_();
    result.success = true;
    return result;
  });
}

function apiCheckFinanceHealth(input) {
  return apiResult_(function () {
    var result = financeStoreHealthCheck_(input || {});
    result.success = true;
    return result;
  });
}

function apiExecuteFinanceCommand(input) {
  return apiResult_(function () {
    return financeStoreExecute_(input || {});
  });
}

function apiRequestFinanceApproval(input) {
  return apiResult_(function () {
    return financeStoreRequestApproval_(input || {});
  });
}

function apiApproveFinanceCommand(input) {
  return apiResult_(function () {
    return financeStoreApprove_(input || {});
  });
}

function apiRejectFinanceCommand(input) {
  return apiResult_(function () {
    return financeStoreRejectApproval_(input || {});
  });
}

function apiListFinanceApprovals(input) {
  return apiResult_(function () {
    return { success: true, approvals: financeStoreListApprovals_(input || {}) };
  });
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
  try {
    apiAssertWebAccess_();
  } catch (ignored) {
    return {
      success: false,
      code: "ACCESS_DENIED",
      error: WEB_ACCESS_DENIED_MESSAGE
    };
  }
  return {
    success: false,
    safeMode: true,
    error: message
  };
}

function apiResult_(callback) {
  try {
    apiAssertWebAccess_();
    return callback();
  } catch (error) {
    if (String(error && error.code || "") === "ACCESS_DENIED") {
      return {
        success: false,
        code: "ACCESS_DENIED",
        error: WEB_ACCESS_DENIED_MESSAGE
      };
    }
    return {
      success: false,
      code: String(error && error.code || "SERVER_ERROR"),
      error: String(error && error.message || error || "サーバー処理に失敗しました。")
    };
  }
}

function apiError_(code, message) {
  var error = new Error(message);
  error.code = code;
  return error;
}

function apiRecordSummary_(rows) {
  var summary = { total: 0, active: 0, archived: 0 };
  (rows || []).forEach(function (row) {
    summary.total += 1;
    if (row.deleted) summary.archived += 1;
    else summary.active += 1;
  });
  return summary;
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
