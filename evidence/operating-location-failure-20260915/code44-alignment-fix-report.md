# code 44 APK 16KB alignment 보완

## code 43 실제 설치 차단

Codex의 Android Build Tools 36.0.0 검사와 동일하게 code 43 공식 release asset을 `zipalign -c -P 16 -v 4`로 재검증했다. `resources.arsc`와 uncompressed native libraries가 4KB/16KB alignment를 통과하지 못했으며, v2/v3 signer 검증은 통과했다. 따라서 문제는 signer identity가 아니라 최종 APK packaging alignment였다.

## code 44 제작 순서

`scripts/repack-operating-code44-aligned.mjs`는 Build Tools 36.0.0을 사용해 다음 순서를 강제한다.

1. production API와 code 44 metadata로 Expo Repack을 수행한다.
2. `zipalign -f -P 16 -v 4`로 native libraries와 resources를 16KB 기준으로 정렬한다.
3. 기존 EAS Android keystore로 aligned APK에 최종 서명한다.
4. 최종 파일에 `zipalign -c -P 16 -v 4`와 `apksigner verify --verbose --print-certs`를 실행한다.

정렬은 v2/v3 signature를 변경하므로 마지막 signer 검증 통과는 alignment가 final signing 이전에 수행됐다는 증거다. 기존 keystore의 임시 사본은 정렬·서명 후 삭제했고 source·checkpoint·release에는 포함하지 않았다.

## 최종 artifact

| 항목 | 결과 |
|---|---|
| package | `com.futureenergy.heatingcare` |
| versionName / versionCode | `1.1.44` / `44` |
| APK SHA-256 | `480f821c6086c7756a4f4e759487b0f138d18fdae17c73269459f9e740e4a083` |
| 16KB alignment | Build Tools 36.0.0 `zipalign -c -P 16 -v 4`: `Verification successful` |
| signer | v2/v3 verified; certificate SHA-256 `7556ed5104e3419b6ce3e4e54f944ca615d37802e5ccf21ba8581779f2f62788` |
| location fix | foreground/background/stop 공통 Bearer header regression: unit 3 PASS, contract PASS |
| operating API boundary | production Expo config 및 bundle scan에서 review mode/preview alias 없음 |

Android 실기기에서 code 44가 code 43 위에 실제 업데이트 설치되는지, 위치 좌표가 저장되는지, 고객 링크와 마지막 전송 시각이 갱신되는지는 아직 미확인이다. 이 파일은 release metadata 전환 전 source/build 증빙이다.
