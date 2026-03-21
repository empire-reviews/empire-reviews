"use strict";(function(){"use strict";if(window.empireV2Initialized)return;window.empireV2Initialized=!0;function b(r,e=""){const t=(r.dataset.appUrl||window.EMPIRE_APP_URL||"https://empire-reviews.vercel.app").replace(/\/$/,""),i=r.dataset.shop||window.Shopify&&window.Shopify.shop||"";let n=`${t}/api/reviews${e?e.startsWith("?")?e:`?${e}`:""}`;return i&&!n.includes("shop=")&&(n+=`${n.includes("?")?"&":"?"}shop=${encodeURIComponent(i)}`),n}async function k(){const r=document.querySelectorAll(".empire-carousel-container");r.length&&r.forEach(async e=>{try{const t=e.querySelector(".empire-carousel-track");if(!t)return;const i=e.dataset.style||"bordered",n=e.dataset.radius||"16",p=e.dataset.bg||"#ffffff",c=e.dataset.text||"#1f2937",d=parseInt(e.dataset.desktopCols||"3"),u=parseInt(e.dataset.gap||"20"),m=e.dataset.verified!=="false",a=b(e,"?minRating=4&limit=12"),f=await fetch(a);if(!f.ok)throw new Error("API returning error");const{reviews:o}=await f.json();if(!o||!o.length){t.innerHTML=`
                        <div style="text-align:center;width:100%;padding:40px 20px;grid-column:1/-1;">
                            <p style="opacity:0.6;font-size:1.1em;margin-bottom:15px;">No reviews yet. Be the first to share your experience!</p>
                            <button onclick="if(window.empireOpenReviewForm) { window.empireOpenReviewForm(); } else { alert('Please add the Leave a Review Form block to the page first.'); }" 
                                    style="background:var(--empire-btn-bg,#111);color:var(--empire-btn-text,#fff);padding:10px 24px;border-radius:8px;font-weight:600;font-size:0.95em;cursor:pointer;border:none;box-shadow:0 4px 6px rgba(0,0,0,0.1);transition:transform 0.2s;"
                                    onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'">
                                Write a Review
                            </button>
                        </div>
                    `;return}t.style.cssText=`
                    display: grid;
                    grid-template-columns: repeat(${d}, 1fr);
                    gap: ${u}px;
                `,t.innerHTML=o.map(s=>{const l="\u2605".repeat(s.rating)+"\u2606".repeat(5-s.rating),y=s.customerName||"Anonymous",v=new Date(s.createdAt||Date.now()).toLocaleDateString(),x=s.body?s.body.length>150?s.body.substring(0,150)+"\u2026":s.body:"",w=m&&s.verified?'<span class="empire-verified-badge" style="color:#16a34a;font-size:0.75em;font-weight:600;">\u2713 Verified</span>':"";return`
                        <div class="empire-carousel-card" style="
                            background:${p}; color:${c};
                            border-radius:${n}px; padding:20px;
                            border: ${i==="bordered"?"1px solid #e5e7eb":"none"};
                            ${i==="glass"?"backdrop-filter:blur(10px);background:rgba(255,255,255,0.7);":""}
                            ${i==="dark"?"background:#1f2937;color:#f9fafb;":""}
                        ">
                            <div class="empire-card-stars" style="color:#fbbf24;margin-bottom:8px;">${l}</div>
                            <p style="margin:0 0 12px 0;line-height:1.5;font-size:0.95em;">${x}</p>
                            <div style="display:flex;align-items:center;justify-content:space-between;margin-top:auto;">
                                <span style="font-weight:600;font-size:0.85em;">${y}</span>
                                ${w}
                            </div>
                            <span style="opacity:0.5;font-size:0.75em;">${v}</span>
                        </div>
                    `}).join("")}catch(t){console.error("Carousel load failed:",t);const i=e.querySelector(".empire-carousel-track");i&&(i.innerHTML='<p style="opacity:0.5;text-align:center;width:100%;">Unable to load reviews.</p>')}})}function z(){const r=document.querySelector("#empire-floating-tab-config");if(!r)return;const e=r.dataset.position||"right",t=r.dataset.offset||"50",i=r.dataset.label||"Reviews",n=r.dataset.bg||"#111",p=r.dataset.text||"#fff",c=r.dataset.icon||"star",d=r.dataset.pulse!=="false",u=r.dataset.rating!=="false",m={star:"\u2605",heart:"\u2665",bag:"\u{1F6CD}",none:""},a=document.createElement("button");a.className="empire-floating-tab";let f=(m[c]||"")+" "+i;if(a.style.cssText=`
            position: fixed;
            ${e==="left"||e==="bottom-left"?"left: 0;":"right: 0;"}
            ${e.startsWith("bottom")?"bottom: 20px;":"top: "+t+"%;"}
            ${e.startsWith("bottom")?"":"transform: translateY(-50%) rotate("+(e==="left"?"-90":"90")+"deg); transform-origin: "+(e==="left"?"left bottom":"right bottom")+";"}
            background: ${n};
            color: ${p};
            padding: 10px 20px;
            border: none;
            border-radius: ${e.startsWith("bottom")?"8px":"0 0 8px 8px"};
            cursor: pointer;
            z-index: 9998;
            font-family: inherit;
            font-size: 0.9rem;
            font-weight: 600;
            letter-spacing: 0.5px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.15);
            transition: transform 0.2s, box-shadow 0.2s;
            ${d?"animation: empire-float-pulse 3s ease-in-out infinite;":""}
        `,a.innerHTML=f,u){const o=b(r,"?limit=1");fetch(o).then(s=>s.json()).then(s=>{s.stats&&s.stats.total>0&&(a.innerHTML=`\u2605 ${s.stats.average.toFixed(1)} ${i}`)}).catch(()=>{})}if(a.addEventListener("click",()=>{const o=document.querySelector(".empire-reviews-widget");o&&o.scrollIntoView({behavior:"smooth",block:"start"})}),a.addEventListener("mouseenter",()=>{a.style.transform+=" scale(1.05)"}),a.addEventListener("mouseleave",()=>{a.style.transform=a.style.transform.replace(" scale(1.05)","")}),document.body.appendChild(a),d&&!document.getElementById("empire-float-pulse-style")){const o=document.createElement("style");o.id="empire-float-pulse-style",o.textContent=`
                @keyframes empire-float-pulse {
                    0%, 100% { box-shadow: 0 4px 15px rgba(0,0,0,0.15); }
                    50% { box-shadow: 0 4px 25px rgba(0,0,0,0.3); }
                }
            `,document.head.appendChild(o)}}async function C(){const r=document.querySelectorAll(".empire-media-grid-container");r.length&&r.forEach(async e=>{try{const t=e.querySelector(".empire-media-grid");if(!t)return;const i=e.dataset.cols||"4",n=e.dataset.mobileCols||"2",p=e.dataset.gap||"10",c=e.dataset.aspect||"square",d=e.dataset.overlay||"#000000",u=parseInt(e.dataset.opacity||"20")/100,m=b(e,"?mediaOnly=true&limit=24"),a=await fetch(m);if(!a.ok)throw new Error("API returning error");const{reviews:f}=await a.json(),o=f.filter(l=>l.media&&l.media.length>0).flatMap(l=>l.media.map(y=>({url:y.url,type:y.type||"image",review:l})));if(!o.length){t.innerHTML=`
                        <div style="text-align:center;width:100%;padding:40px 20px;grid-column:1/-1;">
                            <p style="opacity:0.6;font-size:1.1em;margin-bottom:15px;">No customer photos yet.</p>
                            <button onclick="if(window.empireOpenReviewForm) { window.empireOpenReviewForm(); } else { alert('Please add the Leave a Review Form block to the page first.'); }" 
                                    style="background:var(--empire-btn-bg,#111);color:var(--empire-btn-text,#fff);padding:10px 24px;border-radius:8px;font-weight:600;font-size:0.95em;cursor:pointer;border:none;box-shadow:0 4px 6px rgba(0,0,0,0.1);transition:transform 0.2s;"
                                    onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'">
                                Upload a Photo Review
                            </button>
                        </div>
                    `;return}t.style.cssText=`
                    display: grid;
                    grid-template-columns: repeat(${i}, 1fr);
                    gap: ${p}px;
                `;const s={square:"1/1",portrait:"4/5",masonry:"auto"};if(t.innerHTML=o.map(l=>`
                    <div class="empire-grid-item" style="
                        position:relative; overflow:hidden;
                        border-radius:8px; cursor:pointer;
                        aspect-ratio: ${s[c]||"1/1"};
                    ">
                        <img src="${l.url}" alt="Customer photo" loading="lazy" style="
                            width:100%; height:100%; object-fit:cover;
                            transition: transform 0.3s;
                        " onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'" />
                        <div style="
                            position:absolute;inset:0;
                            background:${d}; opacity:0;
                            transition:opacity 0.3s; pointer-events:none;
                        " class="empire-grid-overlay"></div>
                    </div>
                `).join(""),!document.getElementById("empire-grid-responsive")){const l=document.createElement("style");l.id="empire-grid-responsive",l.textContent=`
                        @media (max-width: 768px) {
                            .empire-media-grid { grid-template-columns: repeat(${n}, 1fr) !important; }
                        }
                        .empire-grid-item:hover .empire-grid-overlay { opacity: ${u} !important; }
                    `,document.head.appendChild(l)}}catch(t){console.error("Media grid load failed:",t);const i=e.querySelector(".empire-media-grid");i&&(i.innerHTML='<p style="opacity:0.5;text-align:center;grid-column:1/-1;">Unable to load photos.</p>')}})}async function L(){const r=document.querySelectorAll(".empire-reviews-widget");r.length&&(r.forEach(e=>{const t=e.querySelector(".empire-reviews-container");t&&(t.innerHTML='<div class="empire-loading">Loading reviews\u2026</div>')}),M(document.querySelectorAll(".empire-reviews-container")))}async function M(r){r.forEach(async e=>{const t=e.closest(".empire-reviews-widget");try{const i=t?.dataset.productId;if(!i){e.innerHTML="<p>No product detected.</p>";return}const n=b(t,`?productId=${i}`),p=await fetch(n);if(!p.ok)throw new Error("API returning error");const{reviews:c,stats:d}=await p.json();if(!c||!c.length){e.innerHTML=`
                        <div style="text-align:center;width:100%;padding:60px 20px;background:var(--empire-feed-bg, #f9fafb);border-radius:12px;margin-top:20px;">
                            <div style="font-size:3rem;margin-bottom:15px;">\u2728</div>
                            <h3 style="font-size:1.5rem;font-weight:700;margin-bottom:10px;">No reviews yet</h3>
                            <p style="opacity:0.6;font-size:1.1em;margin-bottom:25px;max-width:400px;margin-left:auto;margin-right:auto;">Be the first to share your experience with this product!</p>
                            <button onclick="if(window.empireOpenReviewForm) { window.empireOpenReviewForm(); } else { alert('Please add the Leave a Review Form block to the page first.'); }" 
                                    style="background:var(--empire-btn-bg,#111);color:var(--empire-btn-text,#fff);padding:14px 32px;border-radius:8px;font-weight:600;font-size:1.05em;cursor:pointer;border:none;box-shadow:0 4px 12px rgba(0,0,0,0.15);transition:transform 0.2s;"
                                    onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'">
                                Write the First Review
                            </button>
                        </div>
                    `;return}const u=d?d.average.toFixed(1):"0",m=d?d.total:c.length,a=getComputedStyle(t).getPropertyValue("--empire-star-color").trim()||"#fbbf24",f=getComputedStyle(t).getPropertyValue("--empire-verified-color").trim()||"#16a34a";e.innerHTML=`
                    <div class="empire-basic-summary" style="display:flex;align-items:center;gap:12px;margin-bottom:1.5rem;padding-bottom:1rem;border-bottom:1px solid #e5e7eb;">
                        <span style="font-size:2.4rem;font-weight:800;">${u}</span>
                        <div>
                            <div style="color:${a};font-size:1.2rem;letter-spacing:2px;">${"\u2605".repeat(Math.round(d?.average||0))}${"\u2606".repeat(5-Math.round(d?.average||0))}</div>
                            <span style="opacity:0.6;font-size:0.85rem;">${m} review${m!==1?"s":""}</span>
                        </div>
                    </div>
                    <div class="empire-reviews-list" style="display:flex;flex-direction:column;gap:16px;">
                        ${c.map(o=>{const s=o.customerName||"Anonymous",l=new Date(o.createdAt||Date.now()).toLocaleDateString(),y="\u2605".repeat(o.rating)+"\u2606".repeat(5-o.rating),v=o.title?`<strong style="display:block;margin-bottom:4px;">${o.title}</strong>`:"",x=o.verified?`<span style="color:${f};font-size:0.75rem;font-weight:600;">\u2713 Verified Buyer</span>`:"",w=o.media&&o.media.length?`<div style="display:flex;gap:8px;margin-top:8px;">${o.media.map(h=>`<img src="${h.url}" style="width:60px;height:60px;object-fit:cover;border-radius:8px;cursor:pointer;" />`).join("")}</div>`:"",$=o.replies&&o.replies.length?`<div style="background:#f8fafc;border-left:3px solid #10b981;padding:8px 12px;margin-top:8px;border-radius:0 8px 8px 0;font-size:0.85em;"><strong>Store Reply:</strong> ${o.replies[0].body}</div>`:"";return`
                                <div class="empire-review-card" style="padding:16px 0;border-bottom:1px solid #f1f5f9;">
                                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                                        <div style="display:flex;align-items:center;gap:8px;">
                                            <div style="width:32px;height:32px;border-radius:50%;background:#e5e7eb;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.8rem;">${s.charAt(0).toUpperCase()}</div>
                                            <div>
                                                <span style="font-weight:600;font-size:0.9rem;">${s}</span>
                                                ${x}
                                            </div>
                                        </div>
                                        <span style="opacity:0.45;font-size:0.78rem;">${l}</span>
                                    </div>
                                    <div style="color:${a};margin-bottom:6px;">${y}</div>
                                    ${v}
                                    <p style="margin:0;line-height:1.6;color:var(--empire-body-color, #4b5563);">${o.body}</p>
                                    ${w}
                                    ${$}
                                </div>
                            `}).join("")}
                    </div>
                `}catch(i){console.error("Review load failed",i),e.innerHTML='<p style="opacity:0.5;">Unable to load reviews.</p>'}})}async function E(){const r=document.querySelectorAll("[data-empire-trust]");r.length&&r.forEach(async e=>{try{const t=b(e,""),i=await fetch(t);if(!i.ok)throw new Error("API returning error");const{stats:n}=await i.json();if(n&&n.total>0){const p=e.querySelector(".empire-trust-score");p&&(p.textContent=`${n.average.toFixed(1)}/5 (${n.total})`)}}catch(t){console.error("Trust badge load failed:",t)}})}async function I(){const r=document.querySelectorAll(".empire-star-rating");r.length&&r.forEach(async e=>{try{const t=e.dataset.productId;if(!t)return;const i=e.dataset.showCount!=="false",n=e.dataset.countText||"({n} reviews)",p=parseInt(e.dataset.starSize||"24"),c=parseInt(e.dataset.textSize||"14"),d=e.dataset.textColor||"#6b7280",u=b(e,`?productId=${t}&limit=1`),m=await fetch(u);if(!m.ok)throw new Error("API returning error");const{stats:a}=await m.json(),{average:f,total:o}=a||{average:0,total:0};if(o===0&&!e.closest("[data-design-mode]"))return;const s=Math.floor(f),l=f%1>=.3,y=5-s-(l?1:0),v=e.querySelector("svg"),x=v?v.getAttribute("fill"):"#fbbf24",w=e.querySelector(".empire-stars-loading");if(w){let h="";for(let g=0;g<5;g++){const T=g<s||g===s&&l?x:"#e5e7eb";h+=`<svg viewBox="0 0 24 24" width="${p}" height="${p}" fill="${T}" style="${g===s&&l?"opacity:0.5;":""}"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>`}w.innerHTML=h}const $=e.querySelector(".empire-rating-count");if(i&&o>0){const h=n.replace("{n}",o);if($)$.textContent=h;else{const g=document.createElement("span");g.className="empire-rating-count",g.style.cssText=`margin-left:8px;font-size:${c}px;opacity:0.8;color:${d};`,g.textContent=h,e.appendChild(g)}}else $&&$.remove()}catch(t){console.error("Star rating load failed:",t)}})}function S(){E(),I(),k(),z(),C(),L()}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",S):S()})();
