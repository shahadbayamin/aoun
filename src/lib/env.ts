function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable ${name}`);
  return v;
}

export const env = {
  get appUrl() {
    const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
    return (process.env.APP_URL || (vercel ? `https://${vercel}` : "http://localhost:3000")).replace(/\/$/, "");
  },
  get demoMode() {
    return process.env.DEMO_MODE === "true";
  },
  get storageDir() {
    return process.env.STORAGE_DIR || "./storage";
  },
  get storageKey() {
    return Buffer.from(req("STORAGE_ENCRYPTION_KEY"), "base64");
  },
  get secretsKey() {
    return Buffer.from(req("SECRETS_ENCRYPTION_KEY"), "base64");
  },
  get identityPepper() {
    return req("IDENTITY_PEPPER");
  },
  get secureCookies() {
    return process.env.NODE_ENV === "production" && this.appUrl.startsWith("https://");
  },
};
