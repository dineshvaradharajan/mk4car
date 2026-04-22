// ============================================================
//  TOUCH CONTROLS — Mobile/Tablet on-screen controls
// ============================================================
(function () {
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    // Create touch UI container
    const touchUI = document.createElement('div');
    touchUI.id = 'touch-controls';
    touchUI.innerHTML = `
        <div id="touch-steer">
            <button id="touch-left" class="touch-btn touch-steer-btn">&larr;</button>
            <button id="touch-right" class="touch-btn touch-steer-btn">&rarr;</button>
        </div>
        <div id="touch-pedals">
            <button id="touch-nitro" class="touch-btn touch-small-btn">NOS</button>
            <button id="touch-gas" class="touch-btn touch-pedal-btn touch-gas">&#9650;</button>
            <button id="touch-brake" class="touch-btn touch-pedal-btn touch-brake">&#9660;</button>
            <button id="touch-drift" class="touch-btn touch-small-btn">DRIFT</button>
        </div>
        <div id="touch-topbar">
            <button id="touch-pause" class="touch-btn touch-icon-btn">&#10074;&#10074;</button>
            <button id="touch-camera" class="touch-btn touch-icon-btn">&#128247;</button>
        </div>
    `;
    document.body.appendChild(touchUI);

    // --- Button-to-key mappings ---
    const btnMap = {
        'touch-left':   'a',
        'touch-right':  'd',
        'touch-gas':    'w',
        'touch-brake':  's',
        'touch-nitro':  'shift',
        'touch-drift':  'p',
    };

    // Press/release helpers
    function pressKey(key) { keys[key] = true; }
    function releaseKey(key) { keys[key] = false; }

    // Attach touch listeners to each mapped button
    Object.entries(btnMap).forEach(([id, key]) => {
        const el = document.getElementById(id);
        if (!el) return;

        el.addEventListener('touchstart', e => {
            e.preventDefault();
            pressKey(key);
            el.classList.add('active');
        }, { passive: false });

        el.addEventListener('touchend', e => {
            e.preventDefault();
            releaseKey(key);
            el.classList.remove('active');
        }, { passive: false });

        el.addEventListener('touchcancel', e => {
            releaseKey(key);
            el.classList.remove('active');
        });

        // Mouse fallback for testing on desktop
        el.addEventListener('mousedown', e => {
            e.preventDefault();
            pressKey(key);
            el.classList.add('active');
        });
        el.addEventListener('mouseup', e => {
            releaseKey(key);
            el.classList.remove('active');
        });
        el.addEventListener('mouseleave', e => {
            releaseKey(key);
            el.classList.remove('active');
        });
    });

    // Pause button
    const pauseBtn = document.getElementById('touch-pause');
    if (pauseBtn) {
        pauseBtn.addEventListener('touchstart', e => {
            e.preventDefault();
            if (GameState.racing) {
                if (GameState.paused) resumeRace();
                else pauseRace();
            }
        }, { passive: false });
        pauseBtn.addEventListener('click', () => {
            if (GameState.racing) {
                if (GameState.paused) resumeRace();
                else pauseRace();
            }
        });
    }

    // Camera button
    const camBtn = document.getElementById('touch-camera');
    if (camBtn) {
        camBtn.addEventListener('touchstart', e => {
            e.preventDefault();
            if (GameState.racing) {
                GameState.cameraMode = (GameState.cameraMode + 1) % 3;
            }
        }, { passive: false });
        camBtn.addEventListener('click', () => {
            if (GameState.racing) {
                GameState.cameraMode = (GameState.cameraMode + 1) % 3;
            }
        });
    }

    // Show/hide touch controls based on racing state
    function updateTouchVisibility() {
        const racing = GameState.racing && !GameState.paused;
        touchUI.style.display = racing && isTouchDevice ? 'block' : 'none';
    }

    // Poll visibility (simple and reliable)
    setInterval(updateTouchVisibility, 300);

    // Also hide keyboard help on touch devices during race & show touch how-to
    if (isTouchDevice) {
        const style = document.createElement('style');
        style.textContent = '#controls-help { display: none !important; }';
        document.head.appendChild(style);
        const touchHowTo = document.getElementById('touch-how-to');
        if (touchHowTo) touchHowTo.style.display = 'block';
    }
})();
