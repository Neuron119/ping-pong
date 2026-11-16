/* Local geometry and procedural textures. No external assets or requests. */
(function (root) {
  'use strict';
  const SCENES = Object.freeze({
    club: { name: '室内球馆', sky: '#dcded1', fog: '#dedfd3', sun: '#fff0d0', ground: '#9aab96', ambient: '#fffcdf', intensity: 3.8, exposure: 1.15 },
    park: { name: '户外公园', sky: '#bcd7df', fog: '#c1d7cd', sun: '#ffedc5', ground: '#819474', ambient: '#e5f4fb', intensity: 3.7, exposure: 1.08 },
    coast: { name: '海边球场', sky: '#b5dbe8', fog: '#c0dfe8', sun: '#fff0c9', ground: '#acaa92', ambient: '#e9f8ff', intensity: 4.0, exposure: 1.05 },
    rooftop: { name: '屋顶球场', sky: '#b9b4ce', fog: '#b9b7cd', sun: '#ffca9b', ground: '#777f92', ambient: '#e5e2ff', intensity: 3.2, exposure: 1.13 }
  });
  const MODEL_NAMES = Object.freeze({ classic: '经典圆拍', attack: '进攻方肩拍', jpen: '日式方拍' });
  let rubberMap, woodMap;
  const mat = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: .8, ...options });
  function tex(draw) {
    const c = document.createElement('canvas'); c.width = c.height = 256; draw(c.getContext('2d'));
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  function cube(group, x, y, z, sx, sy, sz, color, options) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat(color, options));
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; group.add(m); return m;
  }
  function rod(group, x, y, z, radius, height, color, top = radius) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(top, radius, height, 12), mat(color));
    m.position.set(x, y, z); m.castShadow = true; group.add(m); return m;
  }
  function sphere(group, x, y, z, radius, color, sx = 1, sy = 1, sz = 1) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(radius, 12, 9), mat(color));
    m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; group.add(m); return m;
  }
  function bladeShape(model) {
    const s = new THREE.Shape();
    if (model === 'jpen') {
      s.moveTo(-.105, -.145); s.quadraticCurveTo(-.14, -.14, -.14, -.1);
      s.lineTo(-.14, .12); s.quadraticCurveTo(-.14, .165, -.10, .17);
      s.lineTo(.10, .17); s.quadraticCurveTo(.14, .165, .14, .12);
      s.lineTo(.14, -.1); s.quadraticCurveTo(.14, -.14, .105, -.145); s.lineTo(-.105, -.145);
    } else if (model === 'attack') {
      s.moveTo(0, -.164); s.bezierCurveTo(-.09, -.164, -.157, -.09, -.157, .045);
      s.bezierCurveTo(-.157, .14, -.105, .171, -.063, .176); s.lineTo(.063, .176);
      s.bezierCurveTo(.105, .171, .157, .14, .157, .045); s.bezierCurveTo(.157, -.09, .09, -.164, 0, -.164);
    } else s.absellipse(0, 0, .153, .169, 0, Math.PI * 2, false);
    return s;
  }
  function createPaddle(model = 'classic', color = '#405f4b', isPlayer = true) {
    if (!rubberMap) rubberMap = tex(ctx => {
      ctx.fillStyle = '#f1f1f1'; ctx.fillRect(0, 0, 256, 256);
      for (let y = 0; y < 256; y += 5) for (let x = 0; x < 256; x += 5) {
        ctx.fillStyle = ((x + y) % 3) ? '#d9d9d9' : '#e6e6e6'; ctx.beginPath(); ctx.arc(x + (y % 2) * 2, y, .8, 0, Math.PI * 2); ctx.fill();
      }
    });
    if (!woodMap) woodMap = tex(ctx => {
      ctx.fillStyle = '#dfbe8a'; ctx.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 65; i++) { ctx.strokeStyle = `rgba(94,57,24,${.05 + (i % 6) * .014})`; ctx.beginPath(); ctx.moveTo(i * 4, 0); ctx.bezierCurveTo(i * 4 + 6, 80, i * 4 - 4, 160, i * 4 + 2, 256); ctx.stroke(); }
    });
    const g = new THREE.Group(); g.name = isPlayer ? 'player-paddle' : 'ai-paddle'; g.userData.model = model;
    const shape = bladeShape(model), wood = mat('#fff4dc', { map: woodMap, roughness: .65 });
    function layer(z, depth, scale, material, name) {
      const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 28, steps: 1 });
      const mesh = new THREE.Mesh(geometry, material); mesh.scale.set(scale, scale, 1); mesh.position.z = z;
      mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = name || 'blade-layer'; g.add(mesh); return mesh;
    }
    layer(-.009, .018, 1, wood);
    for (const z of [-.006, -.002, .002, .006]) layer(z, .0012, 1.002, mat('#795738'));
    layer(-.012, .003, .984, mat('#d3a147')); layer(.009, .003, .984, mat('#d3a147'));
    const rubber = mat(color, { map: rubberMap, roughness: .9 });
    layer(.012, .0035, .977, rubber, 'rubber-front'); layer(-.0155, .0035, .977, mat('#252a2a', { map: rubberMap, roughness: .9 }), 'rubber-back');
    // Thin dark edge tape is a ring, leaving wood plies visible from the side.
    const ring = bladeShape(model), hole = new THREE.Path();
    const pts = shape.getPoints(64); hole.setFromPoints(pts.map(p => p.clone().multiplyScalar(.986))); ring.holes.push(hole);
    const edge = new THREE.Mesh(new THREE.ExtrudeGeometry(ring, { depth: .003, bevelEnabled: false, curveSegments: 28 }), mat('#334039'));
    edge.position.z = .008; g.add(edge);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(model === 'jpen' ? .056 : .048, .17, .042), wood);
    handle.position.set(0, -.225, 0); handle.name = 'wood-handle'; handle.castShadow = true; g.add(handle);
    for (const x of [-.018, .018]) cube(g, x, -.23, .023, .008, .151, .004, '#36584d');
    cube(g, 0, -.309, 0, .055, .012, .045, '#283e36', { metalness: .22, roughness: .4 });
    cube(g, 0, -.15, .025, .049, .024, .008, model === 'jpen' ? '#b58a54' : '#b59d69');
    if (model === 'jpen') cube(g, 0, -.168, -.034, .062, .052, .025, '#c3a06e');
    const emblem = tex(ctx => { ctx.fillStyle = '#e5eacc'; ctx.font = 'bold 75px Arial'; ctx.textAlign = 'center'; ctx.fillText('P.', 128, 130); ctx.font = '19px Arial'; ctx.fillText('PING CLUB', 128, 165); });
    const badge = new THREE.Mesh(new THREE.PlaneGeometry(.105, .105), new THREE.MeshBasicMaterial({ map: emblem, transparent: true, depthWrite: false }));
    badge.position.set(0, -.045, .0162); badge.name = 'paddle-badge'; g.add(badge);
    return g;
  }
  function setPaddleColor(g, color) { g.getObjectByName('rubber-front')?.material.color.set(color); }
  function disposePaddle(g) {
    const geometries = new Set(), materials = new Set();
    g.traverse(o => { if (o.geometry) geometries.add(o.geometry); if (o.material) materials.add(o.material); });
    for (const geometry of geometries) geometry.dispose();
    for (const m of materials) { if (m.map && m.map !== rubberMap && m.map !== woodMap) m.map.dispose(); m.dispose(); }
    g.removeFromParent();
  }
  function createOutdoor(key) {
    const g = new THREE.Group(); g.name = `environment-${key}`;
    const floor = key === 'park' ? '#9aaf7d' : key === 'coast' ? '#dfcda7' : '#9c9b9d';
    cube(g, 0, -.07, 0, 23, .14, 24, floor);
    const court = cube(g, 0, .005, 0, 4.4, .01, 7.2, key === 'park' ? '#689b90' : key === 'coast' ? '#75a8ad' : '#64768d');
    court.name = 'outdoor-court';
    for (const x of [-1.9, 1.9]) cube(g, x, .013, 0, .024, .004, 6.6, '#e1e7da');
    for (const z of [-3.3, 3.3]) cube(g, 0, .013, z, 3.82, .004, .024, '#e1e7da');
    function bench(x, z) { cube(g, x, .43, z, 1.4, .065, .36, '#a68969'); for (const dx of [-.5, .5]) cube(g, x + dx, .22, z, .055, .42, .3, '#59645f'); cube(g, x, .7, z - .16, 1.4, .2, .04, '#af9271'); }
    if (key === 'park') {
      bench(2.85, -2.7); bench(-2.8, -4.1);
      for (let i = 0; i < 10; i++) {
        const x = i < 6 ? -6 + i * 2.1 : i % 2 ? -4.5 : 4.5, z = i < 6 ? -5.8 - (i % 2) : -1 + (i - 6) * 2.3;
        rod(g, x, 1.2, z, .13, 2.4, '#8c7760', .09);
        sphere(g, x, 2.7, z, .95, i % 2 ? '#77946d' : '#879f73', 1, 1.18, 1);
        sphere(g, x + .45, 2.6, z + .12, .6, '#6f9069');
      }
      for (let i = 0; i < 6; i++) cube(g, -5 + i * 2, .38, -4.9, 1.8, .7, .5, '#799568');
      for (const x of [-2.65, 2.65]) { rod(g, x, 1.5, -3.5, .035, 3, '#52645e'); sphere(g, x, 3.05, -3.5, .16, '#e7ebd0'); }
    } else if (key === 'coast') {
      // Water begins beyond the sand and does not overlap the playing surface.
      cube(g, 0, -.065, -18, 50, .018, 20, '#69b4c5', { roughness: .5 });
      for (let i = 0; i < 9; i++) cube(g, 0, -.05, -8.3 - i * 1.0, 35, .007, .025 + (i % 3) * .02, '#b7d9d4');
      for (const x of [-3.2, 3.6]) {
        rod(g, x, 1.3, -3, .075, 2.6, '#a48b6b', .045);
        for (let i = 0; i < 6; i++) {
          const angle = i * Math.PI / 3, leaf = sphere(g, x + Math.cos(angle) * .45, 2.62, -3 + Math.sin(angle) * .45, .6, '#688b77', 1.6, .12, .40);
          leaf.rotation.y = -angle;
        }
      }
      bench(3.15, -1.2);
      rod(g, -3.0, 1.15, -.8, .028, 2.3, '#d6cbb3');
      const umbrella = new THREE.Mesh(new THREE.ConeGeometry(.95, .42, 12), mat('#e0a378'));
      umbrella.position.set(-3, 2.32, -.8); g.add(umbrella);
      cube(g, -3, .3, -.8, .65, .05, 1.3, '#e5dfc9');
    } else {
      // Railings leave the city visible while keeping the court visually clear.
      for (const x of [-3.5, 3.5]) {
        cube(g, x, .50, 0, .12, 1, 8.2, '#8c939b'); cube(g, x, 1.05, 0, .055, .055, 8.2, '#4e5f70', { metalness: .45 });
      }
      cube(g, 0, .5, -4.1, 7.1, 1, .12, '#969ba4'); cube(g, 0, 1.05, -4.1, 7.2, .05, .05, '#4e5f70');
      for (let i = 0; i < 16; i++) {
        const x = -15 + i * 2, h = 1.9 + ((i * 17) % 13) * .26, z = -8.8 - i % 3 * 1.5;
        cube(g, x, h / 2 - .5, z, 1.3, h, 1.7, i % 2 ? '#8995a9' : '#9a9daf');
        for (let row = 0; row < Math.floor(h / .5); row++) for (const dx of [-.37, 0, .37]) cube(g, x + dx, row * .47, z + .858, .11, .20, .007, row % 3 ? '#d6c5ab' : '#b9b7c2');
      }
      bench(2.6, -2.6);
      for (const x of [-2.8, 2.8]) { cube(g, x, .27, -3.6, .7, .54, .6, '#717d82'); sphere(g, x, .8, -3.6, .45, '#718879', 1, 1.1, 1); }
    }
    return g;
  }
  root.PingVisuals = Object.freeze({ SCENES, MODEL_NAMES, createPaddle, setPaddleColor, disposePaddle, createOutdoor });
})(typeof globalThis !== 'undefined' ? globalThis : this);
