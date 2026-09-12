import { describe, expect, it } from "vitest";
import { validateFile } from "../validate-file";
import { MAX_UPLOAD_FILE_SIZE_BYTES } from "../../../config/limits";

const PDF_MAGIC_BYTES = Buffer.from("%PDF-1.4\n%%EOF");
const EXE_MAGIC_BYTES = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);

describe("validateFile", () => {
  it("accepts a file whose real signature is PDF and whose extension matches", async () => {
    const result = await validateFile(PDF_MAGIC_BYTES, "peticao.pdf");
    expect(result.isError).toBe(false);
    if (!result.isError) {
      expect(result.data.mimeType).toBe("application/pdf");
    }
  });

  it("accepts plain text without magic bytes when the extension is .txt", async () => {
    const result = await validateFile(Buffer.from("Texto simples em português.", "utf-8"), "peticao.txt");
    expect(result.isError).toBe(false);
    if (!result.isError) {
      expect(result.data.mimeType).toBe("text/plain");
    }
  });

  it("rejects an executable renamed to .pdf by checking the real file signature, not the extension", async () => {
    const result = await validateFile(EXE_MAGIC_BYTES, "documento.pdf");
    expect(result.isError).toBe(true);
    if (result.isError) {
      expect(result.error.category).toBe("VALIDATION");
      expect(result.error.isRetryable).toBe(false);
    }
  });

  it("rejects when the real signature is PDF but the extension claims a different type", async () => {
    const result = await validateFile(PDF_MAGIC_BYTES, "documento.docx");
    expect(result.isError).toBe(true);
    if (result.isError) {
      expect(result.error.code).toBe("FILE_SIGNATURE_MISMATCH");
    }
  });

  it("rejects an empty file", async () => {
    const result = await validateFile(Buffer.alloc(0), "vazio.pdf");
    expect(result.isError).toBe(true);
    if (result.isError) {
      expect(result.error.code).toBe("EMPTY_FILE");
    }
  });

  it("rejects a file larger than the configured limit", async () => {
    const oversized = Buffer.concat([PDF_MAGIC_BYTES, Buffer.alloc(MAX_UPLOAD_FILE_SIZE_BYTES)]);
    const result = await validateFile(oversized, "grande.pdf");
    expect(result.isError).toBe(true);
    if (result.isError) {
      expect(result.error.code).toBe("FILE_TOO_LARGE");
    }
  });
});
