import crypto from 'crypto';

/**
 * Cryptographic utilities for secure token generation and verification.
 * Used for signed unsubscribe links to prevent URL tampering.
 */

function getSecret(): string {
    const secret = process.env.UNSUBSCRIBE_SECRET;
    if (!secret) {
        throw new Error("UNSUBSCRIBE_SECRET must be set in environment variables");
    }
    return secret;
}

/**
 * Generate a signed HMAC token for unsubscribe links.
 * Prevents users from unsubscribing others by tampering with URL parameters.
 */
export function generateUnsubscribeToken(email: string, shop: string): string {
    const data = `${email}:${shop}`;
    return crypto
        .createHmac('sha256', getSecret())
        .update(data)
        .digest('hex')
        .slice(0, 16); // First 16 chars for shorter URLs
}

/**
 * Verify an unsubscribe token using timing-safe comparison.
 */
export function verifyUnsubscribeToken(
    email: string,
    shop: string,
    token: string
): boolean {
    try {
        const expectedToken = generateUnsubscribeToken(email, shop);
        if (token.length !== expectedToken.length) return false;
        return crypto.timingSafeEqual(
            Buffer.from(token),
            Buffer.from(expectedToken)
        );
    } catch {
        return false;
    }
}

/**
 * Generate a signed HMAC token for email tracking (open/click) links.
 * Binds the token to a specific CampaignSend id so attackers can't inflate
 * open/click metrics by hitting tracking URLs with arbitrary ids.
 */
export function generateTrackingToken(sendId: string): string {
    return crypto
        .createHmac('sha256', getSecret())
        .update(`track:${sendId}`)
        .digest('hex')
        .slice(0, 16);
}

/**
 * Verify a tracking token using timing-safe comparison.
 */
export function verifyTrackingToken(sendId: string, token: string): boolean {
    try {
        if (!sendId || !token) return false;
        const expectedToken = generateTrackingToken(sendId);
        if (token.length !== expectedToken.length) return false;
        return crypto.timingSafeEqual(
            Buffer.from(token),
            Buffer.from(expectedToken)
        );
    } catch {
        return false;
    }
}
