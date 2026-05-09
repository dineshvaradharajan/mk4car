// ============================================================
//  INPUT HANDLERS
// ============================================================
window.addEventListener('keydown', e => {
    if (!e.key) return;
    const k = e.key.toLowerCase();
    keys[k] = true;
    if (e.key === 'Escape' && GameState.racing) {
        if (GameState.paused) resumeRace();
        else pauseRace();
    }
    if (k === 'c' && GameState.racing) {
        GameState.cameraMode = (GameState.cameraMode + 1) % 3;
    }
});

window.addEventListener('keyup', e => {
    if (!e.key) return;
    keys[e.key.toLowerCase()] = false;
});

window.addEventListener('resize', () => {
    if (engine) {
        engine.resize();
    }
});

// Also handle orientation change for mobile
window.addEventListener('orientationchange', () => {
    setTimeout(() => { if (engine) engine.resize(); }, 200);
});

// Init menu on load
updateMainMenu();
