// 更新講習の定額料金。正式会計・見積・案内で共通利用する。

var COURSE_PRICING_RULES = {
  version: "CDP_RENEWAL_COURSE_PRICING_V1",
  serviceCategory: "更新講習",
  taxRate: 10,
  taxRounding: "切捨て",
  graduateDiscountRate: 20,
  graduateDiscountValue: "卒業者",
  noDiscountValue: "対象外",
  classFees: {
    "一等": { exTax: 15000, tax: 1500, inclTax: 16500 },
    "二等": { exTax: 12000, tax: 1200, inclTax: 13200 }
  },
  suspensionFee: { exTax: 4000, tax: 400, inclTax: 4400 }
};

function coursePricingPublic_() {
  return JSON.parse(JSON.stringify(COURSE_PRICING_RULES));
}

function coursePricingText_(value) {
  return String(value === undefined || value === null ? "" : value)
    .normalize("NFKC").trim();
}

function coursePricingFail_(code, message) {
  var error = new Error(message);
  error.code = code;
  throw error;
}

function coursePricingApplies_(record) {
  var category = coursePricingText_((record || {}).serviceCategory) ||
    COURSE_PRICING_RULES.serviceCategory;
  return category === COURSE_PRICING_RULES.serviceCategory;
}

/**
 * 指定された税込定額を、正式会計が保持する税抜明細へ変換する。
 * 卒業者割引は資格停止処分加算を含む講習料金全体へ適用する。
 */
function coursePricingQuote_(record) {
  record = record || {};
  if (!coursePricingApplies_(record)) {
    return { applies: false, ready: true };
  }
  var licenseClass = coursePricingText_(record.licenseClass);
  var classFee = COURSE_PRICING_RULES.classFees[licenseClass];
  if (!classFee) {
    coursePricingFail_(
      "COURSE_PRICE_LICENSE_CLASS_REQUIRED",
      "更新講習料金の計算には、資格区分を一等または二等に確定してください。"
    );
  }
  var suspensionCourse = coursePricingText_(record.suspensionCourse);
  if (["なし", "あり"].indexOf(suspensionCourse) < 0) {
    coursePricingFail_(
      "COURSE_PRICE_SUSPENSION_STATUS_REQUIRED",
      "更新講習料金の計算には、資格停止処分者向け講習の要否を「なし」または「あり」に確定してください。"
    );
  }
  var graduateDiscount = coursePricingText_(record.graduateDiscount) ||
    COURSE_PRICING_RULES.noDiscountValue;
  if ([
    COURSE_PRICING_RULES.noDiscountValue,
    COURSE_PRICING_RULES.graduateDiscountValue
  ].indexOf(graduateDiscount) < 0) {
    coursePricingFail_(
      "COURSE_PRICE_GRADUATE_STATUS_INVALID",
      "卒業者割引は「対象外」または「卒業者」を選択してください。"
    );
  }

  var suspensionFee = suspensionCourse === "あり" ?
    COURSE_PRICING_RULES.suspensionFee : { exTax: 0, tax: 0, inclTax: 0 };
  var feeExTax = classFee.exTax + suspensionFee.exTax;
  var feeInclTax = classFee.inclTax + suspensionFee.inclTax;
  var discountRate = graduateDiscount === COURSE_PRICING_RULES.graduateDiscountValue ?
    COURSE_PRICING_RULES.graduateDiscountRate : 0;
  var discountExTax = Math.floor(feeExTax * discountRate / 100);
  var discountInclTax = Math.floor(feeInclTax * discountRate / 100);
  var netExTax = feeExTax - discountExTax;
  var tax = Math.floor(netExTax * COURSE_PRICING_RULES.taxRate / 100);
  var totalInclTax = netExTax + tax;
  if (totalInclTax !== feeInclTax - discountInclTax) {
    coursePricingFail_(
      "COURSE_PRICE_TAX_MISMATCH",
      "講習料金の税込・税抜換算が一致しないため処理を停止しました。"
    );
  }
  var components = [
    licenseClass + "更新講習 " + classFee.inclTax + "円（税込）"
  ];
  if (suspensionCourse === "あり") {
    components.push(
      "資格停止処分者向け講習 " +
      COURSE_PRICING_RULES.suspensionFee.inclTax + "円（税込）"
    );
  }
  if (discountRate) {
    components.push("CDP卒業者割引 " + discountRate + "%");
  }
  return {
    applies: true,
    ready: true,
    version: COURSE_PRICING_RULES.version,
    licenseClass: licenseClass,
    suspensionCourse: suspensionCourse,
    graduateDiscount: graduateDiscount,
    discountRate: discountRate,
    feeExTax: feeExTax,
    discountExTax: discountExTax,
    netExTax: netExTax,
    taxRate: COURSE_PRICING_RULES.taxRate,
    taxRounding: COURSE_PRICING_RULES.taxRounding,
    tax: tax,
    feeInclTax: feeInclTax,
    discountInclTax: discountInclTax,
    totalInclTax: totalInclTax,
    description: components.join("／")
  };
}

function coursePricingAssertInvoiceData_(record, invoiceData) {
  var quote = coursePricingQuote_(record);
  if (!quote.applies) return quote;
  invoiceData = invoiceData || {};
  if (coursePricingText_(invoiceData.pricingMode) !== "EXCLUSIVE") {
    coursePricingFail_(
      "COURSE_PRICE_MODE_MISMATCH",
      "更新講習の正式請求は税抜明細方式で作成してください。"
    );
  }
  var lines = Array.isArray(invoiceData.lines) ? invoiceData.lines : [];
  var charge = 0;
  var discount = 0;
  var chargeCount = 0;
  var discountCount = 0;
  lines.forEach(function (line) {
    var quantity = Number(line && line.quantity);
    var unitAmount = Number(line && line.unitAmount);
    if (!Number.isSafeInteger(quantity) || quantity !== 1 ||
        !Number.isSafeInteger(unitAmount) || unitAmount < 0 ||
        coursePricingText_(line.taxCategory) !== "TAXABLE_10") {
      coursePricingFail_(
        "COURSE_PRICE_LINE_INVALID",
        "更新講習の請求明細は数量1・課税10%・整数円で作成してください。"
      );
    }
    if (coursePricingText_(line.lineType) === "CHARGE") {
      charge += unitAmount;
      chargeCount += 1;
    } else if (coursePricingText_(line.lineType) === "DISCOUNT") {
      discount += unitAmount;
      discountCount += 1;
    } else {
      coursePricingFail_(
        "COURSE_PRICE_LINE_TYPE_INVALID",
        "更新講習の請求明細区分が定額料金と一致しません。"
      );
    }
  });
  var expectedLineCount = quote.discountExTax > 0 ? 2 : 1;
  if (lines.length !== expectedLineCount || chargeCount !== 1 ||
      discountCount !== (quote.discountExTax > 0 ? 1 : 0) ||
      charge !== quote.feeExTax || discount !== quote.discountExTax) {
    coursePricingFail_(
      "COURSE_PRICE_AMOUNT_MISMATCH",
      "更新講習の請求額が定額料金と一致しません。資格区分・資格停止処分・卒業者割引を再確認してください。"
    );
  }
  return quote;
}

