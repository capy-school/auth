import assert from 'node:assert/strict';

const selectors = [
  '.email-field', '.primary-button', '.passkey-button',
  ...['google', 'github', 'microsoft', 'kakao', 'naver', 'line'].map(id => `[data-provider="${id}"]`),
];

// Same painted-gradient audit as the approved Astro reference, on the real Kit
// bundle. It can also exercise the exact assets served by the scratch image.
export async function auditLoginContrast(browser, origin, { screenshot } = {}) {
  const results = [];
  await browser.page('DOM.enable');
  await browser.page('CSS.enable');
  await browser.page('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  for (const width of [1440, 390, 320]) {
    await browser.page('Emulation.setDeviceMetricsOverride', { width, height: 1400, deviceScaleFactor: 1, mobile: false });
    await browser.navigate(origin, 'localStorage.clear();');
    await browser.evaluate(`new Promise((resolve,reject)=>{const end=performance.now()+10000;const ready=()=>{if(document.querySelector('.portal-login')?.getAttribute('aria-busy')==='false')return resolve(true);if(performance.now()>end)return reject(new Error('Login did not hydrate'));requestAnimationFrame(ready)};ready()})`);
    if (screenshot) await screenshot(width, (await browser.page('Page.captureScreenshot', { format: 'png' })).data);
    const { root } = await browser.page('DOM.getDocument');
    const { frameTree } = await browser.page('Page.getFrameTree');
    const { styleSheetId } = await browser.page('CSS.createStyleSheet', { frameId: frameTree.frame.id });
    await browser.page('CSS.setStyleSheetText', { styleSheetId, text: '.portal-login { visibility: hidden !important; }' });
    const { data } = await browser.page('Page.captureScreenshot', { format: 'png' });
    const backgrounds = await browser.evaluate(`(async()=>{
      const image=new Image();image.src='data:image/png;base64,${data}';await image.decode();
      const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
      const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);
      return ${JSON.stringify(selectors)}.map(selector=>{
        const rect=document.querySelector(selector).getBoundingClientRect(),samples=[];
        for(const x of [rect.left-6,rect.left,rect.left+rect.width/2,rect.right,rect.right+6])for(const y of [rect.top-6,rect.top+rect.height/2,rect.bottom+6])samples.push([...ctx.getImageData(Math.round(x),Math.round(y),1,1).data]);
        return samples;
      });
    })()`);
    await browser.page('CSS.setStyleSheetText', { styleSheetId, text: '' });
    for (const [index, selector] of selectors.entries()) {
      const { nodeId } = await browser.page('DOM.querySelector', { nodeId: root.nodeId, selector });
      for (const state of ['normal', 'hover', 'focus', 'pressed']) {
        const forcedPseudoClasses = state === 'normal' ? [] : state === 'focus' ? ['focus', 'focus-visible', 'focus-within'] : state === 'pressed' ? ['hover', 'active'] : ['hover'];
        await browser.page('CSS.forcePseudoState', { nodeId, forcedPseudoClasses });
        const row = await browser.evaluate(`(()=>{
          const el=document.querySelector(${JSON.stringify(selector)}),css=getComputedStyle(el);
          const input=el.querySelector('input'),text=input?getComputedStyle(input,'::placeholder'):css;
          const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
          const ctx=canvas.getContext('2d',{willReadFrequently:true});
          function rgba(color){ctx.clearRect(0,0,1,1);ctx.fillStyle=color;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data];}
          function lum(rgb){const [r,g,b]=rgb.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4});return r*.2126+g*.7152+b*.0722;}
          function ratio(a,b){const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
          function over(fg,bg){const a=fg[3]/255;return fg.slice(0,3).map((v,i)=>v*a+bg[i]*(1-a));}
          const page=${JSON.stringify(backgrounds[index])},stops=css.backgroundImage.match(/oklch[(][^)]*[)]/g);
          const paints=stops?Array.from({length:101},(_,n)=>rgba('color-mix(in oklab, '+stops[0]+' '+n+'%, '+stops[1]+')')):[rgba(css.backgroundColor)];
          const fills=paints.flatMap(paint=>page.map(background=>over(paint,background)));
          return {text:Math.min(...fills.map(bg=>ratio(rgba(text.color),bg))),boundary:Math.min(...page.map(bg=>ratio(rgba(css.borderTopColor),bg))),focus:css.outlineStyle==='none'?null:Math.min(...page.map(bg=>ratio(rgba(css.outlineColor),bg)))};
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
  return results;
}
