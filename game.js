/* PING — everything is local: no modules, requests, accounts, or build step. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const { C, LEVELS, STYLES, Simulation, clamp, strokeContext } = PingPhysics;
  const { ROSTER, AXES, get: character } = PingCharacters;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const storageKey = 'ping-club-v1';
  let storageAvailable = true, saved = {};
  try { saved = JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch (_) { storageAvailable = false; }
  const settings = Object.assign({ sound: true, haptics: true, hints: true, arms: true, sensitivity: 1, offset: 54, outline: true, quality: 'balanced', adaptive: true, ballSize: 1.2, ballColor: '#fff5df', paddleModel: 'athlete', paddleColor: '#b83e3e', scene: 'club', landing: true, trail: true, swingRecognition: 'standard', playerGrip:'auto', aiGrip:'auto', playerHand:'auto', aiHand:'auto',playerBlade:'auto',aiBlade:'auto' }, saved.settings || {});
  for(const side of ['player','ai']) {
    if(!['auto','shakehand','penhold'].includes(settings[side+'Grip']))settings[side+'Grip']='auto';
    if(!['auto','right','left'].includes(settings[side+'Hand']))settings[side+'Hand']='auto';
    if(settings[side+'Blade']!=='auto'&&!PingCharacters.BLADES[settings[side+'Blade']])settings[side+'Blade']='auto';
  }
  if(!['easy','standard','firm'].includes(settings.swingRecognition))settings.swingRecognition='standard';
  settings.offset=clamp(Number(settings.offset)||0,0,120);
  if(!PingQuality.PRESETS[settings.quality])settings.quality='balanced';
  settings.ballSize = clamp(Number(settings.ballSize) || 1.2, 1, 1.8);
  for (const key of ['ballColor', 'paddleColor']) if (!/^#[0-9a-f]{6}$/i.test(settings[key])) settings[key] = key === 'ballColor' ? '#fff5df' : '#405f4b';
  if (!PingVisuals.SCENES[settings.scene]) settings.scene = 'club';
  if (!PingVisuals.MODEL_NAMES[settings.paddleModel]) settings.paddleModel = 'classic';
  if (saved.settings && saved.settings.hints === false) {
    if (saved.settings.landing === undefined) settings.landing = false;
    if (saved.settings.trail === undefined) settings.trail = false;
  }
  const quality = new PingQuality.Governor(settings.quality,settings.adaptive);
  let mode = ['rally','slow','serve'].includes(saved.mode) ? saved.mode : 'match';
  let aiStyle = saved.charactersVersion === 1 && STYLES[saved.aiStyle] ? saved.aiStyle : 'character';
  let selectedCharacters=PingCharacters.pair(saved.playerCharacter,saved.aiCharacter);
  const stats = Object.assign({ matches: 0, wins: 0, bestRally: 0, levels: {}, history: [] }, saved.stats || {});
  let difficulty = LEVELS[saved.difficulty] ? saved.difficulty : 'beginner';
  let bestOf = saved.bestOf === 3 ? 3 : 1;
  let matchDifficulty = difficulty, matchStartedAt = 0, matchRecorded = false;
  let paused = false, running = false, modalPaused = false, gameEndAt = 0, resultShown = false;
  const audio = new PingAudio.Engine();
  audio.setEnabled(settings.sound);
  let lastTime = performance.now(), accumulator = 0;
  let netImpact=0, netImpactX=0;
  let impact = 0, aiImpact = 0, cameraShake = 0, spinUntil = 0, letUntil = 0,signatureUntil=0;
  let pointer = null, initialized = false, landscapeEnds = 0, lastRender = 0;
  const sim = new Simulation({ onEvent: handleEvent });

  function equipmentOverrides() {
    return Object.fromEntries(['player','ai'].map(side=>[side,{hand:settings[side+'Hand'],grip:settings[side+'Grip']}]));
  }
  function currentEquipment(side) {
    return running?sim.equipment[side]:PingCharacters.equipment(selectedCharacters[side],equipmentOverrides()[side]);
  }
  function currentBlade(side) { return PingCharacters.blade((running?sim.characters:selectedCharacters)[side],settings[side+'Blade']); }
  function syncEquipment() {
    if(running)sim.setEquipment(equipmentOverrides());
    for(const side of ['player','ai']) {
      $('setting-'+side+'-grip').value=settings[side+'Grip'];
      $('setting-'+side+'-hand').value=settings[side+'Hand'];
      $('setting-'+side+'-blade').value=settings[side+'Blade'];
      const p=character((running?sim.characters:selectedCharacters)[side]),e=currentEquipment(side);
      $('setting-'+side+'-equipment').textContent=`${p.name} · ${e.hand==='left'?'左手':'右手'}${e.grip==='penhold'?'直拍':'横拍'}${settings[side+'Grip']==='auto'&&settings[side+'Hand']==='auto'?' · 跟随选手':' · 自定义'}`;
      const blade=currentBlade(side);
      $('setting-'+side+'-blade-note').textContent=blade.name+(p.id==='liang-jingkun'&&settings[side+'Blade']==='auto'?' · 未确认真实底板，使用自定义外观':'');
    }
    if(scene&&playerPaddle)applyAppearance();
  }

  function save() {
    try { localStorage.setItem(storageKey, JSON.stringify({ settings, stats, difficulty, bestOf, mode, aiStyle, charactersVersion:1, playerCharacter:selectedCharacters.player, aiCharacter:selectedCharacters.ai, tutorialSeen: Boolean(saved.tutorialSeen) })); }
    catch (_) { storageAvailable = false; }
  }
  function initSound() {
    audio.setEnabled(settings.sound);
    if (settings.sound) audio.unlock();
  }
  function sound(type, detail) {
    if (settings.sound) audio.play(type, detail);
  }

  const court = $('court'), canvas = $('game-canvas');
  let renderer, scene, camera, tableGroup, ballMesh, ballOutline, ballShadow, playerPaddle, aiPaddle, playerArm, aiArm, landingRing, contactRing, bounceRing, trailLine, sun, hemisphere, fillLight, indoorEnvironment, netVisual;
  const environments = {};
  let landingCache=null, landingAt=-1;
  let trailPoints = [], trailPositions = new Float32Array(18 * 3);
  let courtWidth = 1, courtHeight = 1;
  const v3 = typeof THREE !== 'undefined' ? new THREE.Vector3() : null;
  const raycaster = typeof THREE !== 'undefined' ? new THREE.Raycaster() : null;
  const controlPlane = typeof THREE !== 'undefined' ? new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.08) : null;
  const cameraTarget = typeof THREE !== 'undefined' ? new THREE.Vector3() : null;

  function material(color, options = {}) { return new THREE.MeshStandardMaterial({ color, roughness: .75, ...options }); }
  function box(parent, width, height, depth, color, x = 0, y = 0, z = 0, options = {}) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), typeof color === 'object' ? color : material(color, options));
    mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  function cylinder(parent, radius, height, color, x, y, z, topRadius = radius, segments = 20) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(topRadius, radius, height, segments), typeof color === 'object' ? color : material(color));
    mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  function texture(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); return t;
  }
  function textPlane(parent, text, width, height, x, y, z, color = '#5f705e', bg = null, fontSize = 70) {
    const t = texture(1024, 256, ctx => { if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, 1024, 256); } ctx.fillStyle = color; ctx.font = `500 ${fontSize}px Arial`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 512, 128); });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: t, transparent: !bg, depthWrite: false }));
    mesh.position.set(x, y, z); parent.add(mesh); return mesh;
  }
  function createPaddle(isPlayer) {
    const side=isPlayer?'player':'ai',profile=currentBlade(side),grip=currentEquipment(side).grip;
    const model=isPlayer&&settings.paddleModel!=='athlete'?settings.paddleModel:profile.shape;
    const g = PingVisuals.createPaddle(model,isPlayer?settings.paddleColor:'#b83e3e',isPlayer,{profile,grip});
    g.userData.signature=[model,profile.id,grip].join(':');
    scene.add(g); return g;
  }
  function applyAppearance() {
    const color = settings.ballColor;
    $('ball-preview').style.setProperty('--ball-color', color);
    $('ball-preview').style.setProperty('--ball-size', settings.ballSize);
    $('ball-preview').querySelector('span').textContent = `显示大小 ${Math.round(settings.ballSize * 100)}% · 碰撞范围保持一致`;
    if (!ballMesh) return;
    ballMesh.scale.setScalar(settings.ballSize); ballMesh.material.color.set(color);
    ballMesh.material.emissive.set(color); ballMesh.material.emissiveIntensity = .045;
    trailLine.material.color.set(color);
    for(const side of ['player','ai']) {
      const old=side==='player'?playerPaddle:aiPaddle,profile=currentBlade(side),grip=currentEquipment(side).grip;
      const model=side==='player'&&settings.paddleModel!=='athlete'?settings.paddleModel:profile.shape;
      if(old.userData.signature!==[model,profile.id,grip].join(':')) {
        const next=createPaddle(side==='player');next.position.copy(old.position);next.rotation.copy(old.rotation);PingVisuals.disposePaddle(old);
        if(side==='player')playerPaddle=next;else aiPaddle=next;
      }else PingVisuals.setPaddleColor(old,side==='player'?settings.paddleColor:'#b83e3e');
    }
  }
  function applyScene() {
    $('scene-select').value = settings.scene; $('setting-scene').value = settings.scene;
    if (!scene || !sun) return;
    if (settings.scene !== 'club' && !environments[settings.scene]) {
      environments[settings.scene] = PingVisuals.createOutdoor(settings.scene); scene.add(environments[settings.scene]);
    }
    for (const [key, environment] of Object.entries(environments)) environment.visible = key === settings.scene;
    indoorEnvironment.visible = settings.scene === 'club';
    const theme = PingVisuals.SCENES[settings.scene];
    scene.background.set(theme.sky); scene.fog.color.set(theme.fog);
    scene.fog.near = settings.scene === 'club' ? 8 : 16; scene.fog.far = settings.scene === 'club' ? 18 : 36;
    hemisphere.color.set(theme.ambient); hemisphere.groundColor.set(theme.ground); hemisphere.intensity = settings.scene === 'club' ? 1.65 : 2.1;
    sun.color.set(theme.sun); sun.intensity = theme.intensity; renderer.toneMappingExposure = theme.exposure;
    fillLight.intensity = settings.scene === 'rooftop' ? 1.15 : .8;
    renderer.shadowMap.needsUpdate = true;
    const label = document.querySelector('.court-number'); if (label) label.textContent = theme.name;
  }
  function initScene() {
    try {
      if (typeof THREE === 'undefined') throw new Error('THREE unavailable');
      renderer = new THREE.WebGLRenderer({ canvas, antialias: devicePixelRatio < 2, powerPreference: 'high-performance', alpha: false });
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.8));
      renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
      scene = new THREE.Scene(); scene.background = new THREE.Color('#dcded1'); scene.fog = new THREE.Fog('#dedfd3', 8, 18);
      camera = new THREE.PerspectiveCamera(42, 1, .05, 35); camera.position.set(3.05, 3.25, 4.25); camera.lookAt(0, .58, 0);
      hemisphere = new THREE.HemisphereLight('#fffcdf', '#9aab96', 2.3); scene.add(hemisphere);
      sun = new THREE.DirectionalLight('#fff0d0', 3.8); sun.position.set(-3, 6.5, 3); sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.left = -4; sun.shadow.camera.right = 4; sun.shadow.camera.top = 4; sun.shadow.camera.bottom = -4; sun.shadow.camera.near = .1; sun.shadow.camera.far = 14; sun.shadow.normalBias = .025; sun.shadow.bias = -.0002; sun.shadow.radius = 4; scene.add(sun);
      fillLight = new THREE.DirectionalLight('#c4e0ef', .8); fillLight.position.set(3, 3, -2); scene.add(fillLight);
      indoorEnvironment = new THREE.Group(); indoorEnvironment.name = 'environment-club'; scene.add(indoorEnvironment);

      const floorTexture = texture(1024, 1024, (ctx, w, h) => {
        ctx.fillStyle = '#cbb695'; ctx.fillRect(0, 0, w, h);
        let seed = 375; const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
        for (let row = 0; row < 18; row++) {
          const rowY = row * h / 18, offset = row % 3 * 95;
          for (let j = -1; j < 5; j++) {
            const x = j * 300 + offset;
            ctx.fillStyle = `hsl(${34 + rand() * 5} ${25 + rand() * 9}% ${67 + rand() * 8}%)`; ctx.fillRect(x + 1, rowY + 1, 298, h / 18 - 1);
            for (let n = 0; n < 16; n++) { ctx.strokeStyle = `rgba(103,76,45,${rand() * .075})`; ctx.beginPath(); const y = rowY + rand() * 55; ctx.moveTo(x, y); ctx.bezierCurveTo(x + 100, y - 2, x + 200, y + 3, x + 299, y); ctx.stroke(); }
          }
        }
      });
      floorTexture.wrapS = floorTexture.wrapT = THREE.RepeatWrapping; floorTexture.repeat.set(3, 3);
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(22, 22), material('#fff', { map: floorTexture, roughness: .88 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; indoorEnvironment.add(floor);
      const floorLine = material('#e9e9d7');
      box(indoorEnvironment, .025, .003, 6.6, floorLine, -1.75, .003, 0); box(indoorEnvironment, .025, .003, 6.6, floorLine, 1.75, .003, 0);
      box(indoorEnvironment, 3.525, .003, .025, floorLine, 0, .003, -3.3); box(indoorEnvironment, 3.525, .003, .025, floorLine, 0, .003, 3.3);
      // Pale plaster, sage skirting, and a sunlit window wall create a small club.
      box(indoorEnvironment, 12, 4.2, .15, '#dedfd1', 0, 2.1, -4.4);
      box(indoorEnvironment, 12, .84, .17, '#a6b3a0', 0, .42, -4.3);
      box(indoorEnvironment, 12, .035, .2, '#879f87', 0, .85, -4.28);
      box(indoorEnvironment, .12, 4.2, 12, '#e5e4d5', -4.6, 2.1, 0);
      box(indoorEnvironment, .14, .84, 12, '#afbaa5', -4.51, .42, 0);
      for (let i = 0; i < 3; i++) {
        box(indoorEnvironment, 1.33, 1.55, .035, '#b6c4bc', -2.9 + i * 1.67, 2.22, -4.3);
        box(indoorEnvironment, 1.23, 1.45, .04, material('#e5ecdf', { emissive: '#c3d4be', emissiveIntensity: .3 }), -2.9 + i * 1.67, 2.22, -4.27);
        box(indoorEnvironment, .035, 1.5, .05, '#9daea0', -2.9 + i * 1.67, 2.22, -4.23);
        box(indoorEnvironment, 1.25, .035, .05, '#9daea0', -2.9 + i * 1.67, 2.22, -4.23);
        box(indoorEnvironment, 1.45, .045, .22, '#b9bfab', -2.9 + i * 1.67, 1.43, -4.17);
      }
      textPlane(indoorEnvironment, 'PING.  CLUB', 2.0, .50, 2.65, 2.18, -4.30, '#6e826a', null, 76);
      textPlane(indoorEnvironment, 'A LITTLE PLAY, EVERY DAY.', 1.8, .28, 2.65, 1.85, -4.30, '#8f9e82', null, 42);
      const bench = new THREE.Group(); indoorEnvironment.add(bench);
      box(bench, 1.6, .07, .42, '#a58b67', 2.65, .43, -3.1);
      box(bench, .07, .43, .33, '#63715e', 2.03, .215, -3.1); box(bench, .07, .43, .33, '#63715e', 3.27, .215, -3.1);
      box(bench, 1.6, .23, .045, '#b29b76', 2.65, .75, -3.27);
      const towel = box(bench, .38, .018, .35, '#e1e2c8', 2.2, .477, -3.08); towel.rotation.y = .12;
      cylinder(indoorEnvironment, .055, .25, '#7c9b8e', 2.83, .59, -3.10); cylinder(indoorEnvironment, .041, .025, '#d8d5b9', 2.83, .73, -3.10);
      // A small plant and ball basket are built from geometry, so they work offline.
      cylinder(indoorEnvironment, .23, .46, '#d1c5ab', -2.75, .23, -2.7, .28);
      for (let i = 0; i < 11; i++) {
        const leaf = new THREE.Mesh(new THREE.SphereGeometry(.19, 9, 7), material(i % 2 ? '#6c8d68' : '#859c75'));
        const angle = i * 2.4; leaf.position.set(-2.75 + Math.cos(angle) * .24, .65 + (i % 4) * .14, -2.7 + Math.sin(angle) * .23); leaf.scale.set(.43, 1.6, .9); leaf.rotation.z = Math.cos(angle) * .6; leaf.rotation.x = Math.sin(angle) * .5; leaf.castShadow = true; indoorEnvironment.add(leaf);
      }
      const basket = new THREE.Group(); basket.position.set(2.1, 0, -.6); indoorEnvironment.add(basket);
      box(basket, .39, .055, .35, '#74836b', 0, .58, 0);
      for (const x of [-.16,.16]) for (const z of [-.14,.14]) box(basket, .018, .6, .018, '#7e8873', x, .3, z);
      for (let i = 0; i < 7; i++) { box(basket, .012, .22, .35, '#8b957e', -.18 + i * .06, .72, 0); box(basket, .39, .012, .012, '#8b957e', 0, .63 + i * .03, .175); }
      for (let i = 0; i < 12; i++) { const smallBall = new THREE.Mesh(new THREE.SphereGeometry(.025, 10, 8), material('#f2efdb')); smallBall.position.set((i % 4 - 1.5) * .07, .63 + Math.floor(i / 8) * .05, (Math.floor(i / 4) % 2 - .5) * .1); basket.add(smallBall); }

      tableGroup = new THREE.Group(); scene.add(tableGroup);
      // One solid tabletop: overlapping blue and edge boxes previously put two
      // top faces at tableY, so depth rounding made them alternate on screen.
      const tableEdge = material('#213e52',{roughness:.56,metalness:.18});
      const tableMap=texture(512,512,(ctx,w,h)=>{
        ctx.fillStyle='#f1f3f1';ctx.fillRect(0,0,w,h);
        for(let i=0;i<8000;i++){const x=(i*167)%w,y=(i*283+Math.floor(i/512)*37)%h;ctx.fillStyle=i%2?'#e9edea':'#f7f8f5';ctx.fillRect(x,y,1,1);}
      });
      const tableSurface = material('#205573', { map:tableMap, bumpMap:tableMap,bumpScale:.00018,roughness:.87 });
      box(tableGroup, 1.525, .07, 2.74,
        [tableEdge, tableEdge, tableSurface, tableEdge, tableEdge, tableEdge],
        0, C.tableY - .035, 0);
      const whiteLine = material('#e4eee7', { roughness: .9 });
      for (const x of [-.753,.753]) box(tableGroup, .017, .002, 2.74, whiteLine, x, C.tableY + .002, 0);
      for (const z of [-1.36,1.36]) box(tableGroup, 1.525, .002, .018, whiteLine, 0, C.tableY + .002, z);
      box(tableGroup, .006, .002, 2.74, whiteLine, 0, C.tableY + .002, 0);
      // Edge details remain below the single top surface, avoiding depth flicker.
      for(const x of [-.755,.755]){
        box(tableGroup,.013,.008,2.72,'#90a1a4',x,.701,0,{metalness:.55,roughness:.45});
        box(tableGroup,.035,.045,2.54,'#273b44',x*.93,.661,0,{metalness:.4});
        for(const z of [-1.25,-.55,.55,1.25]){
          const screw=cylinder(tableGroup,.005,.003,'#acb9b6',x+Math.sign(x)*.010,.726,z,.005,12);screw.rotation.z=Math.PI/2;
        }
      }
      for(const z of [-1.369,1.369])box(tableGroup,1.50,.008,.008,'#91a1a5',0,.702,z,{metalness:.55,roughness:.45});
      for (const z of [-.82,.82]) {
        box(tableGroup, 1.06, .065, .07, '#3e514c', 0, .49, z);
        for (const x of [-.56,.56]) {
          const leg = box(tableGroup, .055, .68, .06, '#485c55', x, .36, z); leg.rotation.z = -x * .13;
          box(tableGroup, .12, .045, .12, '#273c37', x * 1.05, .042, z);
          const hinge=cylinder(tableGroup,.022,.068,'#9ca9a5',x,.52,z,.022,18);hinge.rotation.z=Math.PI/2;
          const brace=box(tableGroup,.024,.32,.026,'#74827e',x*.81,.53,z+.15*(z>0?-1:1),{metalness:.5});brace.rotation.x=z>0?-.60:.60;
          cylinder(tableGroup,.027,.025,'#5c6c65',x*1.05,.061,z,.027,18);
        }
      }
      box(tableGroup, .045, .06, 1.7, '#55685c', 0, .36, 0);
      const netTexture = texture(256, 128, ctx => {
        ctx.clearRect(0, 0, 256, 128); ctx.strokeStyle = '#324846'; ctx.lineWidth = 1.2;
        for (let x = 0; x < 256; x += 7) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,128); ctx.stroke(); }
        for (let y = 0; y < 128; y += 8) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(256,y); ctx.stroke(); }
      });
      netTexture.wrapS = THREE.RepeatWrapping; netTexture.repeat.x = 2;
      const net = new THREE.Mesh(new THREE.PlaneGeometry(1.83, C.netHeight), new THREE.MeshStandardMaterial({ map: netTexture, transparent: true, side: THREE.DoubleSide, roughness: .9, alphaTest: .05 }));
      netVisual=new THREE.Group();tableGroup.add(netVisual);
      net.position.set(0, C.tableY + C.netHeight / 2, 0); net.castShadow=false; netVisual.add(net);
      box(netVisual,1.83,.014,.009,'#e7e4d2',0,C.tableY+C.netHeight,0);
      box(netVisual,1.83,.004,.005,'#75857d',0,C.tableY+.005,0);
      for(const x of [-.915,.915]) {
        const sign=Math.sign(x);cylinder(tableGroup,.012,.22,'#374a44',x,C.tableY+.075,0,.012,20);
        cylinder(tableGroup,.016,.013,'#b0bbb4',x,C.tableY+.182,0,.014,20);
        box(tableGroup,.13,.027,.07,'#344951',x-sign*.045,C.tableY-.040,0,{metalness:.55});
        box(tableGroup,.026,.091,.063,'#344951',x-sign*.095,C.tableY-.055,0,{metalness:.55});
        cylinder(tableGroup,.005,.075,'#afbab4',x-sign*.071,C.tableY-.075,0,.005,12);
        const dial=cylinder(tableGroup,.020,.012,'#293d39',x-sign*.071,C.tableY-.118,0,.020,16);dial.name='net-clamp-dial';
        box(tableGroup,.060,.004,.005,'#a5b0a6',x-sign*.026,C.tableY+.148,0,{metalness:.55});
      }
      textPlane(tableGroup, 'PING.  /  01', .40, .055, 0, C.tableY - .043, 1.387, '#c2d6cb', null, 64);
      const sideBrand = textPlane(tableGroup, 'THE PRACTICE CLUB', .85, .055, .777, C.tableY - .04, 0, '#bad0c6', null, 42); sideBrand.rotation.y = Math.PI / 2;
      playerPaddle = createPaddle(true); aiPaddle = createPaddle(false);
      playerArm = PingVisuals.createGrip(true); aiArm = PingVisuals.createGrip(false); scene.add(playerArm,aiArm);
      const ballTexture=texture(512,256,ctx=>{
        ctx.fillStyle='#ffffff';ctx.fillRect(0,0,512,256);
        ctx.strokeStyle='#e3e2dc';ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(0,128);ctx.lineTo(512,128);ctx.stroke();
        ctx.fillStyle='#777e79';ctx.textAlign='center';ctx.font='bold 17px Arial';ctx.fillText('PING',144,110);
        ctx.font='11px Arial';ctx.fillText('40+  ★★★',144,126);ctx.font='7px Arial';ctx.fillText('CLUB · ABS',144,138);
        ctx.fillStyle='#c5c9c1';ctx.beginPath();ctx.arc(383,115,3.5,0,Math.PI*2);ctx.fill();
      });
      const ballGrain=texture(128,128,ctx=>{ctx.fillStyle='#dcdcdc';ctx.fillRect(0,0,128,128);for(let i=0;i<2200;i++){ctx.fillStyle=i%2?'#cecece':'#e9e9e9';ctx.fillRect(i*73%128,(i*47+Math.floor(i/128)*19)%128,1,1);}});
      ballMesh = new THREE.Mesh(new THREE.SphereGeometry(C.radius,40,28),material('#ffffff',{map:ballTexture,bumpMap:ballGrain,bumpScale:.000025,roughness:.91,emissive:settings.ballColor,emissiveIntensity:.045}));ballMesh.name='match-ball';ballMesh.castShadow=true;scene.add(ballMesh);
      ballOutline=new THREE.Mesh(new THREE.SphereGeometry(C.radius*1.18,20,14),new THREE.MeshBasicMaterial({color:'#354d42',side:THREE.BackSide,depthWrite:false}));ballMesh.add(ballOutline);
      const shadowTex = texture(64, 64, ctx => { const g = ctx.createRadialGradient(32,32,2,32,32,31); g.addColorStop(0,'rgba(27,43,30,.5)'); g.addColorStop(1,'rgba(27,43,30,0)'); ctx.fillStyle=g;ctx.fillRect(0,0,64,64); });
      ballShadow = new THREE.Mesh(new THREE.PlaneGeometry(.13,.13), new THREE.MeshBasicMaterial({ map: shadowTex, transparent:true, depthWrite:false, opacity:.6 })); ballShadow.rotation.x = -Math.PI / 2; scene.add(ballShadow);
      landingRing = new THREE.Mesh(new THREE.RingGeometry(.065,.074,40), new THREE.MeshBasicMaterial({ color:'#e3f39a',transparent:true,opacity:.7,side:THREE.DoubleSide,depthWrite:false })); landingRing.rotation.x=-Math.PI/2; landingRing.visible=false; scene.add(landingRing);
      contactRing = new THREE.Mesh(new THREE.RingGeometry(.025,.035,32),new THREE.MeshBasicMaterial({color:'#e2f5ac',transparent:true,opacity:0,side:THREE.DoubleSide,depthWrite:false})); scene.add(contactRing);
      bounceRing = new THREE.Mesh(new THREE.RingGeometry(.028,.035,40),new THREE.MeshBasicMaterial({color:'#fff1c5',transparent:true,opacity:0,side:THREE.DoubleSide,depthWrite:false}));bounceRing.rotation.x=-Math.PI/2;scene.add(bounceRing);
      const trailGeometry = new THREE.BufferGeometry(); trailGeometry.setAttribute('position',new THREE.BufferAttribute(trailPositions,3)); trailGeometry.setDrawRange(0,0);
      trailLine = new THREE.Line(trailGeometry,new THREE.LineBasicMaterial({color:'#fff6c6',transparent:true,opacity:.48})); trailLine.frustumCulled=false; scene.add(trailLine);
      new ResizeObserver(resize).observe(court); resize(); initialized=true; applyQuality(); applyAppearance(); applyScene();
    } catch (error) {
      $('webgl-error').hidden=false; $('court-welcome').hidden=true;
      $('start-button').disabled=true; $('play-button').disabled=true;
      console.error('PING: WebGL initialization failed.',error);
    }
  }
  function resize() {
    if (!renderer) return;
    const rect=court.getBoundingClientRect(); courtWidth=rect.width; courtHeight=rect.height;
    renderer.setSize(rect.width,rect.height,false); camera.aspect=rect.width/rect.height;
    camera.fov=camera.aspect<.8?47:42; camera.updateProjectionMatrix();
    updateCamera(0,true);
    $('input-label').hidden=matchMedia('(pointer:coarse)').matches;
  }
  function applyQuality() {
    if(!renderer||!sun)return;
    const preset=PingQuality.PRESETS[quality.effective];
    renderer.setPixelRatio(Math.min(devicePixelRatio||1,preset.ratio));
    renderer.shadowMap.enabled=Boolean(preset.shadow);sun.castShadow=Boolean(preset.shadow);
    if(preset.shadow&&sun.shadow.mapSize.x!==preset.shadow){
      sun.shadow.mapSize.set(preset.shadow,preset.shadow);
      if(sun.shadow.map){sun.shadow.map.dispose();sun.shadow.map=null;}
    }
    renderer.shadowMap.needsUpdate=true;resize();
    $('quality-note').textContent=`当前：${preset.name} · ${preset.fps} 帧目标${quality.effective!==quality.selected?'（已因持续卡顿自动降低）':''}`;
    $('quality-badge').textContent=`画质已自动调整 · ${preset.name}`;
    $('quality-badge').hidden=quality.effective===quality.selected;
  }
  function projectPoint(x,y,z) {
    if(!camera)return {x:0,y:0};
    const point=new THREE.Vector3(x,y,z).project(camera);
    return {x:(point.x+1)/2*courtWidth,y:(1-point.y)/2*courtHeight};
  }
  function worldPoint(clientX,clientY) {
    const r=court.getBoundingClientRect();
    const ndc=new THREE.Vector2((clientX-r.left)/r.width*2-1,-((clientY-r.top)/r.height)*2+1);
    raycaster.setFromCamera(ndc,camera); const point=new THREE.Vector3();
    return raycaster.ray.intersectPlane(controlPlane,point)?point:null;
  }
  function handleEvent(event) {
    if (event.type==='ready') {
      $('point-toast').hidden=true; $('serve-panel').hidden=event.server!=='player';
      $('serve-title').textContent=sim.mode==='serve'?'发球练习 · 随时挥拍':'轮到你发球'; $('serve-hint').textContent='斜挥选左右 · 轻推短，快挥长';
      $('gesture-guide').hidden=true; trailPoints=[];
      setStatus(event.server==='player'?'球在拍前等你 · 向前挥拍即可发球':sim.mode==='match'?`${character(sim.characters.ai).name}准备发球`:'练习喂球准备中 · 等落台后回球');
      updateScore();
    } else if(event.type==='hit') {
      sound('hit',event); trailPoints=[]; $('serve-panel').hidden=true;
      if(trailLine){trailLine.material.color.set(event.signature?.color||settings.ballColor);trailLine.material.opacity=event.signature?.72:.48;}
      if(sim.mode!=='match')updateScore();
      $('gesture-guide').hidden=true; $('rally-badge').hidden=false; $('rally-count').textContent=sim.rally;
      if(event.side==='player') {
        impact=1; cameraShake=reducedMotion?0:.003;
        if(settings.haptics&&navigator.vibrate) navigator.vibrate(clamp(Math.round(event.impactSpeed*1.6),8,20));
        $('hit-feedback').textContent=`${event.placement || ''} · ${event.spin} · ${(event.speed*3.6).toFixed(0)} km/h`;
        $('spin-label').textContent=event.placement+' · '+event.spin; $('spin-label').hidden=!settings.hints; spinUntil=sim.time+.85;
      } else { aiImpact=1; $('hit-feedback').textContent='跟住来球，等落台后挥拍'; }
      if(event.signature){
        $('signature-label').textContent=`${event.side==='ai'?character(sim.characters.ai).name+' · ':''}${event.signature.name}`;
        $('signature-label').style.setProperty('--signature-color',event.signature.color);$('signature-label').hidden=false;signatureUntil=sim.time+.95;
        $('hit-feedback').textContent=event.signature.name+' · '+(event.placement||'');
      }
      if(contactRing&&settings.hints) { contactRing.position.set(event.x,event.y,event.z); contactRing.material.opacity=.66; contactRing.scale.setScalar(.7+Math.min(event.impactSpeed,10)*.04); }
      setStatus(event.side==='player'?'好球 · 准备下一拍':'来球了 · 落台后向前挥拍');
    } else if(event.type==='bounce') {
      sound('bounce',event);
      if(bounceRing&&settings.landing){bounceRing.position.set(event.x,C.tableY+.007,event.z);bounceRing.material.opacity=.6;bounceRing.scale.setScalar(1);}
    }
    else if(event.type==='net') { sound('net',event);netImpact=1;netImpactX=event.x; if(settings.hints)setStatus(event.kind==='cord'?'擦网 · 继续判断落台':'触网'); }
    else if(event.type==='edge') {
      sound('bounce',event);
      if(settings.hints){$('hit-feedback').textContent=event.legal?'合法擦边 · 继续回合':'球台侧面 · 不算落台';if(event.legal)setStatus('擦边好球 · 继续');}
      if(contactRing){contactRing.position.set(event.x,event.y+.005,event.z);contactRing.material.opacity=.72;contactRing.scale.setScalar(.7);}
    }
    else if(event.type==='let') { letUntil=sim.time+1.3; setStatus('发球擦网 · 重新发球'); }
    else if(event.type==='point') {
      sound('point',event); updateScore();
      $('point-toast').hidden=false; $('point-toast').classList.toggle('loss',event.winner==='ai');
      $('point-title').textContent=event.winner==='player'?'好球，你得分！':`${character(sim.characters.ai).name}得分`;
      $('point-detail').textContent=event.reason+(event.result.changeEnds?' · 决胜局交换场地':'');
      $('serve-panel').hidden=true; $('gesture-guide').hidden=true;
      setStatus(event.reason); stats.bestRally=Math.max(stats.bestRally,sim.maxRally); save(); renderStats();
      if(event.result.changeEnds) { landscapeEnds++; $('hit-feedback').textContent='已交换场地 · 视角保持在你身后'; }
      if(event.result.gameOver) { gameEndAt=sim.time+1.55; resultShown=false; }
    } else if(event.type==='practiceResult') {
      $('point-toast').hidden=false;$('point-toast').classList.toggle('loss',!event.success);
      $('point-title').textContent=event.success?'好球！':'再试一次';$('point-detail').textContent=event.reason;
      $('serve-panel').hidden=true;$('gesture-guide').hidden=true;setStatus(event.reason);updateScore();
    }
  }
  function setStatus(text) { $('status-text').textContent=text; }
  function portrait(p, extraClass='') {
    return `<span class="portrait ${extraClass}"><span class="portrait-initials" aria-hidden="true">${p.initials}</span><img src="${p.portrait}" alt="${p.name}头像" width="320" height="320" decoding="async"></span>`;
  }
  // Local files also have a name/initials fallback if an incomplete upload
  // omits an image. A later character selection can load its photo normally.
  court.addEventListener('error',event=>{
    if(event.target.matches?.('.portrait img'))event.target.hidden=true;
  },true);
  document.querySelector('.character-selection').addEventListener('error',event=>{
    if(event.target.matches?.('.portrait img'))event.target.hidden=true;
  },true);
  function updateScore() {
    const m=sim.match;
    const pair=running?sim.characters:selectedCharacters, practice=running&&sim.mode!=='match';
    document.querySelector('.scoreboard').classList.toggle('practice-score',practice);
    for(const side of ['player','ai']) {
      const p=character(pair[side]),frame=$(side+'-portrait'),img=$(side+'-portrait-image');
      frame.hidden=practice;
      if(img.getAttribute('src')!==p.portrait){img.hidden=false;img.src=p.portrait;}
      img.alt=p.name+'头像';frame.querySelector('.portrait-initials').textContent=p.initials;
    }
    if(running&&sim.mode!=='match'){
      $('player-score').textContent=String(sim.practice.successes).padStart(2,'0');$('ai-score').textContent=String(sim.practice.attempts).padStart(2,'0');
      $('game-label').textContent=sim.mode==='serve'?'发球练习':sim.mode==='slow'?'慢速练习':'连续喂球';
      $('score-format').textContent=`连中 ${sim.practice.streak}`;
      $('score-format').title=`最高连续成功 ${sim.practice.bestStreak}`;
      $('player-serve').hidden=true;$('ai-serve').hidden=true;
      $('player-sets').innerHTML='';$('ai-sets').innerHTML='';
      $('player-name').textContent='成功';$('ai-name').textContent='总球数';
      return;
    }
    $('player-name').textContent=character(pair.player).name;$('ai-name').textContent=character(pair.ai).name;
    $('player-score').textContent=String(m.points.player).padStart(2,'0'); $('ai-score').textContent=String(m.points.ai).padStart(2,'0');
    $('player-serve').hidden=m.server!=='player'; $('ai-serve').hidden=m.server!=='ai';
    $('game-label').textContent=running?`第 ${m.gameNumber} 局`:'自由开场';
    $('score-format').title='';
    $('score-format').textContent=m.points.player>=10&&m.points.ai>=10?'净胜 2 分 · 每球换发':'11 分制';
    for(const side of ['player','ai']) $(''+side+'-sets').innerHTML=m.bestOf>1?Array.from({length:2},(_,i)=>`<i class="${i<m.games[side]?'won':''}"></i>`).join(''):'';
  }
  function radar(p) {
    const at=(i,r)=>[100+Math.sin(i*Math.PI/3)*r,94-Math.cos(i*Math.PI/3)*r];
    const points=r=>AXES.map((_,i)=>at(i,r).join(',')).join(' ');
    const rating=key=>PingCharacters.rating(p.id,key);
    const values=AXES.map(([key,label])=>`${label} ${rating(key)}`).join('，');
    return `<svg class="character-radar" viewBox="0 0 200 190" role="img" aria-label="${p.name}游戏风格属性：${values}">${[.25,.5,.75,1].map(f=>`<polygon points="${points(61*f)}" class="radar-grid"/>`).join('')}${AXES.map((_,i)=>{const [x,y]=at(i,61);return `<path d="M100 94L${x} ${y}" class="radar-grid"/>`;}).join('')}<polygon points="${AXES.map(([key],i)=>at(i,61*rating(key)/100).join(',')).join(' ')}" class="radar-values"/>${AXES.map(([key,label],i)=>{const [x,y]=at(i,82);return `<text x="${x}" y="${y-1}" text-anchor="middle">${label}<tspan x="${x}" dy="12">${rating(key)}</tspan></text>`;}).join('')}</svg>`;
  }
  function renderCharacters() {
    for(const side of ['player','ai']) {
      $(side+'-character').value=selectedCharacters[side];const p=character(selectedCharacters[side]);
      const identity=PingCharacters.profile(p.id);
      $(side+'-character-detail').innerHTML=`<div class="character-identity">${portrait(p,'character-portrait')}<div><b>${p.name}</b><small>${p.region} · ${p.hand==='left'?'左手':'右手'}${p.grip}</small></div></div>${radar(p)}<p class="character-bio">${identity.strength}<br><span class="character-weakness">短板 · ${identity.weakness}</span></p><details class="character-signature"><summary>${identity.signature}</summary><p>${identity.trigger}。需拍心准确接球，每分最多一次；比赛中释放后，接下来 2 分冷却，第 3 分恢复资格。双方独立计算。</p></details><small class="rating-note">鲜明风格 · 游戏设定，非现实评分</small>`;
    }
  }
  for(const side of ['player','ai']) {
    $(side+'-character').innerHTML=ROSTER.map(p=>`<option value="${p.id}">${p.name}</option>`).join('');
    $(side+'-character').addEventListener('change',event=>{
      selectedCharacters[side]=event.target.value;const other=side==='player'?'ai':'player';
      if(selectedCharacters[other]===selectedCharacters[side]){
        selectedCharacters[other]=ROSTER.find(p=>p.id!==selectedCharacters[side]).id;
        $('character-notice').textContent=`双方需使用不同角色，${other==='ai'?'对手':'你的角色'}已切换为${character(selectedCharacters[other]).name}。`;
      } else $('character-notice').textContent=running?'新角色将在重新开赛后生效。':'';
      updateSelection();
    });
  }
  function updateSelection() {
    document.querySelectorAll('input[name="difficulty"]').forEach(input=>{input.checked=input.value===difficulty;input.closest('label').classList.toggle('selected',input.checked);});
    document.querySelectorAll('[data-format]').forEach(b=>{const selected=Number(b.dataset.format)===bestOf;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});
    const detail={beginner:'更慢的来球，更多的反应时间。<br>电脑偶尔也会失误，放心挥拍。',standard:'节奏稍快，落点也更灵活。<br>适合已经找到挥拍手感的你。',advanced:'更敏捷的接球，更少的失误。<br>用落点和旋转创造机会。',pro:'快速反应，主动调动你的站位。<br>瞄准空当，把握每一拍。',master:'预判旋转落台，长短结合调动。<br>更快回球，仍留有突破机会。',legend:'更早预判、更强旋转与变线。<br>攻空当、追身位，挑战你的极限。'};
    $('difficulty-detail').innerHTML=detail[difficulty];
    const selectedMode=running?sim.mode:mode,selectedStyle=running?sim.aiStyle:aiStyle==='character'?character(selectedCharacters.ai).tactic:aiStyle;
    $('opponent-tag').innerHTML=`<span class="live-dot"></span> ${selectedMode==='match'?`AI · ${LEVELS[running?matchDifficulty:difficulty].name} · ${STYLES[selectedStyle].name}`:'练习模式 · 不计比赛分数'}`;
    $('mode-select').value=mode;$('ai-style').value=aiStyle;
    $('mode-description').textContent={match:'11 分制比赛，挥拍直接发球。',rally:'连续喂球，不计比分；成功回到对面即进入下一球。',slow:'时间放慢到 0.65×，练习移动、时机和横向擦拍。',serve:'球跟随球拍，反复练习先落己台再落对方半台。'}[mode];
    $('ai-style-field').hidden=mode!=='match';
    document.querySelector('.format-heading').hidden=mode!=='match';document.querySelector('.segmented-control').hidden=mode!=='match';
    $('practice-reset').hidden=!running||sim.mode==='match';
    $('play-button').innerHTML=mode==='match'?'开始比赛 <span>↗</span>':'开始练习 <span>↗</span>';
    $('start-button').innerHTML=running?'按当前选择重新开始 <span>↗</span>':mode==='match'?'进入球场 <span>↗</span>':'开始练习 <span>↗</span>';
    renderCharacters();syncEquipment();if(!running)updateScore();
    save();
  }
  function startMatch() {
    if(!initialized)return;
    initSound(); closeAll(); paused=false; running=true; matchDifficulty=difficulty;
    matchStartedAt=Date.now(); matchRecorded=false; resultShown=false; gameEndAt=0; landscapeEnds=0;
    sim.start(bestOf,difficulty,Math.random()<.5?'player':'ai',{mode,aiStyle,playerCharacter:selectedCharacters.player,aiCharacter:selectedCharacters.ai,swingRecognition:settings.swingRecognition,equipment:equipmentOverrides()});
    pointer=null;$('touch-marker').hidden=true;landingAt=-1;
    $('court-welcome').hidden=true; $('pause-button').disabled=false; court.classList.add('active');
    $('rally-badge').hidden=true; $('point-toast').hidden=true;
    updateSelection(); updateScore();
    if(!saved.tutorialSeen) { saved.tutorialSeen=true; save(); openDialog('help-dialog'); }
    if(innerWidth<801)court.closest('.court-card').scrollIntoView({behavior:reducedMotion?'instant':'smooth',block:'start'});
  }
  function returnHome() {
    closeAll(); running=false; paused=false; sim.state='idle'; sim.match.points={player:0,ai:0}; sim.match.games={player:0,ai:0};
    $('court-welcome').hidden=false; $('serve-panel').hidden=true; $('point-toast').hidden=true;
    $('gesture-guide').hidden=true; $('rally-badge').hidden=true; $('spin-label').hidden=true;$('signature-label').hidden=true;
    $('pause-button').disabled=true; court.classList.remove('active');
    pointer=null;$('touch-marker').hidden=true;
    setStatus('球台已就绪，等你上场'); $('hit-feedback').textContent='找到你的节奏';
    updateSelection(); updateScore();
  }
  function openDialog(id) {
    const dialog=$(id); if(dialog.open)return;
    if(running&&!paused){paused=true;modalPaused=true;}
    releasePointer();
    if(!document.querySelector('dialog[open]'))dialog.showModal();
  }
  function closeAll() { document.querySelectorAll('dialog[open]').forEach(d=>d.close()); if(modalPaused){paused=false;modalPaused=false;} }
  function showResult() {
    if(resultShown)return; resultShown=true;
    const m=sim.match, won=m.points.player>m.points.ai;
    if(m.over)recordMatch();
    $('result-mark').textContent=won?'↗':'↺';
    $('result-eyebrow').textContent=m.over?'MATCH COMPLETE':'GAME COMPLETE';
    $('result-title').textContent=won?'这一局，打得漂亮。':'好球，总在下一拍。';
    $('result-description').textContent=m.over?(won?'你赢下了这场比赛。保持这份手感。':`${character(sim.characters.ai).name}赢下了比赛。再来一次，找到节奏。`):`第 ${m.gameNumber} 局结束 · 大比分 ${m.games.player} : ${m.games.ai}`;
    $('result-player').textContent=m.points.player; $('result-ai').textContent=m.points.ai;
    $('result-meta').textContent=`${character(sim.characters.player).name} VS ${character(sim.characters.ai).name} · ${LEVELS[matchDifficulty].name}难度 · 本场最高连续 ${sim.maxRally} 拍`;
    $('result-next').innerHTML=m.over?'再来一场 <span>↗</span>':'开始下一局 <span>↗</span>';
    $('result-back').hidden=!m.over;
    openDialog('result-dialog');
  }
  function recordMatch() {
    if(matchRecorded||sim.mode!=='match')return; matchRecorded=true;
    const won=sim.match.games.player>sim.match.games.ai;
    stats.matches++; if(won)stats.wins++; stats.bestRally=Math.max(stats.bestRally,sim.maxRally);
    const level=stats.levels[matchDifficulty]||(stats.levels[matchDifficulty]={matches:0,wins:0}); level.matches++; if(won)level.wins++;
    stats.history.unshift({difficulty:matchDifficulty,aiStyle:sim.aiStyle,playerCharacter:sim.characters.player,aiCharacter:sim.characters.ai,won,bestOf:sim.match.bestOf,score:sim.match.bestOf===1?`${sim.match.points.player} : ${sim.match.points.ai}`:`${sim.match.games.player} : ${sim.match.games.ai}`,rally:sim.maxRally,date:new Date().toISOString(),seconds:Math.round((Date.now()-matchStartedAt)/1000)});
    stats.history=stats.history.slice(0,30);save();renderStats();
  }
  function renderStats() {
    $('stat-matches').innerHTML=`${stats.matches}<small>场</small>`;
    $('stat-winrate').innerHTML=`${stats.matches?Math.round(stats.wins/stats.matches*100):'—'}<small>%</small>`;
    $('stat-rally').innerHTML=`${stats.bestRally}<small>拍</small>`;
  }
  function renderHistory() {
    $('history-levels').innerHTML=Object.entries(LEVELS).map(([key,l])=>{const s=stats.levels[key]||{matches:0,wins:0};return `<div>${l.name}<b>${s.matches?Math.round(s.wins/s.matches*100)+'%':'—'}</b><small>${s.wins} 胜 / ${s.matches} 场</small></div>`;}).join('');
    $('history-list').innerHTML=stats.history.length?stats.history.map(h=>`<div class="history-item"><span>${h.playerCharacter?character(h.playerCharacter).name+' VS '+character(h.aiCharacter).name+' · ':''}${LEVELS[h.difficulty]?.name||'入门'} · ${h.bestOf===1?'单局决胜':'三局两胜'}<small>${new Date(h.date).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})} · 最高 ${h.rally} 拍</small></span><span>${h.score}</span><b>${h.won?'胜利':'再接再厉'}</b></div>`).join(''):'<p class="empty-history">这里还没有比赛记录。<br>你的第一场好球，正等着开场。</p>';
    $('storage-note').textContent=storageAvailable?'战绩仅保存在这个浏览器中，清理网站数据会一并清除。':'浏览器暂不允许本地存储；本次战绩会在当前页面保留。';
  }
  function syncSettings() {
    audio.setEnabled(settings.sound);
    for(const key of ['sound','haptics','hints','outline','adaptive','landing','trail','arms'])$('setting-'+key).checked=settings[key];
    $('setting-sensitivity').value=settings.sensitivity; $('sensitivity-value').textContent=Number(settings.sensitivity).toFixed(1)+'×';
    $('sound-button').classList.toggle('muted',!settings.sound);
    $('sound-button').setAttribute('aria-label',settings.sound?'关闭音效':'开启音效');
    $('sound-button').title=settings.sound?'关闭音效':'开启音效';
    $('setting-offset').value=settings.offset;$('offset-value').textContent=settings.offset+' px';
    $('setting-quality').value=settings.quality;
    $('setting-ball-size').value=settings.ballSize;$('ball-size-value').textContent=Math.round(settings.ballSize*100)+'%';
    for(const [key,prefix] of [['ballColor','ball'],['paddleColor','paddle']]){
      const select=$('setting-'+prefix+'-color'),known=Array.from(select.options).some(o=>o.value===settings[key]);
      select.value=known?settings[key]:'custom';$('setting-'+prefix+'-custom').value=settings[key];
    }
    $('setting-swing-recognition').value=settings.swingRecognition;
    $('setting-paddle-model').value=settings.paddleModel;
    $('setting-scene').value=settings.scene;
    syncEquipment();
    applyAppearance();
  }

  court.addEventListener('pointerdown',event=>{
    if(event.target.closest('button')||!running||paused||!initialized||pointer)return;
    const rect=court.getBoundingClientRect();
    if(event.clientY-rect.top<rect.height*.38)return;
    initSound();event.preventDefault();court.setPointerCapture(event.pointerId);
    const touch=event.pointerType==='touch'||event.pointerType==='pen';
    const world=worldPoint(event.clientX,event.clientY-(touch?settings.offset:0));if(!world)return;
    sim.beginPlayerDrag();
    pointer={id:event.pointerId,touch,x:event.clientX,y:event.clientY,worldX:world.x,worldZ:world.z,startX:sim.player.targetX,startZ:sim.player.targetZ,lastX:event.clientX,lastY:event.clientY,lastTime:performance.now(),vx:0,vz:0};
    if(touch){sim.movePlayer(world.x,world.z,0,0);showTouch(event.clientX,event.clientY);}
    sim.player.activeUntil=sim.time+.2;
  });
  function showTouch(x,y){const r=court.getBoundingClientRect();$('touch-marker').style.left=(x-r.left)+'px';$('touch-marker').style.top=(y-r.top)+'px';$('touch-marker').hidden=!pointer?.touch;}
  court.addEventListener('pointermove',event=>{
    if(!pointer||pointer.id!==event.pointerId||paused)return;event.preventDefault();
    const now=performance.now(),dt=Math.max(.008,(now-pointer.lastTime)/1000),world=worldPoint(event.clientX,event.clientY-(pointer.touch?settings.offset:0));if(!world)return;
    const sensitivity=Number(settings.sensitivity);
    const newX=pointer.touch?pointer.worldX+(world.x-pointer.worldX)*sensitivity:pointer.startX+(world.x-pointer.worldX)*sensitivity;
    const newZ=pointer.touch?pointer.worldZ+(world.z-pointer.worldZ)*sensitivity:pointer.startZ+(world.z-pointer.worldZ)*sensitivity;
    // Velocity comes from the gesture, independent of the paddle's travel limits.
    // This preserves a quick upward strike even when already near the front stop.
    const scaleX=3.15/courtWidth,scaleZ=3.5/courtHeight;
    const vx=clamp((event.clientX-pointer.lastX)*scaleX/dt*sensitivity,-7,7);
    const vz=clamp((event.clientY-pointer.lastY)*scaleZ/dt*sensitivity,-8,8);
    sim.movePlayer(newX,newZ,vx,vz);
    if(pointer.touch)showTouch(event.clientX,event.clientY);
    Object.assign(pointer,{lastX:event.clientX,lastY:event.clientY,lastTime:now,vx,vz});
  });
  function releasePointer(event){if(pointer&&(!event||pointer.id===event.pointerId)){if(court.hasPointerCapture(pointer.id))court.releasePointerCapture(pointer.id);pointer=null;sim.endPlayerDrag();$('touch-marker').hidden=true;}}
  court.addEventListener('pointerup',releasePointer);court.addEventListener('pointercancel',releasePointer);court.addEventListener('lostpointercapture',releasePointer);
  window.addEventListener('keydown',event=>{
    if(event.target.matches('input,button,select,textarea')||document.querySelector('dialog[open]'))return;
    if(event.code==='KeyP'&&running){event.preventDefault();openDialog('pause-dialog');}
  });
  document.querySelectorAll('input[name="difficulty"]').forEach(input=>input.addEventListener('change',()=>{difficulty=input.value;updateSelection();}));
  document.querySelectorAll('[data-format]').forEach(b=>b.addEventListener('click',()=>{bestOf=Number(b.dataset.format);updateSelection();}));
  $('setting-swing-recognition').addEventListener('change',event=>{settings.swingRecognition=event.target.value;sim.swingRecognition=settings.swingRecognition;save();});
  $('mode-select').addEventListener('change',event=>{mode=event.target.value;updateSelection();});
  $('ai-style').addEventListener('change',event=>{aiStyle=event.target.value;updateSelection();});
  $('practice-reset').addEventListener('click',()=>{if(!running||sim.mode==='match')return;releasePointer();sim.restartPractice();});
  $('start-button').addEventListener('click',()=>{if(running){openDialog('pause-dialog');$('restart-button').textContent='按所选难度重新开赛';}else startMatch();});
  $('play-button').addEventListener('click',startMatch);
  $('help-button').addEventListener('click',()=>openDialog('help-dialog'));
  $('guide-link').addEventListener('click',()=>openDialog('help-dialog'));
  for(const id of ['settings-button','court-settings-button'])$(id).addEventListener('click',()=>{syncSettings();openDialog('settings-dialog');});
  $('history-button').addEventListener('click',()=>{renderHistory();openDialog('history-dialog');});
  $('pause-button').addEventListener('click',()=>openDialog('pause-dialog'));
  $('resume-button').addEventListener('click',closeAll);
  $('restart-button').addEventListener('click',startMatch);
  $('quit-button').addEventListener('click',returnHome);
  $('result-next').addEventListener('click',()=>{if(sim.match.over){startMatch();return;}closeAll();resultShown=false;gameEndAt=0;sim.nextGame();updateScore();});
  $('result-back').addEventListener('click',returnHome);
  $('sound-button').addEventListener('click',()=>{settings.sound=!settings.sound;initSound();syncSettings();save();});
  document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',closeAll));
  document.querySelectorAll('dialog').forEach(d=>{
    d.addEventListener('cancel',event=>{if(d.id==='result-dialog'){event.preventDefault();return;}closeAll();});
    d.addEventListener('close',()=>{if(!document.querySelector('dialog[open]')&&modalPaused){modalPaused=false;paused=false;}});
    d.addEventListener('click',event=>{if(event.target===d&&d.id!=='result-dialog'){const rect=d.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)closeAll();}});
  });
  for(const key of ['sound','haptics','hints','outline','adaptive','landing','trail','arms'])$('setting-'+key).addEventListener('change',event=>{settings[key]=event.target.checked;if(key==='sound')initSound();if(key==='adaptive'){quality.reset(settings.quality,settings.adaptive);applyQuality();}syncSettings();save();});
  $('setting-sensitivity').addEventListener('input',event=>{settings.sensitivity=Number(event.target.value);syncSettings();save();});
  $('setting-offset').addEventListener('input',event=>{settings.offset=Number(event.target.value);syncSettings();save();});
  $('setting-quality').addEventListener('change',event=>{settings.quality=event.target.value;quality.reset(settings.quality,settings.adaptive);applyQuality();save();});
  $('setting-ball-size').addEventListener('input',event=>{settings.ballSize=clamp(Number(event.target.value),1,1.8);syncSettings();save();});
  for(const [key,prefix] of [['ballColor','ball'],['paddleColor','paddle']]){
    $('setting-'+prefix+'-color').addEventListener('change',event=>{
      if(event.target.value!=='custom')settings[key]=event.target.value;
      else settings[key]=$('setting-'+prefix+'-custom').value;
      applyAppearance();save();
    });
    $('setting-'+prefix+'-custom').addEventListener('input',event=>{settings[key]=event.target.value;$('setting-'+prefix+'-color').value='custom';applyAppearance();save();});
  }
  $('setting-paddle-model').addEventListener('change',event=>{settings.paddleModel=event.target.value;applyAppearance();save();});
  for(const side of ['player','ai'])for(const key of ['grip','hand','blade'])$('setting-'+side+'-'+key).addEventListener('change',event=>{
    settings[side+key[0].toUpperCase()+key.slice(1)]=event.target.value;syncEquipment();save();
  });
  for(const id of ['scene-select','setting-scene'])$(id).addEventListener('change',event=>{settings.scene=event.target.value;applyScene();save();});
  $('fullscreen-button').addEventListener('click',async()=>{
    try {if(document.fullscreenElement)await document.exitFullscreen();else if(court.closest('.court-card').requestFullscreen)await court.closest('.court-card').requestFullscreen();else{const expanded=court.closest('.court-card').classList.toggle('mobile-fullscreen');document.body.classList.toggle('court-fullscreen',expanded);resize();}}catch(_){setStatus('当前浏览器不支持全屏，仍可正常比赛');}
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&running&&!paused&&!document.querySelector('dialog[open]'))openDialog('pause-dialog');});
  window.addEventListener('blur',()=>{if(running&&!paused&&!document.querySelector('dialog[open]'))openDialog('pause-dialog');});

  let trailTick=0;
  function updateCamera(dt,snap=false) {
    const aspect=courtWidth/courtHeight,portrait=aspect<.8;
    const cameraDistance=portrait?1.05:1;
    cameraTarget.set(running?0:2.95,running?2.88:3.05,running?(portrait?3.68:3.85):4.15).multiplyScalar(cameraDistance);
    // Start at the intended view and stop moving once the transition settles.
    if(snap||reducedMotion||camera.position.distanceToSquared(cameraTarget)<1e-8) camera.position.copy(cameraTarget);
    else camera.position.lerp(cameraTarget,1-Math.exp(-dt*4));
    if(cameraShake>.001){camera.position.x+=(Math.random()-.5)*cameraShake;camera.position.y+=(Math.random()-.5)*cameraShake;cameraShake*=Math.exp(-dt*24);}
    camera.lookAt(0,running?.78:.57,running?-.05:0);
  }
  function render(dt,now) {
    if(!initialized)return;
    const active=running;
    if(tableGroup)tableGroup.rotation.y=landscapeEnds%2?Math.PI:0;
    updateCamera(dt);
    const b=sim.ball,p=sim.player,ai=sim.ai;
    if(!active){
      playerPaddle.position.set(.31,1.03,1.51);playerPaddle.rotation.set(-.09,-.18,-.19);
      aiPaddle.position.set(-.22,1.04,-1.5);aiPaddle.rotation.set(.07,.2,.14);
      ballMesh.position.set(-.18,.91,-.1);ballOutline.visible=settings.outline;$('stroke-label').hidden=true;ballMesh.visible=true;
      ballShadow.position.set(-.18,C.tableY+.007,-.1);ballShadow.visible=true;
    }else{
      const posture=sim.posture('player');
      const motion=PingMotion.stroke(p,posture,{time:sim.time,side:'player',hand:sim.equipment.player.hand,incoming:sim.state==='rally'&&sim.lastHitter==='ai',eta:sim.playerPlan?.time});
      playerPaddle.position.set(p.x+motion.x,p.y+motion.y,p.z+motion.z);
      const poseBlend=1-Math.exp(-dt*20),brushing=sim.time-p.gestureAt<.18;
      const poseX=motion.pitch,poseY=motion.yaw+(brushing?clamp(p.swingVX*.025,-.12,.12):0);
      const poseZ=motion.roll+clamp(-p.vx*.025,-.10,.10);
      playerPaddle.rotation.x+=(poseX-playerPaddle.rotation.x)*poseBlend;
      playerPaddle.rotation.y+=(poseY-playerPaddle.rotation.y)*poseBlend;
      playerPaddle.rotation.z+=(poseZ-playerPaddle.rotation.z)*poseBlend;
      $('stroke-label').textContent=posture.name;$('stroke-label').hidden=!settings.hints;
      const aiPose=sim.posture('ai');
      const aiMotion=PingMotion.stroke(ai,aiPose,{time:sim.time,side:'ai',hand:sim.equipment.ai.hand,incoming:sim.state==='rally'&&sim.lastHitter==='player',eta:Math.abs((ai.z-b.z)/(b.vz||1))});
      aiPaddle.position.set(ai.x+aiMotion.x,ai.y+aiMotion.y,ai.z+aiMotion.z);
      for(const [axis,target] of [['x',aiMotion.pitch],['y',aiMotion.yaw],['z',aiMotion.roll]])aiPaddle.rotation[axis]+=(target-aiPaddle.rotation[axis])*poseBlend;
      ballMesh.position.set(b.x,b.y,b.z);ballMesh.visible=sim.state!=='point'&&sim.state!=='gameover';
      if(!paused&&sim.state==='rally'){
        const spinTime=dt*(sim.mode==='slow'?.65:1);
        ballMesh.rotateOnWorldAxis(new THREE.Vector3(1,0,0),b.spinX*spinTime);
        ballMesh.rotateOnWorldAxis(new THREE.Vector3(0,1,0),b.spinY*spinTime);
        ballMesh.rotateOnWorldAxis(new THREE.Vector3(0,0,1),(b.spinZ||0)*spinTime);
      }
      if(sim.state==='ready')ballMesh.rotation.set(0,0,0);
      ballOutline.visible=settings.outline&&b.z>-.25;
      const onTable=Math.abs(b.x)<.78&&Math.abs(b.z)<1.38;
      ballShadow.position.set(b.x,onTable?C.tableY+.005:.006,b.z);
      const height=Math.max(0,b.y-(onTable?C.tableY:0));ballShadow.scale.setScalar(1+height*.8);ballShadow.material.opacity=clamp(.7-height*.4,.15,.7);ballShadow.visible=ballMesh.visible;
    }
    const playerEquipment=currentEquipment('player'),aiEquipment=currentEquipment('ai');
    playerArm.visible=aiArm.visible=settings.arms;
    PingVisuals.updateGrip(playerArm,playerPaddle,playerEquipment.hand,true,playerEquipment.grip);
    PingVisuals.updateGrip(aiArm,aiPaddle,aiEquipment.hand,false,aiEquipment.grip);
    impact*=Math.exp(-dt*14);aiImpact*=Math.exp(-dt*14);
    netImpact*=Math.exp(-dt*13);if(netVisual)netVisual.position.z=reducedMotion?0:Math.sin(now*.060)*netImpact*.006*(1-Math.abs(netImpactX)*.15);
    if(contactRing.material.opacity>0){contactRing.material.opacity=Math.max(0,contactRing.material.opacity-dt*4);contactRing.scale.addScalar(dt*8);contactRing.lookAt(camera.position);}
    if(bounceRing.material.opacity>0&&!paused){bounceRing.material.opacity=Math.max(0,bounceRing.material.opacity-dt*3);bounceRing.scale.addScalar(dt*4);}
    if(active&&settings.landing&&(!paused||landingAt<0)&&(sim.time-landingAt>.045||landingAt<0)) {landingCache=sim.predictLanding();landingAt=sim.time;}
    const landing=active&&settings.landing&&sim.state==='rally'?landingCache:null;
    landingRing.visible=Boolean(landing);
    if(landing){landingRing.position.set(landing.x,C.tableY+.006,landing.z);landingRing.scale.setScalar(1+Math.sin(now*.006)*.10);landingRing.material.opacity=.45+Math.sin(now*.004)*.15;}
    if(active&&settings.trail&&sim.state==='rally') {
      trailTick+=dt;
      if(trailTick>.018){trailTick=0;trailPoints.push({x:b.x,y:b.y,z:b.z});if(trailPoints.length>18)trailPoints.shift();}
      for(let i=0;i<trailPoints.length;i++){trailPositions[i*3]=trailPoints[i].x;trailPositions[i*3+1]=trailPoints[i].y;trailPositions[i*3+2]=trailPoints[i].z;}
      trailLine.geometry.attributes.position.needsUpdate=true;trailLine.geometry.setDrawRange(0,trailPoints.length);trailLine.visible=true;
    }else trailLine.visible=false;
    if(active&&settings.hints&&sim.state==='rally'&&sim.lastHitter==='ai'&&sim.bounces===1&&b.z>.45&&b.vz>0&&b.y>.8){
      $('gesture-guide').hidden=false;$('gesture-text').textContent='现在，向上挥拍！';
    }else $('gesture-guide').hidden=true;
    if(!settings.hints||sim.time>spinUntil)$('spin-label').hidden=true;
    if(sim.time>signatureUntil||sim.state!=='rally')$('signature-label').hidden=true;
    if(sim.time<letUntil)setStatus('发球擦网 · 重新发球');
    renderer.render(scene,camera);
  }
  function frame(now) {
    const rawDT=(now-lastTime)/1000,dt=Math.min(rawDT,.06);lastTime=now;
    if(quality.observe(rawDT,running&&!paused&&!document.hidden))applyQuality();
    if(running&&!paused) {
      const timeScale=sim.mode==='slow'?.65:1;
      accumulator+=dt*timeScale;let steps=0;
      while(accumulator>=1/120&&steps<8){sim.update(1/120,1/timeScale);accumulator-=1/120;steps++;}
      if(gameEndAt&&sim.time>=gameEndAt&&!resultShown)showResult();
    }else accumulator=0;
    const fps=(!running||paused||document.hidden)?30:PingQuality.PRESETS[quality.effective].fps;
    if(now-lastRender>=1000/fps-1){const renderDT=lastRender?Math.min((now-lastRender)/1000,.12):dt;lastRender=now;render(renderDT,now);}
    requestAnimationFrame(frame);
  }
  for(const side of ['player','ai'])$('setting-'+side+'-blade').innerHTML='<option value="auto">跟随选手代表装备</option>'+Object.entries(PingCharacters.BLADES).map(([id,p])=>`<option value="${id}">${p.name}</option>`).join('');
  syncSettings();updateSelection();renderStats();initScene();requestAnimationFrame(frame);
  // A read-only snapshot makes diagnostics possible without changing a live match.
  window.PING=Object.freeze({snapshot:()=>({...sim.snapshot(),lastShot:sim.lastShot?{...sim.lastShot}:null}),project:(x,y,z)=>projectPoint(x,y,z),quality:()=>({selected:quality.selected,effective:quality.effective,adaptive:quality.adaptive}),appearance:()=>({ballSize:settings.ballSize,ballColor:settings.ballColor,paddleColor:settings.paddleColor,paddleModel:settings.paddleModel,scene:settings.scene}),version:'1.4.1'});
})();
