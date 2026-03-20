/**
 * Rate Limiter Utility
 * Prevents hitting Resend API limits (10 emails/second) and getting domain blacklisted.
 * Processes items sequentially with a configurable delay between each.
 */

export interface RateLimitResult<T> {
    item: T;
    result?: any;
    error?: any;
}

export async function sendWithRateLimit<T>(
    items: T[],
    processor: (item: T) => Promise<any>,
    options: {
        maxPerSecond?: number;
        onProgress?: (current: number, total: number) => void;
    } = {}
): Promise<RateLimitResult<T>[]> {
    const { maxPerSecond = 5, onProgress } = options;
    const delayMs = 1000 / maxPerSecond;
    const results: RateLimitResult<T>[] = [];

    let processed = 0;

    for (const item of items) {
        try {
            const result = await processor(item);
            results.push({ item, result });
        } catch (error) {
            results.push({ item, error });
        }

        processed++;
        if (onProgress) {
            onProgress(processed, items.length);
        }

        // Throttle: add delay between sends (except after last item)
        if (processed < items.length) {
            await new Promise(r => setTimeout(r, delayMs));
        }
    }

    return results;
}
