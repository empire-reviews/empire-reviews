"use strict";

const EmpireWidgets = (function() {
    const API_BASE = "https://empire-reviews.vercel.app";
    let activeProductId = null;
    let activeShopDomain = null;
    let currentRatingSelected = 0;
    let pendingUploads = 0; // tracks in-progress Cloudinary uploads
    const widgetState = {}; // Store pagination state for multiple widgets

    // ─── i18n ────────────────────────────────────────────────────────────────
    // Storefront widget translations. Language is driven by the merchant's
    // Settings.language (delivered via the API response → setLang), with a
    // fallback to Shopify's storefront locale, then English. Unknown keys/langs
    // fall back to English so a missing translation never renders blank.
    let currentLang = "en";
    const I18N = {
        en: {
            verified_buyer: "Verified Buyer", write_review: "Write a Review",
            no_reviews_yet: "No reviews yet", be_first: "Be the first to review!",
            out_of_5: "out of 5", based_on: "based on", reviews: "reviews",
            submitting: "Submitting...", submit_review: "Submit Review",
            add_photos: "Add Photos", remove: "Remove", load_more: "Load More",
            your_name: "Your name", write_here: "Write your review here...",
            review_live: "Your review is now visible to everyone. Thank you!",
            review_pending: "Thank you! Your review has been submitted for approval.",
            failed_submit: "Failed to submit review. Please try again.",
            questions: "Questions", ask_question: "Ask a Question",
            no_questions: "No questions yet — be the first to ask!",
            your_question: "Type your question...", post_question: "Post Question",
            answer: "Answer", question_pending: "Thanks! Your question was submitted for review.",
        },
        es: {
            verified_buyer: "Comprador Verificado", write_review: "Escribir una reseña",
            no_reviews_yet: "Aún no hay reseñas", be_first: "¡Sé el primero en opinar!",
            out_of_5: "de 5", based_on: "basado en", reviews: "reseñas",
            submitting: "Enviando...", submit_review: "Enviar reseña",
            add_photos: "Añadir fotos", remove: "Quitar", load_more: "Cargar más",
            your_name: "Tu nombre", write_here: "Escribe tu reseña aquí...",
            review_live: "Tu reseña ya es visible para todos. ¡Gracias!",
            review_pending: "¡Gracias! Tu reseña fue enviada para aprobación.",
            failed_submit: "No se pudo enviar la reseña. Inténtalo de nuevo.",
            questions: "Preguntas", ask_question: "Hacer una pregunta",
            no_questions: "Aún no hay preguntas — ¡sé el primero!",
            your_question: "Escribe tu pregunta...", post_question: "Publicar pregunta",
            answer: "Respuesta", question_pending: "¡Gracias! Tu pregunta fue enviada para revisión.",
        },
        fr: {
            verified_buyer: "Acheteur Vérifié", write_review: "Écrire un avis",
            no_reviews_yet: "Pas encore d'avis", be_first: "Soyez le premier à donner votre avis !",
            out_of_5: "sur 5", based_on: "basé sur", reviews: "avis",
            submitting: "Envoi...", submit_review: "Envoyer l'avis",
            add_photos: "Ajouter des photos", remove: "Retirer", load_more: "Voir plus",
            your_name: "Votre nom", write_here: "Écrivez votre avis ici...",
            review_live: "Votre avis est maintenant visible par tous. Merci !",
            review_pending: "Merci ! Votre avis a été soumis pour approbation.",
            failed_submit: "Échec de l'envoi de l'avis. Veuillez réessayer.",
            questions: "Questions", ask_question: "Poser une question",
            no_questions: "Aucune question pour l'instant — soyez le premier !",
            your_question: "Saisissez votre question...", post_question: "Publier la question",
            answer: "Réponse", question_pending: "Merci ! Votre question a été soumise pour révision.",
        },
        de: {
            verified_buyer: "Verifizierter Käufer", write_review: "Bewertung schreiben",
            no_reviews_yet: "Noch keine Bewertungen", be_first: "Schreibe die erste Bewertung!",
            out_of_5: "von 5", based_on: "basierend auf", reviews: "Bewertungen",
            submitting: "Senden...", submit_review: "Bewertung absenden",
            add_photos: "Fotos hinzufügen", remove: "Entfernen", load_more: "Mehr laden",
            your_name: "Dein Name", write_here: "Schreibe deine Bewertung hier...",
            review_live: "Deine Bewertung ist jetzt für alle sichtbar. Danke!",
            review_pending: "Danke! Deine Bewertung wurde zur Freigabe eingereicht.",
            failed_submit: "Bewertung konnte nicht gesendet werden. Bitte erneut versuchen.",
            questions: "Fragen", ask_question: "Frage stellen",
            no_questions: "Noch keine Fragen — sei der Erste!",
            your_question: "Gib deine Frage ein...", post_question: "Frage senden",
            answer: "Antwort", question_pending: "Danke! Deine Frage wurde zur Prüfung eingereicht.",
        },
        pt: {
            verified_buyer: "Comprador Verificado", write_review: "Escrever avaliação",
            no_reviews_yet: "Ainda sem avaliações", be_first: "Seja o primeiro a avaliar!",
            out_of_5: "de 5", based_on: "com base em", reviews: "avaliações",
            submitting: "Enviando...", submit_review: "Enviar avaliação",
            add_photos: "Adicionar fotos", remove: "Remover", load_more: "Carregar mais",
            your_name: "Seu nome", write_here: "Escreva sua avaliação aqui...",
            review_live: "Sua avaliação já está visível para todos. Obrigado!",
            review_pending: "Obrigado! Sua avaliação foi enviada para aprovação.",
            failed_submit: "Falha ao enviar avaliação. Tente novamente.",
            questions: "Perguntas", ask_question: "Fazer uma pergunta",
            no_questions: "Ainda sem perguntas — seja o primeiro!",
            your_question: "Digite sua pergunta...", post_question: "Publicar pergunta",
            answer: "Resposta", question_pending: "Obrigado! Sua pergunta foi enviada para revisão.",
        },
        it: {
            verified_buyer: "Acquirente Verificato", write_review: "Scrivi una recensione",
            no_reviews_yet: "Ancora nessuna recensione", be_first: "Sii il primo a recensire!",
            out_of_5: "su 5", based_on: "basato su", reviews: "recensioni",
            submitting: "Invio...", submit_review: "Invia recensione",
            add_photos: "Aggiungi foto", remove: "Rimuovi", load_more: "Carica altro",
            your_name: "Il tuo nome", write_here: "Scrivi qui la tua recensione...",
            review_live: "La tua recensione è ora visibile a tutti. Grazie!",
            review_pending: "Grazie! La tua recensione è stata inviata per l'approvazione.",
            failed_submit: "Invio della recensione non riuscito. Riprova.",
            questions: "Domande", ask_question: "Fai una domanda",
            no_questions: "Ancora nessuna domanda — sii il primo!",
            your_question: "Scrivi la tua domanda...", post_question: "Pubblica domanda",
            answer: "Risposta", question_pending: "Grazie! La tua domanda è stata inviata per la revisione.",
        },
    };
    function setLang(lang) {
        if (lang && I18N[lang]) { currentLang = lang; return; }
        // Fallback: try the base of a regional Shopify locale (e.g. "fr-CA" → "fr")
        const base = (lang || "").split("-")[0];
        if (base && I18N[base]) currentLang = base;
    }
    function t(key) {
        const table = I18N[currentLang] || I18N.en;
        return table[key] || I18N.en[key] || key;
    }

    // Always returns the best available shop domain. Tries in order:
    // 1. Value captured when the modal was opened (set from data-shop-domain attr)
    // 2. Shopify's own global (always present on live storefronts)
    // 3. Injected by review-list.liquid at page load
    function resolveShop() {
        return activeShopDomain
            || (window.Shopify && window.Shopify.shop)
            || window.EmpireShopDomain
            || '';
    }

    // Cached product id for the current page once resolved (sync or async).
    let pageProductId = '';

    // Resolve a product's numeric id synchronously. The Liquid `data-product-id`
    // attribute can render empty when the block isn't inside a product-section
    // context, which would make the API fall back to SHOP-WIDE stats. Fall back
    // to Shopify's storefront product meta, then to a cached async lookup.
    function resolveProductId(el) {
        let pid = el && el.getAttribute('data-product-id');
        if (pid) pid = pid.trim();
        if (pid && pid !== '' && pid.indexOf('{{') === -1) return pid;
        try {
            if (window.ShopifyAnalytics && window.ShopifyAnalytics.meta && window.ShopifyAnalytics.meta.product) {
                return String(window.ShopifyAnalytics.meta.product.id);
            }
            if (window.meta && window.meta.product && window.meta.product.id) {
                return String(window.meta.product.id);
            }
        } catch (e) {}
        return pageProductId || '';
    }

    // Bulletproof last resort: on any product URL, ask Shopify's storefront
    // product JSON endpoint for the numeric id. Works regardless of theme,
    // Liquid context, or analytics globals. Caches the result for the page.
    async function resolveProductIdFromUrl() {
        if (pageProductId) return pageProductId;
        try {
            const m = window.location.pathname.match(/\/products\/([^/?#]+)/);
            if (!m) return '';
            const res = await fetch('/products/' + m[1] + '.js', { headers: { 'Accept': 'application/json' } });
            if (!res.ok) return '';
            const p = await res.json();
            if (p && p.id) { pageProductId = String(p.id); return pageProductId; }
        } catch (e) {}
        return '';
    }

    const API = {
        init() {
            setTimeout(() => {
                this.renderStarRatings();
                this.renderReviewLists();
                this.renderReviewCarousels();
                this.renderPhotoGalleries();
            }, 100);
        },

        openReviewModal(triggerElement) {
            activeProductId = resolveProductId(triggerElement);
            activeShopDomain = triggerElement.getAttribute('data-shop-domain')
                || (window.Shopify && window.Shopify.shop)
                || window.EmpireShopDomain
                || null;
            currentRatingSelected = 0;
            pendingUploads = 0;

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
                    // Hybrid: photos on every plan; video only when the backend unlocks it (Pro).
                    var allowVideo = window.EmpireFeatures.allowVideoUploads === true;
                    var acceptTypes = allowVideo
                        ? "image/png, image/jpeg, image/webp, video/mp4, video/quicktime, video/webm"
                        : "image/png, image/jpeg, image/webp";
                    var helperText = allowVideo ? "Photos & video • up to 4 files" : "Max 4 photos, 10MB each";
                    uploadContainer.innerHTML = `
                        <div class="empire-photo-dropzone" id="empire-photo-dropzone">
                            <div class="empire-dropzone-clicker" id="empire-dropzone-clicker">
                                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                                <div style="font-size:0.95rem; font-weight:700; color:#6d28d9;">Add Photos${allowVideo ? ' or Video' : ''}</div>
                                <div style="font-size:0.78rem; color:#a78bfa; margin-top:1px;">${helperText}</div>
                            </div>
                            <div class="empire-photo-previews" id="empire-photo-previews"></div>
                            <input type="file" id="empire-photo-input" accept="${acceptTypes}" multiple style="display:none;" />
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
                el.style.color = isActive ? '#f59e0b' : '#e2e8f0';
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

            const showError = (msg) => {
                let errEl = document.getElementById('empire-form-error');
                if (!errEl) {
                    errEl = document.createElement('div');
                    errEl.id = 'empire-form-error';
                    errEl.style.color = '#ef4444';
                    errEl.style.fontSize = '0.85rem';
                    errEl.style.marginBottom = '12px';
                    errEl.style.textAlign = 'center';
                    errEl.style.background = 'rgba(239, 68, 68, 0.1)';
                    errEl.style.padding = '8px';
                    errEl.style.borderRadius = '6px';
                    const btn = document.getElementById('empire-submit-btn');
                    if (btn && btn.parentNode) btn.parentNode.insertBefore(errEl, btn);
                }
                errEl.innerText = msg;
                errEl.style.display = 'block';
            };

            const hideError = () => {
                const errEl = document.getElementById('empire-form-error');
                if (errEl) errEl.style.display = 'none';
            };

            hideError();

            if (currentRatingSelected === 0) {
                showError("Please select a star rating first.");
                return;
            }

            if (pendingUploads > 0) {
                showError("Please wait — your photo is still uploading.");
                return;
            }

            const submitBtn = document.getElementById('empire-submit-btn');
            if (!submitBtn) return;

            const shop = resolveShop();
            if (!shop) {
                showError("Could not detect your store. Please refresh the page and try again.");
                return;
            }

            const originalText = submitBtn.innerText;
            submitBtn.innerText = t("submitting");
            submitBtn.disabled = true;

            try {
                const formData = new FormData();
                const nameInput = document.getElementById('empire-input-name');
                const bodyInput = document.getElementById('empire-input-body');

                formData.append('productId', activeProductId || '');
                formData.append('shop', shop);
                formData.append('rating', currentRatingSelected.toString());

                if (nameInput && nameInput.value) formData.append('author', nameInput.value);
                if (bodyInput && bodyInput.value) formData.append('body', bodyInput.value);

                if (window.EmpireUploadedPhotos && window.EmpireUploadedPhotos.length > 0) {
                    formData.append('media_urls', JSON.stringify(window.EmpireUploadedPhotos));
                }

                const response = await fetch(`${API_BASE}/api/reviews?shop=${encodeURIComponent(shop)}`, {
                    method: 'POST',
                    body: formData
                });

                if (response.ok) {
                    const resData = await response.json().catch(() => ({}));
                    const isLive = resData.review?.status === 'approved';

                    submitBtn.innerText = "Sent!";
                    const formFields = document.getElementById('empire-review-fields');
                    const label = document.getElementById('empire-star-label');
                    const picker = document.getElementById('empire-star-picker');
                    const successMsg = document.getElementById('empire-modal-success');
                    const modalIcon = document.getElementById('empire-modal-icon-el');
                    const modalTitle = document.getElementById('empire-modal-title-el');
                    const modalSub = document.getElementById('empire-modal-sub-el');

                    if (formFields) formFields.style.display = 'none';
                    if (label) label.style.display = 'none';
                    if (picker) picker.style.display = 'none';

                    if (successMsg) {
                        successMsg.innerHTML = isLive
                            ? `<div class="empire-success-burst">🌟</div>
                               <h3 class="empire-success-title">You're live!</h3>
                               <p class="empire-success-sub">${t("review_live")} 💜</p>`
                            : `<div class="empire-success-burst">🎉</div>
                               <h3 class="empire-success-title">Review received!</h3>
                               <p class="empire-success-sub">We'll share your experience with the world very soon. Thank you! 💜</p>`;
                        successMsg.style.display = 'flex';
                    }

                    // Dim the header so success state feels full-screen
                    if (modalIcon) modalIcon.style.opacity = '0';
                    if (modalTitle) modalTitle.style.opacity = '0';
                    if (modalSub) modalSub.style.opacity = '0';

                    setTimeout(() => {
                        this.closeModal();
                        submitBtn.innerText = originalText;
                        submitBtn.disabled = false;
                        if (label) label.style.display = 'block';
                        if (picker) picker.style.display = 'flex';
                        if (modalIcon) modalIcon.style.opacity = '1';
                        if (modalTitle) modalTitle.style.opacity = '1';
                        if (modalSub) modalSub.style.opacity = '1';
                        if (successMsg) successMsg.style.display = 'none';
                    }, 3000);
                } else {
                    const resData = await response.json().catch(() => ({}));
                    throw new Error(resData.error || "Server error");
                }
            } catch (error) {
                showError(error.message || "Failed to submit review. Please try again.");
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
                const isVideoFile = file.type.startsWith('video/');

                const prev = document.createElement('div');
                prev.className = 'empire-photo-preview-item';
                const previewMediaTag = isVideoFile
                    ? `<video src="${localUrl}" class="empire-photo-preview-img" muted playsinline style="opacity:0.5; object-fit:cover; width:100%; height:100%;"></video>`
                    : `<img src="${localUrl}" class="empire-photo-preview-img" style="opacity: 0.5;" />`;
                prev.innerHTML = `
                    <div class="empire-uploading-shimmer" style="position: absolute; inset:0; background: rgba(255,255,255,0.5); display: flex; align-items:center; justify-content:center;"><div class="empire-spinner" style="width:16px; height:16px; border-width:2px;"></div></div>
                    ${previewMediaTag}
                    <button class="empire-photo-remove" disabled>✕</button>
                `;
                previewsContainer.appendChild(prev);

                pendingUploads++;
                try {
                    const shopForUpload = resolveShop();
                    if (!shopForUpload) throw new Error("Store not detected — please refresh the page.");

                    // 1. Ask our server for a short-lived signed upload signature.
                    const signRes = await fetch(`${API_BASE}/api/upload-sign?shop=${encodeURIComponent(shopForUpload)}${isVideoFile ? '&type=video' : ''}`, {
                        method: 'POST',
                    });
                    const sign = await signRes.json();
                    if (!signRes.ok) throw new Error(sign.error || "Upload not permitted");

                    // 2. Upload directly to Cloudinary using the signed params.
                    const uploadData = new FormData();
                    uploadData.append('file', file);
                    uploadData.append('api_key', sign.apiKey);
                    uploadData.append('timestamp', String(sign.timestamp));
                    uploadData.append('signature', sign.signature);
                    uploadData.append('folder', sign.folder);

                    const response = await fetch(`https://api.cloudinary.com/v1_1/${sign.cloudName}/${isVideoFile ? 'video' : 'image'}/upload`, {
                        method: 'POST',
                        body: uploadData
                    });

                    const data = await response.json();
                    if (!response.ok) throw new Error(data.error?.message || "Cloudinary upload failed");

                    if (data.secure_url) {
                        const secureUrl = data.secure_url;
                        window.EmpireUploadedPhotos.push(secureUrl);

                        // Update UI to success state
                        const shimmer = prev.querySelector('.empire-uploading-shimmer');
                        if (shimmer) shimmer.style.display = 'none';
                        const mediaEl = prev.querySelector('img, video');
                        if (mediaEl) mediaEl.style.opacity = '1';

                        const rmBtn = prev.querySelector('.empire-photo-remove');
                        if (rmBtn) {
                            rmBtn.disabled = false;
                            rmBtn.onclick = function() {
                                EmpireWidgets.removePhoto(secureUrl, prev);
                            };
                        }
                    }
                } catch (err) {
                    console.error("Upload failed:", err);
                    // Show the real error message persistently so the user knows
                    // the photo was NOT attached. They can remove it and try again.
                    prev.innerHTML = `
                        <div style="font-size:10px; color:#ef4444; background:#fef2f2; border:1px solid #fca5a5; padding:6px; text-align:center; position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; border-radius:4px;">
                            <div style="font-weight:600; margin-bottom:2px;">Upload failed</div>
                            <div style="opacity:0.8;">${(err.message || 'Try again').substring(0, 60)}</div>
                            <button onclick="this.closest('.empire-photo-preview-item').remove(); window.EmpireUploadedPhotos = (window.EmpireUploadedPhotos||[]);" style="margin-top:4px; font-size:10px; cursor:pointer; background:none; border:1px solid #ef4444; color:#ef4444; border-radius:3px; padding:2px 6px;">${t("remove")}</button>
                        </div>`;
                } finally {
                    pendingUploads = Math.max(0, pendingUploads - 1);
                }
            }
        },

        removePhoto(url, element) {
            window.EmpireUploadedPhotos = window.EmpireUploadedPhotos.filter(u => u !== url);
            if (element) element.remove();
        },

        escapeHtml(unsanitized) {
            if (!unsanitized) return "";
            // Escape for both text and double-quoted attribute contexts.
            // The textContent trick only covers < > & — we must also escape
            // " and ' so values interpolated into quoted attributes (e.g.
            // data-name, alt, aria-label in the photo gallery) cannot break out.
            return String(unsanitized)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        },

        getStarsHtml(rating) {
            let stars = '';
            for (let i = 1; i <= 5; i++) {
                if (i <= rating) {
                    stars += '<span class="empire-skeleton-star">\u2605</span>';
                } else {
                    stars += '<span class="empire-star-empty">\u2605</span>';
                }
            }
            return `<div class="empire-stars-inner">${stars}</div>`;
        },

        async fetchReviewsData(productId, shopDomain, page = 1) {
            if (!shopDomain) return null;
            let url = `${API_BASE}/api/reviews?shop=${shopDomain}&page=${page}&limit=10`;
            if (productId && productId.trim() !== '') {
                const pureId = productId.replace('gid://shopify/Product/', '');
                url += `&productId=${pureId}`;
            }
            try {
                const res = await fetch(url);
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
                let productId = resolveProductId(wrapper);
                if (!productId) productId = await resolveProductIdFromUrl();
                const shopDomain = wrapper.getAttribute('data-shop-domain');
                if (!shopDomain) continue;

                const data = await this.fetchReviewsData(productId, shopDomain, 1);
                
                if (!data || !data.stats || data.stats.total === 0) {
                    wrapper.innerHTML = `<span class="empire-rating-text">${t("no_reviews_yet")}</span>`;
                    continue;
                }

                wrapper.innerHTML = `
                    <div style="display: flex; flex-direction: column; gap: 4px;">
                        <div style="display: flex; align-items: center; flex-wrap: wrap; gap: 4px;">
                            <div class="empire-stars-wrap">${this.getStarsHtml(Math.round(data.stats.average))}</div>
                            <span class="empire-rating-text">${data.stats.average.toFixed(2)} ${t("out_of_5")}</span>
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
            const widgets = document.querySelectorAll('.empire-reviews-widget');
            if (!widgets.length) return;

            for (const widget of widgets) {
                // Scope control: 'auto' (product page → product, else store),
                // 'product' (force this product), 'store' (force whole store).
                const scope = widget.getAttribute('data-review-scope') || 'auto';
                let productId = (scope === 'store') ? '' : resolveProductId(widget);
                if (!productId && scope !== 'store') productId = await resolveProductIdFromUrl();
                const shopDomain = widget.getAttribute('data-shop-domain');
                const widgetId = widget.id || 'widget_' + Math.floor(Math.random() * 100000);
                
                if (!shopDomain) continue;
                
                widgetState[widgetId] = { page: 1, hasMore: true, isLoading: true, statsLoaded: false };

                const data = await this.fetchReviewsData(productId, shopDomain, 1);
                
                // Store global features block so modal can read it later
                if (data && data.features) {
                    window.EmpireFeatures = data.features;
                }

                // Apply merchant's configured widget language (falls back to
                // Shopify storefront locale, then English).
                if (data && data.settings && data.settings.language) {
                    setLang(data.settings.language);
                } else if (window.Shopify && window.Shopify.locale) {
                    setLang(window.Shopify.locale);
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
                                <h3>${t("be_first")}</h3>
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
                    const safeUrl = this.escapeHtml(m.url || '');
                    const isVideo = m.type === 'video'
                        || /\/video\//.test(safeUrl)
                        || /\.(mp4|mov|webm|m4v)(\?|$)/i.test(safeUrl);
                    if (isVideo) {
                        mediaHtml += `<video src="${safeUrl}" class="empire-gallery-video" controls playsinline preload="metadata" style="max-width:280px; width:100%; border-radius:10px; margin-top:4px; display:block;"></video>`;
                    } else {
                        mediaHtml += `<img src="${safeUrl}" class="empire-gallery-img" alt="Customer photo" loading="lazy" data-open-url="${safeUrl}" />`;
                    }
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
                    ${t("verified_buyer")}
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
                            <div class="empire-stars-wrap" style="--star-size:28px;">${this.getStarsHtml(review.rating)}</div>
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

                const rawProductId = (section.getAttribute('data-product-id') || '').trim().replace('gid://shopify/Product/', '');
                const carouselUrl = rawProductId
                    ? `${API_BASE}/api/reviews?shop=${shopDomain}&productId=${rawProductId}&limit=10`
                    : `${API_BASE}/api/featured?shop=${shopDomain}&limit=10`;

                try {
                    const res = await fetch(carouselUrl);
                    if (!res.ok) throw new Error("Failed to load featured reviews");
                    const data = await res.json();

                    if (!data.reviews || data.reviews.length === 0) {
                        section.style.display = 'none'; // Gracefully hide instead of showing empty text
                        continue;
                    }

                    // Render Cards
                    track.innerHTML = data.reviews.map(rev => {
                        const dateStr = new Date(rev.createdAt).toLocaleDateString();
                        const initial = rev.customerName ? rev.customerName.charAt(0).toUpperCase() : "A";
                        // Using fixed 5 stars since the backend filters rating=5
                        const starsHtml = `<div class="empire-stars-wrap" style="color:var(--empire-carousel-primary); font-size:var(--empire-carousel-star-size, 18px); margin-bottom: 0px;">
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
                                const safeUrl = EmpireWidgets.escapeHtml(m.url || '');
                                mediaHtml += `<img src="${safeUrl}" class="empire-gallery-img" style="width:60px; height:60px; object-fit:cover; border-radius:6px; cursor:pointer;" alt="Review Photo" loading="lazy" data-open-url="${safeUrl}" />`;
                            });
                            mediaHtml += '</div>';
                        }

                        return `
                        <div class="empire-carousel-card">
                            ${starsHtml}
                            <div style="display:flex; align-items:center; gap:10px; margin-bottom:4px; margin-top:2px;">
                                <div class="empire-carousel-card-avatar" style="width:40px; height:40px; margin:0; border: none; font-size:1.35rem; flex-shrink:0;">${initial}</div>
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
                    section.style.display = 'none'; // Gracefully hide instead of red error text
                }
            }
        },

        // --- PHOTO GALLERY LOGIC ---
        async renderPhotoGalleries() {
            const sections = document.querySelectorAll('.empire-photo-gallery-section');
            if (!sections.length) return;

            // Inject shared lightbox into body once
            if (!document.getElementById('empire-photo-lightbox')) {
                const lb = document.createElement('div');
                lb.id = 'empire-photo-lightbox';
                lb.className = 'empire-photo-lightbox';
                lb.innerHTML = `
                    <button class="empire-photo-lightbox-close" id="empire-lb-close" aria-label="Close">&times;</button>
                    <img class="empire-photo-lightbox-img" id="empire-lb-img" src="" alt="Customer Photo" />
                    <div class="empire-photo-lightbox-meta" id="empire-lb-meta"></div>
                `;
                document.body.appendChild(lb);

                // Close on button click
                document.getElementById('empire-lb-close').addEventListener('click', () => {
                    lb.classList.remove('open');
                    document.body.style.overflow = '';
                });
                // Close on backdrop click
                lb.addEventListener('click', (e) => {
                    if (e.target === lb) {
                        lb.classList.remove('open');
                        document.body.style.overflow = '';
                    }
                });
                // Close on Escape key
                document.addEventListener('keydown', (e) => {
                    if (e.key === 'Escape') {
                        lb.classList.remove('open');
                        document.body.style.overflow = '';
                    }
                });
            }

            for (const section of sections) {
                const shopDomain = section.getAttribute('data-shop-domain');
                const productId = section.getAttribute('data-product-id');
                const limit = section.getAttribute('data-limit') || '30';
                const gridId = section.querySelector('.empire-photo-masonry-grid')?.id;
                const emptyId = section.querySelector('.empire-gallery-empty')?.id;
                
                if (!shopDomain || !gridId) continue;
                
                const grid = document.getElementById(gridId);
                const emptyEl = emptyId ? document.getElementById(emptyId) : null;
                
                try {
                    let apiUrl = `${API_BASE}/api/photos?shop=${shopDomain}&limit=${limit}`;
                    if (productId && productId.trim() !== '') apiUrl += `&productId=${productId}`;

                    const res = await fetch(apiUrl);
                    if (!res.ok) throw new Error('Failed to load photos');
                    const data = await res.json();

                    if (!data.photos || data.photos.length === 0) {
                        grid.innerHTML = '';
                        if (emptyEl) emptyEl.style.display = 'block';
                        continue;
                    }

                    grid.innerHTML = data.photos.map(photo => {
                        const name = this.escapeHtml(photo.customerName || 'Anonymous');
                        const rating = parseInt(photo.rating) || 5;
                        const starLabel = '★'.repeat(rating) + ' ' + rating + '.0';
                        return `
                        <div class="empire-gallery-tile"
                            data-url="${this.escapeHtml(photo.url)}"
                            data-name="${name}"
                            data-rating="${rating}"
                            data-body="${this.escapeHtml((photo.body || '').substring(0, 120))}"
                            role="button"
                            tabindex="0"
                            aria-label="View photo by ${name}"
                        >
                            <img src="${this.escapeHtml(photo.url)}" alt="Review photo by ${name}" loading="lazy" />
                            <div class="empire-gallery-tile-badge">
                                <span class="empire-gallery-tile-name">${name}</span>
                                <span class="empire-gallery-tile-stars">${starLabel}</span>
                            </div>
                        </div>`;
                    }).join('');

                    // Attach lightbox events
                    grid.querySelectorAll('.empire-gallery-tile').forEach(tile => {
                        const openLb = () => {
                            const lb = document.getElementById('empire-photo-lightbox');
                            const img = document.getElementById('empire-lb-img');
                            const meta = document.getElementById('empire-lb-meta');
                            img.src = tile.getAttribute('data-url');
                            const name = tile.getAttribute('data-name');
                            const rating = parseInt(tile.getAttribute('data-rating'));
                            const stars = '★'.repeat(rating) + '☆'.repeat(5 - rating);
                            meta.innerHTML = `<span class="empire-photo-lightbox-stars">${stars}</span><span>${this.escapeHtml(name)}</span>`;
                            lb.classList.add('open');
                            document.body.style.overflow = 'hidden';
                        };
                        tile.addEventListener('click', openLb);
                        tile.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') openLb(); });
                    });

                } catch (err) {
                    console.error('[Empire] Photo gallery error:', err);
                    grid.innerHTML = '<div style="text-align:center; padding:40px; color:#ef4444;">Failed to load photos.</div>';
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
                    s.style.color = isHovered ? '#f59e0b' : '#e2e8f0';
                });
            });
            star.addEventListener('mouseleave', () => {
                stars.forEach(s => {
                    s.classList.remove('hover-active');
                    s.style.color = s.classList.contains('active') ? '#f59e0b' : '#e2e8f0';
                });
            });
        });
    });

    // Delegated handler for gallery images (replaces inline onclick)
    document.addEventListener('click', function(e) {
        const target = /** @type {HTMLElement} */ (e.target);
        if (target && target.dataset && target.dataset.openUrl) {
            const url = target.dataset.openUrl;
            // Only open https:// URLs
            if (url.startsWith('https://')) {
                window.open(url, '_blank', 'noopener,noreferrer');
            }
        }
    });

    return API;
})();

window.EmpireWidgets = EmpireWidgets;
window.EmpireWidgets.init();
