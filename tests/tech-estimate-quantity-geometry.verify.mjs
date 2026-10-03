import assert from "node:assert/strict";

const inputWidth = 64;
const horizontalPadding = 4 * 2;
const maxScale = 1.3;
const inputFontSize = 18;
const inputLineHeight = 30;
const controlHeight = 48;
const glyphFontSize = 22;
const glyphLineHeight = 32;
const candidateValues = ["1", "2", "3", "7", "10"];

// A full-em advance per glyph intentionally overestimates the system digit width.
// If this bound fits, the requested values fit without depending on a specific font file.
const usableInputWidth = inputWidth - horizontalPadding;
for (const value of candidateValues) {
  const worstCaseTextWidth = value.length * inputFontSize * maxScale;
  assert.ok(worstCaseTextWidth <= usableInputWidth, `${value} must fit inside the 64pt quantity input at 130% text scale`);
}
assert.ok(inputFontSize * maxScale <= inputLineHeight, "input line-height must contain 130% scaled 18pt numerals");
assert.ok(inputLineHeight <= controlHeight, "input line-height must stay inside its 48pt control");
assert.ok(glyphFontSize * maxScale <= glyphLineHeight, "± line-height must contain 130% scaled glyphs");
assert.ok(glyphLineHeight <= controlHeight, "± line-height must stay inside its 48pt touch target");

console.log(`PASS quantity geometry: values ${candidateValues.join(", ")} fit at ${maxScale * 100}% scale; input=${inputWidth}×${controlHeight}, buttons=${controlHeight}×${controlHeight}`);
