/* Local geometry and procedural textures. No external assets or requests. */
(function (root) {
  'use strict';
  const SCENES = Object.freeze({
    club: { name: '室内球馆', sky: '#b9b4a4', fog: '#b9b4a4', sun: '#ffe7ca', ground: '#86796a', ambient: '#f6efe0', intensity: 2.75, exposure: .98 },
    park: { name: '户外公园', sky: '#bcd7df', fog: '#c1d7cd', sun: '#ffedc5', ground: '#819474', ambient: '#e5f4fb', intensity: 3.7, exposure: 1.08 },
    coast: { name: '海边球场', sky: '#b5dbe8', fog: '#c0dfe8', sun: '#fff0c9', ground: '#acaa92', ambient: '#e9f8ff', intensity: 4.0, exposure: 1.05 },
    rooftop: { name: '屋顶球场', sky: '#b9b4ce', fog: '#b9b7cd', sun: '#ffca9b', ground: '#777f92', ambient: '#e5e2ff', intensity: 3.2, exposure: 1.13 }
  });
  const MODEL_NAMES = Object.freeze({ athlete:'跟随参考球拍', classic: '经典圆拍', attack: '进攻方肩拍', jpen: '日式方拍' });
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
    if (model === 'cybershape') {
      const points=[[-.082,-.148],[-.155,-.040],[-.155,.092],[-.083,.173],[.083,.173],[.155,.092],[.155,-.040],[.082,-.148]];
      s.moveTo(...points[0]);for(const point of points.slice(1))s.lineTo(...point);s.closePath();
    } else if (model === 'jpen') {
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
  function createPaddle(model = 'classic', color = '#405f4b', isPlayer = true, equipment = {}) {
    if (!rubberMap) rubberMap = tex(ctx => {
      ctx.fillStyle = '#f3f3f3'; ctx.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 7000; i++) {
        const x=(i*73.319)%256,y=(i*39.713)%256;
        ctx.fillStyle='rgba(55,55,55,.025)';ctx.fillRect(x,y,.6,.6);
      }
    });
    if (!woodMap) woodMap = tex(ctx => {
      ctx.fillStyle = '#dfbe8a'; ctx.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 65; i++) { ctx.strokeStyle = `rgba(94,57,24,${.05 + (i % 6) * .014})`; ctx.beginPath(); ctx.moveTo(i * 4, 0); ctx.bezierCurveTo(i * 4 + 6, 80, i * 4 - 4, 160, i * 4 + 2, 256); ctx.stroke(); }
    });
    const g = new THREE.Group(); g.name = isPlayer ? 'player-paddle' : 'ai-paddle'; g.userData.model = model;
    const profile=equipment.profile||{brand:'PING CLUB',label:'CLUB SERIES',stripe:'#36584d',accent:'#b59d69',wood:'#dfbe8a'},penhold=equipment.grip==='penhold';
    g.userData.profile=profile.id||'club';g.userData.grip=equipment.grip||'shakehand';
    const shape = bladeShape(model), wood = mat(profile.wood, { map: woodMap, roughness: .62 });
    function layer(z, depth, scale, material, name) {
      const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 28, steps: 1 });
      const mesh = new THREE.Mesh(geometry, material); mesh.scale.set(scale, scale, 1); mesh.position.z = z;
      mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = name || 'blade-layer'; g.add(mesh); return mesh;
    }
    layer(-.009, .018, 1, wood);
    for (const z of [-.006, -.002, .002, .006]) layer(z, .001, 1.002, mat(Math.abs(z)>.004?'#34434a':'#a27d56'));
    layer(-.012, .003, .984, mat('#d49b45')); layer(.009, .003, .984, mat('#d49b45'));
    const rubber = mat(color, { map: rubberMap, roughness: .9 });
    layer(.012, .0035, .977, rubber, 'rubber-front'); layer(-.0155, .0035, .977, mat('#252a2a', { map: rubberMap, roughness: .9 }), 'rubber-back');
    // Thin dark edge tape is a ring, leaving wood plies visible from the side.
    const ring = bladeShape(model), hole = new THREE.Path();
    const pts = shape.getPoints(64); hole.setFromPoints(pts.map(p => p.clone().multiplyScalar(.986))); ring.holes.push(hole);
    const edge = new THREE.Mesh(new THREE.ExtrudeGeometry(ring, { depth: .003, bevelEnabled: false, curveSegments: 28 }), mat('#334039'));
    edge.position.z = .008; g.add(edge);
    const end=penhold?-.263:-.310,half=penhold?.025:.029;
    const handleShape=new THREE.Shape();handleShape.moveTo(-.020,-.146);handleShape.bezierCurveTo(-.024,-.190,-.018,end+.045,-half,end+.010);handleShape.quadraticCurveTo(-half-.002,end,0,end);handleShape.quadraticCurveTo(half+.002,end,half,end+.010);handleShape.bezierCurveTo(.018,end+.045,.024,-.190,.020,-.146);handleShape.closePath();
    const handle = new THREE.Mesh(new THREE.ExtrudeGeometry(handleShape,{depth:.033,bevelEnabled:true,bevelSize:.004,bevelThickness:.004,bevelSegments:3,steps:1,curveSegments:20}),wood);
    handle.position.z=-.0165;handle.name='wood-handle';handle.castShadow=true;g.add(handle);
    for(const z of [-.022,.022]) {
      for(const x of [-.013,.013]) {
        const stripe=cube(g,x,(-.15+end)/2,z,.008,Math.abs(end+.15)-.009,.0015,profile.stripe);stripe.rotation.z=x>0?-.025:.025;
        cube(g,x*.48,(-.15+end)/2,z+Math.sign(z)*.0005,.0025,Math.abs(end+.15)-.012,.0016,profile.accent);
      }
    }
    const cap=sphere(g,0,end+.007,0,.025,profile.stripe,1,.30,.79);cap.name='handle-cap';
    const medallion=sphere(g,0,end+.031,.023,.008,profile.accent,1,.80,.16);medallion.name='handle-medallion';
    cube(g,0,-.152,.024,.047,.018,.005,profile.accent);
    if (model === 'jpen') cube(g, 0, -.168, -.034, .062, .052, .025, '#c3a06e');
    const emblem = tex(ctx => { ctx.fillStyle='#f1d9bc';ctx.globalAlpha=.65;ctx.textAlign='center';ctx.font='bold 24px Arial';ctx.fillText(profile.brand,128,110);ctx.font='13px Arial';ctx.fillText(profile.label,128,134);ctx.font='10px Arial';ctx.fillText('TABLE TENNIS  •  INVERTED',128,151);});
    for(const facing of [1,-1]){
      const badge = new THREE.Mesh(new THREE.PlaneGeometry(.135,.060),new THREE.MeshBasicMaterial({map:emblem,transparent:true,depthWrite:false}));
      badge.position.set(0,-.116,facing*.0165);if(facing<0)badge.rotation.y=Math.PI;badge.name=facing===1?'paddle-badge':'paddle-badge-back';g.add(badge);
    }
    // A penhold blade hangs below the pinch while its handle points towards
    // the hand. Rotate around the blade centre so the contact stays aligned.
    g.userData.gripRotation=penhold?Math.PI:0;
    if(penhold)for(const child of g.children){child.position.x*=-1;child.position.y*=-1;child.rotateZ(Math.PI);}
    return g;
  }
  function setPaddleColor(g, color) { g.getObjectByName('rubber-front')?.material.color.set(color); }
  const gripGeometry = {};
  function createGrip(isPlayer) {
    const group = new THREE.Group(); group.name = isPlayer ? 'player-arm' : 'ai-arm';
    const hand = new THREE.Group(); hand.name = 'gripping-hand'; group.add(hand);
    const skin = mat(isPlayer ? '#d4a17e' : '#c59270', { roughness: .83 });
    const grips = {};
    for (const kind of ['shakehand','penhold']) {
      const source=PingHandMeshes[kind];
      if(!gripGeometry[kind]) {
        const geometry=new THREE.BufferGeometry();
        geometry.setAttribute('position',new THREE.Float32BufferAttribute(source.positions.map(v=>v/100000),3));
        geometry.setIndex(source.indices);geometry.computeVertexNormals();
        gripGeometry[kind]=geometry;
      }
      const grip=new THREE.Group();grip.name='grip-'+kind;
      const mesh=new THREE.Mesh(gripGeometry[kind],skin);
      mesh.name='hand-surface';mesh.castShadow=true;mesh.receiveShadow=true;
      grip.userData.wrist=new THREE.Vector3(...source.wrist);
      grip.userData.fingers=5;grip.add(mesh);hand.add(grip);grips[kind]=grip;
    }
    const axis=new THREE.Vector3(0,1,0);
    const profile=[[.050,0],[.053,.16],[.050,.38],[.041,.68],[.031,.88],[.024,1]].map(([r,y])=>new THREE.Vector2(r,y));
    const forearm = new THREE.Mesh(new THREE.LatheGeometry(profile,24),skin);
    forearm.name='forearm';forearm.castShadow=true;forearm.receiveShadow=true;group.add(forearm);
    const jersey=mat(isPlayer?'#365c4c':'#9c5847',{roughness:.94});
    const sleeveContour=[[0,0],[.072,0],[.079,.18],[.081,.34],[.073,.57],[.063,.82],[.055,1],[0,1]];
    const sleeve=new THREE.Mesh(new THREE.LatheGeometry(sleeveContour.map(([r,y])=>new THREE.Vector2(r,y)),24),jersey);
    sleeve.name='upper-sleeve';sleeve.castShadow=true;sleeve.receiveShadow=true;group.add(sleeve);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(.054,.057,1,24),jersey);
    cuff.name='sleeve-cuff';cuff.castShadow=true;group.add(cuff);
    const trim = new THREE.Mesh(new THREE.CylinderGeometry(.0545,.055,1,24),mat('#e7e4d0'));
    trim.name='cuff-trim';group.add(trim);
    group.userData={hand,...grips,forearm,sleeve,cuff,trim,jersey,kit:null,wrist:new THREE.Vector3(),elbow:new THREE.Vector3(),shoulder:new THREE.Vector3(),axis,direction:new THREE.Vector3(),rotation:new THREE.Quaternion()};
    return group;
  }
  function updateGrip(group,paddle,handedness='right',isPlayer=true,grip='shakehand',style,frame) {
    const data=group.userData,sign=handedness==='left'?-1:1,facing=isPlayer?1:-1,penhold=grip==='penhold';
    if(style?.kit&&style.kit!==data.kit){data.kit=style.kit;data.jersey.color.set(style.kit);}
    data.shakehand.visible=!penhold;data.penhold.visible=penhold;group.userData.grip=grip;group.userData.handedness=handedness;
    data.hand.position.copy(paddle.position);data.hand.quaternion.copy(paddle.quaternion);data.hand.scale.set(sign*facing,1,facing);
    const turn=penhold?-1:1;
    data.shakehand.rotation.z=0;data.penhold.rotation.z=Math.PI;
    data.wrist.copy((penhold?data.penhold:data.shakehand).userData.wrist);
    data.wrist.x*=turn;data.wrist.y*=turn;
    data.wrist.multiply(data.hand.scale).applyQuaternion(paddle.quaternion).add(paddle.position);
    const follow=frame?.follow??0,preparation=frame?.preparation??0;
    const side=sign*facing,arc=frame?.backhand?-.6:1;
    data.elbow.set(paddle.position.x+side*(.23+preparation*.035+arc*follow*.13*(style?.sweep??1)),
      Math.max(.51,paddle.position.y-.32+follow*.15*(style?.lift??1)),
      facing*Math.max(1.66,paddle.position.z*facing+.41+preparation*.04-follow*.06));
    data.shoulder.set(paddle.position.x*.85+side*.36,Math.max(.47,paddle.position.y-.47),
      facing*Math.max(1.91,paddle.position.z*facing+.65));
    const length=data.direction.subVectors(data.wrist,data.elbow).length();
    data.rotation.setFromUnitVectors(data.axis,data.direction.normalize());
    data.forearm.position.copy(data.elbow);data.forearm.quaternion.copy(data.rotation);data.forearm.scale.y=length;
    data.cuff.position.copy(data.elbow).lerp(data.wrist,.07);data.cuff.quaternion.copy(data.rotation);data.cuff.scale.y=.115;
    data.trim.position.copy(data.elbow).lerp(data.wrist,.07).addScaledVector(data.direction,.06);data.trim.quaternion.copy(data.rotation);data.trim.scale.y=.011;
    data.sleeve.position.copy(data.shoulder);
    data.direction.subVectors(data.cuff.position,data.shoulder);data.sleeve.scale.y=data.direction.length();
    data.sleeve.quaternion.setFromUnitVectors(data.axis,data.direction.normalize());
  }
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
  root.PingVisuals = Object.freeze({ SCENES, MODEL_NAMES, createPaddle, setPaddleColor, createGrip, updateGrip, disposePaddle, createOutdoor });
})(typeof globalThis !== 'undefined' ? globalThis : this);
