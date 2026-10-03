export type TechnicianQuickMenuItem = {
  id: "profile" | "estimate-review";
  title: string;
  icon: string;
  route: "/my-profile" | "/tech-estimate";
  color: string;
  backgroundColor: string;
};

/**
 * Keeps the existing technician-only utility links outside the four primary
 * schedule cards. The review entry remains unavailable unless its original
 * build-time review-mode flag is explicitly enabled.
 */
export function getTechnicianQuickMenuItems(
  isEstimateReviewMode: boolean,
): TechnicianQuickMenuItem[] {
  const items: TechnicianQuickMenuItem[] = [
    {
      id: "profile",
      title: "내 정보",
      icon: "👤",
      route: "/my-profile",
      color: "#7C3AED",
      backgroundColor: "#F5F3FF",
    },
  ];

  if (isEstimateReviewMode) {
    items.push({
      id: "estimate-review",
      title: "견적 검수",
      icon: "🧪",
      route: "/tech-estimate",
      color: "#7C3AED",
      backgroundColor: "#F5F3FF",
    });
  }

  return items;
}
