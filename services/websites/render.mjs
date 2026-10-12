import { defaultWebsiteContent } from "./content.mjs";
import { randomBytes } from "node:crypto";
export const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function renderPage(page, preview = false) {
  const nonce = randomBytes(18).toString("base64"),
    e = escapeHtml;
  const accent = /^#[0-9a-f]{6}$/i.test(page.accent_color)
    ? page.accent_color
    : "#4f46e5";
  const logo =
    typeof page.logo_data_url === "string" &&
    page.logo_data_url.length <= 262144 &&
    /^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(
      page.logo_data_url,
    )
      ? `<img class="logo" src="${e(page.logo_data_url)}" alt="${e(page.brand_name)} logo" width="240" height="120">`
      : "";
  const css = `*{box-sizing:border-box}body{margin:0;background:#f6f7fb;color:#172033;font:17px/1.6 system-ui,sans-serif;border-top:7px solid ${accent}}main{max-width:1060px;margin:auto;padding:64px 24px}header{max-width:850px;margin-bottom:42px}.logo{display:block;max-width:100%;object-fit:contain;object-position:left center;margin-bottom:20px}.brand{font-weight:700;letter-spacing:.08em;text-transform:uppercase;font-size:14px;color:#526077}h1{font-size:clamp(32px,6vw,58px);line-height:1.1;letter-spacing:-.04em;margin:18px 0}h2{font-size:23px;line-height:1.3}.description{font-size:20px;white-space:pre-wrap;color:#526077}.layout{display:grid;grid-template-columns:1fr 1.6fr;gap:44px}section{background:white;padding:28px;border:1px solid #dce2ec;border-radius:16px}label{display:block;margin:16px 0 5px;font-size:15px;font-weight:600}input:not([type=checkbox]),textarea{width:100%;padding:12px;border:1px solid #aab4c5;border-radius:7px;font:inherit}textarea{resize:vertical}button{width:100%;margin-top:22px;padding:14px;border:0;border-radius:8px;background:#172033;color:white;font:600 16px system-ui;cursor:pointer}button:disabled{opacity:.6;cursor:wait}.check{display:flex;gap:12px;font-weight:400}.check input{flex-shrink:0;width:18px}a{color:inherit;overflow-wrap:anywhere}small{font-size:13px;color:#526077}.notice{padding:14px;background:#eef2ff;border-radius:8px}.error{color:#a32121}.trap{display:none}@media(max-width:700px){main{padding:32px 18px}.layout{grid-template-columns:1fr;gap:20px}section{padding:20px}}`;
  const content = { ...defaultWebsiteContent, ...page.public_content };
  const section = (id, title, body) =>
    body?.trim()
      ? `<section class="content-section" id="${id}"><h2>${title}</h2><p class="prose">${e(body)}</p></section>`
      : "";
  const details =
    section(
      "about",
      "A service that starts with your questions",
      content.about,
    ) +
    section("services", "What we can help with", content.services) +
    (content.show_steps
      ? `<section class="content-section" id="how-it-works"><h2>How it works</h2><ol class="steps"><li><h3>Send an inquiry</h3><p>Tell us about your device, what you’re looking for and any questions you have.</p></li><li><h3>Discuss your options</h3><p>We’ll confirm compatibility, available plans, pricing and setup details with you.</p></li><li><h3>Choose your next step</h3><p>Decide whether you’d like to continue after your questions are answered.</p></li></ol></section>`
      : "") +
    section("devices", "Let’s check your device", content.devices) +
    (content.faqs?.length
      ? `<section class="content-section" id="faqs"><h2>Your questions, answered</h2>${content.faqs.map((f) => `<details class="faq"><summary>${e(f.question)}</summary><p class="prose">${e(f.answer)}</p></details>`).join("")}</section>`
      : "");
  const extraCss = `html{scroll-behavior:smooth;scroll-padding-top:24px}body{overflow-wrap:anywhere}.topbar{display:flex;align-items:center;justify-content:space-between;gap:24px;padding-bottom:30px;border-bottom:1px solid #dce2ec;margin-bottom:44px}.topbar .brand{margin:0}.topbar .logo{width:auto;max-width:180px;height:64px;margin:0}.topbar nav{display:flex;flex-wrap:wrap;gap:20px;font-size:14px}header{margin-bottom:56px}.cta{display:inline-block;background:#172033;color:white;padding:13px 22px;border-radius:8px;font-weight:600;text-decoration:none;margin-top:12px}.content-section{border:0;border-radius:0;background:transparent;padding:36px 0;margin-bottom:8px;border-top:1px solid #dce2ec}.content-section h2{font-size:clamp(25px,3.5vw,34px);letter-spacing:-.02em;margin:0 0 20px}.prose{white-space:pre-wrap;max-width:72ch;color:#526077;margin:0}.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:36px;padding-left:24px;margin:28px 0 0}.steps li{padding-left:6px}.steps li::marker{font-weight:700}.steps h3{font-size:19px;margin:0 0 10px}.steps p{color:#526077;margin:0}.faq{border-bottom:1px solid #dce2ec;padding:19px 0}.faq:last-child{border-bottom:0}.faq summary{cursor:pointer;font-weight:600}.faq p{margin-top:14px}.layout{padding-top:44px;margin-top:30px;border-top:1px solid #dce2ec}.layout section h2{margin-top:0}footer{margin-top:50px;padding-top:24px;border-top:1px solid #dce2ec;color:#526077;font-size:14px}a:focus-visible,summary:focus-visible,input:focus-visible,textarea:focus-visible,button:focus-visible{outline:3px solid #172033;outline-offset:4px}a:hover{text-decoration:underline}button:hover,.cta:hover{background:#263651}::selection{background:#dce2ec;color:#172033}@media(max-width:700px){.topbar{align-items:flex-start;margin-bottom:30px;gap:16px}.topbar nav{gap:12px}.steps{grid-template-columns:1fr;gap:24px}.content-section{padding:28px 0}.layout{padding-top:28px}header{margin-bottom:36px}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}`;
  const fields = [
    ["name", "Your name", "text", 100, true],
    ["email", "Email address", "email", 254, true],
    ["phone", "Phone (optional)", "tel", 40, false],
    ["device", "Device or app (optional)", "text", 100, false],
  ]
    .map(
      ([key, label, type, max, required]) =>
        `<label for="${key}">${label}</label><input id="${key}" name="${key}" type="${type}" maxlength="${max}" ${required ? "required" : ""} ${key === "name" ? 'minlength="2"' : ""}>`,
    )
    .join("");
  const script = `const form=document.querySelector('form');const button=form.querySelector('button');const id=crypto.randomUUID();form.addEventListener('submit',async event=>{event.preventDefault();if(button.disabled)return;button.disabled=true;button.textContent='Sending…';const message=document.querySelector('#result');message.textContent='';try{const values=Object.fromEntries(new FormData(form));values.id=id;values.referral=new URL(location.href).searchParams.get('ref');values.contact_consent=form.elements.contact_consent.checked;values.marketing_consent=form.elements.marketing_consent.checked;const response=await fetch('/inquiry',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(values)});const result=await response.json();if(!response.ok||!result.success)throw new Error(result.error||'Please try again.');form.hidden=true;message.className='notice';message.textContent='Your inquiry has been received. We will respond using the details you provided.';}catch(error){message.className='error';message.textContent=error.message||'We could not confirm your inquiry. Retry this form or contact us by email.';button.disabled=false;button.textContent='Send inquiry';}});`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="${e(page.description.slice(0, 160))}"><title>${e(page.brand_name)}</title><style nonce="${nonce}">${css}${extraCss}</style></head><body><main>${preview ? '<p class="notice">Private preview — this page is not being published.</p>' : ""}<div class="topbar"><div>${logo}<p class="brand">${e(page.brand_name)}</p></div><nav aria-label="Page navigation">${content.show_steps ? '<a href="#how-it-works">How it works</a>' : ""}<a href="#inquiry">Contact us</a></nav></div><header><h1>${e(page.headline)}</h1><p class="description">${e(page.description)}</p><a class="cta" href="#inquiry">Ask about your options</a></header>${details}<div class="layout" id="inquiry"><aside><h2>Let’s get you set up</h2><p>Tell us about your device and what you need. We’ll confirm compatibility, available options and pricing.</p><p>Submitting an inquiry does not start a trial, purchase a subscription or authorize a payment.</p><p>Contact: <a href="mailto:${e(page.contact_email)}">${e(page.contact_email)}</a></p></aside><section><h2>Ask about service & setup</h2><form>${fields}<label for="message">How can we help? (optional)</label><textarea id="message" name="message" rows="4" maxlength="1000"></textarea><small>Please do not include passwords, playlist links or payment card details.</small><div class="trap" aria-hidden="true"><label for="website">Website</label><input id="website" name="website" tabindex="-1" autocomplete="off"></div><label class="check"><input type="checkbox" name="contact_consent" required><span>I request a response from ${e(page.brand_name)} about this inquiry. My details will be stored privately for this purpose.</span></label><label class="check"><input type="checkbox" name="marketing_consent"><span>Optional: I would also like relevant offers. I can ask you to stop at any time.</span></label><button ${preview ? "disabled" : ""}>${preview ? "Inquiry form disabled in preview" : "Send inquiry"}</button></form><p id="result" role="status" aria-live="polite"></p></section></div><footer>${e(page.brand_name)} · Questions? <a href="mailto:${e(page.contact_email)}">${e(page.contact_email)}</a></footer></main>${preview ? "" : `<script nonce="${nonce}">${script}</script>`}</body></html>`;
  return {
    html,
    csp: `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; connect-src 'self'; img-src data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`,
  };
}
