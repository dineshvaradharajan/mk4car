// ============================================================
//  SOUND ENGINE (Web Audio API) - no 3D engine dependency
// ============================================================
const SoundEngine = {
    ctx: null,
    engineOsc: null,
    engineGain: null,
    initialized: false,
    isF1: false,
    isBugatti: false,

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
        } catch(e) { console.log('Audio not available'); }
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

        // Low-rumble filter sweeps slightly with RPM (intake resonance)
        this._lowF.frequency.linearRampToValueAtTime(180 + rev * 480, t);
        const lowVol = (0.06 + rev * p.growl) * (0.35 + rev * 0.65);
        this._lowG.gain.linearRampToValueAtTime(lowVol, t);

        // Intake hiss opens up at high RPM
        this._hissF.frequency.linearRampToValueAtTime(1200 + rev * 3200, t);
        this._hissG.gain.linearRampToValueAtTime(rev * p.hiss, t);

        // Harmonic tone stack: fundamental at firing/2, 1×, 2×
        // (real engines have strong even harmonics from cylinder pairs firing)
        const tone1Hz = firingHz * 0.5;
        this.engineOsc.frequency.linearRampToValueAtTime(tone1Hz, t);
        this.engineOsc2.frequency.linearRampToValueAtTime(tone1Hz * 2, t);
        this.engineOsc3.frequency.linearRampToValueAtTime(tone1Hz * 3, t);
        // Tone gets brighter with RPM
        this.engineFilter.frequency.linearRampToValueAtTime(400 + rev * 2400, t);
        const toneBase = 0.025 + rev * 0.06;
        this.engineGain.gain.linearRampToValueAtTime(toneBase * 0.9, t);
        this.engineGain2.gain.linearRampToValueAtTime(toneBase * 0.55, t);
        this.engineGain3.gain.linearRampToValueAtTime(toneBase * 0.18 * (0.4 + rev * 0.6), t);
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
                    if (this.ctx && this.ctx.state !== 'closed') this.ctx.close();
                } catch(e) {}
            }, 200);
        } catch(e) {}
        this.initialized = false;
    }
};

// ============================================================
//  MUSIC ENGINE — procedural synthwave/EDM hype track
//  Plays during menus / car-select / track-select to set the mood.
//  Ducks while racing so the engine sound stays dominant.
// ============================================================
const MusicEngine = {
    ctx: null,
    master: null,
    schedulerId: null,
    nextNoteTime: 0,
    step: 0,
    started: false,
    bpm: 140,
    targetVolume: 0.18,

    start() {
        if (this.started) {
            if (this.ctx && this.ctx.state === 'suspended') {
                this.ctx.resume();
            }
            return;
        }
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            // Browsers leave new contexts suspended until a user gesture
            if (this.ctx.state === 'suspended') this.ctx.resume();
            this.master = this.ctx.createGain();
            this.master.gain.value = 0;
            // Send through a touch of compression for cohesion
            const comp = this.ctx.createDynamicsCompressor();
            comp.threshold.value = -14; comp.knee.value = 6; comp.ratio.value = 4;
            comp.attack.value = 0.005; comp.release.value = 0.12;
            this.master.connect(comp); comp.connect(this.ctx.destination);

            // Restore the user's saved mute preference
            this.muted = this.isMuted();

            // Fade in (or stay silent if muted)
            const targetGain = this.muted ? 0 : this.targetVolume;
            this.master.gain.linearRampToValueAtTime(targetGain, this.ctx.currentTime + 1.2);

            this.nextNoteTime = this.ctx.currentTime + 0.1;
            this.step = 0;
            this.started = true;
            this._scheduler();
        } catch(e) { /* audio blocked */ }
    },

    duck(amount) {
        if (!this.started || this.muted) return;
        const t = this.ctx.currentTime + 0.3;
        this.master.gain.linearRampToValueAtTime(this.targetVolume * amount, t);
    },
    unduck() {
        if (!this.started || this.muted) return;
        const t = this.ctx.currentTime + 0.6;
        this.master.gain.linearRampToValueAtTime(this.targetVolume, t);
    },

    setMuted(m) {
        this.muted = !!m;
        try { localStorage.setItem('mk4racer_music_muted', m ? '1' : '0'); } catch(e) {}
        if (this.started && this.master) {
            const t = this.ctx.currentTime + 0.2;
            this.master.gain.linearRampToValueAtTime(m ? 0 : this.targetVolume, t);
        }
    },
    toggleMuted() {
        this.setMuted(!this.muted);
        return this.muted;
    },
    isMuted() {
        if (typeof this.muted === 'boolean') return this.muted;
        try { return localStorage.getItem('mk4racer_music_muted') === '1'; } catch(e) { return false; }
    },

    stop() {
        if (!this.started) return;
        try {
            const t = this.ctx.currentTime + 0.5;
            this.master.gain.linearRampToValueAtTime(0, t);
            setTimeout(() => {
                if (this.schedulerId) clearTimeout(this.schedulerId);
                this.schedulerId = null;
                if (this.ctx && this.ctx.state !== 'closed') this.ctx.close();
                this.ctx = null; this.master = null; this.started = false;
            }, 600);
        } catch(e) {}
    },

    // ── Scheduler: looks ahead 0.15s and schedules upcoming sixteenth notes
    _scheduler() {
        if (!this.started) return;
        const sixteenth = 60 / this.bpm / 4;
        const now = this.ctx.currentTime;
        // If we've fallen far behind (e.g. JS was blocked loading a GLB or tab
        // was backgrounded), don't dump a burst of catch-up notes — resync to
        // the current time, keeping the step modulo so the bar stays aligned.
        if (this.nextNoteTime < now - 0.3) {
            const missed = Math.floor((now - this.nextNoteTime) / sixteenth);
            this.nextNoteTime += missed * sixteenth;
            this.step = (this.step + missed) % 64;
        }
        // Bigger lookahead = more headroom against main-thread stalls (e.g.
        // GLB loads, large repaints). Web Audio plays at scheduled times
        // accurately even if the JS scheduler is briefly blocked.
        while (this.nextNoteTime < now + 0.4) {
            this._scheduleStep(this.step, this.nextNoteTime);
            this.nextNoteTime += sixteenth;
            this.step = (this.step + 1) % 64; // 4-bar pattern
        }
        this.schedulerId = setTimeout(() => this._scheduler(), 30);
    },

    _scheduleStep(step, when) {
        // 4/4 beat — kick on every 4th sixteenth (each downbeat)
        const beat16 = step % 16;
        const beat = step % 4 === 0;
        const offBeat = step % 4 === 2; // hat between kicks
        const snareBeat = beat16 === 4 || beat16 === 12; // snare on 2 & 4

        if (beat) this._kick(when);
        if (offBeat) this._hat(when, 0.22);
        if (snareBeat) this._snare(when);
        // Open hat accent on the &-of-4 last sixteenth of every other beat
        if (step % 8 === 7) this._hat(when, 0.35, true);

        // Bass line — A minor: A2, C3, E3, G3, A3 mapped on a syncopated pattern
        const bassPattern = [
            55, 0,  0,  55,  0, 55,  0,  0,
            65, 0,  0,  65,  0, 65,  0, 73,
            55, 0,  0,  55,  0, 55,  0,  0,
            82, 0,  0,  73,  0, 65,  0, 55,
            55, 0,  0,  55,  0, 55,  0,  0,
            65, 0,  0,  65,  0, 65,  0, 73,
            82, 0,  0, 110,  0, 82,  0, 73,
            65, 0, 73,  82,  0, 65, 73, 87,
        ];
        const bassMidi = bassPattern[step];
        if (bassMidi) this._bass(when, this._midiToHz(bassMidi));

        // Lead — sparse arpeggios on bars 3-4 of the 4-bar phrase
        if (step >= 32) {
            const leadPattern = [
                81, 0, 84, 0, 88, 0, 91, 0,
                88, 0, 84, 0, 81, 0, 84, 0,
                81, 0, 84, 0, 88, 0, 96, 0,
                93, 0, 88, 0, 84, 0, 81, 0,
            ];
            const leadStep = step - 32;
            const leadMidi = leadPattern[leadStep];
            if (leadMidi) this._lead(when, this._midiToHz(leadMidi));
        }
    },

    _midiToHz(m) { return 440 * Math.pow(2, (m - 69) / 12); },

    _kick(when) {
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.frequency.setValueAtTime(120, when);
        o.frequency.exponentialRampToValueAtTime(40, when + 0.13);
        g.gain.setValueAtTime(0.0001, when);
        g.gain.exponentialRampToValueAtTime(0.9, when + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, when + 0.18);
        o.connect(g); g.connect(this.master);
        o.start(when); o.stop(when + 0.2);
    },

    _hat(when, vol, open) {
        const sr = this.ctx.sampleRate;
        const dur = open ? 0.18 : 0.05;
        const buf = this.ctx.createBuffer(1, sr * dur, sr);
        const ch = buf.getChannelData(0);
        for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
        const src = this.ctx.createBufferSource(); src.buffer = buf;
        const f = this.ctx.createBiquadFilter();
        f.type = 'highpass'; f.frequency.value = 7000;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(vol, when);
        g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
        src.connect(f); f.connect(g); g.connect(this.master);
        src.start(when);
    },

    _snare(when) {
        const sr = this.ctx.sampleRate;
        const buf = this.ctx.createBuffer(1, sr * 0.12, sr);
        const ch = buf.getChannelData(0);
        for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
        const src = this.ctx.createBufferSource(); src.buffer = buf;
        const f = this.ctx.createBiquadFilter();
        f.type = 'bandpass'; f.frequency.value = 2200; f.Q.value = 0.7;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.45, when);
        g.gain.exponentialRampToValueAtTime(0.0001, when + 0.13);
        src.connect(f); f.connect(g); g.connect(this.master);
        src.start(when);
        // Tonal body
        const o = this.ctx.createOscillator();
        const og = this.ctx.createGain();
        o.frequency.setValueAtTime(180, when);
        og.gain.setValueAtTime(0.3, when);
        og.gain.exponentialRampToValueAtTime(0.0001, when + 0.08);
        o.connect(og); og.connect(this.master);
        o.start(when); o.stop(when + 0.1);
    },

    _bass(when, hz) {
        const o = this.ctx.createOscillator(); o.type = 'sawtooth';
        const o2 = this.ctx.createOscillator(); o2.type = 'square';
        o.frequency.setValueAtTime(hz, when);
        o2.frequency.setValueAtTime(hz * 0.5, when);
        const f = this.ctx.createBiquadFilter();
        f.type = 'lowpass'; f.frequency.value = 600; f.Q.value = 4;
        f.frequency.setValueAtTime(900, when);
        f.frequency.exponentialRampToValueAtTime(280, when + 0.18);
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.0001, when);
        g.gain.exponentialRampToValueAtTime(0.55, when + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, when + 0.22);
        o.connect(f); o2.connect(f); f.connect(g); g.connect(this.master);
        o.start(when); o2.start(when);
        o.stop(when + 0.25); o2.stop(when + 0.25);
    },

    _lead(when, hz) {
        const o = this.ctx.createOscillator(); o.type = 'sawtooth';
        const det = this.ctx.createOscillator(); det.type = 'sawtooth';
        o.frequency.setValueAtTime(hz, when);
        det.frequency.setValueAtTime(hz * 1.005, when); // detune for thickness
        const f = this.ctx.createBiquadFilter();
        f.type = 'lowpass'; f.frequency.value = 4000; f.Q.value = 1.5;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.0001, when);
        g.gain.exponentialRampToValueAtTime(0.18, when + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, when + 0.22);
        // Subtle delay for atmosphere
        const delay = this.ctx.createDelay(0.5);
        delay.delayTime.value = 60 / this.bpm / 2; // 8th-note delay
        const dlyG = this.ctx.createGain(); dlyG.gain.value = 0.35;
        o.connect(f); det.connect(f);
        f.connect(g); g.connect(this.master);
        g.connect(delay); delay.connect(dlyG); dlyG.connect(delay); dlyG.connect(this.master);
        o.start(when); det.start(when);
        o.stop(when + 0.25); det.stop(when + 0.25);
    },
};
