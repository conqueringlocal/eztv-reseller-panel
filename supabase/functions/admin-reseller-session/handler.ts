const headers = {
  "Access-Control-Allow-Origin": "https://reseller.eztvclub.com",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};
const reply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers });
const uuid = (s: unknown) =>
  typeof s === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    s,
  );
// Only decode after auth.getUser has validated this exact bearer token.
const claims = (token: string) =>
  JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
export function createSupportHandler(db: any, createSessionClient: () => any) {
  return async (req: Request) => {
    if (req.method === "OPTIONS") return reply({});
    if (req.method !== "POST")
      return reply({ error: "Method not allowed" }, 405);
    let auditId: string | undefined, issuedToken: string | undefined;
    try {
      const token = req.headers
        .get("authorization")
        ?.match(/^Bearer (.+)$/i)?.[1];
      if (!token) return reply({ error: "Sign in required" }, 401);
      const auth = await db.auth.getUser(token);
      if (auth.error || !auth.data?.user)
        return reply({ error: "Sign in required" }, 401);
      const actor = auth.data.user;
      const raw = await req.text();
      if (raw.length > 2000) return reply({ error: "Request too large" }, 413);
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        return reply({ error: "Invalid request" }, 400);
      }
      if (!body || !["start", "end"].includes(body.action))
        return reply({ error: "Invalid request" }, 400);
      if (body.action === "end") {
        const sid = claims(token).session_id;
        if (!uuid(sid))
          return reply({ error: "Support session not found" }, 403);
        const row = await db
          .from("admin_reseller_sessions")
          .select("id,status")
          .eq("auth_session_id", sid)
          .eq("reseller_id", actor.id)
          .maybeSingle();
        if (row.error || !row.data)
          return reply({ error: "Support session not found" }, 403);
        const ended = await db.auth.admin.signOut(token, "local");
        if (ended.error) throw new Error("signout_failed");
        const saved = await db
          .from("admin_reseller_sessions")
          .update({ status: "ended", ended_at: new Date().toISOString() })
          .eq("id", row.data.id);
        if (saved.error) throw new Error("audit_failed");
        return reply({ success: true });
      }
      const role = await db.rpc("has_role", {
        _user_id: actor.id,
        _role: "admin",
      });
      if (role.error || role.data !== true)
        return reply({ error: "Administrator access required" }, 403);
      if (
        actor.factors?.some((f: any) => f.status === "verified") &&
        claims(token).aal !== "aal2"
      )
        return reply(
          { error: "Complete your administrator MFA sign-in first" },
          403,
        );
      if (!uuid(body.reseller_id) || body.reseller_id === actor.id)
        return reply({ error: "Select a reseller account" }, 400);
      const target = await db
        .from("profiles")
        .select("id,name,role")
        .eq("id", body.reseller_id)
        .single();
      const targetRole = await db.rpc("has_role", {
        _user_id: body.reseller_id,
        _role: "admin",
      });
      if (
        target.error ||
        target.data?.role !== "reseller" ||
        targetRole.error ||
        targetRole.data !== false
      )
        return reply({ error: "Select a reseller account" }, 400);
      // Auth's canonical email, not the editable profile email, chooses the identity.
      const existing = await db.auth.admin.getUserById(body.reseller_id);
      const user = existing.data?.user;
      if (
        existing.error ||
        !user?.email ||
        !user.email_confirmed_at ||
        user.id !== body.reseller_id ||
        user.is_anonymous ||
        user.deleted_at ||
        (user.banned_until && new Date(user.banned_until) > new Date())
      )
        return reply({ error: "This reseller cannot be signed in" }, 400);
      const claim = await db.rpc("claim_admin_reseller_session", {
        p_admin: actor.id,
        p_reseller: user.id,
      });
      if (claim.error || !claim.data)
        return reply(
          { error: "Could not start a support session. Please try later." },
          429,
        );
      auditId = claim.data;
      const link = await db.auth.admin.generateLink({
        type: "magiclink",
        email: user.email,
      });
      if (
        link.error ||
        link.data?.user?.id !== user.id ||
        !link.data?.properties?.hashed_token
      )
        throw new Error("link_failed");
      const sessionClient = createSessionClient();
      const verified = await sessionClient.auth.verifyOtp({
        type: "magiclink",
        token_hash: link.data.properties.hashed_token,
      });
      const session = verified.data?.session;
      issuedToken = session?.access_token;
      if (
        verified.error ||
        !session ||
        session.user?.id !== user.id ||
        !session.refresh_token
      )
        throw new Error("session_failed");
      const sid = claims(session.access_token).session_id;
      if (
        !uuid(sid) ||
        !Number.isFinite(session.expires_at) ||
        session.expires_at <= Date.now() / 1000
      )
        throw new Error("session_invalid");
      const saved = await db
        .from("admin_reseller_sessions")
        .update({
          status: "active",
          auth_session_id: sid,
          expires_at: new Date(session.expires_at * 1000).toISOString(),
        })
        .eq("id", auditId)
        .eq("status", "pending")
        .select("id")
        .single();
      if (saved.error || !saved.data) throw new Error("audit_failed");
      return reply({
        success: true,
        support: {
          id: auditId,
          reseller_id: user.id,
          name: target.data.name,
          expires_at: session.expires_at,
        },
        session: {
          access_token: session.access_token,
          refresh_token: "support-session-does-not-refresh",
        },
      });
    } catch {
      if (issuedToken)
        await db.auth.admin.signOut(issuedToken, "local").catch(() => {});
      if (auditId)
        await db
          .from("admin_reseller_sessions")
          .update({ status: "failed", ended_at: new Date().toISOString() })
          .eq("id", auditId)
          .then(
            () => {},
            () => {},
          );
      return reply(
        {
          error:
            "Could not complete the support session. Please retry from your admin tab.",
        },
        503,
      );
    }
  };
}
