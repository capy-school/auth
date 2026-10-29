import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loginFixture } from './helpers/login-fixture.mjs';
import { dashboardChrome } from './helpers/dashboard-chrome.mjs';

const selectors = [
  '.email-field', '.primary-button', '.passkey-button',
  ...['google', 'github', 'microsoft', 'kakao', 'naver', 'line'].map(id => `[data-provider="${id}"]`),
];

test('compiled login A keeps text, boundaries and focus contrast across gradients and interaction states', async context => {
  const fixture = await loginFixture();
  let browser;
  const results = [];
  try {
    const origin = await fixture.listen();
    browser = await dashboardChrome();
    await browser.page('DOM.enable');
    await browser.page('CSS.enable');
    await browser.page('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    for (const width of [1440, 390, 320]) {
      await browser.page('Emulation.setDeviceMetricsOverride', { width, height: 1400, deviceScaleFactor: 1, mobile: false });
      await browser.navigate(origin, `window.__loginCall=async()=>({});window.PublicKeyCredential={isConditionalMediationAvailable:async()=>false};`);
      await browser.evaluate(`new Promise(resolve=>{const ready=()=>document.querySelector('astro-island[ssr]')||document.querySelector('.portal-login').getAttribute('aria-busy')!=='false'?requestAnimationFrame(ready):resolve(true);ready()})`);
      const { root } = await browser.page('DOM.getDocument');
      const { frameTree } = await browser.page('Page.getFrameTree');
      const { styleSheetId } = await browser.page('CSS.createStyleSheet', { frameId: frameTree.frame.id });
      // Preserve the actual composed background while hiding the form's paint.
      await browser.page('CSS.setStyleSheetText', { styleSheetId, text: '.portal-login { visibility: hidden !important; }' });
      const { data } = await browser.page('Page.captureScreenshot', { format: 'png' });
      const backgrounds = await browser.evaluate(`(async () => {
        const image=new Image();image.src='data:image/png;base64,${data}';await image.decode();
        const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
        const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);
        return ${JSON.stringify(selectors)}.map(selector=>{
          const rect=document.querySelector(selector).getBoundingClientRect(),samples=[];
          for(const x of [rect.left-6,rect.left,rect.left+rect.width/2,rect.right,rect.right+6]){
            for(const y of [rect.top-6,rect.top+rect.height/2,rect.bottom+6]){
              samples.push([...ctx.getImageData(Math.round(x),Math.round(y),1,1).data]);
            }
          }
          return samples;
        });
      })()`);
      await browser.page('CSS.setStyleSheetText', { styleSheetId, text: '' });
      for (const [index, selector] of selectors.entries()) {
        const { nodeId } = await browser.page('DOM.querySelector', { nodeId: root.nodeId, selector });
        for (const state of ['normal', 'hover', 'focus', 'pressed']) {
          const forcedPseudoClasses = state === 'normal' ? [] : state === 'focus' ? ['focus', 'focus-visible', 'focus-within'] : state === 'pressed' ? ['hover', 'active'] : ['hover'];
          await browser.page('CSS.forcePseudoState', { nodeId, forcedPseudoClasses });
          const row = await browser.evaluate(`(() => {
            const el=document.querySelector(${JSON.stringify(selector)}),css=getComputedStyle(el);
            const input=el.querySelector('input'),text=input?getComputedStyle(input,'::placeholder'):css;
            const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
            const ctx=canvas.getContext('2d',{willReadFrequently:true});
            function rgba(color){
              ctx.clearRect(0,0,1,1);ctx.fillStyle=color;ctx.fillRect(0,0,1,1);
              return [...ctx.getImageData(0,0,1,1).data];
            }
            function lum(rgb){
              const [r,g,b]=rgb.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4});
              return r*.2126+g*.7152+b*.0722;
            }
            function ratio(a,b){const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
            function over(fg,bg){const a=fg[3]/255;return fg.slice(0,3).map((v,i)=>v*a+bg[i]*(1-a));}
            const page=${JSON.stringify(backgrounds[index])},stops=css.backgroundImage.match(/oklch\\([^)]*\\)/g);
            const paints=stops?Array.from({length:101},(_,n)=>rgba('color-mix(in oklab, '+stops[0]+' '+n+'%, '+stops[1]+')')):[rgba(css.backgroundColor)];
            const fills=paints.flatMap(paint=>page.map(background=>over(paint,background)));
            return {
              text:Math.min(...fills.map(bg=>ratio(rgba(text.color),bg))),
              boundary:Math.min(...page.map(bg=>ratio(rgba(css.borderTopColor),bg))),
              focus:css.outlineStyle==='none'?null:Math.min(...page.map(bg=>ratio(rgba(css.outlineColor),bg)))
            };
          })()`);
          const label = `${width}px ${selector} ${state}`;
          assert.ok(row.text >= 4.5, `${label}: text ${row.text.toFixed(2)}:1`);
          assert.ok(row.boundary >= 3, `${label}: boundary ${row.boundary.toFixed(2)}:1`);
          if (state === 'focus') assert.ok(row.focus >= 3, `${label}: focus ${row.focus?.toFixed(2) ?? 'missing'}:1`);
          results.push({ ...row, state });
        }
        await browser.page('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] });
      }
    }
    assert.equal(results.length, 108);
    assert.deepEqual(browser.exceptions, []);
    context.diagnostic(`108 combinations; minimum text ${Math.min(...results.map(row=>row.text)).toFixed(2)}:1, boundary ${Math.min(...results.map(row=>row.boundary)).toFixed(2)}:1, focus ${Math.min(...results.filter(row=>row.state==='focus').map(row=>row.focus)).toFixed(2)}:1`);
  } finally { try { await browser?.close(); } finally { await fixture.close(); } }
});

test('compact provider icons fit their wrappers without covering adjacent labels', async () => {
  const fixture = await loginFixture();
  let browser;
  try {
    const origin = await fixture.listen();
    browser = await dashboardChrome();
    await browser.navigate(origin, `window.__loginCall=async()=>({});`);
    const overflow = await browser.evaluate(`(() => {
      return [...document.querySelectorAll('.providers .auth-icon')].filter(icon=>{
        const wrapper=icon.getBoundingClientRect(),svg=icon.querySelector('svg').getBoundingClientRect();
        return svg.width>wrapper.width||svg.height>wrapper.height;
      }).map(icon=>icon.parentElement.dataset.provider);
    })()`);
    assert.deepEqual(overflow, []);
  } finally { try { await browser?.close(); } finally { await fixture.close(); } }
});
