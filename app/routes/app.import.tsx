import { json, type ActionFunctionArgs, type LoaderFunctionArgs, unstable_parseMultipartFormData, unstable_createMemoryUploadHandler } from "@remix-run/node";
import { useFetcher, useLoaderData, useNavigate } from "@remix-run/react";
import {
    BlockStack,
    Text,
    Button,
    DropZone,
    Banner,
    InlineStack,
    Badge,
    ProgressBar,
    Select,
    TextField,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { useState, useCallback, useEffect } from "react";
import { ImportIcon, NoteIcon } from "@shopify/polaris-icons";
import { BackButton } from "../components/BackButton";
import { isPlanPro } from "../billing.server";
import { buildReviewsCsv } from "../utils/export.server";

// Helper to parse CSV robustly (handles quotes, empty fields, and newlines within quotes)
function parseCSV(text: string) {
    const arr: string[][] = [];
    let quote = false;  // 'true' means we're inside a quoted field

    // Auto-detect delimiter
    const firstLine = text.split('\n')[0];
    const commaCount = (firstLine.match(/,/g) || []).length;
    const semiCount = (firstLine.match(/;/g) || []).length;
    const delimiter = semiCount > commaCount ? ';' : ',';

    // Iterate over each character, keep track of current row and column (of the returned array)
    let row = 0, col = 0, c = 0;
    let data = text.split("");

    arr[row] = [];
    arr[row][col] = "";

    for (c = 0; c < data.length; c++) {
        var cc = data[c], nc = data[c + 1];        // Current character, next character
        arr[row][col] = arr[row][col] || "";   // create a new column (start with empty string) if necessary

        // If the current character is a quotation mark, and we're inside a
        // quoted field, and the next character is also a quotation mark,
        // add a quotation mark to the current column and skip the next character
        if (cc == '"' && quote && nc == '"') { arr[row][col] += cc; ++c; }

        // If it's just one quotation mark, begin/end quoted field
        else if (cc == '"') { quote = !quote; }

        // If it's the delimiter and we're not in a quoted field, move on to the next column
        else if (cc == delimiter && !quote) { ++col; arr[row][col] = ""; }

        // If it's a newline (CRLF) and we're not in a quoted field, skip the next character
        // and move on to the next row and move to column 0 of that new row
        else if (cc == '\r' && nc == '\n' && !quote) { ++row; col = 0; ++c; arr[row] = []; }

        // If it's a newline (LF or CR) and we're not in a quoted field,
        // move on to the next row and move to column 0 of that new row
        else if ((cc == '\n' || cc == '\r') && !quote) { ++row; col = 0; arr[row] = []; }

        // Otherwise, add the current character to the current column
        else { arr[row][col] += cc; }
    }

    // Now map to objects
    if (arr.length < 2) return [];

    // Parse headers first: Aggressive normalization (keep only a-z 0-9)
    const headers = arr[0].map(h => h.trim().replace(/^"|"$/g, '').toLowerCase().replace(/[^a-z0-9]/g, ''));

    const result = [];

    for (let i = 1; i < arr.length; i++) {
        const rowData = arr[i];
        // Skip empty rows (orphans)
        if (rowData.length < 2 && (!rowData[0] || rowData[0].trim() === "")) continue;

        const obj: any = {};

        headers.forEach((header, index) => {
            let value = rowData[index] ? rowData[index].trim() : '';
            // Remove surrounding quotes from value (parser handles internal quotes but might leave wrapping ones if strict)
            // transforming "value" -> value
            // Actually our state machine strips the delimiter quotes? No, the state machine logic above KEEPS content inside quotes but might strip the wrapping ones depending on logic.
            // Let's look at logic: cc == '"' -> quote = !quote. It does NOT add cc to arr[row][col].
            // So wrapping quotes ARE STRIPPED by the logic! 
            // EXCEPT for internal escaped quotes: if (cc == '"' && quote && nc == '"') { arr[row][col] += cc; ++c; }

            // So 'value' is already clean!

            // DEBUG: Log first row to see header mapping
            if (i === 1) {
                // console.log(`Header[${index}]: "${header}" -> Value: "${value.substring(0, 50)}..."`);
            }

            // Map common variations to standard keys
            if (['rating', 'stars', 'star'].includes(header)) obj['rating'] = value;
            else if (['body', 'content', 'review', 'comment', 'text', 'reviews', 'reviewtext', 'reviewcontent', 'reviewbody'].includes(header)) {
                // Only overwrite if new value is longer/better (prevents empty columns directly overwriting valid ones)
                if (!obj['body'] || value.length > obj['body'].length) {
                    obj['body'] = value;
                }
            }
            else if (['name', 'author', 'customer', 'reviewer', 'reviewername', 'customername'].includes(header)) obj['customer'] = value;
            else if (['email', 'revieweremail', 'customeremail'].includes(header)) obj['email'] = value;
            else if (['title', 'reviewtitle', 'headline'].includes(header)) obj['review_title'] = value;
            else if (['date', 'createdat', 'reviewdate', 'timestamp', 'reviewdate'].includes(header)) obj['date'] = value;
            else if (['reply', 'response', 'ownerreply'].includes(header)) obj['reply'] = value;
            else if (['picture_urls', 'pictureurls', 'images', 'photos', 'media'].includes(header)) obj['images'] = value;

            else if (['product_id', 'productid', 'id', 'productname'].includes(header)) obj['product_id'] = value;
            else if (['product_handle', 'producthandle', 'handle', 'product_url', 'producturl', 'product', 'productlink'].includes(header)) {
                if (value.includes('/products/')) {
                    const handle = value.split('/products/').pop()?.split('?')[0];
                    obj['handle'] = handle;
                } else if (value.includes(' ')) {
                    obj['product_title'] = value;
                } else {
                    obj['handle'] = value;
                }
            }
            // FALLBACK: Store unmapped headers with long text values (likely review body)
            else if (value.length > 10 && !obj['body']) {
                console.warn(`Unmapped header "${header}" with long content - using as body`);
                obj['body'] = value;
            }
        });

        // Log final parsed object for first row
        if (i === 1) {
            console.log('--- PARSED RECORD DEBUG ---');
            console.log('Headers:', headers);
            console.log('Parsed Object:', JSON.stringify(obj, null, 2));
            console.log('---------------------------');
        }

        result.push(obj);
    }
    return result;
}

// Sanitize customer name: strip < > & to prevent XSS
function sanitizeName(name: string): string {
    return name.replace(/[<>&]/g, '').trim().substring(0, 200) || 'Anonymous';
}

// Clamp rating to 1-5
function clampRating(raw: string | number): number {
    const n = typeof raw === 'number' ? raw : parseFloat(String(raw));
    if (isNaN(n)) return 0; // 0 signals skip
    return Math.min(5, Math.max(1, Math.round(n)));
}

// Parse Google Reviews paste (Takeout JSON array or CSV)
// Google Takeout JSON: array of objects with keys like reviewer_name, rating, published_at, text
// Google Business CSV export: reviewer_name, star_rating, review_text, published_at
function parseGooglePaste(text: string): any[] {
    text = text.trim();
    if (text.startsWith('[') || text.startsWith('{')) {
        // JSON path
        try {
            let arr = JSON.parse(text);
            if (!Array.isArray(arr)) arr = [arr];
            return arr.map((item: any) => {
                const rating = clampRating(item.rating ?? item.star_rating ?? item.stars ?? 0);
                if (!rating) return null;
                return {
                    customerName: sanitizeName(item.reviewer_name ?? item.name ?? item.reviewer ?? 'Anonymous'),
                    rating,
                    body: String(item.text ?? item.review_text ?? item.comment ?? item.content ?? '').substring(0, 2000) || null,
                    title: item.title ? String(item.title).substring(0, 200) : null,
                    createdAt: item.published_at ?? item.date ?? item.time ?? item.created_at ?? null,
                };
            }).filter(Boolean);
        } catch {
            return [];
        }
    }
    // CSV path — reuse parseCSV and remap
    const rows = parseCSV(text);
    return rows.map((r: any) => {
        const rating = clampRating(r.rating ?? 0);
        if (!rating) return null;
        return {
            customerName: sanitizeName(r.customer ?? r.name ?? 'Anonymous'),
            rating,
            body: String(r.body ?? '').substring(0, 2000) || null,
            title: r.review_title ?? null,
            createdAt: r.date ?? null,
        };
    }).filter(Boolean);
}

// Parse AliExpress Reviews paste (JSON array or CSV)
// Common DSers/AliExpress export: name, stars/rating, feedback/content, date, photo_urls
function parseAliExpressPaste(text: string): any[] {
    text = text.trim();
    if (text.startsWith('[') || text.startsWith('{')) {
        try {
            let arr = JSON.parse(text);
            if (!Array.isArray(arr)) arr = [arr];
            return arr.map((item: any) => {
                const rating = clampRating(item.rating ?? item.stars ?? item.star ?? 0);
                if (!rating) return null;
                const body = String(item.feedback ?? item.content ?? item.review ?? item.comment ?? item.text ?? '').substring(0, 2000) || null;
                // Collect HTTPS photo URLs only
                const rawPhotos: string[] = Array.isArray(item.photo_urls) ? item.photo_urls : String(item.photo_urls ?? item.images ?? item.photos ?? '').split(',');
                const photos = rawPhotos.map((u: string) => u.trim()).filter((u: string) => u.startsWith('https://'));
                return {
                    customerName: sanitizeName(item.name ?? item.buyer_name ?? item.reviewer ?? 'Anonymous'),
                    rating,
                    body,
                    title: null,
                    createdAt: item.date ?? item.created_at ?? item.time ?? null,
                    images: photos.length > 0 ? photos.join(',') : null,
                };
            }).filter(Boolean);
        } catch {
            return [];
        }
    }
    // CSV path
    const rows = parseCSV(text);
    return rows.map((r: any) => {
        const rating = clampRating(r.rating ?? 0);
        if (!rating) return null;
        const rawPhotos = String(r.images ?? '').split(',');
        const photos = rawPhotos.map((u: string) => u.trim()).filter((u: string) => u.startsWith('https://'));
        return {
            customerName: sanitizeName(r.customer ?? r.name ?? 'Anonymous'),
            rating,
            body: String(r.body ?? '').substring(0, 2000) || null,
            title: null,
            createdAt: r.date ?? null,
            images: photos.length > 0 ? photos.join(',') : null,
        };
    }).filter(Boolean);
}

// Smart Resolve: Finds products by Handle OR Title
async function resolveProductsSmartly(admin: any, identifiers: { handle?: string, title?: string }[]) {
    const handles = identifiers.map(i => i.handle).filter(Boolean);
    const titles = identifiers.map(i => i.title).filter(Boolean);
    const productMap = new Map<string, string>();

    if (handles.length > 0) {
        const uniqueHandles = [...new Set(handles)];
        const chunk = uniqueHandles.slice(0, 50);
        const queryString = chunk.map(h => `handle:${h}`).join(" OR ");
        try {
            const response = await admin.graphql(
                `#graphql
                query getProductsByHandle($query: String!) {
                    products(first: 250, query: $query) {
                        nodes { id handle }
                    }
                }`,
                { variables: { query: queryString } }
            );
            const { data } = await response.json();
            data?.products?.nodes?.forEach((p: any) => productMap.set(p.handle, p.id));
        } catch (e) { console.error(e); }
    }

    if (titles.length > 0) {
        const uniqueTitles = [...new Set(titles)].slice(0, 20);
        const queryString = uniqueTitles.map(t => `title:${t}`).join(" OR ");
        try {
            const response = await admin.graphql(
                `#graphql
                query getProductsByTitle($query: String!) {
                    products(first: 250, query: $query) {
                        nodes { id title }
                    }
                }`,
                { variables: { query: queryString } }
            );
            const { data } = await response.json();
            data?.products?.nodes?.forEach((p: any) => productMap.set(p.title, p.id));
        } catch (e) { console.error(e); }
    }
    return productMap;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
    const { session } = await authenticate.admin(request);
    const shop = session.shop;
    const [isPro, existingCount] = await Promise.all([
        isPlanPro(shop),
        prisma.review.count({ where: { shop } }),
    ]);
    return json({ isPro, existingCount });
};

export const action = async ({ request }: ActionFunctionArgs) => {
    const { session, admin } = await authenticate.admin(request);
    const shop = session.shop;

    // Export branch — the "Download CSV" button submits urlencoded (not multipart).
    // Handle it here, in this route's own action, to share the page's auth context.
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
        try {
            const { csv, filename } = await buildReviewsCsv(shop);
            return json({ csv, filename });
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error("[export] failed:", msg);
            return json({ error: `Export failed: ${msg}` });
        }
    }

    try {
        const shopSettings = await prisma.settings.findUnique({ where: { shop }, select: { publishMode: true } as any });
        const publishMode: string = (shopSettings as any)?.publishMode ?? "none";

        const uploadHandler = unstable_createMemoryUploadHandler({ maxPartSize: 5_000_000 });
        const formData = await unstable_parseMultipartFormData(request, uploadHandler);

        // Determine import source
        const importSource = String(formData.get("importSource") || "csv");

        // --- Google / AliExpress paste branch ---
        if (importSource === "google" || importSource === "aliexpress") {
            const pasteText = String(formData.get("pasteText") || "").trim();
            if (!pasteText) return json({ success: false, message: "Please paste your review data." });

            const parsedRecords = importSource === "google"
                ? parseGooglePaste(pasteText)
                : parseAliExpressPaste(pasteText);

            if (parsedRecords.length === 0) {
                return json({ success: false, message: "No valid reviews found in your pasted data. Check the format and try again." });
            }
            if (parsedRecords.length > 500) {
                return json({ success: false, message: "Too many reviews (max 500 per import). Please split your data." });
            }

            // FREE-PLAN CAP
            const settings2 = await prisma.settings.findFirst({ where: { shop } });
            const existingCount2 = await prisma.review.count({ where: { shop } });
            const remaining2 = Math.max(0, 50 - existingCount2);
            if ((settings2 as any)?.plan !== "EMPIRE_PRO" && existingCount2 + parsedRecords.length > 50) {
                return json({
                    success: false,
                    upgradeRequired: true,
                    remaining: remaining2,
                    message: `Free plan limit: you can add ${remaining2} more review${remaining2 === 1 ? "" : "s"} (50 total). Please trim your data to ${remaining2} rows or upgrade to Empire Pro.`,
                });
            }
            if ((settings2 as any)?.plan !== "EMPIRE_PRO") {
                parsedRecords.splice(remaining2); // hard cap even if user didn't get error above
            }

            const autoApproveAll = publishMode === "all";
            let importedCount2 = 0;
            for (const rec of parsedRecords) {
                const autoApprove = autoApproveAll || (publishMode === "five_star" && rec.rating === 5);
                const createdAt = rec.createdAt ? new Date(rec.createdAt) : new Date();
                const safeDate = isNaN(createdAt.getTime()) ? new Date() : createdAt;
                const mediaCreate: { url: string; type: string }[] = [];
                if (rec.images) {
                    for (const url of String(rec.images).split(',')) {
                        const u = url.trim();
                        if (u.startsWith('https://')) mediaCreate.push({ url: u, type: 'image' });
                    }
                }
                const baseData = {
                    shop,
                    productId: null as string | null,
                    rating: rec.rating,
                    body: rec.body ?? null,
                    title: rec.title ?? null,
                    customerName: rec.customerName,
                    customerEmail: null as string | null,
                    createdAt: safeDate,
                    status: autoApprove ? "approved" : "pending",
                    sentiment: rec.rating >= 4 ? "positive" : rec.rating === 3 ? "neutral" : "negative",
                    verified: false,
                    source: importSource,
                };
                if (mediaCreate.length > 0) {
                    await prisma.review.create({ data: { ...baseData, media: { create: mediaCreate } } });
                } else {
                    await prisma.review.create({ data: baseData });
                }
                importedCount2++;
            }
            return json({ success: true, count: importedCount2, skipped: 0, message: `Successfully imported ${importedCount2} ${importSource === "google" ? "Google" : "AliExpress"} reviews.` });
        }

        // --- Existing CSV branch ---
        const file = formData.get("file") as File;

        if (!file || file.size === 0) return json({ success: false, message: "No file uploaded." });
        if (!file.name.endsWith('.csv')) return json({ success: false, message: "Invalid file type. Please upload a .csv file." });

        const text = await file.text();
        const records = parseCSV(text);

        if (records.length > 500) {
            return json({ success: false, message: "Import file is too large. Please limit to 500 rows per file." });
        }

        // 🚧 FREE-PLAN CAP — enforce the advertised 50-review limit server-side
        const settings = await prisma.settings.findFirst({ where: { shop } });
        const existingCount = await prisma.review.count({ where: { shop } });
        const remaining = Math.max(0, 50 - existingCount);
        if ((settings as any)?.plan !== "EMPIRE_PRO") {
            // Check if client sent a limit (user chose "Import First X")
            const limitParam = formData.get("limit");
            const limit = limitParam ? parseInt(String(limitParam), 10) : null;
            if (limit !== null && limit > 0) {
                // Keep at most `remaining` rows — never trust the client number
                // past the cap (prevents exceeding the 50-review free limit).
                records.splice(remaining);
            } else if (existingCount + records.length > 50) {
                return json({
                    success: false,
                    upgradeRequired: true,
                    remaining,
                    message: `Free plan limit: you can add ${remaining} more review${remaining === 1 ? "" : "s"} (50 total). Use "Import First ${remaining}" or upgrade to Empire Pro.`,
                });
            }
        }

        const allIdentifiers = records.map((r: any) => ({ handle: r.handle, title: r.product_title }));
        const productMap = await resolveProductsSmartly(admin, allIdentifiers);

        let importedCount = 0;
        let skippedCount = 0;

        const simpleReviews = [];
        const complexReviews = []; // Have media or replies

        for (const record of records) {
            const rating = Math.min(5, Math.max(1, parseInt(record.rating, 10) || 3));
            const body = record.body || "No content";
            const customerName = record.customer || "Anonymous";
            const customerEmail = record.email || null;
            const title = record.review_title || null;
            let createdAt = record.date ? new Date(record.date) : new Date();
            if (isNaN(createdAt.getTime())) createdAt = new Date(); // guard against Invalid Date from bad CSV

            let productId = record.product_id;
            if (!productId && record.handle) productId = productMap.get(record.handle);
            if (!productId && record.product_title) productId = productMap.get(record.product_title);

            // Normalize Product ID
            if (productId && !productId.startsWith("gid://")) {
                productId = `gid://shopify/Product/${productId}`;
            }

            if (body && !isNaN(rating)) {
                // Check if complex
                const hasMedia = record.images && record.images.length > 0;
                const hasReply = !!record.reply;

                const autoApprove =
                    publishMode === "all" ||
                    (publishMode === "five_star" && rating === 5);

                const reviewData = {
                    productId: productId || null,
                    rating,
                    body,
                    title,
                    customerName,
                    customerEmail,
                    shop,
                    createdAt,
                    status: autoApprove ? "approved" : "pending",
                    sentiment: rating >= 4 ? "positive" : rating === 3 ? "neutral" : "negative",
                    verified: true,
                    source: "csv",
                };

                if (hasMedia || hasReply) {
                    complexReviews.push({ ...reviewData, images: record.images, reply: record.reply });
                } else {
                    simpleReviews.push(reviewData);
                }
                importedCount++;
            } else {
                skippedCount++;
            }
        }

        // 1. Bulk Insert Simple Reviews (FAST)
        if (simpleReviews.length > 0) {
            // Chunking for SQLite limits (999 variables)
            const chunkSize = 50;
            for (let i = 0; i < simpleReviews.length; i += chunkSize) {
                await prisma.review.createMany({ data: simpleReviews.slice(i, i + chunkSize) });
            }
        }

        // 2. Individual Insert Complex Reviews (SLOW but necessary)
        for (const review of complexReviews) {
            const mediaCreate = [];
            if (review.images) {
                const urls = review.images.split(',').map((u: string) => u.trim());
                for (const url of urls) if (url) mediaCreate.push({ url, type: 'image' });
            }

            const repliesCreate = [];
            if (review.reply) repliesCreate.push({ body: review.reply });

            // Remove helper props
            const { images, reply, ...data } = review;

            await prisma.review.create({
                data: {
                    ...data,
                    media: { create: mediaCreate },
                    replies: { create: repliesCreate }
                }
            });
        }

        const message = skippedCount > 0
            ? `Imported ${importedCount}. Skipped ${skippedCount} (Product not found).`
            : `Successfully imported ${importedCount} reviews.`;

        return json({
            success: true,
            count: importedCount,
            skipped: skippedCount,
            message
        });

    } catch (e) {
        console.error(e);
        return json({ success: false, message: `Import Failed: ${e instanceof Error ? e.message : String(e)}` });
    }
};

export default function ImportPage() {
    const { isPro, existingCount } = useLoaderData<typeof loader>();
    const fetcher = useFetcher<any>();
    const exportFetcher = useFetcher<{ csv?: string; filename?: string; error?: string }>();
    const navigate = useNavigate();
    const [file, setFile] = useState<File | null>(null);

    // Watch export results and trigger download
    useEffect(() => {
        const d = exportFetcher.data;
        if (!d) return;
        if (d.error) {
            alert(`Export failed: ${d.error}`);
            return;
        }
        if (d.csv) {
            const blob = new Blob([d.csv], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = d.filename ?? "reviews.csv";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
    }, [exportFetcher.data]);
    const [step, setStep] = useState<1 | 2 | 3>(1);
    const [auditData, setAuditData] = useState<{ count: number, rating: number, platforms: string[] } | null>(null);
    const [previewData, setPreviewData] = useState<any>(null);
    const [hasSubmitted, setHasSubmitted] = useState(false);
    const [importProgress, setImportProgress] = useState(0);
    const [importSource, setImportSource] = useState<"csv" | "google" | "aliexpress">("csv");
    const [pasteText, setPasteText] = useState("");

    const handleDrop = useCallback(async (_droppedFiles: File[], acceptedFiles: File[], _rejectedFiles: File[]) => {
        const droppedFile = acceptedFiles[0];
        setFile(droppedFile);
        setHasSubmitted(false); // Reset submission state

      try {
        // Instant Audit & Preview
        const text = await droppedFile.text();
        const records = parseCSV(text);

        // Extract RAW lines for preview (to show original columns)
        // We need to re-parse linearly to get the raw matches, luckily parseCSV logic is robust now.
        // Actually, parseCSV returns objects. We need detecting headers too.
        // Let's modify parseCSV to return headers? Or just re-derive them.

        // Quick hack: getting headers from first line manually for display (might differ from aggressive algo)
        // But better to use the keys from the first record? No, keys are normalized.
        // Let's use the same logic as the parser.
        const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
        if (lines.length === 0) { setFile(null); alert("That file appears to be empty. Please choose a CSV with at least one review."); return; }
        const rawHeaders = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '')); // Display friendly

        // check first 3 records
        const samples = records.slice(0, 3);
        const hasBody = samples.some(r => r.body && r.body.length > 0);

        // We also want the RAW values corresponding to the detected headers for the table
        // This is tricky without exposing internal parser state.
        // For now, valid display is enough.

        // Let's construct a "rawSamples" array by just splitting the lines simply for display purposes 
        // (Visual check only, doesn't need to be perfect parsing as long as user sees content)
        const rawSamples = lines.slice(1, 4).map(line => line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(s => s.replace(/^"|"$/g, '').trim()));

        setPreviewData({
            count: records.length,
            headers: rawHeaders,
            samples,
            rawSamples,
            hasBody
        });

        const platforms = [];
        if (text.includes('judgeme')) platforms.push('Judge.me');
        if (text.includes('yotpo')) platforms.push('Yotpo');
        if (text.includes('loox')) platforms.push('Loox');

        const avgRating = records.reduce((acc, curr) => acc + Math.min(5, Math.max(1, parseInt(curr.rating, 10) || 3)), 0) / (records.length || 1);

        setAuditData({
            count: records.length,
            rating: parseFloat(avgRating.toFixed(1)),
            platforms: platforms.length > 0 ? platforms : ['Standard CSV']
        });
        setStep(2);
      } catch (err) {
        console.error("[import] failed to read file:", err);
        setFile(null);
        alert("Sorry — we couldn't read that file. Please make sure it's a valid CSV and try again.");
      }
    }, []);

    const handleImport = (limit?: number) => {
        if (!file) return;
        setHasSubmitted(true);
        const formData = new FormData();
        formData.append("file", file);
        formData.append("importSource", "csv");
        if (limit !== undefined) formData.append("limit", String(limit));
        fetcher.submit(formData, { method: "post", encType: "multipart/form-data" });
    };

    const handlePasteImport = () => {
        if (!pasteText.trim()) return;
        setHasSubmitted(true);
        const formData = new FormData();
        formData.append("importSource", importSource);
        formData.append("pasteText", pasteText);
        fetcher.submit(formData, { method: "post", encType: "multipart/form-data" });
    };

    // Auto-advance to Step 3 on success, BUT ONLY if we actually submitted this time
    // Wrapped in useEffect to avoid side-effects during render
    useEffect(() => {
        if (fetcher.state === "idle" && fetcher.data?.success && step !== 3 && hasSubmitted) {
            setStep(3);
            setHasSubmitted(false);
        }
    }, [fetcher.state, fetcher.data, step, hasSubmitted]);

    useEffect(() => {
        let interval: any;
        if (fetcher.state === "submitting" && hasSubmitted) {
            setImportProgress(10);
            interval = setInterval(() => {
                setImportProgress(p => Math.min(p + Math.random() * 15, 90));
            }, 500);
        } else if (fetcher.state === "idle" && fetcher.data) {
            if (fetcher.data.success) {
                setImportProgress(100);
            }
        }
        return () => clearInterval(interval);
    }, [fetcher.state, fetcher.data, hasSubmitted]);

    return (
        <div className="empire-import">
            <BackButton />
            <style>{`
                @keyframes pulse-glow {
                    0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.4); }
                    70% { box-shadow: 0 0 0 15px rgba(16, 185, 129, 0); }
                    100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
                }
                @keyframes float {
                    0% { transform: translateY(0px); }
                    50% { transform: translateY(-10px); }
                    100% { transform: translateY(0px); }
                }
                .empire-import { 
                    --empire-primary: #059669; 
                    font-family: 'Inter', sans-serif;
                    background: #f8fafc;
                    min-height: 100vh;
                }
                .hero-3d {
                    background: linear-gradient(135deg, #064e3b 0%, #10b981 100%);
                    color: white;
                    padding: 4rem 2rem 8rem 2rem;
                    position: relative;
                    overflow: hidden;
                    text-align: center;
                }
                .hero-card {
                    background: rgba(255, 255, 255, 0.1);
                    backdrop-filter: blur(12px);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    border-radius: 24px;
                    padding: 2.5rem;
                    max-width: 800px;
                    margin: -5rem auto 2rem auto;
                    box-shadow: 0 40px 100px -20px rgba(0, 0, 0, 0.2);
                    position: relative;
                    z-index: 10;
                    transform-style: preserve-3d;
                }
                .step-indicator {
                    display: flex;
                    justify-content: center;
                    gap: 1rem;
                    margin-bottom: 2rem;
                }
                .step-dot {
                    width: 12px; height: 12px; border-radius: 50%;
                    background: rgba(0,0,0,0.1); transition: all 0.3s ease;
                }
                .step-dot.active { background: #10b981; transform: scale(1.3); box-shadow: 0 0 15px rgba(16, 185, 129, 0.4); }
                
                .dropzone-3d {
                    border: 3px dashed #e2e8f0;
                    border-radius: 20px;
                    padding: 4rem;
                    transition: all 0.3s ease;
                    background: white;
                    cursor: pointer;
                    box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);
                }
                .dropzone-3d:hover {
                    border-color: #10b981;
                    background: #f0fdf4;
                    transform: translateY(-2px);
                    box-shadow: 0 20px 40px -10px rgba(16, 185, 129, 0.1);
                }
                .tilt-card {
                    transition: transform 0.5s cubic-bezier(0.23, 1, 0.32, 1), box-shadow 0.5s ease;
                    transform-style: preserve-3d;
                }
                .tilt-card:hover {
                    transform: translateY(-10px) rotateX(2deg) rotateY(-2deg);
                    box-shadow: 0 50px 100px -20px rgba(0, 0, 0, 0.15);
                }
                .blueprint-row {
                    transition: all 0.3s ease;
                }
                .blueprint-row:hover {
                    background: #f0fdf4 !important;
                    transform: translateZ(20px) scale(1.02);
                    box-shadow: 0 10px 20px rgba(16, 185, 129, 0.1);
                }
                .trust-badge-3d {
                    background: white;
                    border: 1px solid #dcfce7;
                    border-radius: 20px;
                    padding: 1.5rem;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 0.5rem;
                    flex: 1;
                    box-shadow: 0 10px 20px -5px rgba(0,0,0,0.05);
                    transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                }
                .trust-badge-3d:hover {
                    transform: translateY(-5px) scale(1.05);
                    box-shadow: 0 20px 30px -10px rgba(16, 185, 129, 0.2);
                    border-color: #10b981;
                }
                .audit-card {
                    background: #f8fafc;
                    border-radius: 20px;
                    padding: 2rem;
                    border: 1px solid #e2e8f0;
                    text-align: left;
                    display: flex;
                    flex-direction: column;
                    gap: 1.5rem;
                }
                .stat-pill {
                    background: white;
                    padding: 1rem 1.5rem;
                    border-radius: 16px;
                    border: 1px solid #f1f5f9;
                    box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
                    flex: 1;
                }
            `}</style>

            <div className="hero-3d">
                <div style={{ position: 'absolute', top: '-10%', left: '-5%', width: '300px', height: '300px', background: 'rgba(255,255,255,0.05)', borderRadius: '50%', filter: 'blur(60px)' }}></div>
                <div style={{ position: 'absolute', bottom: '10%', right: '-5%', width: '400px', height: '400px', background: 'rgba(5, 150, 105, 0.3)', borderRadius: '50%', filter: 'blur(80px)' }}></div>

                <BlockStack gap="400">
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
                        <div style={{
                            background: 'white',
                            padding: '1rem',
                            borderRadius: '24px',
                            boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
                            animation: 'float 6s ease-in-out infinite'
                        }}>
                            <ImportIcon style={{ width: '40px', height: '40px', color: '#10b981' }} />
                        </div>
                    </div>
                    <h1 style={{ fontSize: '3rem', fontWeight: 900, color: 'white', letterSpacing: '-0.03em' }}>
                        Migration Assistant
                    </h1>
                    <p style={{ fontSize: '1.25rem', opacity: 0.9, maxWidth: '600px', margin: '0 auto' }}>
                        Seamlessly teleport your reviews from ANY app—including Judge.me, Loox, and Yotpo.
                    </p>
                </BlockStack>
            </div>

            <div className="step-indicator" style={{ marginTop: '-2rem', position: 'relative', zIndex: 10 }}>
                {[1, 2, 3].map(i => (
                    <div key={i} className={`step-dot ${step >= i ? 'active' : ''}`} />
                ))}
            </div>

            <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 2rem 4rem 2rem' }}>
                {/* STEP 1: DUAL 3D MODULES */}
                {step === 1 && (
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(400px, 1fr) 1.5fr',
                        gap: '3rem',
                        alignItems: 'stretch',
                        perspective: '2000px'
                    }}>
                        {/* LEFT COLUMN: ACTION & TRUST */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3rem' }}>
                            {/* MODULE 1: THE PORTAL (UPLOAD) */}
                            <div className="tilt-card" style={{
                                background: 'white',
                                borderRadius: '40px',
                                padding: '3.5rem',
                                boxShadow: '0 40px 80px -15px rgba(0,0,0,0.1)',
                                border: '1px solid rgba(16, 185, 129, 0.1)',
                                position: 'relative',
                                overflow: 'hidden'
                            }}>
                                {/* Growth Emerald Backdrop Glow */}
                                <div style={{ position: 'absolute', top: '-20%', right: '-20%', width: '300px', height: '300px', background: 'rgba(16, 185, 129, 0.05)', borderRadius: '50%', filter: 'blur(60px)' }}></div>

                                <BlockStack gap="600">
                                    <BlockStack gap="200">
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                                            <div style={{
                                                fontSize: '3rem',
                                                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                                WebkitBackgroundClip: 'text',
                                                WebkitTextFillColor: 'transparent',
                                                filter: 'drop-shadow(0 10px 15px rgba(16,185,129,0.3))'
                                            }}>🚀</div>
                                            <BlockStack gap="100">
                                                <Text as="h2" variant="headingLg">Instant Migration</Text>
                                                <Text as="p" tone="subdued">Universal review teleportation engine</Text>
                                            </BlockStack>
                                        </div>
                                    </BlockStack>

                                    <DropZone onDrop={handleDrop} allowMultiple={false} accept=".csv">
                                        <div className="dropzone-3d" style={{
                                            padding: '4rem 2rem',
                                            background: 'linear-gradient(145deg, #ffffff 0%, #f1fdf4 100%)',
                                            border: '2px dashed #10b98144',
                                            borderRadius: '30px'
                                        }}>
                                            <BlockStack gap="400" align="center">
                                                <div style={{
                                                    fontSize: '5rem',
                                                    animation: 'float 4s ease-in-out infinite',
                                                    filter: 'drop-shadow(0 25px 30px rgba(0,0,0,0.15))'
                                                }}>📦</div>
                                                <Text as="p" variant="headingMd" fontWeight="bold">Drop CSV to start migration</Text>
                                                <div style={{
                                                    background: 'rgba(16, 185, 129, 0.1)',
                                                    color: '#047857',
                                                    padding: '8px 20px',
                                                    borderRadius: '30px',
                                                    fontSize: '0.9rem',
                                                    fontWeight: 700,
                                                    border: '1px solid rgba(16, 185, 129, 0.2)'
                                                }}>
                                                    Unlimited Review Support
                                                </div>
                                            </BlockStack>
                                        </div>
                                    </DropZone>

                                    <div style={{ textAlign: 'center', opacity: 0.6, fontSize: '0.85rem' }}>
                                        Your data never leaves the Shopify ecosystem.
                                    </div>
                                </BlockStack>
                            </div>

                            {/* MODULE 1.2: GOOGLE / ALIEXPRESS PASTE IMPORT */}
                            <div className="tilt-card" style={{
                                background: 'white',
                                borderRadius: '32px',
                                padding: '2.5rem',
                                boxShadow: '0 20px 50px -10px rgba(0,0,0,0.07)',
                                border: '1px solid #f1f5f9',
                            }}>
                                <BlockStack gap="400">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <div style={{ fontSize: '2rem' }}>📋</div>
                                        <BlockStack gap="100">
                                            <Text as="h2" variant="headingMd" fontWeight="bold">Paste Import</Text>
                                            <Text as="p" tone="subdued" variant="bodySm">Import from Google or AliExpress by pasting exported data</Text>
                                        </BlockStack>
                                    </div>
                                    <Select
                                        label="Import source"
                                        options={[
                                            { label: 'Google Reviews (Takeout JSON or CSV)', value: 'google' },
                                            { label: 'AliExpress Reviews (DSers JSON or CSV)', value: 'aliexpress' },
                                        ]}
                                        value={importSource === 'csv' ? 'google' : importSource}
                                        onChange={(v) => setImportSource(v as "google" | "aliexpress")}
                                    />
                                    <TextField
                                        label={importSource === 'aliexpress' ? 'Paste AliExpress review data (JSON or CSV)' : 'Paste Google review data (JSON or CSV)'}
                                        value={pasteText}
                                        onChange={setPasteText}
                                        multiline={6}
                                        autoComplete="off"
                                        placeholder={importSource === 'aliexpress'
                                            ? '[{"name":"Alice","stars":5,"feedback":"Great product!","date":"2024-01-15"}]'
                                            : '[{"reviewer_name":"John","rating":5,"text":"Excellent!","published_at":"2024-01-10"}]'}
                                    />
                                    <Button
                                        variant="primary"
                                        tone="success"
                                        onClick={handlePasteImport}
                                        loading={fetcher.state === "submitting" && hasSubmitted}
                                        disabled={!pasteText.trim()}
                                        fullWidth
                                    >
                                        Import {importSource === 'aliexpress' ? 'AliExpress' : 'Google'} Reviews →
                                    </Button>
                                    {fetcher.data && !fetcher.data.success && hasSubmitted && (
                                        <Banner tone="critical"><Text as="p">{fetcher.data.message}</Text></Banner>
                                    )}
                                    {fetcher.data?.success && hasSubmitted && (
                                        <Banner tone="success"><Text as="p">{fetcher.data.message}</Text></Banner>
                                    )}
                                </BlockStack>
                            </div>

                            {/* MODULE 1.5: 3D SECURITY ANCHOR */}
                            <div style={{
                                display: 'flex',
                                gap: '1.5rem',
                                padding: '0 0.5rem'
                            }}>
                                {[
                                    { icon: "🛡️", label: "SSL Secure", sub: "Encrypted", color: "#10b981" },
                                    { icon: "💎", label: "Pure Data", sub: "No Loss", color: "#06b6d4" },
                                    { icon: "⚡", label: "Native API", sub: "Shopify verified", color: "#8b5cf6" }
                                ].map((trust, i) => (
                                    <div key={i} className="trust-badge-3d">
                                        <div style={{ fontSize: '2rem', marginBottom: '4px' }}>{trust.icon}</div>
                                        <Text as="p" fontWeight="bold" variant="bodyMd">{trust.label}</Text>
                                        <Text as="p" tone="subdued" variant="bodyXs">{trust.sub}</Text>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* RIGHT COLUMN: CSV FORMAT GUIDE */}
                        {/* RIGHT COLUMN: CSV FORMAT GUIDE */}
                        <div className="tilt-card" style={{
                            background: 'white',
                            borderRadius: '40px',
                            padding: '3rem',
                            boxShadow: '0 40px 80px -15px rgba(0,0,0,0.05)',
                            border: '1px solid #f1f5f9',
                            height: '100%',
                            display: 'flex',
                            flexDirection: 'column'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                                <BlockStack gap="100">
                                    <Text as="h2" variant="headingLg" fontWeight="bold">Column Reference</Text>
                                    <Text as="p" tone="subdued" variant="bodySm">Auto-detected headers for seamless imports.</Text>
                                </BlockStack>
                                <Button 
                                    icon={NoteIcon} 
                                    onClick={() => window.open('/app/import/template', '_blank')}
                                >
                                    Download Sample
                                </Button>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                                {[
                                    { field: 'Rating',        required: true,  type: 'Number (1–5)',         accepts: ['rating', 'stars', 'star'] },
                                    { field: 'Review Body',   required: true,  type: 'Text (long)',          accepts: ['body', 'content', 'review', 'text', 'comment'] },
                                    { field: 'Customer Name', required: false, type: 'Text',                 accepts: ['name', 'author', 'customer', 'reviewer'] },
                                    { field: 'Email',         required: false, type: 'Email',                accepts: ['email', 'customeremail'] },
                                    { field: 'Review Title',  required: false, type: 'Text (short)',         accepts: ['title', 'headline'] },
                                    { field: 'Date',          required: false, type: 'Timestamp',            accepts: ['date', 'createdat', 'timestamp'] },
                                    { field: 'Product',       required: false, type: 'Handle or URL',        accepts: ['handle', 'product_url', 'product'] },
                                    { field: 'Images',        required: false, type: 'Comma-sep URLs',       accepts: ['picture_urls', 'images', 'photos'] },
                                    { field: 'Owner Reply',   required: false, type: 'Text',                 accepts: ['reply', 'response'] },
                                ].map((row, i) => (
                                    <div key={i} style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '12px 0',
                                        borderBottom: i === 8 ? 'none' : '1px solid #f1f5f9'
                                    }}>
                                        <div style={{ width: '180px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <Text as="p" variant="bodyMd" fontWeight="semibold" tone={row.required ? "base" : "subdued"}>
                                                    {row.field}
                                                </Text>
                                                {row.required && (
                                                    <span style={{ width: '6px', height: '6px', background: '#ef4444', borderRadius: '50%' }} title="Required"></span>
                                                )}
                                            </div>
                                            <Text as="p" variant="bodyXs" tone="subdued">{row.type}</Text>
                                        </div>
                                        <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: '6px', justifyContent: 'flex-end' }}>
                                            {row.accepts.map((a, j) => (
                                                <span key={j} style={{
                                                    fontSize: '0.75rem',
                                                    background: '#f8fafc',
                                                    color: '#64748b',
                                                    padding: '2px 8px',
                                                    borderRadius: '6px',
                                                    fontFamily: 'monospace'
                                                }}>
                                                    {a}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div style={{
                                marginTop: '2rem',
                                background: '#f8fafc',
                                borderRadius: '12px',
                                padding: '16px',
                                fontSize: '0.85rem',
                                color: '#475569',
                                display: 'flex',
                                gap: '12px',
                                alignItems: 'center'
                            }}>
                                <div style={{ fontSize: '1.2rem' }}>💡</div>
                                <div>
                                    Exports from <strong>Judge.me, Loox, Yotpo</strong>, and <strong>Okendo</strong> are supported natively. Just drop the file directly without editing!
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* EXPORT SECTION — always visible on step 1 */}
                {step === 1 && (
                    <div style={{
                        marginTop: '3rem',
                        background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)',
                        borderRadius: '32px',
                        padding: '3rem 4rem',
                        display: 'grid',
                        gridTemplateColumns: '1fr auto',
                        alignItems: 'center',
                        gap: '4rem',
                        boxShadow: '0 40px 80px -15px rgba(99,102,241,0.25)',
                        border: '1px solid rgba(139,92,246,0.2)',
                    }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                <span style={{ fontSize: '2.5rem', filter: 'drop-shadow(0 8px 12px rgba(139,92,246,0.5))' }}>⬇</span>
                                <div>
                                    <h2 style={{ color: 'white', fontSize: '1.6rem', fontWeight: 900, margin: 0, letterSpacing: '-0.02em' }}>Export Your Reviews</h2>
                                    <p style={{ color: 'rgba(255,255,255,0.55)', margin: '4px 0 0', fontSize: '0.95rem' }}>Your data, always yours — zero lock-in</p>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
                                {[
                                    { icon: '⭐', text: 'Ratings & review text' },
                                    { icon: '📸', text: 'Photo URLs' },
                                    { icon: '💬', text: 'Your replies' },
                                    { icon: '✅', text: 'Verified buyer status' },
                                ].map((item, i) => (
                                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span>{item.icon}</span>
                                        <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', fontWeight: 600 }}>{item.text}</span>
                                    </div>
                                ))}
                            </div>
                            <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.8rem', margin: 0 }}>
                                Compatible with Judge.me, Loox, Yotpo &amp; all major apps · Free on all plans
                            </p>
                        </div>
                        <button
                            onClick={() => exportFetcher.submit({ intent: "export" }, { method: "post" })}
                            disabled={exportFetcher.state !== "idle"}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: '10px', whiteSpace: 'nowrap',
                                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                color: 'white', padding: '1.1rem 2.5rem', borderRadius: '20px',
                                fontWeight: 900, fontSize: '1.05rem', border: 'none',
                                cursor: exportFetcher.state !== "idle" ? 'wait' : 'pointer',
                                opacity: exportFetcher.state !== "idle" ? 0.7 : 1,
                                boxShadow: '0 20px 40px -10px rgba(99,102,241,0.55)',
                                transition: 'all 0.2s cubic-bezier(0.4,0,0.2,1)',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px) scale(1.03)'; e.currentTarget.style.boxShadow = '0 28px 50px -10px rgba(99,102,241,0.7)'; }}
                            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0) scale(1)'; e.currentTarget.style.boxShadow = '0 20px 40px -10px rgba(99,102,241,0.55)'; }}
                        >
                            {exportFetcher.state !== "idle" ? "Exporting..." : "⬇ Download CSV"}
                        </button>
                    </div>
                )}

                {/* STEP 2: PREVIEW & CONFIRM */}
                {step === 2 && previewData && (
                    <div className="tilt-card" style={{
                        background: 'white',
                        borderRadius: '40px',
                        padding: '3rem',
                        border: '1px solid #e2e8f0',
                        boxShadow: '0 40px 80px -20px rgba(0,0,0,0.1)',
                        maxWidth: '800px',
                        margin: '0 auto'
                    }}>
                        <BlockStack gap="600">
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🧐</div>
                                <Text as="h2" variant="headingLg">Review Inspection</Text>
                                <Text as="p" tone="subdued">We found {previewData.count} reviews. Please double-check the data below.</Text>
                            </div>

                            {/* MAPPING STATUS */}
                            <div style={{ background: previewData.hasBody ? '#ecfdf5' : '#fef2f2', padding: '1.5rem', borderRadius: '20px', border: `1px solid ${previewData.hasBody ? '#10b981' : '#ef4444'}` }}>
                                <BlockStack gap="200">
                                    <InlineStack align="space-between">
                                        <Text as="h3" variant="headingSm">Content Detection Status:</Text>
                                        {previewData.hasBody ? (
                                            <Badge tone="success">✅ Body Found</Badge>
                                        ) : (
                                            <Badge tone="critical">❌ BODY MISSING</Badge>
                                        )}
                                    </InlineStack>
                                    {!previewData.hasBody && (
                                        <Text as="p" tone="critical">
                                            We couldn't find a column for review text. Please rename your column to "Review Body" or "Body".
                                            Found Headers: {previewData.headers.join(', ')}
                                        </Text>
                                    )}
                                </BlockStack>
                            </div>

                            {/* PREVIEW TABLE */}
                            <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '380px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                    <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                            <th style={{ padding: '12px', textAlign: 'left' }}>Values Found</th>
                                            {previewData.headers.map((h: string, i: number) => (
                                                <th key={i} style={{ padding: '12px', textAlign: 'left', textTransform: 'capitalize' }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {previewData.samples.map((row: any, i: number) => (
                                            <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                <td style={{ padding: '12px', background: '#f8fafc', fontWeight: 600, width: '150px' }}>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                        <span>⭐ {row.rating}</span>
                                                        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{row.customer}</span>
                                                        <div style={{ fontSize: '0.75rem', padding: '4px', background: row.body ? '#dcfce7' : '#fee2e2', borderRadius: '4px', color: row.body ? '#166534' : '#991b1b' }}>
                                                            {row.body ? (row.body.length > 30 ? row.body.substring(0, 30) + '...' : row.body) : 'EMPTY'}
                                                        </div>
                                                    </div>
                                                </td>
                                                {/* Show RAW values for debugging */}
                                                {(previewData.rawSamples[i] ?? []).map((cell: string, ci: number) => (
                                                    <td key={ci} style={{ padding: '12px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {cell}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <BlockStack gap="400">
                                <Button
                                    size="large"
                                    variant="primary"
                                    tone="success"
                                    onClick={handleImport}
                                    loading={fetcher.state === "submitting"}
                                    disabled={!previewData.hasBody}
                                    fullWidth
                                >
                                    Looks Good? Start Migration →
                                </Button>
                                {fetcher.state === "submitting" && hasSubmitted && (
                                    <BlockStack gap="200">
                                        <ProgressBar progress={importProgress} size="small" tone="success" />
                                        <Text as="p" variant="bodySm" tone="subdued" alignment="center">Importing reviews... {Math.round(importProgress)}%</Text>
                                    </BlockStack>
                                )}
                                <Button variant="plain" onClick={() => setStep(1)}>
                                    Upload Different File
                                </Button>
                            </BlockStack>
                        </BlockStack>
                    </div>
                )}

                {/* STEP 2 & 3: WIZARD FLOW */}
                {(step === 2 || step === 3) && (
                    <div className="hero-card">
                        <BlockStack gap="600">
                            {/* STEP 2: AUDIT */}
                            {step === 2 && auditData && (() => {
                                const FREE_CAP = 50;
                                const remaining = Math.max(0, FREE_CAP - existingCount);
                                const overLimit = !isPro && auditData.count > remaining;
                                return (
                                <BlockStack gap="600">
                                    <div style={{ textAlign: 'center' }}>
                                        <Text as="h2" variant="headingLg">Audit Complete! 🛡️</Text>
                                        <Text as="p" tone="subdued">We parsed your file and verified the data integrity.</Text>
                                    </div>

                                    <div className="audit-card">
                                        <div style={{ display: 'flex', gap: '1rem' }}>
                                            <div className="stat-pill">
                                                <Text as="p" tone="subdued" variant="bodySm">REVIEWS FOUND</Text>
                                                <Text as="p" variant="headingXl" fontWeight="bold">{auditData.count.toLocaleString()}</Text>
                                            </div>
                                            <div className="stat-pill">
                                                <Text as="p" tone="subdued" variant="bodySm">AVG RATING</Text>
                                                <Text as="p" variant="headingXl" fontWeight="bold" tone="success">★ {auditData.rating}</Text>
                                            </div>
                                        </div>
                                        <div className="stat-pill">
                                            <Text as="p" tone="subdued" variant="bodySm">DETECTED FORMAT</Text>
                                            <Text as="p" variant="headingLg" fontWeight="bold">{auditData.platforms.join(', ')}</Text>
                                        </div>
                                    </div>

                                    {overLimit && (
                                        <Banner tone="warning">
                                            <BlockStack gap="200">
                                                <Text as="p" fontWeight="bold">
                                                    Free plan limit reached
                                                </Text>
                                                <Text as="p">
                                                    Your file has {auditData.count} reviews, but you can only add {remaining} more (free plan allows 50 total — you already have {existingCount}).
                                                    {remaining === 0
                                                        ? " You've reached the limit. Upgrade to Empire Pro for unlimited reviews."
                                                        : ` You can import the first ${remaining} reviews now, or upgrade to Empire Pro to import all ${auditData.count}.`}
                                                </Text>
                                            </BlockStack>
                                        </Banner>
                                    )}

                                    <InlineStack align="center" gap="400">
                                        <Button size="large" onClick={() => setStep(1)}>Back</Button>
                                        {overLimit ? (
                                            <>
                                                {remaining > 0 && (
                                                    <div style={{ minWidth: '220px' }}>
                                                        <Button
                                                            size="large"
                                                            variant="primary"
                                                            tone="success"
                                                            onClick={() => handleImport(remaining)}
                                                            loading={fetcher.state === "submitting"}
                                                            fullWidth
                                                        >
                                                            {`Import First ${remaining} Reviews →`}
                                                        </Button>
                                                    </div>
                                                )}
                                                <Button size="large" variant="primary" url="/app/plans">
                                                    Upgrade to Pro →
                                                </Button>
                                            </>
                                        ) : (
                                            <div style={{ minWidth: '200px' }}>
                                                <Button
                                                    size="large"
                                                    variant="primary"
                                                    tone="success"
                                                    onClick={() => handleImport()}
                                                    loading={fetcher.state === "submitting"}
                                                    fullWidth
                                                >
                                                    Launch Migration →
                                                </Button>
                                            </div>
                                        )}
                                    </InlineStack>
                                    {fetcher.state === "submitting" && hasSubmitted && (
                                        <BlockStack gap="200">
                                            <ProgressBar progress={importProgress} size="small" tone="success" />
                                            <Text as="p" variant="bodySm" tone="subdued" alignment="center">Importing reviews... {Math.round(importProgress)}%</Text>
                                        </BlockStack>
                                    )}
                                </BlockStack>
                                );
                            })()}

                            {/* STEP 3: SUCCESS */}
                            {step === 3 && (
                                <BlockStack gap="600" align="center">
                                    <div style={{
                                        width: '100px',
                                        height: '100px',
                                        background: '#10b981',
                                        borderRadius: '50%',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '3rem',
                                        color: 'white',
                                        animation: 'pulse-glow 2s infinite'
                                    }}>
                                        ✓
                                    </div>
                                    <div style={{ textAlign: 'center' }}>
                                        <Text as="h1" variant="headingXl" fontWeight="bold">Migration Successful!</Text>
                                        <Text as="p" variant="bodyLg" tone="subdued">
                                            {fetcher.data?.message || "Your reviews have been teleported to Empire."}
                                        </Text>
                                    </div>
                                    <InlineStack gap="400">
                                        <Button size="large" onClick={() => navigate("/app/reviews")}>View Reviews</Button>
                                        <Button size="large" variant="primary" tone="success" onClick={() => setStep(1)}>Import More</Button>
                                    </InlineStack>
                                </BlockStack>
                            )}
                        </BlockStack>
                    </div>
                )}
            </div>

        </div>
    );
}
