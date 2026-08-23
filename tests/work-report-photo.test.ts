import { describe, expect, it } from "vitest";

import {
  MAX_WORK_REPORT_PHOTO_BYTES,
  estimateBase64Bytes,
  photoUploadAlert,
  resizeActionForDimensions,
  workReportPhotoDisplayUrl,
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

  it("resolves only internal photo paths against the native API origin", () => {
    expect(workReportPhotoDisplayUrl("/manus-storage/work-reports/1/before_a1.jpg"))
      .toBe("https://xn--h50b270bp0ceuddugnobx2m.kr/manus-storage/work-reports/1/before_a1.jpg");
    expect(workReportPhotoDisplayUrl(
      "https://xn--h50b270bp0ceuddugnobx2m.kr/manus-storage/work-reports/1/after_b2.jpg",
    )).toBe("https://xn--h50b270bp0ceuddugnobx2m.kr/manus-storage/work-reports/1/after_b2.jpg");
    expect(workReportPhotoDisplayUrl("https://attacker.example/photo.jpg")).toBeNull();
    expect(workReportPhotoDisplayUrl("/manus-storage/../secret")).toBeNull();
  });

  it("accepts only the exact short-lived signed work-report proxy contract", () => {
    const exp = Math.floor(Date.now() / 1000) + 15 * 60;
    const version = "v".repeat(43);
    const signature = "s".repeat(43);
    const query = `exp=${exp}&v=${version}&tid=21&viewer=165&sig=${signature}`;
    expect(workReportPhotoDisplayUrl(
      `https://퓨처에너지테크.kr/api/work-report-photo/14/before?${query}`,
    )).toBe(
      `https://xn--h50b270bp0ceuddugnobx2m.kr/api/work-report-photo/14/before?${query}`,
    );
    expect(workReportPhotoDisplayUrl(
      `/api/work-report-photo/14/after?${query}&extra=1`,
    )).toBeNull();
    expect(workReportPhotoDisplayUrl(
      `/api/work-report-photo/14/after?exp=${exp}&v=${version}&tid=21&viewer=165&sig=bad`,
    )).toBeNull();
    expect(workReportPhotoDisplayUrl(
      `https://attacker.example/api/work-report-photo/14/before?${query}`,
    )).toBeNull();
  });
});
