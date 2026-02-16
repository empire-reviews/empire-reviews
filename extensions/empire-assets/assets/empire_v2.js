// Empire Reviews V2 - Lightweight Core (Under 10KB)
// Heavy features are lazy-loaded on demand

(function () {
    'use strict';

    if (window.empireV2Initialized) return;
    window.empireV2Initialized = true;

    const API_BASE = '/apps/empire-reviews/api/reviews';

    // === Carousel Widget ===
    async function initCarousel() {
        const containers = document.querySelectorAll('[data-empire-carousel]');
        if (!containers.length) return;

        containers.forEach(async (container) => {
            try {
                const res = await fetch(`${API_BASE}?minRating=5&limit=10`);
                const { reviews } = await res.json();

                container.innerHTML = reviews.slice(0, 6).map(r => `
                    <div class="empire-carousel-card">
                        <div class="stars">${'★'.repeat(r.rating)}</div>
                        <p>${r.body.substring(0, 100)}...</p>
                        <span class="author">${r.customer_name}</span>
                    </div>
                `).join('');
            } catch (e) {
                console.error('Carousel load failed:', e);
            }
        });
    }

    // === Floating Tab ===
    function initFloatingTab() {
        const config = document.querySelector('#empire-floating-tab-config');
        if (!config) return;

        const btn = document.createElement('button');
        btn.className = 'empire-floating-tab';
        btn.textContent = config.dataset.label || 'Reviews';
        btn.style.cssText = `
            position:fixed;${config.dataset.position === 'left' ? 'left' : 'right'}:0;
            top:${config.dataset.offset || '50'}%;
            transform:translateY(-50%);
            background:${config.dataset.bg || '#111'};
            color:${config.dataset.text || '#fff'};
            padding:12px 20px;
            border:none;
            cursor:pointer;
            z-index:9999;
        `;

        btn.onclick = () => window.open('/pages/reviews', '_blank');
        document.body.appendChild(btn);
    }

    // === Media Grid ===
    async function initMediaGrid() {
        const containers = document.querySelectorAll('[data-empire-media-grid]');
        if (!containers.length) return;

        containers.forEach(async (container) => {
            try {
                const res = await fetch(`${API_BASE}?mediaOnly=true&limit=12`);
                const { reviews } = await res.json();

                container.innerHTML = reviews.map(r => {
                    const img = r.media?.[0]?.url;
                    return img ? `<div class="empire-grid-item"><img src="${img}" alt="Review photo" loading="lazy"></div>` : '';
                }).filter(Boolean).join('');
            } catch (e) {
                console.error('Media grid load failed:', e);
            }
        });
    }

    // === Review Widget (lazy-load full version) ===
    async function initReviewWidgets() {
        const containers = document.querySelectorAll('.empire-reviews-widget');
        if (!containers.length) return;

        // Inject minimal placeholder
        containers.forEach(c => {
            const inner = c.querySelector('.empire-reviews-container');
            if (inner) inner.innerHTML = '<div class="empire-loading">Initializing...</div>';
        });

        // Lazy-load full widget module if URL is provided
        const firstWidget = document.querySelector('.empire-reviews-widget');
        const fullJsUrl = firstWidget?.dataset.fullJs;

        if (fullJsUrl) {
            // Check if already loaded
            if (window.Empire && window.Empire.renderFullWidget) {
                const innerContainers = document.querySelectorAll('.empire-reviews-container');
                window.Empire.renderFullWidget(innerContainers, API_BASE);
                return;
            }

            // Script Injection Pattern (Robust)
            const script = document.createElement('script');
            script.src = fullJsUrl;
            script.async = true;

            script.onload = () => {
                const innerContainers = document.querySelectorAll('.empire-reviews-container');
                if (window.Empire && window.Empire.renderFullWidget) {
                    window.Empire.renderFullWidget(innerContainers, API_BASE);
                } else {
                    console.error("Empire loaded but render function missing");
                    renderBasicReviews(document.querySelectorAll('.empire-reviews-container'));
                }
            };

            script.onerror = (e) => {
                console.error("Empire Script Injection failed:", e);
                renderBasicReviews(document.querySelectorAll('.empire-reviews-container'));
            };

            document.head.appendChild(script);
        } else {
            renderBasicReviews(document.querySelectorAll('.empire-reviews-container'));
        }
    }

    async function renderBasicReviews(containers) {
        containers.forEach(async (container) => {
            try {
                const productId = container.parentElement.dataset.productId;
                const res = await fetch(`${API_BASE}?productId=${productId}`);
                const { reviews } = await res.json();

                container.innerHTML = `
                    <div class="empire-reviews-list">
                        ${reviews.map(r => `
                            <div class="empire-review-card">
                                <div class="stars">${'★'.repeat(r.rating)}</div>
                                <p>${r.body}</p>
                                <span>${r.customerName || 'Anonymous'} - ${new Date(r.createdAt || Date.now()).toLocaleDateString()}</span>
                            </div>
                        `).join('')}
                    </div>
                `;
            } catch (e) {
                container.innerHTML = '<p>Unable to load reviews.</p>';
            }
        });
    }

    // === Trust Badge Widget ===
    async function initTrustBadge() {
        const containers = document.querySelectorAll('[data-empire-trust]');
        if (!containers.length) return;

        containers.forEach(async (container) => {
            try {
                const shop = container.dataset.shop;
                if (!shop) return; // No shop parameter, keep static

                const res = await fetch(`${API_BASE}?shop=${shop}`);
                const { stats } = await res.json();

                if (stats && stats.total > 0) {
                    const scoreElement = container.querySelector('.empire-trust-score');
                    if (scoreElement) {
                        scoreElement.textContent = `${stats.average.toFixed(1)}/5 (${stats.total})`;
                    }
                }
            } catch (e) {
                console.error('Trust badge load failed:', e);
                // Keep static fallback on error
            }
        });
    }

    // === Star Rating Widget ===
    async function initStarRatings() {
        const containers = document.querySelectorAll('[data-empire-stars]');
        if (!containers.length) return;

        containers.forEach(async (container) => {
            try {
                const productId = container.dataset.productId;
                const res = await fetch(`${API_BASE}?productId=${productId}`);
                const { stats } = await res.json();
                const { average, total: count } = stats || { average: 0, total: 0 };

                const fullStars = Math.floor(average);
                const hasHalf = average % 1 >= 0.5;

                container.innerHTML = `
                    <div class="empire-stars">
                        ${'<span class="star full">★</span>'.repeat(fullStars)}
                        ${hasHalf ? '<span class="star half">★</span>' : ''}
                        ${'<span class="star empty">☆</span>'.repeat(5 - fullStars - (hasHalf ? 1 : 0))}
                        <span class="count">(${count})</span>
                    </div>
                `;
            } catch (e) {
                console.error('Star rating load failed:', e);
            }
        });
    }

    // Initialize all widgets
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    function init() {
        initTrustBadge();
        initStarRatings();
        initCarousel();
        initFloatingTab();
        initMediaGrid();
        initReviewWidgets();
    }
})();
