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
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = coarse ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    renderer.domElement.style.cssText = "display:block;width:100%;height:100%;touch-action:none";
    container.style.background = opts.background || "linear-gradient(180deg,#27456f 0%,#10213d 100%)";
    container.appendChild(renderer.domElement);

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(40, 1, 0.1, 5000);
    var target = new THREE.Vector3(0, opts.targetY || 0, 0);
    var radius = opts.distance || 12;
    var yaw = opts.yaw === undefined ? 0.8 : opts.yaw;
    var pitch = opts.pitch === undefined ? 0.5 : opts.pitch;

    scene.add(new THREE.HemisphereLight(0xdbeafe, 0x334155, 1.35));
    var key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(6, 11, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048);
    var sc = key.shadow.camera;
    sc.left = -14; sc.right = 14; sc.top = 14; sc.bottom = -14; sc.near = 0.5; sc.far = 60;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.03;
    scene.add(key);
    var fill = new THREE.DirectionalLight(0xbfdbfe, 0.8);
    fill.position.set(-7, 4, -6);
    scene.add(fill);

    if (opts.floor !== false) {
      var ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: 0.32 }));
      ground.receiveShadow = true;
      scene.add(ground);
      var grid = new THREE.GridHelper(40, 40, 0x2b5a9c, 0x1b4280);
      grid.material.transparent = true;
      grid.material.opacity = 0.35;
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
        yaw -= (e.clientX - p.x) * 0.008;
        pitch = Math.min(1.45, Math.max(0.05, pitch + (e.clientY - p.y) * 0.006));
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
        return new THREE.MeshStandardMaterial({ color: color, roughness: o.roughness === undefined ? 0.5 : o.roughness, metalness: o.metalness === undefined ? 0.12 : o.metalness, emissive: o.emissive || 0x000000, emissiveIntensity: o.emissiveIntensity || 0 });
      },
      /** a mesh that casts and receives shadows, added to the scene */
      solid: function (geometry, color, o) {
        var m = new THREE.Mesh(geometry, kit.material(color, o));
        m.castShadow = true;
        m.receiveShadow = true;
        scene.add(m);
        return m;
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
