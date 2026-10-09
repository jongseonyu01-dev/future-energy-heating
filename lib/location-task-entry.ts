/**
 * Evaluated by the custom app entry before Expo Router creates its route context
 * or renders UI. This keeps the TaskManager definition available when Android
 * launches a cold/headless JS runtime for an existing LocationTaskService.
 */
import { registerLocationTrackingTask } from "@/lib/location-tracking";

registerLocationTrackingTask();
