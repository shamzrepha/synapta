/*
 * Sprout, SunrootLearn's study buddy, as plain SVG you can pose frame by frame (no React, no build step).
 * The shapes and colours are copied from components/bot/sprout.tsx and sprout-gear.tsx so the video matches the app.
 *
 *   const s = createSprout(hostDiv);          // hostDiv sizes it: the drawing fills the box
 *   s.set({ armL: 0, armR: -140, mouth: 0.6, hat: 'grad', mood: 'calm' });
 *
 * set() takes any of: mood, armL, armR (degrees; 0 = out to the side, +/-90 = straight up), lens (0..1), launcher (0..1),
 * mouth (0..1 how open), eyesX/eyesY (-1..1), blink (0..1 closed), lids (0..1, sleepy), hat, face, back, shoes, sparkles (0..1),
 * shadow (0..1), footL / footR (px lift, for running).
 * hat: cap | wizard | crown | headphones | grad    face: glasses | shades    back: cape    shoes: sneakers
 */
(function () {
  const PAL = {
    sleepy: { body: '#8b9bb4', shade: '#6b7c97', arm: '#7a8aa5' },
    calm: { body: '#3b6df6', shade: '#1e3a8a', arm: '#2f5fe0' },
    happy: { body: '#14b8a6', shade: '#0f766e', arm: '#0d9488' },
    fired: { body: '#f97316', shade: '#9a3412', arm: '#ea580c' },
    genius: { body: '#8b5cf6', shade: '#4c1d95', arm: '#7c3aed' },
  };
  const LEAF = '<path d="M50 36 C50 26 49 20 47 14" stroke="#0d9488" stroke-width="3.5" stroke-linecap="round" fill="none"/><path d="M47 15 C36 8 28 13 27 21 C36 24 44 22 47 15 Z" fill="#14b8a6"/><path d="M48 16 C58 6 70 9 72 18 C62 22 52 21 48 16 Z" fill="#0d9488"/>';

  const HATS = {
    cap: '<path d="M26 42 C26 24 74 24 74 42 Z" fill="#ef4444"/><path d="M60 41 C72 40 82 42 86 46 C78 48 66 47 58 45 Z" fill="#b91c1c"/><circle cx="50" cy="28" r="2.6" fill="#fecaca"/>',
    headphones: '<path d="M26 50 C24 22 76 22 74 50" stroke="#1e293b" stroke-width="5" fill="none" stroke-linecap="round"/><rect x="18" y="46" width="12" height="20" rx="6" fill="#334155"/><rect x="70" y="46" width="12" height="20" rx="6" fill="#334155"/><rect x="21" y="50" width="6" height="12" rx="3" fill="#3b6df6"/><rect x="73" y="50" width="6" height="12" rx="3" fill="#3b6df6"/>',
    wizard: '<path d="M24 42 C34 38 66 38 76 42 L64 40 L52 4 L36 40 Z" fill="#6d28d9"/><ellipse cx="50" cy="41" rx="28" ry="5" fill="#5b21b6"/><path d="M50 16 l1.6 4 4 .4 -3 2.8 1 4 -3.6 -2.2 -3.6 2.2 1 -4 -3 -2.8 4 -.4z" fill="#fbbf24"/>',
    crown: '<path d="M30 40 L28 22 L40 30 L50 16 L60 30 L72 22 L70 40 Z" fill="#fbbf24" stroke="#d97706" stroke-width="1.8" stroke-linejoin="round"/><circle cx="50" cy="26" r="2.6" fill="#ef4444"/><circle cx="38" cy="34" r="2" fill="#3b82f6"/><circle cx="62" cy="34" r="2" fill="#10b981"/>',
    // a graduation cap, for the admission video (not in the app's shop): the sprout stays on top
    grad: '<path d="M30 38 L30 47 Q50 56 70 47 L70 38 Q50 46 30 38 Z" fill="#1f2937"/><path d="M50 22 L86 33 L50 45 L14 33 Z" fill="#111827"/><path d="M50 33 L78 35 L78 52" stroke="#fbbf24" stroke-width="2.2" fill="none" stroke-linecap="round"/><circle cx="78" cy="54" r="3" fill="#fbbf24"/>' +
      '<g transform="translate(0,-9) scale(1)"><path d="M50 30 C50 24 49.5 20 48.5 16" stroke="#0d9488" stroke-width="3" stroke-linecap="round" fill="none"/><path d="M48.5 17 C41 12 35 15 34.5 20 C41 22 46.5 21 48.5 17 Z" fill="#14b8a6"/><path d="M49 17.5 C56 10 64 12.5 65 18.5 C58 21.5 51.5 21 49 17.5 Z" fill="#0d9488"/></g>',
  };
  const FACE = {
    glasses: '<g fill="rgba(255,255,255,0.18)" stroke="#334155" stroke-width="2.4"><circle cx="41" cy="58" r="9"/><circle cx="59" cy="58" r="9"/><path d="M32 56 L28 54 M68 56 L72 54" stroke-linecap="round"/></g>',
    shades: '<g><rect x="31" y="52" width="16" height="11" rx="4.5" fill="#0f172a"/><rect x="53" y="52" width="16" height="11" rx="4.5" fill="#0f172a"/><path d="M47 56 L53 56" stroke="#0f172a" stroke-width="2.6"/><path d="M34 55 l5 0" stroke="#e2e8f0" stroke-width="1.5" stroke-linecap="round" opacity="0.7"/></g>',
  };
  const BACK = {
    cape: '<g><path d="M26 56 C14 70 12 92 14 104 C26 98 40 100 50 102 C60 100 74 98 86 104 C88 92 86 70 74 56 Z" fill="#dc2626"/><path d="M26 56 C20 74 20 90 22 100" stroke="#991b1b" stroke-width="2" fill="none" opacity="0.6"/></g>',
  };
  const SHOES = {
    sneakers: (x, id) => `<g id="${id}"><ellipse cx="${x}" cy="98" rx="11" ry="6" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.5"/><path d="M${x - 9} 100 h18" stroke="#ef4444" stroke-width="2.4" stroke-linecap="round"/></g>`,
  };

  let uid = 0;
  window.createSprout = function (host) {
    const id = 's' + uid++;
    const e = (n) => id + n;
    host.innerHTML = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -20 140 152" width="100%" height="100%" style="overflow:visible;display:block">
  <defs><linearGradient id="${e('g')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".5"/><stop id="${e('g2')}" offset="1" stop-color="#1e3a8a" stop-opacity=".6"/></linearGradient></defs>
  <ellipse id="${e('shadow')}" cx="50" cy="104" rx="26" ry="5" fill="rgba(15,23,42,0.32)"/>
  <g id="${e('back')}"></g>
  <g id="${e('leaf')}" style="transform-origin:50px 36px">${LEAF}</g>
  <g id="${e('armL')}" style="transform-origin:26px 66px"><rect id="${e('armLr')}" x="14" y="62" width="14" height="9" rx="4.5"/></g>
  <g id="${e('armR')}" style="transform-origin:74px 66px"><rect id="${e('armRr')}" x="72" y="62" width="14" height="9" rx="4.5"/>
    <g id="${e('launcher')}" opacity="0"><rect x="82" y="58" width="11" height="9" rx="2.6" fill="#334155"/><rect x="85" y="54" width="5" height="6" rx="1.4" fill="#64748b"/><circle cx="87.5" cy="53.2" r="1.9" fill="#f59e0b"/></g>
  </g>
  <rect id="${e('body')}" x="22" y="34" width="56" height="62" rx="26"/>
  <rect x="22" y="34" width="56" height="62" rx="26" fill="url(#${e('g')})" opacity="0.35"/>
  <rect x="28" y="42" width="44" height="34" rx="15" fill="#eef3ff"/>
  <g id="${e('look')}"><g id="${e('eyes')}" style="transform-origin:50px 58px">
    <ellipse cx="41" cy="58" rx="4.6" ry="5.4" fill="#0f172a"/><ellipse cx="59" cy="58" rx="4.6" ry="5.4" fill="#0f172a"/>
    <circle cx="42.6" cy="56" r="1.5" fill="#fff"/><circle cx="60.6" cy="56" r="1.5" fill="#fff"/>
  </g></g>
  <circle cx="35" cy="66" r="3.4" fill="#fda4af" opacity="0.6"/><circle cx="65" cy="66" r="3.4" fill="#fda4af" opacity="0.6"/>
  <path id="${e('smile')}" d="M44 67 Q50 72 56 67" stroke="#0f172a" stroke-width="2.4" stroke-linecap="round" fill="none"/>
  <path id="${e('mouth')}" d="M43.5 66 Q50 78 56.5 66 Z" fill="#0f172a" opacity="0"/>
  <g id="${e('lids')}" opacity="0"><path d="M35 53 h12 M53 53 h12" stroke="#8b9bb4" stroke-width="6" stroke-linecap="round"/></g>
  <ellipse id="${e('footL')}" cx="38" cy="97" rx="9" ry="5"/><ellipse id="${e('footR')}" cx="62" cy="97" rx="9" ry="5"/>
  <g id="${e('shoes')}"></g>
  <g id="${e('face')}"></g>
  <g id="${e('hat')}"></g>
  <g id="${e('lens')}" opacity="0"><circle cx="88" cy="46" r="17" fill="rgba(255,255,255,0.42)" stroke="#334155" stroke-width="4"/><path d="M76 58 L66 70" stroke="#334155" stroke-width="5.5" stroke-linecap="round"/><path d="M80 38 C82 34 86 32 90 32" stroke="#fff" stroke-width="2.6" stroke-linecap="round" fill="none" opacity="0.95"/></g>
  <g id="${e('sparkles')}" fill="#f59e0b" opacity="0"><path d="M12 30 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z"/><path d="M88 24 l1.6 4 4 1.6 -4 1.6 -1.6 4 -1.6 -4 -4 -1.6 4 -1.6z"/><path d="M92 70 l1.2 3 3 1.2 -3 1.2 -1.2 3 -1.2 -3 -3 -1.2 3 -1.2z"/></g>
</svg>`;
    const $ = (n) => host.querySelector('#' + e(n));
    const el = {};
    ['shadow', 'back', 'leaf', 'armL', 'armR', 'armLr', 'armRr', 'launcher', 'body', 'look', 'eyes', 'smile', 'mouth', 'lids', 'footL', 'footR', 'shoes', 'face', 'hat', 'lens', 'sparkles', 'g2'].forEach((n) => (el[n] = $(n)));
    const cache = {};
    const setHTML = (key, node, html) => { if (cache[key] !== html) { cache[key] = html; node.innerHTML = html; } };

    const api = {
      set(p) {
        const mood = PAL[p.mood] || PAL.calm;
        el.body.setAttribute('fill', mood.body);
        el.g2.setAttribute('stop-color', mood.shade);
        ['armLr', 'armRr', 'footL', 'footR'].forEach((n) => el[n].setAttribute('fill', mood.arm));
        el.armL.style.transform = `rotate(${p.armL || 0}deg)`;
        el.armR.style.transform = `rotate(${p.armR || 0}deg)`;
        el.launcher.setAttribute('opacity', p.launcher || 0);
        el.lens.setAttribute('opacity', p.lens || 0);
        el.sparkles.setAttribute('opacity', p.sparkles || 0);
        el.shadow.setAttribute('opacity', p.shadow == null ? 1 : p.shadow);
        el.shadow.setAttribute('rx', 26 * (p.shadow == null ? 1 : 0.6 + 0.4 * p.shadow));
        el.footL.setAttribute('cy', 97 - (p.footL || 0));
        el.footR.setAttribute('cy', 97 - (p.footR || 0));
        // eyes: look around, blink
        const bl = Math.max(0, Math.min(1, p.blink || 0));
        el.eyes.style.transform = `scaleY(${1 - 0.92 * bl})`;
        el.look.style.transform = `translate(${(p.eyesX || 0) * 2.4}px, ${(p.eyesY || 0) * 1.8}px)`;
        el.lids.setAttribute('opacity', p.lids || 0);
        // mouth: a smile at rest, opening with the voice
        const m = Math.max(0, Math.min(1, p.mouth || 0));
        const open = Math.min(1, m * 5);
        el.mouth.setAttribute('d', `M43.5 66 Q50 ${66 + 3 + 13 * m} 56.5 66 Z`);
        el.mouth.setAttribute('opacity', open);
        el.smile.setAttribute('opacity', 1 - open);
        // outfits
        const hat = p.hat || '';
        el.leaf.style.display = !hat || hat === 'crown' ? '' : 'none';
        setHTML('hat', el.hat, HATS[hat] || '');
        setHTML('face', el.face, FACE[p.face] || '');
        setHTML('back', el.back, BACK[p.back] || '');
        const sh = p.shoes === 'sneakers';
        el.footL.style.display = el.footR.style.display = sh ? 'none' : '';
        setHTML('shoes', el.shoes, sh ? SHOES.sneakers(38, e('shL')) + SHOES.sneakers(62, e('shR')) : '');
      },
    };
    api.set({});
    return api;
  };
})();
