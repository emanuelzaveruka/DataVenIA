import { describe, expect, it } from "vitest";
import { isLowTextDensityPdf, parseDocument } from "../parse-document";
import { MIN_PDF_CHARS_PER_PAGE } from "../../../config/limits";

describe("isLowTextDensityPdf", () => {
  it("flags a PDF with fewer characters per page than the configured floor", () => {
    expect(isLowTextDensityPdf(50, 5)).toBe(true); // 10 chars/page
  });

  it("accepts a PDF with characters per page at or above the floor", () => {
    expect(isLowTextDensityPdf(MIN_PDF_CHARS_PER_PAGE * 5, 5)).toBe(false); // exactly the floor
    expect(isLowTextDensityPdf(5000, 5)).toBe(false); // 1000 chars/page
  });

  it("does not divide by zero for a degenerate page count", () => {
    expect(() => isLowTextDensityPdf(0, 0)).not.toThrow();
    expect(isLowTextDensityPdf(0, 0)).toBe(true);
  });
});

describe("parseDocument", () => {
  it("rejects an empty TXT file with NO_EXTRACTABLE_TEXT (regression: unrelated to the new PDF density check)", async () => {
    const result = await parseDocument(Buffer.from(""), "vazio.txt", "text/plain");
    expect(result.isError).toBe(true);
    if (result.isError) {
      expect(result.error.code).toBe("NO_EXTRACTABLE_TEXT");
    }
  });

  it("accepts a short but non-empty TXT file (density check does not apply outside PDF)", async () => {
    const result = await parseDocument(
      Buffer.from("Texto curto.", "utf-8"),
      "curto.txt",
      "text/plain",
    );
    expect(result.isError).toBe(false);
  });
});
