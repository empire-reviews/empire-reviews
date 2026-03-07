const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'app/routes/app.settings.tsx');
let code = fs.readFileSync(filePath, 'utf8');

if (!code.includes('ActionList')) {
    code = code.replace('Select,', 'Select,\\n    ActionList,');
}
if (!code.includes('CreditCardIcon')) {
    code = code.replace('PlayCircleIcon,', 'PlayCircleIcon, CreditCardIcon,');
}

const searchStr = '<div className="empire-settings">';
const divIndex = code.indexOf(searchStr);
const returnIndex = code.lastIndexOf('return (', divIndex);

if (returnIndex === -1) {
    console.log("Could not find the return block!");
    process.exit(1);
}

const beforeReturn = code.slice(0, returnIndex);

const newJSX = `    const [activeTab, setActiveTab] = useState("brand");

    const tabs = [
        { id: "brand", content: "Brand & Display", icon: ThemeIcon },
        { id: "automation", content: "Automation & Timing", icon: ClockIcon },
        { id: "ecosystem", content: "Integrations & AI", icon: LinkIcon },
        { id: "billing", content: "Plan & Billing", icon: CreditCardIcon },
        { id: "danger", content: "Danger Zone", icon: AlertTriangleIcon },
    ];

    return (
        <Page 
            title="Settings" 
            subtitle="Manage your Empire Reviews configuration"
            backAction={{ content: 'Dashboard', onAction: () => navigate("/app") }}
            primaryAction={isDirty ? { content: 'Save settings', onAction: handleSave, tone: 'success' } : undefined}
        >
            <Layout>
                <Layout.Section variant="oneThird">
                    <BlockStack gap="400">
                        <Card padding="0">
                            <ActionList
                                actionRole="menuitem"
                                items={tabs.map(tab => ({
                                    content: tab.content,
                                    icon: tab.icon,
                                    active: activeTab === tab.id,
                                    onAction: () => setActiveTab(tab.id)
                                }))}
                            />
                        </Card>
                        
                        <Card>
                            <BlockStack gap="300">
                                <Text as="h3" variant="headingSm" fontWeight="bold">Did you know?</Text>
                                <div style={{ height: '70px', display: 'flex', alignItems: 'flex-start' }}>
                                    <p style={{ opacity: fade ? 1 : 0, transition: 'opacity 0.4s', fontSize: '0.9rem', color: '#475569', margin: 0, lineHeight: 1.5 }}>
                                        {GROWTH_TIPS[tipIndex]}
                                    </p>
                                </div>
                            </BlockStack>
                        </Card>
                    </BlockStack>
                </Layout.Section>
                
                <Layout.Section variant="twoThirds">
                    {activeTab === 'brand' && (
                        <BlockStack gap="400">
                            <Text as="h2" variant="headingLg" fontWeight="bold">Brand Identity</Text>
                            <Card>
                                <BlockStack gap="400">
                                    <Text as="p" variant="bodyMd" tone="subdued">Customize your review widget to match your store's look & feel.</Text>
                                    <Divider />
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                                            <div style={{ width: 24, height: 24, background: themeColor, borderRadius: 6, border: '1px solid #e2e8f0' }} />
                                            <Text as="p" variant="bodyMd" fontWeight="semibold">Theme Color</Text>
                                        </div>
                                        <TextField label="" value={themeColor} onChange={setThemeColor} autoComplete="off" helpText="Used for text, borders, stars, and buttons." connectedRight={<input type="color" value={themeColor} onChange={(e) => setThemeColor(e.target.value)} style={{ width: 40, height: 36, border: 'none', cursor: 'pointer', padding: 0, background: 'transparent' }} />} />
                                    </div>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                                            <div style={{ width: 24, height: 24, background: widgetBgColor, borderRadius: 6, border: '1px solid #e2e8f0' }} />
                                            <Text as="p" variant="bodyMd" fontWeight="semibold">Widget Background</Text>
                                        </div>
                                        <TextField label="" value={widgetBgColor} onChange={setWidgetBgColor} autoComplete="off" connectedRight={<input type="color" value={widgetBgColor} onChange={(e) => setWidgetBgColor(e.target.value)} style={{ width: 40, height: 36, border: 'none', cursor: 'pointer', padding: 0, background: 'transparent' }} />} />
                                    </div>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                                            <div style={{ width: 24, height: 24, background: starColor, borderRadius: 6, border: '1px solid #e2e8f0' }} />
                                            <Text as="p" variant="bodyMd" fontWeight="semibold">Star Rating Color</Text>
                                        </div>
                                        <TextField label="" value={starColor} onChange={setStarColor} autoComplete="off" connectedRight={<input type="color" value={starColor} onChange={(e) => setStarColor(e.target.value)} style={{ width: 40, height: 36, border: 'none', cursor: 'pointer', padding: 0, background: 'transparent' }} />} />
                                    </div>
                                    <Select label={<Text as="p" variant="bodyMd" fontWeight="semibold">Corner Style</Text>} options={[{ label: 'Sharp (0px)', value: '0px' }, { label: 'Rounded (8px)', value: '8px' }, { label: 'Pill (16px)', value: '16px' }]} value={borderRadius} onChange={setBorderRadius} />
                                </BlockStack>
                            </Card>
                        </BlockStack>
                    )}

                    {activeTab === 'automation' && (
                        <BlockStack gap="400">
                            <Text as="h2" variant="headingLg" fontWeight="bold">Automation & Timing</Text>
                            <Card>
                                <BlockStack gap="400">
                                    <Text as="h3" variant="headingMd" fontWeight="bold">Publishing & Alerts</Text>
                                    <Text as="p" variant="bodyMd" tone="subdued">Set it and forget it. Let the app handle the routine work.</Text>
                                    <Divider />
                                    <Checkbox label="Auto-publish 5-star reviews" helpText="Skip moderation for top-rated reviews." checked={autoPublish} onChange={setAutoPublish} />
                                    <Checkbox label="Email Alerts for Negative Reviews" helpText="Get immediate notifications for 1-2 star ratings." checked={emailAlerts} onChange={setEmailAlerts} />
                                </BlockStack>
                            </Card>
                            <Card>
                                <BlockStack gap="400">
                                    <Text as="h3" variant="headingMd" fontWeight="bold">Email Timing</Text>
                                    <Text as="p" variant="bodyMd" tone="subdued">When should we ask for a review?</Text>
                                    <Divider />
                                    <TextField label="Send Request After (Days)" type="number" value={String(reviewRequestDelay)} onChange={(val) => setReviewRequestDelay(parseInt(val) || 3)} autoComplete="off" helpText="Recommended: 3-5 days after order." suffix="days" min={1} max={30} />
                                </BlockStack>
                            </Card>
                        </BlockStack>
                    )}

                    {activeTab === 'ecosystem' && (
                        <BlockStack gap="400">
                            <Text as="h2" variant="headingLg" fontWeight="bold">Integrations & AI</Text>
                            <Card>
                                <BlockStack gap="400">
                                    <Text as="h3" variant="headingMd" fontWeight="bold">Ecosystem Sync</Text>
                                    <Text as="p" variant="bodyMd" tone="subdued">Connect Empire to your favorite tools.</Text>
                                    <Divider />
                                    <Checkbox label="Shopify Flow" helpText="Trigger workflows on negative reviews." checked={flowEnabled} onChange={setFlowEnabled} />
                                    <Box>
                                        <Checkbox label="Klaviyo Sync" helpText="Push reviewers to 'Safe Lists'." checked={klaviyoEnabled} onChange={setKlaviyoEnabled} />
                                        {klaviyoEnabled && <div style={{ marginTop: '10px', paddingLeft: '20px' }}><TextField label="Secret API Key" value={klaviyoKey} onChange={setKlaviyoKey} autoComplete="off" type="password" /></div>}
                                    </Box>
                                    <Box>
                                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                                            <Checkbox label="Google Shopping XML" helpText="Generate product feed with stars." checked={googleShoppingEnabled} onChange={setGoogleShoppingEnabled} disabled={!isPro} />
                                            {!isPro && <Button size="micro" onClick={handleUpgrade} variant="primary">Unlock Pro</Button>}
                                        </div>
                                        {googleShoppingEnabled && isPro && <div style={{ marginTop: '10px', background: '#f8fafc', padding: '10px', borderRadius: '6px', fontSize: '0.85rem' }}><strong>Feed URL:</strong><div style={{ wordBreak: 'break-all', color: '#6366f1' }}>{feedUrl}</div></div>}
                                    </Box>
                                </BlockStack>
                            </Card>

                            <Card>
                                <BlockStack gap="400">
                                    <Text as="h3" variant="headingMd" fontWeight="bold">AI Engine</Text>
                                    <Text as="p" variant="bodyMd" tone="subdued">Power your store with ChatGPT, Claude, Groq, or DeepSeek.</Text>
                                    <Divider />
                                    {!isPro ? (
                                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                                            <div style={{ opacity: 0.6, pointerEvents: 'none' }}>
                                                <Checkbox label="Autonomous AI Engine" helpText="Unlock AI features" checked={false} onChange={() => { }} disabled />
                                            </div>
                                            <Button size="micro" onClick={handleUpgrade} variant="primary">Unlock Pro</Button>
                                        </div>
                                    ) : (
                                        <>
                                            <Select label="AI Provider" options={[{ label: 'Select a provider...', value: '' }, { label: 'Groq (100% Free)', value: 'groq' }, { label: 'OpenAI (GPT-4o Mini)', value: 'openai' }, { label: 'Google Gemini', value: 'gemini' }, { label: 'Anthropic Claude', value: 'claude' }, { label: 'DeepSeek', value: 'deepseek' }, { label: 'Ollama / Custom API', value: 'ollama' }]} value={aiProvider} onChange={setAiProvider} helpText={aiProvider === 'ollama' ? 'Requires Ngrok/Cloudflare Tunnel to connect Vercel to your local machine.' : 'Choose the AI model you prefer.'} />
                                            {aiProvider && (
                                                <TextField label={aiProvider === 'ollama' ? "Model Name / Remote URL / API Key" : "Secret API Key"} value={aiApiKey} onChange={setAiApiKey} autoComplete="off" type={aiProvider === 'ollama' ? "text" : "password"} placeholder={aiProvider === 'ollama' ? "e.g., https://ollama.com|gpt-oss:120b|sk-key123" : ""} helpText={aiProvider === 'openai' ? 'Get yours at platform.openai.com/api-keys' : aiProvider === 'gemini' ? 'Get yours at aistudio.google.com/apikey' : aiProvider === 'claude' ? 'Get yours at console.anthropic.com/settings/keys' : aiProvider === 'deepseek' ? 'Get yours at platform.deepseek.com/api_keys' : aiProvider === 'ollama' ? 'Format: URL|Model|API_KEY (e.g. https://ollama.com|gpt-oss:120b|sk-123). URL and Key are optional.' : ''} />
                                            )}
                                            {aiProvider && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                    <Button onClick={() => { setAiTestLoading(true); setAiTestResult(null); fetcher.submit({ intent: 'test_ai', aiProvider, aiApiKey }, { method: 'post' }); setTimeout(() => { setAiTestLoading(false); const data = fetcher.data as any; if (data?.aiTestResult) { setAiTestResult(data.aiTestResult); setAiTestSuccess(data.success); } else { setAiTestResult('Test sent — check result after save.'); setAiTestSuccess(true); } }, 4000); }} loading={aiTestLoading} disabled={aiTestLoading || !aiApiKey} size="micro">Test Connection</Button>
                                                    {aiTestResult && <div style={{ marginTop: '4px' }}><Badge tone={aiTestSuccess ? 'success' : 'critical'}>{aiTestResult}</Badge></div>}
                                                </div>
                                            )}
                                        </>
                                    )}
                                </BlockStack>
                            </Card>
                        </BlockStack>
                    )}

                    {activeTab === 'billing' && (
                        <BlockStack gap="400">
                            <Text as="h2" variant="headingLg" fontWeight="bold">Plan & Billing</Text>
                            <Card>
                                <BlockStack gap="400">
                                    <InlineStack align="space-between">
                                        <Text as="h3" variant="headingMd" fontWeight="bold">Current Plan</Text>
                                        <Badge tone={isPro ? "success" : "info"}>{isPro ? "PRO" : "STARTER"}</Badge>
                                    </InlineStack>
                                    <Text as="p" variant="bodyMd" tone="subdued">
                                        {isPro ? "You are on the Empire Pro plan. Enjoy unlimited reviews and AI features." : "You are currently on the Starter plan. Limit: 50 reviews."}
                                    </Text>
                                    <Divider />
                                    {isPro ? (
                                        <Button fullWidth onClick={() => setBillingModalActive(true)}>Manage Subscription</Button>
                                    ) : (
                                        <Button fullWidth variant="primary" onClick={handleUpgrade}>Upgrade to Empire Pro</Button>
                                    )}
                                </BlockStack>
                            </Card>
                        </BlockStack>
                    )}

                    {activeTab === 'danger' && (
                        <BlockStack gap="400">
                            <Text as="h2" variant="headingLg" fontWeight="bold">Danger Zone</Text>
                            <Card background="bg-surface-critical">
                                <BlockStack gap="400">
                                    <Text as="h3" variant="headingMd" tone="critical" fontWeight="bold">Delete All Data</Text>
                                    <Text as="p" variant="bodyMd">This will permanently delete all your reviews, replies, and reset your configuration. This action cannot be reversed.</Text>
                                    <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                                        <Button tone="critical" variant="primary" onClick={() => setResetModalActive(true)}>Wipe Application Data</Button>
                                    </div>
                                </BlockStack>
                            </Card>
                        </BlockStack>
                    )}
                </Layout.Section>
            </Layout>

            <Modal open={resetModalActive} onClose={() => setResetModalActive(false)} title="Wipe all data?" primaryAction={{ content: "Yes, delete everything", onAction: handleReset, destructive: true }} secondaryActions={[{ content: "Cancel", onAction: () => setResetModalActive(false) }]}>
                <Modal.Section>
                    <Text as="p">Are you absolutely sure? This will delete all reviews. You cannot undo this.</Text>
                </Modal.Section>
            </Modal>

            <Modal open={billingModalActive} onClose={() => setBillingModalActive(false)} title="Your Empire Membership" primaryAction={{ content: "Extend / Renew Plan", onAction: handleUpgrade, disabled: !isPro }} secondaryActions={[{ content: "Close", onAction: () => setBillingModalActive(false) }]}>
                <Modal.Section>
                    <BlockStack gap="400">
                        {subscription && subscription.status === "ACTIVE" ? (
                            <BlockStack gap="200">
                                <Badge tone="success">Active Subscription</Badge>
                                <Text as="p" fontWeight="bold">Empire Pro App</Text>
                            </BlockStack>
                        ) : (
                            <Text as="p">You are currently on the free Starter plan.</Text>
                        )}
                        <Divider />
                        <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px', marginTop: '8px' }}>
                            <Text as="p" tone="subdued" fontWeight="bold">VIP / Partner Access</Text>
                            <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '4px' }}>You have lifetime access enabled manually (e.g. via Referral). If you ever lose access, click Extend / Renew Plan above.</p>
                        </div>
                    </BlockStack>
                </Modal.Section>
            </Modal>
        </Page>
    );
}
`;

fs.writeFileSync(filePath, beforeReturn + newJSX);
console.log("Rewrite complete.");
