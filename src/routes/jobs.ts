import { Router } from "express";
import { db } from "../db";
import { content, jobOffers, jobApplications, companyMemberships } from "../schema";
import { eq, sql } from "drizzle-orm";
import { requireAuth } from "../middleware/requireAuth";
import crypto from "crypto";

const router = Router();

/* ---------------------------------------------------------
   POST /jobs
   Créer une offre d'emploi
--------------------------------------------------------- */
router.post("/", requireAuth, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const {
      companyId,
      title,
      body,
      contractType,
      locationCity,
      locationCountry,
      salaryMin,
      salaryMax
    } = req.body;

    if (!title || !body || !companyId) {
      return res.status(400).json({ error: "Missing fields" });
    }

    // vérifier que user a le droit de publier pour la société
    const membership = await db
      .select()
      .from(companyMemberships)
      .where(
        sql`${companyMemberships.userId} = ${userId} 
             AND ${companyMemberships.companyId} = ${companyId}`
      );

    if (membership.length === 0) {
      return res.status(403).json({ error: "NOT_COMPANY_MEMBER" });
    }

    const roles = JSON.parse(membership[0].roles);
    if (!roles.includes("ADMIN") && !roles.includes("HR")) {
      return res.status(403).json({ error: "NO_PERMISSION" });
    }

    const contentId = crypto.randomUUID();

    // 1) créer le content universel
    await db.insert(content).values({
      id: contentId,
      type: "JOB_OFFER",
      authorUserId: userId,
      companyId,
      title,
      body,
      isPublic: true,
      createdAt: new Date()
    });

    // 2) créer les détails de l’offre
    const [offer] = await db
      .insert(jobOffers)
      .values({
        id: contentId,
        companyId,
        contractType: contractType || null,
        locationCity: locationCity || null,
        locationCountry: locationCountry || null,
        salaryMin: salaryMin || null,
        salaryMax: salaryMax || null,
        status: "OPEN",
        createdAt: new Date()
      })
      .returning();

    res.json(offer);

  } catch (err) {
    console.error("POST /jobs error:", err);
    res.status(500).json({ error: "Create job failed" });
  }
});

/* ---------------------------------------------------------
   GET /jobs/:id
--------------------------------------------------------- */
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db
      .select()
      .from(jobOffers)
      .where(eq(jobOffers.id, id));

    if (result.length === 0) {
      return res.status(404).json({ error: "Job offer not found" });
    }

    res.json(result[0]);

  } catch (err) {
    console.error("GET /jobs/:id error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ---------------------------------------------------------
   POST /jobs/:id/apply
   Un particulier postule
--------------------------------------------------------- */
router.post("/:id/apply", requireAuth, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;

    if (!req.body) {
      return res.status(400).json({ error: "Missing body" });
    }

    const { cvUrl, message } = req.body;

    // Vérification stricte : l’un des deux doit exister
    if (!cvUrl && !message) {
      return res.status(400).json({
        error: "MISSING_FIELDS",
        message: "You must provide either a CV URL or a message.",
      });
    }

    // 1. Vérifier que l'offre existe
    const offer = await db
      .select()
      .from(jobOffers)
      .where(eq(jobOffers.id, id));

    if (offer.length === 0) {
      return res.status(404).json({ error: "Job offer not found" });
    }

    // 2. Créer la candidature
    const [row] = await db
      .insert(jobApplications)
      .values({
        id: crypto.randomUUID(),
        jobOfferId: id,
        applicantUserId: userId,
        cvUrl: cvUrl || null,
        message: message || null,
        status: "PENDING",
        createdAt: new Date(),
      })
      .returning();

    res.json(row);

  } catch (err: any) {
    console.error("APPLY error:", err);
    res.status(500).json({ error: "Apply failed" });
  }
});


/* ---------------------------------------------------------
   GET /jobs/:id/applications
   ADMIN + HR uniquement
--------------------------------------------------------- */
router.get("/:id/applications", requireAuth, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;

    // vérifier appartenance à l'entreprise
    const offer = await db
      .select()
      .from(jobOffers)
      .where(eq(jobOffers.id, id));

    if (offer.length === 0) {
      return res.status(404).json({ error: "Job offer not found" });
    }

    const membership = await db
      .select()
      .from(companyMemberships)
      .where(
        sql`${companyMemberships.userId} = ${userId}
             AND ${companyMemberships.companyId} = ${offer[0].companyId}`
      );

    if (membership.length === 0) {
      return res.status(403).json({ error: "NOT_COMPANY_MEMBER" });
    }

    const roles = JSON.parse(membership[0].roles);
    if (!roles.includes("ADMIN") && !roles.includes("HR")) {
      return res.status(403).json({ error: "NO_PERMISSION" });
    }

    const rows = await db
      .select()
      .from(jobApplications)
      .where(eq(jobApplications.jobOfferId, id));

    res.json(rows);

  } catch (err) {
    console.error("GET applications error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ---------------------------------------------------------
   PATCH /applications/:appId/status
   ADMIN + HR seulement
--------------------------------------------------------- */
router.patch("/applications/:appId/status", requireAuth, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { appId } = req.params;
    const { status } = req.body;

    if (!["PENDING", "REVIEWED", "ACCEPTED", "REFUSED"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const appRow = await db
      .select()
      .from(jobApplications)
      .where(eq(jobApplications.id, appId));

    if (appRow.length === 0) {
      return res.status(404).json({ error: "Application not found" });
    }

    const jobOfferId = appRow[0].jobOfferId;

    // retrouver l’offre pour identifier la company
    const offerRow = await db
      .select()
      .from(jobOffers)
      .where(eq(jobOffers.id, jobOfferId));

    const companyId = offerRow[0].companyId;

    // vérifier permissions
    const membership = await db
      .select()
      .from(companyMemberships)
      .where(
        sql`${companyMemberships.userId} = ${userId}
             AND ${companyMemberships.companyId} = ${companyId}`
      );

    if (membership.length === 0) {
      return res.status(403).json({ error: "NOT_COMPANY_MEMBER" });
    }

    const roles = JSON.parse(membership[0].roles);
    if (!roles.includes("ADMIN") && !roles.includes("HR")) {
      return res.status(403).json({ error: "NO_PERMISSION" });
    }

    const [updated] = await db
      .update(jobApplications)
      .set({ status })
      .where(eq(jobApplications.id, appId))
      .returning();

    res.json(updated);

  } catch (err) {
    console.error("PATCH application status error:", err);
    res.status(500).json({ error: "Update failed" });
  }
});

export default router;
