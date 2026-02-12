import Sentiment from "sentiment";

const analyzer = new Sentiment();

export function analyzeSentiment(text: string): "positive" | "negative" | "neutral" {
    const result = analyzer.analyze(text);

    // Empire Logic:
    // Score > 0: Positive
    // Score < 0: Negative
    // Score 0: Neutral (or very short text)

    if (result.score > 1) return "positive";
    if (result.score < 0) return "negative";
    return "neutral";
}
