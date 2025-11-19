import { db } from "../db";
import { legalArticles } from "../schema";
import { eq } from "drizzle-orm";

console.log("💡 legalAIWorker chargé !");

const API_KEY = process.env.DEEPSEEK_API_KEY!;
const BASE_URL = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";

// @ts-ignore
const fetchAny: any = fetch;

// Appelle DeepSeek
async function deepseekSummarize(content: string, link: string) {
  const response = await fetchAny(`${BASE_URL}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [
        {
          role: "system",
          content: "Tu es un assistant juridique spécialisé BTP. Résume simplement les textes de loi."
        },
        {
          role: "user",
          content:
            `Voici un texte légal. Résume-le clairement pour un professionnel du BTP réunionnais.
            
            Inclure OBLIGATOIREMENT :
            - un résumé en 5 points simples
            - les obligations majeures
            - la date si présente
            - un encadré “Aller à la source” avec le lien suivant : ${link}

            Texte :
            ${content}
            `
        }
      ],
      temperature: 0.3,
    }),
  });

  const json = await response.json();
  return json.choices?.[0]?.message?.content || "";
}

export async function runLegalAIWorker() {
  try {
    console.log("🔍 Worker IA → recherche articles à traiter...");

    const toProcess = await db
      .select()
      .from(legalArticles)
      .where(eq(legalArticles.status, "INGESTED"));

    if (toProcess.length === 0) {
      console.log("✔ Aucun article à traiter.");
      return;
    }

    for (const article of toProcess) {
      console.log(`🧠 Traitement IA : ${article.id}`);

      const summary = await deepseekSummarize(
        article.rawContent || "",
        article.sourceUrl || ""
      );

      await db
        .update(legalArticles)
        .set({
          aiSummary: summary,
          status: "PROCESSED",
        })
        .where(eq(legalArticles.id, article.id));

      console.log(`✔ Article ${article.id} résumé et mis à jour.`);
    }
  } catch (error) {
    console.error("❌ Worker IA erreur :", error);
  }
}
