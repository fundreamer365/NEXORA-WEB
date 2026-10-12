/* ============================================================
   NEXORA — js/sound.js
   SoundEngine — короткие UI-звуки + кастомный звук уведомлений.
   Импортирует: ./util.js
   ============================================================ */

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.enabled = localStorage.getItem("nexora-sound") !== "off";
    this.customUrl = localStorage.getItem("nexora-notif-sound") || null;
    this.customAudio = null;
  }

  _ensure() {
    if (!this.enabled) return null;
    if (!this.ctx) {
      try {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (_) {
        return null;
      }
    }
    if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  unlock() {
    const ctx = this._ensure();
    if (!ctx) return;
    try {
      const buf = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(0);
    } catch (_) {}
  }

  _tone(freqs, dur = 0.28, type = "sine", vol = 0.15, stagger = 0.06) {
    const ctx = this._ensure();
    if (!ctx) return;
    const now = ctx.currentTime;
    freqs.forEach((f, i) => {
      const t2 = now + i * stagger;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = type;
      osc.frequency.setValueAtTime(f, t2);
      gain.gain.setValueAtTime(0.0001, t2);
      gain.gain.exponentialRampToValueAtTime(vol, t2 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t2 + dur);
      osc.start(t2);
      osc.stop(t2 + dur + 0.05);
    });
  }

  message() {
    if (this.customUrl) {
      try {
        if (!this.customAudio || this.customAudio.src !== this.customUrl) {
          this.customAudio = new Audio(this.customUrl);
          this.customAudio.volume = 0.7;
        }
        this.customAudio.currentTime = 0;
        this.customAudio.play().catch(() =>
          this._tone([880, 1174], 0.3, "sine", 0.16, 0.08)
        );
        return;
      } catch (_) {}
    }
    this._tone([880, 1174], 0.3, "sine", 0.16, 0.08);
  }

  send()    { this._tone([1200], 0.12, "sine", 0.08, 0); }
  error()   { this._tone([440, 330], 0.35, "sawtooth", 0.10, 0.07); }
  success() { this._tone([523, 659, 784], 0.35, "sine", 0.12, 0.05); }
  click()   { this._tone([1500], 0.05, "square", 0.04, 0); }
  reaction(){ this._tone([900, 1300], 0.12, "triangle", 0.09, 0.04); }

  setCustomSound(url) {
    this.customUrl = url || null;
    if (url) localStorage.setItem("nexora-notif-sound", url);
    else localStorage.removeItem("nexora-notif-sound");
  }

  toggle() {
    this.enabled = !this.enabled;
    localStorage.setItem("nexora-sound", this.enabled ? "on" : "off");
    if (this.enabled) this.success();
    return this.enabled;
  }
}

/* Singleton */
export const Sounds = new SoundEngine();