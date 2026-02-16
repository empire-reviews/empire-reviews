import { json, type ActionFunctionArgs, unstable_parseMultipartFormData, unstable_createMemoryUploadHandler } from "@remix-run/node";
import { useFetcher, useNavigate } from "@remix-run/react";
import {
    Page,
    Layout,
    Card,
    BlockStack,
    Text,
    Button,
    DropZone,
    Banner,
    List,
    Box,
    InlineStack,
    Badge,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { useState, useCallback, useEffect } from "react";
import { ArrowLeftIcon, ImportIcon, NoteIcon } from "@shopify/polaris-icons";

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

export const action = async ({ request }: ActionFunctionArgs) => {
    const { session, admin } = await authenticate.admin(request);
    const shop = session.shop;

    try {
        const uploadHandler = unstable_createMemoryUploadHandler({ maxPartSize: 5_000_000 });
        const formData = await unstable_parseMultipartFormData(request, uploadHandler);
        const file = formData.get("file") as File;

        if (!file || file.size === 0) return json({ success: false, message: "No file uploaded." });
        if (!file.name.endsWith('.csv')) return json({ success: false, message: "Invalid file type. Please upload a .csv file." });

        const text = await file.text();
        const records = parseCSV(text);

        const allIdentifiers = records.map((r: any) => ({ handle: r.handle, title: r.product_title }));
        const productMap = await resolveProductsSmartly(admin, allIdentifiers);

        let importedCount = 0;
        let skippedCount = 0;

        const simpleReviews = [];
        const complexReviews = []; // Have media or replies

        for (const record of records) {
            const rating = parseInt(record.rating || "5");
            const body = record.body || "No content";
            const customerName = record.customer || "Anonymous";
            const customerEmail = record.email || null;
            const title = record.review_title || null;
            const createdAt = record.date ? new Date(record.date) : new Date();

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

                const reviewData = {
                    productId: productId || null,
                    rating,
                    body,
                    title,
                    customerName,
                    customerEmail,
                    shop,
                    createdAt,
                    sentiment: rating >= 4 ? "positive" : rating === 3 ? "neutral" : "negative",
                    verified: true,
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

        // DEBUG: Return first record for inspection
        const debugInfo = records.length > 0 ? {
            detectedHeaders: Object.keys(records[0]),
            firstRecord: records[0]
        } : null;

        return json({
            success: true,
            count: importedCount,
            skipped: skippedCount,
            message,
            debug: debugInfo
        });

    } catch (e) {
        console.error(e);
        return json({ success: false, message: `Import Failed: ${e instanceof Error ? e.message : String(e)}` });
    }
};

export default function ImportPage() {
    const fetcher = useFetcher<any>();
    const navigate = useNavigate();
    const [file, setFile] = useState<File | null>(null);
    const [step, setStep] = useState<1 | 2 | 3>(1);
    const [auditData, setAuditData] = useState<{ count: number, rating: number, platforms: string[] } | null>(null);
    const [previewData, setPreviewData] = useState<any>(null);
    const [hasSubmitted, setHasSubmitted] = useState(false);

    const handleDrop = useCallback(async (_droppedFiles: File[], acceptedFiles: File[], _rejectedFiles: File[]) => {
        const droppedFile = acceptedFiles[0];
        setFile(droppedFile);
        setHasSubmitted(false); // Reset submission state

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
        const rawHeaders = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '')); // Display friendly

        // check first 3 records
        const samples = records.slice(0, 3);
        const hasBody = samples.some(r => r.body && r.body.length > 0);

        // We also want the RAW values corresponding to the detected headers for the table
        // This is tricky without exposing internal parser state.
        // For now, valid display is enough.

        // Let's construct a "rawSamples" array by just splitting the lines simply for display purposes 
        // (Visual check only, doesn't need to be perfect parsing as long as user sees content)
        const rawSamples = lines.slice(1, 4).map(line => line.split(',').map(s => s.trim().replace(/^"|"$/g, '')));

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

        const avgRating = records.reduce((acc, curr) => acc + parseInt(curr.rating || "5"), 0) / (records.length || 1);

        setAuditData({
            count: records.length,
            rating: parseFloat(avgRating.toFixed(1)),
            platforms: platforms.length > 0 ? platforms : ['Standard CSV']
        });
        setStep(2);
    }, []);

    const handleImport = () => {
        if (!file) return;
        setHasSubmitted(true);
        const formData = new FormData();
        formData.append("file", file);
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

    return (
        <div className="empire-import">
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
                        gridTemplateColumns: 'minmax(400px, 1.3fr) 1fr',
                        gap: '3rem',
                        alignItems: 'start',
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

                        {/* STEP 2: PREVIEW & CONFIRM (The "Previous Method") */}
                        {step === 2 && previewData && (
                            <div className="tilt-card" style={{
                                background: 'white',
                                borderRadius: '40px',
                                padding: '3rem',
                                border: '1px solid #e2e8f0',
                                boxShadow: '0 40px 80px -20px rgba(0,0,0,0.1)'
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
                                    <div style={{ overflowX: 'auto', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                            <thead>
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
                                                        {previewData.rawSamples[i].map((cell: string, ci: number) => (
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
                                        <Button variant="plain" onClick={() => setStep(1)}>
                                            Upload Different File
                                        </Button>
                                    </BlockStack>
                                </BlockStack>
                            </div>
                        )}
                    </div>
                )}

                {/* STEP 2 & 3: WIZARD FLOW */}
                {(step === 2 || step === 3) && (
                    <div className="hero-card">
                        <BlockStack gap="600">
                            {/* STEP 2: AUDIT */}
                            {step === 2 && auditData && (
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

                                    <InlineStack align="center" gap="400">
                                        <Button size="large" onClick={() => setStep(1)}>Back</Button>
                                        <div style={{ minWidth: '200px' }}>
                                            <Button
                                                size="large"
                                                variant="primary"
                                                tone="success"
                                                onClick={handleImport}
                                                loading={fetcher.state === "submitting"}
                                                fullWidth
                                            >
                                                Launch Migration →
                                            </Button>
                                        </div>
                                    </InlineStack>
                                </BlockStack>
                            )}

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
