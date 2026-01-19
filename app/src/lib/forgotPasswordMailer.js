import { env } from "@/env.mjs";
import { sendEmailSendGrid } from "@/lib/sendgrid";

const theme = {
  brandColor: "#6d28d9",
  buttonText: "#ffffff",
};

export async function sendResetPasswordMail({ email, token }) {
  if (!env.SENDGRID_API_KEY || !env.SMTP_FROM) {
    throw new Error("Missing SendGrid API key or FROM email in env");
  }

  const htmlContent = html({ token });
  const subject = `Password Reset Request | ${env.NEXT_PUBLIC_APP_NAME}`;

  await sendEmailSendGrid(env.SMTP_FROM, email, subject, htmlContent);
}

const html = ({ token }) => {
  const brandColor = theme.brandColor || "#346df1";
  const color = {
    background: "#f9f9f9",
    text: "#444",
    mainBackground: "#ffffff",
    buttonBackground: brandColor,
    buttonBorder: brandColor,
    buttonText: theme.buttonText || "#ffffff",
    footerBackground: "#f1f1f1",
    footerText: "#888",
  };

  // Use NEXT_PUBLIC_APP_URL directly
  const appBaseUrl = env.NEXT_PUBLIC_APP_URL;
  const logoUrl = `${appBaseUrl}/icon.png`;
  const resetPasswordUrl = `${appBaseUrl}/reset-pass/${token}`;

  return `
<body style="background: ${color.background}; padding: 20px; font-family: Helvetica, Arial, sans-serif;">
  <table width="100%" border="0" cellspacing="20" cellpadding="0"
    style="background: ${color.mainBackground}; max-width: 600px; margin: auto; border-radius: 10px; padding: 20px; border: 1px solid #ddd;">
    <tr>
      <td align="center" style="padding: 10px 0;">
        <img
          src="${logoUrl}"
          alt="${env.NEXT_PUBLIC_APP_NAME} logo"
          width="120"
          height="120"
          style="display:block; border-radius: 16px; margin-bottom: 16px;"
        />
      </td>
    </tr>
    <tr>
      <td align="center" style="font-size: 20px; font-weight: bold; color: ${color.text}; margin-bottom: 20px;">
        Password Reset Request
      </td>
    </tr>
    <tr>
      <td style="font-size: 16px; color: ${color.text};">
        <p style="margin-bottom: 20px;">You requested a password reset. Click the link below to reset your password:</p>
        <p style="text-align: center;">
          <a href="${resetPasswordUrl}" target="_blank" rel="noopener noreferrer" 
            style="display: inline-block; background-color: ${color.buttonBackground}; color: ${color.buttonText}; 
            padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">
            Reset Password
          </a>
        </p>
        <p style="margin-top: 20px;">If you did not request this, please ignore this email.</p>
      </td>
    </tr>
    <tr>
      <td align="center" style="font-size: 16px; color: ${color.text}; margin-top: 20px;">
        <p>Thank you,<br>The ${env.NEXT_PUBLIC_APP_NAME} Team</p>
      </td>
    </tr>
    <tr>
      <td style="background: ${color.footerBackground}; color: ${color.footerText}; font-size: 14px; padding: 20px; text-align: center; border-radius: 0 0 10px 10px;">
        <p>&copy; ${new Date().getFullYear()} ${env.NEXT_PUBLIC_APP_NAME}. All rights reserved.</p>
      </td>
    </tr>
  </table>
</body>
`;
};
