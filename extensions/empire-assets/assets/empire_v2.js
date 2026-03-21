// Empire Reviews V2 - Lightweight Core (Under 10KB)
// Heavy features are lazy-loaded on demand

(function () {
    'use strict';

    if (window.empireV2Initialized) return;
    window.empireV2Initialized = true;

    // Helper to build fully-qualified cross-origin API URLs bypassing the App Proxy
    function getApiUrl(container, params = '') {
        const appUrl = (container.dataset.appUrl || window.EMPIRE_APP_URL || 'https://empire-reviews.vercel.app').replace(/\/$/, '');
        const shop = container.dataset.shop || (window.Shopify && window.Shopify.shop) || '';
        let url = `${appUrl}/api/reviews${params ? (params.startsWith('?') ? params : `?${params}`) : ''}`;
        
        // Ensure shop is always included in the query for multi-tenant routing
        if (shop && !url.includes('shop=')) {
            url += `${url.includes('?') ? '&' : '?'}shop=${encodeURIComponent(shop)}`;
        }
        return url;
    }

    // === Carousel Widget ===
    async function initCarousel() {
        const containers = document.querySelectorAll('.empire-carousel-container');
        if (!containers.length) return;

        containers.forEach(async (container) => {
            try {
                const track = container.querySelector('.empire-carousel-track');
                if (!track) return;

                const style   = container.dataset.style  || 'bordered';
                const radius  = container.dataset.radius || '16';
                const bg      = container.dataset.bg     || '#ffffff';
                const text    = container.dataset.text   || '#1f2937';
                const cols    = parseInt(container.dataset.desktopCols || '3');
                const gap     = parseInt(container.dataset.gap || '20');
                const showVer = container.dataset.verified !== 'false';

                const apiUrl = getApiUrl(container, '?minRating=4&limit=12');
                const res = await fetch(apiUrl);
                if (!res.ok) throw new Error('API returning error');
                const { reviews } = await res.json();

                if (!reviews || !reviews.length) {
                    track.innerHTML = `
                        <div style="text-align:center;width:100%;padding:40px 20px;grid-column:1/-1;">
                            <p style="opacity:0.6;font-size:1.1em;margin-bottom:15px;">No reviews yet. Be the first to share your experience!</p>
                            <button onclick="if(window.empireOpenReviewForm) { window.empireOpenReviewForm(); } else { alert('Please add the Leave a Review Form block to the page first.'); }" 
                                    style="background:var(--empire-btn-bg,#111);color:var(--empire-btn-text,#fff);padding:10px 24px;border-radius:8px;font-weight:600;font-size:0.95em;cursor:pointer;border:none;box-shadow:0 4px 6px rgba(0,0,0,0.1);transition:transform 0.2s;"
                                    onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'">
                                Write a Review
                            </button>
                        </div>
                    `;
                    return;
                }

                track.style.cssText = `
                    display: grid;
                    grid-template-columns: repeat(${cols}, 1fr);
                    gap: ${gap}px;
                `;

                track.innerHTML = reviews.map(r => {
                    const stars = '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating);
                    const name  = r.customerName || 'Anonymous';
                    const date  = new Date(r.createdAt || Date.now()).toLocaleDateString();
                    const bodyText = r.body ? (r.body.length > 150 ? r.body.substring(0, 150) + '…' : r.body) : '';
                    const verified = (showVer && r.verified) ? '<span class="empire-verified-badge" style="color:#16a34a;font-size:0.75em;font-weight:600;">✓ Verified</span>' : '';

                    return `
                        <div class="empire-carousel-card" style="
                            background:${bg}; color:${text};
                            border-radius:${radius}px; padding:20px;
                            border: ${style === 'bordered' ? '1px solid #e5e7eb' : 'none'};
                            ${style === 'glass' ? 'backdrop-filter:blur(10px);background:rgba(255,255,255,0.7);' : ''}
                            ${style === 'dark' ? 'background:#1f2937;color:#f9fafb;' : ''}
                        ">
                            <div class="empire-card-stars" style="color:#fbbf24;margin-bottom:8px;">${stars}</div>
                            <p style="margin:0 0 12px 0;line-height:1.5;font-size:0.95em;">${bodyText}</p>
                            <div style="display:flex;align-items:center;justify-content:space-between;margin-top:auto;">
                                <span style="font-weight:600;font-size:0.85em;">${name}</span>
                                ${verified}
                            </div>
                            <span style="opacity:0.5;font-size:0.75em;">${date}</span>
                        </div>
                    `;
                }).join('');
            } catch (e) {
                console.error('Carousel load failed:', e);
                const track = container.querySelector('.empire-carousel-track');
                if (track) track.innerHTML = '<p style="opacity:0.5;text-align:center;width:100%;">Unable to load reviews.</p>';
            }
        });
    }

    // === Floating Tab ===
    function initFloatingTab() {
        const config = document.querySelector('#empire-floating-tab-config');
        if (!config) return;

        const pos    = config.dataset.position || 'right';
        const offset = config.dataset.offset || '50';
        const label  = config.dataset.label || 'Reviews';
        const bgCol  = config.dataset.bg    || '#111';
        const txtCol = config.dataset.text  || '#fff';
        const icon   = config.dataset.icon  || 'star';
        const pulse  = config.dataset.pulse !== 'false';
        const rating = config.dataset.rating !== 'false';

        const iconMap = { star: '★', heart: '♥', bag: '🛍', none: '' };

        const btn = document.createElement('button');
        btn.className = 'empire-floating-tab';

        let labelHtml = (iconMap[icon] || '') + ' ' + label;

        btn.style.cssText = `
            position: fixed;
            ${pos === 'left' || pos === 'bottom-left' ? 'left: 0;' : 'right: 0;'}
            ${pos.startsWith('bottom') ? 'bottom: 20px;' : 'top: ' + offset + '%;'}
            ${!pos.startsWith('bottom') ? 'transform: translateY(-50%) rotate(' + (pos === 'left' ? '-90' : '90') + 'deg); transform-origin: ' + (pos === 'left' ? 'left bottom' : 'right bottom') + ';' : ''}
            background: ${bgCol};
            color: ${txtCol};
            padding: 10px 20px;
            border: none;
            border-radius: ${pos.startsWith('bottom') ? '8px' : '0 0 8px 8px'};
            cursor: pointer;
            z-index: 9998;
            font-family: inherit;
            font-size: 0.9rem;
            font-weight: 600;
            letter-spacing: 0.5px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.15);
            transition: transform 0.2s, box-shadow 0.2s;
            ${pulse ? 'animation: empire-float-pulse 3s ease-in-out infinite;' : ''}
        `;

        btn.innerHTML = labelHtml;

        // Fetch and show live rating on button
        if (rating) {
            const apiUrl = getApiUrl(config, '?limit=1');
            fetch(apiUrl)
                .then(r => r.json())
                .then(data => {
                    if (data.stats && data.stats.total > 0) {
                        btn.innerHTML = `★ ${data.stats.average.toFixed(1)} ${label}`;
                    }
                })
                .catch(() => {});
        }

        btn.addEventListener('click', () => {
            const reviewSection = document.querySelector('.empire-reviews-widget');
            if (reviewSection) {
                reviewSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });

        btn.addEventListener('mouseenter', () => { btn.style.transform += ' scale(1.05)'; });
        btn.addEventListener('mouseleave', () => { btn.style.transform = btn.style.transform.replace(' scale(1.05)', ''); });

        document.body.appendChild(btn);

        // Add pulse animation
        if (pulse && !document.getElementById('empire-float-pulse-style')) {
            const style = document.createElement('style');
            style.id = 'empire-float-pulse-style';
            style.textContent = `
                @keyframes empire-float-pulse {
                    0%, 100% { box-shadow: 0 4px 15px rgba(0,0,0,0.15); }
                    50% { box-shadow: 0 4px 25px rgba(0,0,0,0.3); }
                }
            `;
            document.head.appendChild(style);
        }
    }

    // === Media Grid ===
    async function initMediaGrid() {
        const containers = document.querySelectorAll('.empire-media-grid-container');
        if (!containers.length) return;

        containers.forEach(async (container) => {
            try {
                const grid    = container.querySelector('.empire-media-grid');
                if (!grid) return;

                const cols    = container.dataset.cols || '4';
                const mobCols = container.dataset.mobileCols || '2';
                const gap     = container.dataset.gap || '10';
                const aspect  = container.dataset.aspect || 'square';
                const overlay = container.dataset.overlay || '#000000';
                const opacity = (parseInt(container.dataset.opacity || '20') / 100);

                const apiUrl = getApiUrl(container, '?mediaOnly=true&limit=24');
                const res = await fetch(apiUrl);
                if (!res.ok) throw new Error('API returning error');
                const { reviews } = await res.json();

                const mediaItems = reviews
                    .filter(r => r.media && r.media.length > 0)
                    .flatMap(r => r.media.map(m => ({ url: m.url, type: m.type || 'image', review: r })));

                if (!mediaItems.length) {
                    grid.innerHTML = `
                        <div style="text-align:center;width:100%;padding:40px 20px;grid-column:1/-1;">
                            <p style="opacity:0.6;font-size:1.1em;margin-bottom:15px;">No customer photos yet.</p>
                            <button onclick="if(window.empireOpenReviewForm) { window.empireOpenReviewForm(); } else { alert('Please add the Leave a Review Form block to the page first.'); }" 
                                    style="background:var(--empire-btn-bg,#111);color:var(--empire-btn-text,#fff);padding:10px 24px;border-radius:8px;font-weight:600;font-size:0.95em;cursor:pointer;border:none;box-shadow:0 4px 6px rgba(0,0,0,0.1);transition:transform 0.2s;"
                                    onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'">
                                Upload a Photo Review
                            </button>
                        </div>
                    `;
                    return;
                }

                grid.style.cssText = `
                    display: grid;
                    grid-template-columns: repeat(${cols}, 1fr);
                    gap: ${gap}px;
                `;

                const aspectMap = { square: '1/1', portrait: '4/5', masonry: 'auto' };

                grid.innerHTML = mediaItems.map(m => `
                    <div class="empire-grid-item" style="
                        position:relative; overflow:hidden;
                        border-radius:8px; cursor:pointer;
                        aspect-ratio: ${aspectMap[aspect] || '1/1'};
                    ">
                        <img src="${m.url}" alt="Customer photo" loading="lazy" style="
                            width:100%; height:100%; object-fit:cover;
                            transition: transform 0.3s;
                        " onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'" />
                        <div style="
                            position:absolute;inset:0;
                            background:${overlay}; opacity:0;
                            transition:opacity 0.3s; pointer-events:none;
                        " class="empire-grid-overlay"></div>
                    </div>
                `).join('');

                // Add responsive styles
                if (!document.getElementById('empire-grid-responsive')) {
                    const style = document.createElement('style');
                    style.id = 'empire-grid-responsive';
                    style.textContent = `
                        @media (max-width: 768px) {
                            .empire-media-grid { grid-template-columns: repeat(${mobCols}, 1fr) !important; }
                        }
                        .empire-grid-item:hover .empire-grid-overlay { opacity: ${opacity} !important; }
                    `;
                    document.head.appendChild(style);
                }
            } catch (e) {
                console.error('Media grid load failed:', e);
                const grid = container.querySelector('.empire-media-grid');
                if (grid) grid.innerHTML = '<p style="opacity:0.5;text-align:center;grid-column:1/-1;">Unable to load photos.</p>';
            }
        });
    }

    // === Review Widget ===
    async function initReviewWidgets() {
        const containers = document.querySelectorAll('.empire-reviews-widget');
        if (!containers.length) return;

        // Inject minimal placeholder
        containers.forEach(c => {
            const inner = c.querySelector('.empire-reviews-container');
            if (inner) inner.innerHTML = '<div class="empire-loading">Loading reviews…</div>';
        });

        // Use strict basic rendering as full JS module isn't strictly necessary with our advanced basic engine
        renderBasicReviews(document.querySelectorAll('.empire-reviews-container'));
    }

    async function renderBasicReviews(containers) {
        containers.forEach(async (container) => {
            const widget = container.closest('.empire-reviews-widget');
            try {
                const productId = widget?.dataset.productId;
                if (!productId) { container.innerHTML = '<p>No product detected.</p>'; return; }

                const apiUrl = getApiUrl(widget, `?productId=${productId}`);
                const res = await fetch(apiUrl);
                if (!res.ok) throw new Error('API returning error');
                const { reviews, stats } = await res.json();

                if (!reviews || !reviews.length) {
                    container.innerHTML = `
                        <div style="text-align:center;width:100%;padding:60px 20px;background:var(--empire-feed-bg, #f9fafb);border-radius:12px;margin-top:20px;">
                            <div style="font-size:3rem;margin-bottom:15px;">✨</div>
                            <h3 style="font-size:1.5rem;font-weight:700;margin-bottom:10px;">No reviews yet</h3>
                            <p style="opacity:0.6;font-size:1.1em;margin-bottom:25px;max-width:400px;margin-left:auto;margin-right:auto;">Be the first to share your experience with this product!</p>
                            <button onclick="if(window.empireOpenReviewForm) { window.empireOpenReviewForm(); } else { alert('Please add the Leave a Review Form block to the page first.'); }" 
                                    style="background:var(--empire-btn-bg,#111);color:var(--empire-btn-text,#fff);padding:14px 32px;border-radius:8px;font-weight:600;font-size:1.05em;cursor:pointer;border:none;box-shadow:0 4px 12px rgba(0,0,0,0.15);transition:transform 0.2s;"
                                    onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'">
                                Write the First Review
                            </button>
                        </div>
                    `;
                    return;
                }

                const avg   = stats ? stats.average.toFixed(1) : '0';
                const total = stats ? stats.total : reviews.length;
                const starColor = getComputedStyle(widget).getPropertyValue('--empire-star-color').trim() || '#fbbf24';
                const verifiedColor = getComputedStyle(widget).getPropertyValue('--empire-verified-color').trim() || '#16a34a';

                container.innerHTML = `
                    <div class="empire-basic-summary" style="display:flex;align-items:center;gap:12px;margin-bottom:1.5rem;padding-bottom:1rem;border-bottom:1px solid #e5e7eb;">
                        <span style="font-size:2.4rem;font-weight:800;">${avg}</span>
                        <div>
                            <div style="color:${starColor};font-size:1.2rem;letter-spacing:2px;">${'★'.repeat(Math.round(stats?.average || 0))}${'☆'.repeat(5 - Math.round(stats?.average || 0))}</div>
                            <span style="opacity:0.6;font-size:0.85rem;">${total} review${total !== 1 ? 's' : ''}</span>
                        </div>
                    </div>
                    <div class="empire-reviews-list" style="display:flex;flex-direction:column;gap:16px;">
                        ${reviews.map(r => {
                            const name = r.customerName || 'Anonymous';
                            const date = new Date(r.createdAt || Date.now()).toLocaleDateString();
                            const stars = '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating);
                            const title = r.title ? `<strong style="display:block;margin-bottom:4px;">${r.title}</strong>` : '';
                            const verified = r.verified ? `<span style="color:${verifiedColor};font-size:0.75rem;font-weight:600;">✓ Verified Buyer</span>` : '';
                            const media = (r.media && r.media.length) ? `<div style="display:flex;gap:8px;margin-top:8px;">${r.media.map(m => `<img src="${m.url}" style="width:60px;height:60px;object-fit:cover;border-radius:8px;cursor:pointer;" />`).join('')}</div>` : '';
                            const reply = (r.replies && r.replies.length) ? `<div style="background:#f8fafc;border-left:3px solid #10b981;padding:8px 12px;margin-top:8px;border-radius:0 8px 8px 0;font-size:0.85em;"><strong>Store Reply:</strong> ${r.replies[0].body}</div>` : '';

                            return `
                                <div class="empire-review-card" style="padding:16px 0;border-bottom:1px solid #f1f5f9;">
                                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                                        <div style="display:flex;align-items:center;gap:8px;">
                                            <div style="width:32px;height:32px;border-radius:50%;background:#e5e7eb;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.8rem;">${name.charAt(0).toUpperCase()}</div>
                                            <div>
                                                <span style="font-weight:600;font-size:0.9rem;">${name}</span>
                                                ${verified}
                                            </div>
                                        </div>
                                        <span style="opacity:0.45;font-size:0.78rem;">${date}</span>
                                    </div>
                                    <div style="color:${starColor};margin-bottom:6px;">${stars}</div>
                                    ${title}
                                    <p style="margin:0;line-height:1.6;color:var(--empire-body-color, #4b5563);">${r.body}</p>
                                    ${media}
                                    ${reply}
                                </div>
                            `;
                        }).join('')}
                    </div>
                `;
            } catch (e) {
                console.error("Review load failed", e);
                container.innerHTML = '<p style="opacity:0.5;">Unable to load reviews.</p>';
            }
        });
    }

    // === Trust Badge Widget ===
    async function initTrustBadge() {
        const containers = document.querySelectorAll('[data-empire-trust]');
        if (!containers.length) return;

        containers.forEach(async (container) => {
            try {
                const apiUrl = getApiUrl(container, '');
                const res = await fetch(apiUrl);
                if (!res.ok) throw new Error('API returning error');
                const { stats } = await res.json();

                if (stats && stats.total > 0) {
                    const scoreElement = container.querySelector('.empire-trust-score');
                    if (scoreElement) {
                        scoreElement.textContent = `${stats.average.toFixed(1)}/5 (${stats.total})`;
                    }
                }
            } catch (e) {
                console.error('Trust badge load failed:', e);
            }
        });
    }

    // === Star Rating Widget ===
    async function initStarRatings() {
        const containers = document.querySelectorAll('.empire-star-rating');
        if (!containers.length) return;

        containers.forEach(async (container) => {
            try {
                const productId = container.dataset.productId;
                if (!productId) return;

                const showCount = container.dataset.showCount !== 'false';
                const countText = container.dataset.countText || '({n} reviews)';
                const starSize  = parseInt(container.dataset.starSize  || '24');
                const textSize  = parseInt(container.dataset.textSize  || '14');
                const textColor = container.dataset.textColor || '#6b7280';

                const apiUrl = getApiUrl(container, `?productId=${productId}&limit=1`);
                const res = await fetch(apiUrl);
                if (!res.ok) throw new Error('API returning error');
                const { stats } = await res.json();
                const { average, total: count } = stats || { average: 0, total: 0 };

                if (count === 0 && !container.closest('[data-design-mode]')) return;

                const fullStars = Math.floor(average);
                const hasHalf   = average % 1 >= 0.3;
                const emptyStars = 5 - fullStars - (hasHalf ? 1 : 0);

                const existingSvg = container.querySelector('svg');
                const starColor = existingSvg ? existingSvg.getAttribute('fill') : '#fbbf24';

                const loadingStars = container.querySelector('.empire-stars-loading');
                if (loadingStars) {
                    let starsHtml = '';
                    for (let i = 0; i < 5; i++) {
                        const fill = i < fullStars ? starColor : (i === fullStars && hasHalf ? starColor : '#e5e7eb');
                        const opacity = (i === fullStars && hasHalf) ? 'opacity:0.5;' : '';
                        starsHtml += `<svg viewBox="0 0 24 24" width="${starSize}" height="${starSize}" fill="${fill}" style="${opacity}"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>`;
                    }
                    loadingStars.innerHTML = starsHtml;
                }

                const existingCount = container.querySelector('.empire-rating-count');
                if (showCount && count > 0) {
                    const text = countText.replace('{n}', count);
                    if (existingCount) {
                        existingCount.textContent = text;
                    } else {
                        const span = document.createElement('span');
                        span.className = 'empire-rating-count';
                        span.style.cssText = `margin-left:8px;font-size:${textSize}px;opacity:0.8;color:${textColor};`;
                        span.textContent = text;
                        container.appendChild(span);
                    }
                } else if (existingCount) {
                    existingCount.remove();
                }
            } catch (e) {
                console.error('Star rating load failed:', e);
            }
        });
    }

    // Initialize all widgets
    function init() {
        initTrustBadge();
        initStarRatings();
        initCarousel();
        initFloatingTab();
        initMediaGrid();
        initReviewWidgets();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
