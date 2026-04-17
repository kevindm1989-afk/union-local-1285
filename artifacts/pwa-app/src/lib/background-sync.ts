import { BackgroundSyncPlugin } from "workbox-background-sync";

export const bgSyncPlugin = new BackgroundSyncPlugin("offline-writes", {
  maxRetentionTime: 24 * 60,
});
