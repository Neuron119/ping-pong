/* PING impact audio: locally generated PCM, with no downloads or audio files.
 * Short, damped blade modes + a broadband contact transient replace pitch sweeps.
 * Frequencies/envelopes below are tuned for this game, not measured recordings. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PingAudio = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, Number.isFinite(v) ? v : a));
  const profiles = {
    brush: { duration: .065, noise: .80, decay: .006, cutoff: 4600, modes: [[1700,.07,.0025],[3200,.035,.0018]] },
    hit: { duration: .14, noise: .24, decay: .0014, cutoff: 6200, modes: [[890,.40,.008],[1370,.25,.0055],[2250,.11,.0038],[3870,.06,.002],[9600,.045,.0009]] },
    bounce: { duration: .16, noise: .15, decay: .0011, cutoff: 4800, modes: [[510,.20,.013],[1190,.39,.009],[2040,.18,.005],[3510,.07,.0025],[9100,.035,.001]] },
    net: { duration: .13, noise: .40, decay: .006, cutoff: 2400, modes: [[185,.07,.010],[420,.05,.006]] }
  };

  function synthesize(type, sampleRate = 48000, variant = 0, strength = .6) {
    if (!profiles[type] && type !== 'win' && type !== 'lose') throw new Error('Unknown sound: ' + type);
    const point = type === 'win' || type === 'lose';
    const profile = profiles[type], duration = point ? .28 : profile.duration;
    const data = new Float32Array(Math.ceil(sampleRate * duration));
    strength = clamp(strength, 0, 1);
    let seed = (0x2f6e2b1 + variant * 7919 + (type === 'bounce' ? 6571 : type === 'net' ? 1201 : 0)) >>> 0;
    const noise = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 2147483648 - 1; };
    const detune = 1 + (variant - 1.5) * .009;
    let filtered = 0, low = 0;
    const alpha = point ? 0 : 1 - Math.exp(-2 * Math.PI * profile.cutoff / sampleRate);
    const bassAlpha = 1 - Math.exp(-2 * Math.PI * 650 / sampleRate);
    for (let i = 0; i < data.length; i++) {
      const t = i / sampleRate;
      if (point) {
        for (let n = 0; n < 2; n++) {
          const age = t - n * .095;
          if (age < 0) continue;
          const f = (type === 'win' ? [523.25,659.25] : [392,329.63])[n];
          data[i] += (Math.sin(2 * Math.PI * f * age) + .08 * Math.sin(2 * Math.PI * f * 2 * age)) * (1 - Math.exp(-age / .004)) * Math.exp(-age / .035) * .35;
        }
        continue;
      }
      filtered += alpha * (noise() - filtered); low += bassAlpha * (filtered - low);
      const attack = 1 - Math.exp(-t / .00013);
      let value = (filtered - low) * profile.noise * (.6 + strength * .7) * Math.exp(-t / profile.decay);
      for (let m = 0; m < profile.modes.length; m++) {
        const [frequency, amplitude, decay] = profile.modes[m];
        const brightness = m > 2 ? .5 + strength : 1;
        value += Math.sin(2 * Math.PI * frequency * detune * t) * amplitude * brightness * Math.exp(-t / (decay * (1 + strength * .10)));
      }
      data[i] = value * attack;
    }
    if (!point) {
      // Quiet early room reflections, baked once; there is no live reverb processor.
      const dry = data.slice();
      for (const [delay, gain] of [[.0173,.075],[.0331,.038],[.0517,.018],[.0749,.008]]) {
        const offset = Math.round(delay * sampleRate);
        for (let i = offset; i < data.length; i++) data[i] += dry[i - offset] * gain;
      }
    }
    let peak = 0;
    for (const value of data) peak = Math.max(peak, Math.abs(value));
    const scale = peak > .8 ? .8 / peak : 1;
    const fadeSamples = Math.round(sampleRate * .008);
    for (let i = 0; i < data.length; i++) data[i] *= scale * Math.min(1, (data.length - 1 - i) / fadeSamples);
    return data;
  }

  class Engine {
    constructor(options = {}) {
      this.context = options.context || null; this.enabled = true;
      this.buffers = new Map(); this.voices = new Set(); this.sequence = { hit: 0, bounce: 0, net: 0, brush:0 };
    }
    unlock() {
      if (!this.enabled) return;
      try {
        if (!this.context) {
          const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
          if (!Audio) return;
          this.context = new Audio({ latencyHint: 'interactive' });
        }
        if (!this.master) this.prepare();
        if (this.context.state === 'suspended' && !this.context.startRendering) this.context.resume().catch(() => {});
      } catch (_) { /* Sound is optional; restrictive autoplay must never stop play. */ }
    }
    prepare() {
      const ctx = this.context;
      this.master = ctx.createGain(); this.master.gain.value = this.enabled ? .55 : 0;
      this.limiter = ctx.createDynamicsCompressor();
      this.limiter.threshold.value = -7; this.limiter.knee.value = 5; this.limiter.ratio.value = 8;
      this.limiter.attack.value = .002; this.limiter.release.value = .07;
      // A final soft ceiling also catches simultaneous transients during the
      // compressor's attack, without flattening ordinary single impacts.
      this.headroom = ctx.createGain(); this.headroom.gain.value = .125;
      this.ceiling = ctx.createWaveShaper();
      const curve = new Float32Array(4097);
      for (let i = 0; i < curve.length; i++) curve[i] = .94 * Math.tanh(((i / (curve.length - 1)) * 2 - 1) * 8 / .94);
      this.ceiling.curve = curve;
      this.master.connect(this.limiter); this.limiter.connect(this.headroom);
      this.headroom.connect(this.ceiling); this.ceiling.connect(ctx.destination);
      for (const type of Object.keys(profiles)) for (let layer = 0; layer < 3; layer++) for (let variant = 0; variant < 4; variant++) {
        const pcm = synthesize(type, ctx.sampleRate, variant, layer / 2);
        const buffer = ctx.createBuffer(1, pcm.length, ctx.sampleRate); buffer.getChannelData(0).set(pcm);
        this.buffers.set(`${type}:${layer}:${variant}`, buffer);
      }
      for (const type of ['win','lose']) {
        const pcm = synthesize(type, ctx.sampleRate), buffer = ctx.createBuffer(1, pcm.length, ctx.sampleRate);
        buffer.getChannelData(0).set(pcm); this.buffers.set(type, buffer);
      }
    }
    setEnabled(enabled) {
      this.enabled = Boolean(enabled);
      if (!this.master) return;
      const now = this.context.currentTime, gain = this.master.gain;
      gain.cancelScheduledValues(now); gain.setValueAtTime(gain.value, now);
      gain.linearRampToValueAtTime(this.enabled ? .55 : 0, now + .008);
      if (!this.enabled) for (const voice of this.voices) this.stopVoice(voice, now + .01);
    }
    stopVoice(voice, when) {
      if (voice.stopped) return;
      voice.stopped = true; voice.source.stop(when); this.voices.delete(voice);
    }
    play(type, detail = {}, when) {
      const ctx = this.context;
      if (!this.enabled || !this.master || (ctx.state !== 'running' && !ctx.startRendering)) return false;
      const point = type === 'point';
      if (!point && !profiles[type]) return false;
      const now = Math.max(ctx.currentTime, Number.isFinite(when) ? when : ctx.currentTime);
      const speed = detail.impactSpeed ?? detail.speed ?? (type === 'bounce' ? 2.5 : 5);
      const strength = clamp(speed / (type === 'bounce' ? 5.5 : type === 'net' ? 7 : 10), 0, 1);
      const variant = point ? 0 : this.sequence[type]++ % 4;
      const key = point ? (detail.winner === 'player' ? 'win' : 'lose') : `${type}:${Math.min(2, Math.floor(strength * 3))}:${variant}`;
      const source = ctx.createBufferSource(), gain = ctx.createGain(), filter = ctx.createBiquadFilter();
      const near = clamp(((detail.z ?? 0) + 1.6) / 3.2, 0, 1);
      source.buffer = this.buffers.get(key);
      source.playbackRate.value = point ? 1 : 1 + (variant - 1.5) * .004 + clamp(detail.contact ?? 0, 0, 1) * .022 + (detail.signature?.055:0);
      gain.gain.value = point ? .16 : ({hit:.88,bounce:.72,net:.42,brush:.26}[type]) * (.42 + .58 * Math.sqrt(strength)) * (.70 + near * .30);
      if(type==='brush')gain.gain.value*=clamp(detail.friction??0,0,1);
      const contact = clamp(detail.contact ?? 0, 0, 1);
      filter.type = 'lowpass'; filter.frequency.value = Math.min(ctx.sampleRate * .45, (4200 + strength * 7000 + near * 2200) * (1 - contact * .16)); filter.Q.value = .35;
      const nodes = [source, filter, gain];
      source.connect(filter); filter.connect(gain);
      if (ctx.createStereoPanner) {
        const pan = ctx.createStereoPanner(); pan.pan.value = point ? 0 : clamp((detail.x ?? 0) * .52, -.65, .65);
        gain.connect(pan); pan.connect(this.master); nodes.push(pan);
      } else gain.connect(this.master);
      const voice = { source, stopped: false };
      // Bound simultaneous voices and disconnect every finished node on mobile.
      if (this.voices.size >= 16) this.stopVoice(this.voices.values().next().value, ctx.currentTime + .004);
      this.voices.add(voice);
      source.onended = () => { nodes.forEach(node => node.disconnect()); this.voices.delete(voice); };
      source.start(now);
      if(type==='hit'&&detail.friction>.12)this.play('brush',{...detail,impactSpeed:detail.friction*7},now+.0015);
      return true;
    }
  }
  return Object.freeze({ Engine, synthesize });
});
