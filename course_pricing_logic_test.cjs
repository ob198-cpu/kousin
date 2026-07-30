const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const context = {};
vm.createContext(context);
vm.runInContext(
  fs.readFileSync("CoursePricing.js", "utf8") +
    "\nthis.logic={quote:coursePricingQuote_,assertInvoice:coursePricingAssertInvoiceData_};",
  context
);
const logic = context.logic;

function quote(licenseClass, suspensionCourse, graduateDiscount) {
  return JSON.parse(JSON.stringify(logic.quote({
    serviceCategory: "更新講習",
    licenseClass,
    suspensionCourse,
    graduateDiscount
  })));
}

assert.deepEqual(quote("二等", "なし", "対象外"), {
  applies: true,
  ready: true,
  version: "CDP_RENEWAL_COURSE_PRICING_V1",
  licenseClass: "二等",
  suspensionCourse: "なし",
  graduateDiscount: "対象外",
  discountRate: 0,
  feeExTax: 12000,
  discountExTax: 0,
  netExTax: 12000,
  taxRate: 10,
  taxRounding: "切捨て",
  tax: 1200,
  feeInclTax: 13200,
  discountInclTax: 0,
  totalInclTax: 13200,
  description: "二等更新講習 13200円（税込）"
});

assert.equal(quote("一等", "なし", "対象外").totalInclTax, 16500);
assert.equal(quote("二等", "あり", "対象外").totalInclTax, 17600);
assert.equal(quote("二等", "なし", "卒業者").totalInclTax, 10560);
assert.deepEqual(
  {
    feeExTax: quote("一等", "あり", "卒業者").feeExTax,
    discountExTax: quote("一等", "あり", "卒業者").discountExTax,
    tax: quote("一等", "あり", "卒業者").tax,
    totalInclTax: quote("一等", "あり", "卒業者").totalInclTax
  },
  { feeExTax: 19000, discountExTax: 3800, tax: 1520, totalInclTax: 16720 }
);

const record = {
  serviceCategory: "更新講習",
  licenseClass: "二等",
  suspensionCourse: "あり",
  graduateDiscount: "卒業者"
};
const validInvoice = {
  pricingMode: "EXCLUSIVE",
  lines: [
    {
      lineType: "CHARGE",
      quantity: 1,
      unitAmount: 16000,
      taxCategory: "TAXABLE_10"
    },
    {
      lineType: "DISCOUNT",
      quantity: 1,
      unitAmount: 3200,
      taxCategory: "TAXABLE_10"
    }
  ]
};
assert.doesNotThrow(() => logic.assertInvoice(record, validInvoice));
assert.throws(
  () => logic.assertInvoice(record, {
    ...validInvoice,
    lines: validInvoice.lines.map((line, index) =>
      index === 0 ? { ...line, unitAmount: 15999 } : line)
  }),
  (error) => error && error.code === "COURSE_PRICE_AMOUNT_MISMATCH"
);

assert.deepEqual(
  JSON.parse(JSON.stringify(logic.quote({
    serviceCategory: "その他",
    feeExTax: 1234
  }))),
  { applies: false, ready: true }
);
assert.throws(
  () => logic.quote({
    serviceCategory: "更新講習",
    licenseClass: "未確認",
    suspensionCourse: "なし",
    graduateDiscount: "対象外"
  }),
  (error) => error && error.code === "COURSE_PRICE_LICENSE_CLASS_REQUIRED"
);

console.log("course_pricing_logic_test: OK");
