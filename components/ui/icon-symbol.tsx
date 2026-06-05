// Fallback for using MaterialIcons on Android and web.

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { SymbolWeight, SymbolViewProps } from "expo-symbols";
import { ComponentProps } from "react";
import { OpaqueColorValue, type StyleProp, type TextStyle } from "react-native";

type IconMapping = Record<SymbolViewProps["name"], ComponentProps<typeof MaterialIcons>["name"]>;
type IconSymbolName = keyof typeof MAPPING;

/**
 * Add your SF Symbols to Material Icons mappings here.
 */
const MAPPING = {
  "house.fill": "home",
  "paperplane.fill": "send",
  "chevron.left.forwardslash.chevron.right": "code",
  "chevron.right": "chevron-right",
  "chevron.left": "chevron-left",
  "wrench.and.screwdriver.fill": "build",
  "calendar": "calendar-today",
  "checkmark.circle.fill": "check-circle",
  "person.fill": "person",
  "phone.fill": "phone",
  "camera.fill": "camera-alt",
  "doc.text.fill": "description",
  "magnifyingglass": "search",
  "list.bullet": "list",
  "gear": "settings",
  "xmark": "close",
  "plus": "add",
  "arrow.right": "arrow-forward",
  "exclamationmark.triangle.fill": "warning",
  "info.circle.fill": "info",
  "clock.fill": "access-time",
  "location.fill": "location-on",
  "flame.fill": "local-fire-department",
  "drop.fill": "water-drop",
  "thermometer": "thermostat",
  "building.2.fill": "apartment",
  "headphones": "headset",
  "phone.circle.fill": "support-agent",
} as IconMapping;

/**
 * An icon component that uses native SF Symbols on iOS, and Material Icons on Android and web.
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  return <MaterialIcons color={color} size={size} name={MAPPING[name]} style={style} />;
}
