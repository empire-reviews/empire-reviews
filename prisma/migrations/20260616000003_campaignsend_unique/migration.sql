ALTER TABLE "CampaignSend" ADD CONSTRAINT "CampaignSend_orderId_customerEmail_key" UNIQUE ("orderId", "customerEmail");
