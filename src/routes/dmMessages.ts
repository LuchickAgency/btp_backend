import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { db } from "../db";
import {
  conversations,
  conversationMessages,
  messageAttachments,
  mediaAssets
} from "../schema";
import { eq, inArray, desc } from "drizzle-orm";
import crypto from "crypto";
import { isUserInConversation } from "../utils/dm";

const router = Router();

/* -------------------------------------------------------
   ENVOYER UN MESSAGE (texte + médias)
------------------------------------------------------- */
router.post("/:conversationId", requireAuth, async (req, res) => {
  try {
    const senderId = (req as any).userId;
    const conversationId = req.params.conversationId;
    const { body, mediaIds = [], replyToMessageId } = req.body;

    // Vérifier participation
    const allowed = await isUserInConversation(senderId, conversationId);
    if (!allowed) return res.status(403).json({ error: "NOT_ALLOWED" });

    // Vérifier conversation
    const [conv] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId));

    if (!conv) return res.status(404).json({ error: "CONVERSATION_NOT_FOUND" });

    // Vérifier existence des médias
    let validMedia: any[] = [];
    if (Array.isArray(mediaIds) && mediaIds.length > 0) {
      validMedia = await db
        .select()
        .from(mediaAssets)
        .where(inArray(mediaAssets.id, mediaIds));

      if (validMedia.length !== mediaIds.length) {
        return res.status(400).json({ error: "INVALID_MEDIA_ID" });
      }
    }

    // Déterminer messageType
    const messageType = mediaIds.length > 0 ? "MEDIA" : "TEXT";

    // Créer message
    const msgId = crypto.randomUUID();

    const [msg] = await db
      .insert(conversationMessages)
      .values({
        id: msgId,
        conversationId,
        senderId,
        body: body || null,
        messageType,
        replyToMessageId: replyToMessageId || null,
        createdAt: new Date(),
      })
      .returning();

    // Attach media
    if (mediaIds.length > 0) {
      await db.insert(messageAttachments).values(
        mediaIds.map((mId: string) => ({
          id: crypto.randomUUID(),
          messageId: msgId,
          mediaId: mId,
          createdAt: new Date(),
        }))
      );
    }

    // Charger médias pour retour enrichi
    const medias =
      mediaIds.length > 0
        ? await db
            .select()
            .from(mediaAssets)
            .where(inArray(mediaAssets.id, mediaIds))
        : [];

    res.json({
      ...msg,
      attachments: medias,
    });

  } catch (err) {
    console.error("SEND MESSAGE ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* -------------------------------------------------------
   LISTER LES MESSAGES D'UNE CONVERSATION
------------------------------------------------------- */
router.get("/:conversationId", requireAuth, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const conversationId = req.params.conversationId;

    // Pagination
    let page = Number(req.query.page ?? "1");
    let pageSize = Number(req.query.pageSize ?? "30");

    if (page < 1) page = 1;
    if (pageSize < 1) pageSize = 30;
    if (pageSize > 100) pageSize = 100;

    const offset = (page - 1) * pageSize;

    // Vérifier participation
    const allowed = await isUserInConversation(userId, conversationId);
    if (!allowed) return res.status(403).json({ error: "NOT_ALLOWED" });

    // Charger messages
    const messages = await db
      .select()
      .from(conversationMessages)
      .where(eq(conversationMessages.conversationId, conversationId))
      .orderBy(desc(conversationMessages.createdAt))
      .limit(pageSize)
      .offset(offset);

    // Enrichir
    const enriched = [];

    for (const msg of messages) {
      const attachments = await db
        .select()
        .from(messageAttachments)
        .where(eq(messageAttachments.messageId, msg.id));

      const medias =
        attachments.length > 0
          ? await db
              .select()
              .from(mediaAssets)
              .where(
                inArray(
                  mediaAssets.id,
                  attachments.map((a) => a.mediaId)
                )
              )
          : [];

      enriched.push({
        ...msg,
        attachments: medias,
      });
    }

    res.json({
      page,
      pageSize,
      items: enriched,
    });

  } catch (err) {
    console.error("LIST MESSAGES ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
