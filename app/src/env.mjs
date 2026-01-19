export const env = {
  NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME || "DMS",
  SMTP_FROM: process.env.SMTP_FROM || "",
  SENDGRID_API_KEY: process.env.SENDGRID_API_KEY || "",
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  DOCUMENT_API_URL: process.env.DOCUMENT_API_URL || "http://localhost:9219",
  NEXT_PUBLIC_DOCUMENT_API_URL: process.env.NEXT_PUBLIC_DOCUMENT_API_URL || process.env.DOCUMENT_API_URL || "http://localhost:9219",
  DO_SPACES_ENDPOINT_URL: process.env.DO_SPACES_ENDPOINT_URL || "",
  DO_SPACES_ACCESS_KEY: process.env.DO_SPACES_ACCESS_KEY || "",
  DO_SPACES_SECRET_KEY: process.env.DO_SPACES_SECRET_KEY || "",
  DO_SPACES_ENDPOINT: process.env.DO_SPACES_ENDPOINT || "",
  DO_SPACES_NAME: process.env.DO_SPACES_NAME || "",
};
