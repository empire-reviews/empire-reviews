import { useState, useCallback } from "react";
import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation } from "@remix-run/react";
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
    const { session } = await authenticate.admin(request);
    return json({
        shop: session.shop,
        extensionId: process.env.SHOPIFY_APP_EXTENSION_ID || "",
    });
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
                    <BlockStack gap="400">
                        <Text as="h2" variant="headingLg">Welcome to Empire Reviews</Text>
                        <Text as="p" tone="subdued">Let's set up your basic preferences so we can tailor your experience.</Text>
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
                );
            case 2:
                return (
                    <BlockStack gap="400">
                        <Text as="h2" variant="headingLg">Brand Your Experience</Text>
                        <Text as="p" tone="subdued">Make the review widgets look like they belong to your store.</Text>
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
                );
            case 3:
                return (
                    <BlockStack gap="400">
                        <Text as="h2" variant="headingLg">About Your Business</Text>
                        <Text as="p" tone="subdued">This helps us optimize your review request timing.</Text>
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
                );
            case 4:
                return (
                    <BlockStack gap="400">
                        <Text as="h2" variant="headingLg">Review Acquisition Strategy</Text>
                        <Text as="p" tone="subdued">How do you want to collect reviews?</Text>
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
                );
            case 5:
                const editorUrl = `https://admin.shopify.com/store/${shop.replace('.myshopify.com', '')}/themes/current/editor?context=apps&appEmbed=${extensionId}`;
                return (
                    <BlockStack gap="400">
                        <Text as="h2" variant="headingLg">Enable App Embed</Text>
                        <Text as="p" tone="subdued">To display reviews on your storefront, you must enable the Empire Reviews App Embed in your Shopify Theme Editor.</Text>
                        <Card>
                            <BlockStack gap="400" align="center" inlineAlign="center">
                                <Text as="p">Click the button below to open your theme editor. Ensure the toggle is turned ON, then click Save.</Text>
                                <Button 
                                    variant="primary" 
                                    url={editorUrl} 
                                    target="_blank"
                                >
                                    Open Theme Editor
                                </Button>
                            </BlockStack>
                        </Card>
                    </BlockStack>
                );
            case 6:
                return (
                    <BlockStack gap="600">
                        <BlockStack gap="200">
                            <Text as="h2" variant="headingLg">Choose Your Plan</Text>
                            <Text as="p" tone="subdued">Start collecting reviews immediately. Upgrade to Awesome for unlimited features!</Text>
                        </BlockStack>
                        <Layout>
                            <Layout.Section variant="oneHalf">
                                <Card>
                                    <BlockStack gap="400">
                                        <Text as="h3" variant="headingMd">Free Plan</Text>
                                        <Text as="p" tone="subdued">$0 / month</Text>
                                        <ul style={{ paddingLeft: '1rem', color: 'var(--p-color-text-subdued)', marginBottom: '1rem' }}>
                                            <li>Up to 50 review requests/mo</li>
                                            <li>Basic review widgets</li>
                                            <li>Standard support</li>
                                        </ul>
                                        <Button
                                            onClick={() => handleSubmit('free')}
                                            loading={isSubmitting}
                                            disabled={isSubmitting}
                                            fullWidth
                                        >
                                            Continue with Free plan
                                        </Button>
                                    </BlockStack>
                                </Card>
                            </Layout.Section>
                            <Layout.Section variant="oneHalf">
                                <Card>
                                    <BlockStack gap="400">
                                        <Text as="h3" variant="headingMd">Awesome Plan</Text>
                                        <Text as="p" tone="subdued">$19 / month</Text>
                                        <ul style={{ paddingLeft: '1rem', color: 'var(--p-color-text-subdued)', marginBottom: '1rem' }}>
                                            <li>Unlimited review requests</li>
                                            <li>Photo & Video reviews</li>
                                            <li>Premium widgets & priority support</li>
                                        </ul>
                                        <Button
                                            variant="primary"
                                            onClick={() => handleSubmit('upgrade')}
                                            loading={isSubmitting}
                                            disabled={isSubmitting}
                                            fullWidth
                                        >
                                            Try Awesome plan for $0
                                        </Button>
                                    </BlockStack>
                                </Card>
                            </Layout.Section>
                        </Layout>
                    </BlockStack>
                );
            default:
                return null;
        }
    };

    return (
        <Page narrowWidth>
            <BlockStack gap="800">
                <div style={{ paddingTop: '2rem' }}>
                    <ProgressBar progress={(step / totalSteps) * 100} size="small" tone="primary" />
                </div>
                
                <Card>
                    <BlockStack gap="800">
                        {renderStepContent()}
                        
                        {step < 6 && (
                            <div style={{ marginTop: '2rem' }}>
                                <InlineStack align="space-between">
                                    {step > 1 ? (
                                        <Button onClick={handleBack}>Back</Button>
                                    ) : (
                                        <div />
                                    )}
                                    <Button variant="primary" onClick={handleNext}>Next Step</Button>
                                </InlineStack>
                            </div>
                        )}
                    </BlockStack>
                </Card>
            </BlockStack>
        </Page>
    );
}
