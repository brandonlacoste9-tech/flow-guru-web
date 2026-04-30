import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "flow_guru_guest_device_id";

function randomUuidV4(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Per-install stable UUID — maps server-side to fg_users row openId `mobile:<uuid>`. */
export async function getOrCreateGuestDeviceId(): Promise<string> {
  const existing = await AsyncStorage.getItem(STORAGE_KEY);
  if (existing && /^[0-9a-f-]{36}$/i.test(existing)) {
    return existing;
  }
  const next = randomUuidV4();
  await AsyncStorage.setItem(STORAGE_KEY, next);
  return next;
}
