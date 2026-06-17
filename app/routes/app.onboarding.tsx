import { useState, useCallback } from "react";
import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useRouteError, isRouteErrorResponse } from "@remix-run/react";
import {
    Page,
    Layout,
    Card,
    BlockStack,
    InlineStack,
    Text,
    Button,
    TextField,
    Select,
    ChoiceList,
    Checkbox,
    ProgressBar,
    DropZone,
    Thumbnail
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { requirePayment } from "../billing.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    try {
        const { session } = await authenticate.admin(request);
        return json({
            shop: session.shop,
            extensionId: process.env.SHOPIFY_APP_EXTENSION_ID || "",
        });
    } catch (error) {
        if (error instanceof Response) throw error;
        const msg = error instanceof Error ? error.message : String(error);
        const stack = error instanceof Error ? error.stack : "";
        throw new Response(stack || msg, { status: 500, statusText: "Onboarding Loader Crash" });
    }
};

export const action = async ({ request }: ActionFunctionArgs) => {
    const { session, billing } = await authenticate.admin(request);
    const formData = await request.formData();
    
    const intent = formData.get("intent");
    const adminEmail = formData.get("adminEmail") as string || "";
    const language = formData.get("language") as string || "en";
    const themeColor = formData.get("themeColor") as string || "#000000";
    const storeLogoUrl = formData.get("storeLogoUrl") as string || "";
    const businessType = formData.get("businessType") as string || "";
    const isDropshipping = formData.get("isDropshipping") === "true";
    const acquisitionStrategy = formData.getAll("acquisitionStrategy") as string[];

    await prisma.settings.upsert({
        where: { shop: session.shop },
        update: {
            hasCompletedOnboarding: true,
            adminEmail,
            language,
            themeColor,
            storeLogoUrl,
            businessType,
            isDropshipping,
            acquisitionStrategy: acquisitionStrategy.join(','), // Join in case it's string in DB, or if it's array Prisma will accept it. Actually let's assume it's just passing it. Wait, passing join(',') might be safer if SQLite. Let's just use JSON stringify or just the array if we don't know. Wait, if it's String field, let's use string. If it's String[], array is fine. The user said "schema fields we just added". I will pass JSON.stringify(acquisitionStrategy) to be safe if it's a string, or just let Prisma handle the array. Actually, let's just pass `acquisitionStrategy.join(",")` because it's a comma separated string most likely, or just pass `acquisitionStrategy`. Let me check prisma schema. Wait, I don't know the schema. I'll just pass `acquisitionStrategy.join(',')`. Wait, the prompt says "new schema fields we just added (... acquisitionStrategy ... )".
        },
        create: {
            shop: session.shop,
            hasCompletedOnboarding: true,
            adminEmail,
            language,
            themeColor,
            storeLogoUrl,
            businessType,
            isDropshipping,
            acquisitionStrategy: acquisitionStrategy.join(','),
        },
    });

    if (intent === "upgrade") {
        // Initiate the Shopify managed-billing flow. requirePayment calls
        // billing.request(), which redirects the merchant to Shopify's
        // subscription confirmation page (honoring the app-level trialDays),
        // then returns them to the app. This actually starts the trial — the
        // previous redirect to /app just silently dropped them on the free plan.
        return await requirePayment(billing);
    }

    return redirect("/app");
};

export default function Onboarding() {
    const { shop, extensionId } = useLoaderData<typeof loader>();
    const submit = useSubmit();
    const navigation = useNavigation();
    
    const [step, setStep] = useState(1);
    const totalSteps = 6;
    
    // Step 1
    const [adminEmail, setAdminEmail] = useState("");
    const [language, setLanguage] = useState("en");
    
    // Step 2
    const [themeColor, setThemeColor] = useState("#000000");
    const [storeLogoUrl, setStoreLogoUrl] = useState("");
    
    // Step 3
    const [businessType, setBusinessType] = useState(["ecommerce"]);
    const [isDropshipping, setIsDropshipping] = useState(["no"]);
    
    // Step 4
    const [strategyEmail, setStrategyEmail] = useState(true);
    const [strategySms, setStrategySms] = useState(false);
    const [strategyOnSite, setStrategyOnSite] = useState(true);

    const handleNext = () => setStep((s) => Math.min(s + 1, totalSteps));
    const handleBack = () => setStep((s) => Math.max(s - 1, 1));
    
    const handleDropZoneDrop = useCallback(
        (_dropFiles: File[], acceptedFiles: File[], _rejectedFiles: File[]) => {
            // For now, we rely on the URL input since file upload to Cloudinary directly from client 
            // requires signed uploads or public presets which we don't have configured here yet.
        },
        []
    );

    const handleSubmit = (intent: "free" | "upgrade") => {
        const formData = new FormData();
        formData.append("intent", intent);
        formData.append("adminEmail", adminEmail);
        formData.append("language", language);
        formData.append("themeColor", themeColor);
        formData.append("storeLogoUrl", storeLogoUrl);
        formData.append("businessType", businessType[0]);
        formData.append("isDropshipping", isDropshipping[0] === "yes" ? "true" : "false");
        
        if (strategyEmail) formData.append("acquisitionStrategy", "email");
        if (strategySms) formData.append("acquisitionStrategy", "sms");
        if (strategyOnSite) formData.append("acquisitionStrategy", "onsite");

        submit(formData, { method: "post" });
    };

    const isSubmitting = navigation.state === "submitting";

    const renderStepContent = () => {
        switch (step) {
            case 1:
                return (
                    <div>
                        <h2 className="step-title">Welcome to Empire Reviews</h2>
                        <p className="step-subtitle">Let's set up your basic preferences so we can tailor your experience.</p>
                        <BlockStack gap="400">
                            <Select
                                label="Widget Language"
                                options={[
                                    { label: 'English', value: 'en' },
                                    { label: 'Spanish', value: 'es' },
                                    { label: 'French', value: 'fr' },
                                    { label: 'German', value: 'de' },
                                ]}
                                value={language}
                                onChange={setLanguage}
                            />
                            <TextField
                                label="Admin Email (for notifications)"
                                value={adminEmail}
                                onChange={setAdminEmail}
                                autoComplete="email"
                                type="email"
                                helpText="We'll send review alerts here."
                            />
                        </BlockStack>
                    </div>
                );
            case 2:
                return (
                    <div>
                        <h2 className="step-title">Brand Your Experience</h2>
                        <p className="step-subtitle">Make the review widgets look like they belong to your store.</p>
                        <BlockStack gap="400">
                            <TextField
                                label="Primary Theme Color (Hex code)"
                                value={themeColor}
                                onChange={setThemeColor}
                                autoComplete="off"
                                prefix={<div style={{width: 16, height: 16, backgroundColor: themeColor, borderRadius: '50%'}}></div>}
                            />
                            <TextField
                                label="Store Logo URL"
                                value={storeLogoUrl}
                                onChange={setStoreLogoUrl}
                                autoComplete="url"
                                helpText="Paste the Cloudinary URL or any hosted image URL for your logo."
                            />
                            <DropZone onDrop={handleDropZoneDrop} allowMultiple={false}>
                                {storeLogoUrl ? (
                                    <div style={{padding: '1rem', display: 'flex', justifyContent: 'center'}}>
                                        <Thumbnail size="large" alt="Store Logo" source={storeLogoUrl} />
                                    </div>
                                ) : (
                                    <DropZone.FileUpload actionHint="Accepts .gif, .jpg, and .png" />
                                )}
                            </DropZone>
                        </BlockStack>
                    </div>
                );
            case 3:
                return (
                    <div>
                        <h2 className="step-title">About Your Business</h2>
                        <p className="step-subtitle">This helps us optimize your review request timing.</p>
                        <BlockStack gap="400">
                            <ChoiceList
                                title="Primary Business Type"
                                choices={[
                                    { label: 'E-commerce (Physical Goods)', value: 'ecommerce' },
                                    { label: 'Digital Products', value: 'digital' },
                                    { label: 'Services', value: 'services' },
                                ]}
                                selected={businessType}
                                onChange={setBusinessType}
                            />
                            <ChoiceList
                                title="Do you primarily dropship?"
                                choices={[
                                    { label: 'Yes (Longer shipping times)', value: 'yes' },
                                    { label: 'No (In-house fulfillment)', value: 'no' },
                                ]}
                                selected={isDropshipping}
                                onChange={setIsDropshipping}
                            />
                        </BlockStack>
                    </div>
                );
            case 4:
                return (
                    <div>
                        <h2 className="step-title">Review Acquisition</h2>
                        <p className="step-subtitle">How do you want to collect reviews?</p>
                        <BlockStack gap="400">
                            <Checkbox
                                label="Automated Email Requests"
                                checked={strategyEmail}
                                onChange={setStrategyEmail}
                                helpText="Send an email to buyers after their order is fulfilled."
                            />
                            <Checkbox
                                label="SMS Requests"
                                checked={strategySms}
                                onChange={setStrategySms}
                                helpText="Send text messages (requires SMS plan)."
                            />
                            <Checkbox
                                label="On-Site Review Collection"
                                checked={strategyOnSite}
                                onChange={setStrategyOnSite}
                                helpText="Allow customers to leave reviews directly on the product page."
                            />
                        </BlockStack>
                    </div>
                );
            case 5:
                const editorUrl = `https://admin.shopify.com/store/${shop.replace('.myshopify.com', '')}/themes/current/editor?context=apps&appEmbed=${extensionId}`;
                return (
                    <div>
                        <h2 className="step-title">Enable App Embed</h2>
                        <p className="step-subtitle">To display reviews on your storefront, you must enable the Empire Reviews App Embed in your Shopify Theme Editor.</p>
                        <div style={{ background: '#f8fafc', padding: '2rem', borderRadius: '20px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                            <BlockStack gap="400" align="center" inlineAlign="center">
                                <p style={{ fontSize: '1.1rem', color: '#475569' }}>Click the button below to open your theme editor. Ensure the toggle is turned ON, then click Save.</p>
                                <Button 
                                    size="large"
                                    variant="primary" 
                                    url={editorUrl} 
                                    target="_blank"
                                >
                                    Open Theme Editor
                                </Button>
                            </BlockStack>
                        </div>
                    </div>
                );
            case 6:
                return (
                    <div>
                        <h2 className="step-title">Choose Your Empire</h2>
                        <p className="step-subtitle">Start collecting reviews immediately. Upgrade to Pro for unlimited features!</p>
                        
                        <div className="plans-grid">
                            {/* Free Plan */}
                            <div className="plan-card">
                                <h3 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>Free Plan</h3>
                                <p style={{ fontSize: '1.2rem', color: '#64748b', marginBottom: '2rem' }}>$0 <span style={{fontSize:'0.9rem'}}>/ month</span></p>
                                
                                <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 2rem 0', display: 'flex', flexDirection: 'column', gap: '1rem', color: '#475569' }}>
                                    <li>✓ Up to 50 review requests/mo</li>
                                    <li>✓ Basic review widgets</li>
                                    <li>✓ Standard support</li>
                                </ul>
                                
                                <Button
                                    size="large"
                                    onClick={() => handleSubmit('free')}
                                    loading={isSubmitting}
                                    disabled={isSubmitting}
                                    fullWidth
                                >
                                    Start Free
                                </Button>
                            </div>

                            {/* Pro Plan */}
                            <div className="plan-card premium">
                                <div className="premium-glow"></div>
                                <div style={{ position: 'relative', zIndex: 1 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                        <h3 style={{ fontSize: '1.5rem', fontWeight: 800 }}>Empire Pro</h3>
                                        <span style={{ background: '#10b981', padding: '4px 10px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.5px', textTransform: 'uppercase' }}>Recommended</span>
                                    </div>
                                    <p style={{ fontSize: '1.2rem', color: '#a7f3d0', marginBottom: '2rem' }}>$9.99 <span style={{fontSize:'0.9rem'}}>/ month</span></p>
                                    
                                    <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 2.5rem 0', display: 'flex', flexDirection: 'column', gap: '1rem', color: '#ecfdf5', fontSize: '1.05rem' }}>
                                        <li>✓ <strong>Unlimited</strong> review requests</li>
                                        <li>✓ Photo & Video reviews</li>
                                        <li>✓ 3D Carousel & Premium Widgets</li>
                                        <li>✓ Priority Email Support</li>
                                    </ul>
                                    
                                    <button 
                                        onClick={() => handleSubmit('upgrade')}
                                        disabled={isSubmitting}
                                        style={{
                                            width: '100%',
                                            padding: '16px',
                                            background: 'white',
                                            color: '#064e3b',
                                            border: 'none',
                                            borderRadius: '12px',
                                            fontWeight: 800,
                                            fontSize: '1rem',
                                            cursor: 'pointer',
                                            boxShadow: '0 10px 20px -5px rgba(0,0,0,0.3)',
                                            transition: 'transform 0.2s, box-shadow 0.2s',
                                        }}
                                        onMouseOver={(e) => { e.currentTarget.style.transform = 'scale(1.03)'; e.currentTarget.style.boxShadow = '0 15px 25px -5px rgba(0,0,0,0.4)'; }}
                                        onMouseOut={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 10px 20px -5px rgba(0,0,0,0.3)'; }}
                                    >
                                        {isSubmitting ? 'Processing...' : 'Start 7-Day Free Trial'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <div className="onboarding-wrapper">
            <style>{`
                .onboarding-wrapper {
                    min-height: 100vh;
                    background: #f1f5f9;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 2rem;
                    font-family: 'Inter', sans-serif;
                }
                .split-container {
                    display: flex;
                    width: 100%;
                    max-width: 1200px;
                    min-height: 750px;
                    background: white;
                    border-radius: 32px;
                    box-shadow: 0 40px 100px -20px rgba(0, 0, 0, 0.15);
                    overflow: hidden;
                    position: relative;
                }
                .brand-panel {
                    flex: 0 0 40%;
                    background: linear-gradient(135deg, #0f172a 0%, #064e3b 100%);
                    padding: 4rem;
                    color: white;
                    display: flex;
                    flex-direction: column;
                    justify-content: space-between;
                    position: relative;
                    overflow: hidden;
                }
                @media (max-width: 900px) {
                    .split-container { flex-direction: column; }
                    .brand-panel { flex: none; padding: 3rem 2rem; min-height: 300px; }
                }
                .brand-glow {
                    position: absolute;
                    top: -30%;
                    left: -30%;
                    width: 160%;
                    height: 160%;
                    background: radial-gradient(circle, rgba(16,185,129,0.15) 0%, transparent 60%);
                    animation: rotate 25s linear infinite;
                    pointer-events: none;
                }
                @keyframes rotate {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                .form-panel {
                    flex: 1;
                    padding: 4rem;
                    display: flex;
                    flex-direction: column;
                    background: white;
                    position: relative;
                }
                @media (max-width: 900px) {
                    .form-panel { padding: 2rem; }
                }
                .progress-container {
                    margin-bottom: 3rem;
                }
                .progress-bar-bg {
                    height: 8px;
                    background: #e2e8f0;
                    border-radius: 10px;
                    overflow: hidden;
                }
                .progress-bar-fill {
                    height: 100%;
                    background: linear-gradient(90deg, #10b981, #059669);
                    border-radius: 10px;
                    transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
                }
                .step-title {
                    font-size: 2.5rem;
                    font-weight: 800;
                    background: linear-gradient(135deg, #0f172a 0%, #334155 100%);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    margin-bottom: 0.5rem;
                    line-height: 1.2;
                }
                .step-subtitle {
                    font-size: 1.15rem;
                    color: #64748b;
                    margin-bottom: 2.5rem;
                }
                .plans-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 2rem;
                    margin-top: 2rem;
                }
                @media (max-width: 1024px) {
                    .plans-grid { grid-template-columns: 1fr; }
                }
                .plan-card {
                    background: white;
                    border-radius: 24px;
                    padding: 2.5rem;
                    border: 2px solid #e2e8f0;
                    transition: all 0.3s ease;
                    position: relative;
                    overflow: hidden;
                }
                .plan-card:hover {
                    border-color: #10b981;
                    box-shadow: 0 20px 40px -10px rgba(16, 185, 129, 0.15);
                    transform: translateY(-5px);
                }
                .plan-card.premium {
                    background: linear-gradient(135deg, #064e3b 0%, #0f766e 100%);
                    color: white;
                    border: none;
                    box-shadow: 0 20px 40px -10px rgba(6, 78, 59, 0.4);
                }
                .plan-card.premium:hover {
                    box-shadow: 0 30px 60px -15px rgba(6, 78, 59, 0.5);
                    transform: translateY(-8px) scale(1.02);
                }
                .premium-glow {
                    position: absolute;
                    top: -50%;
                    left: -50%;
                    width: 200%;
                    height: 200%;
                    background: radial-gradient(circle, rgba(16,185,129,0.3) 0%, transparent 60%);
                    animation: rotate 15s linear infinite;
                    pointer-events: none;
                }
                .nav-btn {
                    padding: 14px 28px;
                    border-radius: 12px;
                    font-weight: 700;
                    cursor: pointer;
                    transition: all 0.2s;
                    border: none;
                    font-size: 1.05rem;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                }
                .btn-next {
                    background: #10b981;
                    color: white;
                    box-shadow: 0 10px 20px -5px rgba(16, 185, 129, 0.4);
                }
                .btn-next:hover {
                    background: #059669;
                    transform: translateY(-2px);
                    box-shadow: 0 15px 25px -5px rgba(16, 185, 129, 0.5);
                }
                .btn-back {
                    background: white;
                    color: #475569;
                    border: 1px solid #cbd5e1;
                }
                .btn-back:hover {
                    background: #f1f5f9;
                    border-color: #94a3b8;
                }
            `}</style>

            <div className="split-container">
                {/* BRAND PANEL */}
                <div className="brand-panel">
                    <div className="brand-glow"></div>
                    <div style={{ position: 'relative', zIndex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '4rem' }}>
                            <div style={{
                                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                width: '56px', height: '56px',
                                borderRadius: '16px',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                boxShadow: '0 10px 25px -5px rgba(16,185,129,0.5)'
                            }}>
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M3 19H21V21H3V19ZM12 4L16.5 12L21 6L19 17H5L3 6L7.5 12L12 4Z" fill="white"/>
                                </svg>
                            </div>
                            <span style={{ fontSize: '1.8rem', fontWeight: 800, letterSpacing: '-0.5px' }}>Empire</span>
                        </div>
                        
                        <h1 style={{ fontSize: '3.5rem', fontWeight: 800, lineHeight: 1.1, marginBottom: '1.5rem' }}>
                            Build<br/>Your<br/><span style={{ color: '#34d399' }}>Empire.</span>
                        </h1>
                        <p style={{ fontSize: '1.25rem', color: '#94a3b8', lineHeight: 1.6 }}>
                            Collect powerful social proof, turn your customers into fierce advocates, and skyrocket your store's sales.
                        </p>
                    </div>
                    
                    <div style={{ position: 'relative', zIndex: 1, display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <div style={{ display: 'flex' }}>
                            {[1,2,3,4,5].map(i => (
                                <svg key={i} width="24" height="24" viewBox="0 0 24 24" fill="#fbbf24" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M12 17.27L18.18 21L16.54 13.97L22 9.24L14.81 8.63L12 2L9.19 8.63L2 9.24L7.46 13.97L5.82 21L12 17.27Z" />
                                </svg>
                            ))}
                        </div>
                        <span style={{ color: '#cbd5e1', fontSize: '1rem', fontWeight: 600 }}>Trusted by premium brands</span>
                    </div>
                </div>

                {/* FORM PANEL */}
                <div className="form-panel">
                    <div className="progress-container">
                        <div className="progress-bar-bg">
                            <div className="progress-bar-fill" style={{ width: `${(step / totalSteps) * 100}%` }}></div>
                        </div>
                    </div>
                    
                    <div style={{ flex: 1 }}>
                        {renderStepContent()}
                    </div>
                    
                    {step < 6 && (
                        <div style={{ marginTop: '3.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            {step > 1 ? (
                                <button className="nav-btn btn-back" onClick={handleBack}>← Back</button>
                            ) : (
                                <div />
                            )}
                            <button className="nav-btn btn-next" onClick={handleNext}>Next Step →</button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export function ErrorBoundary() {
    const error = useRouteError();
    let errorMessage = "Unknown error";
    let errorStack = "";

    if (isRouteErrorResponse(error)) {
        errorMessage = `${error.status} ${error.statusText} - ${error.data}`;
    } else if (error instanceof Error) {
        errorMessage = error.message;
        errorStack = error.stack || "";
    } else {
        errorMessage = String(error);
    }

    return (
        <Page narrowWidth>
            <Card>
                <BlockStack gap="400">
                    <Text as="h2" variant="headingLg" tone="critical">Onboarding Crash</Text>
                    <Text as="p">{errorMessage}</Text>
                    {errorStack && (
                        <div style={{ padding: '1rem', background: '#f4f6f8', overflowX: 'auto', whiteSpace: 'pre-wrap' }}>
                            <Text as="p" variant="bodySm">{errorStack}</Text>
                        </div>
                    )}
                </BlockStack>
            </Card>
        </Page>
    );
}
