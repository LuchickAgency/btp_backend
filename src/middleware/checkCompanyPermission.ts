import { Request, Response, NextFunction } from "express";
import { db } from "../db";
import { companyMemberships } from "../schema";
import { eq } from "drizzle-orm";

/**
 * Vérifie que l'utilisateur appartient à une société
 * et possède l'un des rôles autorisés.
 */
export function checkCompanyPermission(allowedRoles: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).userId;
      const companyId = req.params.companyId || req.body.companyId;

      if (!companyId) {
        return res.status(400).json({ error: "Missing companyId" });
      }

      const membership = await db
        .select()
        .from(companyMemberships)
        .where(eq(companyMemberships.companyId, companyId));

      if (membership.length === 0) {
        return res.status(403).json({ error: "NOT_MEMBER" });
      }

      const roles = JSON.parse(membership[0].roles || "[]");

      const allowed = roles.some((r: string) =>
        allowedRoles.includes(r)
      );

      if (!allowed) {
        return res.status(403).json({ error: "NO_PERMISSION" });
      }

      next();
    } catch (err) {
      console.error("checkCompanyPermission error:", err);
      res.status(500).json({ error: "Server error" });
    }
  };
}
