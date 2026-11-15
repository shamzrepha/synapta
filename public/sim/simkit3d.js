/* SimKit3D: the Maker Studio look for generated simulations (lit solid parts, soft shadows, orbit by dragging).
 * Loaded after three.min.js inside the sandboxed simulation frame. Plain ES2019, no dependencies. */
(function () {
  var THREE = window.THREE;
  if (!THREE) return;

  function create(container, opts) {
    opts = opts || {};
    var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    var coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.25 : 2));
    // physically-based output: filmic tone mapping + sRGB, so colours stay rich without blowing out
    if (THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;
    if (THREE.ACESFilmicToneMapping) { renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = opts.exposure || 1.05; }
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.domElement.style.cssText = "display:block;width:100%;height:100%;touch-action:none";
    container.style.background = opts.background || "radial-gradient(120% 90% at 50% 8%,#34568a 0%,#16294a 55%,#0c1730 100%)";
    container.appendChild(renderer.domElement);

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(40, 1, 0.1, 5000);
    var target = new THREE.Vector3(0, opts.targetY || 0, 0);
    var radius = opts.distance || 12;
    var yaw = opts.yaw === undefined ? 0.8 : opts.yaw;
    var pitch = opts.pitch === undefined ? 0.5 : opts.pitch;

    // studio environment: a gradient dome and two soft boxes, baked once into a reflection/ambient map
    if (THREE.PMREMGenerator && opts.environment !== false) {
      try {
        var envScene = new THREE.Scene();
        var dome = new THREE.Mesh(
          new THREE.SphereGeometry(50, 32, 16),
          new THREE.ShaderMaterial({
            side: THREE.BackSide,
            uniforms: {},
            vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
            fragmentShader: "varying vec3 vP; void main(){ float h = vP.y*0.5+0.5; vec3 lo = vec3(0.10,0.14,0.22); vec3 hi = vec3(0.62,0.74,0.92); gl_FragColor = vec4(mix(lo,hi,smoothstep(0.0,1.0,h)),1.0); }",
          })
        );
        envScene.add(dome);
        var box1 = new THREE.Mesh(new THREE.PlaneGeometry(22, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 6, 6.4), side: THREE.DoubleSide }));
        box1.position.set(14, 22, 10); box1.lookAt(0, 0, 0); envScene.add(box1);
        var box2 = new THREE.Mesh(new THREE.PlaneGeometry(14, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.8, 4), side: THREE.DoubleSide }));
        box2.position.set(-20, 8, -12); box2.lookAt(0, 0, 0); envScene.add(box2);
        var pmrem = new THREE.PMREMGenerator(renderer);
        scene.environment = pmrem.fromScene(envScene, 0.03).texture;
        pmrem.dispose();
      } catch (err) { /* lighting below still works without the map */ }
    }

    scene.add(new THREE.HemisphereLight(0xdbeafe, 0x334155, scene.environment ? 0.55 : 1.35));
    var key = new THREE.DirectionalLight(0xfff4e5, scene.environment ? 2.1 : 2.4);
    key.position.set(6, 11, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048);
    var sc = key.shadow.camera;
    sc.left = -14; sc.right = 14; sc.top = 14; sc.bottom = -14; sc.near = 0.5; sc.far = 60;
    key.shadow.radius = 3;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.03;
    scene.add(key);
    var fill = new THREE.DirectionalLight(0xbfdbfe, 0.6);
    fill.position.set(-7, 4, -6);
    scene.add(fill);
    // cool rim light from behind separates parts from the backdrop
    var rim = new THREE.DirectionalLight(0x93c5fd, 0.9);
    rim.position.set(-3, 6, -12);
    scene.add(rim);

    if (opts.floor !== false) {
      var ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: 0.32 }));
      ground.receiveShadow = true;
      scene.add(ground);
      // a soft pool of light under the scene, fading to nothing at the edges
      var gc = document.createElement("canvas");
      gc.width = gc.height = 256;
      var gx = gc.getContext("2d");
      var gr = gx.createRadialGradient(128, 128, 0, 128, 128, 128);
      gr.addColorStop(0, "rgba(160,200,255,0.34)");
      gr.addColorStop(0.6, "rgba(120,170,255,0.10)");
      gr.addColorStop(1, "rgba(120,170,255,0)");
      gx.fillStyle = gr; gx.fillRect(0, 0, 256, 256);
      var pool = new THREE.Mesh(new THREE.CircleGeometry(24, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(gc), transparent: true, depthWrite: false }));
      pool.position.y = -0.005;
      scene.add(pool);
      var grid = new THREE.GridHelper(36, 36, 0x3b6fb8, 0x234a8a);
      grid.material.transparent = true;
      grid.material.opacity = 0.22;
      grid.position.y = 0.002;
      scene.add(grid);
    }

    function place() {
      camera.position.set(
        target.x + radius * Math.cos(pitch) * Math.sin(yaw),
        target.y + radius * Math.sin(pitch),
        target.z + radius * Math.cos(pitch) * Math.cos(yaw)
      );
      camera.lookAt(target);
    }

    function resize() {
      var w = container.clientWidth || 300;
      var h = container.clientHeight || 300;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    if (window.ResizeObserver) new ResizeObserver(resize).observe(container);
    window.addEventListener("resize", resize);
    resize();

    // drag to orbit, wheel / pinch to zoom
    var pointers = {};
    var lastPinch = 0;
    var yawV = 0, pitchV = 0;
    var el = renderer.domElement;
    el.addEventListener("pointerdown", function (e) { pointers[e.pointerId] = { x: e.clientX, y: e.clientY }; try { el.setPointerCapture(e.pointerId); } catch (x) {} });
    el.addEventListener("pointerup", function (e) { delete pointers[e.pointerId]; lastPinch = 0; });
    el.addEventListener("pointercancel", function (e) { delete pointers[e.pointerId]; lastPinch = 0; });
    el.addEventListener("pointermove", function (e) {
      var p = pointers[e.pointerId];
      if (!p) return;
      var ids = Object.keys(pointers);
      if (ids.length >= 2) {
        var a = pointers[ids[0]], b = pointers[ids[1]];
        pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
        var d = Math.hypot(a.x - b.x, a.y - b.y);
        if (lastPinch) radius = Math.min(80, Math.max(2, radius * (lastPinch / (d || 1))));
        lastPinch = d;
      } else {
        yawV = -(e.clientX - p.x) * 0.008;
        pitchV = (e.clientY - p.y) * 0.006;
        yaw += yawV;
        pitch = Math.min(1.45, Math.max(0.05, pitch + pitchV));
        pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      }
      place();
    });
    el.addEventListener("wheel", function (e) { e.preventDefault(); radius = Math.min(80, Math.max(2, radius * (e.deltaY > 0 ? 1.08 : 0.92))); place(); }, { passive: false });
    place();

    var frames = [];
    var last = performance.now();
    function loop(now) {
      requestAnimationFrame(loop);
      var dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      // the view keeps drifting a moment after you let go
      if (!Object.keys(pointers).length && (Math.abs(yawV) > 0.0004 || Math.abs(pitchV) > 0.0004)) {
        yaw += yawV; pitch = Math.min(1.45, Math.max(0.05, pitch + pitchV));
        yawV *= 0.92; pitchV *= 0.92;
        place();
      }
      for (var i = 0; i < frames.length; i++) frames[i](dt, now / 1000);
      renderer.render(scene, camera);
    }
    requestAnimationFrame(loop);

    var kit = {
      THREE: THREE,
      scene: scene,
      camera: camera,
      renderer: renderer,
      /** call fn(dt seconds, time seconds) every frame */
      onFrame: function (fn) { frames.push(fn); },
      /** look at (x, y, z) from `distance` away */
      lookAt: function (x, y, z, distance) { target.set(x, y, z); if (distance) radius = distance; place(); },
      /** a lit, opaque material */
      material: function (color, o) {
        o = o || {};
        return new THREE.MeshPhysicalMaterial({
          color: color,
          roughness: o.roughness === undefined ? 0.45 : o.roughness,
          metalness: o.metalness === undefined ? 0.15 : o.metalness,
          clearcoat: o.clearcoat === undefined ? 0.35 : o.clearcoat,
          clearcoatRoughness: 0.25,
          emissive: o.emissive || 0x000000,
          emissiveIntensity: o.emissiveIntensity || 0,
          transparent: o.opacity !== undefined && o.opacity < 1,
          opacity: o.opacity === undefined ? 1 : o.opacity,
        });
      },
      /** a mesh that casts and receives shadows, added to the scene */
      solid: function (geometry, color, o) {
        var m = new THREE.Mesh(geometry, kit.material(color, o));
        m.castShadow = true;
        m.receiveShadow = true;
        scene.add(m);
        return m;
      },
      /** a box with softly rounded edges (looks like moulded plastic or metal), radius defaults to 8% of the smallest side */
      roundedBox: function (w, h, d, color, radius, o) {
        var r = Math.min(radius === undefined ? Math.min(w, h, d) * 0.08 : radius, Math.min(w, h, d) / 2 - 0.001);
        var shape = new THREE.Shape();
        var hw = w / 2 - r, hh = h / 2 - r;
        shape.moveTo(-hw, -h / 2); shape.lineTo(hw, -h / 2); shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -hh);
        shape.lineTo(w / 2, hh); shape.quadraticCurveTo(w / 2, h / 2, hw, h / 2);
        shape.lineTo(-hw, h / 2); shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, hh);
        shape.lineTo(-w / 2, -hh); shape.quadraticCurveTo(-w / 2, -h / 2, -hw, -h / 2);
        var g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.001, d - 2 * r), bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 4, curveSegments: 6 });
        g.translate(0, 0, -(d - 2 * r) / 2);
        return kit.solid(g, color, o);
      },
      box: function (w, h, d, color, o) { return kit.solid(new THREE.BoxGeometry(w, h, d), color, o); },
      cylinder: function (r, h, color, o) { return kit.solid(new THREE.CylinderGeometry(r, r, h, 40), color, o); },
      sphere: function (r, color, o) { return kit.solid(new THREE.SphereGeometry(r, 32, 20), color, o); },
      /** a thin line / wire through points [[x,y,z],...] */
      tube: function (points, radius, color) {
        var curve = new THREE.CatmullRomCurve3(points.map(function (p) { return new THREE.Vector3(p[0], p[1], p[2]); }));
        var m = new THREE.Mesh(new THREE.TubeGeometry(curve, 32, radius || 0.04, 8, false), kit.material(color || 0xef4444, { roughness: 0.4 }));
        m.castShadow = true;
        scene.add(m);
        return m;
      },
    };
    return kit;
  }

  window.SimKit3D = { create: create };
})();
