"use strict";

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const vm = require("vm");

const source = fs.readFileSync("TrainingSession.js", "utf8");
const context = {
  console,
  Date,
  JSON,
  Number,
  String,
  Boolean,
  Object,
  Array,
  Math,
  RegExp,
  storeStableStringify_(value) {
    function normalize(item) {
      if (item === null || typeof item !== "object") return item;
      if (Array.isArray(item)) return item.map(normalize);
      return Object.keys(item).sort().reduce((result, key) => {
        result[key] = normalize(item[key]);
        return result;
      }, {});
    }
    return JSON.stringify(normalize(value));
  },
  storeSha256_(value) {
    return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
  },
  storeFail_(code, message) {
    const error = new Error(message);
    error.code = code;
    throw error;
  }
};
vm.createContext(context);
vm.runInContext(source, context);

const schedule = [
  ["academicOverview", "09:00", "09:06", "講師A"],
  ["academicRules", "09:06", "09:12", "講師A"],
  ["academicLawUpdate", "09:12", "09:18", "講師A"],
  ["academicAccident", "09:18", "09:24", "講師A"],
  ["academicSafety", "09:24", "09:30", "講師A"],
  ["academicVideo", "09:30", "09:50", "講師A"],
  ["academicFirstClass", "09:50", "10:05", "講師A"],
  ["academicFirstClassVideo", "10:05", "10:15", "講師A"],
  ["practicalExercise1", "10:15", "10:20", "講師B"],
  ["practicalDiscussion", "10:20", "10:25", "講師B"]
].map(([prefix, start, end, instructor]) => ({
  prefix, start, end, instructor
}));

function row(id, payload, overrides) {
  return Object.assign({
    recordId: id,
    version: 1,
    payloadHash: crypto.createHash("sha256")
      .update(JSON.stringify(payload))
      .digest("hex"),
    deleted: false,
    payload
  }, overrides || {});
}

const rows = [
  row("r_first", {
    id: "r_first",
    personId: "P-001",
    targetName: "一等受講者",
    courseProvider: "CDP",
    courseDate: "2026-07-15",
    licenseClass: "一等",
    suspensionCourse: "なし"
  }),
  row("r_second", {
    id: "r_second",
    personId: "P-002",
    targetName: "二等停止処分者",
    courseProvider: "CDP",
    courseDate: "2026-07-15",
    licenseClass: "二等",
    suspensionCourse: "あり"
  }),
  row("r_other_date", {
    id: "r_other_date",
    personId: "P-003",
    targetName: "別日",
    courseProvider: "CDP",
    courseDate: "2026-07-16",
    licenseClass: "二等",
    suspensionCourse: "なし"
  }),
  row("r_other_provider", {
    id: "r_other_provider",
    personId: "P-004",
    targetName: "他機関",
    courseProvider: "他機関",
    courseDate: "2026-07-15",
    licenseClass: "二等",
    suspensionCourse: "なし"
  }),
  row("r_deleted", {
    id: "r_deleted",
    personId: "P-005",
    targetName: "無効",
    courseProvider: "CDP",
    courseDate: "2026-07-15",
    licenseClass: "二等",
    suspensionCourse: "なし"
  }, { deleted: true })
];

const preview = context.trainingSessionBuildPreviewFromRows_(
  rows,
  { sessionDate: "2026-07-15", schedule },
  "2026-07-30"
);
assert.strictEqual(preview.ready, true);
assert.strictEqual(preview.targetCount, 2);
assert.strictEqual(preview.updateCount, 2);
assert.strictEqual(preview.requirements.firstClass, true);
assert.strictEqual(preview.requirements.suspension, true);
assert.strictEqual(preview.requirements.firstClassSuspension, false);
assert.match(preview.previewToken, /^[a-f0-9]{64}$/);

const firstPatched = context.trainingSessionApplyScheduleToPayload_(
  rows[0].payload,
  preview.sessionDate,
  preview.schedule,
  "一等",
  "なし"
);
assert.strictEqual(firstPatched.academicOverviewDate, "2026-07-15");
assert.strictEqual(firstPatched.academicFirstClassStart, "09:50");
assert.strictEqual(firstPatched.practicalExercise1Start, undefined);
assert.strictEqual(firstPatched.personId, "P-001");

const secondPatched = context.trainingSessionApplyScheduleToPayload_(
  rows[1].payload,
  preview.sessionDate,
  preview.schedule,
  "二等",
  "あり"
);
assert.strictEqual(secondPatched.academicFirstClassStart, undefined);
assert.strictEqual(secondPatched.practicalExercise1Start, "10:15");
assert.strictEqual(secondPatched.practicalDiscussionEnd, "10:25");

const appliedRows = [
  row("r_first", firstPatched),
  row("r_second", secondPatched)
];
const identical = context.trainingSessionBuildPreviewFromRows_(
  appliedRows,
  { sessionDate: "2026-07-15", schedule },
  "2026-07-30"
);
assert.strictEqual(identical.ready, true);
assert.strictEqual(identical.updateCount, 0);
assert.strictEqual(identical.unchangedCount, 2);

const conflictingPayload = Object.assign({}, firstPatched, {
  academicOverviewStart: "08:59"
});
const conflicting = context.trainingSessionBuildPreviewFromRows_(
  [row("r_first", conflictingPayload), rows[1]],
  { sessionDate: "2026-07-15", schedule },
  "2026-07-30"
);
assert.strictEqual(conflicting.ready, false);
assert(conflicting.conflicts.some((message) =>
  message.includes("一等受講者") && message.includes("開始時刻")
));

const invalidClass = context.trainingSessionBuildPreviewFromRows_(
  [row("r_invalid", {
    id: "r_invalid",
    personId: "P-006",
    targetName: "区分未確認",
    courseProvider: "CDP",
    courseDate: "2026-07-15",
    licenseClass: "未確認",
    suspensionCourse: "なし"
  })],
  { sessionDate: "2026-07-15", schedule },
  "2026-07-30"
);
assert.strictEqual(invalidClass.ready, false);
assert(invalidClass.blockers.some((message) => message.includes("資格区分")));

const future = context.trainingSessionBuildPreviewFromRows_(
  rows,
  { sessionDate: "2026-08-01", schedule },
  "2026-07-30"
);
assert.strictEqual(future.ready, false);
assert(future.errors.some((message) => message.includes("実施前")));

const staleRows = rows.map((item) => Object.assign({}, item));
staleRows[0] = Object.assign({}, staleRows[0], {
  version: 2,
  payloadHash: "b".repeat(64)
});
const changedToken = context.trainingSessionBuildPreviewFromRows_(
  staleRows,
  { sessionDate: "2026-07-15", schedule },
  "2026-07-30"
);
assert.notStrictEqual(changedToken.previewToken, preview.previewToken);

const shortSchedule = schedule.map((item) => Object.assign({}, item));
shortSchedule.find((item) => item.prefix === "academicVideo").end = "09:40";
const tooShort = context.trainingSessionBuildPreviewFromRows_(
  rows,
  { sessionDate: "2026-07-15", schedule: shortSchedule },
  "2026-07-30"
);
assert.strictEqual(tooShort.ready, false);
assert(tooShort.errors.some((message) => message.includes("共通動画は20分以上")));

const indexSource = fs.readFileSync("Index.html", "utf8");
const codeSource = fs.readFileSync("Code.js", "utf8");
assert(indexSource.includes('id="previewTrainingSessionBatch"'));
assert(indexSource.includes('id="applyTrainingSessionBatch"'));
assert(indexSource.includes("async function previewTrainingSessionBatch()"));
assert(indexSource.includes("async function applyTrainingSessionBatch()"));
assert(codeSource.includes("function apiPreviewTrainingSession(input)"));
assert(codeSource.includes("function apiApplyTrainingSession(input)"));

console.log("training session logic tests passed");
