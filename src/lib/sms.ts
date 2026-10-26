/**
 * SMS delivery for the patient sign-in code.
 * Configure ONE provider in .env:
 *   Twilio  : SMS_PROVIDER="twilio"  TWILIO_ACCOUNT_SID  TWILIO_AUTH_TOKEN  TWILIO_FROM (sender number, e.g. +1555…)
 *   Taqnyat : SMS_PROVIDER="taqnyat" TAQNYAT_TOKEN  TAQNYAT_SENDER (approved sender name)
 * When no provider is configured, no SMS is sent and the fixed demo code (OTP_FIXED_CODE) is used.
 */

export function smsProvider(): "twilio" | "taqnyat" | null {
  const p = (process.env.SMS_PROVIDER || "").trim().toLowerCase();
  if (p === "twilio" && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM) return "twilio";
  if (p === "taqnyat" && process.env.TAQNYAT_TOKEN && process.env.TAQNYAT_SENDER) return "taqnyat";
  return null;
}

/** 05XXXXXXXX → +9665XXXXXXXX */
export const toInternational = (phone: string) => "+966" + phone.replace(/\D/g, "").replace(/^0/, "");

export async function sendSms(phone: string, body: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const provider = smsProvider();
  if (!provider) return { ok: false, error: "NO_PROVIDER" };
  const to = toInternational(phone);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15_000);
  try {
    if (provider === "twilio") {
      const sid = process.env.TWILIO_ACCOUNT_SID!;
      const r = await fetch(`${process.env.TWILIO_API_BASE || "https://api.twilio.com"}/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
        method: "POST",
        signal: ctl.signal,
        headers: { authorization: "Basic " + Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64"), "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ To: to, From: process.env.TWILIO_FROM!, Body: body }).toString(),
      });
      if (!r.ok) return { ok: false, error: `twilio ${r.status}: ${(await r.text()).slice(0, 300)}` };
      return { ok: true };
    }
    const r = await fetch("https://api.taqnyat.sa/v1/messages", {
      method: "POST",
      signal: ctl.signal,
      headers: { authorization: `Bearer ${process.env.TAQNYAT_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ recipients: [to.replace("+", "")], body, sender: process.env.TAQNYAT_SENDER }),
    });
    if (!r.ok) return { ok: false, error: `taqnyat ${r.status}: ${(await r.text()).slice(0, 300)}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String((e as Error).message || e) };
  } finally {
    clearTimeout(timer);
  }
}
