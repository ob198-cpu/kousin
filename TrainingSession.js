// @ts-nocheck
// 同一講習日の保存済み受講者へ、講習日時・担当者を安全に一括反映する。

var TRAINING_SESSION_VERSION = "CDP_RENEWAL_TRAINING_SESSION_V1";
var TRAINING_SESSION_MODULES = [
  { prefix: "academicOverview", label: "学科・技能証明制度の概要", scope: "common" },
  { prefix: "academicRules", label: "学科・操縦者が遵守すべき事項", scope: "common" },
  { prefix: "academicLawUpdate", label: "学科・最近の制度改正", scope: "common" },
  { prefix: "academicAccident", label: "学科・事故・重大インシデント", scope: "common" },
  { prefix: "academicSafety", label: "学科・運航ルール・事故防止", scope: "common" },
  { prefix: "academicVideo", label: "学科・動画（共通）", scope: "common" },
  { prefix: "academicFirstClass", label: "学科・一等操縦士の留意事項", scope: "firstClass" },
  { prefix: "academicFirstClassVideo", label: "学科・動画（一等）", scope: "firstClass" },
  { prefix: "practicalExercise1", label: "実地・操縦演習", scope: "suspension" },
  { prefix: "practicalDiscussion", label: "実地・指導及び質疑応答", scope: "suspension" }
];

function trainingSessionPreview_(input) {
  input = input || {};
  var context = storeContext_("read");
  var rows = storeReadRecords_(context.spreadsheet);
  return trainingSessionBuildPreviewFromRows_(
    rows,
    input,
    trainingSessionToday_()
  );
}

function trainingSessionApply_(input) {
  input = input || {};
  return storeWithLock_(function () {
    var spreadsheet = storeOpen_();
    var actor = storeActorEmail_();
    var role = storeRoleForActor_(spreadsheet, actor);
    storeRequirePermission_(spreadsheet, actor, "record.write", role);

    var rows = storeReadRecords_(spreadsheet);
    var preview = trainingSessionBuildPreviewFromRows_(
      rows,
      input,
      trainingSessionToday_()
    );
    if (!preview.ready) {
      storeFail_(
        "TRAINING_SESSION_PREFLIGHT_FAILED",
        trainingSessionFirstBlockingMessage_(preview)
      );
    }
    if (!input.previewToken ||
        String(input.previewToken) !== String(preview.previewToken)) {
      storeFail_(
        "TRAINING_SESSION_PREVIEW_STALE",
        "対象者または入力内容が作成前検査後に変わりました。再度「反映前に検査」を実行してください。"
      );
    }

    var changed = [];
    var unchanged = [];
    var recoveredAuditCount = 0;
    preview.targets.forEach(function (target) {
      var current = storeFindRecordById_(rows, target.recordId);
      if (!current || current.deleted) {
        storeFail_(
          "TRAINING_SESSION_TARGET_CHANGED",
          "対象者の状態が変わりました。再度「反映前に検査」を実行してください。"
        );
      }
      if (!target.needsUpdate) {
        unchanged.push(target.recordId);
        return;
      }
      var nextPayload = trainingSessionApplyScheduleToPayload_(
        current.payload,
        preview.sessionDate,
        preview.schedule,
        target.licenseClass,
        target.suspensionCourse
      );
      var saved = storeUpsertRecordUnlocked_(
        spreadsheet,
        actor,
        role,
        {
          record: nextPayload,
          recordId: current.recordId,
          expectedVersion: current.version,
          reasonCode: "TRAINING_SESSION_BATCH"
        },
        { migration: false, allowDeletedRestore: false }
      );
      if (saved && saved.recoveryNeeded === true) {
        // 同じロック内で監査のCOMMITTED行を回復してから次の対象へ進む。
        // 回復に失敗した場合は例外で停止し、次の正本行には触れない。
        storeRecoverPreparedAuditedRows_(spreadsheet);
        recoveredAuditCount += 1;
      }
      changed.push({
        recordId: target.recordId,
        version: Number(saved && saved.version || current.version + 1),
        correlationId: String(saved && saved.correlationId || "")
      });
    });

    return {
      success: true,
      committed: true,
      sessionDate: preview.sessionDate,
      targetCount: preview.targetCount,
      changedCount: changed.length,
      unchangedCount: unchanged.length,
      changed: changed,
      unchangedRecordIds: unchanged,
      recoveredAuditCount: recoveredAuditCount,
      message: changed.length ?
        preview.sessionDate + "の講習記録を" + changed.length + "名へ反映しました。" :
        "対象者全員に同じ講習記録が保存済みのため、変更はありません。"
    };
  });
}

function trainingSessionBuildPreviewFromRows_(rows, input, todayText) {
  input = input || {};
  var errors = [];
  var warnings = [];
  var blockers = [];
  var conflicts = [];
  var sessionDate = trainingSessionDate_(input.sessionDate, errors);
  var candidates = [];

  if (sessionDate && todayText && sessionDate > todayText) {
    errors.push("実施前の講習記録は一括入力できません。講習日は今日以前にしてください。");
  }
  if (sessionDate) {
    (rows || []).forEach(function (row) {
      var payload = row && row.payload || {};
      if (!row || row.deleted ||
          trainingSessionText_(payload.courseProvider) !== "CDP" ||
          trainingSessionText_(payload.courseDate) !== sessionDate) return;
      var licenseClass = trainingSessionText_(payload.licenseClass);
      var suspensionCourse = trainingSessionText_(payload.suspensionCourse);
      var targetName = trainingSessionText_(payload.targetName) ||
        trainingSessionText_(payload.personId) || String(row.recordId || "");
      if (["一等", "二等"].indexOf(licenseClass) < 0) {
        blockers.push(targetName + "：資格区分を一等または二等で確定してください。");
        return;
      }
      if (["あり", "なし"].indexOf(suspensionCourse) < 0) {
        blockers.push(targetName + "：資格停止処分者向け講習を「あり」または「なし」で確定してください。");
        return;
      }
      candidates.push({
        row: row,
        recordId: String(row.recordId || ""),
        targetName: targetName,
        personId: trainingSessionText_(payload.personId),
        licenseClass: licenseClass,
        suspensionCourse: suspensionCourse,
        version: Number(row.version || 0),
        payloadHash: String(row.payloadHash || "")
      });
    });
  }
  candidates.sort(function (left, right) {
    return left.recordId < right.recordId ? -1 : (left.recordId > right.recordId ? 1 : 0);
  });
  if (sessionDate && !candidates.length && !blockers.length) {
    errors.push("この講習日の保存済みCDP受講者はいません。先に対象者を保存してください。");
  }

  var requirements = {
    common: candidates.length > 0,
    firstClass: candidates.some(function (item) {
      return item.licenseClass === "一等";
    }),
    suspension: candidates.some(function (item) {
      return item.suspensionCourse === "あり";
    }),
    firstClassSuspension: candidates.some(function (item) {
      return item.licenseClass === "一等" &&
        item.suspensionCourse === "あり";
    })
  };
  var scheduleResult = trainingSessionNormalizeSchedule_(
    input.schedule,
    requirements
  );
  errors = errors.concat(scheduleResult.errors);
  warnings = warnings.concat(scheduleResult.warnings);

  var targets = candidates.map(function (candidate) {
    var applicable = trainingSessionApplicablePrefixes_(
      candidate.licenseClass,
      candidate.suspensionCourse
    );
    var needsUpdate = false;
    applicable.forEach(function (prefix) {
      var desired = trainingSessionDesiredValues_(
        sessionDate,
        scheduleResult.byPrefix[prefix]
      );
      var existing = trainingSessionExistingValues_(candidate.row.payload, prefix);
      Object.keys(desired).forEach(function (suffix) {
        if (!existing[suffix]) {
          needsUpdate = true;
          return;
        }
        if (existing[suffix] !== desired[suffix]) {
          conflicts.push(
            candidate.targetName + "：" +
            trainingSessionModuleLabel_(prefix) + "の" +
            trainingSessionFieldLabel_(suffix) +
            "に異なる保存値があります。"
          );
        }
      });
    });
    return {
      recordId: candidate.recordId,
      targetName: candidate.targetName,
      personId: candidate.personId,
      licenseClass: candidate.licenseClass,
      suspensionCourse: candidate.suspensionCourse,
      version: candidate.version,
      status: needsUpdate ? "反映対象" : "同じ内容を保存済み",
      needsUpdate: needsUpdate
    };
  });

  trainingSessionOverlapErrors_(
    candidates,
    scheduleResult.byPrefix
  ).forEach(function (message) {
    if (errors.indexOf(message) < 0) errors.push(message);
  });

  var ready = Boolean(
    sessionDate &&
    candidates.length &&
    !errors.length &&
    !blockers.length &&
    !conflicts.length
  );
  var previewToken = ready ? storeSha256_(storeStableStringify_({
    version: TRAINING_SESSION_VERSION,
    sessionDate: sessionDate,
    schedule: scheduleResult.schedule,
    targets: candidates.map(function (candidate) {
      return {
        recordId: candidate.recordId,
        version: candidate.version,
        payloadHash: candidate.payloadHash
      };
    })
  })) : "";
  return {
    success: true,
    ready: ready,
    version: TRAINING_SESSION_VERSION,
    sessionDate: sessionDate,
    targetCount: targets.length,
    updateCount: targets.filter(function (target) {
      return target.needsUpdate;
    }).length,
    unchangedCount: targets.filter(function (target) {
      return !target.needsUpdate;
    }).length,
    requirements: requirements,
    schedule: scheduleResult.schedule,
    targets: targets,
    errors: trainingSessionUnique_(errors),
    warnings: trainingSessionUnique_(warnings),
    blockers: trainingSessionUnique_(blockers),
    conflicts: trainingSessionUnique_(conflicts),
    previewToken: previewToken
  };
}

function trainingSessionNormalizeSchedule_(inputRows, requirements) {
  var errors = [];
  var warnings = [];
  var byPrefix = {};
  var seen = {};
  var submitted = Array.isArray(inputRows) ? inputRows : [];
  submitted.forEach(function (row) {
    var prefix = trainingSessionText_(row && row.prefix);
    var module = trainingSessionModule_(prefix);
    if (!module) {
      if (prefix) errors.push("未対応の講習項目が含まれています。");
      return;
    }
    if (seen[prefix]) {
      errors.push(module.label + "が重複しています。");
      return;
    }
    seen[prefix] = true;
    var start = trainingSessionText_(row.start);
    var end = trainingSessionText_(row.end);
    var instructor = trainingSessionText_(row.instructor);
    var filled = [start, end, instructor].filter(Boolean).length;
    if (!filled) return;
    if (filled !== 3) {
      errors.push(module.label + "の開始・終了・担当者をすべて入力してください。");
      return;
    }
    if (!trainingSessionValidTime_(start) ||
        !trainingSessionValidTime_(end)) {
      errors.push(module.label + "の時刻形式が正しくありません。");
      return;
    }
    if (start >= end) {
      errors.push(module.label + "の終了時刻は開始時刻より後にしてください。");
      return;
    }
    if (instructor.length > 100 ||
        /[\r\n\t]/.test(instructor) ||
        /^[=+\-@]/.test(instructor)) {
      errors.push(module.label + "の担当者名の形式が正しくありません。");
      return;
    }
    byPrefix[prefix] = {
      prefix: prefix,
      start: start,
      end: end,
      instructor: instructor,
      minutes: trainingSessionMinutes_(start, end)
    };
  });

  TRAINING_SESSION_MODULES.forEach(function (module) {
    var required = requirements && requirements[module.scope] === true;
    if (required && !byPrefix[module.prefix]) {
      errors.push(module.label + "の開始・終了・担当者が必要です。");
    } else if (!required && byPrefix[module.prefix]) {
      warnings.push(module.label + "は該当する受講者がいないため反映しません。");
    }
  });

  var commonFive = [
    "academicOverview", "academicRules", "academicLawUpdate",
    "academicAccident", "academicSafety"
  ];
  if (commonFive.every(function (prefix) { return !!byPrefix[prefix]; })) {
    var commonMinutes = commonFive.reduce(function (sum, prefix) {
      return sum + byPrefix[prefix].minutes;
    }, 0);
    if (commonMinutes < 30) {
      errors.push("学科の共通5項目は合計30分以上必要です。");
    }
  }
  trainingSessionMinimum_(
    byPrefix, "academicVideo", 20, "学科の共通動画", errors
  );
  if (requirements && requirements.firstClass) {
    trainingSessionMinimum_(
      byPrefix, "academicFirstClass", 15,
      "一等操縦士の留意事項", errors
    );
    trainingSessionMinimum_(
      byPrefix, "academicFirstClassVideo", 10,
      "一等用動画", errors
    );
  }
  if (requirements && requirements.suspension) {
    trainingSessionMinimum_(
      byPrefix, "practicalExercise1", 5,
      "実地の操縦演習", errors
    );
    trainingSessionMinimum_(
      byPrefix, "practicalDiscussion",
      requirements.firstClassSuspension ? 10 : 5,
      "実地の指導・質疑応答", errors
    );
  }

  var schedule = TRAINING_SESSION_MODULES
    .filter(function (module) {
      return !!byPrefix[module.prefix] &&
        requirements && requirements[module.scope] === true;
    })
    .map(function (module) {
      return {
        prefix: module.prefix,
        start: byPrefix[module.prefix].start,
        end: byPrefix[module.prefix].end,
        instructor: byPrefix[module.prefix].instructor
      };
    });
  return {
    schedule: schedule,
    byPrefix: byPrefix,
    errors: trainingSessionUnique_(errors),
    warnings: trainingSessionUnique_(warnings)
  };
}

function trainingSessionOverlapErrors_(candidates, byPrefix) {
  var errors = [];
  (candidates || []).forEach(function (candidate) {
    var ranges = trainingSessionApplicablePrefixes_(
      candidate.licenseClass,
      candidate.suspensionCourse
    ).map(function (prefix) {
      var row = byPrefix[prefix];
      return row ? {
        prefix: prefix,
        start: trainingSessionTimeNumber_(row.start),
        end: trainingSessionTimeNumber_(row.end)
      } : null;
    }).filter(Boolean).sort(function (left, right) {
      return left.start - right.start || left.end - right.end;
    });
    for (var i = 1; i < ranges.length; i += 1) {
      if (ranges[i].start < ranges[i - 1].end) {
        errors.push(
          trainingSessionModuleLabel_(ranges[i - 1].prefix) + "と" +
          trainingSessionModuleLabel_(ranges[i].prefix) +
          "の時間が重複しています。"
        );
      }
    }
  });
  return trainingSessionUnique_(errors);
}

function trainingSessionApplyScheduleToPayload_(
  payload, sessionDate, schedule, licenseClass, suspensionCourse
) {
  var next = JSON.parse(storeStableStringify_(payload || {}));
  var applicable = trainingSessionApplicablePrefixes_(
    licenseClass,
    suspensionCourse
  );
  (schedule || []).forEach(function (row) {
    var prefix = row.prefix;
    if (applicable.indexOf(prefix) < 0) return;
    next[prefix + "Date"] = sessionDate;
    next[prefix + "Start"] = row.start;
    next[prefix + "End"] = row.end;
    next[prefix + "Instructor"] = row.instructor;
  });
  return next;
}

function trainingSessionApplicablePrefixes_(licenseClass, suspensionCourse) {
  return TRAINING_SESSION_MODULES.filter(function (module) {
    return module.scope === "common" ||
      (module.scope === "firstClass" && licenseClass === "一等") ||
      (module.scope === "suspension" && suspensionCourse === "あり");
  }).map(function (module) { return module.prefix; });
}

function trainingSessionDesiredValues_(sessionDate, scheduleRow) {
  if (!scheduleRow) return {};
  return {
    Date: sessionDate,
    Start: scheduleRow.start,
    End: scheduleRow.end,
    Instructor: scheduleRow.instructor
  };
}

function trainingSessionExistingValues_(payload, prefix) {
  payload = payload || {};
  return {
    Date: trainingSessionText_(payload[prefix + "Date"]),
    Start: trainingSessionText_(payload[prefix + "Start"]),
    End: trainingSessionText_(payload[prefix + "End"]),
    Instructor: trainingSessionText_(payload[prefix + "Instructor"])
  };
}

function trainingSessionMinimum_(byPrefix, prefix, minimum, label, errors) {
  if (byPrefix[prefix] && byPrefix[prefix].minutes < minimum) {
    errors.push(label + "は" + minimum + "分以上必要です。");
  }
}

function trainingSessionDate_(value, errors) {
  var text = trainingSessionText_(value);
  if (!text) {
    errors.push("講習修了日を入力してください。");
    return "";
  }
  var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) {
    errors.push("講習修了日の形式が正しくありません。");
    return "";
  }
  var year = Number(match[1]);
  var month = Number(match[2]);
  var day = Number(match[3]);
  var check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year ||
      check.getUTCMonth() + 1 !== month ||
      check.getUTCDate() !== day) {
    errors.push("実在する講習修了日を入力してください。");
    return "";
  }
  return text;
}

function trainingSessionValidTime_(value) {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(value || ""));
}

function trainingSessionMinutes_(start, end) {
  return trainingSessionTimeNumber_(end) - trainingSessionTimeNumber_(start);
}

function trainingSessionTimeNumber_(value) {
  var parts = String(value || "").split(":");
  return Number(parts[0] || 0) * 60 + Number(parts[1] || 0);
}

function trainingSessionModule_(prefix) {
  return TRAINING_SESSION_MODULES.filter(function (module) {
    return module.prefix === prefix;
  })[0] || null;
}

function trainingSessionModuleLabel_(prefix) {
  var module = trainingSessionModule_(prefix);
  return module ? module.label : String(prefix || "");
}

function trainingSessionFieldLabel_(suffix) {
  return {
    Date: "受講日",
    Start: "開始時刻",
    End: "終了時刻",
    Instructor: "担当者"
  }[suffix] || suffix;
}

function trainingSessionToday_() {
  var zone = Session.getScriptTimeZone() || "Asia/Tokyo";
  return Utilities.formatDate(new Date(), zone, "yyyy-MM-dd");
}

function trainingSessionText_(value) {
  return String(value === undefined || value === null ? "" : value)
    .normalize("NFKC").trim();
}

function trainingSessionUnique_(items) {
  var seen = {};
  return (items || []).filter(function (item) {
    var key = String(item || "");
    if (!key || seen[key]) return false;
    seen[key] = true;
    return true;
  });
}

function trainingSessionFirstBlockingMessage_(preview) {
  var messages = []
    .concat(preview && preview.errors || [])
    .concat(preview && preview.blockers || [])
    .concat(preview && preview.conflicts || []);
  return messages[0] ||
    "一括入力の作成前検査に合格していません。再度内容を確認してください。";
}
