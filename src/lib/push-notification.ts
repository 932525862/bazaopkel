import { API } from "./api/client";

const VAPID_PUBLIC_KEY = "BIMz7tUAkwQ4nF-TNUzpKVhYMFp5BDvL9TveoxjJhlOrVYoRpcEK-bRZOMCG6QgpFRBT9e38-gTyZLceV17Dcyg";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function registerPushNotifications() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    console.warn("Push notifications not supported");
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
    });
    
    console.log("Service Worker registered");

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      console.warn("Notification permission denied");
      return;
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    await API.subscribePush(subscription);
    console.log("Push subscription sent to backend");
  } catch (err) {
    console.error("Failed to register push notifications", err);
  }
}
