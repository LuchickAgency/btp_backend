import { Router } from "express";
import { db } from "../db";
import { users, profiles } from "../schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcrypt";
import { signToken, verifyToken } from "../utils/jwt";
import { registerSchema, loginSchema } from "../schemas/auth.schema";

const router = Router();

/* -----------------------------
   REGISTER
----------------------------- */
router.post("/register", async (req, res) => {
  try {
    // Validation Zod
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "INVALID_DATA",
        details: parsed.error.flatten(),
      });
    }

    const { email, password, displayName } = parsed.data;

    // Vérifier si user existe déjà
    const existing = await db.select().from(users).where(eq(users.email, email));

    if (existing.length > 0) {
      return res.status(400).json({ error: "Email already used" });
    }

    const hash = await bcrypt.hash(password, 10);

    // Insert user
    const [user] = await db
      .insert(users)
      .values({
        email,
        passwordHash: hash,
        isEmailVerified: true,
      })
      .returning();

    // Insert profil lié
    await db.insert(profiles).values({
      userId: user.id,
      displayName,
    });

    const token = signToken(user.id);

    res.json({ token, userId: user.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Register failed" });
  }
});

/* -----------------------------
   LOGIN
----------------------------- */
router.post("/login", async (req, res) => {
  try {
    // Validation Zod
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "INVALID_DATA",
        details: parsed.error.flatten(),
      });
    }

    const { email, password } = parsed.data;

    const result = await db.select().from(users).where(eq(users.email, email));

    if (result.length === 0) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    const user = result[0];
    const isValid = await bcrypt.compare(password, user.passwordHash);

    if (!isValid) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    const token = signToken(user.id);

    res.json({ token, userId: user.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed" });
  }
});

/* -----------------------------
   ME (profil user connecté)
----------------------------- */
router.get("/me", async (req, res) => {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No auth" });
  }

  const token = header.split(" ")[1];

  try {
    const decoded = verifyToken(token);

    const result = await db
      .select()
      .from(users)
      .where(eq(users.id, decoded.userId));

    if (result.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      userId: decoded.userId,
      email: result[0].email,
    });

  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
});

export default router;
