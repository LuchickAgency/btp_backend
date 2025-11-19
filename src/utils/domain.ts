export function extractDomain(emailOrUrl: string | null): string | null {
  if (!emailOrUrl) return null;

  try {
    // Cas email → user@domain.com
    if (emailOrUrl.includes("@")) {
      return emailOrUrl.split("@")[1].trim().toLowerCase();
    }

    // Cas URL → https://domain.com
    const url = new URL(
      emailOrUrl.startsWith("http") ? emailOrUrl : `https://${emailOrUrl}`
    );

    return url.hostname.replace("www.", "").toLowerCase();
  } catch {
    return null;
  }
}
