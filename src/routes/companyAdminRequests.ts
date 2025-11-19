import { Router } from "express";
import { db } from "../db";
import { companies, companyAdminRequests } from "../schema";
import { eq, and, sql } from "drizzle-orm";
import crypto from "crypto";

import { requireAuth } from "../middleware/requireAuth";
import { extractDomain } from "../utils/domain";
import { mailer } from "../utils/mailer";

const router = Router();

const GENERIC_DOMAINS = ["gmail.com", "outlook.com", "hotmail.com", "yahoo.com", "live.com"];

/* ---------------------------------------------------------
   POST /companies/admin-requests/:companyId
   → Créer une demande pour devenir ADMIN d'une société
--------------------------------------------------------- */
router.post("/:companyId", requireAuth, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { companyId } = req.params;

    // 1. vérifier que la société existe
    const companiesRows = await db
      .select()
      .from(companies)
      .where(eq(companies.id, companyId));

    if (companiesRows.length === 0) {
      return res.status(404).json({ error: "Company not found" });
    }

    const comp = companiesRows[0];

    // 2. extraire les domaines potentiels
    const domainEmail = extractDomain(comp.email || null);
    const domainWebsite = extractDomain(comp.website || null);

    let chosenDomain: string | null = null;

    if (domainEmail && !GENERIC_DOMAINS.some((g) => domainEmail.includes(g))) {
      chosenDomain = domainEmail;
    } else if (domainWebsite) {
      chosenDomain = domainWebsite;
    }

    if (!chosenDomain) {
      return res.status(400).json({
        error: "NO_DOMAIN_AVAILABLE",
        message:
          "Impossible de vérifier automatiquement. Aucun domaine professionnel disponible.",
      });
    }

    // 3. éviter de spammer : si une demande pending non expirée existe déjà
    const now = new Date();
    const existing = await db
      .select()
      .from(companyAdminRequests)
      .where(
        and(
          eq(companyAdminRequests.companyId, companyId),
          eq(companyAdminRequests.userId, userId),
          eq(companyAdminRequests.status, "pending")
        )
      );

    if (
      existing.length > 0 &&
      existing[0].expiresAt &&
      new Date(existing[0].expiresAt) > now
    ) {
      return res.json({
        success: true,
        alreadyExists: true,
        requestId: existing[0].id,
      });
    }

    // 4. générer token + expiration
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    const [reqRow] = await db
      .insert(companyAdminRequests)
      .values({
        id: crypto.randomUUID(),
        companyId,
        userId,
        domainUsed: chosenDomain,
        token,
        expiresAt,
        status: "pending",
        createdAt: new Date(),
      })
      .returning();

    // 5. URL de confirmation
    const baseUrl = process.env.APP_URL || "http://localhost:3000";
    const verifyUrl = `${baseUrl}/companies/admin-requests/confirm/${token}`;

    // 6. adresse email cible
    const toAddress =
      comp.email ||
      `contact@${chosenDomain}`; // fallback si pas de mail enregistré

    // 7. envoyer le mail
    await mailer.sendMail({
      from: `"BTP Plateforme" <${process.env.SMTP_USER}>`,
      to: toAddress,
      subject: "Demande de récupération d'administration",
      html: `
        <h2>Demande de récupération d'administration</h2>
        <p>Un utilisateur demande à devenir administrateur de la fiche entreprise <strong>${comp.name}</strong>.</p>
        <p>Si vous souhaitez approuver, cliquez ici :</p>
        <p><a href="${verifyUrl}">${verifyUrl}</a></p>
        <br/>
        <p>Ce lien expire dans 24 heures.</p>
      `,
    });

    res.json({ success: true, requestId: reqRow.id });
  } catch (err) {
    console.error("POST /companies/admin-requests/:companyId error:", err);
    res.status(500).json({ error: "Request failed" });
  }
});

/* ---------------------------------------------------------
   GET /companies/admin-requests/confirm/:token
   → Confirmer la demande et donner le rôle ADMIN
--------------------------------------------------------- */
router.get("/confirm/:token", async (req, res) => {
  try {
    const { token } = req.params;

    const rows = await db
      .select()
      .from(companyAdminRequests)
      .where(eq(companyAdminRequests.token, token));

    if (rows.length === 0) {
      return res.status(404).json({ error: "Invalid token" });
    }

    const request = rows[0];

    if (new Date(request.expiresAt) < new Date()) {
      return res.status(400).json({ error: "Token expired" });
    }

    // Donner le rôle ADMIN (upsert membership)
    await db.execute(sql`
      INSERT INTO company_memberships (id, user_id, company_id, roles, status)
      VALUES (${crypto.randomUUID()}, ${request.userId}, ${request.companyId}, '["ADMIN"]', 'active')
      ON CONFLICT (user_id, company_id)
      DO UPDATE SET roles = '["ADMIN"]', status = 'active';
    `);

    // Marquer la requête "approved"
    await db
      .update(companyAdminRequests)
      .set({ status: "approved" })
      .where(eq(companyAdminRequests.id, request.id));

    res.json({ success: true, message: "Admin rights granted" });
  } catch (err) {
    console.error("GET /companies/admin-requests/confirm/:token error:", err);
    res.status(500).json({ error: "Confirmation failed" });
  }
});

export default router;
