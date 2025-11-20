import { db } from "../db";
import {
  conversations,
  conversationParticipants,
} from "../schema";
import { eq, and } from "drizzle-orm";

// Vérifie si un user est dans une conversation
export async function isUserInConversation(userId: string, conversationId: string) {
  const rows = await db
    .select()
    .from(conversationParticipants)
    .where(
      and(
        eq(conversationParticipants.userId, userId),
        eq(conversationParticipants.conversationId, conversationId)
      )
    );

  return rows.length > 0;
}

// Cherche si un DM existe déjà entre deux users
export async function findExistingDM(userA: string, userB: string) {
  // Récupère toutes les conversations DIRECT de userA
  const directConvs = await db
    .select()
    .from(conversations)
    .where(eq(conversations.type, "DIRECT"));

  const userADms = await db
    .select()
    .from(conversationParticipants)
    .where(eq(conversationParticipants.userId, userA));

  const userAConvIds = userADms.map((x) => x.conversationId);

  // Pour chaque conversation de userA → check si userB y est aussi
  for (const conv of directConvs) {
    if (!userAConvIds.includes(conv.id)) continue;

    const other = await db
      .select()
      .from(conversationParticipants)
      .where(
        and(
          eq(conversationParticipants.conversationId, conv.id),
          eq(conversationParticipants.userId, userB)
        )
      );

    if (other.length > 0) return conv;
  }

  return null;
}
