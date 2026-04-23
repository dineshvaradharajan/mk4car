// ============================================================
//  CAR PREVIEW — Rotating procedural 3D car on the car-select screen
// ============================================================
let _previewEngine = null;
let _previewScene = null;
let _previewCamera = null;
let _previewCarRoot = null;
let _previewLoadedStyle = null;
let _previewLoadedColor = null;
let _previewBodyMaterials = [];
let _previewRotation = 0;
let _previewAccentLights = [];

function initCarPreview() {
    const canvas = document.getElementById('car-preview-canvas');
    if (!canvas) return;

    if (!_previewEngine) {
        _previewEngine = new BABYLON.Engine(canvas, true, {
            preserveDrawingBuffer: true,
            stencil: true,
            alpha: true,
            antialias: true,
        });
        _previewScene = new BABYLON.Scene(_previewEngine);
        _previewScene.useRightHandedSystem = true;
        _previewScene.clearColor = new BABYLON.Color4(0.02, 0.02, 0.06, 1);

        _previewCamera = new BABYLON.ArcRotateCamera(
            'previewCam',
            -Math.PI / 2 - 0.45,
            Math.PI / 2 - 0.22,
            6.2,
            new BABYLON.Vector3(0, 0.35, 0),
            _previewScene
        );
        _previewCamera.fov = 0.72;
        _previewCamera.minZ = 0.1;
        _previewCamera.maxZ = 60;

        // ── Three-point lighting (car-focused) ──
        const hemi = new BABYLON.HemisphericLight('phemi', new BABYLON.Vector3(0, 1, 0.2), _previewScene);
        hemi.intensity = 0.8;
        hemi.diffuse = new BABYLON.Color3(1, 0.95, 0.88);
        hemi.groundColor = new BABYLON.Color3(0.15, 0.12, 0.25);
        hemi.specular = new BABYLON.Color3(0.3, 0.3, 0.35);

        const key = new BABYLON.DirectionalLight('pkey', new BABYLON.Vector3(-0.4, -0.75, -0.5).normalize(), _previewScene);
        key.intensity = 1.15;
        key.diffuse = new BABYLON.Color3(1, 0.95, 0.85);
        key.specular = new BABYLON.Color3(1, 0.95, 0.85);

        const rim = new BABYLON.DirectionalLight('prim', new BABYLON.Vector3(0.5, -0.2, 0.7).normalize(), _previewScene);
        rim.intensity = 0.8;
        rim.diffuse = new BABYLON.Color3(0.55, 0.75, 1.0);
        rim.specular = new BABYLON.Color3(0.55, 0.75, 1.0);

        // Subtle swirling accent point lights — only on the car
        _previewAccentLights = [];
        const orangeL = new BABYLON.PointLight('paccent1', new BABYLON.Vector3(-3.5, 2.2, 1.5), _previewScene);
        orangeL.diffuse = new BABYLON.Color3(1, 0.5, 0.2);
        orangeL.intensity = 0.55;
        orangeL.range = 8;
        _previewAccentLights.push(orangeL);

        const cyanL = new BABYLON.PointLight('paccent2', new BABYLON.Vector3(3.5, 2.2, -1.5), _previewScene);
        cyanL.diffuse = new BABYLON.Color3(0.3, 0.7, 1.0);
        cyanL.intensity = 0.5;
        cyanL.range = 8;
        _previewAccentLights.push(cyanL);

        // HDR environment for reflective paint + chrome
        try {
            const envTex = BABYLON.CubeTexture.CreateFromPrefilteredData(
                'https://assets.babylonjs.com/environments/environmentSpecular.env', _previewScene
            );
            _previewScene.environmentTexture = envTex;
            _previewScene.environmentIntensity = 1.0;
        } catch(e) { /* graceful */ }

        // ── Showroom backdrop — gradient dome ──
        const dome = BABYLON.MeshBuilder.CreateSphere('pdome', { diameter: 60, segments: 24, sideOrientation: BABYLON.Mesh.BACKSIDE }, _previewScene);
        const domeTex = new BABYLON.DynamicTexture('pdomeTex', { width: 4, height: 512 }, _previewScene, false);
        const dctx = domeTex.getContext();
        const dgrad = dctx.createLinearGradient(0, 0, 0, 512);
        dgrad.addColorStop(0, '#0a0820');
        dgrad.addColorStop(0.45, '#170b40');
        dgrad.addColorStop(0.6, '#1a0533');
        dgrad.addColorStop(1, '#050308');
        dctx.fillStyle = dgrad;
        dctx.fillRect(0, 0, 4, 512);
        domeTex.update();
        const domeMat = new BABYLON.StandardMaterial('pdomeMat', _previewScene);
        domeMat.backFaceCulling = false;
        domeMat.disableLighting = true;
        domeMat.emissiveTexture = domeTex;
        domeMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
        dome.material = domeMat;
        dome.infiniteDistance = true;

        // ── Turntable floor — matte, low-reflectance ──
        const floor = BABYLON.MeshBuilder.CreateDisc('pfloor', { radius: 3.2, tessellation: 64 }, _previewScene);
        floor.rotation.x = Math.PI / 2;
        floor.position.y = -0.5;
        const floorMat = new BABYLON.StandardMaterial('pfloorMat', _previewScene);
        floorMat.diffuseColor = new BABYLON.Color3(0.04, 0.04, 0.08);
        floorMat.specularColor = new BABYLON.Color3(0.04, 0.04, 0.06);
        floorMat.emissiveColor = new BABYLON.Color3(0.01, 0.01, 0.02);
        floor.material = floorMat;

        // Orange + cyan unlit glow rings
        const ring = BABYLON.MeshBuilder.CreateTorus('pring', { diameter: 5.4, thickness: 0.045, tessellation: 64 }, _previewScene);
        ring.position.y = -0.47;
        const ringMat = new BABYLON.StandardMaterial('pringMat', _previewScene);
        ringMat.disableLighting = true;
        ringMat.emissiveColor = new BABYLON.Color3(1, 0.45, 0.18);
        ring.material = ringMat;

        const ring2 = BABYLON.MeshBuilder.CreateTorus('pring2', { diameter: 4.2, thickness: 0.02, tessellation: 64 }, _previewScene);
        ring2.position.y = -0.48;
        const ring2Mat = new BABYLON.StandardMaterial('pring2Mat', _previewScene);
        ring2Mat.disableLighting = true;
        ring2Mat.emissiveColor = new BABYLON.Color3(0.25, 0.8, 1);
        ring2.material = ring2Mat;

        // Exclude background scene bits from the accent point lights
        [floor, ring, ring2, dome].forEach(m => {
            _previewAccentLights.forEach(L => { L.excludedMeshes = L.excludedMeshes || []; L.excludedMeshes.push(m); });
        });

        try {
            const glow = new BABYLON.GlowLayer('pglow', _previewScene);
            glow.intensity = 1.0;
        } catch(e) { /* graceful */ }

        _previewScene.imageProcessingConfiguration.toneMappingEnabled = true;
        _previewScene.imageProcessingConfiguration.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
        _previewScene.imageProcessingConfiguration.exposure = 1.2;
        _previewScene.imageProcessingConfiguration.contrast = 1.18;
        _previewScene.imageProcessingConfiguration.vignetteEnabled = true;
        _previewScene.imageProcessingConfiguration.vignetteWeight = 1.6;
        _previewScene.imageProcessingConfiguration.vignetteColor = new BABYLON.Color4(0, 0, 0, 0);

        _previewEngine.runRenderLoop(() => {
            if (!_previewScene) return;
            if (_previewCarRoot) {
                _previewRotation += 0.008;
                _previewCarRoot.rotation.y = _previewRotation;
            }
            if (_previewAccentLights.length) {
                const t = performance.now() * 0.0005;
                _previewAccentLights[0].position.x = Math.cos(t) * 3.5;
                _previewAccentLights[0].position.z = Math.sin(t) * 2.5;
                _previewAccentLights[1].position.x = Math.cos(t + Math.PI) * 3.5;
                _previewAccentLights[1].position.z = Math.sin(t + Math.PI) * 2.5;
            }
            _previewScene.render();
        });

        window.addEventListener('resize', () => { if (_previewEngine) _previewEngine.resize(); });
    }

    requestAnimationFrame(() => {
        if (_previewEngine) _previewEngine.resize();
        setTimeout(() => { if (_previewEngine) _previewEngine.resize(); }, 120);
    });
    updateCarPreview();
}

// ── Procedural car builder — one root TransformNode per car ──
function _buildPreviewCar(style, color) {
    const scene = _previewScene;
    const root = new BABYLON.TransformNode('previewCar', scene);
    _previewBodyMaterials = [];

    // Style configs — dimensions in world units
    const CFG = {
        supercar:  { L: 3.2, W: 1.55, H: 0.6,  roofL: 1.6, roofOfs: 0.1,  roofH: 0.45, nose: 'sharp',  spoiler: 'lip',  wheelR: 0.38, wheelAxle: 0.4 },
        lambo:     { L: 3.2, W: 1.65, H: 0.55, roofL: 1.5, roofOfs: 0.15, roofH: 0.42, nose: 'wedge',  spoiler: 'lip',  wheelR: 0.4,  wheelAxle: 0.4 },
        muscle:    { L: 3.4, W: 1.6,  H: 0.75, roofL: 1.3, roofOfs: -0.1, roofH: 0.55, nose: 'flat',   spoiler: 'big',  wheelR: 0.42, wheelAxle: 0.45 },
        f1:        { L: 3.5, W: 0.8,  H: 0.3,  roofL: 0.6, roofOfs: 0.0,  roofH: 0.3,  nose: 'cone',   spoiler: 'f1',   wheelR: 0.45, wheelAxle: 0.55, open: true },
        hatchback: { L: 2.6, W: 1.5,  H: 0.85, roofL: 1.5, roofOfs: 0.0,  roofH: 0.65, nose: 'flat',   spoiler: 'none', wheelR: 0.35, wheelAxle: 0.38 },
        jdm:       { L: 3.2, W: 1.55, H: 0.65, roofL: 1.5, roofOfs: 0.0,  roofH: 0.5,  nose: 'sharp',  spoiler: 'big',  wheelR: 0.38, wheelAxle: 0.4 },
        hyper:     { L: 3.3, W: 1.6,  H: 0.58, roofL: 1.5, roofOfs: 0.05, roofH: 0.42, nose: 'curve',  spoiler: 'wing', wheelR: 0.4,  wheelAxle: 0.42 },
    };
    // Map style → config key
    const styleMap = {
        ferrari: 'supercar', koenigsegg: 'supercar', gt: 'supercar',
        lambo: 'lambo',
        muscle: 'muscle',
        f1: 'f1',
        hatchback: 'hatchback',
        supra4: 'jdm', supra5: 'jdm',
        bugatti: 'hyper',
    };
    const cfg = CFG[styleMap[style] || 'supercar'];

    const parsed = BABYLON.Color3.FromHexString(color);

    // Paint material — reflective clear-coat
    function paintMat(tag) {
        const m = new BABYLON.StandardMaterial('pcarPaint_' + tag + '_' + Math.random().toString(36).slice(2,6), scene);
        m.diffuseColor = parsed;
        m.specularColor = new BABYLON.Color3(0.95, 0.95, 0.95);
        m.specularPower = 140;
        m.emissiveColor = parsed.scale(0.05);
        if (scene.environmentTexture) {
            m.reflectionTexture = scene.environmentTexture;
            m.reflectionTexture.level = 0.55;
            m.reflectionFresnelParameters = new BABYLON.FresnelParameters();
            m.reflectionFresnelParameters.leftColor = new BABYLON.Color3(1, 1, 1);
            m.reflectionFresnelParameters.rightColor = new BABYLON.Color3(0.08, 0.08, 0.08);
            m.reflectionFresnelParameters.power = 1.6;
        }
        _previewBodyMaterials.push(m);
        return m;
    }

    const glassMat = new BABYLON.StandardMaterial('pglassMat_' + Math.random().toString(36).slice(2,6), scene);
    glassMat.diffuseColor = new BABYLON.Color3(0.05, 0.07, 0.12);
    glassMat.specularColor = new BABYLON.Color3(0.95, 0.95, 1);
    glassMat.specularPower = 200;
    glassMat.alpha = 0.55;
    glassMat.emissiveColor = new BABYLON.Color3(0.02, 0.03, 0.06);
    if (scene.environmentTexture) {
        glassMat.reflectionTexture = scene.environmentTexture;
        glassMat.reflectionTexture.level = 0.5;
    }

    const tireMat = new BABYLON.StandardMaterial('ptireMat_' + Math.random().toString(36).slice(2,6), scene);
    tireMat.diffuseColor = new BABYLON.Color3(0.05, 0.05, 0.06);
    tireMat.specularColor = new BABYLON.Color3(0.08, 0.08, 0.1);
    tireMat.specularPower = 20;

    const rimMat = new BABYLON.StandardMaterial('primMat_' + Math.random().toString(36).slice(2,6), scene);
    rimMat.diffuseColor = new BABYLON.Color3(0.75, 0.77, 0.82);
    rimMat.specularColor = new BABYLON.Color3(1, 1, 1);
    rimMat.specularPower = 220;
    rimMat.emissiveColor = new BABYLON.Color3(0.05, 0.05, 0.06);
    if (scene.environmentTexture) {
        rimMat.reflectionTexture = scene.environmentTexture;
        rimMat.reflectionTexture.level = 0.7;
    }

    const headlightMat = new BABYLON.StandardMaterial('pheadMat_' + Math.random().toString(36).slice(2,6), scene);
    headlightMat.disableLighting = true;
    headlightMat.emissiveColor = new BABYLON.Color3(1, 0.95, 0.75);

    const tailLightMat = new BABYLON.StandardMaterial('ptailMat_' + Math.random().toString(36).slice(2,6), scene);
    tailLightMat.disableLighting = true;
    tailLightMat.emissiveColor = new BABYLON.Color3(1, 0.12, 0.08);

    // ── Main body — lower chassis ──
    if (!cfg.open) {
        const body = BABYLON.MeshBuilder.CreateBox('pbody', { width: cfg.W, depth: cfg.L, height: cfg.H }, scene);
        body.position.y = cfg.wheelR + cfg.H / 2 - 0.05;
        body.parent = root;
        body.material = paintMat('body');
        // Nose tapering
        if (cfg.nose === 'sharp' || cfg.nose === 'wedge' || cfg.nose === 'curve') {
            // Add a nose cone
            const nose = BABYLON.MeshBuilder.CreateBox('pnose', { width: cfg.W * 0.9, depth: 0.5, height: cfg.H * 0.65 }, scene);
            nose.position.set(0, body.position.y - 0.05, cfg.L / 2 + 0.15);
            nose.parent = root;
            nose.material = paintMat('nose');
            nose.scaling.z = 0.7;
        }
        // Hood
        const hood = BABYLON.MeshBuilder.CreateBox('phood', { width: cfg.W * 0.92, depth: cfg.L * 0.32, height: 0.1 }, scene);
        hood.position.set(0, body.position.y + cfg.H / 2 - 0.02, cfg.L * 0.25);
        hood.parent = root;
        hood.material = paintMat('hood');

        // Roof / cabin
        const roof = BABYLON.MeshBuilder.CreateBox('proof', { width: cfg.W * 0.85, depth: cfg.roofL, height: cfg.roofH }, scene);
        roof.position.set(0, body.position.y + cfg.H / 2 + cfg.roofH / 2 - 0.05, cfg.roofOfs);
        roof.parent = root;
        roof.material = paintMat('roof');

        // Windshield / windows — sit inside roof box
        const glass = BABYLON.MeshBuilder.CreateBox('pglass', { width: cfg.W * 0.87, depth: cfg.roofL * 0.92, height: cfg.roofH * 0.75 }, scene);
        glass.position.set(0, roof.position.y + 0.03, cfg.roofOfs);
        glass.parent = root;
        glass.material = glassMat;

        // Front bumper / grille accent
        const grille = BABYLON.MeshBuilder.CreateBox('pgrille', { width: cfg.W * 0.7, depth: 0.06, height: 0.15 }, scene);
        grille.position.set(0, body.position.y - cfg.H * 0.15, cfg.L / 2 + 0.02);
        grille.parent = root;
        const grilleMat = new BABYLON.StandardMaterial('pgrilleMat', scene);
        grilleMat.diffuseColor = new BABYLON.Color3(0.04, 0.04, 0.06);
        grilleMat.specularColor = new BABYLON.Color3(0.3, 0.3, 0.35);
        grille.material = grilleMat;

        // Headlights
        for (const sign of [-1, 1]) {
            const hl = BABYLON.MeshBuilder.CreateBox('phl', { width: 0.25, depth: 0.08, height: 0.12 }, scene);
            hl.position.set(sign * cfg.W * 0.33, body.position.y + cfg.H * 0.15, cfg.L / 2 + 0.03);
            hl.parent = root;
            hl.material = headlightMat;
        }
        // Tail lights
        for (const sign of [-1, 1]) {
            const tl = BABYLON.MeshBuilder.CreateBox('ptl', { width: 0.3, depth: 0.06, height: 0.1 }, scene);
            tl.position.set(sign * cfg.W * 0.32, body.position.y + cfg.H * 0.1, -cfg.L / 2 - 0.02);
            tl.parent = root;
            tl.material = tailLightMat;
        }
    } else {
        // ── F1 open-wheel car ──
        const tub = BABYLON.MeshBuilder.CreateBox('pf1tub', { width: cfg.W, depth: cfg.L * 0.7, height: cfg.H }, scene);
        tub.position.set(0, cfg.wheelR + cfg.H / 2, -cfg.L * 0.05);
        tub.parent = root;
        tub.material = paintMat('tub');

        // Nose cone (long, tapering)
        const nose = BABYLON.MeshBuilder.CreateBox('pf1nose', { width: cfg.W * 0.5, depth: cfg.L * 0.35, height: cfg.H * 0.7 }, scene);
        nose.position.set(0, tub.position.y - 0.02, cfg.L * 0.45);
        nose.parent = root;
        nose.material = paintMat('nose');
        nose.scaling.x = 0.5;

        // Front wing
        const fWing = BABYLON.MeshBuilder.CreateBox('pf1fw', { width: cfg.W * 2.2, depth: 0.25, height: 0.06 }, scene);
        fWing.position.set(0, cfg.wheelR * 0.55, cfg.L * 0.62);
        fWing.parent = root;
        fWing.material = paintMat('fwing');

        // Rear wing — tall
        const rWing = BABYLON.MeshBuilder.CreateBox('pf1rw', { width: cfg.W * 1.9, depth: 0.2, height: 0.1 }, scene);
        rWing.position.set(0, cfg.wheelR + cfg.H + 0.55, -cfg.L * 0.4);
        rWing.parent = root;
        rWing.material = paintMat('rwing');
        // Wing supports
        for (const sign of [-1, 1]) {
            const sup = BABYLON.MeshBuilder.CreateBox('pf1sup', { width: 0.06, depth: 0.1, height: 0.6 }, scene);
            sup.position.set(sign * 0.22, cfg.wheelR + cfg.H + 0.25, -cfg.L * 0.4);
            sup.parent = root;
            sup.material = paintMat('sup');
        }
        // Halo (simple arch)
        const halo = BABYLON.MeshBuilder.CreateTorus('pf1halo', { diameter: cfg.W * 1.2, thickness: 0.05, tessellation: 24 }, scene);
        halo.position.set(0, tub.position.y + cfg.H * 0.45, cfg.L * 0.05);
        halo.rotation.x = Math.PI / 2;
        halo.parent = root;
        const haloMat = new BABYLON.StandardMaterial('phaloMat', scene);
        haloMat.diffuseColor = new BABYLON.Color3(0.08, 0.08, 0.1);
        haloMat.specularColor = new BABYLON.Color3(0.6, 0.6, 0.7);
        haloMat.specularPower = 160;
        halo.material = haloMat;

        // Cockpit opening (dark insert)
        const cockpit = BABYLON.MeshBuilder.CreateBox('pf1cock', { width: cfg.W * 0.7, depth: cfg.L * 0.18, height: 0.1 }, scene);
        cockpit.position.set(0, tub.position.y + cfg.H / 2 + 0.04, cfg.L * 0.05);
        cockpit.parent = root;
        cockpit.material = glassMat;
    }

    // Spoilers / wings (non-F1)
    if (cfg.spoiler === 'big' || cfg.spoiler === 'wing') {
        const wingW = cfg.W * 1.15;
        const wing = BABYLON.MeshBuilder.CreateBox('pwing', { width: wingW, depth: 0.18, height: 0.05 }, scene);
        const baseY = cfg.wheelR + cfg.H + cfg.roofH * 0.1;
        wing.position.set(0, baseY + (cfg.spoiler === 'wing' ? 0.35 : 0.18), -cfg.L / 2 + 0.05);
        wing.parent = root;
        wing.material = paintMat('wing');
        if (cfg.spoiler === 'wing') {
            for (const sign of [-1, 1]) {
                const post = BABYLON.MeshBuilder.CreateBox('pwingpost', { width: 0.05, depth: 0.08, height: 0.28 }, scene);
                post.position.set(sign * wingW * 0.4, baseY + 0.15, -cfg.L / 2 + 0.05);
                post.parent = root;
                post.material = paintMat('post');
            }
        }
    } else if (cfg.spoiler === 'lip') {
        const lip = BABYLON.MeshBuilder.CreateBox('plip', { width: cfg.W * 0.9, depth: 0.1, height: 0.04 }, scene);
        lip.position.set(0, cfg.wheelR + cfg.H + 0.03, -cfg.L / 2 + 0.05);
        lip.parent = root;
        lip.material = paintMat('lip');
    }

    // ── Wheels ──
    const wheelZFront = cfg.L * 0.32;
    const wheelZBack = -cfg.L * 0.3;
    for (const zSide of [wheelZFront, wheelZBack]) {
        for (const xSide of [-cfg.wheelAxle - cfg.W * 0.12, cfg.wheelAxle + cfg.W * 0.12]) {
            const tire = BABYLON.MeshBuilder.CreateCylinder('ptire', { diameter: cfg.wheelR * 2, height: 0.28, tessellation: 32 }, scene);
            tire.rotation.z = Math.PI / 2;
            tire.position.set(xSide, cfg.wheelR, zSide);
            tire.parent = root;
            tire.material = tireMat;

            const rim = BABYLON.MeshBuilder.CreateCylinder('prim', { diameter: cfg.wheelR * 1.25, height: 0.3, tessellation: 18 }, scene);
            rim.rotation.z = Math.PI / 2;
            rim.position.set(xSide, cfg.wheelR, zSide);
            rim.parent = root;
            rim.material = rimMat;

            // Brake disc (dark)
            const disc = BABYLON.MeshBuilder.CreateCylinder('pdisc', { diameter: cfg.wheelR * 1.05, height: 0.1, tessellation: 24 }, scene);
            disc.rotation.z = Math.PI / 2;
            disc.position.set(xSide, cfg.wheelR, zSide);
            disc.parent = root;
            const discMat = new BABYLON.StandardMaterial('pdiscMat', scene);
            discMat.diffuseColor = new BABYLON.Color3(0.1, 0.1, 0.12);
            discMat.specularColor = new BABYLON.Color3(0.5, 0.5, 0.55);
            disc.material = discMat;
        }
    }

    return root;
}

function updateCarPreview() {
    if (!_previewScene) return;
    const car = CARS[GameState.selectedCar];
    if (!car) return;
    const locked = GameState.xp < car.unlock;

    const canvasEl = document.getElementById('car-preview-canvas');
    if (canvasEl) canvasEl.style.opacity = locked ? '0.3' : '1';

    if (locked) {
        if (_previewCarRoot) { _previewCarRoot.dispose(); _previewCarRoot = null; }
        _previewLoadedStyle = null;
        _previewLoadedColor = null;
        return;
    }

    const style = car.style;
    const color = GameState.selectedColor;

    if (_previewLoadedStyle === style && _previewLoadedColor === color) return;

    // Same car, different color — retint materials in place
    if (_previewLoadedStyle === style && _previewCarRoot && _previewLoadedColor !== color) {
        _retintPreviewCar(color);
        _previewLoadedColor = color;
        return;
    }

    // Different car — rebuild
    if (_previewCarRoot) {
        _previewCarRoot.getChildMeshes(false).forEach(m => { try { m.dispose(); } catch(e) {} });
        try { _previewCarRoot.dispose(); } catch(e) {}
        _previewCarRoot = null;
    }
    _previewBodyMaterials = [];

    _previewCarRoot = _buildPreviewCar(style, color);
    _previewRotation = 0;
    _previewLoadedStyle = style;
    _previewLoadedColor = color;
}

function _retintPreviewCar(color) {
    if (!_previewBodyMaterials.length) return;
    const target = BABYLON.Color3.FromHexString(color);
    _previewBodyMaterials.forEach(m => {
        m.diffuseColor = target;
        m.emissiveColor = target.scale(0.05);
    });
}

function disposeCarPreview() {
    if (_previewEngine) _previewEngine.stopRenderLoop();
    if (_previewScene) { try { _previewScene.dispose(); } catch(e) {} _previewScene = null; }
    if (_previewEngine) { try { _previewEngine.dispose(); } catch(e) {} _previewEngine = null; }
    _previewCamera = null;
    _previewCarRoot = null;
    _previewLoadedStyle = null;
    _previewLoadedColor = null;
    _previewAccentLights = [];
    _previewBodyMaterials = [];
}
