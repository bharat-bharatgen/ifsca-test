import { env } from "@/env.mjs";
import { sendEmailSendGrid } from "@/lib/sendgrid";

const theme = {
  brandColor: "#6d28d9",
  buttonText: "#ffffff",
};

/**
 * Send invitation email to a new user
 * @param {Object} params - Email parameters
 * @param {string} params.email - Recipient email
 * @param {string} params.password - Auto-generated password
 * @param {string} params.organizationName - Name of the organization
 * @param {string} params.invitedByName - Name of the person who sent the invitation
 */
export async function sendInvitationMail({ email, password, organizationName, invitedByName }) {
  console.log("Sending invitation email to", email);
  console.log("password", password);
  if (!env.SENDGRID_API_KEY || !env.SMTP_FROM) {
    throw new Error("Missing SendGrid API key or FROM email in env");
  }

  const htmlContent = html({ email, password, organizationName, invitedByName });
  const subject = `You've been invited to join ${organizationName} | ${env.NEXT_PUBLIC_APP_NAME}`;

  await sendEmailSendGrid(env.SMTP_FROM, email, subject, htmlContent);
}

const html = ({ email, password, organizationName, invitedByName }) => {
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
    warningBackground: "#fff3cd",
    warningBorder: "#ffc107",
    warningText: "#856404",
  };

  // Use NEXT_PUBLIC_APP_URL directly
  const appBaseUrl = env.NEXT_PUBLIC_APP_URL;
  const logoUrl = `${appBaseUrl}/icon.png`;
  const loginUrl = `${appBaseUrl}/login`;

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
        You've Been Invited!
      </td>
    </tr>
    <tr>
      <td style="font-size: 16px; color: ${color.text};">
        <p style="margin-bottom: 20px;">
          <strong>${invitedByName}</strong> has invited you to join <strong>${organizationName}</strong> on ${env.NEXT_PUBLIC_APP_NAME}.
        </p>
        <p style="margin-bottom: 20px;">Your account has been created. Use the following credentials to log in:</p>
        
        <table width="100%" border="0" cellspacing="0" cellpadding="15"
          style="background: #f5f5f5; border-radius: 8px; margin-bottom: 20px;">
          <tr>
            <td style="font-size: 14px; color: ${color.text};">
              <strong>Email:</strong> ${email}<br><br>
              <strong>Password:</strong> <code style="background: #e0e0e0; padding: 4px 8px; border-radius: 4px;">${password}</code>
            </td>
          </tr>
        </table>
        
        <table width="100%" border="0" cellspacing="0" cellpadding="15"
          style="background: ${color.warningBackground}; border: 1px solid ${color.warningBorder}; border-radius: 8px; margin-bottom: 20px;">
          <tr>
            <td style="font-size: 14px; color: ${color.warningText};">
              <strong>⚠️ Important:</strong> Please change your password after your first login for security purposes.
            </td>
          </tr>
        </table>

        <p style="text-align: center;">
          <a href="${loginUrl}" target="_blank" rel="noopener noreferrer" 
            style="display: inline-block; background-color: ${color.buttonBackground}; color: ${color.buttonText}; 
            padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">
            Login Now
          </a>
        </p>
      </td>
    </tr>
    <tr>
      <td align="center" style="font-size: 16px; color: ${color.text}; margin-top: 20px;">
        <p>Welcome to the team!<br>The ${env.NEXT_PUBLIC_APP_NAME} Team</p>
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
