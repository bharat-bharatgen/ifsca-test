import axios from "axios";
import dns from "dns";
import net from "net";
import { axiosWithRetry } from "@/lib/retry-utils";

// Basic SSRF protection helpers for webhook URLs
const isPrivateOrDisallowedIp = (ip) => {
  const family = net.isIP(ip);

  if (family === 4) {
    const parts = ip.split(".").map((p) => parseInt(p, 10));
    const [a, b] = parts;

    // 10.0.0.0/8
    if (a === 10) return true;
    // 172.16.0.0/12
    if (a === 172 && b >= 16 && b <= 31) return true;
    // 192.168.0.0/16
    if (a === 192 && b === 168) return true;
    // 127.0.0.0/8 (localhost)
    if (a === 127) return true;
    // 169.254.0.0/16 (link-local, includes 169.254.169.254 metadata)
    if (a === 169 && b === 254) return true;
  } else if (family === 6) {
    const lower = ip.toLowerCase();
    // IPv6 localhost
    if (lower === "::1") return true;
    // Link-local IPv6
    if (lower.startsWith("fe80:")) return true;
  }

  return false;
};

const validateWebhookUrl = async (urlString) => {
  let url;

  try {
    url = new URL(urlString);
  } catch {
    return {
      ok: false,
      message: "Invalid webhook URL",
    };
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    return {
      ok: false,
      message: "Webhook URL must use http or https",
    };
  }

  const hostname = url.hostname;

  // Block obvious local hosts
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]"
  ) {
    return {
      ok: false,
      message: "Webhook URL cannot point to localhost or loopback addresses",
    };
  }

  let addresses = [];
  const ipVersion = net.isIP(hostname);

  if (ipVersion) {
    // Hostname is already an IP literal
    addresses = [{ address: hostname, family: ipVersion }];
  } else {
    try {
      addresses = await dns.promises.lookup(hostname, { all: true });
    } catch (err) {
      console.error("[Webhook] DNS lookup failed for webhook host:", {
        hostname,
        error: err?.message || String(err),
      });
      return {
        ok: false,
        message: "Failed to resolve webhook host",
      };
    }
  }

  for (const addr of addresses) {
    if (isPrivateOrDisallowedIp(addr.address)) {
      return {
        ok: false,
        message:
          "Webhook URL host resolves to a private or local IP address, which is not allowed",
      };
    }
  }

  return { ok: true };
};

/**
 * Call a webhook URL with the provided payload
 * Includes retry logic for transient failures
 * @param {string} webhookUrl - The webhook URL to call
 * @param {object} payload - The payload to send
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function callWebhook(webhookUrl, payload) {
  if (!webhookUrl) {
    return { success: false, error: "Webhook URL not provided" };
  }

  const validation = await validateWebhookUrl(webhookUrl);
  if (!validation.ok) {
    return { success: false, error: validation.message };
  }

  try {
    // Use retry logic for webhook calls
    await axiosWithRetry(
      () => axios.post(webhookUrl, payload, {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 30000, // 30 second timeout
      }),
      {
        maxRetries: 3,
        initialDelay: 2000, // 2 seconds
        maxDelay: 10000, // 10 seconds
      }
    );
    
    return { success: true };
  } catch (error) {
    const errorMessage = error?.response?.data?.message || error?.message || "Unknown error";
    console.error(`Webhook call failed for ${webhookUrl}:`, errorMessage);
    return { success: false, error: errorMessage };
  }
}

