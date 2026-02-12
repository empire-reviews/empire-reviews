/**
 * Empire Reviews Rich UI Module
 * Restores the premium split-layout and interactive wizard
 * NOW: Attaches to window.Empire for robust loading
 * INCLUDES: Inline CSS for guaranteed styling
 */

(function () {
    window.Empire = window.Empire || {};

    window.Empire.renderFullWidget = async function (containers, API_BASE) {
        if (!containers || containers.length === 0) return;

        containers.forEach(async (container) => {
            const productId = container.parentElement.dataset.productId;
            // Force Gold for bars as requested
            const barColor = "#fbbf24";

            // 1. Fetch Data
            try {
                // Force-Inject CSS to guarantee styling (Bypass cache/loading issues)
                if (!document.getElementById('empire-rich-ui-styles')) {
                    const style = document.createElement('style');
                    style.id = 'empire-rich-ui-styles';
                    style.innerHTML = `
                        /* Empire Rich UI Styles (Injected) */
                        .empire-split-layout { 
                            display: grid; 
                            grid-template-columns: 1fr 1.5fr; 
                            gap: 3rem; 
                            align-items: stretch; 
                            max-width: 1200px; 
                            margin: 0 auto; 
                            font-family: inherit;
                            font-size: var(--empire-font-size, 16px);
                            color: var(--empire-text-color, #111);
                        }
                        @media (max-width: 768px) { .empire-split-layout { grid-template-columns: 1fr; } }
                        
                        /* Sidebar */
                        .empire-sidebar { 
                            background: var(--empire-sidebar-bg, #fff); 
                            padding: 2.5rem; 
                            border-radius: 16px; 
                            border: 1px solid #e2e8f0; 
                            box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); 
                            position: sticky; 
                            top: 20px; 
                            height: 420px; 
                            display: flex; 
                            flex-direction: column; 
                            justify-content: center; 
                        }
                        .empire-rating-label { font-size: 0.85rem; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: var(--empire-text-color, #64748b); opacity: 0.7; margin-bottom: 0.5rem; }
                        .empire-big-rating { font-size: 5rem; font-weight: 800; line-height: 1; color: var(--empire-text-color, #0f172a); letter-spacing: -2px; }
                        .empire-total-reviews { color: var(--empire-text-color, #64748b); opacity: 0.8; font-weight: 500; margin-bottom: 2rem; font-size: 1.1rem; }
                        
                        /* Bars */
                        .empire-bars { display: flex; flex-direction: column; gap: 0.8rem; margin-bottom: 2.5rem; }
                        .empire-bar-row { display: flex; align-items: center; gap: 12px; font-size: 0.95rem; font-weight: 500; color: var(--empire-text-color, #334155); }
                        
                        .empire-bar-bg { flex: 1; height: 10px; background: #f1f5f9; border-radius: 99px; overflow: hidden; }
                        .empire-bar-fill { height: 100%; border-radius: 99px; background-color: var(--empire-bar-color, #fbbf24) !important; }
                        .empire-bar-count { width: 25px; text-align: right; color: var(--empire-text-color, #94a3b8); opacity: 0.6; font-size: 0.9rem; }
                        
                        /* Button */
                        .empire-write-btn { 
                            width: 100%; 
                            background: var(--empire-btn-bg, #0f172a); 
                            color: var(--empire-btn-text, #fff); 
                            padding: 16px; 
                            border-radius: 12px; 
                            font-weight: 700; 
                            font-size: 1rem; 
                            cursor: pointer; 
                            border: none; 
                            transition: all 0.2s; 
                        }
                        .empire-write-btn:hover { opacity: 0.9; transform: translateY(-2px); box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); }
                        
                        /* Feed */
                        .empire-feed { background: var(--empire-feed-bg, #f9fafb); border-radius: 16px; padding: 10px; }
                        .empire-feed-scroll { 
                            height: 420px; 
                            overflow-y: auto; 
                            position: relative; 
                            padding-right: 5px; 
                            mask-image: linear-gradient(to bottom, black 85%, transparent 100%);
                            scrollbar-width: none; 
                            -ms-overflow-style: none;
                        }
                        .empire-feed-scroll::-webkit-scrollbar { display: none; }
                        
                        /* Cards */
                        .empire-review-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 2rem; margin-bottom: 1.5rem; transition: all 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
                        .empire-review-card:hover { border-color: #cbd5e1; transform: translateY(-2px); box-shadow: 0 10px 15px -3px rgba(0,0,0,0.05); }
                        
                        .card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem; }
                        .reviewer-info { display: flex; gap: 14px; align-items: center; }
                        .avatar { width: 48px; height: 48px; border-radius: 50%; background: #f8fafc; color: var(--empire-text-color, #475569); font-weight: 700; font-size: 1.2rem; display: flex; align-items: center; justify-content: center; border: 1px solid #e2e8f0; }
                        .username { font-weight: 700; color: var(--empire-text-color, #0f172a); font-size: 1.05rem; }
                        .verified-badge { font-size: 0.75rem; color: var(--empire-verified-color, #16a34a); background: #dcfce7; padding: 4px 10px; border-radius: 20px; font-weight: 700; display: inline-block; margin-top: 4px; letter-spacing: 0.5px; text-transform: uppercase; }
                        .review-date { color: var(--empire-text-color, #94a3b8); opacity: 0.6; font-size: 0.9rem; }
                        
                        .empire-bar-label { color: var(--empire-star-color, #fbbf24) !important; font-weight: 700; }
                        .stars-row { color: var(--empire-star-color, #fbbf24) !important; font-size: 1.2rem; margin-bottom: 1rem; letter-spacing: 2px; }
                        .review-body { line-height: 1.7; color: var(--empire-body-color, #334155); font-size: 1.05rem; }
                        
                        /* Wizard */
                        .empire-input { width: 100%; padding: 14px; margin-bottom: 12px; border: 1px solid #cbd5e1; border-radius: 10px; background: #f8fafc; font-size: 1rem; }
                        .empire-input:focus { outline: none; border-color: var(--empire-text-color, #0f172a); background: #fff; box-shadow: 0 0 0 4px rgba(15, 23, 42, 0.05); }
                        
                        .wizard-step-indicator { font-size: 0.7rem; letter-spacing: 3px; font-weight: 700; color: var(--empire-text-color, #94a3b8); opacity: 0.6; text-transform: uppercase; margin-bottom: 1rem; display: block; }
                        .wizard-title { font-size: 2.2rem; font-weight: 800; color: var(--empire-text-color, #0f172a); margin-bottom: 2rem; letter-spacing: -0.5px; }
                        .wizard-stars { display: flex; justify-content: center; gap: 0.5rem; }
                        .wizard-star { font-size: 2.5rem; color: #e2e8f0; cursor: pointer; transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
                        .wizard-star:hover { transform: scale(1.2); }
                    `;
                    document.head.appendChild(style);
                }

                // Show Status
                container.innerHTML = `<div class="empire-loading">Fetching reviews for product ${productId}...</div>`;

                const res = await fetch(`${API_BASE}?productId=${productId}`);
                if (!res.ok) throw new Error(`API ${res.status}`);

                const data = await res.json();
                const { reviews, stats } = data;

                // 2. Build HTML
                container.innerHTML = `
                    <div class="empire-split-layout fade-in">
                        <!-- Sidebar -->
                        <div class="empire-sidebar" id="sidebar-${productId}">
                            <div class="empire-rating-label">Overall Rating</div>
                            <div class="empire-big-rating">${stats?.average?.toFixed(1) || "0.0"}</div>
                            <div class="empire-total-reviews">Based on ${stats?.total || 0} reviews</div>
                            
                            <div class="empire-bars">
                                ${[5, 4, 3, 2, 1].map(star => {
                    const count = reviews.filter(r => r.rating === star).length;
                    const percent = stats?.total > 0 ? (count / stats.total) * 100 : 0;
                    return `
                                        <div class="empire-bar-row">
                                            <div class="empire-bar-label">${star} ★</div>
                                            <div class="empire-bar-bg">
                                                <div class="empire-bar-fill" style="width: ${percent.toFixed(1)}%; min-width: ${count > 0 ? 5 : 0}px; background-color: var(--empire-bar-color, #fbbf24) !important; height: 100%; display: block;"></div>
                                            </div>
                                            <div class="empire-bar-count">${count}</div>
                                        </div>
                                    `;
                }).join('')}
                            </div>

                            <button class="empire-write-btn" id="write-btn-${productId}">Write a Review</button>
                        </div>

                        <!-- Wizard Modal -->
                        <div class="empire-sidebar" id="wizard-${productId}" style="display:none; text-align:center; align-items:center; justify-content:center;">
                            <div id="step-1-${productId}" style="width: 100%;">
                                <span class="wizard-step-indicator">Step 1 of 2</span>
                                <h2 class="wizard-title">Rate this product</h2>
                                <div class="wizard-stars empire-star-input">
                                    ${[1, 2, 3, 4, 5].map(i => `<span class="wizard-star" data-star="${i}">★</span>`).join('')}
                                </div>
                            </div>
                            <div id="step-2-${productId}" style="display:none;">
                                <h2>Share your story</h2>
                                <textarea id="body-${productId}" class="empire-input" placeholder="What did you like?"></textarea>
                                <input id="name-${productId}" class="empire-input" placeholder="Your Name">
                                <input id="email-${productId}" class="empire-input" placeholder="Your Email">
                                <button class="empire-write-btn" id="submit-btn-${productId}">Submit Review</button>
                            </div>
                            <div id="success-${productId}" style="display:none;">
                                <div style="font-size:40px; margin:20px 0;">🎉</div>
                                <h2>Thank you!</h2>
                                <p>Your review makes us better.</p>
                                <button class="empire-write-btn" onclick="location.reload()">Close</button>
                            </div>
                        </div>

                        <!-- Feed -->
                        <div class="empire-feed" id="feed-${productId}">
                            <div class="empire-feed-scroll">
                                ${reviews.map(r => window.Empire.renderReviewCard(r)).join('')}
                                ${reviews.map(r => window.Empire.renderReviewCard(r)).join('')}
                                ${reviews.map(r => window.Empire.renderReviewCard(r)).join('')}
                            </div>
                        </div>
                    </div>
                `;

                // 3. Init Interactivity
                window.Empire.initInteractivity(productId, API_BASE);
                window.Empire.startAutoScroll(productId);

            } catch (e) {
                console.error("Empire Rich UI failed:", e);
                container.innerHTML = `<div style="color:red; padding:20px;">Error: ${e.message}</div>`;
            }
        });
    };

    window.Empire.renderReviewCard = function (review) {
        return `
            <div class="empire-review-card">
                <div class="card-header">
                    <div class="reviewer-info">
                        <div class="avatar">${(review.customerName || "A").charAt(0)}</div>
                        <div>
                            <div class="username">${review.customerName || "Anonymous"}</div>
                            <div class="verified-badge">Available ✓ Verified Buyer</div>
                        </div>
                    </div>
                    <div class="review-date">${new Date(review.createdAt).toLocaleDateString()}</div>
                </div>
                <div class="stars-row">${"★".repeat(review.rating)}${"☆".repeat(5 - review.rating)}</div>
                <p class="review-body">${review.body}</p>
            </div>
        `;
    };

    window.Empire.initInteractivity = function (productId, API_BASE) {
        const writeBtn = document.getElementById(`write-btn-${productId}`);
        const sidebar = document.getElementById(`sidebar-${productId}`);
        const wizard = document.getElementById(`wizard-${productId}`);
        let selectedRating = 0;

        if (writeBtn) writeBtn.onclick = () => {
            sidebar.style.display = "none";
            wizard.style.display = "flex";
            wizard.style.flexDirection = "column";
            wizard.style.justifyContent = "center";
        };

        const stars = wizard?.querySelectorAll(".empire-star-input span");
        if (stars) stars.forEach(star => {
            star.onclick = () => {
                selectedRating = parseInt(star.dataset.star);
                stars.forEach((s, idx) => {
                    s.style.color = (idx < selectedRating) ? "var(--empire-star-color, #fbbf24)" : "#e5e7eb";
                    s.style.transform = (idx < selectedRating) ? "scale(1.1)" : "scale(1)";
                });
                setTimeout(() => {
                    document.getElementById(`step-1-${productId}`).style.display = "none";
                    document.getElementById(`step-2-${productId}`).style.display = "block";
                }, 400);
            };
        });

        const submitBtn = document.getElementById(`submit-btn-${productId}`);
        if (submitBtn) submitBtn.onclick = async () => {
            const body = document.getElementById(`body-${productId}`).value;
            const name = document.getElementById(`name-${productId}`).value;
            const email = document.getElementById(`email-${productId}`).value;

            if (!body || !name) return alert("Please fill in required fields");

            submitBtn.disabled = true;
            submitBtn.textContent = "Submitting...";

            const formData = new FormData();
            formData.append("productId", productId);
            formData.append("rating", selectedRating);
            formData.append("body", body);
            formData.append("author", name);
            formData.append("email", email);

            try {
                const res = await fetch(API_BASE, { method: "POST", body: formData });
                if (res.ok) {
                    document.getElementById(`step-2-${productId}`).style.display = "none";
                    document.getElementById(`success-${productId}`).style.display = "block";
                }
            } catch (e) {
                alert("Submission failed.");
                submitBtn.disabled = false;
                submitBtn.textContent = "Submit Review";
            }
        };
    };

    window.Empire.startAutoScroll = function (productId) {
        // Fix: Target the actual scrollable child, not the parent wrapper
        const feed = document.querySelector("#feed-" + productId + " .empire-feed-scroll");
        if (!feed) return;

        let interval;
        const speed = 0.8;

        const scroll = () => {
            if (feed.scrollTop >= (feed.scrollHeight / 3)) {
                feed.scrollTop = 0;
            } else {
                feed.scrollTop += speed;
            }
        };

        const start = () => {
            if (interval) clearInterval(interval);
            interval = setInterval(scroll, 20);
        };
        const stop = () => clearInterval(interval);

        start();

        feed.onmouseenter = stop;
        feed.onmouseleave = start;
        feed.addEventListener('touchstart', stop);
        feed.addEventListener('touchend', start);
    };

})();
