import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../app/tech-estimate.tsx", import.meta.url), "utf8");

assert.match(source, /qtyButton: \{ width: 48, height: 48, minWidth: 48, minHeight: 48/, "± buttons must preserve at least 48×48pt touch targets");
assert.match(source, /qtyInput: \{ width: 64, minWidth: 60, height: 48, minHeight: 48/, "quantity input must be at least 60pt wide and 48pt high");
assert.match(source, /fontSize: 18, lineHeight: 30, fontWeight: "800", paddingHorizontal: 4, paddingVertical: 0, includeFontPadding: false, textAlign: "center", textAlignVertical: "center"/, "quantity input must use an 18pt bold numeral with Android vertical-centering safeguards");
assert.match(source, /qtyText: \{ color: "#374151", fontSize: 22, lineHeight: 32, fontWeight: "900", includeFontPadding: false, textAlign: "center", textAlignVertical: "center" \}/, "± glyphs must remain centered at the enlarged size");
assert.match(source, /maxFontSizeMultiplier=\{1\.3\}/, "quantity controls must reserve bounded space for enlarged system text");
assert.match(source, /setLines\(setLineQuantity\(lines, lineId, requestedQty\)\)/, "quantity UI change must preserve the engine quantity update route");
assert.match(source, /saveDraftForCurrentTechEstimateScope\(/, "quantity UI change must preserve scoped draft saving");

console.log("PASS tech-estimate quantity controls are 48pt+, centered, readable at bounded enlarged text, and retain quantity/draft routes");
