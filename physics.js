(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./characters.js') : root.PingCharacters);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PingPhysics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Characters) {
  'use strict';
  const C = Object.freeze({ halfWidth: .7625, halfLength: 1.37, tableY: .76, netHeight: .1525, radius: .02, gravity: 9.81, step: 1 / 240, serveOffset: .12, serveLift: .20, airDrag: .105, magnus: .012, friction: .22, inertia: 2 / 3 });
  const LEVELS = Object.freeze({
    beginner: { name: '入门', reaction: .29, speed: 1.65, accuracy: .19, miss: .24, shotError: .16, ballSpeed: 2.65 },
    standard: { name: '标准', reaction: .19, speed: 2.3, accuracy: .12, miss: .14, shotError: .10, ballSpeed: 3.15 },
    advanced: { name: '进阶', reaction: .12, speed: 3.0, accuracy: .065, miss: .065, shotError: .055, ballSpeed: 3.85 },
    pro: { name: '专业', reaction: .065, speed: 4.1, accuracy: .028, miss: .025, shotError: .025, ballSpeed: 4.7 },
    master: { name: '大师', reaction: .043, speed: 5.0, accuracy: .017, miss: .012, shotError: .014, ballSpeed: 5.7, anticipation: .82 },
    legend: { name: '传奇', reaction: .026, speed: 6.0, accuracy: .010, miss: .006, shotError: .008, ballSpeed: 6.6, anticipation: 1 }
  });
  const STYLES = Object.freeze({
    balanced: { name: '均衡型', speed: 1, spread: 1, error: 1 },
    defensive: { name: '防守型', speed: .84, spread: .74, error: .8 },
    aggressive: { name: '进攻型', speed: 1.14, spread: 1.12, error: 1.25 }
  });
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const opposite = side => side === 'player' ? 'ai' : 'player';
  // Direction uses the ratio of lateral / forward movement, so the same
  // diagonal gesture aims the same way on a phone and with a mouse.
  function playerPlacement(p, b, serving = false) {
    const power = clamp(-p.swingVZ, .32, 6);
    const steering = Math.tanh(p.swingVX / Math.max(power, .38) * 1.5);
    const strength = clamp((power - .32) / 5.68, 0, 1);
    const x = clamp(b.x * .68 + steering * .78 + (b.x - p.x) * .24, -.69, .69);
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
  // This aim assist solves the same non-linear flight used during play. It
  // corrects height and a portion of sidespin drift; the curve remains visible.
  function aimFlight(b, targetX, targetZ, speed, assistance = .64) {
    const start = { ...b }, distance = Math.abs(targetZ - start.z);
    let flight = clamp(distance / Math.max(speed, 1), .23, .90), best;
    for (let attempt = 0; attempt < 16; attempt++) {
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
      const clearance = C.tableY + C.netHeight + C.radius + .045;
      if (netY >= clearance || flight >= 1.12) break;
      flight += .025;
    }
    Object.assign(b, best);
  }
  function aimServe(b, targetX, targetZ) {
    const start = { ...b }, direction = Math.sign(targetZ);
    let best = null;
    // Search downward contact angles, then solve both bounce positions with
    // the actual spin/drag model. A valid candidate must clear the net and
    // first land on the server's half, even from a wide starting position.
    for (const vy of [-1.24, -.65, -1.8, -.25, -2.4, -3.1]) {
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
      const score = error * 10 + Math.abs(netY - 1.02) + (legal ? 0 : 100);
      if (!best || score < best.score) best = { vx, vy, vz, score };
      if (legal && error < .012 && Math.abs(netY - 1.02) < .055) break;
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
    if (incoming && b.y > 1.42 && z > 1.20) pose = { key: 'smash', name: '高球扣杀', pitch: -.34, yaw: reach * .13, roll: lean - .08 * hand };
    else if (z < 1.24 && (!incoming || b.y < 1.28)) pose = { key: 'push', name: '近网搓球', pitch: -.64, yaw: reach * .16, roll: lean };
    else if (x * hand < -.16) pose = { key: 'backhand', name: '反手挡球', pitch: -.16, yaw: -.27 * hand, roll: lean + .06 * hand };
    else pose = { key: 'forehand', name: '正手攻球', pitch: -.19, yaw: .20 * hand + reach * .08, roll: lean - .05 * hand };
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
      this.signatureUsed={player:false,ai:false};this.signatureCooldown={player:0,ai:0};this.pointHits={player:0,ai:0};this.previousPlacement={player:0,ai:0};
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
      this.prepare();
    }
    prepare() {
      this.signatureUsed={player:false,ai:false};this.pointHits={player:0,ai:0};this.previousPlacement={player:0,ai:0};
      this.state = 'ready'; this.rally = 0; this.lastHitter = null; this.expectedSide = null;
      this.bounces = 0; this.serveStage = 0; this.netTouched = false; this.player.swingUntil = 0; this.player.gestures = []; this.player.heightLock = null; this.endPlayerDrag(); this.playerPlan = null; this.playerPlanAt = -1; this.netContactAt = -10; this.netFailed = false; this.aiPlan = null; this.aiPlanAt = -1;
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
      const serving = this.state === 'ready' && this.server === 'player';
      const p = this.player, b = this.ball;
      p.targetX = clamp(x - (p.dragOffsetX || 0), serving ? -.64 : -1.03, serving ? .64 : 1.03);
      p.dragOffsetX = x - p.targetX;
      const threshold = {easy:1.05,standard:1.65,firm:2.4}[this.swingRecognition];
      // Only protect an aligned, bounced ball immediately before contact.
      // A quick reposition across the table must still follow the finger.
      const eta = b.vz > 0 ? (p.z - .032 - b.z) / b.vz : Infinity;
      const nearContact = this.state === 'rally' && this.lastHitter === 'ai' && this.bounces === 1
        && eta >= -.045 && eta < .18 && Math.abs(b.x + b.vx * Math.max(0, eta) - p.x) < .29;
      const fastStroke = nearContact && (vz < -threshold || Math.abs(vx) > threshold * 1.15);
      if (!fastStroke || this.time - (p.strokeAnchor?.at ?? -10) > .16) p.strokeAnchor = null;
      if (fastStroke) {
        if (!p.strokeAnchor) p.strokeAnchor = { x:p.x, inputX:x, z:p.z, input:z, at:this.time };
        p.targetX = clamp(p.strokeAnchor.x + clamp((x-p.strokeAnchor.inputX)*.20,-.065,.065),-1.03,1.03);
        p.dragOffsetX = x - p.targetX;
        p.targetZ = clamp(p.strokeAnchor.z + clamp((z-p.strokeAnchor.input)*.20,-.055,.025), .64, 1.95);
      } else {
        p.targetZ = clamp(z - (p.dragOffsetZ || 0), serving ? 1.50 : .64, serving ? 1.82 : 1.95);
      }
      // Rebase suppressed travel and overscroll, so continuing or reversing a
      // drag never catches up abruptly or traverses an invisible dead zone.
      p.dragOffsetZ = z - p.targetZ;
      this.player.activeUntil = this.time + .20;
      // Always sample the latest tangential motion, including a sideways brush
      // just before contact. A stationary paddle still cannot return a ball.
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
      const oldPX = p.x, oldPZ = p.z, oldPY = p.y;
      const blend = 1 - Math.exp(-100 * Characters.modifier(this.characters.player,'speed') * dt * controlScale);
      p.x += (p.targetX - p.x) * blend; p.z += (p.targetZ - p.z) * blend;
      p.vx = (p.x - oldPX) / dt; p.vz = (p.z - oldPZ) / dt;
      const incoming = this.lastHitter === 'ai' && this.state === 'rally';
      // At the table, raise the hand enough that the open blade and handle
      // clear the tabletop; moderate contact tolerance still reaches low balls.
      if (incoming && this.time-(this.playerPlanAt ?? -1)>.035) {
        this.playerPlan=this.predictPlayerContact();this.playerPlanAt=this.time;
      }
      const clearance = clamp((1.55 - p.z) / .24, 0, 1);
      const plan=incoming?this.playerPlan:null, minimum=.91 + .13 * clearance * clearance * (3 - 2 * clearance);
      let desiredY=plan?clamp(plan.y,minimum,1.48):incoming&&p.heightLock?clamp(p.heightLock.y,minimum,1.48):1.08;
      if(incoming&&plan&&plan.time<.12&&this.bounces===1) {
        if(!p.heightLock)p.heightLock={y:desiredY,until:this.time+.19};
        desiredY=clamp(desiredY,p.heightLock.y-.018,p.heightLock.y+.018);
      }
      if(!incoming||this.time>(p.heightLock?.until??Infinity))p.heightLock=null;
      smoothHeight(p,desiredY,dt);
      this.contactReady=Boolean(incoming&&plan&&this.bounces===1&&plan.time<.17);
      if (this.state === 'ready') {
        const server = this.server, paddle = server === 'player' ? p : ai;
        b.x = paddle.x; b.y = paddle.y + C.serveLift; b.z = paddle.z + (server === 'player' ? -C.serveOffset : C.serveOffset);
        if (server === 'player' && p.swingUntil > this.time && p.swingVZ < -.38) this.hitServe('player');
        if (server === 'ai' && this.time - this.readyTime > (this.mode === 'match' ? 1.35 : 1.0)) {
          if (this.mode === 'match') this.serveAI(); else this.feed();
        }
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
        if(contact.kind==='top')reboundBall(b);else {
          reflectContact(b,contact.normal,.84,C.friction);
          this.emit('edge',{...contact.point,legal:true,impactSpeed});
        }
        b.x+=contact.normal.x*.0002;b.y+=contact.normal.y*.0002;b.z+=contact.normal.z*.0002;
        this.bounce(contact.point.z>0?'player':'ai',impactSpeed);
        if(this.state!=='rally')return;
      }

      if (this.lastHitter === 'ai' && b.vz > 0 && p.swingUntil > this.time && this.time - p.contactAt > .18) {
        const contactZ = p.z - .032, oldContactZ = oldPZ - .032;
        // Closest point of relative ball/paddle travel prevents tunnelling.
        const a={x:prev.x-oldPX,y:prev.y-oldPY,z:prev.z-oldContactZ};
        const d={x:b.x-p.x-a.x,y:b.y-p.y-a.y,z:b.z-contactZ-a.z};
        const f=clamp(-(a.x*d.x+a.y*d.y+a.z*d.z)/(d.x*d.x+d.y*d.y+d.z*d.z||1),0,1);
        const defense=Characters.modifier(this.characters.player,'defense');
        const compensation=this.contactReady?.04:0;
        const vertical=(a.y+d.y*f)/(.235+compensation),horizontal=(a.x+d.x*f)/(.225*defense);
        const close=Math.abs(a.z+d.z*f)<.185;
        if (close && horizontal * horizontal + vertical * vertical < 1.45) {
          if (this.bounces === 0) {
            // A ball already beyond the end line is out; touching it there is
            // not an obstruction of a ball above the playing surface.
            const pastEnd = b.z > C.halfLength + C.radius && b.vz > 0;
            this.point(pastEnd ? 'player' : 'ai', pastEnd ? '对手回球出界' : '来球尚未落台，不能截击');
          }
          else this.hit('player');
        }
      } else if (this.mode === 'match' && this.lastHitter === 'player' && b.vz < 0) {
        const contactZ = ai.z + .04;
        const defense=Characters.modifier(this.characters.ai,'defense');
        if (prev.z >= contactZ - .065 && b.z <= contactZ + .065 && Math.abs(b.x - ai.x) < .205*defense && Math.abs(b.y - ai.y) < .23 && this.bounces === 1 && !ai.willMiss) this.hit('ai');
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
      b.spinX = side === 'player' ? (this.player.swingVZ > -1.25 || this.player.cutting ? 28 : -22) : 0;
      b.spinY = side === 'player' ? clamp(this.player.swingVX * 14, -70, 70) : 0; b.spinZ = 0;
      b.spinX*=Characters.modifier(this.characters[side],'spin');b.spinY*=Characters.modifier(this.characters[side],'spin');
      const placement = side === 'player'
        ? playerPlacement(this.player, b, true)
        : { x: (this.random() - .5) * (this.difficulty === 'beginner' ? .45 : 1.1), z: .48 + this.random() * .54 };
      // A same-side wide serve cannot start with a huge outward tangent:
      // reduce the brush near the rail while preserving the chosen placement.
      if (b.x * placement.x > 0) b.spinY *= clamp(1 - Math.max(0, Math.abs(b.x) - .35) * 2.5, .25, 1);
      aimServe(b, placement.x, placement.z);
      this.lastShot = { side, x: placement.x, z: placement.z, placement: placementName(placement.x, placement.z), serve: true };
      if (this.mode === 'serve') this.practice.attempts++;
      paddle.contactAt = this.time; this.rally = 1; this.totalHits++; this.maxRally = Math.max(this.maxRally, this.rally);
      this.player.swingUntil = 0;
      this.resetAITarget(); this.emit('hit', { side, speed: Math.hypot(b.vx,b.vy,b.vz), impactSpeed: Math.abs(b.vz), contact: 0, spin: spinName(b, '发球'), placement: this.lastShot.placement, x: b.x, y: b.y, z: b.z });
    }
    resetAITarget() {
      const level = LEVELS[this.difficulty];
      this.ai.decideAt = this.time + level.reaction;
      this.ai.willMiss = this.random() < level.miss / Characters.modifier(this.characters.ai,'defense');
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
    predictAIContact() {
      const b = { ...this.ball }; let bounced = this.bounces > 0, ownServeBounce = this.serveStage === 1, shortContact=null;
      for (let elapsed = 0; elapsed < 1.5; elapsed += 1 / 120) {
        const previous = { ...b }; advanceBall(b, 1 / 120);
        const contact=tableContact(previous,b);
        if(contact) {
          if(contact.kind==='side')return shortContact;
          if (ownServeBounce) ownServeBounce = false;
          else if (b.z < 0) { if (bounced) return shortContact; bounced = true; }
          Object.assign(b,contact.center);
          if(contact.kind==='top')reboundBall(b);else reflectContact(b,contact.normal,.84,C.friction);
          b.x+=contact.normal.x*.0002;b.y+=contact.normal.y*.0002;b.z+=contact.normal.z*.0002;
        }
        const preferred=Characters.tactics(this.characters.ai).near;
        // A short ball can bounce twice before the athlete's preferred depth.
        // Keep a reachable earlier contact so the AI can step in to receive it.
        if (bounced && b.z < -.56 && b.y >= .91 && b.y < 1.48) shortContact={x:b.x,y:b.y,z:b.z-.04};
        if (bounced && b.z < preferred+.16 && b.y >= .91 && b.y < 1.48) return { x: b.x, y: b.y, z: b.z - .04 };
        if (b.z < -2 || b.y < .6) return shortContact;
      }
      return shortContact;
    }
    updateAI(dt, level) {
      const ai = this.ai, b = this.ball;
      if (this.lastHitter === 'player') {
        if (this.time - this.aiPlanAt > .055) { this.aiPlan = this.predictAIContact(); this.aiPlanAt = this.time; }
        if (this.time > ai.decideAt) {
          const plan = this.aiPlan;
          const t = clamp((ai.z - b.z) / (b.vz || -1), 0, 1);
          const estimate = b.x + b.vx * t;
          const precision = level.anticipation || (this.difficulty === 'pro' ? .64 : .30);
          ai.targetX = clamp((plan ? estimate * (1 - precision) + plan.x * precision : estimate) + ai.aimError + (ai.willMiss ? (b.x >= 0 ? -.48 : .48) : 0), -1.04, 1.04);
          ai.targetZ = plan ? clamp(plan.z, -1.72, -.60) : Characters.tactics(this.characters.ai).near;
        }
      } else { ai.targetX = this.player.x * -.2; ai.targetZ = Characters.tactics(this.characters.ai).near; }
      ai.x += clamp(ai.targetX - ai.x, -level.speed * Characters.modifier(this.characters.ai,'speed') * dt, level.speed * Characters.modifier(this.characters.ai,'speed') * dt);
      ai.z += clamp(ai.targetZ - ai.z, -level.speed * .65 * dt, level.speed * .65 * dt);
      const desiredY = this.lastHitter === 'player' ? clamp(this.aiPlan?.y || b.y, .91, 1.50) : 1.08;
      smoothHeight(ai,desiredY,dt,level.anticipation?1.55:1.20);
    }
    hit(side) {
      const b = this.ball, p = this.player;
      const incomingVZ = b.vz, paddle = side === 'player' ? p : this.ai;
      const contact = clamp(Math.hypot((b.x - paddle.x) / .18, (b.y - paddle.y) / .20), 0, 1);
      const level = LEVELS[this.difficulty];
      let targetX, targetZ, speed, spin;
      const incomingSpinX = b.spinX, incomingSpinY = b.spinY, incomingSpeed = Math.hypot(b.vx, b.vy, b.vz);
      if (side === 'player') {
        const placement = playerPlacement(p, b);
        const power = placement.power;
        targetX = placement.x; targetZ = placement.z;
        // A real moving stroke is required; incoming momentum contributes to a
        // block while a fast forward stroke adds energy and topspin.
        speed = clamp(2.35 + power * .53 + incomingSpeed * .10, 2.7, 6.4);
        b.spinY = clamp(p.swingVX * 25 + (b.x - p.x) * 55 - incomingSpinY * .08, -150, 150);
        const stroke = this.posture('player');
        const backspin = power < 1.3 || p.cutting || (stroke.key === 'push' && power < 3.5);
        if (stroke.key === 'smash' && power > 3) { speed = Math.min(7.2, speed * 1.17); targetZ = -1.18; }
        b.spinX = backspin ? 72 + (1.3 - Math.min(power, 1.3)) * 25 : -clamp(48 + power * 14, 50, 140);
        b.spinZ = 0;
        const lateral = Math.abs(b.spinY) > 24 ? (b.spinY > 0 ? '左侧旋' : '右侧旋') : '';
        spin = lateral ? lateral + (Math.abs(p.swingVZ) > .5 ? backspin ? ' · 下旋' : ' · 上旋' : '') : backspin ? '下旋 · 切削回球' : power > 3.5 ? '上旋 · 强力回球' : '上旋';
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
        if (this.random() < level.shotError * style.error / Characters.modifier(this.characters.ai,'control')) targetX = (this.random() > .5 ? 1 : -1) * (1 + this.random() * .3);
        const shortChance = this.difficulty==='beginner'?0:this.aiStyle==='defensive'?Math.max(.26,identity.short):identity.short*(elite?1:.8);
        const short = this.random() < shortChance * Characters.modifier(this.characters.ai,'variation');
        targetZ = short ? .36 + this.random() * .22 : this.aiStyle === 'defensive' ? .56 + this.random() * .22 : elite ? 1.04 + this.random() * .17 : this.aiStyle === 'aggressive' ? 1.02 + this.random() * .16 : .74 + this.random() * .28;
        speed = level.ballSpeed * style.speed * identity.pace * (short ? .70 : 1);
        b.spinX = this.aiStyle === 'defensive' || short ? -(elite ? 100 : 65) : this.aiStyle === 'aggressive' ? (elite ? 145 : 90) : elite ? 115 : this.difficulty === 'pro' ? 80 : 36;
        b.spinY = (this.random() - .5) * (elite ? 150 : 24) * Characters.modifier(this.characters.ai,'variation'); b.spinZ = 0;
        spin = spinName(b, b.spinX < 0 ? '下旋防守' : '上旋进攻');
        if (this.mode !== 'match') {
          targetX = Math.sin(this.practice.attempts * 1.7) * .30; targetZ = .86;
          speed = this.mode === 'slow' ? 2.65 : level.ballSpeed;
          b.spinX = 12; b.spinY = 0; spin = '练习喂球';
        }
      }
      if(side==='ai'&&this.mode==='match') { const pose=this.posture('ai'); if(pose.key==='push')b.spinX=-Math.abs(b.spinX); if(pose.key==='smash'){b.spinX=Math.abs(b.spinX);speed*=1.08;} }
      const character=this.characters[side];
      const competing=side==='player'||this.mode==='match';
      speed*=competing?Characters.modifier(character,'attack'):1;
      targetX=clamp(targetX,-1.3,1.3);
      b.spinX*=competing?Characters.modifier(character,'spin'):1;b.spinY*=competing?Characters.modifier(character,'spin'):1;
      const handed=this.equipment[side].hand==='left'?-1:1,facing=side==='player'?1:-1;
      const signature=competing&&this.signatureCooldown[side]===0?Characters.signature(character,{used:this.signatureUsed[side],legal:this.bounces>=1&&this.lastHitter===opposite(side),contact,hits:this.pointHits[side],power:side==='player'?Math.max(0,-p.swingVZ):Math.min(6,speed),brush:side==='player'?p.swingVX:b.spinY/25,z:paddle.z*facing,backhand:paddle.x*facing*handed<-.14,targetX,previousX:this.previousPlacement[side]}):null;
      if(signature){this.signatureUsed[side]=true;speed*=signature.speed;b.spinX*=signature.spin;b.spinY*=signature.spin;}
      this.pointHits[side]++;this.previousPlacement[side]=targetX;
      speed=clamp(speed,1.85,10.6);
      aimFlight(b, targetX, targetZ, speed, side === 'player' || level.anticipation ? .96 : .64);
      // Rubber transfers a small part of the incoming spin. Good central
      // contact and elite AI compensate better; edges are harder to control.
      const gripError = (side === 'player' ? .0012 + contact * .0028 : level.anticipation ? .00025 : .0013) / (Characters.modifier(character,'control')*(signature?.control||1));
      b.vx += incomingSpinY * gripError;
      b.vy += incomingSpinX * gripError;
      this.lastShot = { side, x: targetX, z: targetZ, placement: placementName(targetX, targetZ), serve: false,signature:signature?{name:signature.name,color:signature.color}:null };
      paddle.contactAt = this.time;
      if (side === 'ai') this.ai.lastTargetX = targetX;
      this.lastHitter = side; this.expectedSide = opposite(side); this.bounces = 0; this.serveStage = 0; this.netTouched = false; this.netFailed = false; this.shotTime = this.time;
      this.rally++; this.totalHits++; this.maxRally = Math.max(this.maxRally, this.rally);
      if (side === 'player') this.resetAITarget();
      this.emit('hit', { side, speed: Math.hypot(b.vx, b.vy, b.vz), impactSpeed: Math.abs(b.vz - incomingVZ), contact, spin, signature:this.lastShot.signature,placement: this.lastShot.placement, stroke: this.posture(side).name, x: b.x, y: b.y, z: b.z });
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
      this.emit('point', { winner, reason, rally: this.rally, result });
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
      this.emit('practiceResult', { success, reason, practice: { ...this.practice } });
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
  return { C, LEVELS, STYLES, Match, Simulation, clamp, advanceBall, reboundBall, strokeContext, smoothHeight, tableContact, netContact, reflectContact };
});
