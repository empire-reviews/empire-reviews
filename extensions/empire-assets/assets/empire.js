// Empire Reviews Client Script
// Psychology: Load fast, show social proof immediately.

const EMPIRE_APP_URL = "https://push-strain-performs-eco.trycloudflare.com"; // HARDCODED FOR DEV SESSION

document.addEventListener("DOMContentLoaded", () => {
    initStarRatings();
    initReviewWidgets();
});

function initStarRatings() {
    const ratings = document.querySelectorAll(".empire-star-rating");
    ratings.forEach(async (el) => {
        const productId = el.dataset.productId;
        const showCount = el.dataset.showCount === "true";
        const countTextTemplate = el.dataset.countText || "reviewed by {n}+ customers";
        const isDesignMode = el.dataset.designMode === "true";

        if (!productId) return;

        try {
            const res = await fetch(`${EMPIRE_APP_URL}/api/reviews?productId=${productId}`);
            const data = await res.json();

            // Force "Mock Data" if in Design Mode and no real reviews yet (so user sees the effect)
            if (isDesignMode && (!data.stats || data.stats.total === 0)) {
                data.stats = { average: 5, total: 100 };
            }

            if (data.stats) {
                // Render SVG Stars
                const filledStar = `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>`;
                const emptyStar = `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="#e5e7eb"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>`; // Gray for empty

                const avg = Math.round(data.stats.average);
                const starsHtml = filledStar.repeat(avg) + emptyStar.repeat(5 - avg);

                // Render Count Text
                let countHtml = "";
                if (showCount) {
                    // Always show if total > 0 (satisfied by mock data in design mode)
                    if (data.stats.total > 0) {
                        const text = countTextTemplate.replace("{n}", data.stats.total);
                        countHtml = `<span class="empire-rating-count" style="margin-left: 8px; font-size: 0.9em; color: inherit; opacity: 0.8;">${text}</span>`;
                    }
                }

                el.innerHTML = `
                    <span title="${data.stats.average} / 5" style="display: flex; gap: 2px; color: var(--empire-star-color)">${starsHtml}</span> 
                    ${countHtml}
                `;
            }
        } catch (e) {
            console.error("Empire: Failed to load rating", e);
        }
    });
}

function initReviewWidgets() {
    const widgets = document.querySelectorAll(".empire-reviews-widget");
    widgets.forEach(async (el) => {
        const productId = el.dataset.productId;
        const container = el.querySelector("#empire-reviews-container");

        // 1. Render Form First (Action Bias)
        const formHtml = `
            <div class="empire-write-review" style="margin-bottom: 2rem; padding: 1rem; background: #f9fafb; border-radius: 8px;">
                <h3>Write a Review</h3>
                <form id="empire-review-form-${productId}" onsubmit="handleEmpireSubmit(event, '${productId}')">
                   <div style="margin-bottom: 10px;">
                        <label>Rating:</label>
                        <select name="rating" required style="padding: 5px;">
                            <option value="5">★★★★★ (5)</option>
                            <option value="4">★★★★☆ (4)</option>
                            <option value="3">★★★☆☆ (3)</option>
                            <option value="2">★★☆☆☆ (2)</option>
                            <option value="1">★☆☆☆☆ (1)</option>
                        </select>
                   </div>
                   <div style="margin-bottom: 10px;">
                        <input type="text" name="author" placeholder="Your Name" required style="width: 100%; padding: 8px; margin-bottom: 5px;">
                        <textarea name="body" placeholder="Share your experience..." required style="width: 100%; padding: 8px; height: 80px;"></textarea>
                   </div>
                   <button type="submit" style="background: black; color: white; padding: 10px 20px; border: none; cursor: pointer; border-radius: 4px;">Submit Review</button>
                </form>
                <div id="empire-success-${productId}" style="display:none; color: green; margin-top: 10px;">Thanks! Your review is under moderation. 🚀</div>
            </div>
            <hr style="border: 0; border-top: 1px solid #eee; margin: 2rem 0;">
        `;

        try {
            const res = await fetch(`${EMPIRE_APP_URL}/api/reviews?productId=${productId}`);
            const data = await res.json();

            if (data.reviews && data.reviews.length > 0) {
                container.innerHTML = formHtml + data.reviews.map(renderReview).join("");
            } else {
                container.innerHTML = formHtml + `<p>No reviews yet. Be the first to add one and get 10% off! 🎁</p>`;
            }
        } catch (e) {
            container.innerHTML = `<p>Could not load reviews.</p>`;
        }
    });
}

async function handleEmpireSubmit(e, productId) {
    e.preventDefault();
    const form = e.target;
    const formData = new FormData(form);
    formData.append("productId", productId);

    try {
        const res = await fetch(`${EMPIRE_APP_URL}/api/reviews`, {
            method: "POST",
            body: formData
        });
        const data = await res.json();

        if (data.success) {
            form.style.display = "none";
            document.getElementById(`empire-success-${productId}`).style.display = "block";
        } else {
            alert("Error submitting review");
        }
    } catch (err) {
        alert("Network error");
    }
}

function renderReview(review) {
    const mediaHtml = review.media.map(m =>
        `<div class="empire-media-item">📷</div>` // Placeholder for actual image
    ).join("");

    const replyHtml = review.replies && review.replies.length > 0
        ? `<div style="margin-top: 10px; padding: 10px; background: #f0fdf4; border-left: 3px solid #16a34a; font-size: 0.9em;">
             <strong>Merchant Reply:</strong><br>
             ${review.replies[0].body}
           </div>`
        : "";

    // SVG Stars
    const filledStar = `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="#fbbf24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>`;
    const emptyStar = `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="#e5e7eb"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>`;
    const starsHtml = filledStar.repeat(review.rating) + emptyStar.repeat(5 - review.rating);

    return `
        <div class="empire-review-card">
            <div class="empire-review-header">
                <strong>${review.customerName || 'Customer'}</strong>
                <span class="empire-star-rating" style="display: flex; gap: 2px;">${starsHtml}</span>
            </div>
            ${review.verified ? '<span class="empire-verified-badge">Verified Buyer</span>' : ''}
            <p>${review.body}</p>
            <div class="empire-media-grid">${mediaHtml}</div>
            ${replyHtml}
        </div>
    `;
}
