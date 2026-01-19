import { sendEmailSendGrid } from "./sendgrid";
import { env } from "@/env.mjs";

export async function sendOTPVerificationMail({ email, otp }) {
  // Just log the OTP to console instead of sending email
  console.log(`[OTP] Email: ${email}, OTP: ${otp}`);
  const mailOptions = {
    to: email,
    subject: `OTP Verification | ${env.NEXT_PUBLIC_APP_NAME}`,
    html: html({ otp }),
    text: text({ otp }),
  };
  try {
    await sendEmailSendGrid(env.SMTP_FROM, email, mailOptions.subject, mailOptions.html);
    console.log("[otp] Email sent to", email);
  } catch (error) {
    console.error("Error sending OTP email:", error);
    throw error;
  }
}

const html = ({ otp }) => {
  const brandColor = "#6d28d9";
  const color = {
    background: "#f9f9f9",
    text: "#444",
    mainBackground: "#ffffff",
    buttonBackground: brandColor,
    buttonBorder: brandColor,
    buttonText: "#ffffff",
    footerBackground: "#f1f1f1",
    footerText: "#888",
  };

  // Build a safe, absolute logo URL for email clients
  const defaultLogoUrl = "https://dms.outriskai.com/icon.png";
  const baseUrl = env.NEXT_PUBLIC_APP_URL || "";
  const isValidPublicBase = typeof baseUrl === "string"
    && baseUrl.startsWith("http")
    && !baseUrl.includes("localhost");
  const logoUrl = isValidPublicBase ? `${baseUrl}/icon.png` : defaultLogoUrl;

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
        Verify Your Account
      </td>
    </tr>
    <tr>
      <td style="font-size: 16px; color: ${color.text};">
        <p style="margin-bottom: 20px;">Use the following One-Time Password (OTP) to verify your account:</p>
        <p style="text-align: center; font-size: 24px; font-weight: bold; color: ${brandColor};">
          ${otp}
        </p>
        <p style="margin-top: 20px;">This OTP is valid for 5 minutes. If you did not request this, please ignore this email.</p>
      </td>
    </tr>
    <tr>
      <td align="center" style="font-size: 16px; color: ${color.text}; margin-top: 20px;">
        <p>Thank you,<br>The ${env.NEXT_PUBLIC_APP_NAME} Team</p>
      </td>
    </tr>
  </table>
</body>
`;
};

function text({ otp }) {
  return `
OTP Verification

Use the following One-Time Password (OTP) to verify your account:
${otp}

This OTP is valid for 5 minutes. If you did not request this, please ignore this email.

Thank you,
The ${env.NEXT_PUBLIC_APP_NAME} Team
  `;
}

