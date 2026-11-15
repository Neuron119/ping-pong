/* Render quality is independent of physics, service rules and input sampling. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PingQuality = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const PRESETS = Object.freeze({
    eco: { name: '省电', ratio: 1, shadow: 0, fps: 30 },
    balanced: { name: '均衡', ratio: 1.4, shadow: 1024, fps: 60 },
    high: { name: '高清', ratio: 1.8, shadow: 2048, fps: 60 }
  });
  class Governor {
    constructor(selected = 'balanced', adaptive = true) { this.reset(selected, adaptive); }
    reset(selected, adaptive) {
      this.selected = PRESETS[selected] ? selected : 'balanced'; this.effective = this.selected;
      this.adaptive = Boolean(adaptive); this.elapsed = 0; this.frames = 0; this.warmup = 2;
    }
    observe(dt, active) {
      if (!active || !this.adaptive || dt <= 0 || dt > .15) { this.elapsed = this.frames = 0; return false; }
      if (this.warmup > 0) { this.warmup -= dt; return false; }
      this.elapsed += dt; this.frames++;
      if (this.elapsed < 3) return false;
      const slow = this.elapsed / this.frames > .030;
      this.elapsed = this.frames = 0;
      if (!slow || this.effective === 'eco') return false;
      this.effective = this.effective === 'high' ? 'balanced' : 'eco'; this.warmup = 2;
      return true;
    }
  }
  return Object.freeze({ PRESETS, Governor });
});
