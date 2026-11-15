(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PingPhysics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const C = Object.freeze({ halfWidth: .7625, halfLength: 1.37, tableY: .76, netHeight: .1525, radius: .02, gravity: 9.81, step: 1 / 240, serveOffset: .12, serveLift: .20 });
  const LEVELS = Object.freeze({
    beginner: { name: '入门', reaction: .29, speed: 1.65, accuracy: .19, miss: .24, shotError: .16, ballSpeed: 2.65 },
    standard: { name: '标准', reaction: .19, speed: 2.3, accuracy: .12, miss: .14, shotError: .10, ballSpeed: 3.15 },
    advanced: { name: '进阶', reaction: .12, speed: 3.0, accuracy: .065, miss: .065, shotError: .055, ballSpeed: 3.85 },
    pro: { name: '专业', reaction: .065, speed: 3.9, accuracy: .028, miss: .025, shotError: .025, ballSpeed: 4.5 }
  });
  const STYLES = Object.freeze({
    balanced: { name: '均衡型', speed: 1, spread: 1, error: 1 },
    defensive: { name: '防守型', speed: .84, spread: .74, error: .8 },
    aggressive: { name: '进攻型', speed: 1.14, spread: 1.12, error: 1.25 }
  });
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const opposite = side => side === 'player' ? 'ai' : 'player';
  // Coordinate system: +x right, +y up, player at +z. A rightward brush
  // on the rear of the ball produces +spinY; omega cross velocity bends it left.
  function advanceBall(b, dt) {
    const vx = b.vx, vz = b.vz;
    b.vx += (b.spinY * vz * .011 - vx * .10) * dt;
    b.vy += (-C.gravity - b.spinX * vz * .005) * dt;
    b.vz += (-b.spinY * vx * .011 - vz * .10) * dt;
    b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    b.spinX *= Math.exp(-.45 * dt); b.spinY *= Math.exp(-.45 * dt);
  }
  function spinName(b, fallback = '上旋') {
    return Math.abs(b.spinY) > 15 ? (b.spinY > 0 ? '左侧旋' : '右侧旋') : fallback;
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
      this.mode = 'match'; this.aiStyle = 'balanced';
      this.practice = { attempts: 0, successes: 0, streak: 0, bestStreak: 0 };
      this.player = { x: .35, y: 1.08, z: 1.62, vx: 0, vz: 0, targetX: .35, targetZ: 1.62, activeUntil: 0, swingUntil: 0, swingVX: 0, swingVZ: 0, contactAt: -10 };
      this.ai = { x: 0, y: 1.08, z: -1.57, targetX: 0, targetZ: -1.57, decideAt: 0, willMiss: false, aimError: 0 };
      this.ball = { x: 0, y: 1.1, z: 1.6, vx: 0, vy: 0, vz: 0, spinX: 0, spinY: 0 };
      this.match = new Match(); this.rally = 0; this.maxRally = 0; this.totalHits = 0; this.serveNumber = 0;
      this.lastHitter = null; this.expectedSide = null; this.bounces = 0; this.serveStage = 0; this.netTouched = false; this.pointTime = 0;
    }
    emit(type, detail = {}) { this.onEvent({ type, ...detail }); }
    get server() { return this.mode === 'match' ? this.match.server : this.mode === 'serve' ? 'player' : 'ai'; }
    start(bestOf = 1, difficulty = 'beginner', firstServer = 'player', options = {}) {
      this.difficulty = LEVELS[difficulty] ? difficulty : 'beginner';
      this.mode = ['rally','slow','serve'].includes(options.mode) ? options.mode : 'match';
      this.aiStyle = STYLES[options.aiStyle] ? options.aiStyle : 'balanced';
      this.practice = { attempts: 0, successes: 0, streak: 0, bestStreak: 0 };
      this.match = new Match(bestOf, firstServer); this.rally = this.maxRally = this.totalHits = 0;
      this.time = 0; this.player.x = this.player.targetX = 0; this.player.z = this.player.targetZ = 1.62;
      this.player.y = 1.08; this.player.contactAt = -10; this.player.swingUntil = 0; this.ai.x = 0;
      this.prepare();
    }
    prepare() {
      this.state = 'ready'; this.rally = 0; this.lastHitter = null; this.expectedSide = null;
      this.bounces = 0; this.serveStage = 0; this.netTouched = false; this.player.swingUntil = 0;
      this.player.z = this.player.targetZ = 1.62;
      const server = this.server, side = server === 'player' ? this.player : this.ai;
      // Return the serving paddle to a legal, reachable starting area even
      // after a wide rally. Otherwise the first bounce could start off-table.
      side.x = side.targetX = clamp(side.x, -.64, .64);
      if (server === 'ai') { side.z = side.targetZ = -1.62; side.y = 1.08; }
      Object.assign(this.ball, { x: side.x, y: side.y + C.serveLift, z: side.z + (server === 'player' ? -C.serveOffset : C.serveOffset), vx: 0, vy: 0, vz: 0, spinX: 0, spinY: 0 });
      this.readyTime = this.time; this.emit('ready', { server });
    }
    movePlayer(x, z, vx, vz) {
      const serving = this.state === 'ready' && this.server === 'player';
      this.player.targetX = clamp(x, serving ? -.64 : -1.03, serving ? .64 : 1.03);
      this.player.targetZ = clamp(z, serving ? 1.50 : .98, serving ? 1.82 : 1.95);
      this.player.activeUntil = this.time + .20;
      // Always sample the latest tangential motion, including a sideways brush
      // just before contact. A stationary paddle still cannot return a ball.
      this.player.swingVX = clamp(vx, -6, 6); this.player.swingVZ = clamp(vz, -6, 6);
      this.player.gestureAt = this.time;
      this.player.swingUntil = vz < -.38 || Math.abs(vx) > .65 ? this.time + .12 : 0;
    }
    update(dt) {
      if (this.state === 'idle') return;
      let remaining = Math.min(dt, .08);
      while (remaining > 0) { const h = Math.min(C.step, remaining); this.step(h); remaining -= h; }
    }
    step(dt) {
      this.time += dt;
      const p = this.player, b = this.ball, ai = this.ai, level = LEVELS[this.difficulty];
      const oldPX = p.x, oldPZ = p.z;
      const blend = 1 - Math.exp(-24 * dt);
      p.x += (p.targetX - p.x) * blend; p.z += (p.targetZ - p.z) * blend;
      p.vx = (p.x - oldPX) / dt; p.vz = (p.z - oldPZ) / dt;
      const incoming = this.lastHitter === 'ai' && this.state === 'rally';
      const desiredY = incoming && b.z > -.5 ? clamp(b.y, .91, 1.48) : 1.08;
      p.y += (desiredY - p.y) * (1 - Math.exp(-18 * dt));
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

      // Swept net crossing keeps fast balls from passing through the mesh.
      if (prev.z * b.z <= 0 && Math.abs(prev.z - b.z) > 1e-8 && Math.abs(b.x) < C.halfWidth + .15) {
        const t = prev.z / (prev.z - b.z), atY = prev.y + (b.y - prev.y) * t;
        if (atY - C.radius <= C.tableY + C.netHeight && atY > C.tableY - .05) {
          this.emit('net', { x: b.x, y: atY, z: 0, impactSpeed: Math.abs(b.vz) });
          // A grazing edge can travel across; a direct net collision loses forward momentum.
          if (atY > C.tableY + C.netHeight - .025 && Math.abs(b.vz) > 1.5) {
            b.vz *= .76; b.vy = Math.abs(b.vy) * .20 + .45; this.netTouched = true;
          } else { this.point(opposite(this.lastHitter), '回球未过网'); return; }
        }
      }

      if (b.y <= C.tableY + C.radius && prev.y > C.tableY + C.radius && b.vy < 0 && Math.abs(b.x) <= C.halfWidth + C.radius * .45 && Math.abs(b.z) <= C.halfLength + C.radius * .45) {
        const fraction = (prev.y - C.tableY - C.radius) / (prev.y - b.y);
        const landingZ = prev.z + (b.z - prev.z) * fraction;
        const impactSpeed = -b.vy;
        b.y = C.tableY + C.radius; b.vy = -b.vy * .87;
        b.vz += b.spinX * .004; b.spinX *= .78; b.spinY *= .94;
        this.bounce(landingZ > 0 ? 'player' : 'ai', impactSpeed);
        if (this.state !== 'rally') return;
      }

      if (this.lastHitter === 'ai' && b.vz > 0 && p.swingUntil > this.time && this.time - p.contactAt > .18) {
        const contactZ = p.z - .032;
        const swept = prev.z <= contactZ + .10 && b.z >= contactZ - .10;
        const close = Math.abs(b.z - contactZ) < .17;
        const vertical = (b.y - p.y) / .235, horizontal = (b.x - p.x) / .225;
        if ((swept || close) && horizontal * horizontal + vertical * vertical < 1.45) {
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
        if (prev.z >= contactZ - .045 && b.z <= contactZ + .045 && Math.abs(b.x - ai.x) < .205 && Math.abs(b.y - ai.y) < .23 && this.bounces === 1 && !ai.willMiss) this.hit('ai');
      }
      if (this.state !== 'rally') return;
      if (b.y < .13 || Math.abs(b.z) > 2.75 || Math.abs(b.x) > 2.45 || this.time - this.shotTime > 4) {
        const legal = this.bounces >= 1 && this.serveStage !== 1;
        this.point(legal ? this.lastHitter : opposite(this.lastHitter), legal ? '对手未能回球' : this.serveStage === 1 ? '发球未落到对方半台' : '回球出界');
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
      this.serveStage = 1; this.bounces = 0; this.netTouched = false; this.shotTime = this.time;
      const paddle = side === 'player' ? this.player : this.ai;
      b.x = paddle.x; b.y = paddle.y + C.serveLift; b.z = paddle.z + direction * C.serveOffset;
      b.vy = -1.24;
      const firstFlight = (b.vy + Math.sqrt(b.vy * b.vy + 2 * C.gravity * (b.y - C.tableY - C.radius))) / C.gravity;
      const rebound = (C.gravity * firstFlight - b.vy) * .87;
      const totalFlight = firstFlight + rebound * 2 / C.gravity;
      b.vz = direction * (Math.abs(b.z) + .68) / totalFlight;
      b.spinX = 0; b.spinY = side === 'player' ? clamp(this.player.swingVX * 13, -65, 65) : 0;
      const curve = b.spinY * b.vz * .011;
      b.vx = -b.x / totalFlight - curve * totalFlight * .32;
      if (this.mode === 'serve') this.practice.attempts++;
      this.player.contactAt = this.time; this.rally = 1; this.totalHits++; this.maxRally = Math.max(this.maxRally, this.rally);
      this.player.swingUntil = 0;
      this.resetAITarget(); this.emit('hit', { side, speed: Math.abs(b.vz), impactSpeed: Math.abs(b.vz), contact: 0, spin: spinName(b, '发球'), x: b.x, y: b.y, z: b.z });
    }
    resetAITarget() {
      const level = LEVELS[this.difficulty];
      this.ai.decideAt = this.time + level.reaction;
      this.ai.willMiss = this.random() < level.miss;
      this.ai.aimError = (this.random() - .5) * level.accuracy * 2;
      this.ai.targetX = clamp(this.ball.x, -.9, .9);
    }
    updateAI(dt, level) {
      const ai = this.ai, b = this.ball;
      if (this.lastHitter === 'player' && this.time > ai.decideAt) {
        const t = clamp((ai.z - b.z) / (b.vz || -1), 0, 1.2);
        ai.targetX = clamp(b.x + b.vx * t + .5 * b.spinY * b.vz * .011 * t * t + ai.aimError + (ai.willMiss ? (b.x >= 0 ? -.45 : .45) : 0), -1.02, 1.02);
        ai.targetZ = -1.51;
        if (this.bounces > 0) ai.targetZ = -clamp(Math.abs(b.z) + .20, .96, 1.65);
      } else if (this.lastHitter !== 'player') { ai.targetX = this.player.x * -.2; ai.targetZ = -1.56; }
      ai.x += clamp(ai.targetX - ai.x, -level.speed * dt, level.speed * dt);
      ai.z += clamp(ai.targetZ - ai.z, -level.speed * .55 * dt, level.speed * .55 * dt);
      const desiredY = this.lastHitter === 'player' ? clamp(b.y, .91, 1.50) : 1.08;
      ai.y += (desiredY - ai.y) * (1 - Math.exp(-16 * dt));
    }
    hit(side) {
      const b = this.ball, p = this.player;
      const incomingVZ = b.vz, paddle = side === 'player' ? p : this.ai;
      const contact = clamp(Math.hypot((b.x - paddle.x) / .18, (b.y - paddle.y) / .20), 0, 1);
      const level = LEVELS[this.difficulty];
      let targetX, targetZ, speed, spin;
      if (side === 'player') {
        const power = clamp(-p.swingVZ, .38, 6);
        targetX = clamp(b.x * .22 + p.swingVX * .035 + (b.x - p.x) * .7, -.70, .70);
        targetZ = -(.68 + clamp(power / 6, 0, 1) * .46);
        speed = 2.8 + power * .36;
        b.spinY = clamp(p.swingVX * 19 + (b.x - p.x) * 45, -100, 100);
        b.spinX = power < 1.25 ? 8 + (1.25 - power) * 10 : -clamp(power * 3, 2, 18);
        spin = spinName(b, b.spinX > 0 ? '下旋 · 轻推回球' : power > 3.5 ? '上旋 · 强力回球' : '上旋');
        p.contactAt = this.time; p.swingUntil = 0;
      } else {
        const style = STYLES[this.aiStyle];
        const spread = (this.difficulty === 'beginner' ? .27 : this.difficulty === 'standard' ? .45 : .59) * style.spread;
        targetX = (this.random() - .5) * 2 * spread;
        if (this.difficulty === 'pro' || this.aiStyle === 'aggressive') targetX = this.player.x > 0 ? -spread : spread;
        if (this.random() < level.shotError * style.error) targetX = (this.random() > .5 ? 1 : -1) * (1 + this.random() * .3);
        targetZ = this.aiStyle === 'defensive' ? .58 + this.random() * .20 : this.aiStyle === 'aggressive' ? 1.02 + this.random() * .18 : .74 + this.random() * .3;
        speed = level.ballSpeed * style.speed;
        b.spinX = this.aiStyle === 'defensive' ? -12 : this.aiStyle === 'aggressive' ? 23 : this.difficulty === 'pro' ? 15 : 5;
        b.spinY = (this.random() - .5) * 12; spin = this.aiStyle === 'defensive' ? '下旋防守' : this.aiStyle === 'aggressive' ? '上旋进攻' : '回球';
        if (this.mode !== 'match') {
          targetX = Math.sin(this.practice.attempts * 1.7) * .30; targetZ = .86;
          speed = this.mode === 'slow' ? 2.65 : level.ballSpeed;
          b.spinX = 4; b.spinY = 0; spin = '练习喂球';
        }
      }
      // Solve the outgoing ballistic arc. The net clearance constraint keeps moderate
      // swings playable while high-speed strokes retain their flatter trajectory.
      const distanceZ = Math.abs(targetZ - b.z);
      let flight = clamp(distanceZ / speed, .38, .92);
      const netFraction = Math.abs(b.z) / Math.max(distanceZ, .1);
      const netClearance = C.tableY + C.netHeight + C.radius + .085;
      for (let i = 0; i < 12; i++) {
        const initialVY = (C.tableY + C.radius - b.y + .5 * C.gravity * flight * flight) / flight;
        const tn = flight * netFraction;
        const netY = b.y + initialVY * tn - .5 * C.gravity * tn * tn;
        if (netY >= netClearance || flight >= 1.05) break;
        flight += .025;
      }
      b.vx = (targetX - b.x) / flight;
      b.vz = (targetZ - b.z) / flight;
      // Account for spin-induced vertical acceleration while retaining a
      // touch-friendly landing arc; sideways Magnus curvature remains physical.
      b.vy = (C.tableY + C.radius - b.y + .5 * (C.gravity + b.spinX * b.vz * .005) * flight * flight) / flight;
      this.lastHitter = side; this.expectedSide = opposite(side); this.bounces = 0; this.serveStage = 0; this.netTouched = false; this.shotTime = this.time;
      this.rally++; this.totalHits++; this.maxRally = Math.max(this.maxRally, this.rally);
      if (side === 'player') this.resetAITarget();
      this.emit('hit', { side, speed: Math.hypot(b.vx, b.vy, b.vz), impactSpeed: Math.abs(b.vz - incomingVZ), contact, spin, x: b.x, y: b.y, z: b.z });
    }
    point(winner, reason) {
      if (this.state === 'point' || this.state === 'gameover' || !winner) return;
      if (this.mode !== 'match') { this.finishPractice(false, reason); return; }
      const result = this.match.award(winner);
      if (!result) return;
      this.state = 'point'; this.pointTime = this.time;
      this.emit('point', { winner, reason, rally: this.rally, result });
    }
    nextGame() { if (this.match.nextGame()) { this.prepare(); return true; } return false; }
    feed() {
      this.practice.attempts++; this.state = 'rally';
      Object.assign(this.ball, { x: 0, y: 1.16, z: -1.52, vx: 0, vy: 0, vz: 0, spinX: 0, spinY: 0 });
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
    snapshot() { return { state: this.state, time: this.time, ball: { ...this.ball }, player: { ...this.player }, ai: { ...this.ai }, score: { ...this.match.points }, games: { ...this.match.games }, server: this.server, rally: this.rally, bounces: this.bounces, lastHitter: this.lastHitter, difficulty: this.difficulty, aiStyle: this.aiStyle, mode: this.mode, practice: { ...this.practice }, matchOver: this.match.over, gameOver: this.match.gameOver }; }
  }
  return { C, LEVELS, STYLES, Match, Simulation, clamp, advanceBall };
});
