const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("SourceImport.js", "utf8");
new Function(source);

function extractFunction(name) {
  const start = source.indexOf("function " + name + "(");
  assert(start >= 0, name + " not found");
  const brace = source.indexOf("{", start);
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let i = brace; i < source.length; i += 1) {
    const char = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(name + " end not found");
}

const context = {
  Utilities: {
    formatDate(date) {
      return [
        date.getUTCFullYear(),
        String(date.getUTCMonth() + 1).padStart(2, "0"),
        String(date.getUTCDate()).padStart(2, "0")
      ].join("-");
    }
  }
};
vm.createContext(context);
[
  "sourceText_", "sourcePad_", "sourceValidIsoDate_", "sourceIsoDate_",
  "sourceBooleanStatus_", "sourceCompositeHeaders_", "sourceRowIsBlank_",
  "sourceRequireCapability_"
].forEach((name) => vm.runInContext(extractFunction(name), context));

assert.deepEqual(
  Array.from(context.sourceCompositeHeaders_(
    ["番号", "氏名", "メールアドレス", "有効期限", "講習実施可能期間", "", "六ヶ月前", "", "三ヶ月前", "", "案内文送付①", "案内文送付②", "講習", "", "金額", "備考"],
    ["", "", "", "", "講習実施可能日", "講習締切日", "日付", "案内送付", "日付", "案内送付", "", "", "講習日", "会場", "", ""]
  )),
  [
    "番号", "氏名", "メールアドレス", "有効期限",
    "講習実施可能期間|講習実施可能日", "講習実施可能期間|講習締切日",
    "六ヶ月前|日付", "六ヶ月前|案内送付",
    "三ヶ月前|日付", "三ヶ月前|案内送付",
    "案内文送付①", "案内文送付②", "講習|講習日", "講習|会場", "金額", "備考"
  ]
);
assert.equal(context.sourceIsoDate_("", "2026/5/30", "2026"), "2026-05-30");
assert.equal(context.sourceIsoDate_("", "5月24日 18時～", "2026"), "2026-05-24");
assert.equal(context.sourceIsoDate_("", "2026/2/30", "2026"), "");
assert.equal(context.sourceBooleanStatus_(true, "TRUE"), "送付済");
assert.equal(context.sourceBooleanStatus_(false, "FALSE"), "未送付");
assert.equal(context.sourceRowIsBlank_(["", null, " "]), true);
assert.equal(context.sourceRowIsBlank_(["", "1"]), false);
assert.throws(
  () => context.sourceRequireCapability_("records.import"),
  /共有正本の権限機能が利用できない/
);
context.storeRequireCapability_ = (capability) => ({ email: "admin@example.com", role: "admin", capability });
assert.deepEqual(
  JSON.parse(JSON.stringify(context.sourceRequireCapability_("records.import"))),
  { email: "admin@example.com", role: "admin", capability: "records.import" }
);

console.log("source_import_logic_test: OK");
