import React, { useState, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Keyboard,
} from "react-native";
import { useRouter } from "expo-router";
import { assertTrackingSessionOwnedForLogin, useAppAuth } from "@/lib/auth-context";
import { trpc } from "@/lib/trpc";
import * as Auth from "@/lib/_core/auth";
import { useColors } from "@/hooks/use-colors";
import { ScreenContainer } from "@/components/screen-container";

type View2 = "login" | "changePw" | "signup" | "findId" | "resetPw";

const TEST_TECHNICIAN_LOGIN_ID = "yjs1";
const normalizePhone = (value: string) => value.replace(/[^0-9]/g, "");
const isValidMobileLoginId = (value: string) => /^010\d{8}$/.test(value);
const normalizeTechnicianName = (value: string) => value.normalize("NFC").trim();
const isValidTechnicianName = (value: string) => /^[가-힣]{2,10}$/u.test(normalizeTechnicianName(value));

export default function LoginScreen() {
  const colors = useColors();
  const router = useRouter();
  const { login } = useAppAuth();

  const [view, setView] = useState<View2>("login");
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [isTestLogin, setIsTestLogin] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  // 강제 비밀번호 변경 컨텍스트
  const [pendingUser, setPendingUser] = useState<any>(null);
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");

  // 기사 가입 신청
  const [suName, setSuName] = useState("");
  const [suPhone, setSuPhone] = useState("");
  const [suCode, setSuCode] = useState("");
  const [suCodeSent, setSuCodeSent] = useState(false);
  const [suVerified, setSuVerified] = useState(false);
  const [suSignupGrant, setSuSignupGrant] = useState("");
  const [suPw, setSuPw] = useState("");
  const [suPw2, setSuPw2] = useState("");

  // 아이디 찾기 / 비번 재설정
  const [fiPhone, setFiPhone] = useState("");
  const [fiCode, setFiCode] = useState("");
  const [fiResult, setFiResult] = useState("");
  const [rpLoginId, setRpLoginId] = useState("");
  const [rpPhone, setRpPhone] = useState("");
  const [rpCode, setRpCode] = useState("");
  const [rpPw, setRpPw] = useState("");

  const isNative = Platform.OS !== "web";
  const s = styles(colors);

  // 포커스된 입력칸이 키보드 위로 보이도록 자동 스크롤
  // Web에서는 findNodeHandle/UIManager를 사용할 수 없으므로 건너뜀
  const scrollRef = useRef<ScrollView>(null);
  const handleFocus = (_e: any) => {
    if (Platform.OS === "web") return;
    // Native(iOS/Android)에서만 스크롤 처리
    // KeyboardAvoidingView가 대부분의 경우를 처리하므로 추가 스크롤 불필요
  };

  const clearMsg = () => { setError(""); setInfo(""); };
  const go = (v: View2) => { setView(v); clearMsg(); };

  const finishLogin = async (data: any) => {
    // 로그인 통신 성공 후 세션 저장 오류와 화면이동 오류를 분리하여 표시
    try {
      await login(
        {
          userId: data.userId!,
          appRole: data.appRole!,
          loginId,
          name: data.name ?? null,
          technicianId: data.technicianId ?? null,
          branchId: data.branchId ?? null,
          branchName: data.branchName ?? null,
          phoneNumber: data.phoneNumber ?? null,
          mustChangePassword: false,
          token: data.token ?? null,
        },
        loginId,
        rememberMe
      );
    } catch (saveErr: any) {
      setError(`세션 저장 실패: ${saveErr?.message || String(saveErr)}`);
      return;
    }
    try {
      router.replace("/(tabs)");
    } catch (navErr: any) {
      setError(`화면 이동 실패: ${navErr?.message || String(navErr)}`);
    }
  };

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: async (data) => {
      if (!data.success) {
        if ((data as any).blockedRole === "hq_admin" || (data as any).blockedRole === "branch_manager") {
          setError("본사와 지사 계정은 홈페이지 관리시스템을 이용해 주세요.\nhttps://퓨처에너지테크.kr");
        } else {
          setError(data.error ?? "아이디 또는 비밀번호가 올바르지 않습니다.");
        }
        return;
      }
      if (data.mustChangePassword) {
        if (!data.token) {
          setError("로그인 토큰을 받지 못했습니다. 다시 로그인해주세요.");
          return;
        }
        try {
          await assertTrackingSessionOwnedForLogin({
            userId: data.userId!,
            appRole: data.appRole!,
            loginId,
            technicianId: data.technicianId ?? null,
            token: data.token,
          });
          await Auth.setSessionToken(data.token);
        } catch (saveErr: any) {
          setError(`세션 저장 실패: ${saveErr?.message || String(saveErr)}`);
          return;
        }
        setPendingUser(data);
        go("changePw");
        return;
      }
      await finishLogin(data);
    },
    onError: (err) => {
      const msg = err?.message || "";
      const httpStatus = (err as any)?.data?.httpStatus as number | undefined;
      // 오류 유형 세분화
      if (msg.includes("undefined is not a function") || msg.includes("is not a function")) {
        setError("앱 내부 오류\n새로운 APK를 설치하거나 앱을 재시작해주세요.");
      } else if (msg.includes("Network request failed") || msg.includes("fetch") || msg.includes("ECONNREFUSED")) {
        setError("인터넷 또는 DNS 오류\n\uc11c버에 연결할 수 없습니다. Wi-Fi 또는 모바일 데이터를 확인해주세요.");
      } else if (httpStatus === 401) {
        setError("아이디 또는 비밀번호가 일치하지 않습니다.");
      } else if (httpStatus === 403) {
        setError("승인되지 않은 계정입니다. 본사에 문의해주세요.");
      } else if (httpStatus === 404) {
        setError("서버 연결 오류\n\uc11c버 주소를 확인하거나 담당자에 문의해주세요.");
      } else {
        setError(`서버 연결 실패\n${msg || "네트워크 오류"}`);
      }
    },
  });

  const changePwMutation = trpc.auth.changePassword.useMutation({
    onSuccess: async (r) => {
      if (!r.success) { setError(r.error ?? "비밀번호 변경에 실패했습니다."); return; }
      await finishLogin({ ...pendingUser, token: (r as any).token, mustChangePassword: false });
    },
    onError: () => setError("비밀번호 변경 중 오류가 발생했습니다."),
  });

  const sendCodeMutation = trpc.auth.sendVerifyCode.useMutation();
  const checkCodeMutation = trpc.auth.checkVerifyCode.useMutation();
  const registerTechnicianMutation = trpc.auth.registerTechnician.useMutation();
  const findIdMutation = trpc.auth.findLoginId.useMutation();
  const resetPwMutation = trpc.auth.resetPassword.useMutation();

  const handleLogin = () => {
    Keyboard.dismiss();
    clearMsg();
    const loginAccount = Platform.OS === "web"
      ? loginId.trim()
      : isTestLogin
        ? TEST_TECHNICIAN_LOGIN_ID
        : normalizePhone(loginId);
    if (!loginAccount || !password.trim()) {
      setError(Platform.OS === "web" ? "아이디와 비밀번호를 입력해주세요." : "휴대전화 번호와 비밀번호를 입력해주세요.");
      return;
    }
    if (isNative && isTestLogin && loginId.trim() !== TEST_TECHNICIAN_LOGIN_ID) {
      setError("테스트 계정 아이디를 확인해주세요.");
      return;
    }
    if (isNative && !isTestLogin && !isValidMobileLoginId(loginAccount)) {
      setError("010으로 시작하는 휴대전화 번호 11자리를 입력해주세요.");
      return;
    }
    loginMutation.mutate({ loginId: loginAccount, password, source: "app" });
  };

  const handleLoginAccountChange = (value: string) => {
    if (!isNative) {
      setLoginId(value);
      return;
    }
    if (!isTestLogin) setLoginId(normalizePhone(value).slice(0, 11));
  };

  const toggleTestLogin = () => {
    const next = !isTestLogin;
    setIsTestLogin(next);
    setLoginId(next ? TEST_TECHNICIAN_LOGIN_ID : "");
    clearMsg();
  };

  const handleChangePw = () => {
    Keyboard.dismiss();
    clearMsg();
    if (newPw.length < 6) { setError("비밀번호는 6자 이상이어야 합니다."); return; }
    if (newPw !== newPw2) { setError("비밀번호가 일치하지 않습니다."); return; }
    changePwMutation.mutate({
      userId: pendingUser.userId,
      currentPassword: password,
      newPassword: newPw,
    });
  };

  const handleGuestMode = () => router.replace("/(tabs)");

  // 기사 가입 신청 흐름
  const handleSignupPhoneChange = (value: string) => {
    setSuPhone(value);
    setSuCode("");
    setSuCodeSent(false);
    setSuVerified(false);
    setSuSignupGrant("");
    clearMsg();
  };

  const suSendCode = () => {
    clearMsg();
    if (!suPhone.trim()) { setError("휴대전화 번호를 입력해주세요."); return; }
    setSuCode("");
    setSuVerified(false);
    setSuSignupGrant("");
    sendCodeMutation.mutate(
      { phoneNumber: suPhone.trim(), purpose: "signup" },
      {
        onSuccess: (r: any) => {
          if (r?.success) {
            setSuCodeSent(true);
            setInfo("인증번호를 발송했습니다." + (r.devCode ? ` (테스트코드: ${r.devCode})` : ""));
          } else {
            setError(r?.error ?? "인증번호 발송에 실패했습니다.");
          }
        },
        onError: () => setError("인증번호 발송 중 오류가 발생했습니다."),
      }
    );
  };
  const suVerify = () => {
    clearMsg();
    if (!suCode.trim()) { setError("인증번호를 입력해주세요."); return; }
    checkCodeMutation.mutate(
      { phoneNumber: suPhone.trim(), code: suCode.trim(), purpose: "signup" },
      {
        onSuccess: (r: any) => {
          if (r?.success) {
            const signupGrant = String(r?.signupGrant || "");
            if (!signupGrant) {
              setSuVerified(false);
              setError("가입 인증 정보를 받지 못했습니다. 인증번호를 다시 요청해 주세요.");
              return;
            }
            setSuSignupGrant(signupGrant);
            setSuVerified(true);
            setInfo("휴대폰 인증이 완료되었습니다.");
          } else {
            setError(r?.error ?? "인증번호가 올바르지 않습니다.");
          }
        },
        onError: () => setError("인증 확인 중 오류가 발생했습니다."),
      }
    );
  };
  const handleSignup = () => {
    Keyboard.dismiss();
    clearMsg();
    if (!suName.trim() || !suPhone.trim() || !suPw) { setError("모든 항목을 입력해주세요."); return; }
    if (!isValidTechnicianName(suName)) { setError("이름은 숫자·특수문자 없이 한글 실명 2~10자로 입력해주세요."); return; }
    const phoneLoginId = normalizePhone(suPhone);
    if (!/^010\d{8}$/.test(phoneLoginId)) { setError("010으로 시작하는 휴대전화 번호를 입력해주세요."); return; }
    if (suPw.length < 6) { setError("비밀번호는 6자 이상이어야 합니다."); return; }
    if (suPw !== suPw2) { setError("비밀번호가 일치하지 않습니다."); return; }
    if (!suVerified) { setError("휴대폰 인증을 먼저 완료해주세요."); return; }
    if (!suSignupGrant) { setError("휴대폰 인증이 만료되었습니다. 다시 인증해 주세요."); return; }
    registerTechnicianMutation.mutate(
      ({
        password: suPw,
        name: normalizeTechnicianName(suName),
        phoneNumber: suPhone.trim(),
        signupChannel: "technician_app_v1",
        signupGrant: suSignupGrant,
      } as any),
      {
        onSuccess: (r: any) => {
          if (r?.success) {
            setIsTestLogin(false);
            setLoginId(String(r.loginId || phoneLoginId));
            setInfo("기사 가입 신청이 완료되었습니다. 본사 승인 후 휴대전화 번호로 로그인할 수 있습니다.");
            setTimeout(() => go("login"), 2200);
          } else {
            setError(r?.error ?? "기사 가입 신청에 실패했습니다.");
          }
        },
        onError: () => setError("기사 가입 신청 중 오류가 발생했습니다."),
      }
    );
  };

  // 아이디 찾기
  const fiSendCode = () => {
    clearMsg();
    if (!fiPhone.trim()) { setError("휴대전화 번호를 입력해주세요."); return; }
    sendCodeMutation.mutate(
      { phoneNumber: fiPhone.trim(), purpose: "reset" },
      { onSuccess: (r: any) => { if (r?.success) setInfo("인증번호를 발송했습니다." + (r.devCode ? ` (테스트코드: ${r.devCode})` : "")); else setError("인증번호 발송에 실패했습니다."); }, onError: () => setError("인증번호 발송 중 오류가 발생했습니다.") }
    );
  };
  const handleFindId = () => {
    Keyboard.dismiss();
    clearMsg();
    if (!fiPhone.trim() || !fiCode.trim()) { setError("휴대전화 번호와 인증번호를 입력해주세요."); return; }
    findIdMutation.mutate(
      { phoneNumber: fiPhone.trim(), code: fiCode.trim() },
      { onSuccess: (r: any) => { if (r?.success && r.loginIds?.length) { setFiResult(r.loginIds.join(", ")); setInfo("아이디를 찾았습니다."); } else setError("일치하는 계정이 없습니다."); }, onError: () => setError("아이디 찾기 중 오류가 발생했습니다.") }
    );
  };

  // 비밀번호 재설정
  const rpSendCode = () => {
    clearMsg();
    const resetPhone = isNative ? normalizePhone(rpPhone) : rpPhone.trim();
    if (!resetPhone) { setError("휴대전화 번호를 입력해주세요."); return; }
    if (isNative && !isValidMobileLoginId(resetPhone)) {
      setError("010으로 시작하는 휴대전화 번호 11자리를 입력해주세요.");
      return;
    }
    sendCodeMutation.mutate(
      { phoneNumber: resetPhone, purpose: "reset" },
      { onSuccess: (r: any) => { if (r?.success) setInfo("인증번호를 발송했습니다." + (r.devCode ? ` (테스트코드: ${r.devCode})` : "")); else setError("인증번호 발송에 실패했습니다."); }, onError: () => setError("인증번호 발송 중 오류가 발생했습니다.") }
    );
  };
  const handleResetPw = () => {
    Keyboard.dismiss();
    clearMsg();
    const resetPhone = isNative ? normalizePhone(rpPhone) : rpPhone.trim();
    const resetLoginId = isNative ? resetPhone : rpLoginId.trim();
    if (!resetLoginId || !resetPhone || !rpCode.trim() || !rpPw) { setError("모든 항목을 입력해주세요."); return; }
    if (isNative && !isValidMobileLoginId(resetPhone)) {
      setError("010으로 시작하는 휴대전화 번호 11자리를 입력해주세요.");
      return;
    }
    if (rpPw.length < 6) { setError("비밀번호는 6자 이상이어야 합니다."); return; }
    resetPwMutation.mutate(
      ({ loginId: resetLoginId, phoneNumber: resetPhone, code: rpCode.trim(), newPassword: rpPw, source: isNative ? "app" : "web" } as any),
      { onSuccess: (r: any) => { if (r?.success) { setInfo("비밀번호가 변경되었습니다. 새 비밀번호로 로그인해주세요."); setIsTestLogin(false); setLoginId(resetLoginId); setTimeout(() => go("login"), 1000); } else setError(r?.error ?? "비밀번호 재설정에 실패했습니다."); }, onError: () => setError("비밀번호 재설정 중 오류가 발생했습니다.") }
    );
  };

  const Msg = () => (
    <>
      {error ? <Text style={s.errorText}>{error}</Text> : null}
      {info ? <Text style={s.infoText}>{info}</Text> : null}
    </>
  );

  // 아이디/비번 공통 입력 속성: 자동 대문자/자동완성/자동수정 모두 비활성화
  const idInputProps = {
    autoCapitalize: "none" as const,
    autoCorrect: false,
    autoComplete: "off" as const,
    textContentType: "none" as const,
    spellCheck: false,
    importantForAutofill: "no" as const,
  };

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
        >
          <View style={s.header}>
            <View style={s.logoBox}><Text style={s.logoText}>🌐</Text></View>
            <Text style={s.title}>퓨처에너지테크</Text>
            <Text style={s.subtitle2}>Future Energy Tech</Text>
            <Text style={s.subtitle}>난방케어 통합 로그인</Text>
          </View>

          {/* ── 로그인 ── */}
          {view === "login" && (
            <>
              <View style={s.form}>
                <Text style={s.label}>{Platform.OS === "web" ? "아이디" : isTestLogin ? "테스트 계정" : "휴대전화 번호"}</Text>
                <TextInput
                  style={[s.input, isNative && isTestLogin && s.readOnlyInput]}
                  value={loginId}
                  onChangeText={handleLoginAccountChange}
                  onFocus={handleFocus}
                  placeholder={Platform.OS === "web" ? "아이디를 입력하세요" : isTestLogin ? TEST_TECHNICIAN_LOGIN_ID : "01012345678"}
                  placeholderTextColor={colors.muted}
                  editable={!isNative || !isTestLogin}
                  keyboardType={isNative && !isTestLogin ? "phone-pad" : "default"}
                  inputMode={isNative && !isTestLogin ? "tel" : "text"}
                  autoCapitalize="none"
                  autoCorrect={false}
                  spellCheck={false}
                  autoComplete={isNative && !isTestLogin ? "tel" : "off"}
                  textContentType={isNative && !isTestLogin ? "telephoneNumber" : "none"}
                  importantForAutofill={isNative && !isTestLogin ? "yes" : "no"}
                  returnKeyType="next"
                />
                {isNative && (
                  <TouchableOpacity
                    style={s.testLoginRow}
                    onPress={toggleTestLogin}
                    activeOpacity={0.7}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: isTestLogin }}
                    accessibilityLabel="테스트 계정으로 로그인"
                  >
                    <View style={[s.checkbox, isTestLogin && s.checkboxOn]}>{isTestLogin ? <Text style={s.checkMark}>✓</Text> : null}</View>
                    <View style={s.testLoginCopy}>
                      <Text style={s.rememberText}>테스트 계정으로 로그인</Text>
                      <Text style={s.testLoginHint}>선택할 때만 yjs1 계정을 사용합니다</Text>
                    </View>
                  </TouchableOpacity>
                )}
                <Text style={s.label}>비밀번호</Text>
                <View style={s.pwWrap}>
                  <TextInput style={[s.input, { flex: 1, borderWidth: 0, backgroundColor: "transparent" }]} value={password} onChangeText={setPassword} onFocus={handleFocus} placeholder="비밀번호를 입력하세요" placeholderTextColor={colors.muted} secureTextEntry={!showPw} returnKeyType="done" onSubmitEditing={handleLogin} {...idInputProps} />
                  <TouchableOpacity onPress={() => setShowPw(!showPw)} style={s.pwToggle}><Text style={{ fontSize: 18 }}>{showPw ? "🙈" : "👁"}</Text></TouchableOpacity>
                </View>

                {/* 자동 로그인 */}
                <TouchableOpacity style={s.rememberRow} onPress={() => setRememberMe(!rememberMe)} activeOpacity={0.7}>
                  <View style={[s.checkbox, rememberMe && s.checkboxOn]}>{rememberMe ? <Text style={s.checkMark}>✓</Text> : null}</View>
                  <Text style={s.rememberText}>자동 로그인</Text>
                </TouchableOpacity>

                <Msg />
                <TouchableOpacity style={[s.loginBtn, loginMutation.isPending && s.loginBtnDisabled]} onPress={handleLogin} disabled={loginMutation.isPending} activeOpacity={0.8}>
                  {loginMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={s.loginBtnText}>로그인</Text>}
                </TouchableOpacity>
                <View style={s.linkRow}>
                  {Platform.OS === "web" && (
                    <>
                      <TouchableOpacity onPress={() => go("findId")}><Text style={s.link}>아이디 찾기</Text></TouchableOpacity>
                      <Text style={s.linkDot}>·</Text>
                    </>
                  )}
                  <TouchableOpacity onPress={() => go("resetPw")}><Text style={s.link}>비밀번호 재설정</Text></TouchableOpacity>
                </View>
                {Platform.OS !== "web" && (
                  <TouchableOpacity style={s.signupLinkBtn} onPress={() => go("signup")} activeOpacity={0.7}>
                    <Text style={s.signupLinkText}>기사 가입 신청</Text>
                  </TouchableOpacity>
                )}
              </View>

              <View style={s.guestSection}>
                <Text style={s.guestDesc}>로그인 없이도 접수 및 조회가 가능합니다</Text>
                <TouchableOpacity style={s.guestBtn} onPress={handleGuestMode} activeOpacity={0.7}><Text style={s.guestBtnText}>고객 접수 바로가기 →</Text></TouchableOpacity>
              </View>
              <Text style={s.footer}>직원 계정 문의: 담당 지사 또는 본사{"\n"}본사 대표번호: 031-8042-7310</Text>
            </>
          )}

          {/* ── 강제 비밀번호 변경 ── */}
          {view === "changePw" && (
            <View style={s.form}>
              <Text style={s.formTitle}>비밀번호 변경</Text>
              <Text style={s.noticeBox}>임시 비밀번호로 로그인하셨습니다. 보안을 위해 새 비밀번호로 변경해주세요.</Text>
              <Text style={s.label}>새 비밀번호</Text>
              <View style={s.pwWrap}>
                <TextInput style={[s.input, { flex: 1, borderWidth: 0, backgroundColor: "transparent" }]} value={newPw} onChangeText={setNewPw} onFocus={handleFocus} placeholder="새 비밀번호 (6자 이상)" placeholderTextColor={colors.muted} secureTextEntry={!showPw} {...idInputProps} />
                <TouchableOpacity onPress={() => setShowPw(!showPw)} style={s.pwToggle}><Text style={{ fontSize: 18 }}>{showPw ? "🙈" : "👁"}</Text></TouchableOpacity>
              </View>
              <Text style={s.label}>새 비밀번호 확인</Text>
              <TextInput style={s.input} value={newPw2} onChangeText={setNewPw2} onFocus={handleFocus} placeholder="새 비밀번호 다시 입력" placeholderTextColor={colors.muted} secureTextEntry {...idInputProps} />
              <Msg />
              <TouchableOpacity style={[s.loginBtn, changePwMutation.isPending && s.loginBtnDisabled]} onPress={handleChangePw} disabled={changePwMutation.isPending} activeOpacity={0.8}>
                {changePwMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={s.loginBtnText}>변경 후 시작하기</Text>}
              </TouchableOpacity>
            </View>
          )}

          {/* ── 기사 가입 신청 (네이티브 앱 전용) ── */}
          {view === "signup" && Platform.OS !== "web" && (
            <View style={s.form}>
              <Text style={s.formTitle}>기사 가입 신청</Text>
              <View style={s.pendingNotice}>
                <Text style={s.pendingNoticeTitle}>본사 승인 후 이용할 수 있습니다</Text>
                <Text style={s.pendingNoticeText}>휴대폰 인증 후 번호가 로그인 계정으로 자동 등록됩니다. 별도 아이디는 만들지 않습니다.</Text>
              </View>

              <Text style={s.label}>이름</Text>
              <TextInput
                style={s.input}
                value={suName}
                onChangeText={setSuName}
                onFocus={handleFocus}
                placeholder="한글 실명 2~10자"
                placeholderTextColor={colors.muted}
                maxLength={10}
                autoCorrect={false}
                textContentType="name"
                autoComplete="name"
                returnKeyType="next"
              />

              <Text style={s.label}>휴대전화 번호</Text>
              <View style={s.rowField}>
                <TextInput
                  style={[s.input, { flex: 1 }]}
                  value={suPhone}
                  onChangeText={handleSignupPhoneChange}
                  onFocus={handleFocus}
                  placeholder="010-0000-0000"
                  placeholderTextColor={colors.muted}
                  keyboardType="phone-pad"
                  textContentType="telephoneNumber"
                  autoComplete="tel"
                  returnKeyType="done"
                />
                <TouchableOpacity
                  style={[s.smallBtn, sendCodeMutation.isPending && s.loginBtnDisabled]}
                  onPress={suSendCode}
                  disabled={sendCodeMutation.isPending}
                >
                  {sendCodeMutation.isPending
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={s.smallBtnText}>{suCodeSent ? "재발송" : "인증요청"}</Text>}
                </TouchableOpacity>
              </View>

              {suCodeSent && (
                <>
                  <Text style={s.label}>인증번호</Text>
                  <View style={s.rowField}>
                    <TextInput
                      style={[s.input, { flex: 1 }]}
                      value={suCode}
                      onChangeText={(value) => {
                        setSuCode(value.replace(/[^0-9]/g, ""));
                        setSuVerified(false);
                        setSuSignupGrant("");
                      }}
                      onFocus={handleFocus}
                      placeholder="인증번호 6자리"
                      placeholderTextColor={colors.muted}
                      keyboardType="number-pad"
                      textContentType="oneTimeCode"
                      autoComplete={Platform.OS === "android" ? "sms-otp" : "one-time-code"}
                      maxLength={6}
                      returnKeyType="done"
                    />
                    <TouchableOpacity
                      style={[s.smallBtn, (checkCodeMutation.isPending || suVerified) && s.loginBtnDisabled]}
                      onPress={suVerify}
                      disabled={checkCodeMutation.isPending || suVerified}
                    >
                      {checkCodeMutation.isPending
                        ? <ActivityIndicator color="#fff" size="small" />
                        : <Text style={s.smallBtnText}>{suVerified ? "인증완료" : "확인"}</Text>}
                    </TouchableOpacity>
                  </View>
                </>
              )}

              <Text style={s.label}>비밀번호</Text>
              <TextInput
                style={s.input}
                value={suPw}
                onChangeText={setSuPw}
                onFocus={handleFocus}
                placeholder="비밀번호 (6자 이상)"
                placeholderTextColor={colors.muted}
                secureTextEntry
                returnKeyType="next"
                {...idInputProps}
              />

              <Text style={s.label}>비밀번호 확인</Text>
              <TextInput
                style={s.input}
                value={suPw2}
                onChangeText={setSuPw2}
                onFocus={handleFocus}
                placeholder="비밀번호 다시 입력"
                placeholderTextColor={colors.muted}
                secureTextEntry
                returnKeyType="done"
                onSubmitEditing={handleSignup}
                {...idInputProps}
              />

              <Msg />
              <TouchableOpacity
                style={[s.loginBtn, registerTechnicianMutation.isPending && s.loginBtnDisabled]}
                onPress={handleSignup}
                disabled={registerTechnicianMutation.isPending}
                activeOpacity={0.8}
              >
                {registerTechnicianMutation.isPending
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={s.loginBtnText}>기사 가입 신청하기</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => go("login")} style={{ marginTop: 14, alignItems: "center" }}><Text style={s.link}>← 로그인으로 돌아가기</Text></TouchableOpacity>
            </View>
          )}
                    {/* ── 아이디 찾기 ── */}
          {view === "findId" && (
            <View style={s.form}>
              <Text style={s.formTitle}>아이디 찾기</Text>
              <Text style={s.label}>휴대전화 번호</Text>
              <View style={s.rowField}>
                <TextInput style={[s.input, { flex: 1 }]} value={fiPhone} onChangeText={setFiPhone} onFocus={handleFocus} placeholder="010-0000-0000" placeholderTextColor={colors.muted} keyboardType="phone-pad" />
                <TouchableOpacity style={s.smallBtn} onPress={fiSendCode}><Text style={s.smallBtnText}>인증요청</Text></TouchableOpacity>
              </View>
              <Text style={s.label}>인증번호</Text>
              <TextInput style={s.input} value={fiCode} onChangeText={setFiCode} onFocus={handleFocus} placeholder="인증번호 6자리" placeholderTextColor={colors.muted} keyboardType="number-pad" maxLength={6} />
              <Msg />
              {fiResult ? <Text style={s.resultBox}>가입된 아이디: {fiResult}</Text> : null}
              <TouchableOpacity style={s.loginBtn} onPress={handleFindId} activeOpacity={0.8}><Text style={s.loginBtnText}>아이디 찾기</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => go("login")} style={{ marginTop: 14, alignItems: "center" }}><Text style={s.link}>← 로그인으로 돌아가기</Text></TouchableOpacity>
            </View>
          )}

          {/* ── 비밀번호 재설정 ── */}
          {view === "resetPw" && (
            <View style={s.form}>
              <Text style={s.formTitle}>비밀번호 재설정</Text>
              {Platform.OS === "web" ? (
                <>
                  <Text style={s.label}>아이디</Text>
                  <TextInput style={s.input} value={rpLoginId} onChangeText={setRpLoginId} onFocus={handleFocus} placeholder="아이디" placeholderTextColor={colors.muted} {...idInputProps} />
                </>
              ) : (
                <Text style={s.noticeBox}>휴대폰 인증을 완료한 번호가 로그인 계정으로 사용됩니다.</Text>
              )}
              <Text style={s.label}>휴대전화 번호</Text>
              <View style={s.rowField}>
                <TextInput
                  style={[s.input, { flex: 1 }]}
                  value={rpPhone}
                  onChangeText={(value) => setRpPhone(isNative ? normalizePhone(value).slice(0, 11) : value)}
                  onFocus={handleFocus}
                  placeholder="01012345678"
                  placeholderTextColor={colors.muted}
                  keyboardType="phone-pad"
                  inputMode="tel"
                  textContentType="telephoneNumber"
                  autoComplete="tel"
                />
                <TouchableOpacity style={s.smallBtn} onPress={rpSendCode}><Text style={s.smallBtnText}>인증요청</Text></TouchableOpacity>
              </View>
              <Text style={s.label}>인증번호</Text>
              <TextInput style={s.input} value={rpCode} onChangeText={(value) => setRpCode(value.replace(/[^0-9]/g, ""))} onFocus={handleFocus} placeholder="인증번호 6자리" placeholderTextColor={colors.muted} keyboardType="number-pad" inputMode="numeric" textContentType="oneTimeCode" autoComplete={Platform.OS === "android" ? "sms-otp" : "one-time-code"} maxLength={6} />
              <Text style={s.label}>새 비밀번호</Text>
              <TextInput style={s.input} value={rpPw} onChangeText={setRpPw} onFocus={handleFocus} placeholder="새 비밀번호 (6자 이상)" placeholderTextColor={colors.muted} secureTextEntry {...idInputProps} />
              <Msg />
              <TouchableOpacity style={[s.loginBtn, resetPwMutation.isPending && s.loginBtnDisabled]} onPress={handleResetPw} disabled={resetPwMutation.isPending} activeOpacity={0.8}>
                {resetPwMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={s.loginBtnText}>비밀번호 재설정</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => go("login")} style={{ marginTop: 14, alignItems: "center" }}><Text style={s.link}>← 로그인으로 돌아가기</Text></TouchableOpacity>
            </View>
          )}

          {/* 키보드 위 여백: 작은 화면에서도 버튼이 가려지지 않도록 충분히 확보 */}
          <View style={{ height: 120 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    scroll: { flexGrow: 1, padding: 24, justifyContent: "center" },
    header: { alignItems: "center", marginBottom: 28 },
    logoBox: { width: 80, height: 80, borderRadius: 20, backgroundColor: "#1A3A6B", alignItems: "center", justifyContent: "center", marginBottom: 16 },
    logoText: { fontSize: 40 },
    title: { fontSize: 22, fontWeight: "800", color: "#1A3A6B", marginBottom: 2 },
    subtitle2: { fontSize: 14, fontWeight: "600", color: "#E8380D", marginBottom: 4 },
    subtitle: { fontSize: 13, color: colors.muted },
    form: { backgroundColor: colors.surface, borderRadius: 16, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: colors.border },
    formTitle: { fontSize: 18, fontWeight: "700", color: colors.foreground, marginBottom: 12, textAlign: "center" },
    label: { fontSize: 14, fontWeight: "600", color: colors.foreground, marginBottom: 6, marginTop: 12 },
    input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, fontSize: 16, color: colors.foreground, backgroundColor: colors.background },
    readOnlyInput: { color: colors.muted, backgroundColor: colors.surface },
    pwWrap: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.background, paddingRight: 8 },
    pwToggle: { padding: 8 },
    rowField: { flexDirection: "row", alignItems: "center", gap: 8 },
    smallBtn: { backgroundColor: "#FF6B35", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 13 },
    smallBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
    rememberRow: { flexDirection: "row", alignItems: "center", marginTop: 16, gap: 8 },
    checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: colors.border, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
    checkboxOn: { backgroundColor: "#FF6B35", borderColor: "#FF6B35" },
    checkMark: { color: "#fff", fontSize: 14, fontWeight: "900" },
    rememberText: { fontSize: 14, color: colors.foreground, fontWeight: "500" },
    testLoginRow: { flexDirection: "row", alignItems: "center", marginTop: 12, gap: 8, minHeight: 44 },
    testLoginCopy: { flex: 1 },
    testLoginHint: { fontSize: 12, color: colors.muted, marginTop: 2 },
    errorText: { color: colors.error, fontSize: 13, marginTop: 10, textAlign: "center" },
    infoText: { color: "#1D4ED8", fontSize: 13, marginTop: 10, textAlign: "center" },
    resultBox: { backgroundColor: colors.background, borderRadius: 10, padding: 12, marginTop: 10, fontSize: 14, fontWeight: "700", color: colors.foreground, textAlign: "center" },
    noticeBox: { backgroundColor: "#EFF6FF", color: "#1D4ED8", fontSize: 13, padding: 12, borderRadius: 10, marginBottom: 8, lineHeight: 19 },
    loginBtn: { backgroundColor: "#FF6B35", borderRadius: 12, padding: 14, alignItems: "center", marginTop: 20 },
    loginBtnDisabled: { opacity: 0.6 },
    loginBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
    linkRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, marginTop: 16, flexWrap: "wrap" },
    link: { fontSize: 13, color: "#FF6B35", fontWeight: "600" },
    linkDot: { color: colors.muted },
    signupLinkBtn: { marginTop: 18, paddingVertical: 11, alignItems: "center", borderRadius: 10, borderWidth: 1, borderColor: "#FF6B35" },
    signupLinkText: { fontSize: 14, color: "#FF6B35", fontWeight: "700" },
    pendingNotice: { backgroundColor: "#FFF7ED", borderWidth: 1, borderColor: "#FED7AA", borderRadius: 10, padding: 12, marginBottom: 4 },
    pendingNoticeTitle: { color: "#9A3412", fontSize: 14, fontWeight: "700", textAlign: "center", marginBottom: 4 },
    pendingNoticeText: { color: "#9A3412", fontSize: 12, lineHeight: 18, textAlign: "center" },
    guestSection: { alignItems: "center", marginBottom: 24 },
    guestDesc: { fontSize: 13, color: colors.muted, marginBottom: 8 },
    guestBtn: { paddingVertical: 8, paddingHorizontal: 16 },
    guestBtnText: { fontSize: 14, color: "#FF6B35", fontWeight: "600" },
    footer: { textAlign: "center", fontSize: 12, color: colors.muted, lineHeight: 18 },
  });
