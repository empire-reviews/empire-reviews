"use strict";(function(){"use strict";if(window.empireV2Initialized)return;window.empireV2Initialized=!0;function E(o,e=""){const t=(o.dataset.appUrl||window.EMPIRE_APP_URL||"https://empire-reviews.vercel.app").replace(/\/$/,""),r=o.dataset.shop||window.Shopify&&window.Shopify.shop||"";let l=`${t}/api/reviews${e?e.startsWith("?")?e:`?${e}`:""}`;return r&&!l.includes("shop=")&&(l+=`${l.includes("?")?"&":"?"}shop=${encodeURIComponent(r)}`),l}const b={data:null,promise:null,async fetchAll(o){return this.data?this.data:this.promise?this.promise:(this.promise=new Promise(async(e,t)=>{try{const r=E(o,"?limit=100"),l=await fetch(r);if(!l.ok)throw new Error("API server returned "+l.status);const p=await l.json();this.data=p,e(p)}catch(r){t(r)}}),this.promise)}};function k(o,e){e.innerHTML=`
            <div style="text-align:center;width:100%;padding:40px 20px;grid-column:1/-1;">
                <p style="opacity:0.6;font-size:1.1em;margin-bottom:15px;">${o}</p>
                <button onclick="if(window.empireOpenReviewForm) { window.empireOpenReviewForm(); } else { alert('Please add the Leave a Review Form block to the page first.'); }" 
                        style="background:var(--empire-btn-bg,#111);color:var(--empire-btn-text,#fff);padding:10px 24px;border-radius:8px;font-weight:600;font-size:0.95em;cursor:pointer;border:none;box-shadow:0 4px 6px rgba(0,0,0,0.1);transition:transform 0.2s;"
                        onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'">
                    Write a Review
                </button>
            </div>
        `}async function R(){const o=document.querySelectorAll(".empire-carousel-container");o.length&&o.forEach(async e=>{const t=e.querySelector(".empire-carousel-track");if(t)try{const r=e.dataset.style||"bordered",l=e.dataset.radius||"16",p=e.dataset.bg||"#ffffff",d=e.dataset.text||"#1f2937",m=parseInt(e.dataset.desktopCols||"3"),f=parseInt(e.dataset.gap||"20"),u=e.dataset.verified!=="false",{reviews:n}=await b.fetchAll(e),s=n.filter(i=>i.rating>=4).slice(0,12);if(!s.length){k("No reviews yet. Be the first to share your experience!",t);return}t.style.cssText=`display: grid; grid-template-columns: repeat(${m}, 1fr); gap: ${f}px;`,t.innerHTML=s.map(i=>{const y="\u2605".repeat(i.rating)+"\u2606".repeat(5-i.rating),v=i.customerName||"Anonymous",w=new Date(i.createdAt||Date.now()).toLocaleDateString(),$=i.body?i.body.length>150?i.body.substring(0,150)+"\u2026":i.body:"",h=u&&i.verified?'<span class="empire-verified-badge" style="color:#16a34a;font-size:0.75em;font-weight:600;">\u2713 Verified</span>':"";return`
                        <div class="empire-carousel-card" style="
                            background:${p}; color:${d};
                            border-radius:${l}px; padding:20px;
                            border: ${r==="bordered"?"1px solid #e5e7eb":"none"};
                            ${r==="glass"?"backdrop-filter:blur(10px);background:rgba(255,255,255,0.7);":""}
                            ${r==="dark"?"background:#1f2937;color:#f9fafb;":""}
                        ">
                            <div class="empire-card-stars" style="color:#fbbf24;margin-bottom:8px;">${y}</div>
                            <p style="margin:0 0 12px 0;line-height:1.5;font-size:0.95em;">${$}</p>
                            <div style="display:flex;align-items:center;justify-content:space-between;margin-top:auto;">
                                <span style="font-weight:600;font-size:0.85em;">${v}</span>
                                ${h}
                            </div>
                            <span style="opacity:0.5;font-size:0.75em;">${w}</span>
                        </div>
                    `}).join("")}catch{t&&(t.innerHTML='<p style="opacity:0.5;text-align:center;width:100%;">Unable to load reviews.</p>')}})}function T(){const o=document.querySelector("#empire-floating-tab-config");if(!o)return;const e=o.dataset.position||"right",t=o.dataset.offset||"50",r=o.dataset.label||"Reviews",l=o.dataset.bg||"#111",p=o.dataset.text||"#fff",d=o.dataset.icon||"star",m=o.dataset.pulse!=="false",f=o.dataset.rating!=="false",u={star:"\u2605",heart:"\u2665",bag:"\u{1F6CD}",none:""},n=document.createElement("button");if(n.className="empire-floating-tab",n.innerHTML=(u[d]||"")+" "+r,n.style.cssText=`
            position: fixed; ${e==="left"||e==="bottom-left"?"left: 0;":"right: 0;"}
            ${e.startsWith("bottom")?"bottom: 20px;":"top: "+t+"%;"}
            ${e.startsWith("bottom")?"":"transform: translateY(-50%) rotate("+(e==="left"?"-90":"90")+"deg); transform-origin: "+(e==="left"?"left bottom":"right bottom")+";"}
            background: ${l}; color: ${p}; padding: 10px 20px; border: none;
            border-radius: ${e.startsWith("bottom")?"8px":"0 0 8px 8px"}; cursor: pointer; z-index: 9998;
            font-family: inherit; font-size: 0.9rem; font-weight: 600; letter-spacing: 0.5px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.15); transition: transform 0.2s, box-shadow 0.2s;
            ${m?"animation: empire-float-pulse 3s ease-in-out infinite;":""}
        `,f&&b.fetchAll(o).then(s=>{s.stats&&s.stats.total>0&&(n.innerHTML=`\u2605 ${s.stats.average.toFixed(1)} ${r}`)}).catch(()=>{}),n.addEventListener("click",()=>{const s=document.querySelector(".empire-reviews-widget");s&&s.scrollIntoView({behavior:"smooth",block:"start"})}),n.addEventListener("mouseenter",()=>n.style.transform+=" scale(1.05)"),n.addEventListener("mouseleave",()=>n.style.transform=n.style.transform.replace(" scale(1.05)","")),document.body.appendChild(n),m&&!document.getElementById("empire-float-pulse-style")){const s=document.createElement("style");s.id="empire-float-pulse-style",s.textContent="@keyframes empire-float-pulse { 0%, 100% { box-shadow: 0 4px 15px rgba(0,0,0,0.15); } 50% { box-shadow: 0 4px 25px rgba(0,0,0,0.3); } }",document.head.appendChild(s)}}async function A(){const o=document.querySelectorAll(".empire-media-grid-container");o.length&&o.forEach(async e=>{const t=e.querySelector(".empire-media-grid");if(t)try{const r=e.dataset.cols||"4",l=e.dataset.mobileCols||"2",p=e.dataset.gap||"10",d=e.dataset.aspect||"square",m=e.dataset.overlay||"#000000",f=parseInt(e.dataset.opacity||"20")/100,{reviews:u}=await b.fetchAll(e),n=u.filter(i=>i.media&&i.media.length>0).flatMap(i=>i.media.map(y=>({url:y.url,type:y.type||"image",review:i}))).slice(0,24);if(!n.length){k("No customer photos yet.",t);return}const s={square:"1/1",portrait:"4/5",masonry:"auto"};if(t.style.cssText=`display: grid; grid-template-columns: repeat(${r}, 1fr); gap: ${p}px;`,t.innerHTML=n.map(i=>`
                    <div class="empire-grid-item" style="position:relative; overflow:hidden; border-radius:8px; cursor:pointer; aspect-ratio: ${s[d]||"1/1"};">
                        <img src="${i.url}" loading="lazy" style="width:100%; height:100%; object-fit:cover; transition: transform 0.3s;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'" />
                        <div style="position:absolute;inset:0; background:${m}; opacity:0; transition:opacity 0.3s; pointer-events:none;" class="empire-grid-overlay"></div>
                    </div>
                `).join(""),!document.getElementById("empire-grid-responsive")){const i=document.createElement("style");i.id="empire-grid-responsive",i.textContent=`@media (max-width: 768px) { .empire-media-grid { grid-template-columns: repeat(${l}, 1fr) !important; } } .empire-grid-item:hover .empire-grid-overlay { opacity: ${f} !important; }`,document.head.appendChild(i)}}catch{t&&(t.innerHTML='<p style="opacity:0.5;text-align:center;grid-column:1/-1;">Unable to load photos.</p>')}})}async function I(){const o=document.querySelectorAll("[data-empire-trust]");o.length&&o.forEach(async e=>{try{const{stats:t}=await b.fetchAll(e);if(t&&t.total>0){const r=e.querySelector(".empire-trust-score");r&&(r.textContent=`${t.average.toFixed(1)}/5 (${t.total})`)}}catch{}})}async function M(){const o=document.querySelectorAll(".empire-star-rating");o.length&&o.forEach(async e=>{try{const t=e.dataset.productId;if(!t)return;const r=e.dataset.showCount!=="false",l=e.dataset.countText||"({n} reviews)",p=parseInt(e.dataset.starSize||"24"),d=parseInt(e.dataset.textSize||"14"),m=e.dataset.textColor||"#6b7280",{reviews:f}=await b.fetchAll(e),u=f.filter(g=>g.productId===`gid://shopify/Product/${t}`),n=u.length;let s=0;if(n>0&&(s=u.reduce((g,c)=>g+c.rating,0)/n),n===0&&!e.closest("[data-design-mode]"))return;const i=Math.floor(s),y=s%1>=.3,v=e.querySelector("svg"),w=v?v.getAttribute("fill"):"#fbbf24",$=e.querySelector(".empire-stars-loading");if($){let g="";for(let c=0;c<5;c++){const C=c<i||c===i&&y?w:"#e5e7eb";g+=`<svg viewBox="0 0 24 24" width="${p}" height="${p}" fill="${C}" style="${c===i&&y?"opacity:0.5;":""}"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>`}$.innerHTML=g}const h=e.querySelector(".empire-rating-count");if(r&&n>0){const g=l.replace("{n}",n);if(h)h.textContent=g;else{const c=document.createElement("span");c.className="empire-rating-count",c.style.cssText=`margin-left:8px;font-size:${d}px;opacity:0.8;color:${m};`,c.textContent=g,e.appendChild(c)}}else h&&h.remove()}catch{}})}async function P(){const o=document.querySelectorAll(".empire-reviews-widget");o.length&&(o.forEach(async e=>{const t=e.querySelector(".empire-reviews-container");t&&(t.innerHTML='<div class="empire-loading" style="padding: 40px; text-align: center; opacity: 0.5;">Loading reviews\u2026</div>')}),o.forEach(async e=>{const t=e.querySelector(".empire-reviews-container");if(t)try{const r=e.dataset.productId,l=await b.fetchAll(e);let p=l.reviews;if(r&&(p=p.filter(a=>a.productId===`gid://shopify/Product/${r}`)),!p||!p.length){t.innerHTML=`
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
                    `;return}let d=p.length,m=0,f={1:0,2:0,3:0,4:0,5:0};r&&d>0?(p.forEach(a=>f[a.rating]++),m=(p.reduce((a,x)=>a+x.rating,0)/d).toFixed(1)):(d=l.stats.total,m=l.stats.average.toFixed(1),f=l.stats.distribution||f);const u=getComputedStyle(e).getPropertyValue("--empire-sidebar-bg").trim()||"#ffffff",n=getComputedStyle(e).getPropertyValue("--empire-feed-bg").trim()||"#ffffff",s=getComputedStyle(e).getPropertyValue("--empire-text-color").trim()||"#111111",i=getComputedStyle(e).getPropertyValue("--empire-body-color").trim()||"#4b5563",y=getComputedStyle(e).getPropertyValue("--empire-star-color").trim()||"#121212",v=getComputedStyle(e).getPropertyValue("--empire-bar-color").trim()||"#fbbf24",w=getComputedStyle(e).getPropertyValue("--empire-btn-bg").trim()||"#111111",$=getComputedStyle(e).getPropertyValue("--empire-btn-text").trim()||"#ffffff",h=getComputedStyle(e).getPropertyValue("--empire-verified-color").trim()||"#16a34a";if(!document.getElementById("empire-split-layout-css")){const a=document.createElement("style");a.id="empire-split-layout-css",a.textContent=`
                        .empire-split-layout { display: flex; gap: 40px; align-items: flex-start; }
                        .empire-split-sidebar { width: 32%; flex-shrink: 0; position: sticky; top: 40px; }
                        .empire-split-feed { width: 68%; display: flex; flex-direction: column; gap: 20px; }
                        @media (max-width: 800px) {
                            .empire-split-layout { flex-direction: column; }
                            .empire-split-sidebar { width: 100%; position: relative; top: 0; margin-bottom: 20px; }
                            .empire-split-feed { width: 100%; }
                        }
                    `,document.head.appendChild(a)}const g=[5,4,3,2,1].map(a=>{const x=f[a]||0,S=d>0?x/d*100:0;return`
                        <div style="display:flex;align-items:center;margin-bottom:12px;font-size:0.9em;color:${s};font-weight:600;">
                            <span style="width:30px;display:flex;align-items:center;color:${y};">${a} <i style="font-style:normal;margin-left:4px;font-size:0.9em;">\u2605</i></span>
                            <div style="flex-grow:1;height:8px;background:#f1f5f9;border-radius:4px;margin:0 12px;overflow:hidden;position:relative;">
                                <div style="position:absolute;left:0;top:0;bottom:0;width:${S}%;background:${v};border-radius:4px;"></div>
                            </div>
                            <span style="width:20px;text-align:right;opacity:0.7;font-weight:400;">${x}</span>
                        </div>
                    `}).join(""),c=`
                    <button onclick="if(window.empireOpenReviewForm) { window.empireOpenReviewForm(); } else { alert('Please add the Leave a Review Form block to the page first.'); }" 
                            style="width:100%;background:${w};color:${$};border:none;border-radius:8px;padding:14px;font-weight:700;font-size:0.95em;cursor:pointer;margin-top:25px;transition:opacity 0.2s;"
                            onmouseover="this.style.opacity='0.9'" onmouseout="this.style.opacity='1'">
                        Write a Review
                    </button>
                `,C=`
                    <div class="empire-split-sidebar" style="background:${u};border-radius:16px;padding:30px;box-shadow:0 1px 3px rgba(0,0,0,0.05);border:1px solid #f1f5f9;">
                        <span style="text-transform:uppercase;font-size:0.75em;letter-spacing:1px;font-weight:700;opacity:0.6;display:block;margin-bottom:15px;color:${s};">Overall Rating</span>
                        <div style="font-size:4.5rem;font-weight:800;line-height:1;margin-bottom:8px;color:${s};">${m}</div>
                        <div style="font-size:0.95em;opacity:0.6;margin-bottom:30px;color:${s};font-weight:500;">Based on ${d} review${d!==1?"s":""}</div>
                        ${g}
                        ${c}
                    </div>
                `,L=a=>{let x='<span style="color:'+y+';font-size:1.1em;letter-spacing:1px;margin-bottom:12px;display:block;">';return x+="\u2605".repeat(a)+"\u2606".repeat(5-a)+"</span>",x},q=p.slice(0,30).map(a=>{const x=a.customerName||"Anonymous",S=x.charAt(0).toUpperCase(),H=new Date(a.createdAt||Date.now()).toLocaleDateString(),F=a.verified?`<span style="background:#eafaf1;color:${h};padding:4px 8px;border-radius:12px;font-size:0.65em;font-weight:800;letter-spacing:0.5px;text-transform:uppercase;">\u2713 Verified Buyer</span>`:"",V=a.media&&a.media.length?`<div style="display:flex;gap:10px;margin-top:15px;">${a.media.map(B=>`<img src="${B.url}" style="width:80px;height:80px;object-fit:cover;border-radius:8px;cursor:pointer;box-shadow:0 2px 4px rgba(0,0,0,0.1);" />`).join("")}</div>`:"";return`
                        <div style="background:${n};border-radius:16px;padding:25px;border:1px solid #f1f5f9;box-shadow:0 1px 3px rgba(0,0,0,0.02);">
                            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">
                                <div style="display:flex;align-items:center;gap:15px;">
                                    <div style="width:44px;height:44px;border-radius:50%;background:#f8fafc;color:${s};display:flex;align-items:center;justify-content:center;font-weight:800;font-size:1.2em;border:1px solid #e2e8f0;">
                                        ${S}
                                    </div>
                                    <div>
                                        <div style="font-weight:700;font-size:1.05em;color:${s};margin-bottom:4px;">${x}</div>
                                        ${F}
                                    </div>
                                </div>
                                <div style="font-size:0.85em;opacity:0.5;color:${s};text-align:right;">
                                    ${H}
                                </div>
                            </div>
                            ${L(a.rating)}
                            ${a.title?`<h4 style="margin:0 0 8px 0;font-size:1.1em;color:${s};font-weight:700;">${a.title}</h4>`:""}
                            <p style="margin:0;line-height:1.6;font-size:0.95em;color:${i};">${a.body}</p>
                            ${V}
                        </div>
                    `}).join("");t.innerHTML=`
                    <div class="empire-split-layout">
                        ${C}
                        <div class="empire-split-feed">
                            ${q}
                        </div>
                    </div>
                `}catch(r){console.error("Review load failed",r),t.innerHTML='<p style="opacity:0.5;text-align:center;">Unable to load reviews.</p>'}}))}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",z):z();function z(){I(),M(),R(),T(),A(),P()}})();
