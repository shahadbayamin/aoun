import os from "node:os";
import { env } from "./env";

/**
 * Address other devices (e.g. the patient's or doctor's phone on the same Wi-Fi) can open.
 * PUBLIC_URL overrides; otherwise the computer's local network IP is used.
 */
export function publicBaseUrl() {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, "");
  if (process.env.VERCEL) return env.appUrl;
  const port = process.env.PORT || "3000";
  const nets = os.networkInterfaces();
  const candidates: string[] = [];
  for (const [name, list] of Object.entries(nets)) {
    for (const n of list ?? []) {
      if (n.family !== "IPv4" || n.internal) continue;
      if (/^(utun|awdl|llw|bridge|vmnet|docker|veth)/.test(name)) continue;
      candidates.push(n.address);
    }
  }
  const ip = candidates.find((a) => a.startsWith("192.168.")) ?? candidates.find((a) => a.startsWith("10.") || a.startsWith("172.")) ?? candidates[0];
  return ip ? `http://${ip}:${port}` : `http://localhost:${port}`;
}
