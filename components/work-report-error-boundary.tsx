import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

interface State {
  hasError: boolean;
  error: Error | null;
}

interface Props {
  children: React.ReactNode;
  onBack?: () => void;
}

/**
 * WorkReportErrorBoundary
 * work-report 화면에서 예외 발생 시 앱 전체 종료 대신 오류 안내와 뒤로가기 버튼을 표시합니다.
 * Android와 iOS 공통 React Native 코드입니다.
 */
export class WorkReportErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[WorkReportErrorBoundary]", error.message, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={s.container}>
          <Text style={s.title}>화면을 불러오지 못했습니다</Text>
          <Text style={s.message}>
            {this.state.error?.message || "알 수 없는 오류가 발생했습니다."}
          </Text>
          <TouchableOpacity
            style={s.button}
            onPress={() => {
              this.setState({ hasError: false, error: null });
              this.props.onBack?.();
            }}
            activeOpacity={0.7}
          >
            <Text style={s.buttonText}>← 뒤로가기</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    backgroundColor: "#fff",
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111",
    marginBottom: 12,
    textAlign: "center",
  },
  message: {
    fontSize: 14,
    color: "#666",
    marginBottom: 24,
    textAlign: "center",
    lineHeight: 20,
  },
  button: {
    backgroundColor: "#FF6B35",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
});

