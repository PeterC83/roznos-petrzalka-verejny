import { Email } from "@convex-dev/auth/providers/Email";

export const ResendOTP = Email({
  id: "resend-otp",
  maxAge: 60 * 15,
  authorize: undefined,
  async generateVerificationToken() {
    return crypto.randomUUID();
  },
  async sendVerificationRequest({ identifier: email, url }) {
    const endpoint = process.env.EMAIL_NOTIFICATION_ENDPOINT;
    const apiToken = process.env.MACALY_API_TOKEN;
    const chatId = process.env.MACALY_CHAT_ID;
    if (!endpoint || !apiToken || !chatId) throw new Error("Email service is not configured.");

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiToken}` },
      body: JSON.stringify({
        toEmail: email,
        subject: "Prihlásenie do Roznosu Petržalka",
        message: `Kliknutím na tento jednorazový odkaz sa prihlásite do aplikácie:\n\n${url}\n\nOdkaz platí 15 minút a funguje iba raz. Ak ste ho nevyžiadali, tento e-mail ignorujte.`,
        chatId,
        appName: "Roznos Petržalka",
        secretKey: process.env.SECRET_KEY ?? apiToken,
      }),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || "Failed to send sign-in link");
    }
  },
});