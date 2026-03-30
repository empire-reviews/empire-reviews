"use strict";

const EmpireWidgets = (function() {
    const API_BASE = "https://empire-reviews.vercel.app";
    let activeProductId = null;
    let activeShopDomain = null;
    let currentRatingSelected = 0;
    const widgetState = {}; // Store pagination state for multiple widgets

    const API = {
        init() {
            setTimeout(() => {
                this.renderStarRatings();
                this.renderReviewLists();
                this.renderReviewCarousels();
            }, 100);
        },

        openReviewModal(triggerElement) {
            activeProductId = triggerElement.getAttribute('data-product-id');
            activeShopDomain = triggerElement.getAttribute('data-shop-domain');
            currentRatingSelected = 0;

            document.querySelectorAll('.empire-pick-star').forEach(el => {
                el.classList.remove('selected', 'hover-active', 'active');
                el.style.color = '#e2e8f0';
            });

            const nameInput = document.getElementById('empire-input-name');
            const bodyInput = document.getElementById('empire-input-body');
            if (nameInput) nameInput.value = '';
            if (bodyInput) bodyInput.value = '';

            const formFields = document.getElementById('empire-review-fields');
            if (formFields) {
                formFields.style.display = 'none';
                formFields.classList.remove('visible');
            }

            const submitBtn = document.getElementById('empire-submit-btn');
            if (submitBtn) submitBtn.classList.remove('empire-btn-ready');

            const overlay = document.getElementById('empire-modal-overlay');
            if (overlay) overlay.classList.add('open', 'active');

            const filePreview = document.getElementById('empire-file-preview');
            if (filePreview) filePreview.innerHTML = '';
            
            const successMsg = document.getElementById('empire-modal-success');
            if (successMsg) successMsg.style.display = 'none';

            // Photo Uploader Injection (PRO Feature)
            const uploadContainer = document.getElementById('empire-photo-upload-container');
            if (uploadContainer) {
                uploadContainer.innerHTML = ''; // reset
                // Only render if PRO feature is unlocked by the backend
                if (window.EmpireFeatures && window.EmpireFeatures.allowPhotoUploads === true) {
                    uploadContainer.innerHTML = `
                        <div style="font-size: 0.95rem; font-weight: 600; color: #1e293b; margin-bottom: 8px;">Drag and Drop</div>
                        <div class="empire-photo-dropzone" id="empire-photo-dropzone">
                            <div class="empire-dropzone-clicker" id="empire-dropzone-clicker">
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 8px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                                <div>Drag & Drop or Click to upload<br><span style="font-size: 0.8rem; color: #64748b;">(Max 4 photos, 10MB each)</span></div>
                            </div>
                            <div class="empire-photo-previews" id="empire-photo-previews"></div>
                            <input type="file" id="empire-photo-input" accept="image/png, image/jpeg, image/webp" multiple style="display:none;" />
                        </div>
                    `;
                    this.initPhotoUploader();
                }
            }
        },

        closeModal(event) {
            if (event && event.target !== document.getElementById('empire-modal-overlay') && !event.target.classList.contains('empire-modal-close')) {
                return;
            }
            const overlay = document.getElementById('empire-modal-overlay');
            if (overlay) overlay.classList.remove('open', 'active');
        },

        setRating(rating) {
            currentRatingSelected = rating;
            document.querySelectorAll('.empire-pick-star').forEach((el, index) => {
                const isActive = index < rating;
                el.classList.toggle('active', isActive);
                el.style.color = isActive ? 'var(--empire-primary)' : '#e2e8f0';
            });

            const formFields = document.getElementById('empire-review-fields');
            if (formFields) {
                formFields.style.display = 'flex';
                setTimeout(() => { formFields.classList.add('visible'); }, 20);
            }

            const submitBtn = document.getElementById('empire-submit-btn');
            if (submitBtn) submitBtn.classList.add('empire-btn-ready');
        },

        selectStar(rating) {
            this.setRating(rating);
        },

        async submitReview(event) {
            if (event && event.preventDefault) event.preventDefault();

            if (currentRatingSelected === 0) {
                alert("Please select a star rating first.");
                return;
            }

            const submitBtn = document.getElementById('empire-submit-btn');
            if (!submitBtn) return;

            const originalText = submitBtn.innerText;
            submitBtn.innerText = "Submitting...";
            submitBtn.disabled = true;

            try {
                const formData = new FormData();
                const nameInput = document.getElementById('empire-input-name');
                const bodyInput = document.getElementById('empire-input-body');

                formData.append('productId', activeProductId || '');
                formData.append('shop', activeShopDomain || '');
                formData.append('rating', currentRatingSelected.toString());

                if (nameInput && nameInput.value) formData.append('author', nameInput.value);
                if (bodyInput && bodyInput.value) formData.append('body', bodyInput.value);

                if (window.EmpireUploadedPhotos && window.EmpireUploadedPhotos.length > 0) {
                    formData.append('media_urls', JSON.stringify(window.EmpireUploadedPhotos));
                }

                const response = await fetch(`${API_BASE}/api/reviews`, {
                    method: 'POST',
                    body: formData
                });

                if (response.ok) {
                    submitBtn.innerText = "Success!";
                    const formFields = document.getElementById('empire-review-fields');
                    const label = document.getElementById('empire-star-label');
                    const picker = document.getElementById('empire-star-picker');
                    const successMsg = document.getElementById('empire-modal-success');

                    if (formFields) formFields.style.display = 'none';
                    if (label) label.style.display = 'none';
                    if (picker) picker.style.display = 'none';
                    if (successMsg) successMsg.style.display = 'flex';

                    setTimeout(() => {
                        this.closeModal();
                        submitBtn.innerText = originalText;
                        submitBtn.disabled = false;
                        if (label) label.style.display = 'block';
                        if (picker) picker.style.display = 'flex';
                    }, 2500);
                } else {
                    throw new Error("Server error");
                }
            } catch (error) {
                alert("Failed to submit review. Please try again.");
                submitBtn.innerText = originalText;
                submitBtn.disabled = false;
            }
        },

        initPhotoUploader() {
            const dropzone = document.getElementById('empire-photo-dropzone');
            const fileInput = document.getElementById('empire-photo-input');
            const previewsContainer = document.getElementById('empire-photo-previews');
            const clicker = document.getElementById('empire-dropzone-clicker');
            
            if (!dropzone || !fileInput) return;

            window.EmpireUploadedPhotos = []; 

            // Only trigger file select if clicking the left side clicker (or empty zone)
            clicker.addEventListener('click', () => fileInput.click());
            dropzone.addEventListener('click', (e) => {
                if (e.target === dropzone) fileInput.click();
            });
            
            ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
                dropzone.addEventListener(eventName, function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                }, false);
            });

            dropzone.addEventListener('dragover', () => dropzone.classList.add('drag-active'));
            dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-active'));
            dropzone.addEventListener('drop', (e) => {
                dropzone.classList.remove('drag-active');
                if (e.dataTransfer.files) this.handleFilesUpload(e.dataTransfer.files, previewsContainer);
            });

            const self = this;
            fileInput.addEventListener('change', function() {
                if (this.files) self.handleFilesUpload(this.files, previewsContainer);
                this.value = ''; // reset so same file can be selected again if removed
            });
        },

        async handleFilesUpload(files, previewsContainer) {
            // Updated to max 4 photos to match reference mockup
            const fileArray = Array.from(files).slice(0, 4 - window.EmpireUploadedPhotos.length);
            if (fileArray.length === 0) return;

            for (let file of fileArray) {
                // Instantly generate a temporary local URL for immediate visual feedback
                const localUrl = URL.createObjectURL(file);
                
                const prev = document.createElement('div');
                prev.className = 'empire-photo-preview-item';
                prev.innerHTML = `
                    <div class="empire-uploading-shimmer" style="position: absolute; inset:0; background: rgba(255,255,255,0.5); display: flex; align-items:center; justify-content:center;"><div class="empire-spinner" style="width:16px; height:16px; border-width:2px;"></div></div>
                    <img src="${localUrl}" class="empire-photo-preview-img" style="opacity: 0.5;" />
                    <button class="empire-photo-remove" disabled>✕</button>
                `;
                previewsContainer.appendChild(prev);

                try {
                    const formData = new FormData();
                    formData.append('file', file);
                    formData.append('upload_preset', 'empire reviews');
                    formData.append('cloud_name', 'doefkcth6');

                    const response = await fetch('https://api.cloudinary.com/v1_1/doefkcth6/image/upload', {
                        method: 'POST',
                        body: formData
                    });

                    const data = await response.json();

                    if (!response.ok) throw new Error(data.error?.message || "Cloudinary error");

                    if (data.secure_url) {
                        const secureUrl = data.secure_url;
                        window.EmpireUploadedPhotos.push(secureUrl);
                        
                        // Update UI to success state
                        prev.querySelector('.empire-uploading-shimmer').style.display = 'none';
                        prev.querySelector('img').style.opacity = '1';
                        
                        const rmBtn = prev.querySelector('.empire-photo-remove');
                        rmBtn.disabled = false;
                        rmBtn.onclick = function() {
                            EmpireWidgets.removePhoto(secureUrl, prev);
                        };
                    }
                } catch (err) {
                    console.error("Cloudinary file processing failed", err);
                    prev.innerHTML = '<div style="font-size:10px; color:white; background:var(--empire-primary); padding:4px; text-align:center; position:absolute; inset:0; display:flex; align-items:center; justify-content:center;">Error</div>';
                    setTimeout(() => prev.remove(), 2000);
                }
            }
        },

        removePhoto(url, element) {
            window.EmpireUploadedPhotos = window.EmpireUploadedPhotos.filter(u => u !== url);
            if (element) element.remove();
        },

        escapeHtml(unsanitized) {
            if (!unsanitized) return "";
            const div = document.createElement('div');
            div.textContent = unsanitized;
            return div.innerHTML;
        },

        getStarsHtml(rating) {
            let stars = '';
            for (let i = 1; i <= 5; i++) {
                if (i <= rating) {
                    stars += '<span class="empire-skeleton-star">\u2605</span>';
                } else {
                    stars += '<span style="color:#e2e8f0; font-size:var(--star-size, 1.15rem); line-height:1;">\u2605</span>';
                }
            }
            return `<div class="empire-stars-inner">${stars}</div>`;
        },

        async fetchReviewsData(productId, shopDomain, page = 1) {
            if (!productId || !shopDomain) return null;
            const pureId = productId.replace('gid://shopify/Product/', '');
            try {
                const res = await fetch(`${API_BASE}/api/reviews?productId=${pureId}&shop=${shopDomain}&page=${page}&limit=10`);
                if (!res.ok) throw new Error("Network error");
                return await res.json();
            } catch (e) {
                return null;
            }
        },

        async renderStarRatings() {
            const wrappers = document.querySelectorAll('.empire-star-rating');
            if (!wrappers.length) return;

            for (const wrapper of wrappers) {
                const productId = wrapper.getAttribute('data-product-id');
                const shopDomain = wrapper.getAttribute('data-shop-domain');
                if (!productId || !shopDomain) continue;

                const data = await this.fetchReviewsData(productId, shopDomain, 1);
                
                if (!data || !data.stats || data.stats.total === 0) {
                    wrapper.innerHTML = '<span class="empire-rating-text">No reviews yet</span>';
                    continue;
                }

                wrapper.innerHTML = `
                    <div style="display: flex; flex-direction: column; gap: 4px;">
                        <div style="display: flex; align-items: center; flex-wrap: wrap; gap: 4px;">
                            <div class="empire-stars-wrap">${this.getStarsHtml(Math.round(data.stats.average))}</div>
                            <span class="empire-rating-text">${data.stats.average.toFixed(2)} out of 5</span>
                        </div>
                        <div class="empire-rating-text" style="color: var(--text-color, var(--empire-text-light));">
                            Based on ${data.stats.total} reviews 
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#48c7a6" style="width:1.2em; height:1.2em; vertical-align:middle; margin-left:2px; transform:translateY(-1px);"><rect width="24" height="24" rx="4"/><path fill="#fff" d="M9.5 16l-4-4 1.5-1.5 2.5 2.5 6.5-6.5L17.5 8z"/></svg>
                        </div>
                    </div>
                `;
            }
        },

        async renderReviewLists() {
            // ... omitting for brevity if I was fully rewriting but I MUST include it to not break it.
            // Oh, I can just write the whole thing cleanly. Let's do it.
            const widgets = document.querySelectorAll('.empire-reviews-widget');
            if (!widgets.length) return;

            for (const widget of widgets) {
                const productId = widget.getAttribute('data-product-id');
                const shopDomain = widget.getAttribute('data-shop-domain');
                const widgetId = widget.id || 'widget_' + Math.floor(Math.random() * 100000);
                
                if (!productId || !shopDomain) continue;
                
                widgetState[widgetId] = { page: 1, hasMore: true, isLoading: true, statsLoaded: false };

                const data = await this.fetchReviewsData(productId, shopDomain, 1);
                
                // Store global features block so modal can read it later
                if (data && data.features) {
                    window.EmpireFeatures = data.features;
                }
                
                const summarySkeleton = widget.querySelector('.empire-summary-skeleton');
                const distContainer = widget.querySelector('.empire-distribution-container');
                const reviewsGrid = widget.querySelector('.empire-reviews-grid');
                const loadMoreTrigger = widget.querySelector('.empire-load-more-trigger');

                if (!data || !data.reviews || data.reviews.length === 0) {
                    if (reviewsGrid) {
                        reviewsGrid.classList.remove('empire-loading');
                        reviewsGrid.innerHTML = `
                            <div class="empire-empty-state">
                                <div class="empire-empty-icon">✨</div>
                                <h3>Be the first to review!</h3>
                            </div>`;
                    }
                    if (summarySkeleton) summarySkeleton.innerHTML = '<div class="empire-summary-score">0.0</div><div style="font-size: 0.9rem; color: #64748b; margin-top: 4px;">Based on 0 reviews</div>';
                    if (distContainer) distContainer.innerHTML = '';
                    continue;
                }

                if (summarySkeleton && data.stats) {
                    summarySkeleton.outerHTML = `
                        <div class="empire-summary-stats">
                            <div class="empire-summary-score">${data.stats.average.toFixed(1)}</div>
                            <div style="font-size: 0.95rem; font-weight: 500; color: #64748b; margin-top: 4px;">Based on ${data.stats.total} reviews</div>
                        </div>`;
                }

                if (distContainer && data.stats) {
                    let distHtml = '';
                    const totalSafe = data.stats.total || 1;
                    for (let rating = 5; rating >= 1; rating--) {
                        const count = data.stats.distribution[rating] || 0;
                        const pct = Math.round((count / totalSafe) * 100);
                        distHtml += `
                            <div class="empire-dist-row">
                                <span class="empire-dist-label">${rating} <span style="color:var(--empire-primary);">★</span></span>
                                <div style="flex-grow:1; display:flex; align-items:center;">
                                    <svg width="100%" height="12" style="border-radius:99px;" preserveAspectRatio="none">
                                        <rect width="100%" height="12" fill="#f1f5f9" rx="6" />
                                        <rect width="${pct}%" height="12" fill="var(--empire-primary)" rx="6" />
                                    </svg>
                                </div>
                                <span class="empire-dist-count">${count}</span>
                            </div>
                        `;
                    }
                    distContainer.innerHTML = distHtml;
                }

                if (reviewsGrid) {
                    reviewsGrid.classList.remove('empire-loading');
                    reviewsGrid.innerHTML = data.reviews.map(rev => this.createReviewCardHtml(rev)).join('');
                    
                    widgetState[widgetId].hasMore = data.pagination?.hasMore ?? false;
                    widgetState[widgetId].isLoading = false;

                    const summaryCol = widget.querySelector('.empire-summary-col');
                    const reviewsCol = widget.querySelector('.empire-reviews-col');

                    if (summaryCol && reviewsCol) {
                        if (window.innerWidth <= 900 && !widget.querySelector('.empire-mobile-reviews-toggle')) {
                            reviewsCol.classList.add('empire-mobile-hidden');
                            const toggleBtn = document.createElement('button');
                            toggleBtn.className = 'empire-mobile-reviews-toggle';
                            toggleBtn.innerText = 'See all reviews here ↓';
                            summaryCol.appendChild(toggleBtn);

                            toggleBtn.addEventListener('click', () => {
                                if (reviewsCol.classList.contains('empire-mobile-hidden')) {
                                    reviewsCol.classList.remove('empire-mobile-hidden');
                                    toggleBtn.innerText = 'Hide reviews ↑';
                                } else {
                                    reviewsCol.classList.add('empire-mobile-hidden');
                                    toggleBtn.innerText = 'See all reviews here ↓';
                                }
                            });
                        }

                        let isHovered = false;
                        reviewsCol.addEventListener('mouseenter', () => isHovered = true);
                        reviewsCol.addEventListener('mouseleave', () => isHovered = false);
                        reviewsCol.addEventListener('touchstart', () => isHovered = true, {passive: true});
                        reviewsCol.addEventListener('touchend', () => {
                            setTimeout(() => isHovered = false, 2000);
                        }, {passive: true});

                        setInterval(() => {
                            if (!isHovered && reviewsCol.scrollHeight > reviewsCol.clientHeight) {
                                reviewsCol.scrollTop += 1;
                                if (!widgetState[widgetId].hasMore && reviewsCol.scrollTop + reviewsCol.clientHeight >= reviewsCol.scrollHeight - 2) {
                                    reviewsCol.scrollTop = 0;
                                }
                            }
                            if (summaryCol && summaryCol.offsetHeight > 0) {
                                if (window.innerWidth > 900) {
                                    reviewsCol.style.maxHeight = summaryCol.offsetHeight + 'px';
                                } else {
                                    reviewsCol.style.maxHeight = 'none';
                                }
                            }
                        }, 40);
                    }

                    if (loadMoreTrigger && widgetState[widgetId].hasMore) {
                        const observer = new IntersectionObserver(async (entries) => {
                            if (entries[0].isIntersecting && !widgetState[widgetId].isLoading && widgetState[widgetId].hasMore) {
                                widgetState[widgetId].isLoading = true;
                                widgetState[widgetId].page += 1;
                                loadMoreTrigger.innerHTML = '<div class="empire-spinner"></div> Loading...';
                                
                                const nextData = await this.fetchReviewsData(productId, shopDomain, widgetState[widgetId].page);
                                if (nextData && nextData.reviews && nextData.reviews.length > 0) {
                                    reviewsGrid.insertAdjacentHTML('beforeend', nextData.reviews.map(r => this.createReviewCardHtml(r)).join(''));
                                    widgetState[widgetId].hasMore = nextData.pagination?.hasMore ?? false;
                                } else {
                                    widgetState[widgetId].hasMore = false;
                                }
                                
                                if (!widgetState[widgetId].hasMore) {
                                    loadMoreTrigger.innerHTML = '';
                                    observer.disconnect();
                                } else {
                                    loadMoreTrigger.innerHTML = '';
                                }
                                widgetState[widgetId].isLoading = false;
                            }
                        }, { root: widget.querySelector('.empire-reviews-col'), rootMargin: '200px' });
                        observer.observe(loadMoreTrigger);
                    }
                }
            }
        },

        createReviewCardHtml(review) {
            const dateStr = new Date(review.createdAt).toLocaleDateString();
            const title = this.escapeHtml(review.title || '');
            const body = this.escapeHtml(review.body || '');
            const author = this.escapeHtml(review.customerName || 'Anonymous');

            let mediaHtml = '';
            if (review.media && review.media.length > 0) {
                mediaHtml = '<div class="empire-review-gallery">';
                review.media.forEach(m => {
                    mediaHtml += `<img src="${m.url}" class="empire-gallery-img" alt="Review Photo" loading="lazy" onclick="window.open('${m.url}', '_blank')" />`;
                });
                mediaHtml += '</div>';
            }

            let replyHtml = '';
            if (review.replies && review.replies.length > 0) {
                replyHtml = `
                    <details class="empire-owner-reply-accordion">
                        <summary>👑 Store Owner Response</summary>
                        <div class="empire-owner-reply-content">
                            ${this.escapeHtml(review.replies[0].body)}
                        </div>
                    </details>`;
            }

            const verifiedBadge = review.verified ? `
                <span class="empire-verified-badge">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.403 12.652a3 3 0 000-5.304 3 3 0 00-3.75-3.751 3 3 0 00-5.305 0 3 3 0 00-3.751 3.75 3 3 0 000 5.305 3 3 0 003.75 3.751 3 3 0 005.305 0 3 3 0 003.751-3.75zm-2.546-4.46a.75.75 0 00-1.214-.883l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clip-rule="evenodd" /></svg>
                    Verified Buyer
                </span>` : '';

            return `
                <div class="empire-review-card empire-animate-in">
                    <div class="empire-card-header">
                        <div class="empire-card-header-left">
                            <div style="display:flex; align-items:center; gap: 10px;">
                                <div class="empire-avatar">${author.charAt(0).toUpperCase()}</div>
                                <div class="empire-header-text">
                                    <span class="empire-reviewer-name" style="font-size:0.95rem;">${author}</span>
                                    <span class="empire-review-date" style="font-size:0.75rem;">${dateStr}</span>
                                </div>
                            </div>
                        </div>
                        <div class="empire-header-right" style="display:flex; flex-direction:column; align-items:flex-end; gap:6px;">
                            <div class="empire-stars-wrap" style="font-size:16px;">${this.getStarsHtml(review.rating)}</div>
                            ${verifiedBadge}
                        </div>
                    </div>
                    ${title ? `<h4 class="empire-review-title">${title}</h4>` : ''}
                    <p class="empire-review-body">${body}</p>
                    ${mediaHtml}
                    ${replyHtml}
                </div>`;
        },

        // --- CAROUSEL LOGIC ---
        async renderReviewCarousels() {
            const carousels = document.querySelectorAll('.empire-review-carousel-section');
            if (!carousels.length) return;

            for (const section of carousels) {
                const shopDomain = section.getAttribute('data-shop-domain');
                if (!shopDomain) continue;

                const track = section.querySelector('.empire-carousel-track');
                const prevBtn = section.querySelector('.empire-carousel-prev');
                const nextBtn = section.querySelector('.empire-carousel-next');
                const dotsContainer = section.querySelector('.empire-carousel-dots');

                try {
                    const res = await fetch(`${API_BASE}/api/featured?shop=${shopDomain}&limit=10`);
                    if (!res.ok) throw new Error("Failed to load featured reviews");
                    const data = await res.json();

                    if (!data.reviews || data.reviews.length === 0) {
                        track.innerHTML = '<div style="width:100%; text-align:center; padding: 40px; color:#64748b;">No featured reviews found.</div>';
                        continue;
                    }

                    // Render Cards
                    track.innerHTML = data.reviews.map(rev => {
                        const dateStr = new Date(rev.createdAt).toLocaleDateString();
                        const initial = rev.customerName ? rev.customerName.charAt(0).toUpperCase() : "A";
                        // Using fixed 5 stars since the backend filters rating=5
                        const starsHtml = `<div class="empire-stars-wrap" style="color:var(--empire-carousel-primary); font-size:var(--empire-carousel-star-size, 18px); margin-bottom: 8px;">
                            <span class="empire-skeleton-star" style="margin-right: -2px;">★</span><span class="empire-skeleton-star" style="margin-right: -2px;">★</span><span class="empire-skeleton-star" style="margin-right: -2px;">★</span><span class="empire-skeleton-star" style="margin-right: -2px;">★</span><span class="empire-skeleton-star" style="margin-right: -2px;">★</span>
                        </div>`;

                        const verifiedHtml = rev.verified ? `
                        <div style="display:flex; align-items:center; gap:6px; font-weight:700; font-size:0.65rem; color:#10b981; letter-spacing:0.05em; text-transform:uppercase; margin-bottom:12px;">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#10b981" style="width:14px; height:14px;"><rect width="24" height="24" rx="4"></rect><path fill="#fff" d="M10 16.4l-4.2-4.2 1.4-1.4 2.8 2.8 7.2-7.2 1.4 1.4z"></path></svg>
                            VERIFIED BUYER
                        </div>` : '';

                        let mediaHtml = '';
                        if (rev.media && rev.media.length > 0) {
                            mediaHtml = '<div class="empire-review-gallery" style="margin-top:16px; display:flex; gap:8px;">';
                            rev.media.slice(0, 3).forEach(m => {
                                mediaHtml += `<img src="${m.url}" class="empire-gallery-img" style="width:60px; height:60px; object-fit:cover; border-radius:6px; cursor:pointer;" alt="Review Photo" loading="lazy" onclick="window.open('${m.url}', '_blank')" />`;
                            });
                            mediaHtml += '</div>';
                        }

                        return `
                        <div class="empire-carousel-card">
                            ${starsHtml}
                            <div style="display:flex; align-items:center; gap:10px; margin-bottom:4px;">
                                <div class="empire-carousel-card-avatar" style="width:36px; height:36px; margin:0; border: none; font-size:1rem; flex-shrink:0;">${initial}</div>
                                <div class="empire-carousel-card-name" style="margin:0;">${this.escapeHtml(rev.customerName)}</div>
                            </div>
                            ${verifiedHtml}
                            <div class="empire-carousel-card-text">"${this.escapeHtml(rev.body)}"</div>
                            ${mediaHtml}
                        </div>`;
                    }).join('');

                    const singleSetHtml = track.innerHTML;
                    
                    // True Infinite Loop execution: We clone the full set 3 times to allow seamless looping forward AND backward
                    track.innerHTML = singleSetHtml + singleSetHtml + singleSetHtml;

                    const originalCount = data.reviews.length;
                    const scrollAmount = 344; // card width (320px) + gap (24px)
                    const setWidth = originalCount * scrollAmount;

                    if (originalCount > 0) {
                        // We only need indicator dots for the original number of cards
                        dotsContainer.innerHTML = Array.from({length: originalCount}).map((_, i) => `<div class="empire-carousel-dot ${i === 0 ? 'active' : ''}" data-index="${i}"></div>`).join('');
                        const dots = Array.from(dotsContainer.querySelectorAll('.empire-carousel-dot'));
                        const allCards = Array.from(track.querySelectorAll('.empire-carousel-card'));

                        // Instantly jump to the middle cloned set so we can scroll infinitely immediately
                        setTimeout(() => {
                            track.scrollTo({ left: setWidth, behavior: 'instant' });
                        }, 50);

                        // Update the dots based on whichever clone comes into the center view
                        const observer = new IntersectionObserver((entries) => {
                            entries.forEach(entry => {
                                if (entry.isIntersecting) {
                                    dots.forEach(d => d.classList.remove('active'));
                                    // Math.floor modulo ensures the dot matches the correct original card index
                                    const index = allCards.indexOf(entry.target) % originalCount;
                                    if (dots[index]) dots[index].classList.add('active');
                                }
                            });
                        }, { root: track, threshold: 0.6 });

                        allCards.forEach(card => observer.observe(card));

                        // INFINITE CONTINUOUS JUMP LOGIC
                        track.addEventListener('scroll', () => {
                            // If scrolled past the last card of the Middle Set into the 3rd set, instantly snap backwards 1 full set
                            if (track.scrollLeft >= setWidth * 2 - (scrollAmount / 2)) {
                                track.scrollTo({ left: track.scrollLeft - setWidth, behavior: 'instant' });
                            } 
                            // If scrolled backwards past the first card of the Middle Set into the 1st set, instantly snap forward 1 full set
                            else if (track.scrollLeft <= (scrollAmount / 2)) {
                                track.scrollTo({ left: track.scrollLeft + setWidth, behavior: 'instant' });
                            }
                        });

                        // Standard Buttons
                        prevBtn.addEventListener('click', () => {
                            track.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
                        });
                        nextBtn.addEventListener('click', () => {
                            track.scrollBy({ left: scrollAmount, behavior: 'smooth' });
                        });

                        // Dot clicks
                        dots.forEach((dot, idx) => {
                            dot.addEventListener('click', () => {
                                // Jump directly within the current frame view
                                const currentSetStart = Math.floor(track.scrollLeft / setWidth) * setWidth;
                                track.scrollTo({ left: currentSetStart + (idx * scrollAmount), behavior: 'smooth' });
                            });
                        });

                        // Autoplay Loop Logic
                        let isHovering = false;
                        let autoScrollTimer;

                        const startAutoScroll = () => {
                            autoScrollTimer = setInterval(() => {
                                if (!isHovering) {
                                    nextBtn.click(); // No need to check ends! track event listener handles infinite teleportation!
                                }
                            }, 3500); 
                        };

                        section.addEventListener('mouseenter', () => isHovering = true);
                        section.addEventListener('mouseleave', () => isHovering = false);
                        section.addEventListener('touchstart', () => isHovering = true);
                        section.addEventListener('touchend', () => setTimeout(() => isHovering = false, 3000)); 

                        startAutoScroll();
                    }


                } catch (e) {
                    console.error("Carousel render error:", e);
                    track.innerHTML = '<div style="width:100%; text-align:center; padding: 40px; color:#ef4444;">Failed to load reviews.</div>';
                }
            }
        }
    };

    document.addEventListener("DOMContentLoaded", function() {
        const stars = document.querySelectorAll('.empire-pick-star');
        stars.forEach((star, index) => {
            star.addEventListener('mouseenter', () => {
                stars.forEach((s, idx) => {
                    const isHovered = idx <= index;
                    s.classList.toggle('hover-active', isHovered);
                    s.style.color = isHovered ? 'var(--empire-primary)' : '#e2e8f0';
                });
            });
            star.addEventListener('mouseleave', () => {
                stars.forEach(s => {
                    s.classList.remove('hover-active');
                    s.style.color = s.classList.contains('active') ? 'var(--empire-primary)' : '#e2e8f0';
                });
            });
        });
    });

    return API;
})();

window.EmpireWidgets = EmpireWidgets;
window.EmpireWidgets.init();
