const headers = {
  "Access-Control-Allow-Origin": "https://reseller.eztvclub.com",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers });
export function validInquiry(body: Record<string, unknown>) {
  const string = (key: string, min: number, max: number) =>
    typeof body[key] === "string" &&
    (body[key] as string).trim().length >= min &&
    (body[key] as string).length <= max;
  return (
    string("slug", 3, 48) &&
    /^[a-z0-9][a-z0-9-]{2,47}$/.test(body.slug as string) &&
    typeof body.id === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      body.id,
    ) &&
    string("name", 2, 100) &&
    string("email", 3, 254) &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((body.email as string).trim()) &&
    string("phone", 0, 40) &&
    string("device", 0, 100) &&
    string("message", 0, 1000) &&
    body.contact_consent === true &&
    typeof body.marketing_consent === "boolean" &&
    (body.referral == null ||
      (typeof body.referral === "string" && body.referral.length <= 100))
  );
}
export function createInquiryHandler(db: any, secret: string) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return reply({});
    if (req.method !== "POST")
      return reply({ error: "Method not allowed" }, 405);
    try {
      if (Number(req.headers.get("content-length") || 0) > 10000)
        return reply({ error: "Request too large" }, 413);
      const text = await req.text();
      if (text.length > 10000)
        return reply({ error: "Request too large" }, 413);
      let body: Record<string, unknown>;
      try {
        body = JSON.parse(text);
      } catch {
        return reply({ error: "Please check the inquiry form." }, 400);
      }
      if (!body || Array.isArray(body) || typeof body !== "object")
        return reply({ error: "Please check the inquiry form." }, 400);
      if (body.website) return reply({ success: true }); // Honeypot: acknowledge without creating a lead.
      if (!validInquiry(body))
        return reply(
          { error: "Please check your contact details and consent." },
          400,
        );
      if (!secret)
        return reply(
          {
            error:
              "Inquiries are temporarily unavailable. Please use the contact email.",
          },
          503,
        );
      // Hash only the proxy-supplied address; never retain or log raw IPs or headers.
      const ip =
        req.headers
          .get("x-forwarded-for")
          ?.split(",")
          .map((x) => x.trim())
          .filter(Boolean)
          .at(-1) ||
        req.headers.get("cf-connecting-ip") ||
        "unknown";
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
      const digest = await crypto.subtle.sign(
        "HMAC",
        key,
        encoder.encode(`sales-inquiry:${ip}`),
      );
      const hash = Array.from(new Uint8Array(digest), (b) =>
        b.toString(16).padStart(2, "0"),
      ).join("");
      const data = {
        name: body.name,
        email: body.email,
        phone: body.phone,
        device: body.device,
        message: body.message,
        referral: body.referral || null,
        contact_consent: true,
        marketing_consent: body.marketing_consent,
      };
      const result = await db.rpc("submit_public_sales_inquiry", {
        p_id: body.id,
        p_slug: body.slug,
        p_data: data,
        p_ip_hash: hash,
      });
      if (result.error)
        return reply(
          {
            error:
              "We could not confirm this inquiry. Retry the same form, or use the contact email.",
          },
          503,
        );
      if (result.data === "rate_limited")
        return reply(
          {
            error:
              "Too many recent inquiries. Please try later or use the contact email.",
          },
          429,
        );
      if (result.data !== "received")
        return reply(
          {
            error:
              "We could not confirm this inquiry. Please retry the same form.",
          },
          503,
        );
      return reply({ success: true });
    } catch {
      return reply(
        {
          error:
            "We could not confirm this inquiry. Please retry the same form.",
        },
        503,
      );
    }
  };
}
