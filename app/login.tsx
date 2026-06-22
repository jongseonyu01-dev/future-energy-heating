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
import { useAppAuth } from "@/lib/auth-context";
import { trpc } from "@/lib/trpc";
import { useColors } from "@/hooks/use-colors";
import { ScreenContainer } from "@/components/screen-container";

type ViewType = "login" | "changePw" | "signup" | "signupTech" | "signupBranch" | "findId" | "resetPw";
type SignupTab = "customer" | "technician" | "branch";

export default function LoginScreen() {
  const colors = useColors();
  const router = useRouter();
  const { login } = useAppAuth();

  const [view, setView] = useState<ViewType>("login");
  const [signupTab, setSignupTab] = useState<SignupTab>("customer");
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  // 강제 비밀번호 변경 컨텍스트
  const [pendingUser, setPendingUser] = useState<any>(null);
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");

  // 고객 회원가입
  const [suName, setSuName] = useState("");
  const [suPhone, setSuPhone] = useState("");
  const [suCode, setSuCode] = useState("");
  const [suCodeSent, setSuCodeSent] = useState(false);
  const [suVerified, setSuVerified] = useState(false);
  const [suLoginId, setSuLoginId] = useState("");
  const [suPw, setSuPw] = useState("");

  // 기사 회원가입
  const [techName, setTechName] = useState("");
  const [techPhone, setTechPhone] = useState("");
  const [techCode, setTechCode] = useState("");
  const [techCodeSent, setTechCodeSent] = useState(false);
  const [techVerified, setTechVerified] = useState(false);
  const [techLoginId, setTechLoginId] = useState("");
  const [techPw, setTechPw] = useState("");

  // 지사장 회원가입
  const [branchName, setBranchName] = useState("");
  const [branchPhone, setBranchPhone] = useState("");
  const [branchCode, setBranchCode] = useState("");
  const [branchCodeSent, setBranchCodeSent] = useState(false);
  const [branchVerified, setBranchVerified] = useState(false);
  const [branchLoginId, setBranchLoginId] = useState("");
  const [branchPw, setBranchPw] = useState("");

  // 아이디 찾기 / 비번 재설정
  const [fiPhone, setFiPhone] = useState("");
  const [fiCode, setFiCode] = useState("");
  const [fiResult, setFiResult] = useState("");
  const [rpLoginId, setRpLoginId] = useState("");
  const [rpPhone, setRpPhone] = useState("");
  const [rpCode, setRpCode] = useState("");
  const [rpPw, setRpPw] = useState("");

  const s = styles(colors);

  const scrollRef = useRef<ScrollView>(null);
  const handleFocus = (_e: any) => {
    if (Platform.OS === "web") return;
  };

  const clearMsg = () => { setError(""); setInfo(""); };
  const go = (v: ViewType) => { setView(v); clearMsg(); };

  // 역할별 화면 분기
  const getRouteByRole = (appRole: string) => {
    switch (appRole) {
      case "technician": return "/(tabs)/tech-schedule";
      case "branch_manager": return "/(tabs)/branch";
      case "hq_admin": return "/(tabs)/admin";
      default: return "/(tabs)";
    }
  };

  const finishLogin = async (data: any) => {
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
      },
      loginId,
      rememberMe
    );
    const route = getRouteByRole(data.appRole);
    router.replace(route as any);
  };

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: async (data) => {
      if (!data.success) {
        setError(data.error ?? "아이디 또는 비밀번호가 올바르지 않습니다.");
        return;
      }
      if (data.mustChangePassword) {
        setPendingUser(data);
        go("changePw");
        return;
      }
      await finishLogin(data);
    },
    onError: () => setError("서버 연결에 실패했습니다. 잠시 후 다시 시도해주세요."),
  });

  const changePwMutation = trpc.auth.changePassword.useMutation({
    onSuccess: async (r) => {
      if (!r.success) { setError(r.error ?? "비밀번호 변경에 실패했습니다."); return; }
      await finishLogin(pendingUser);
    },
    onError: () => setError("비밀번호 변경 중 오류가 발생했습니다."),
  });

  const sendCodeMutation = trpc.auth.sendVerifyCode.useMutation();
  const checkCodeMutation = trpc.auth.checkVerifyCode.useMutation();
  const registerMutation = trpc.auth.registerCustomer.useMutation();
  const registerTechMutation = trpc.auth.registerTechnician.useMutation();
  const registerBranchMutation = trpc.auth.registerBranchManager.useMutation();
  const findIdMutation = trpc.auth.findLoginId.useMutation();
  const resetPwMutation = trpc.auth.resetPassword.useMutation();

  const handleLogin = () => {
    Keyboard.dismiss();
    clearMsg();
    if (!loginId.trim() || !password.trim()) { setError("아이디와 비밀번호를 입력해주세요."); return; }
    loginMutation.mutate({ loginId: loginId.trim(), password });
  };

  const handleChangePw = () => {
    Keyboard.dismiss();
    clearMsg();
    if (newPw.length < 6) { setError("비밀번호는 6자 이상이어야 합니다."); return; }
    if (newPw !== newPw2) { setError("비밀번호가 일치하지 않습니다."); return; }
    changePwMutation.mutate({ userId: pendingUser.userId, newPassword: newPw });
  };

  const handleGuestMode = () => router.replace("/(tabs)");

  // 고객 회원가입
  const suSendCode = () => {
    clearMsg();
    if (!suPhone.trim()) { setError("휴대전화 번호를 입력해주세요."); return; }
    sendCodeMutation.mutate(
      { phoneNumber: suPhone.trim(), purpose: "signup" },
      { onSuccess: (r: any) => { if (r?.success) { setSuCodeSent(true); setInfo("인증번호를 발송했습니다." + (r.devCode ? ` (테스트코드: ${r.devCode})` : "")); } else setError("인증번호 발송에 실패했습니다."); }, onError: () => setError("인증번호 발송 중 오류가 발생했습니다.") }
    );
  };
  const suVerify = () => {
    clearMsg();
    if (!suCode.trim()) { setError("인증번호를 입력해주세요."); return; }
    checkCodeMutation.mutate(
      { phoneNumber: suPhone.trim(), code: suCode.trim(), purpose: "signup" },
      { onSuccess: (r: any) => { if (r?.success) { setSuVerified(true); setInfo("휴대폰 인증이 완료되었습니다."); } else setError("인증번호가 올바르지 않습니다."); }, onError: () => setError("인증 확인 중 오류가 발생했습니다.") }
    );
  };
  const handleSignup = () => {
    Keyboard.dismiss();
    clearMsg();
    if (!suName.trim() || !suPhone.trim() || !suLoginId.trim() || !suPw) { setError("모든 항목을 입력해주세요."); return; }
    if (suPw.length < 6) { setError("비밀번호는 6자 이상이어야 합니다."); return; }
    if (!suVerified) { setError("휴대폰 인증을 먼저 완료해주세요."); return; }
    registerMutation.mutate(
      { loginId: suLoginId.trim(), password: suPw, name: suName.trim(), phoneNumber: suPhone.trim() },
      { onSuccess: (r: any) => { if (r?.success) { setInfo("회원가입이 완료되었습니다. 로그인해주세요."); setLoginId(suLoginId.trim()); setTimeout(() => go("login"), 1000); } else setError(r?.error ?? "회원가입에 실패했습니다."); }, onError: () => setError("회원가입 중 오류가 발생했습니다.") }
    );
  };

  // 기사 회원가입
  const techSendCode = () => {
    clearMsg();
    if (!techPhone.trim()) { setError("휴대전화 번호를 입력해주세요."); return; }
    sendCodeMutation.mutate(
      { phoneNumber: techPhone.trim(), purpose: "signup" },
      { onSuccess: (r: any) => { if (r?.success) { setTechCodeSent(true); setInfo("인증번호를 발송했습니다." + (r.devCode ? ` (테스트코드: ${r.devCode})` : "")); } else setError("인증번호 발송에 실패했습니다."); }, onError: () => setError("인증번호 발송 중 오류가 발생했습니다.") }
    );
  };
  const techVerifyCode = () => {
    clearMsg();
    if (!techCode.trim()) { setError("인증번호를 입력해주세요."); return; }
    checkCodeMutation.mutate(
      { phoneNumber: techPhone.trim(), code: techCode.trim(), purpose: "signup" },
      { onSuccess: (r: any) => { if (r?.success) { setTechVerified(true); setInfo("휴대폰 인증이 완료되었습니다."); } else setError("인증번호가 올바르지 않습니다."); }, onError: () => setError("인증 확인 중 오류가 발생했습니다.") }
    );
  };
  const handleTechSignup = () => {
    Keyboard.dismiss();
    clearMsg();
    if (!techName.trim() || !techPhone.trim() || !techLoginId.trim() || !techPw) { setError("모든 항목을 입력해주세요."); return; }
    if (techPw.length < 6) { setError("비밀번호는 6자 이상이어야 합니다."); return; }
    if (!techVerified) { setError("휴대폰 인증을 먼저 완료해주세요."); return; }
    registerTechMutation.mutate(
      { loginId: techLoginId.trim(), password: techPw, name: techName.trim(), phoneNumber: techPhone.trim() },
      {
        onSuccess: (r: any) => {
          if (r?.success) {
            setInfo("기사 가입 신청이 완료되었습니다.\n본사 승인 후 로그인이 가능합니다.");
            setTimeout(() => go("login"), 2000);
          } else setError(r?.error ?? "가입 신청에 실패했습니다.");
        },
        onError: () => setError("가입 신청 중 오류가 발생했습니다.")
      }
    );
  };

  // 지사장 회원가입
  const branchSendCode = () => {
    clearMsg();
    if (!branchPhone.trim()) { setError("휴대전화 번호를 입력해주세요."); return; }
    sendCodeMutation.mutate(
      { phoneNumber: branchPhone.trim(), purpose: "signup" },
      { onSuccess: (r: any) => { if (r?.success) { setBranchCodeSent(true); setInfo("인증번호를 발송했습니다." + (r.devCode ? ` (테스트코드: ${r.devCode})` : "")); } else setError("인증번호 발송에 실패했습니다."); }, onError: () => setError("인증번호 발송 중 오류가 발생했습니다.") }
    );
  };
  const branchVerifyCode = () => {
    clearMsg();
    if (!branchCode.trim()) { setError("인증번호를 입력해주세요."); return; }
    checkCodeMutation.mutate(
      { phoneNumber: branchPhone.trim(), code: branchCode.trim(), purpose: "signup" },
      { onSuccess: (r: any) => { if (r?.success) { setBranchVerified(true); setInfo("휴대폰 인증이 완료되었습니다."); } else setError("인증번호가 올바르지 않습니다."); }, onError: () => setError("인증 확인 중 오류가 발생했습니다.") }
    );
  };
  const handleBranchSignup = () => {
    Keyboard.dismiss();
    clearMsg();
    if (!branchName.trim() || !branchPhone.trim() || !branchLoginId.trim() || !branchPw) { setError("모든 항목을 입력해주세요."); return; }
    if (branchPw.length < 6) { setError("비밀번호는 6자 이상이어야 합니다."); return; }
    if (!branchVerified) { setError("휴대폰 인증을 먼저 완료해주세요."); return; }
    registerBranchMutation.mutate(
      { loginId: branchLoginId.trim(), password: branchPw, name: branchName.trim(), phoneNumber: branchPhone.trim() },
      {
        onSuccess: (r: any) => {
          if (r?.success) {
            setInfo("지사장 가입 신청이 완료되었습니다.\n본사 승인 후 로그인이 가능합니다.");
            setTimeout(() => go("login"), 2000);
          } else setError(r?.error ?? "가입 신청에 실패했습니다.");
        },
        onError: () => setError("가입 신청 중 오류가 발생했습니다.")
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
    if (!rpPhone.trim()) { setError("휴대전화 번호를 입력해주세요."); return; }
    sendCodeMutation.mutate(
      { phoneNumber: rpPhone.trim(), purpose: "reset" },
      { onSuccess: (r: any) => { if (r?.success) setInfo("인증번호를 발송했습니다." + (r.devCode ? ` (테스트코드: ${r.devCode})` : "")); else setError("인증번호 발송에 실패했습니다."); }, onError: () => setError("인증번호 발송 중 오류가 발생했습니다.") }
    );
  };
  const handleResetPw = () => {
    Keyboard.dismiss();
    clearMsg();
    if (!rpLoginId.trim() || !rpPhone.trim() || !rpCode.trim() || !rpPw) { setError("모든 항목을 입력해주세요."); return; }
    if (rpPw.length < 6) { setError("비밀번호는 6자 이상이어야 합니다."); return; }
    resetPwMutation.mutate(
      { loginId: rpLoginId.trim(), phoneNumber: rpPhone.trim(), code: rpCode.trim(), newPassword: rpPw },
      { onSuccess: (r: any) => { if (r?.success) { setInfo("비밀번호가 변경되었습니다. 새 비밀번호로 로그인해주세요."); setLoginId(rpLoginId.trim()); setTimeout(() => go("login"), 1000); } else setError(r?.error ?? "비밀번호 재설정에 실패했습니다."); }, onError: () => setError("비밀번호 재설정 중 오류가 발생했습니다.") }
    );
  };

  const Msg = () => (
    <>
      {error ? <Text style={s.errorText}>{error}</Text> : null}
      {info ? <Text style={s.infoText}>{info}</Text> : null}
    </>
  );

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
                <Text style={s.label}>아이디</Text>
                <TextInput style={s.input} value={loginId} onChangeText={setLoginId} onFocus={handleFocus} placeholder="아이디를 입력하세요" placeholderTextColor={colors.muted} returnKeyType="next" {...idInputProps} />
                <Text style={s.label}>비밀번호</Text>
                <View style={s.pwWrap}>
                  <TextInput style={[s.input, { flex: 1, borderWidth: 0, backgroundColor: "transparent" }]} value={password} onChangeText={setPassword} onFocus={handleFocus} placeholder="비밀번호를 입력하세요" placeholderTextColor={colors.muted} secureTextEntry={!showPw} returnKeyType="done" onSubmitEditing={handleLogin} {...idInputProps} />
                  <TouchableOpacity onPress={() => setShowPw(!showPw)} style={s.pwToggle}><Text style={{ fontSize: 18 }}>{showPw ? "🙈" : "👁"}</Text></TouchableOpacity>
                </View>

                <TouchableOpacity style={s.rememberRow} onPress={() => setRememberMe(!rememberMe)} activeOpacity={0.7}>
                  <View style={[s.checkbox, rememberMe && s.checkboxOn]}>{rememberMe ? <Text style={s.checkMark}>✓</Text> : null}</View>
                  <Text style={s.rememberText}>자동 로그인</Text>
                </TouchableOpacity>

                <Msg />
                <TouchableOpacity style={[s.loginBtn, loginMutation.isPending && s.loginBtnDisabled]} onPress={handleLogin} disabled={loginMutation.isPending} activeOpacity={0.8}>
                  {loginMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={s.loginBtnText}>로그인</Text>}
                </TouchableOpacity>
                <View style={s.linkRow}>
                  <TouchableOpacity onPress={() => go("findId")}><Text style={s.link}>아이디 찾기</Text></TouchableOpacity>
                  <Text style={s.linkDot}>·</Text>
                  <TouchableOpacity onPress={() => go("resetPw")}><Text style={s.link}>비밀번호 재설정</Text></TouchableOpacity>
                  <Text style={s.linkDot}>·</Text>
                  <TouchableOpacity onPress={() => go("signup")}><Text style={s.link}>회원가입</Text></TouchableOpacity>
                </View>
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
                {changePwMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={s.loginBtnText}>비밀번호 변경</Text>}
              </TouchableOpacity>
            </View>
          )}

          {/* ── 회원가입 (탭 선택) ── */}
          {view === "signup" && (
            <View style={s.form}>
              <Text style={s.formTitle}>회원가입</Text>

              {/* 가입 유형 탭 */}
              <View style={s.tabRow}>
                <TouchableOpacity
                  style={[s.tab, signupTab === "customer" && s.tabActive]}
                  onPress={() => { setSignupTab("customer"); clearMsg(); }}
                  activeOpacity={0.8}
                >
                  <Text style={[s.tabText, signupTab === "customer" && s.tabTextActive]}>👤 고객</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.tab, signupTab === "technician" && s.tabActive]}
                  onPress={() => { setSignupTab("technician"); clearMsg(); }}
                  activeOpacity={0.8}
                >
                  <Text style={[s.tabText, signupTab === "technician" && s.tabTextActive]}>🔧 기사</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.tab, signupTab === "branch" && s.tabActive]}
                  onPress={() => { setSignupTab("branch"); clearMsg(); }}
                  activeOpacity={0.8}
                >
                  <Text style={[s.tabText, signupTab === "branch" && s.tabTextActive]}>🏢 지사</Text>
                </TouchableOpacity>
              </View>

              {/* 고객 가입 폼 */}
              {signupTab === "customer" && (
                <>
                  <Text style={s.label}>이름</Text>
                  <TextInput style={s.input} value={suName} onChangeText={setSuName} onFocus={handleFocus} placeholder="이름" placeholderTextColor={colors.muted} />
                  <Text style={s.label}>휴대전화 번호</Text>
                  <View style={s.rowField}>
                    <TextInput style={[s.input, { flex: 1 }]} value={suPhone} onChangeText={setSuPhone} onFocus={handleFocus} placeholder="010-0000-0000" placeholderTextColor={colors.muted} keyboardType="phone-pad" />
                    <TouchableOpacity style={s.smallBtn} onPress={suSendCode}><Text style={s.smallBtnText}>인증요청</Text></TouchableOpacity>
                  </View>
                  {suCodeSent && (
                    <>
                      <Text style={s.label}>인증번호</Text>
                      <View style={s.rowField}>
                        <TextInput style={[s.input, { flex: 1 }]} value={suCode} onChangeText={setSuCode} onFocus={handleFocus} placeholder="인증번호 6자리" placeholderTextColor={colors.muted} keyboardType="number-pad" maxLength={6} />
                        <TouchableOpacity style={[s.smallBtn, { backgroundColor: "#6B7280" }]} onPress={suVerify}><Text style={s.smallBtnText}>확인</Text></TouchableOpacity>
                      </View>
                    </>
                  )}
                  <Text style={s.label}>아이디</Text>
                  <TextInput style={s.input} value={suLoginId} onChangeText={setSuLoginId} onFocus={handleFocus} placeholder="사용할 아이디 (영문 소문자)" placeholderTextColor={colors.muted} {...idInputProps} />
                  <Text style={s.label}>비밀번호</Text>
                  <TextInput style={s.input} value={suPw} onChangeText={setSuPw} onFocus={handleFocus} placeholder="비밀번호 (6자 이상)" placeholderTextColor={colors.muted} secureTextEntry {...idInputProps} />
                  <Msg />
                  <TouchableOpacity style={[s.loginBtn, registerMutation.isPending && s.loginBtnDisabled]} onPress={handleSignup} disabled={registerMutation.isPending} activeOpacity={0.8}>
                    {registerMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={s.loginBtnText}>가입하기</Text>}
                  </TouchableOpacity>
                </>
              )}

              {/* 기사 가입 폼 */}
              {signupTab === "technician" && (
                <>
                  <View style={s.noticeBox}>
                    <Text style={s.noticeText}>🔧 기사 계정은 본사 승인 후 활성화됩니다.{"\n"}가입 신청 후 담당 지사에 문의해주세요.</Text>
                  </View>
                  <Text style={s.label}>이름</Text>
                  <TextInput style={s.input} value={techName} onChangeText={setTechName} onFocus={handleFocus} placeholder="이름" placeholderTextColor={colors.muted} />
                  <Text style={s.label}>휴대전화 번호</Text>
                  <View style={s.rowField}>
                    <TextInput style={[s.input, { flex: 1 }]} value={techPhone} onChangeText={setTechPhone} onFocus={handleFocus} placeholder="010-0000-0000" placeholderTextColor={colors.muted} keyboardType="phone-pad" />
                    <TouchableOpacity style={s.smallBtn} onPress={techSendCode}><Text style={s.smallBtnText}>인증요청</Text></TouchableOpacity>
                  </View>
                  {techCodeSent && (
                    <>
                      <Text style={s.label}>인증번호</Text>
                      <View style={s.rowField}>
                        <TextInput style={[s.input, { flex: 1 }]} value={techCode} onChangeText={setTechCode} onFocus={handleFocus} placeholder="인증번호 6자리" placeholderTextColor={colors.muted} keyboardType="number-pad" maxLength={6} />
                        <TouchableOpacity style={[s.smallBtn, { backgroundColor: "#6B7280" }]} onPress={techVerifyCode}><Text style={s.smallBtnText}>확인</Text></TouchableOpacity>
                      </View>
                    </>
                  )}
                  <Text style={s.label}>아이디</Text>
                  <TextInput style={s.input} value={techLoginId} onChangeText={setTechLoginId} onFocus={handleFocus} placeholder="사용할 아이디 (영문 소문자)" placeholderTextColor={colors.muted} {...idInputProps} />
                  <Text style={s.label}>비밀번호</Text>
                  <TextInput style={s.input} value={techPw} onChangeText={setTechPw} onFocus={handleFocus} placeholder="비밀번호 (6자 이상)" placeholderTextColor={colors.muted} secureTextEntry {...idInputProps} />
                  <Msg />
                  <TouchableOpacity style={[s.loginBtn, { backgroundColor: "#FF6B35" }, registerTechMutation.isPending && s.loginBtnDisabled]} onPress={handleTechSignup} disabled={registerTechMutation.isPending} activeOpacity={0.8}>
                    {registerTechMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={s.loginBtnText}>기사 가입 신청</Text>}
                  </TouchableOpacity>
                </>
              )}

              {/* 지사장 가입 폼 */}
              {signupTab === "branch" && (
                <>
                  <View style={s.noticeBox}>
                    <Text style={s.noticeText}>🏢 지사장 계정은 본사 승인 후 활성화됩니다.{"\n"}가입 신청 후 본사에 문의해주세요.{"\n"}본사: 031-8042-7310</Text>
                  </View>
                  <Text style={s.label}>이름</Text>
                  <TextInput style={s.input} value={branchName} onChangeText={setBranchName} onFocus={handleFocus} placeholder="이름" placeholderTextColor={colors.muted} />
                  <Text style={s.label}>휴대전화 번호</Text>
                  <View style={s.rowField}>
                    <TextInput style={[s.input, { flex: 1 }]} value={branchPhone} onChangeText={setBranchPhone} onFocus={handleFocus} placeholder="010-0000-0000" placeholderTextColor={colors.muted} keyboardType="phone-pad" />
                    <TouchableOpacity style={s.smallBtn} onPress={branchSendCode}><Text style={s.smallBtnText}>인증요청</Text></TouchableOpacity>
                  </View>
                  {branchCodeSent && (
                    <>
                      <Text style={s.label}>인증번호</Text>
                      <View style={s.rowField}>
                        <TextInput style={[s.input, { flex: 1 }]} value={branchCode} onChangeText={setBranchCode} onFocus={handleFocus} placeholder="인증번호 6자리" placeholderTextColor={colors.muted} keyboardType="number-pad" maxLength={6} />
                        <TouchableOpacity style={[s.smallBtn, { backgroundColor: "#6B7280" }]} onPress={branchVerifyCode}><Text style={s.smallBtnText}>확인</Text></TouchableOpacity>
                      </View>
                    </>
                  )}
                  <Text style={s.label}>아이디</Text>
                  <TextInput style={s.input} value={branchLoginId} onChangeText={setBranchLoginId} onFocus={handleFocus} placeholder="사용할 아이디 (영문 소문자)" placeholderTextColor={colors.muted} {...idInputProps} />
                  <Text style={s.label}>비밀번호</Text>
                  <TextInput style={s.input} value={branchPw} onChangeText={setBranchPw} onFocus={handleFocus} placeholder="비밀번호 (6자 이상)" placeholderTextColor={colors.muted} secureTextEntry {...idInputProps} />
                  <Msg />
                  <TouchableOpacity style={[s.loginBtn, { backgroundColor: "#1A3A6B" }, registerBranchMutation.isPending && s.loginBtnDisabled]} onPress={handleBranchSignup} disabled={registerBranchMutation.isPending} activeOpacity={0.8}>
                    {registerBranchMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={s.loginBtnText}>지사장 가입 신청</Text>}
                  </TouchableOpacity>
                </>
              )}

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
              <Text style={s.label}>아이디</Text>
              <TextInput style={s.input} value={rpLoginId} onChangeText={setRpLoginId} onFocus={handleFocus} placeholder="아이디" placeholderTextColor={colors.muted} {...idInputProps} />
              <Text style={s.label}>휴대전화 번호</Text>
              <View style={s.rowField}>
                <TextInput style={[s.input, { flex: 1 }]} value={rpPhone} onChangeText={setRpPhone} onFocus={handleFocus} placeholder="010-0000-0000" placeholderTextColor={colors.muted} keyboardType="phone-pad" />
                <TouchableOpacity style={s.smallBtn} onPress={rpSendCode}><Text style={s.smallBtnText}>인증요청</Text></TouchableOpacity>
              </View>
              <Text style={s.label}>인증번호</Text>
              <TextInput style={s.input} value={rpCode} onChangeText={setRpCode} onFocus={handleFocus} placeholder="인증번호 6자리" placeholderTextColor={colors.muted} keyboardType="number-pad" maxLength={6} />
              <Text style={s.label}>새 비밀번호</Text>
              <TextInput style={s.input} value={rpPw} onChangeText={setRpPw} onFocus={handleFocus} placeholder="새 비밀번호 (6자 이상)" placeholderTextColor={colors.muted} secureTextEntry {...idInputProps} />
              <Msg />
              <TouchableOpacity style={[s.loginBtn, resetPwMutation.isPending && s.loginBtnDisabled]} onPress={handleResetPw} disabled={resetPwMutation.isPending} activeOpacity={0.8}>
                {resetPwMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={s.loginBtnText}>비밀번호 재설정</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => go("login")} style={{ marginTop: 14, alignItems: "center" }}><Text style={s.link}>← 로그인으로 돌아가기</Text></TouchableOpacity>
            </View>
          )}

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
    errorText: { color: colors.error, fontSize: 13, marginTop: 10, textAlign: "center" },
    infoText: { color: "#1D4ED8", fontSize: 13, marginTop: 10, textAlign: "center" },
    resultBox: { backgroundColor: colors.background, borderRadius: 10, padding: 12, marginTop: 10, fontSize: 14, fontWeight: "700", color: colors.foreground, textAlign: "center" },
    noticeBox: { backgroundColor: "#EFF6FF", borderRadius: 10, padding: 12, marginBottom: 4, marginTop: 8 },
    noticeText: { color: "#1D4ED8", fontSize: 13, lineHeight: 20 },
    loginBtn: { backgroundColor: "#FF6B35", borderRadius: 12, padding: 14, alignItems: "center", marginTop: 20 },
    loginBtnDisabled: { opacity: 0.6 },
    loginBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
    linkRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, marginTop: 16, flexWrap: "wrap" },
    link: { fontSize: 13, color: "#FF6B35", fontWeight: "600" },
    linkDot: { color: colors.muted },
    guestSection: { alignItems: "center", marginBottom: 24 },
    guestDesc: { fontSize: 13, color: colors.muted, marginBottom: 8 },
    guestBtn: { paddingVertical: 8, paddingHorizontal: 16 },
    guestBtnText: { fontSize: 14, color: "#FF6B35", fontWeight: "600" },
    footer: { textAlign: "center", fontSize: 12, color: colors.muted, lineHeight: 18 },
    // 가입 탭
    tabRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
    tab: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: colors.border, alignItems: "center", backgroundColor: colors.background },
    tabActive: { borderColor: "#FF6B35", backgroundColor: "#FFF5F0" },
    tabText: { fontSize: 14, fontWeight: "600", color: colors.muted },
    tabTextActive: { color: "#FF6B35" },
  });
