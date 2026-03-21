"use strict";(function(){"use strict";if(window.empireV2Initialized)return;window.empireV2Initialized=!0;function v(o,e=""){const t=(o.dataset.appUrl||window.EMPIRE_APP_URL||"https://empire-reviews.vercel.app").replace(/\/$/,""),i=o.dataset.shop||window.Shopify&&window.Shopify.shop||"";let l=`${t}/api/reviews${e?e.startsWith("?")?e:`?${e}`:""}`;return i&&!l.includes("shop=")&&(l+=`${l.includes("?")?"&":"?"}shop=${encodeURIComponent(i)}`),l}async function L(){const o=document.querySelectorAll(".empire-carousel-container");o.length&&o.forEach(async e=>{try{const t=e.querySelector(".empire-carousel-track");if(!t)return;const i=e.dataset.style||"bordered",l=e.dataset.radius||"16",g=e.dataset.bg||"#ffffff",d=e.dataset.text||"#1f2937",p=parseInt(e.dataset.desktopCols||"3"),u=parseInt(e.dataset.gap||"20"),y=e.dataset.verified!=="false",r=v(e,"?minRating=4&limit=12"),n=await fetch(r);if(!n.ok)throw new Error("API returning error");const{reviews:c}=await n.json();if(!c||!c.length){t.innerHTML=`
                        <div style="text-align:center;width:100%;padding:40px 20px;grid-column:1/-1;">
                            <p style="opacity:0.6;font-size:1.1em;margin-bottom:15px;">No reviews yet. Be the first to share your experience!</p>
                            <button onclick="if(window.empireOpenReviewForm) { window.empireOpenReviewForm(); } else { alert('Please add the Leave a Review Form block to the page first.'); }" 
                                    style="background:var(--empire-btn-bg,#111);color:var(--empire-btn-text,#fff);padding:10px 24px;border-radius:8px;font-weight:600;font-size:0.95em;cursor:pointer;border:none;box-shadow:0 4px 6px rgba(0,0,0,0.1);transition:transform 0.2s;"
                                    onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'">
                                Write a Review
                            </button>
                        </div>
                    `;return}t.style.cssText=`display: grid; grid-template-columns: repeat(${p}, 1fr); gap: ${u}px;`,t.innerHTML=c.map(s=>{const x="\u2605".repeat(s.rating)+"\u2606".repeat(5-s.rating),w=s.customerName||"Anonymous",$=new Date(s.createdAt||Date.now()).toLocaleDateString(),m=s.body?s.body.length>150?s.body.substring(0,150)+"\u2026":s.body:"",b=y&&s.verified?'<span class="empire-verified-badge" style="color:#16a34a;font-size:0.75em;font-weight:600;">\u2713 Verified</span>':"";return`
                        <div class="empire-carousel-card" style="
                            background:${g}; color:${d};
                            border-radius:${l}px; padding:20px;
                            border: ${i==="bordered"?"1px solid #e5e7eb":"none"};
                            ${i==="glass"?"backdrop-filter:blur(10px);background:rgba(255,255,255,0.7);":""}
                            ${i==="dark"?"background:#1f2937;color:#f9fafb;":""}
                        ">
                            <div class="empire-card-stars" style="color:#fbbf24;margin-bottom:8px;">${x}</div>
                            <p style="margin:0 0 12px 0;line-height:1.5;font-size:0.95em;">${m}</p>
                            <div style="display:flex;align-items:center;justify-content:space-between;margin-top:auto;">
                                <span style="font-weight:600;font-size:0.85em;">${w}</span>
                                ${b}
                            </div>
                            <span style="opacity:0.5;font-size:0.75em;">${$}</span>
                        </div>
                    `}).join("")}catch{const i=e.querySelector(".empire-carousel-track");i&&(i.innerHTML='<p style="opacity:0.5;text-align:center;width:100%;">Unable to load reviews.</p>')}})}function E(){const o=document.querySelector("#empire-floating-tab-config");if(!o)return;const e=o.dataset.position||"right",t=o.dataset.offset||"50",i=o.dataset.label||"Reviews",l=o.dataset.bg||"#111",g=o.dataset.text||"#fff",d=o.dataset.icon||"star",p=o.dataset.pulse!=="false",u=o.dataset.rating!=="false",y={star:"\u2605",heart:"\u2665",bag:"\u{1F6CD}",none:""},r=document.createElement("button");if(r.className="empire-floating-tab",r.innerHTML=(y[d]||"")+" "+i,r.style.cssText=`
            position: fixed; ${e==="left"||e==="bottom-left"?"left: 0;":"right: 0;"}
            ${e.startsWith("bottom")?"bottom: 20px;":"top: "+t+"%;"}
            ${e.startsWith("bottom")?"":"transform: translateY(-50%) rotate("+(e==="left"?"-90":"90")+"deg); transform-origin: "+(e==="left"?"left bottom":"right bottom")+";"}
            background: ${l}; color: ${g}; padding: 10px 20px; border: none;
            border-radius: ${e.startsWith("bottom")?"8px":"0 0 8px 8px"}; cursor: pointer; z-index: 9998;
            font-family: inherit; font-size: 0.9rem; font-weight: 600; letter-spacing: 0.5px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.15); transition: transform 0.2s, box-shadow 0.2s;
            ${p?"animation: empire-float-pulse 3s ease-in-out infinite;":""}
        `,u&&fetch(v(o,"?limit=1")).then(n=>n.json()).then(n=>{n.stats&&n.stats.total>0&&(r.innerHTML=`\u2605 ${n.stats.average.toFixed(1)} ${i}`)}).catch(()=>{}),r.addEventListener("click",()=>{const n=document.querySelector(".empire-reviews-widget");n&&n.scrollIntoView({behavior:"smooth",block:"start"})}),r.addEventListener("mouseenter",()=>r.style.transform+=" scale(1.05)"),r.addEventListener("mouseleave",()=>r.style.transform=r.style.transform.replace(" scale(1.05)","")),document.body.appendChild(r),p&&!document.getElementById("empire-float-pulse-style")){const n=document.createElement("style");n.id="empire-float-pulse-style",n.textContent="@keyframes empire-float-pulse { 0%, 100% { box-shadow: 0 4px 15px rgba(0,0,0,0.15); } 50% { box-shadow: 0 4px 25px rgba(0,0,0,0.3); } }",document.head.appendChild(n)}}async function I(){const o=document.querySelectorAll(".empire-media-grid-container");o.length&&o.forEach(async e=>{try{const t=e.querySelector(".empire-media-grid");if(!t)return;const i=e.dataset.cols||"4",l=e.dataset.mobileCols||"2",g=e.dataset.gap||"10",d=e.dataset.aspect||"square",p=e.dataset.overlay||"#000000",u=parseInt(e.dataset.opacity||"20")/100,y=await fetch(v(e,"?mediaOnly=true&limit=24"));if(!y.ok)throw new Error("API returning error");const{reviews:r}=await y.json(),n=r.filter(s=>s.media&&s.media.length>0).flatMap(s=>s.media.map(x=>({url:x.url,type:x.type||"image",review:s})));if(!n.length){t.innerHTML=`
                        <div style="text-align:center;width:100%;padding:40px 20px;grid-column:1/-1;">
                            <p style="opacity:0.6;font-size:1.1em;margin-bottom:15px;">No customer photos yet.</p>
                            <button onclick="if(window.empireOpenReviewForm) { window.empireOpenReviewForm(); } else { alert('Please add the Leave a Review Form block to the page first.'); }" 
                                    style="background:var(--empire-btn-bg,#111);color:var(--empire-btn-text,#fff);padding:10px 24px;border-radius:8px;font-weight:600;font-size:0.95em;cursor:pointer;border:none;box-shadow:0 4px 6px rgba(0,0,0,0.1);transition:transform 0.2s;"
                                    onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'">
                                Upload a Photo Review
                            </button>
                        </div>
                    `;return}const c={square:"1/1",portrait:"4/5",masonry:"auto"};if(t.style.cssText=`display: grid; grid-template-columns: repeat(${i}, 1fr); gap: ${g}px;`,t.innerHTML=n.map(s=>`
                    <div class="empire-grid-item" style="position:relative; overflow:hidden; border-radius:8px; cursor:pointer; aspect-ratio: ${c[d]||"1/1"};">
                        <img src="${s.url}" loading="lazy" style="width:100%; height:100%; object-fit:cover; transition: transform 0.3s;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'" />
                        <div style="position:absolute;inset:0; background:${p}; opacity:0; transition:opacity 0.3s; pointer-events:none;" class="empire-grid-overlay"></div>
                    </div>
                `).join(""),!document.getElementById("empire-grid-responsive")){const s=document.createElement("style");s.id="empire-grid-responsive",s.textContent=`@media (max-width: 768px) { .empire-media-grid { grid-template-columns: repeat(${l}, 1fr) !important; } } .empire-grid-item:hover .empire-grid-overlay { opacity: ${u} !important; }`,document.head.appendChild(s)}}catch{const i=e.querySelector(".empire-media-grid");i&&(i.innerHTML='<p style="opacity:0.5;text-align:center;grid-column:1/-1;">Unable to load photos.</p>')}})}async function R(){const o=document.querySelectorAll("[data-empire-trust]");o.length&&o.forEach(async e=>{try{const t=await fetch(v(e,""));if(!t.ok)throw new Error("API returning error");const{stats:i}=await t.json();if(i&&i.total>0){const l=e.querySelector(".empire-trust-score");l&&(l.textContent=`${i.average.toFixed(1)}/5 (${i.total})`)}}catch{}})}async function T(){const o=document.querySelectorAll(".empire-star-rating");o.length&&o.forEach(async e=>{try{const t=e.dataset.productId;if(!t)return;const i=e.dataset.showCount!=="false",l=e.dataset.countText||"({n} reviews)",g=parseInt(e.dataset.starSize||"24"),d=parseInt(e.dataset.textSize||"14"),p=e.dataset.textColor||"#6b7280",u=await fetch(v(e,`?productId=${t}&limit=1`));if(!u.ok)throw new Error("API returning error");const{stats:y}=await u.json(),{average:r,total:n}=y||{average:0,total:0};if(n===0&&!e.closest("[data-design-mode]"))return;const c=Math.floor(r),s=r%1>=.3,x=e.querySelector("svg"),w=x?x.getAttribute("fill"):"#fbbf24",$=e.querySelector(".empire-stars-loading");if($){let b="";for(let f=0;f<5;f++){const k=f<c||f===c&&s?w:"#e5e7eb";b+=`<svg viewBox="0 0 24 24" width="${g}" height="${g}" fill="${k}" style="${f===c&&s?"opacity:0.5;":""}"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>`}$.innerHTML=b}const m=e.querySelector(".empire-rating-count");if(i&&n>0){const b=l.replace("{n}",n);if(m)m.textContent=b;else{const f=document.createElement("span");f.className="empire-rating-count",f.style.cssText=`margin-left:8px;font-size:${d}px;opacity:0.8;color:${p};`,f.textContent=b,e.appendChild(f)}}else m&&m.remove()}catch{}})}async function P(){const o=document.querySelectorAll(".empire-reviews-widget");o.length&&(o.forEach(async e=>{const t=e.querySelector(".empire-reviews-container");t&&(t.innerHTML='<div class="empire-loading" style="padding: 40px; text-align: center; opacity: 0.5;">Loading reviews\u2026</div>')}),o.forEach(async e=>{const t=e.querySelector(".empire-reviews-container");try{const i=e.dataset.productId,l=v(e,i?`?productId=${i}`:""),g=await fetch(l);if(!g.ok)throw new Error("API error");const{reviews:d,stats:p}=await g.json();if(!d||!d.length){t.innerHTML=`
                        <div style="text-align:center;width:100%;padding:60px 20px;background:var(--empire-feed-bg, #f9fafb);border-radius:12px;margin-top:20px;">
                            <div style="font-size:3rem;margin-bottom:15px;">\u2728</div>
                            <h3 style="font-size:1.5rem;font-weight:700;margin-bottom:10px;">No reviews yet</h3>
                            <p style="opacity:0.6;font-size:1.1em;margin-bottom:25px;max-width:400px;margin-left:auto;margin-right:auto;">Be the first to share your experience!</p>
                            <button onclick="if(window.empireOpenReviewForm) { window.empireOpenReviewForm(); } else { alert('Please add the Leave a Review Form block to the page first.'); }" 
                                    style="background:var(--empire-btn-bg,#111);color:var(--empire-btn-text,#fff);padding:14px 32px;border-radius:8px;font-weight:600;font-size:1.05em;cursor:pointer;border:none;box-shadow:0 4px 12px rgba(0,0,0,0.15);transition:transform 0.2s;"
                                    onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'">
                                Write the First Review
                            </button>
                        </div>
                    `;return}const u=getComputedStyle(e).getPropertyValue("--empire-sidebar-bg").trim()||"#ffffff",y=getComputedStyle(e).getPropertyValue("--empire-feed-bg").trim()||"#ffffff",r=getComputedStyle(e).getPropertyValue("--empire-text-color").trim()||"#111111",n=getComputedStyle(e).getPropertyValue("--empire-body-color").trim()||"#4b5563",c=getComputedStyle(e).getPropertyValue("--empire-star-color").trim()||"#121212",s=getComputedStyle(e).getPropertyValue("--empire-bar-color").trim()||"#fbbf24",x=getComputedStyle(e).getPropertyValue("--empire-btn-bg").trim()||"#111111",w=getComputedStyle(e).getPropertyValue("--empire-btn-text").trim()||"#ffffff",$=getComputedStyle(e).getPropertyValue("--empire-verified-color").trim()||"#16a34a",m=p?p.total:d.length,b=p?p.average.toFixed(1):"5.0",f=p&&p.distribution?p.distribution:{1:0,2:0,3:0,4:0,5:m};if(!document.getElementById("empire-split-layout-css")){const a=document.createElement("style");a.id="empire-split-layout-css",a.textContent=`
                        .empire-split-layout { display: flex; gap: 40px; align-items: flex-start; }
                        .empire-split-sidebar { width: 32%; flex-shrink: 0; position: sticky; top: 40px; }
                        .empire-split-feed { width: 68%; display: flex; flex-direction: column; gap: 20px; }
                        @media (max-width: 800px) {
                            .empire-split-layout { flex-direction: column; }
                            .empire-split-sidebar { width: 100%; position: relative; top: 0; margin-bottom: 20px; }
                            .empire-split-feed { width: 100%; }
                        }
                    `,document.head.appendChild(a)}const k=[5,4,3,2,1].map(a=>{const h=f[a]||0,S=m>0?h/m*100:0;return`
                        <div style="display:flex;align-items:center;margin-bottom:12px;font-size:0.9em;color:${r};font-weight:600;">
                            <span style="width:30px;display:flex;align-items:center;color:${c};">${a} <i style="font-style:normal;margin-left:4px;font-size:0.9em;">\u2605</i></span>
                            <div style="flex-grow:1;height:8px;background:#f1f5f9;border-radius:4px;margin:0 12px;overflow:hidden;position:relative;">
                                <div style="position:absolute;left:0;top:0;bottom:0;width:${S}%;background:${s};border-radius:4px;"></div>
                            </div>
                            <span style="width:20px;text-align:right;opacity:0.7;font-weight:400;">${h}</span>
                        </div>
                    `}).join(""),z=`
                    <button onclick="if(window.empireOpenReviewForm) { window.empireOpenReviewForm(); } else { alert('Please add the Leave a Review Form block to the page first.'); }" 
                            style="width:100%;background:${x};color:${w};border:none;border-radius:8px;padding:14px;font-weight:700;font-size:0.95em;cursor:pointer;margin-top:25px;transition:opacity 0.2s;"
                            onmouseover="this.style.opacity='0.9'" onmouseout="this.style.opacity='1'">
                        Write a Review
                    </button>
                `,M=`
                    <div class="empire-split-sidebar" style="background:${u};border-radius:16px;padding:30px;box-shadow:0 1px 3px rgba(0,0,0,0.05);border:1px solid #f1f5f9;">
                        <span style="text-transform:uppercase;font-size:0.75em;letter-spacing:1px;font-weight:700;opacity:0.6;display:block;margin-bottom:15px;color:${r};">Overall Rating</span>
                        <div style="font-size:4.5rem;font-weight:800;line-height:1;margin-bottom:8px;color:${r};">${b}</div>
                        <div style="font-size:0.95em;opacity:0.6;margin-bottom:30px;color:${r};font-weight:500;">Based on ${m} review${m!==1?"s":""}</div>
                        ${k}
                        ${z}
                    </div>
                `,q=a=>{let h='<span style="color:'+c+';font-size:1.1em;letter-spacing:1px;margin-bottom:12px;display:block;">';return h+="\u2605".repeat(a)+"\u2606".repeat(5-a)+"</span>",h},A=d.map(a=>{const h=a.customerName||"Anonymous",S=h.charAt(0).toUpperCase(),H=new Date(a.createdAt||Date.now()).toLocaleDateString(),F=a.verified?`<span style="background:#eafaf1;color:${$};padding:4px 8px;border-radius:12px;font-size:0.65em;font-weight:800;letter-spacing:0.5px;text-transform:uppercase;">\u2713 Verified Buyer</span>`:"",j=a.media&&a.media.length?`<div style="display:flex;gap:10px;margin-top:15px;">${a.media.map(V=>`<img src="${V.url}" style="width:80px;height:80px;object-fit:cover;border-radius:8px;cursor:pointer;box-shadow:0 2px 4px rgba(0,0,0,0.1);" />`).join("")}</div>`:"";return`
                        <div style="background:${y};border-radius:16px;padding:25px;border:1px solid #f1f5f9;box-shadow:0 1px 3px rgba(0,0,0,0.02);">
                            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">
                                <div style="display:flex;align-items:center;gap:15px;">
                                    <div style="width:44px;height:44px;border-radius:50%;background:#f8fafc;color:${r};display:flex;align-items:center;justify-content:center;font-weight:800;font-size:1.2em;border:1px solid #e2e8f0;">
                                        ${S}
                                    </div>
                                    <div>
                                        <div style="font-weight:700;font-size:1.05em;color:${r};margin-bottom:4px;">${h}</div>
                                        ${F}
                                    </div>
                                </div>
                                <div style="font-size:0.85em;opacity:0.5;color:${r};text-align:right;">
                                    ${H}
                                </div>
                            </div>
                            ${q(a.rating)}
                            ${a.title?`<h4 style="margin:0 0 8px 0;font-size:1.1em;color:${r};font-weight:700;">${a.title}</h4>`:""}
                            <p style="margin:0;line-height:1.6;font-size:0.95em;color:${n};">${a.body}</p>
                            ${j}
                        </div>
                    `}).join("");t.innerHTML=`
                    <div class="empire-split-layout">
                        ${M}
                        <div class="empire-split-feed">
                            ${A}
                        </div>
                    </div>
                `}catch(i){console.error("Review load failed",i),t.innerHTML='<p style="opacity:0.5;text-align:center;">Unable to load reviews.</p>'}}))}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",C):C();function C(){R(),T(),L(),E(),I(),P()}})();
