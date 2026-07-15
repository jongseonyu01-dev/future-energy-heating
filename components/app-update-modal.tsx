/**
 * 앱 업데이트 안내 모달
 * - updateAvailable: 선택적 업데이트 안내 (닫기 가능)
 * - forceUpdate: 강제 업데이트 (닫기 불가, 업무 기능 차단)
 */
import React from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from "react-native";
import type { AppUpdateInfo } from "@/hooks/use-app-update";

interface AppUpdateModalProps {
  visible: boolean;
  forceUpdate: boolean;
  updateInfo: AppUpdateInfo | null;
  onDownload: () => void;
  onDismiss: () => void;
}

export function AppUpdateModal({
  visible,
  forceUpdate,
  updateInfo,
  onDownload,
  onDismiss,
}: AppUpdateModalProps) {
  if (Platform.OS === "web") return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {
        if (!forceUpdate) onDismiss();
      }}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* 아이콘 */}
          <Text style={styles.icon}>{forceUpdate ? "🚨" : "🔔"}</Text>

          {/* 제목 */}
          <Text style={styles.title}>
            {forceUpdate ? "필수 업데이트 필요" : "새 버전이 있습니다"}
          </Text>

          {/* 설명 */}
          <Text style={styles.desc}>
            {forceUpdate
              ? `현재 버전은 더 이상 지원되지 않습니다.\n업데이트 후 사용해 주세요.`
              : `최신 기사앱(v${updateInfo?.versionName ?? ""})이 출시되었습니다.\n지금 업데이트하시겠습니까?`}
          </Text>

          {/* 버전 정보 */}
          {updateInfo && (
            <View style={styles.infoBox}>
              <Text style={styles.infoText}>
                최신 버전: v{updateInfo.versionName} ({updateInfo.versionCode})
              </Text>
              {updateInfo.releaseNotes && updateInfo.releaseNotes !== "초기 버전" && (
                <Text style={styles.infoText}>
                  업데이트 내용: {updateInfo.releaseNotes}
                </Text>
              )}
            </View>
          )}

          {/* 버튼 */}
          <TouchableOpacity style={styles.downloadBtn} onPress={onDownload}>
            <Text style={styles.downloadBtnText}>📥 지금 업데이트</Text>
          </TouchableOpacity>

          {/* 강제 업데이트가 아닌 경우에만 닫기 버튼 표시 */}
          {!forceUpdate && (
            <TouchableOpacity style={styles.dismissBtn} onPress={onDismiss}>
              <Text style={styles.dismissBtnText}>나중에 하기</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 28,
    width: "100%",
    maxWidth: 360,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  icon: {
    fontSize: 48,
    marginBottom: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: "#1f2937",
    marginBottom: 10,
    textAlign: "center",
  },
  desc: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 16,
  },
  infoBox: {
    backgroundColor: "#f3f4f6",
    borderRadius: 10,
    padding: 12,
    width: "100%",
    marginBottom: 20,
    gap: 4,
  },
  infoText: {
    fontSize: 13,
    color: "#374151",
    lineHeight: 20,
  },
  downloadBtn: {
    backgroundColor: "#e85d04",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 32,
    width: "100%",
    alignItems: "center",
    marginBottom: 10,
  },
  downloadBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  dismissBtn: {
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  dismissBtnText: {
    color: "#9ca3af",
    fontSize: 14,
  },
});
