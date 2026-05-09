// ============================================================
//  SOUND ENGINE (Web Audio API) - no 3D engine dependency
// ============================================================
// Map of car style → real engine recording. Drop royalty-free MP3/OGG/WAV
// files into the sounds/ folder with these filenames and the engine will
// switch from synth to real recordings automatically. Missing files just
// fall back to the procedural synth — nothing breaks.
const CAR_ENGINE_SOUNDS = {
    'ferrari':    'sounds/engine-ferrari-v8.mp3',
    'laferrari':  'sounds/engine-ferrari-v12.mp3',
    'lambo':      'sounds/engine-lambo-v12.mp3',
    'hatchback':  'sounds/engine-i4.mp3',
    'muscle':     'sounds/engine-american-v8.mp3',
    'f1':         'sounds/engine-f1-v6t.mp3',
    'ferrarif1':  'sounds/engine-f1-v8.mp3',
    'koenigsegg': 'sounds/engine-koenigsegg-v8t.mp3',
    'jesko':      'sounds/engine-jesko-v8t.mp3',
    'gt':         'sounds/engine-supercar-v10.mp3',
    'supra4':     'sounds/engine-supra-i6t.mp3',
    'supra5':     'sounds/engine-supra-i6t.mp3',
    'bugatti':    'sounds/engine-bugatti-w16.mp3',
};

const SoundEngine = {
    ctx: null,
    engineOsc: null,
    engineGain: null,
    initialized: false,
    isF1: false,
    isBugatti: false,
    // Real-engine sample layer (added on top of the synth when available)
    _realSampleSrc: null,
    _realSampleGain: null,
    _realSampleBuffer: null,

    init() {
        if (this.initialized) return;
        const style = CARS[GameState.selectedCar].style;
        this.isF1 = style === 'f1' || style === 'ferrarif1';
        this.isBugatti = style === 'bugatti';
        // Engine profile: idle/redline RPM + cylinder count drive realism
        // (firing rate = RPM / 60 * cylinders / 2 for 4-stroke)
        if (this.isF1) {
            this.profile = { idleRPM: 4500, redRPM: 15000, cyl: 10, growl: 0.18, hiss: 0.22, lowQ: 4 };
        } else if (this.isBugatti) {
            this.profile = { idleRPM: 800, redRPM: 7000, cyl: 16, growl: 0.42, hiss: 0.10, lowQ: 7 };
        } else {
            this.profile = { idleRPM: 900, redRPM: 8000, cyl: 8, growl: 0.32, hiss: 0.12, lowQ: 6 };
        }
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            const ctx = this.ctx;

            // ── Brown noise buffer (the engine's body & exhaust rumble) ──
            const noiseSec = 2;
            const buf = ctx.createBuffer(1, ctx.sampleRate * noiseSec, ctx.sampleRate);
            const ch = buf.getChannelData(0);
            let last = 0;
            for (let i = 0; i < ch.length; i++) {
                const w = (Math.random() * 2 - 1);
                last = (last + 0.02 * w) / 1.02;
                ch[i] = last * 3.5;
            }
            const noiseSrc = ctx.createBufferSource();
            noiseSrc.buffer = buf;
            noiseSrc.loop = true;

            // Two parallel filtered noise paths: low rumble + intake hiss
            const lowF = ctx.createBiquadFilter();
            lowF.type = 'lowpass'; lowF.frequency.value = 220; lowF.Q.value = this.profile.lowQ;
            const lowG = ctx.createGain(); lowG.gain.value = 0;

            const hissF = ctx.createBiquadFilter();
            hissF.type = 'bandpass'; hissF.frequency.value = 1500; hissF.Q.value = 1.4;
            const hissG = ctx.createGain(); hissG.gain.value = 0;

            // ── Cylinder firing pulse: an LFO-modulated gain that "chops" the
            // noise into rhythmic bursts at the engine firing frequency. This
            // is what makes a synth engine sound like an actual engine.
            const pulseLFO = ctx.createOscillator();
            pulseLFO.type = 'sawtooth'; pulseLFO.frequency.value = 40;
            const pulseShape = ctx.createWaveShaper();
            // Map -1..1 → mostly 0 with a sharp pulse near +1 (combustion bang)
            const curve = new Float32Array(1024);
            for (let i = 0; i < 1024; i++) {
                const x = i / 1023 * 2 - 1;
                curve[i] = Math.max(0, Math.pow((x + 1) / 2, 6) * 2 - 0.3);
            }
            pulseShape.curve = curve;
            const pulseGain = ctx.createGain(); pulseGain.gain.value = 0.6;
            const pulseDC = ctx.createGain(); pulseDC.gain.value = 0.4; // DC offset so the noise isn't fully chopped
            pulseLFO.connect(pulseShape); pulseShape.connect(pulseGain);
            // Mix the chopped pulse with a constant: pulse*noise + dc*noise
            const chopMix = ctx.createGain(); chopMix.gain.value = 1;
            pulseGain.connect(chopMix.gain);

            // ── Harmonic tone stack: faint sawtooth at firing freq + harmonics
            // gives the engine its "growl" pitch on top of the noise body. ──
            const tone1 = ctx.createOscillator(); tone1.type = 'sawtooth';
            const tone2 = ctx.createOscillator(); tone2.type = 'sawtooth';
            const tone3 = ctx.createOscillator(); tone3.type = 'square';
            const toneG1 = ctx.createGain(); toneG1.gain.value = 0;
            const toneG2 = ctx.createGain(); toneG2.gain.value = 0;
            const toneG3 = ctx.createGain(); toneG3.gain.value = 0;
            const toneFilter = ctx.createBiquadFilter();
            toneFilter.type = 'lowpass'; toneFilter.frequency.value = 800; toneFilter.Q.value = 1.6;
            tone1.connect(toneG1); tone2.connect(toneG2); tone3.connect(toneG3);
            toneG1.connect(toneFilter); toneG2.connect(toneFilter); toneG3.connect(toneFilter);

            // ── Master compression/limiter so peaks don't clip ──
            const master = ctx.createDynamicsCompressor();
            master.threshold.value = -10; master.knee.value = 8; master.ratio.value = 6;
            master.attack.value = 0.003; master.release.value = 0.1;
            const masterGain = ctx.createGain(); masterGain.gain.value = 0.75;

            // Wire it up: noise → split → low rumble + hiss; both modulated by chopMix
            noiseSrc.connect(lowF); lowF.connect(chopMix); chopMix.connect(lowG);
            noiseSrc.connect(hissF); hissF.connect(hissG);
            lowG.connect(master); hissG.connect(master);
            toneFilter.connect(master);
            master.connect(masterGain); masterGain.connect(ctx.destination);

            noiseSrc.start();
            tone1.start(); tone2.start(); tone3.start(); pulseLFO.start();

            // Stash refs for updateEngine
            this.engineOsc = tone1; this.engineOsc2 = tone2; this.engineOsc3 = tone3;
            this.engineGain = toneG1; this.engineGain2 = toneG2; this.engineGain3 = toneG3;
            this.engineFilter = toneFilter;
            this._lowG = lowG; this._lowF = lowF;
            this._hissG = hissG; this._hissF = hissF;
            this._pulseLFO = pulseLFO;
            this._noiseSrc = noiseSrc;
            this._master = masterGain;
            this.initialized = true;

            // Kick off real-engine sample load (fire-and-forget; fallback to
            // synth-only if the file is missing or fails to decode).
            this._loadRealEngineSample();
        } catch(e) { console.log('Audio not available'); }
    },

    _loadRealEngineSample() {
        const style = CARS[GameState.selectedCar].style;
        const url = CAR_ENGINE_SOUNDS[style];
        if (!url || !this.ctx) return;
        const ctx = this.ctx;
        // Stop any previous real-sample source
        try { if (this._realSampleSrc) this._realSampleSrc.stop(); } catch(e) {}
        this._realSampleSrc = null;
        this._realSampleGain = null;
        this._realSampleBuffer = null;

        fetch(url, { cache: 'force-cache' })
            .then(r => { if (!r.ok) throw new Error('no engine sample'); return r.arrayBuffer(); })
            .then(buf => ctx.decodeAudioData(buf))
            .then(audioBuf => {
                if (!this.initialized) return;
                this._realSampleBuffer = audioBuf;
                const src = ctx.createBufferSource();
                src.buffer = audioBuf; src.loop = true;
                const g = ctx.createGain(); g.gain.value = 0;
                src.connect(g); g.connect(this._master);
                src.start();
                this._realSampleSrc = src;
                this._realSampleGain = g;
                // Once a real sample is playing, duck the synth-tone harmonics
                // so the recording dominates the timbre. Keep the cylinder
                // pulse + low rumble for impact.
                if (this.engineGain)  this.engineGain.gain.value = 0;
                if (this.engineGain2) this.engineGain2.gain.value = 0;
                if (this.engineGain3) this.engineGain3.gain.value = 0;
            })
            .catch(() => { /* file missing → synth-only fallback, no error */ });
    },

    updateEngine(speed, maxSpeed) {
        if (!this.initialized) return;
        const p = this.profile;
        const ratio = Math.min(1.05, Math.abs(speed) / maxSpeed);
        // Non-linear RPM curve — engines spin up quickly off idle, flatten at high RPM
        const rev = Math.pow(ratio, 0.7);
        const rpm = p.idleRPM + (p.redRPM - p.idleRPM) * rev;
        const firingHz = (rpm / 60) * (p.cyl / 2); // 4-stroke
        const t = this.ctx.currentTime + 0.05;

        // Cylinder pulse rate
        this._pulseLFO.frequency.linearRampToValueAtTime(firingHz, t);

        // Low-rumble filter sweeps slightly with RPM (intake resonance) —
        // dialled WAY down: this layer was the primary "wind" noise complaint.
        this._lowF.frequency.linearRampToValueAtTime(180 + rev * 480, t);
        const lowVol = (0.015 + rev * p.growl * 0.20) * (0.35 + rev * 0.65);
        this._lowG.gain.linearRampToValueAtTime(lowVol, t);

        // Intake hiss — silenced. This was the high-frequency "wind" sound
        // that became irritating at high RPM. Real engine recordings will
        // bring proper intake/exhaust character; the synth doesn't need it.
        this._hissG.gain.linearRampToValueAtTime(0, t);

        // Harmonic tone stack: fundamental at firing/2, 1×, 2×
        // (real engines have strong even harmonics from cylinder pairs firing)
        const tone1Hz = firingHz * 0.5;
        this.engineOsc.frequency.linearRampToValueAtTime(tone1Hz, t);
        this.engineOsc2.frequency.linearRampToValueAtTime(tone1Hz * 2, t);
        this.engineOsc3.frequency.linearRampToValueAtTime(tone1Hz * 3, t);
        // Tone gets brighter with RPM
        this.engineFilter.frequency.linearRampToValueAtTime(400 + rev * 2400, t);
        // Tones get a moderate bump now that the noise layers are silenced —
        // gives the engine clean presence without the harsh hiss.
        const toneBase = 0.035 + rev * 0.085;
        // Synth tones are silenced when a real sample is playing
        const synthMul = this._realSampleSrc ? 0 : 1;
        this.engineGain.gain.linearRampToValueAtTime(toneBase * 0.9 * synthMul, t);
        this.engineGain2.gain.linearRampToValueAtTime(toneBase * 0.55 * synthMul, t);
        this.engineGain3.gain.linearRampToValueAtTime(toneBase * 0.18 * (0.4 + rev * 0.6) * synthMul, t);

        // Real-engine sample: pitch + volume scale with RPM. The recording
        // is typically captured at idle, so we shift up to ~2.5x at redline.
        if (this._realSampleSrc && this._realSampleGain) {
            const targetRate = 0.7 + rev * 1.8; // 0.7x at idle → 2.5x at redline
            try { this._realSampleSrc.playbackRate.linearRampToValueAtTime(targetRate, t); } catch(e) {}
            const targetGain = 0.35 + rev * 0.55;
            this._realSampleGain.gain.linearRampToValueAtTime(targetGain, t);
        }
    },

    playDrift() {
        if (!this.initialized) return;
        const bufferSize = this.ctx.sampleRate * 0.15;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.3;
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass'; filter.frequency.value = 3000; filter.Q.value = 2;
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.06, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);
        noise.connect(filter); filter.connect(gain); gain.connect(this.ctx.destination);
        noise.start(); noise.stop(this.ctx.currentTime + 0.15);
    },

    playNitro() {
        if (!this.initialized) return;
        try {
            const osc = this.ctx.createOscillator();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(200, this.ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(800, this.ctx.currentTime + 0.15);
            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.3);
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'highpass';
            filter.frequency.value = 400;
            osc.connect(filter);
            filter.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start();
            osc.stop(this.ctx.currentTime + 0.3);
        } catch(e) {}
    },

    playKnockdown() {
        if (!this.initialized) return;
        try {
            const bufferSize = this.ctx.sampleRate * 0.3;
            const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.08)) * 0.5;
                data[i] += Math.sin(i * 0.02) * Math.exp(-i / (bufferSize * 0.15)) * 0.3;
            }
            const src = this.ctx.createBufferSource();
            src.buffer = buffer;
            const gain = this.ctx.createGain();
            gain.gain.value = 0.2;
            src.connect(gain);
            gain.connect(this.ctx.destination);
            src.start();
        } catch(e) {}
    },

    playCollision() {
        if (!this.initialized) return;
        const bufferSize = this.ctx.sampleRate * 0.2;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.1));
        const src = this.ctx.createBufferSource();
        src.buffer = buffer;
        const gain = this.ctx.createGain();
        gain.gain.value = 0.15;
        src.connect(gain); gain.connect(this.ctx.destination);
        src.start();
    },

    stop() {
        if (!this.initialized) return;
        try {
            const t = this.ctx.currentTime + 0.15;
            if (this._master) this._master.gain.linearRampToValueAtTime(0, t);
            if (this.engineGain) this.engineGain.gain.linearRampToValueAtTime(0, t);
            if (this.engineGain2) this.engineGain2.gain.linearRampToValueAtTime(0, t);
            if (this.engineGain3) this.engineGain3.gain.linearRampToValueAtTime(0, t);
            if (this._lowG) this._lowG.gain.linearRampToValueAtTime(0, t);
            if (this._hissG) this._hissG.gain.linearRampToValueAtTime(0, t);

            setTimeout(() => {
                try {
                    if (this.engineOsc) this.engineOsc.stop();
                    if (this.engineOsc2) this.engineOsc2.stop();
                    if (this.engineOsc3) this.engineOsc3.stop();
                    if (this._pulseLFO) this._pulseLFO.stop();
                    if (this._noiseSrc) this._noiseSrc.stop();
                    if (this._realSampleSrc) this._realSampleSrc.stop();
                    this._realSampleSrc = null; this._realSampleGain = null;
                    if (this.ctx && this.ctx.state !== 'closed') this.ctx.close();
                } catch(e) {}
            }, 200);
        } catch(e) {}
        this.initialized = false;
    }
};

