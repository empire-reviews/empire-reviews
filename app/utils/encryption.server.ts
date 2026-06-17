/**
 * At-rest encryption for sensitive secrets (e.g. merchant BYOK AI keys).
 *
 * Uses AES-256-GCM with a key derived from the ENCRYPTION_KEY env var.
 * ENCRYPTION_KEY must be 32 bytes encoded as 64 hex chars — generate with:
 *
 *     openssl rand -hex 32
 *
 * SECRET ROTATION: rotating ENCRYPTION_KEY invalidates all existing
 * ciphertext. To rotate, decrypt every stored row with the OLD key and
 * re-encrypt with the NEW key (one-off migration) before swapping the env.
 *
 * Note: CRON_SECRET / UNSUBSCRIBE_SECRET are operator-set env vars (not
 * encrypted here) — they should likewise be strong random values from
 * `openssl rand -hex 32`.
 */
import crypto from "crypto";

const ALGO = "aes-256-gcm";

function getKey(): Buffer {
    const raw = (process.env.ENCRYPTION_KEY || "").trim();
    return Buffer.from(raw, "hex"); // 32 bytes from 64 hex chars
}

/** AES-256-GCM encrypt. Returns `iv:authTag:ciphertext` (all hex). */
export function encrypt(plaintext: string): string {
    if (!plaintext) return "";
    try {
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
        const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
        const tag = cipher.getAuthTag();
        return `${iv.toString("hex")}:${tag.toString("hex")}:${ct.toString("hex")}`;
    } catch (err) {
        console.error("[encryption] encrypt failed:", (err as Error).message);
        return "";
    }
}

/** Reverses encrypt(). Returns "" on any error (bad key, tampering, plaintext). */
export function decrypt(ciphertext: string): string {
    if (!ciphertext) return "";
    try {
        const [ivHex, tagHex, ctHex] = ciphertext.split(":");
        if (!ivHex || !tagHex || !ctHex) return "";
        const decipher = crypto.createDecipheriv(ALGO, getKey(), Buffer.from(ivHex, "hex"));
        decipher.setAuthTag(Buffer.from(tagHex, "hex"));
        const pt = Buffer.concat([decipher.update(Buffer.from(ctHex, "hex")), decipher.final()]);
        return pt.toString("utf8");
    } catch (err) {
        console.error("[encryption] decrypt failed:", (err as Error).message);
        return "";
    }
}
