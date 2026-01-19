import sgMail from "@sendgrid/mail";

export const sendEmailSendGrid = async (from, to, subject, html) => {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);

  const msg = {
    to,
    from: from,
    subject,
    html: html,
  };

  try {
    await sgMail.send(msg);
    console.log("[sendgrid] Email sent to", to);
  } catch (error) {
    console.error("[sendgrid] Error:", error);
    throw error;
  }
};

