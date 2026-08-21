import { describe, expect, it } from "vitest";

import {
  MAX_WORK_REPORT_PHOTO_BYTES,
  estimateBase64Bytes,
  photoUploadAlert,
  resizeActionForDimensions,
} from "../lib/work-report-photo";

describe("work report photo client guard", () => {
  it("estimates decoded base64 bytes including padding", () => {
    expect(estimateBase64Bytes("TQ==")).toBe(1);
    expect(estimateBase64Bytes("TWE=")).toBe(2);
    expect(estimateBase64Bytes("TWFu")).toBe(3);
  });

  it("keeps the upload ceiling at two MiB", () => {
    expect(MAX_WORK_REPORT_PHOTO_BYTES).toBe(2 * 1024 * 1024);
  });

  it("limits the longest side for landscape and portrait photos", () => {
    expect(resizeActionForDimensions(4000, 3000, 1600)).toEqual({ resize: { width: 1600 } });
    expect(resizeActionForDimensions(1200, 8000, 1600)).toEqual({ resize: { height: 1600 } });
    expect(resizeActionForDimensions(1200, 900, 1600)).toBeNull();
  });

  it("shows a re-login action for unauthorized uploads", () => {
    expect(photoUploadAlert({ data: { code: "UNAUTHORIZED" } })).toEqual({
      title: "로그인 만료",
      message: "로그인 정보가 만료되었습니다. 다시 로그인한 뒤 사진을 올려주세요.",
    });
  });

  it("does not expose raw server errors", () => {
    const alert = photoUploadAlert(new Error("BLOB_READ_WRITE_TOKEN=secret"));
    expect(alert.title).toBe("업로드 실패");
    expect(alert.message).not.toContain("secret");
  });

  it("explains when the assigned job changed during an upload", () => {
    expect(photoUploadAlert({ data: { code: "CONFLICT" } })).toEqual({
      title: "접수 정보 변경",
      message: "담당 기사 또는 접수 상태가 변경되었습니다. 목록을 새로고침한 뒤 다시 확인해 주세요.",
    });
  });
});
