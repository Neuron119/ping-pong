(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./characters.js') : root.PingCharacters, typeof module === 'object' && module.exports ? require('./motion.js') : root.PingMotion);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PingPhysics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Characters, Motion) {
  'use strict';
  const C = Object.freeze({ halfWidth: .7625, halfLength: 1.37, tableY: .76, netHeight: .1525, radius: .02, gravity: 9.81, step: 1 / 240, serveOffset: .036, serveLift: .075, airDrag: .105, magnus: .012, friction: .22, inertia: 2 / 3, maxShotSpeed: 9.2, maxSpin: 210 });
  const LEVELS = Object.freeze({
    beginner: { name: '入门', reaction: .29, speed: 1.65, accuracy: .19, miss: .24, shotError: .16, ballSpeed: 2.65 },
    standard: { name: '标准', reaction: .19, speed: 2.3, accuracy: .12, miss: .14, shotError: .10, ballSpeed: 3.15 },
    advanced: { name: '进阶', reaction: .12, speed: 3.0, accuracy: .065, miss: .065, shotError: .055, ballSpeed: 3.85 },
    pro: { name: '专业', reaction: .065, speed: 4.1, accuracy: .028, miss: .025, shotError: .025, ballSpeed: 4.7 },
    master: { name: '大师', reaction: .043, speed: 5.0, accuracy: .017, miss: .012, shotError: .014, ballSpeed: 5.7, anticipation: .82 },
    legend: { name: '传奇', reaction: .026, speed: 6.0, accuracy: .010, miss: .006, shotError: .008, ballSpeed: 6.6, anticipation: 1 },
    champion: { name: '冠军', reaction: .014, speed: 7.2, accuracy: .004, miss: .0025, shotError: .003, ballSpeed: 7.1, anticipation: 1, nearReach: -.45, returnMargin: .025 },
    apex: { name: '巅峰', reaction: .005, speed: 8.6, accuracy: 0, miss: 0, shotError: 0, ballSpeed: 7.6, anticipation: 1, nearReach: -.24, returnMargin: .06 }
  });
  const AI_REACH = { x: 1.04, near: -.60, deep: -1.72, minY: .90, maxY: 1.50 };
  const STYLES = Object.freeze({
    balanced: { name: '均衡型', speed: 1, spread: 1, error: 1 },
    defensive: { name: '防守型', speed: .84, spread: .74, error: .8 },
    aggressive: { name: '进攻型', speed: 1.14, spread: 1.12, error: 1.25 }
  });
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const mix = (a,b,t) => a+(b-a)*t;
  const smooth = (a,b,v) => { const t=clamp((v-a)/(b-a),0,1);return t*t*(3-2*t); };
  const opposite = side => side === 'player' ? 'ai' : 'player';
  // Direction uses the ratio of lateral / forward movement, so the same
  // diagonal gesture aims the same way on a phone and with a mouse.
  function playerPlacement(p, b, serving = false) {
    const power = clamp(-p.swingVZ, 0, 6);
    const steering = Math.tanh(p.swingVX / Math.max(power, .38) * 1.5);
    const strength = clamp((power - .32) / 5.68, 0, 1);
    const x = clamp(b.x * .68 + steering * .84 + (b.x - p.x) * .24 + b.vx*.025, -.70, .70);
    const depth = serving ? .38 + strength * .70 : .28 + Math.pow(strength, .72) * .95;
    return { x, z: -depth, power, steering };
  }
  function placementName(x, z) {
    return (x < -.25 ? '左路' : x > .25 ? '右路' : '中路') + (Math.abs(z) < .58 ? '短球' : Math.abs(z) > 1.02 ? '长球' : '半长球');
  }
  // Coordinate system: +x right, +y up, player at +z. A rightward brush
  // on the rear of the ball produces +spinY; omega cross velocity bends it left.
  function advanceBall(b, dt) {
    const { vx, vy, vz } = b, wx = b.spinX || 0, wy = b.spinY || 0, wz = b.spinZ || 0;
    const speed = Math.hypot(vx, vy, vz), drag = C.airDrag * speed;
    // Quadratic drag removes energy; omega cross v curves the flight without
    // adding kinetic energy. Lift saturates at high spin / low travel speed.
    const lift = C.magnus / (1 + .12 * C.radius * Math.hypot(wx, wy, wz) / Math.max(speed, .3));
    b.vx += (lift * (wy * vz - wz * vy) - drag * vx) * dt;
    b.vy += (-C.gravity + lift * (wz * vx - wx * vz) - drag * vy) * dt;
    b.vz += (lift * (wx * vy - wy * vx) - drag * vz) * dt;
    b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    const decay = Math.exp(-.26 * dt);
    b.spinX = wx * decay; b.spinY = wy * decay; b.spinZ = wz * decay;
  }
  function reboundBall(b) {
    const downward = Math.max(0, -b.vy), restitution = clamp(.9 - downward * .012, .80, .89);
    const slipX = b.vx + C.radius * (b.spinZ || 0), slipZ = b.vz - C.radius * b.spinX;
    const slip = Math.hypot(slipX, slipZ);
    const impulse = Math.min(slip / (1 + 1 / C.inertia), C.friction * downward * (1 + restitution));
    const dx = slip > 1e-8 ? -slipX / slip * impulse : 0, dz = slip > 1e-8 ? -slipZ / slip * impulse : 0;
    b.vx += dx; b.vz += dz; b.vy = downward * restitution;
    b.spinX -= dz / (C.inertia * C.radius);
    b.spinZ = (b.spinZ || 0) + dx / (C.inertia * C.radius);
    b.spinY *= .96;
  }
  // A launch reference, evaluated only at impact. The final velocity also
  // retains the physical impact response; nothing steers a ball during flight.
  function aimFlight(b, targetX, targetZ, speed, assistance = .64, netMargin = .055) {
    const start = { ...b }, distance = Math.abs(targetZ - start.z);
    let flight = clamp(distance / Math.max(speed, 1), .23, .90), best;
    let low=flight, high=1.12;
    for (let attempt = 0; attempt < 12; attempt++) {
      let vx = (targetX - start.x) / flight, vz = (targetZ - start.z) / flight;
      let vy = (C.tableY + C.radius - start.y + .5 * C.gravity * flight * flight) / flight;
      let netY = -Infinity;
      for (let iteration = 0; iteration < 10; iteration++) {
        const trial = { ...start, vx, vy, vz }; netY = -Infinity;
        let elapsed = 0;
        while (elapsed < flight - 1e-8) {
          const h = Math.min(C.step, flight - elapsed), previous = { ...trial };
          advanceBall(trial, h); elapsed += h;
          if (previous.z * trial.z <= 0) {
            const f = previous.z / (previous.z - trial.z);
            netY = previous.y + (trial.y - previous.y) * f;
          }
        }
        best = { vx, vy, vz };
        vx += (targetX - trial.x) / flight * assistance;
        vy += (C.tableY + C.radius - trial.y) / flight;
        vz += (targetZ - trial.z) / flight;
      }
      const clearance = C.tableY + C.netHeight + C.radius + netMargin;
      if(attempt===0&&netY>=clearance)break;
      if(netY<clearance)low=flight;else high=flight;
      flight=(low+high)/2;
    }
    Object.assign(b, best);
  }
  function aimServe(b, targetX, targetZ) {
    const start = { ...b }, direction = Math.sign(targetZ);
    let best = null;
    // Continuously solve the downward contact angle and both bounce positions with
    // the actual spin/drag model. A valid candidate must clear the net and
    // first land on the server's half, even from a wide starting position.
    let low=-3.6,high=0;
    for (let angle=0;angle<12;angle++) {
      const vy=(low+high)/2;
      let vx = (targetX - start.x) / .78, vz = direction * 3.8, trial, first, netY, elapsed;
      for (let iteration = 0; iteration < 15; iteration++) {
        trial = { ...start, vx, vy, vz }; first = null; netY = -Infinity; elapsed = 0;
        let count = 0;
        while (elapsed < 2 && count < 2) {
          const previous = { ...trial }; advanceBall(trial, C.step); elapsed += C.step;
          if (previous.z * trial.z <= 0) {
            const f = previous.z / (previous.z - trial.z);
            netY = previous.y + (trial.y - previous.y) * f;
          }
          if (trial.y <= C.tableY + C.radius && previous.y > C.tableY + C.radius && trial.vy < 0) {
            // Interpolate to the same surface used by the swept collision.
            const f = (previous.y - C.tableY - C.radius) / (previous.y - trial.y);
            trial.x = previous.x + (trial.x - previous.x) * f;
            trial.z = previous.z + (trial.z - previous.z) * f;
            trial.y = C.tableY + C.radius; count++;
            if (count === 1) { first = { ...trial }; reboundBall(trial); }
          }
        }
        if (iteration < 14) {
          vx += (targetX - trial.x) / Math.max(elapsed, .4) * .82;
          vz += (targetZ - trial.z) / Math.max(elapsed, .4) * .87;
        }
      }
      const error = Math.hypot(targetX - trial.x, targetZ - trial.z);
      const legal = first && first.z * direction < -C.radius && Math.abs(first.z) < C.halfLength - .025
        && Math.abs(first.x) < C.halfWidth - .025 && netY > C.tableY + C.netHeight + C.radius + .012;
      const score = error * 10 + Math.abs(netY - .99) + (legal ? 0 : 100);
      if (!best || score < best.score) best = { vx, vy, vz, score };
      if(netY<.99)high=vy;else low=vy;
    }
    Object.assign(b, { vx: best.vx, vy: best.vy, vz: best.vz });
  }
  function spinName(b, fallback = '上旋') {
    return Math.abs(b.spinY) > 24 ? (b.spinY > 0 ? '左侧旋' : '右侧旋') : fallback;
  }
  function strokeContext(p, b, incoming = true, options = {}) {
    const facing = options.side === 'ai' ? -1 : 1, hand = options.hand === 'left' ? -1 : 1;
    const x = p.x * facing, z = p.z * facing;
    const reach = clamp(x / 1.03, -1, 1);
    // A backhand rotates around the blade normal: the head points toward the
    // ball and the handle toward the wrist. Smoothstep avoids a pose snap at
    // the center line; mirrored left-handed players use the same curve.
    const expected = Number.isFinite(options.contactX) ? options.contactX * facing : x;
    const lateral = incoming ? x * .75 + expected * .25 : x;
    const amount = clamp((-lateral * hand - .08) / .49, 0, 1);
    const backhand = amount * amount * (3 - 2 * amount);
    const lean = -reach * .20 + hand * backhand * 1.36;
    let pose;
    if (incoming && b.y > 1.42 && z > 1.20) pose = { key: 'smash', name: '高球扣杀', pitch: -.10, yaw: reach * .06, roll: lean - .08 * hand };
    else if (z < 1.24 && (!incoming || b.y < 1.28)) pose = { key: 'push', name: '近网搓球', pitch: .40, yaw: reach * .08, roll: lean };
    else if (x * hand < -.16) pose = { key: 'backhand', name: '反手挡球', pitch: .18, yaw: reach * .04, roll: lean + .06 * hand };
    else pose = { key: 'forehand', name: '正手攻球', pitch: .18, yaw: reach * .04, roll: lean - .05 * hand };
    // Rotate the entire local stroke into the opponent's facing direction.
    if(options.grip==='penhold') { pose.pitch-=.07;pose.yaw+=hand*.06; }
    return { ...pose, pitch: pose.pitch * facing, yaw: pose.yaw * facing, roll: clamp(lean+hand*(-.05+.11*backhand),-1.54,1.54) * facing };
  }
  function smoothHeight(p, target, dt, maxSpeed = .82) {
    const desired = clamp((target - p.y) * 11, -maxSpeed, maxSpeed);
    p.vy = (p.vy || 0) + clamp(desired - (p.vy || 0), -5.5 * dt, 5.5 * dt);
    const next = p.y + p.vy * dt;
    if ((target - p.y) * (target - next) <= 0) { p.y = target; p.vy = 0; }
    else p.y = next;
  }
  function paddleFrame(p, pose, side, time, eta, incoming=true,hand='right',style) {
    const motion=Motion.stroke(p,pose,{time,side,incoming,eta,hand,style});
    const held=p.impactPose?1-smooth(.035,.16,time-(p.contactAt??-10)):0;
    const pitch=mix(motion.pitch,p.impactPose?.pitch??motion.pitch,held),yaw=mix(motion.yaw,p.impactPose?.yaw??motion.yaw,held),roll=mix(motion.roll,p.impactPose?.roll??motion.roll,held);
    const a=Math.cos(pitch),b=Math.sin(pitch),c=Math.cos(yaw),d=Math.sin(yaw),e=Math.cos(roll),f=Math.sin(roll);
    const facing=side==='player'?-1:1;
    return {x:p.x+motion.x,y:p.y+motion.y,z:p.z+motion.z,
      u:{x:c*e,y:a*f+b*d*e,z:b*f-a*d*e},v:{x:-c*f,y:a*e-b*d*f,z:b*e+a*d*f},
      normal:{x:d*facing,y:-b*c*facing,z:a*c*facing},pose:{pitch,yaw,roll},
      follow:motion.follow,preparation:motion.preparation,backhand:motion.backhand};
  }
  function paddleContact(a,b,oldFrame,frame,padding=0) {
    const local=(p,f,axis)=>(p.x-f.x)*f[axis].x+(p.y-f.y)*f[axis].y+(p.z-f.z)*f[axis].z;
    const start=local(a,oldFrame,'normal'),end=local(b,frame,'normal'),radius=C.radius+.016+padding*.6;
    // Sweep the whole relative path through a thin blade volume. A sideways
    // rescue can enter the edge after the ball has reached the face plane.
    // Reject balls already behind the blade, so late gestures cannot recall it.
    if(start < -radius)return null;
    let enter=0,leave=1;
    const normalTravel=end-start;
    if(Math.abs(normalTravel)<1e-9) {if(Math.abs(start)>radius)return null;}
    else {
      const first=(-radius-start)/normalTravel,last=(radius-start)/normalTravel;
      enter=Math.max(0,Math.min(first,last));leave=Math.min(1,Math.max(first,last));
      if(enter>leave)return null;
    }
    const width=.153+C.radius+padding,height=.169+C.radius+padding;
    const u0=local(a,oldFrame,'u'),v0=local(a,oldFrame,'v');
    const du=local(b,frame,'u')-u0,dv=local(b,frame,'v')-v0;
    const x=(u0+du*enter)/width,y=(v0+dv*enter)/height,dx=du/width,dy=dv/height;
    let t=enter;
    if(x*x+y*y>1) {
      const aa=dx*dx+dy*dy,bb=2*(x*dx+y*dy),cc=x*x+y*y-1,disc=bb*bb-4*aa*cc;
      if(aa<1e-12||disc<0)return null;
      t+=(-bb-Math.sqrt(disc))/(2*aa);
      if(t<enter-1e-9||t>leave+1e-9)return null;
      t=clamp(t,enter,leave);
    }
    const center={x:mix(a.x,b.x,t),y:mix(a.y,b.y,t),z:mix(a.z,b.z,t)};
    const u=u0+du*t,v=v0+dv*t,impact={...frame};
    for(const key of ['x','y','z'])impact[key]=mix(oldFrame[key],frame[key],t);
    for(const axis of ['u','v','normal']) {
      const vector={};for(const key of ['x','y','z'])vector[key]=mix(oldFrame[axis][key],frame[axis][key],t);
      const length=Math.hypot(vector.x,vector.y,vector.z)||1;
      for(const key of ['x','y','z'])vector[key]/=length;
      impact[axis]=vector;
    }
    impact.pose={};for(const key of ['pitch','yaw','roll'])impact.pose[key]=mix(oldFrame.pose?.[key]||0,frame.pose?.[key]||0,t);
    return {t,center,u,v,quality:clamp(Math.hypot(u/width,v/height),0,1),frame:impact};
  }
  function limitShot(b) {
    const spin=Math.hypot(b.spinX,b.spinY,b.spinZ),speed=Math.hypot(b.vx,b.vy,b.vz);
    if(spin>C.maxSpin)for(const k of ['spinX','spinY','spinZ'])b[k]*=C.maxSpin/spin;
    if(speed>C.maxShotSpeed)for(const k of ['vx','vy','vz'])b[k]*=C.maxShotSpeed/speed;
  }
  function launchShot(b, incoming, frame, options) {
    const {side,power,brush,cut,attack,spin,quality,targetX,targetZ,speed,control}=options;
    const facing=side==='player'?-1:1,edge=smooth(.40,1,quality);
    // Restitution against a moving rubber surface supplies the raw response.
    // Normal motion drives the ball; tangential slip supplies a short friction
    // impulse and spin. Both players use these same limits and launch helper.
    const raw={...incoming},surface={x:brush*.22,y:Math.max(0,power)*.06,z:facing*power*.52*attack};
    const relative=(raw.vx-surface.x)*frame.normal.x+(raw.vy-surface.y)*frame.normal.y+(raw.vz-surface.z)*frame.normal.z;
    const impulse=Math.max(0,-relative)*(1+.72-edge*.20);
    raw.vx+=frame.normal.x*impulse;raw.vy+=frame.normal.y*impulse;raw.vz+=frame.normal.z*impulse;
    const tangent=.12+.18*Math.min(1,Math.abs(brush)/4);
    raw.vx+=(surface.x-raw.vx)*tangent;
    raw.vy+=(surface.y-raw.vy)*.08;
    // A named stroke can ask for a slightly lower trajectory, but the same
    // spin/drag solver still provides a positive net allowance.
    const reference={...b};aimFlight(reference,targetX,targetZ,speed,.94,options.netMargin);
    // Large launch correction is reserved for centered, deliberate strokes.
    // Blocks retain substantially more incoming momentum and rubber response.
    const active=smooth(.12,1.5,power+Math.abs(brush)*.25);
    const assistance=clamp((.76+.17*active)*control*(1-edge*.30),.48,.95);
    b.vx=mix(raw.vx,reference.vx,Math.min(.97,assistance+.06));
    b.vz=mix(raw.vz,reference.vz,assistance);
    b.vy=mix(raw.vy,reference.vy,assistance);
    // Modest vertical launch support keeps a central passive block playable;
    // low contacts, off-center strokes and incoming spin still carry risk.
    const verticalSupport=(.92-.21*edge)*smooth(.79,1.02,b.y);
    b.vy=mix(b.vy,reference.vy,verticalSupport);
    b.vx+=incoming.spinY*(.0012+.0025*edge)/Math.max(.7,control);
    b.vy+=incoming.spinX*(.001+.002*edge)/Math.max(.7,control);
    // Edges lose energy rather than behaving like perfect central impacts.
    const loss=1-.13*edge;
    b.vx*=loss;b.vz*=loss;
    if(options.signatureAim){
      // Accurate signature contact favors its solved arc. Ordinary shots,
      // including off-center blocks, keep their usual rubber response.
      for(const key of ['vx','vy','vz'])b[key]=mix(b[key],reference[key],options.signatureAim);
    }
    limitShot(b);
    return {normalImpulse:impulse,friction:clamp((Math.abs(brush)*.19+cut*.48)*spin,0,1),power:active,edge};
  }
  function reflectContact(b, n, restitution = .64, friction = .16) {
    const dot = b.vx * n.x + b.vy * n.y + b.vz * n.z;
    if (dot >= 0) return;
    const jn = -(1 + restitution) * dot;
    const wx = b.spinX || 0, wy = b.spinY || 0, wz = b.spinZ || 0, r = C.radius;
    const sx = b.vx - dot*n.x - r*(wy*n.z-wz*n.y);
    const sy = b.vy - dot*n.y - r*(wz*n.x-wx*n.z);
    const sz = b.vz - dot*n.z - r*(wx*n.y-wy*n.x);
    const slip = Math.hypot(sx,sy,sz), factor = slip ? Math.min(slip/(1+1/C.inertia),friction*jn)/slip : 0;
    const tx=-sx*factor, ty=-sy*factor, tz=-sz*factor;
    b.vx += jn*n.x+tx; b.vy += jn*n.y+ty; b.vz += jn*n.z+tz;
    b.spinX = wx-r*(n.y*tz-n.z*ty)/(C.inertia*r*r);
    b.spinY = wy-r*(n.z*tx-n.x*tz)/(C.inertia*r*r);
    b.spinZ = wz-r*(n.x*ty-n.y*tx)/(C.inertia*r*r);
  }
  // Exact swept sphere against a finite solid tabletop. The distance to a box
  // is convex along a segment; interval minimization also catches corner hits.
  function tableContact(a, b) {
    const lo={x:-C.halfWidth,y:C.tableY-.07,z:-C.halfLength}, hi={x:C.halfWidth,y:C.tableY,z:C.halfLength};
    const d={x:b.x-a.x,y:b.y-a.y,z:b.z-a.z}, r=C.radius;
    let enter=0,leave=1;
    for(const k of ['x','y','z']) {
      if(Math.abs(d[k])<1e-12) {if(a[k]<lo[k]-r||a[k]>hi[k]+r)return null;}
      else {let t0=(lo[k]-r-a[k])/d[k],t1=(hi[k]+r-a[k])/d[k];if(t0>t1)[t0,t1]=[t1,t0];enter=Math.max(enter,t0);leave=Math.min(leave,t1);if(enter>leave)return null;}
    }
    const sample=t=>{const center={},q={};for(const k of ['x','y','z']){center[k]=a[k]+d[k]*t;q[k]=clamp(center[k],lo[k],hi[k]);}return {center,q,distance:(center.x-q.x)**2+(center.y-q.y)**2+(center.z-q.z)**2};};
    let l=enter,h=leave;
    for(let i=0;i<24;i++){const u=l+(h-l)/3,v=h-(h-l)/3;if(sample(u).distance<sample(v).distance)h=v;else l=u;}
    const min=(l+h)/2;if(sample(min).distance>r*r+1e-10)return null;
    l=enter;h=min;
    for(let i=0;i<24;i++){const m=(l+h)/2;if(sample(m).distance>r*r)l=m;else h=m;}
    const t=h,{center,q}=sample(t),length=Math.hypot(center.x-q.x,center.y-q.y,center.z-q.z);
    if(length<1e-8)return null;
    const n={x:(center.x-q.x)/length,y:(center.y-q.y)/length,z:(center.z-q.z)/length};
    if(d.x*n.x+d.y*n.y+d.z*n.z>=-1e-8)return null;
    const upperRim=Math.abs(q.x)>=C.halfWidth-1e-7||Math.abs(q.z)>=C.halfLength-1e-7;
    return {t,center,point:q,normal:n,kind:n.y>1e-4?(n.y>.999&&!upperRim?'top':'edge'):'side'};
  }
  function netContact(a,b) {
    const y=C.tableY+C.netHeight, r=C.radius+.006,dy=b.y-a.y,dz=b.z-a.z;
    const ay=a.y-y,A=dy*dy+dz*dz,B=2*(ay*dy+a.z*dz),D=B*B-4*A*(ay*ay+a.z*a.z-r*r);
    let cord=null;
    if(A>1e-12&&D>=0) {
      const t=(-B-Math.sqrt(D))/(2*A),x=a.x+(b.x-a.x)*t;
      if(t>=0&&t<=1&&Math.abs(x)<=C.halfWidth+.1525) {
        const cy=a.y+dy*t,cz=a.z+dz*t;
        cord={t,center:{x,y:cy,z:cz},normal:{x:0,y:(cy-y)/r,z:cz/r},kind:'cord'};
      }
    }
    const direction=Math.sign(dz),plane=-direction*C.radius;
    if(direction&&((a.z-plane)*(b.z-plane)<=0)) {
      const t=(plane-a.z)/dz,x=a.x+(b.x-a.x)*t,cy=a.y+dy*t;
      if(t>=0&&t<=1&&Math.abs(x)<=C.halfWidth+.1525&&cy>=C.tableY-C.radius&&cy<=y&&(!cord||t<cord.t))return {t,center:{x,y:cy,z:plane},normal:{x:0,y:0,z:-direction},kind:'mesh'};
    }
    return cord;
  }

  function applyTableBounce(ball, contact) {
    Object.assign(ball, contact.center);
    if (contact.kind === 'top') reboundBall(ball);
    else reflectContact(ball, contact.normal, .84, C.friction);
    ball.x += contact.normal.x * .0002;
    ball.y += contact.normal.y * .0002;
    ball.z += contact.normal.z * .0002;
  }

  function hasSafeLanding(ball, margin, direction) {
    const shot = { ...ball };
    for (let t = 0; t < 1.5; t += C.step) {
      const previous = { ...shot };
      advanceBall(shot, C.step);
      if (netContact(previous, shot)) return false;
      const contact = tableContact(previous, shot);
      if (contact) return contact.kind === 'top' && Math.abs(contact.point.x) <= C.halfWidth - margin
        && contact.point.z * direction > margin && contact.point.z * direction <= C.halfLength - margin;
      if (shot.y < C.tableY - C.radius || shot.z * direction > C.halfLength + C.radius) return false;
    }
    return false;
  }

  function stabilizeReturn(b, targetX, targetZ, speed, margin, direction = 1, netMargin) {
    if (hasSafeLanding(b, margin, direction)) return { x: targetX, z: targetZ };
    // Only choose the launch at a real impact. Keep the intended placement
    // first, then trade pace and spin for a safe mid-table block if needed.
    const x = clamp(targetX, -.66, .66), z = clamp(Math.abs(targetZ), .35, 1.18);
    for (const [safeX, depth, pace, spin] of [[x, z, speed, 1], [x * .55, .75, 3.45, .45], [0, .68, 2.9, 0]]) {
      const safeZ=depth*direction;
      const shot = { ...b, spinX: b.spinX * spin, spinY: b.spinY * spin, spinZ: b.spinZ * spin };
      aimFlight(shot, safeX, safeZ, pace, 1, netMargin);
      limitShot(shot);
      if (hasSafeLanding(shot, margin, direction)) {
        Object.assign(b, shot);
        return { x: safeX, z: safeZ };
      }
    }
    return { x: targetX, z: targetZ };
  }


  class Match {
    constructor(bestOf = 1, firstServer = 'player') { this.bestOf = bestOf; this.firstServer = firstServer; this.gameFirstServer = firstServer; this.points = { player: 0, ai: 0 }; this.games = { player: 0, ai: 0 }; this.gameNumber = 1; this.over = false; this.gameOver = false; this.endsChanged = false; this.completedGames = []; }
    get server() {
      const total = this.points.player + this.points.ai;
      const deuce = this.points.player >= 10 && this.points.ai >= 10;
      const switches = deuce ? total - 20 + 10 : Math.floor(total / 2);
      return switches % 2 ? opposite(this.gameFirstServer) : this.gameFirstServer;
    }
    award(side) {
      if (this.over || this.gameOver) return null;
      this.points[side]++;
      const a = this.points[side], b = this.points[opposite(side)];
      const changeEnds = this.bestOf > 1 && this.gameNumber === this.bestOf && !this.endsChanged && Math.max(a, b) === 5;
      if (changeEnds) this.endsChanged = true;
      if (a >= 11 && a - b >= 2) {
        this.gameOver = true; this.games[side]++;
        this.completedGames.push({ ...this.points });
        this.over = this.games[side] >= Math.ceil(this.bestOf / 2);
        return { winner: side, gameOver: true, matchOver: this.over, changeEnds };
      }
      return { winner: side, gameOver: false, matchOver: false, changeEnds };
    }
    nextGame() {
      if (!this.gameOver || this.over) return false;
      this.gameNumber++; this.gameFirstServer = opposite(this.gameFirstServer);
      this.points = { player: 0, ai: 0 }; this.gameOver = false; this.endsChanged = false; return true;
    }
  }

  class Simulation {
    constructor(options = {}) {
      this.random = options.random || Math.random; this.onEvent = options.onEvent || (() => {});
      this.difficulty = options.difficulty || 'beginner'; this.state = 'idle'; this.time = 0;
      this.mode = 'match'; this.aiStyle = 'balanced'; this.characters = { player: 'ma-long', ai: 'fan-zhendong' }; this.swingRecognition = 'standard';
      this.equipment = {player:Characters.equipment('ma-long'),ai:Characters.equipment('fan-zhendong')};
      this.signatureUsed={player:false,ai:false};this.signatureCooldown={player:0,ai:0};this.pointHits={player:0,ai:0};this.previousPlacement={player:0,ai:0};this.previousDepth={player:0,ai:0};
      this.practice = { attempts: 0, successes: 0, streak: 0, bestStreak: 0 };
      this.lastShot = null;
      this.player = { x: .35, y: 1.08, z: 1.62, vx: 0, vz: 0, targetX: .35, targetZ: 1.62, activeUntil: 0, swingUntil: 0, swingVX: 0, swingVZ: 0, contactAt: -10, gestures: [], cutting: false };
      this.ai = { x: 0, y: 1.08, z: -1.57, targetX: 0, targetZ: -1.57, decideAt: 0, willMiss: false, aimError: 0 };
      this.ball = { x: 0, y: 1.1, z: 1.6, vx: 0, vy: 0, vz: 0, spinX: 0, spinY: 0, spinZ: 0 };
      this.match = new Match(); this.rally = 0; this.maxRally = 0; this.totalHits = 0; this.serveNumber = 0;
      this.lastHitter = null; this.expectedSide = null; this.bounces = 0; this.serveStage = 0; this.netTouched = false; this.pointTime = 0;
    }
    emit(type, detail = {}) { this.onEvent({ type, ...detail }); }
    get server() { return this.mode === 'match' ? this.match.server : this.mode === 'serve' ? 'player' : 'ai'; }
    start(bestOf = 1, difficulty = 'beginner', firstServer = 'player', options = {}) {
      this.difficulty = LEVELS[difficulty] ? difficulty : 'beginner';
      this.mode = ['rally','slow','serve'].includes(options.mode) ? options.mode : 'match';
      this.characters = Characters.pair(options.playerCharacter, options.aiCharacter);
      this.setEquipment(options.equipment || {});
      this.aiStyle = STYLES[options.aiStyle] ? options.aiStyle : Characters.get(this.characters.ai).tactic;
      this.swingRecognition = ['easy','standard','firm'].includes(options.swingRecognition) ? options.swingRecognition : 'standard';
      this.practice = { attempts: 0, successes: 0, streak: 0, bestStreak: 0 };
      this.match = new Match(bestOf, firstServer); this.rally = this.maxRally = this.totalHits = 0;
      this.signatureCooldown = {player:0,ai:0};
      this.lastShot = null; this.ai.lastTargetX = 0; this.ai.contactAt = -10;
      this.time = 0; this.player.x = this.player.targetX = 0; this.player.z = this.player.targetZ = 1.62;
      this.player.y = 1.08; this.player.vy = 0; this.player.heightLock = null; this.endPlayerDrag(); this.player.contactAt = -10; this.player.swingUntil = 0; this.player.gestures = []; this.ai.x = 0; this.ai.y=1.08;this.ai.vy=0;this.ai.z=-1.62;this.ai.targetX=0;this.ai.targetZ=-1.62;
      this.player.swingVX=this.player.swingVZ=0;this.player.impactPose=this.ai.impactPose=null;
      this.prepare();
    }
    prepare() {
      this.signatureUsed={player:false,ai:false};this.pointHits={player:0,ai:0};this.previousPlacement={player:0,ai:0};this.previousDepth={player:0,ai:0};
      this.receiverBounceAt=null;
      this.state = 'ready'; this.rally = 0; this.lastHitter = null; this.expectedSide = null;
      this.bounces = 0; this.serveStage = 0; this.netTouched = false; this.player.swingUntil = 0; this.player.gestures = []; this.player.heightLock = null; this.endPlayerDrag(); this.playerPlan = null; this.playerPlanAt = -1; this.netContactAt = -10; this.netFailed = false; this.aiPlan = null; this.aiPlanAt = -1;
      this.pendingServe=null;this.missFeedback=null;this.player.serveAt=this.ai.serveAt=-10;
      this.player.z = this.player.targetZ = 1.62;
      const server = this.server, side = server === 'player' ? this.player : this.ai;
      // Return the serving paddle to a legal, reachable starting area even
      // after a wide rally. Otherwise the first bounce could start off-table.
      side.x = side.targetX = clamp(side.x, -.64, .64);
      if (server === 'ai') { side.z = side.targetZ = -1.62; side.y = 1.08; side.vy=0; }
      Object.assign(this.ball, { x: side.x, y: side.y + C.serveLift, z: side.z + (server === 'player' ? -C.serveOffset : C.serveOffset), vx: 0, vy: 0, vz: 0, spinX: 0, spinY: 0, spinZ: 0 });
      this.readyTime = this.time; this.emit('ready', { server });
    }
    beginPlayerDrag() {
      this.endPlayerDrag();
      this.player.gestures = []; this.player.cutting = false;
    }
    endPlayerDrag() {
      this.player.strokeAnchor = null;
      this.player.dragOffsetX = 0; this.player.dragOffsetZ = 0;
    }
    setEquipment(overrides={}) {
      for(const side of ['player','ai'])this.equipment[side]=Characters.equipment(this.characters[side],overrides[side]);
    }
    movePlayer(x, z, vx, vz) {
      const p = this.player;
      const serving = this.state === 'ready' && this.server === 'player';
      // Position always follows the drag, including fast swipes at contact.
      // Shot effort is sampled separately and never anchors either travel axis.
      p.targetX = clamp(x - (p.dragOffsetX || 0), serving ? -.64 : -1.03, serving ? .64 : 1.03);
      p.dragOffsetX = x - p.targetX;
      p.targetZ = clamp(z - (p.dragOffsetZ || 0), serving ? 1.50 : .64, serving ? 1.82 : 1.95);
      // Rebase overscroll so reversing at a travel limit responds immediately.
      p.dragOffsetZ = z - p.targetZ;
      this.player.activeUntil = this.time + .20;
      // Expired gestures become passive blocks instead of replaying old power.
      const effort={easy:1.18,standard:1,firm:.82}[this.swingRecognition]||1;
      vx*=effort;vz*=effort;
      this.player.swingVX = clamp(vx, -6, 6); this.player.swingVZ = clamp(vz, -6, 6);
      const history = this.player.gestures.filter(g => this.time - g.at < .13);
      const peak = Math.max(0, ...history.map(g => -g.vz));
      this.player.cutting = peak > 2.1 && -vz > .35 && -vz < peak * .42;
      history.push({ at: this.time, vx, vz }); this.player.gestures = history.slice(-20);
      this.player.gestureAt = this.time;
      this.player.swingUntil = vz < -.32 || Math.abs(vx) > .60 ? this.time + .145 : 0;
    }
    update(dt, controlScale = 1) {
      if (this.state === 'idle') return;
      let remaining = Math.min(dt, .08);
      while (remaining > 0) { const h = Math.min(C.step, remaining); this.step(h, controlScale); remaining -= h; }
    }
    step(dt, controlScale = 1) {
      this.time += dt;
      const p = this.player, b = this.ball, ai = this.ai, level = LEVELS[this.difficulty];
      const oldPX = p.x, oldPZ = p.z;
      const oldPlayerFrame=this.paddleFrame('player'),oldAIFrame=this.paddleFrame('ai');
      const blend = 1 - Math.exp(-100 * Characters.modifier(this.characters.player,'speed') * dt * controlScale);
      p.x += (p.targetX - p.x) * blend; p.z += (p.targetZ - p.z) * blend;
      p.vx = (p.x - oldPX) / dt; p.vz = (p.z - oldPZ) / dt;
      const incoming = this.lastHitter === 'ai' && this.state === 'rally';
      // At the table, raise the hand enough that the open blade and handle
      // clear the tabletop; moderate contact tolerance still reaches low balls.
      if (incoming && (this.time-(this.playerPlanAt ?? -1)>.035||Math.abs(p.z-(this.playerPlanZ??p.z))>.045)) {
        this.playerPlan=this.predictPlayerContact();this.playerPlanAt=this.time;this.playerPlanZ=p.z;
      }
      const clearance = clamp((1.55 - p.z) / .24, 0, 1);
      const plan=incoming?this.playerPlan:null, minimum=.90 + .06 * clearance * clearance * (3 - 2 * clearance);
      let desiredY=plan?clamp(plan.y,minimum,1.48):incoming&&p.heightLock?clamp(p.heightLock.y,minimum,1.48):1.08;
      if(p.heightLock&&Math.abs(p.z-p.heightLock.z)>.045)p.heightLock=null;
      if(incoming&&plan&&plan.time<.12&&this.bounces===1) {
        if(!p.heightLock)p.heightLock={y:desiredY,z:p.z,until:this.time+.19};
        desiredY=clamp(desiredY,p.heightLock.y-.018,p.heightLock.y+.018);
      }
      if(!incoming||this.time>(p.heightLock?.until??Infinity))p.heightLock=null;
      smoothHeight(p,desiredY,dt);
      this.contactReady=Boolean(incoming&&plan&&this.bounces===1&&plan.time<.17);
      if (this.state === 'ready') {
        const server = this.server, paddle = server === 'player' ? p : ai;
        b.x = paddle.x; b.y = paddle.y + C.serveLift; b.z = paddle.z + (server === 'player' ? -C.serveOffset : C.serveOffset);
        if (server === 'player' && !this.pendingServe && p.swingUntil > this.time && p.swingVZ < -.38) {
          this.pendingServe={at:this.time+.065,vx:p.swingVX,vz:p.swingVZ,cutting:p.cutting};p.serveAt=this.time;
        }
        if(this.pendingServe&&this.time>=this.pendingServe.at){
          Object.assign(p,{swingVX:this.pendingServe.vx,swingVZ:this.pendingServe.vz,cutting:this.pendingServe.cutting});this.pendingServe=null;this.hitServe('player');
        }
        if (server === 'ai' && this.time - this.readyTime > (this.mode === 'match' ? 1.35 : 1.0)) {
          if (this.mode === 'match') this.serveAI(); else this.feed();
        }
        if(server==='ai'&&this.mode==='match'&&this.time-this.readyTime>1.285&&paddle.serveAt<0)paddle.serveAt=this.time;
        return;
      }
      if (this.state === 'point') { if (this.time - this.pointTime > (this.mode === 'match' ? 1.65 : .85)) { if (this.match.gameOver) this.state = 'gameover'; else this.prepare(); } return; }
      if (this.state === 'gameover') return;
      if (this.state !== 'rally') return;
      this.updateAI(dt, level);
      const prev = { x: b.x, y: b.y, z: b.z };
      advanceBall(b, dt);

      const net=this.time-(this.netContactAt??-10)>.025?netContact(prev,b):null;
      if(net) {
        Object.assign(b,net.center); this.netTouched=true;this.netContactAt=this.time;
        const speed=Math.hypot(b.vx,b.vy,b.vz);
        reflectContact(b,net.normal,net.kind==='cord'?.42:.08,.12);
        b.x+=net.normal.x*.0002;b.y+=net.normal.y*.0002;b.z+=net.normal.z*.0002;
        this.emit('net',{...net.center,kind:net.kind,impactSpeed:speed});
        // A mesh hit has failed to cross. Cord grazes continue physically;
        // only a subsequent legal serve bounce creates a let.
        if(net.kind==='mesh'){b.vx*=.45;b.vy*=.25;b.vz*=.35;this.netFailed=true;}
      }
      const contact=tableContact(prev,b);
      if(contact) {
        Object.assign(b,contact.center);
        const impactSpeed=-(b.vx*contact.normal.x+b.vy*contact.normal.y+b.vz*contact.normal.z);
        if(contact.kind==='side') {
          reflectContact(b,contact.normal,.60,.15);
          this.emit('edge',{...contact.point,legal:false,impactSpeed});
          this.point(this.bounces>=1&&this.serveStage!==1?this.lastHitter:opposite(this.lastHitter),'触及球台侧面，不算落台');return;
        }
        applyTableBounce(b,contact);
        if(contact.kind==='edge')this.emit('edge',{...contact.point,legal:true,impactSpeed});
        this.bounce(contact.point.z>0?'player':'ai',impactSpeed);
        if(this.state!=='rally')return;
      }

      if (this.lastHitter === 'ai' && b.vz > 0 && this.time - p.contactAt > .18) {
        const contact=paddleContact(prev,b,oldPlayerFrame,this.paddleFrame('player'),.025*Characters.modifier(this.characters.player,'defense'));
        if (contact) {
          if (this.bounces === 0) {
            // A ball already beyond the end line is out; touching it there is
            // not an obstruction of a ball above the playing surface.
            const pastEnd = b.z > C.halfLength + C.radius && b.vz > 0;
            this.point(pastEnd ? 'player' : 'ai', pastEnd ? '对手回球出界' : '来球尚未落台，不能截击');
          }
          else {Object.assign(b,contact.center);this.hit('player',contact);}
        }else if(prev.z<=p.z&&b.z>p.z){
          this.missFeedback=Math.abs(b.x-p.x)>.18?'左右没有对准':b.y<p.y-.18?'接球偏晚 · 试着迎前':'来球较高 · 调整站位';
        }
      } else if (this.mode === 'match' && this.lastHitter === 'player' && b.vz < 0 && this.bounces === 1) {
        const frame = this.paddleFrame('ai');
        // If the ball bounced this tick, never count the pre-bounce part of
        // the sweep as a legal hit. A blade at the actual bounce may receive.
        const impact = paddleContact(contact ? b : prev,b,contact ? frame : oldAIFrame,frame,.025*Characters.modifier(this.characters.ai,'defense'));
        if (impact) { Object.assign(b,impact.center);this.hit('ai',impact); }
      }
      if (this.state !== 'rally') return;
      if ((this.netFailed && b.y < C.tableY + C.radius) || b.y < .13 || Math.abs(b.z) > 2.75 || Math.abs(b.x) > 2.45 || this.time - this.shotTime > 4) {
        const legal = this.bounces >= 1 && this.serveStage !== 1;
        this.point(legal && !this.netFailed ? this.lastHitter : opposite(this.lastHitter), this.netFailed?'回球未过网':legal ? '对手未能回球' : this.serveStage === 1 ? '发球未落到对方半台' : '回球出界');
      }
    }
    bounce(side, impactSpeed = Math.abs(this.ball.vy)) {
      this.emit('bounce', { x: this.ball.x, y: C.tableY, z: this.ball.z, impactSpeed });
      if (this.serveStage === 1) {
        if (side !== this.lastHitter) { this.point(opposite(this.lastHitter), '发球须先落在自己的半台'); return; }
        this.serveStage = 2; this.bounces = 0; return;
      }
      if (side !== this.expectedSide) { this.point(opposite(this.lastHitter), '回球落在了自己的半台'); return; }
      this.bounces++;
      if(this.bounces===1)this.receiverBounceAt=this.time;
      if (this.serveStage === 2) {
        this.serveStage = 0;
        if (this.netTouched) { this.emit('let'); this.prepare(); return; }
      }
      if (this.mode !== 'match' && this.lastHitter === 'player' && side === 'ai') {
        this.finishPractice(true, this.mode === 'serve' ? '发球成功 · 两侧落台' : '回球成功 · 再来一球'); return;
      }
      if (this.bounces > 1) this.point(this.lastHitter, '同侧两次落台');
    }
    serveAI() { this.hitServe('ai'); }
    hitServe(side) {
      const b = this.ball, direction = side === 'player' ? -1 : 1;
      this.state = 'rally'; this.lastHitter = side; this.expectedSide = opposite(side);
      this.serveStage = 1; this.bounces = 0; this.netTouched = false; this.netFailed = false; this.shotTime = this.time;
      const paddle = side === 'player' ? this.player : this.ai;
      b.x = paddle.x; b.y = paddle.y + C.serveLift; b.z = paddle.z + direction * C.serveOffset;
      const top=smooth(.65,2.2,-paddle.swingVZ)*(paddle.cutting?.12:1);
      b.spinX = side === 'player' ? mix(24,-25,top) : 0;
      b.spinY = side === 'player' ? clamp(this.player.swingVX * 14, -70, 70) : 0; b.spinZ = 0;
      b.spinX*=Characters.modifier(this.characters[side],'spin');b.spinY*=Characters.modifier(this.characters[side],'spin');
      const placement = side === 'player'
        ? playerPlacement(this.player, b, true)
        : { x: (this.random() - .5) * (this.difficulty === 'beginner' ? .45 : 1.1), z: .48 + this.random() * .54 };
      // A same-side wide serve cannot start with a huge outward tangent:
      // reduce the brush near the rail while preserving the chosen placement.
      if (b.x * placement.x > 0) b.spinY *= clamp(1 - Math.max(0, Math.abs(b.x) - .35) * 2.5, .25, 1);
      aimServe(b, placement.x, placement.z);
      limitShot(b);paddle.impactPose=this.paddleFrame(side).pose;
      paddle.impactStrength=clamp(Math.hypot(b.vx,b.vy,b.vz)/11,.16,1);paddle.impactFriction=Math.min(1,Math.abs(paddle.swingVX||0)/5);
      paddle.impactStroke='serve';paddle.impactBrush=Math.sign(paddle.swingVX||0);paddle.impactSignature=false;
      this.lastShot = { side, x: placement.x, z: placement.z, placement: placementName(placement.x, placement.z), serve: true };
      if (this.mode === 'serve') this.practice.attempts++;
      paddle.contactAt = this.time; this.rally = 1; this.totalHits++; this.maxRally = Math.max(this.maxRally, this.rally);
      this.player.swingUntil = 0;
      this.resetAITarget(); this.emit('hit', { side, speed: Math.hypot(b.vx,b.vy,b.vz), impactSpeed: Math.abs(b.vz),friction:Math.min(1,Math.abs(paddle.swingVX)/5),power:top,contact: 0, spin: spinName(b, '发球'), placement: this.lastShot.placement, x: b.x, y: b.y, z: b.z });
    }
    resetAITarget() {
      const level = LEVELS[this.difficulty];
      this.ai.decideAt = this.time + level.reaction;
      this.ai.willMiss = this.random() < level.miss / Characters.modifier(this.characters.ai,'defense');
      if(this.ai.willMiss)this.ai.decideAt+=.10+level.reaction*.6;
      this.ai.aimError = (this.random() - .5) * level.accuracy * 2 / Characters.modifier(this.characters.ai,'control');
      this.ai.targetX = clamp(this.ball.x, -.9, .9);
      this.aiPlan = null; this.aiPlanAt = -1;
    }
    predictPlayerContact() {
      if(this.ball.vz<=0)return null;
      const b={...this.ball},contactZ=this.player.z-.032;let bounced=this.bounces>0;
      for(let elapsed=0;elapsed<1.4;elapsed+=1/120) {
        const previous={...b};advanceBall(b,1/120);
        const contact=tableContact(previous,b);
        if(contact) {
          if(contact.kind==='side'||bounced)return null;
          Object.assign(b,contact.center);if(contact.kind==='top')reboundBall(b);else reflectContact(b,contact.normal,.84,C.friction);
          b.y+=.0002;bounced=true;
        }
        if(b.z>=contactZ) {
          if(!bounced)return null;
          const f=clamp((contactZ-previous.z)/(b.z-previous.z||1),0,1);
          return {x:previous.x+(b.x-previous.x)*f,y:previous.y+(b.y-previous.y)*f,time:elapsed+f/120};
        }
        if(b.y<.6)return null;
      }
      return null;
    }
    posture(side) {
      const paddle=side==='player'?this.player:this.ai;
      const contactX=side==='player'?this.playerPlan?.x:this.aiPlan?.x;
      return strokeContext(paddle,this.ball,this.lastHitter===opposite(side),{side,...this.equipment[side],contactX});
    }
    paddleFrame(side) {
      const p=this[side],plan=side==='player'?this.playerPlan:this.aiPlan;
      const eta = side === 'ai' ? (plan ? plan.at - this.time : undefined) : plan?.time;
      return paddleFrame(p,this.posture(side),side,this.time,eta,this.state==='rally'&&this.lastHitter===opposite(side),this.equipment[side].hand,Characters.style(this.characters[side]).motion);
    }
    predictAIContact(level = LEVELS[this.difficulty]) {
      if (this.netFailed || (this.serveStage && this.netTouched)) return null;
      const b = { ...this.ball }, ai = this.ai;
      const receivingServe = this.serveStage !== 0 || this.lastShot?.serve === true;
      const preferred = Characters.tactics(this.characters.ai).near;
      const near = level.nearReach ?? AI_REACH.near;
      const speedX = level.speed * Characters.modifier(this.characters.ai,'speed'), speedZ = level.speed * .65;
      const delay = Math.max(0, ai.decideAt - this.time);
      let bounced = this.bounces > 0, waitingForServerBounce = this.serveStage === 1;
      let best = null, lastNet = this.netContactAt;
      let score = Infinity;
      for (let elapsed = C.step; elapsed < 1.5; elapsed += C.step) {
        const previous = { ...b };
        advanceBall(b, C.step);
        const at = this.time + elapsed;
        const net = at - lastNet > .025 ? netContact(previous, b) : null;
        if (net) {
          if (receivingServe || net.kind === 'mesh') break;
          Object.assign(b,net.center);
          reflectContact(b,net.normal,.42,.12);
          b.y += net.normal.y * .0002; b.z += net.normal.z * .0002;
          lastNet = at;
        }
        const contact = tableContact(previous, b);
        if (contact) {
          if (contact.kind === 'side' || bounced || (contact.point.z > 0) !== waitingForServerBounce) break;
          if (waitingForServerBounce) waitingForServerBounce = false;
          else bounced = true;
          applyTableBounce(b,contact);
        }
        if (b.z < -1.91 || b.y < .63) break;
        if (!bounced || b.vz >= 0 || b.z > near + .14 || b.y < .79) continue;
        // Plan for the rising/comfortable part of the bounce, not the last
        // low point before the second bounce. Keep shot depth and reach in
        // the score so the chosen intercept can actually be reached in time.
        const x = clamp(b.x, -AI_REACH.x, AI_REACH.x);
        const y = clamp(b.y, AI_REACH.minY, AI_REACH.maxY);
        const z = clamp(b.z - .055, AI_REACH.deep, near);
        const travel = Math.max(Math.abs(ai.x - x) / speedX, Math.abs(ai.z - z) / speedZ,
          Math.abs(ai.y - y) / (level.anticipation ? 1.55 : 1.20));
        const outside = Math.hypot(b.x - x, b.y - y, b.z - (z + .055));
        const cost = outside * 4 + Math.max(0, travel + delay - elapsed) * 3 + elapsed * .09
          + Math.abs(z - preferred) * (receivingServe ? .06 : .20) + Math.max(0,.99 - b.y) * (receivingServe ? 2 : 1.2);
        if (cost < score) { score = cost; best = { x, y, z, at }; }
      }
      return best;
    }
    updateAI(dt, level) {
      const ai = this.ai, b = this.ball;
      if (this.lastHitter === 'player' && this.mode === 'match') {
        if (this.time - this.aiPlanAt > (level.returnMargin ? .025 : .045)) { this.aiPlan = this.predictAIContact(level); this.aiPlanAt = this.time; }
        if (this.time > ai.decideAt) {
          const plan = this.aiPlan;
          const t = clamp((ai.z - b.z) / (b.vz || -1), 0, 1);
          const estimate = b.x + b.vx * t;
          const precision = level.anticipation || (this.difficulty === 'pro' ? .64 : .30);
          ai.targetX = clamp((plan ? estimate * (1 - precision) + plan.x * precision : estimate) + ai.aimError + (ai.willMiss ? (b.x >= 0 ? -.48 : .48) : 0), -AI_REACH.x, AI_REACH.x);
          ai.targetZ = plan ? plan.z : Characters.tactics(this.characters.ai).near;
        }
      } else { ai.targetX = this.player.x * -.2; ai.targetZ = Characters.tactics(this.characters.ai).near; }
      ai.x += clamp(ai.targetX - ai.x, -level.speed * Characters.modifier(this.characters.ai,'speed') * dt, level.speed * Characters.modifier(this.characters.ai,'speed') * dt);
      ai.z += clamp(ai.targetZ - ai.z, -level.speed * .65 * dt, level.speed * .65 * dt);
      const desiredY = this.lastHitter === 'player' ? this.aiPlan?.y ?? 1.08 : 1.08;
      smoothHeight(ai,desiredY,dt,level.anticipation?1.55:1.20);
    }
    hit(side, collision=null) {
      const b = this.ball, p = this.player;
      const paddle = side === 'player' ? p : this.ai;
      const receivingServe = side === 'ai' && this.mode === 'match' && this.lastHitter === 'player' && this.lastShot?.serve;
      const contact = collision?.quality??clamp(Math.hypot((b.x - paddle.x) / .18, (b.y - paddle.y) / .20), 0, 1);
      const incoming={...b},frame=collision?.frame||this.paddleFrame(side);
      const level = LEVELS[this.difficulty];
      let targetX, targetZ, speed, spin,strokePower=0,brush=0,cut=0,placementError=false,tacticalShot=null;
      const incomingSpinX = b.spinX, incomingSpinY = b.spinY, incomingSpeed = Math.hypot(b.vx, b.vy, b.vz);
      const character=this.characters[side], facing=side==='player'?1:-1;
      const handed=this.equipment[side].hand==='left'?-1:1, depth=paddle.z*facing, backhand=paddle.x*facing*handed<-.14;
      const age=this.receiverBounceAt===null||this.receiverBounceAt===undefined?0:this.time-this.receiverBounceAt;
      const competing=side==='player'||this.mode==='match';
      const legal=this.bounces>=1&&this.lastHitter===opposite(side);
      if (side === 'player') {
        const active=collision?p.swingUntil>this.time:true;
        const gesture=active?p:{...p,swingVX:0,swingVZ:0,cutting:false};
        const placement = playerPlacement(gesture, b);
        const power = placement.power;
        strokePower=power;brush=gesture.swingVX;
        targetX = placement.x; targetZ = placement.z;
        speed = clamp(1.65 + power * .56 + incomingSpeed * .33, 2.25, 7.1);
        const intentional=smooth(0,.8,power+Math.abs(brush)*.15);
        targetZ=mix(-clamp(.34+incomingSpeed*.035,.38,.70),targetZ,intentional);
        targetX=mix(clamp(b.x*.74+b.vx*.065,-.69,.69),targetX,intentional);
        b.spinY = clamp(brush * 22 + (b.x - p.x) * 40 - incomingSpinY * .13, -145, 145);
        const stroke = this.posture('player');
        cut=gesture.cutting?1:0;
        const top=smooth(stroke.key==='push'?2.4:.7,stroke.key==='push'?4.3:2.7,power)*(1-cut*.92);
        const smash=smooth(2.5,4.5,power)*smooth(1.36,1.6,b.y);
        speed*=1+smash*.12;targetZ=mix(targetZ,-1.18,smash);
        b.spinX = mix(24+22*smooth(0,.8,power)+cut*25,-(42+power*13),top)+incomingSpinX*.12;
        b.spinZ = 0;
        const lateral = Math.abs(b.spinY) > 24 ? (b.spinY > 0 ? '左侧旋' : '右侧旋') : '';
        spin = lateral ? lateral + (power > .5 ? b.spinX>0 ? ' · 下旋' : ' · 上旋' : '') : power<.15?'借力挡球':b.spinX>0?'下旋 · 切削回球':power>3.5?'上旋 · 强力回球':'上旋';
        p.contactAt = this.time; p.swingUntil = 0;
      } else {
        const style = STYLES[this.aiStyle], elite = Boolean(level.anticipation),identity=Characters.tactics(this.characters.ai);
        const spread = (.88+.12*Characters.modifier(this.characters.ai,'variation')) * (this.difficulty === 'beginner' ? .27 : this.difficulty === 'standard' ? .43 : elite ? .65 : .57) * style.spread;
        const roll = this.random(), wide = (this.player.x > 0 ? -1 : 1) * Math.min(.69,spread*(.82+.18*identity.wide));
        targetX = (this.random() - .5) * 2 * spread;
        // Beginners leave room to rally. Higher tiers mix open court, body,
        // alternating corners and reversals against an already moving player.
        const tactical = this.difficulty !== 'beginner' && (elite || this.aiStyle === 'aggressive' || roll < .70);
        if (tactical) {
          if (roll >= .18 && roll < .42 && Math.abs(this.player.vx) > .6) targetX = -Math.sign(this.player.vx) * spread;
          else if (roll < identity.body) targetX = clamp(this.player.x, -spread, spread);
          else if (roll > .78 && this.ai.lastTargetX) targetX = -Math.sign(this.ai.lastTargetX) * spread;
          else targetX = wide;
        }
        targetX = clamp(targetX, -.69, .69);
        placementError = this.random() < level.shotError * style.error / Characters.modifier(this.characters.ai,'control');
        if (placementError) targetX = (this.random() > .5 ? 1 : -1) * (1 + this.random() * .3);
        const shortChance = this.difficulty==='beginner'?0:this.aiStyle==='defensive'?Math.max(.26,identity.short):identity.short*(elite?1:.8);
        const short = this.random() < shortChance * Characters.modifier(this.characters.ai,'variation');
        targetZ = short ? .36 + this.random() * .22 : this.aiStyle === 'defensive' ? .56 + this.random() * .22 : elite ? 1.04 + this.random() * .17 : this.aiStyle === 'aggressive' ? 1.02 + this.random() * .16 : .74 + this.random() * .28;
        speed = level.ballSpeed * style.speed * identity.pace * (short ? .70 : 1);
        b.spinX = this.aiStyle === 'defensive' || short ? -(elite ? 100 : 65) : this.aiStyle === 'aggressive' ? (elite ? 145 : 90) : elite ? 115 : this.difficulty === 'pro' ? 80 : 36;
        b.spinY = (this.random() - .5) * (elite ? 150 : 24) * Characters.modifier(this.characters.ai,'variation'); b.spinZ = 0;
        if (this.mode==='match' && legal && !placementError && this.difficulty!=='beginner' && this.aiStyle!=='defensive') {
          tacticalShot=Characters.chooseTactic(character,{roll,hitCount:this.pointHits.ai,previousX:this.previousPlacement.ai,
            previousDepth:this.previousDepth.ai,open:wide,body:clamp(p.x,-spread,spread),direction:Math.sign(wide),
            near:depth<1.43,early:age<.29,low:b.y<1.04,incoming:incomingSpeed,backhand});
          if(tacticalShot) {
            targetX=tacticalShot.x;targetZ=tacticalShot.z;
            speed=level.ballSpeed*style.speed*identity.pace*(tacticalShot.pace??1);
            b.spinX=tacticalShot.top??b.spinX;b.spinY=tacticalShot.side??b.spinY;
          }
        }
        spin = spinName(b, b.spinX < 0 ? '下旋防守' : '上旋进攻');
        if (this.mode !== 'match') {
          targetX = Math.sin(this.practice.attempts * 1.7) * .30; targetZ = .86;
          speed = this.mode === 'slow' ? 2.65 : level.ballSpeed;
          b.spinX = 12; b.spinY = 0; spin = '练习喂球';
        }
      }
      if(side==='ai'&&this.mode==='match') { const pose=this.posture('ai'); if(pose.key==='push'&&!tacticalShot?.top)b.spinX=-Math.abs(b.spinX); if(pose.key==='smash'){b.spinX=Math.abs(b.spinX);speed*=1.08;} }
      speed*=competing?Characters.modifier(character,'attack'):1;
      b.spinX*=competing?Characters.modifier(character,'spin'):1;b.spinY*=competing?Characters.modifier(character,'spin'):1;
      const context={used:this.signatureUsed[side],legal,contact,hits:this.pointHits[side],power:side==='player'?strokePower:Math.min(6,speed),
        brush:side==='player'?brush:b.spinY/25,z:depth,backhand,targetX,previousX:this.previousPlacement[side],age,height:b.y,incoming:incomingSpeed};
      const trait=side==='player'&&legal?Characters.strokeTrait(character,context):{};
      const signature=competing&&!placementError&&this.signatureCooldown[side]===0?Characters.signature(character,context):null;
      let depthAim=Math.abs(targetZ)+(trait.depth??0), width=(trait.width??1)*(signature?.width??1);
      if(signature) {
        this.signatureUsed[side]=true;
        if(signature.depth!==undefined)depthAim=mix(depthAim,signature.depth,signature.depthMix);
      }
      speed*=(trait.pace??1)*(signature?.pace??1);
      b.spinX-=facing*((trait.top??0)+(signature?.top??0));
      b.spinY*=(trait.side??1)*(signature?.side??1);
      targetZ=-facing*clamp(depthAim,.26,1.23);
      if(width!==1)targetX=clamp(targetX*width,-.70,.70);
      targetX=clamp(targetX,-1.3,1.3);
      this.pointHits[side]++;
      if(side==='ai')speed=2+(speed-2)*.63;
      if(receivingServe && (b.y < 1.02 || contact > .55)) speed=Math.min(speed,4.1*STYLES[this.aiStyle].speed);
      speed=clamp(speed,1.85,8.0);
      if(side==='ai'){strokePower=Math.max(.6,(speed-incomingSpeed*.33-1.65)/.56);brush=b.spinY/22;cut=b.spinX<0?.6:0;}
      const control=clamp(.93+.07*(Characters.modifier(character,'control')-1),.88,1)*(trait.control??1)*(signature?.control??1);
      const netMargin=signature?.netMargin;
      const signatureAim=side==='player'&&signature?(signature.aim??.64):0;
      const feedback=launchShot(b,incoming,frame,{side,power:strokePower,brush,cut,attack:competing?Characters.modifier(character,'attack'):1,spin:competing?Characters.modifier(character,'spin'):1,quality:contact,targetX,targetZ,speed,control,netMargin,signatureAim});
      if (side === 'ai' && this.mode === 'match' && !placementError && (receivingServe || level.returnMargin)) {
        const safe = stabilizeReturn(b,targetX,targetZ,speed,level.returnMargin ?? .018,1,netMargin);
        targetX = safe.x; targetZ = safe.z;
      } else if (side==='player' && signature) {
        // A clean signature should show its intended shape, not clip the
        // net due to the ordinary launch blend. This is still one impulse.
        const safe=stabilizeReturn(b,targetX,targetZ,speed,.025,-1,netMargin);
        targetX=safe.x;targetZ=safe.z;
      }
      if(signature||side==='ai'&&competing)spin=spinName(b,b.spinX*facing>10?'下旋':b.spinX*facing<-10?'上旋':'稳健回球');
      this.previousPlacement[side]=targetX;this.previousDepth[side]=Math.abs(targetZ);
      paddle.impactPose=frame.pose;paddle.impactStrength=clamp(feedback.normalImpulse/12,0,1);paddle.impactFriction=feedback.friction;
      paddle.impactStroke=this.posture(side).key;paddle.impactBrush=Math.sign(brush);paddle.impactSignature=Boolean(signature);
      this.lastShot = { side, x: targetX, z: targetZ, placement: placementName(targetX, targetZ), serve: false,signature:signature?{name:signature.name,color:signature.color,shape:signature.shape}:null,contact,feedback };
      paddle.contactAt = this.time;
      if (side === 'ai') this.ai.lastTargetX = targetX;
      this.lastHitter = side; this.expectedSide = opposite(side); this.bounces = 0; this.receiverBounceAt=null; this.serveStage = 0; this.netTouched = false; this.netFailed = false; this.shotTime = this.time;
      this.rally++; this.totalHits++; this.maxRally = Math.max(this.maxRally, this.rally);
      if (side === 'player') this.resetAITarget();
      this.emit('hit', { side, speed: Math.hypot(b.vx, b.vy, b.vz), impactSpeed: Math.abs(b.vz - incoming.vz),friction:feedback.friction,power:feedback.power,contact, spin, signature:this.lastShot.signature,placement: this.lastShot.placement, stroke: this.posture(side).name, x: b.x, y: b.y, z: b.z });
    }
    point(winner, reason) {
      if (this.state === 'point' || this.state === 'gameover' || !winner) return;
      if (this.mode !== 'match') { this.finishPractice(false, reason); return; }
      const result = this.match.award(winner);
      if (!result) return;
      // Only scored points advance cooldown. The activation point starts it,
      // then two complete points must pass; lets and game changes do not count.
      for(const side of ['player','ai'])this.signatureCooldown[side]=this.signatureUsed[side]?2:Math.max(0,this.signatureCooldown[side]-1);
      this.state = 'point'; this.pointTime = this.time;
      const feedback=winner==='ai'?(this.lastHitter==='ai'?this.missFeedback:this.netFailed?'回球偏低 · 试着轻推或迎前':reason==='回球出界'?'回球过长 · 减轻力量或早点接球':null):null;
      this.emit('point', { winner, reason,feedback,rally: this.rally, result });
    }
    nextGame() { if (this.match.nextGame()) { this.prepare(); return true; } return false; }
    feed() {
      this.practice.attempts++; this.state = 'rally';
      Object.assign(this.ball, { x: 0, y: 1.16, z: -1.52, vx: 0, vy: 0, vz: 0, spinX: 0, spinY: 0, spinZ: 0 });
      this.hit('ai');
    }
    finishPractice(success, reason) {
      if (this.state === 'point') return;
      if (success) { this.practice.successes++; this.practice.streak++; }
      else this.practice.streak = 0;
      this.practice.bestStreak = Math.max(this.practice.bestStreak, this.practice.streak);
      this.state = 'point'; this.pointTime = this.time;
      this.emit('practiceResult', { success, reason,feedback:success?null:this.missFeedback,practice: { ...this.practice } });
    }
    restartPractice() {
      if (this.mode === 'match') return;
      if (this.state === 'rally') this.finishPractice(false, '重新准备');
      this.prepare();
    }
    predictLanding() {
      const b = this.ball;
      if (this.state !== 'rally' || b.y < C.tableY) return null;
      const projected = { ...b }, dt = 1 / 120;
      for (let time = dt; time < 2; time += dt) {
        const prev = { ...projected }; advanceBall(projected, dt);
        if (projected.y <= C.tableY + C.radius && projected.vy < 0) {
          const f = clamp((prev.y - C.tableY - C.radius) / (prev.y - projected.y), 0, 1);
          const x = prev.x + (projected.x - prev.x) * f, z = prev.z + (projected.z - prev.z) * f;
          return Math.abs(x) <= C.halfWidth && Math.abs(z) <= C.halfLength ? { x, z, time: time - dt + f * dt } : null;
        }
      }
      return null;
    }
    snapshot() { return { state: this.state, time: this.time, ball: { ...this.ball }, player: { ...this.player }, ai: { ...this.ai }, stroke: this.posture('player'), aiStroke: this.posture('ai'), characters: {...this.characters}, equipment:{player:{...this.equipment.player},ai:{...this.equipment.ai}}, contactReady:this.contactReady, swingRecognition:this.swingRecognition, score: { ...this.match.points }, games: { ...this.match.games }, server: this.server, rally: this.rally, bounces: this.bounces, lastHitter: this.lastHitter, difficulty: this.difficulty, aiStyle: this.aiStyle, mode: this.mode, practice: { ...this.practice }, matchOver: this.match.over, gameOver: this.match.gameOver }; }
  }
  return { C, LEVELS, STYLES, Match, Simulation, clamp, advanceBall, reboundBall, strokeContext, smoothHeight, tableContact, netContact, reflectContact, paddleFrame, paddleContact, launchShot };
});
