import {
  reactExtension,
  BlockStack,
  InlineLayout,
  Text,
  Icon,
  useApi,
} from "@shopify/ui-extensions-react/checkout";
import { useEffect, useState } from "react";

const API_BASE = "https://empire-reviews.vercel.app";

export default reactExtension("purchase.checkout.block.render", () => <TrustBadge />);

function TrustBadge() {
  const { shop } = useApi();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    const domain = shop && shop.myshopifyDomain;
    if (!domain) return;
    let cancelled = false;
    fetch(`${API_BASE}/api/reviews?shop=${encodeURIComponent(domain)}&limit=1`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d && d.stats && d.stats.total > 0) setStats(d.stats);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [shop]);

  // Hide entirely until there's real social proof to show.
  if (!stats) return null;

  const avg = Number(stats.average || 0);
  const full = Math.round(avg);

  return (
    <BlockStack border="base" cornerRadius="base" padding="base" spacing="tight">
      <InlineLayout spacing="tight" blockAlignment="center" columns={["auto", "fill"]}>
        <InlineLayout spacing="none" columns={Array(5).fill("auto")}>
          {[1, 2, 3, 4, 5].map((i) => (
            <Icon key={i} source={i <= full ? "starFill" : "star"} appearance="warning" />
          ))}
        </InlineLayout>
        <Text emphasis="bold">
          {avg.toFixed(1)} / 5
        </Text>
      </InlineLayout>
      <Text size="small" appearance="subdued">
        Trusted by {stats.total} verified review{stats.total === 1 ? "" : "s"}
      </Text>
    </BlockStack>
  );
}
