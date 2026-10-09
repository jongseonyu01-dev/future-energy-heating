/**
 * Keep background task definition outside Expo Router route evaluation.
 * The Router entry remains responsible for normal app registration and UI.
 */
import "./lib/location-task-entry";
import "expo-router/entry";
