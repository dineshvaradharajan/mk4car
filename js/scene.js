// ============================================================
//  BABYLON.JS SCENE SETUP — Asphalt Legends quality
// ============================================================
let engine, scene, camera;
let shadowGenerator = null;
let pipeline = null;
let glowLayer = null;
let envTexture = null;
let highlightLayer = null;
let speedLinesOverlay = null;

// Shared scene state
let playerCar, aiCars = [];
let trackPoints = [];
let trackMeshes = [];
let sparkParticles = [];

// Race variables
let playerT = 0, playerSpeed = 0, playerLateralOffset = 0;
let playerLap = 1, playerCheckpoints = 0;
let raceTime = 0, bestLapTime = Infinity, lapStartTime = 0;
let topSpeed = 0;
let nitro = 100;
let raceFinished = false;
let keys = {};

// Real car physics state
let carX = 0, carZ = 0, carY = 0;
let carHeading = 0;
let carVelX = 0, carVelZ = 0;
let carSteerAngle = 0;
let drifting = false;
let suspBounce = 0, suspVel = 0, suspPitch = 0, suspRoll = 0;

// Camera spring state
let camPosX = 0, camPosY = 10, camPosZ = -20;
let camVelX = 0, camVelY = 0, camVelZ = 0;
let camShake = 0;

// Time tracking
let lastFrameTime = 0;

function initScene() {
    const track = TRACKS[GameState.selectedTrack];
    const isNight = track.skyColor === 0x0a0a2e || track.skyColor === 0x050515 || track.skyColor === 0x331111;
    const isDesert = track.name === 'Desert Storm' || track.name === 'Volcano Ring';
    const isSnow = track.name === 'Snow Peak' || track.name === 'Thunder Mountain';

    const canvas = document.getElementById('renderCanvas');
    canvas.style.display = 'block';

    // Create Babylon engine — high quality
    engine = new BABYLON.Engine(canvas, true, {
        preserveDrawingBuffer: true,
        stencil: true,
        adaptToDeviceRatio: true,
        powerPreference: 'high-performance',
    });
    engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio, 2));

    // Create scene
    scene = new BABYLON.Scene(engine);
    scene.useRightHandedSystem = true;
    scene.clearColor = hexToColor4(track.skyColor, 1);
    scene.ambientColor = isNight ? new BABYLON.Color3(0.1, 0.1, 0.2) : new BABYLON.Color3(0.35, 0.32, 0.28);

    // Atmospheric fog — cinematic depth
    scene.fogMode = BABYLON.Scene.FOGMODE_EXP2;
    scene.fogDensity = track.fogDensity * 0.45; // softer for more visible distance
    // Fog color matches sky horizon for seamless blend
    scene.fogColor = hexToColor3(track.fogColor);

    // Camera with smooth spring physics
    camera = new BABYLON.FreeCamera("cam", new BABYLON.Vector3(0, 10, -20), scene);
    camera.fov = 65 * Math.PI / 180;
    camera.minZ = 0.5;
    camera.maxZ = 2000;
    camera.inputs.clear();

    // ── Lighting — Asphalt Legends cinematic quality ──
    // Rich ambient fill
    const hemi = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0, 1, 0), scene);
    hemi.diffuse = isNight ? hexToColor3(0x2233aa) : hexToColor3(0x99ccff);
    hemi.groundColor = isNight ? hexToColor3(0x0a0a22) : hexToColor3(0x556633);
    hemi.intensity = isNight ? 0.5 : 0.95;
    hemi.specular = new BABYLON.Color3(0.15, 0.15, 0.15);

    // Key light (sun/moon) — dramatic angle for long shadows
    const sun = new BABYLON.DirectionalLight("sun", new BABYLON.Vector3(-0.25, -0.7, 0.55).normalize(), scene);
    sun.diffuse = isNight ? hexToColor3(0x6666cc) : hexToColor3(0xfff0d0);
    sun.specular = isNight ? hexToColor3(0x4444aa) : hexToColor3(0xffeebb);
    sun.intensity = isNight ? 0.7 : 1.5;
    sun.position = new BABYLON.Vector3(100, 200, 80);

    // High-res shadow cascade
    shadowGenerator = new BABYLON.ShadowGenerator(4096, sun);
    shadowGenerator.useBlurExponentialShadowMap = true;
    shadowGenerator.blurKernel = 12;
    shadowGenerator.blurScale = 2;
    shadowGenerator.depthScale = 50;
    shadowGenerator.setDarkness(0.4);
    shadowGenerator.bias = 0.0005;
    shadowGenerator.normalBias = 0.015;
    shadowGenerator.transparencyShadow = true;

    // Fill light — warm bounce
    const fill = new BABYLON.DirectionalLight("fill", new BABYLON.Vector3(0.6, -0.2, -0.5).normalize(), scene);
    fill.diffuse = isNight ? hexToColor3(0x1a1a55) : hexToColor3(0xbbccee);
    fill.specular = new BABYLON.Color3(0.05, 0.05, 0.05);
    fill.intensity = isNight ? 0.25 : 0.4;

    // Rim/back light for dramatic car silhouettes
    const rim = new BABYLON.DirectionalLight("rim", new BABYLON.Vector3(0.1, -0.4, -0.9).normalize(), scene);
    rim.diffuse = isNight ? hexToColor3(0x4466cc) : hexToColor3(0xffeedd);
    rim.specular = isNight ? hexToColor3(0x3355bb) : hexToColor3(0xffffff);
    rim.intensity = isNight ? 0.6 : 0.35;

    // Night ambient — dramatic neon-lit atmosphere
    if (isNight) {
        hemi.intensity = 0.7;
        sun.intensity = 0.9;
        // Neon-style colored track lights (Asphalt Legends style)
        const neonColors = [
            new BABYLON.Color3(0.2, 0.4, 1.0),   // blue
            new BABYLON.Color3(1.0, 0.3, 0.5),    // pink
            new BABYLON.Color3(0.1, 0.8, 1.0),    // cyan
            new BABYLON.Color3(1.0, 0.5, 0.1),    // orange
            new BABYLON.Color3(0.6, 0.2, 1.0),    // purple
            new BABYLON.Color3(0.1, 1.0, 0.6),    // green
            new BABYLON.Color3(1.0, 0.8, 0.2),    // gold
            new BABYLON.Color3(0.3, 0.6, 1.0),    // light blue
        ];
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            const r = 200;
            const pl = new BABYLON.PointLight("nightAmb" + i, new BABYLON.Vector3(
                Math.cos(angle) * r, 12, Math.sin(angle) * r
            ), scene);
            pl.diffuse = neonColors[i];
            pl.intensity = 3;
            pl.range = 180;
        }
        // Ground-level atmospheric lights near track
        for (let i = 0; i < 12; i++) {
            const angle = (i / 12) * Math.PI * 2;
            const r = 120;
            const pl = new BABYLON.PointLight("trackLight" + i, new BABYLON.Vector3(
                Math.cos(angle) * r, 3, Math.sin(angle) * r
            ), scene);
            pl.diffuse = neonColors[i % neonColors.length].scale(0.7);
            pl.intensity = 1.5;
            pl.range = 80;
        }
    }

    // Warm golden-hour sun glow for daytime
    if (!isNight) {
        const sunGlow = new BABYLON.PointLight("sunGlow", new BABYLON.Vector3(100, 200, 80), scene);
        sunGlow.diffuse = hexToColor3(0xffeedd);
        sunGlow.intensity = 0.35;
        sunGlow.range = 600;
    }

    // ── Post-processing — Asphalt Legends cinematic pipeline ──
    pipeline = null;

    // FXAA anti-aliasing
    const fxaa = new BABYLON.FxaaPostProcess("fxaa", 1.0, camera);

    // ACES tone mapping — rich cinematic HDR
    scene.imageProcessingConfiguration.toneMappingEnabled = true;
    scene.imageProcessingConfiguration.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
    scene.imageProcessingConfiguration.exposure = isNight ? 2.2 : 1.25;
    scene.imageProcessingConfiguration.contrast = 1.18;
    // Heavy cinematic vignette
    scene.imageProcessingConfiguration.vignetteEnabled = true;
    scene.imageProcessingConfiguration.vignetteWeight = 2.5;
    scene.imageProcessingConfiguration.vignetteStretch = 0.6;
    scene.imageProcessingConfiguration.vignetteCameraFov = camera.fov;
    scene.imageProcessingConfiguration.vignetteColor = new BABYLON.Color4(0, 0, 0, 0);

    // Color grading — warm cinematic tint
    scene.imageProcessingConfiguration.colorCurvesEnabled = true;
    const curves = new BABYLON.ColorCurves();
    if (isNight) {
        // Deep blue-teal cinematic night
        curves.globalHue = 215;
        curves.globalSaturation = 25;
        curves.shadowsHue = 230;
        curves.shadowsSaturation = 35;
        curves.highlightsHue = 195;
        curves.highlightsSaturation = 18;
        curves.highlightsDensity = 10;
    } else if (isDesert) {
        // Hot golden grade
        curves.globalHue = 35;
        curves.globalSaturation = 30;
        curves.shadowsHue = 25;
        curves.shadowsSaturation = 20;
        curves.highlightsHue = 40;
        curves.highlightsSaturation = 35;
    } else {
        // Vibrant saturated racing
        curves.globalHue = 15;
        curves.globalSaturation = 20;
        curves.shadowsHue = 235;
        curves.shadowsSaturation = 12;
        curves.highlightsHue = 28;
        curves.highlightsSaturation = 22;
    }
    scene.imageProcessingConfiguration.colorCurves = curves;

    const imgProc = new BABYLON.ImageProcessingPostProcess("imgProc", 1.0, camera);

    // Chromatic aberration — subtle edge color fringing like real lenses
    try {
        const chromaticAberration = new BABYLON.ChromaticAberrationPostProcess(
            "chromatic", engine.getRenderWidth(), camera
        );
        chromaticAberration.aberrationAmount = 18;
        chromaticAberration.radialIntensity = 0.85;
    } catch(e) { /* fallback gracefully */ }

    // Strong glow/bloom layer — neon bloom
    glowLayer = new BABYLON.GlowLayer("glow", scene, {
        mainTextureFixedSize: 512,
        blurKernelSize: 64,
    });
    glowLayer.intensity = isNight ? 1.5 : 0.65;

    // Highlight layer for car paint shine
    try {
        highlightLayer = new BABYLON.HighlightLayer("hl", scene);
        highlightLayer.blurHorizontalSize = 0.3;
        highlightLayer.blurVerticalSize = 0.3;
    } catch(e) { highlightLayer = null; }

    // Rich environment reflections
    try {
        const envTex = BABYLON.CubeTexture.CreateFromPrefilteredData(
            "https://assets.babylonjs.com/environments/environmentSpecular.env", scene
        );
        scene.environmentTexture = envTex;
        scene.environmentIntensity = isNight ? 0.65 : 0.85;
    } catch(e) {
        console.log('Environment texture not available');
    }

    // ── Speed lines overlay (CSS-based for performance) ──
    _createSpeedLinesOverlay();

    // ── Sky ── dramatic gradient sky dome
    createSkyDome(track, isNight, isDesert, isSnow);

    // ── Ground with subtle reflections (wet road look) ──
    const ground = BABYLON.MeshBuilder.CreateGround("ground", { width: 4000, height: 4000 }, scene);
    const groundMat = new BABYLON.StandardMaterial("groundMat", scene);
    groundMat.diffuseColor = hexToColor3(track.groundColor).scale(0.8);
    groundMat.specularColor = isNight ? new BABYLON.Color3(0.08, 0.08, 0.1) : new BABYLON.Color3(0.02, 0.02, 0.02);
    groundMat.specularPower = 64;
    if (isNight && scene.environmentTexture) {
        groundMat.reflectionTexture = scene.environmentTexture;
        groundMat.reflectionTexture.level = 0.06;
    }
    ground.material = groundMat;
    ground.receiveShadows = true;
    ground.position.y = -2.0;

    // ── Generate track ──
    trackPoints = generateTrack(track);
    buildTrackMesh(track);
    addScenery(track);

    // ── Build player car ──
    playerCar = buildCarMesh(GameState.selectedColor, CARS[GameState.selectedCar]);

    // ── Build AI cars ──
    aiCars = [];
    const aiColors = ['#2266ff','#ff8800','#22cc44','#cc22cc','#cccc00','#00cccc','#ff4466'];
    for (let i = 0; i < GameState.opponents; i++) {
        const aiColor = aiColors[i % aiColors.length];
        const aiCarIdx = Math.floor(Math.random() * CARS.length);
        const mesh = buildCarMesh(aiColor, CARS[Math.min(aiCarIdx, CARS.length - 1)]);
        aiCars.push({
            mesh,
            t: 0.01 + i * 0.015,
            speed: 0,
            targetSpeed: 40.0 + Math.random() * 30.0,
            lateralOffset: (Math.random() - 0.5) * track.trackWidth * 0.5,
            lap: 1,
            name: `Racer ${i + 1}`,
            color: aiColor,
            finished: false,
            finishTime: 0,
        });
    }

    // ── Player start ──
    playerT = 0;
    playerSpeed = 0;
    playerLateralOffset = 0;
    playerLap = 1;
    playerCheckpoints = 0;
    raceTime = 0;
    bestLapTime = Infinity;
    lapStartTime = 0;
    raceFinished = false;

    const startPos = trackPoints[0];
    const startDir = getTrackDirectionAt(trackPoints, 0);
    carX = startPos.x;
    carZ = startPos.z;
    carY = startPos.y + 0.1;
    carHeading = Math.atan2(startDir.x, startDir.z);
    carVelX = 0;
    carVelZ = 0;
    carSteerAngle = 0;
    drifting = false;
    suspBounce = 0; suspVel = 0; suspPitch = 0; suspRoll = 0;

    // Init camera spring state
    camPosX = carX - Math.sin(carHeading) * 14;
    camPosY = carY + 6;
    camPosZ = carZ - Math.cos(carHeading) * 14;
    camVelX = 0; camVelY = 0; camVelZ = 0;
    camShake = 0;

    lastFrameTime = performance.now();
}

// Procedural sky dome — gradient sphere
function createSkyDome(track, isNight, isDesert, isSnow) {
    const sky = BABYLON.MeshBuilder.CreateSphere("sky", { diameter: 1800, segments: 24, sideOrientation: BABYLON.Mesh.BACKSIDE }, scene);

    // Create gradient sky texture
    const skySize = 512;
    const skyTex = new BABYLON.DynamicTexture("skyTex", { width: 4, height: skySize }, scene, false);
    const ctx = skyTex.getContext();

    // Dramatic sky gradients — Asphalt Legends style
    let zenith, horizon;
    if (isNight) {
        zenith = '#020015';
        horizon = '#0c1040';
    } else if (isDesert) {
        zenith = '#4488cc';
        horizon = '#f0a840';
    } else if (isSnow) {
        zenith = '#6688bb';
        horizon = '#d0dce8';
    } else {
        // Rich vivid blue sky
        zenith = '#1a4499';
        horizon = '#88bbdd';
    }

    const grad = ctx.createLinearGradient(0, 0, 0, skySize);
    grad.addColorStop(0, zenith);
    grad.addColorStop(0.45, horizon);
    grad.addColorStop(0.55, horizon);
    // Below horizon — blend toward ground/fog color
    const fogHex = '#' + ((track.fogColor >> 16) & 0xff).toString(16).padStart(2,'0') +
                         ((track.fogColor >> 8) & 0xff).toString(16).padStart(2,'0') +
                         (track.fogColor & 0xff).toString(16).padStart(2,'0');
    grad.addColorStop(0.7, fogHex);
    grad.addColorStop(1.0, fogHex);

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 4, skySize);
    skyTex.update();

    const skyMat = new BABYLON.StandardMaterial("skyMat", scene);
    skyMat.backFaceCulling = false;
    skyMat.disableLighting = true;
    skyMat.emissiveTexture = skyTex;
    skyMat.emissiveColor = new BABYLON.Color3(1, 1, 1);
    skyMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
    sky.material = skyMat;
    sky.infiniteDistance = true;
    sky.renderingGroupId = 0;

    // Sun disc with glow halo for daytime
    if (!isNight) {
        // Inner bright sun
        const sunDisc = BABYLON.MeshBuilder.CreateDisc("sunDisc", { radius: 20, tessellation: 32 }, scene);
        const sunMat = new BABYLON.StandardMaterial("sunMat", scene);
        sunMat.disableLighting = true;
        sunMat.emissiveColor = new BABYLON.Color3(1, 0.97, 0.88);
        sunMat.alpha = 0.9;
        sunDisc.material = sunMat;
        sunDisc.position = new BABYLON.Vector3(100, 200, 80);
        sunDisc.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;

        // Outer glow halo
        const haloDisc = BABYLON.MeshBuilder.CreateDisc("sunHalo", { radius: 60, tessellation: 32 }, scene);
        const haloMat = new BABYLON.StandardMaterial("haloMat", scene);
        haloMat.disableLighting = true;
        haloMat.emissiveColor = new BABYLON.Color3(1, 0.92, 0.7);
        haloMat.alpha = 0.15;
        haloDisc.material = haloMat;
        haloDisc.position = new BABYLON.Vector3(100, 200, 80);
        haloDisc.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;

        // Lens flare system
        try {
            const lensFlareSystem = new BABYLON.LensFlareSystem("lensFlares", sun, scene);
            new BABYLON.LensFlare(0.2, 0, new BABYLON.Color3(1, 1, 1), null, lensFlareSystem);
            new BABYLON.LensFlare(0.5, 0.2, new BABYLON.Color3(0.95, 0.85, 0.6), null, lensFlareSystem);
            new BABYLON.LensFlare(0.1, 0.6, new BABYLON.Color3(1, 0.7, 0.3), null, lensFlareSystem);
            new BABYLON.LensFlare(0.2, 0.8, new BABYLON.Color3(0.9, 0.8, 0.5), null, lensFlareSystem);
        } catch(e) { /* lens flares optional */ }
    } else {
        // Night: subtle moon glow
        const moonDisc = BABYLON.MeshBuilder.CreateDisc("moonDisc", { radius: 15, tessellation: 32 }, scene);
        const moonMat = new BABYLON.StandardMaterial("moonMat", scene);
        moonMat.disableLighting = true;
        moonMat.emissiveColor = new BABYLON.Color3(0.6, 0.65, 0.85);
        moonMat.alpha = 0.7;
        moonDisc.material = moonMat;
        moonDisc.position = new BABYLON.Vector3(-80, 180, 60);
        moonDisc.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;

        // Moon halo
        const moonHalo = BABYLON.MeshBuilder.CreateDisc("moonHalo", { radius: 45, tessellation: 32 }, scene);
        const moonHaloMat = new BABYLON.StandardMaterial("moonHaloMat", scene);
        moonHaloMat.disableLighting = true;
        moonHaloMat.emissiveColor = new BABYLON.Color3(0.3, 0.35, 0.55);
        moonHaloMat.alpha = 0.08;
        moonHalo.material = moonHaloMat;
        moonHalo.position = new BABYLON.Vector3(-80, 180, 60);
        moonHalo.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
    }
}

// Speed lines overlay — CSS radial streaks that intensify with speed
function _createSpeedLinesOverlay() {
    if (speedLinesOverlay) return;
    speedLinesOverlay = document.createElement('div');
    speedLinesOverlay.id = 'speed-lines';
    speedLinesOverlay.style.cssText = 'position:fixed;inset:0;z-index:45;pointer-events:none;opacity:0;transition:opacity 0.3s;' +
        'background:radial-gradient(ellipse at center,transparent 40%,rgba(255,255,255,0.03) 70%,rgba(200,220,255,0.08) 100%);';
    document.body.appendChild(speedLinesOverlay);
}
