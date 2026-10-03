# Android 기기 제어·녹화 공식 근거

Android Developers는 `adb`가 개발 컴퓨터의 client, 기기의 `adbd`, 개발 컴퓨터의 server로 구성되며, USB 연결 기기는 개발자 옵션에서 USB debugging을 켠 뒤 `adb devices -l`에 `device`로 표시되어야 한다고 안내한다.[1] Android 4.2.2 이상 기기는 해당 컴퓨터의 RSA debugging key 승인 대화상자를 기기에서 수락해야 한다.[1]

개발자 옵션은 Android 4.2 이상에서 Build number를 7회 탭해 노출하며, USB debugging 위치는 Android 9 이상 기준 `Settings > System > Advanced > Developer Options > USB debugging`이지만 제조사별 명칭/경로는 달라질 수 있다.[2] Android는 개발자 옵션의 `Show taps`를 화면 녹화 때 터치 지점이 보이도록 사용할 수 있다고 명시한다.[2]

이 환경에서는 `adb` 실행 파일만 설치되어 있고 `adb devices -l` 출력은 비어 있다. `emulator`, `avdmanager`, `sdkmanager`, AVD, Android SDK, `/dev/kvm`, CPU virtualization flag가 모두 없어 여기서 실제 APK를 실행할 Android emulator/실기기 제어는 불가능하다.

## References

[1] [Android Debug Bridge (adb) — Android Developers](https://developer.android.com/tools/adb)

[2] [Configure on-device developer options — Android Developers](https://developer.android.com/studio/debug/dev-options)
