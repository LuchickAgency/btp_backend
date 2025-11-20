import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { db } from "../db";
import {
  conversations,
  conversationParticipants,
} from "../schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import { isUserInConversation, findExistingDM } from "../utils/dm";
import { inArray } from "drizzle-orm";

const router = Router();

/* -------------------------------------------------------
   CRÉER / OUVRIR UN DM DIRECT
------------------------------------------------------- */
router.post("/direct", requireAuth, async (req, res) => {
  try {
    const currentUser = (req as any).userId;
    const { userId: otherUser } = req.body;

    if (!otherUser) {
      return res.status(400).json({ error: "MISSING_USER_ID" });
    }

    // Vérifie si un DM existe déjà
    const existing = await findExistingDM(currentUser, otherUser);
    if (existing) {
      return res.json(existing);
    }

    // Sinon, créer la conversation
    const convId = crypto.randomUUID();

    const [conv] = await db
      .insert(conversations)
      .values({
        id: convId,
        type: "DIRECT",
        createdBy: currentUser,
        createdAt: new Date(),
      })
      .returning();

    await db.insert(conversationParticipants).values([
      {
        id: crypto.randomUUID(),
        conversationId: convId,
        userId: currentUser,
        role: "MEMBER",
      },
      {
        id: crypto.randomUUID(),
        conversationId: convId,
        userId: otherUser,
        role: "MEMBER",
      },
    ]);

    res.json(conv);
  } catch (err) {
    console.error("DM DIRECT ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* -------------------------------------------------------
   CRÉER UN GROUPE
------------------------------------------------------- */
router.post("/group", requireAuth, async (req, res) => {
  try {
    const currentUser = (req as any).userId;
    const { title, userIds } = req.body; // tableau

    if (!title || !Array.isArray(userIds) || userIds.length < 1) {
      return res.status(400).json({ error: "INVALID_DATA" });
    }

    const convId = crypto.randomUUID();

    const [conv] = await db
      .insert(conversations)
      .values({
        id: convId,
        type: "GROUP",
        title,
        createdBy: currentUser,
        createdAt: new Date(),
      })
      .returning();

    const arr = [
      { id: crypto.randomUUID(), conversationId: convId, userId: currentUser, role: "ADMIN" },
      ...userIds.map((u: string) => ({
        id: crypto.randomUUID(),
        conversationId: convId,
        userId: u,
        role: "MEMBER",
      })),
    ];

    await db.insert(conversationParticipants).values(arr);

    res.json(conv);
  } catch (err) {
    console.error("GROUP ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* -------------------------------------------------------
   LISTER MES CONVERSATIONS
------------------------------------------------------- */
router.get("/", requireAuth, async (req, res) => {
  try {
    const userId = (req as any).userId;

    const rows = await db
      .select()
      .from(conversationParticipants)
      .where(eq(conversationParticipants.userId, userId));

    const convIds = rows.map((r) => r.conversationId);

    if (convIds.length === 0) return res.json([]);

    const list = await db
      .select()
      .from(conversations)
      .where(inArray(conversations.id, convIds));

    res.json(list);
  } catch (err) {
    console.error("LIST CONVERSATION ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* -------------------------------------------------------
   DÉTAIL D'UNE CONVERSATION
------------------------------------------------------- */
router.get("/:id", requireAuth, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const convId = req.params.id;

    const isMember = await isUserInConversation(userId, convId);
    if (!isMember) return res.status(403).json({ error: "NOT_ALLOWED" });

    const [conv] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, convId));

    if (!conv) return res.status(404).json({ error: "NOT_FOUND" });

    const participants = await db
      .select()
      .from(conversationParticipants)
      .where(eq(conversationParticipants.conversationId, convId));

    res.json({ ...conv, participants });
  } catch (err) {
    console.error("GET CONVERSATION ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
