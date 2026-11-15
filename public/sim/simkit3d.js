/* SimKit3D: Claude's clean Maker Studio 3D engine (MeshPhysicalMaterial, PMREM dome reflections,
 * soft shadows, smooth inertia orbit, zero scene hijacking).
 * Loaded after three.min.js inside the sandboxed simulation frame. Plain ES2019, no dependencies. */
(function () {
  var THREE = window.THREE;
  if (!THREE) return;

  // Lightweight OrbitControls polyfill only when the standalone three.min.js bundle omits addons.
  if (!THREE.OrbitControls) {
    THREE.OrbitControls = function OrbitControls(camera, domElement) {
      var self = this;
      this.object = camera;
      this.domElement = domElement;
      this.target = new THREE.Vector3();
      this.enableDamping = true;
      this.dampingFactor = 0.08;
      this.enableZoom = true;
      this.enableRotate = true;
      this.minDistance = 1.5;
      this.maxDistance = 80;
      this.minPolarAngle = 0.06;
      this.maxPolarAngle = Math.PI * 0.49;

      var off = camera.position.clone().sub(this.target);
      var radius = Math.max(1.5, off.length() || 10);
      var theta = Math.atan2(off.x, off.z);
      var phi = Math.acos(Math.max(-0.999, Math.min(0.999, off.y / radius)));
      var tVel = 0, pVel = 0;
      var pointers = {};
      var lastPinch = 0;

      function sync() {
        phi = Math.max(self.minPolarAngle, Math.min(self.maxPolarAngle, phi));
        radius = Math.max(self.minDistance, Math.min(self.maxDistance, radius));
        var sp = Math.sin(phi);
        camera.position.set(
          self.target.x + radius * sp * Math.sin(theta),
          self.target.y + radius * Math.cos(phi),
          self.target.z + radius * sp * Math.cos(theta)
        );
        camera.lookAt(self.target);
      }

      if (domElement && domElement.addEventListener) {
        domElement.style.touchAction = "none";
        domElement.addEventListener("pointerdown", function (e) {
          pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
          try { domElement.setPointerCapture(e.pointerId); } catch (err) {}
        });
        domElement.addEventListener("pointerup", function (e) { delete pointers[e.pointerId]; lastPinch = 0; });
        domElement.addEventListener("pointercancel", function (e) { delete pointers[e.pointerId]; lastPinch = 0; });
        domElement.addEventListener("pointermove", function (e) {
          var p = pointers[e.pointerId];
          if (!p) return;
          var ids = Object.keys(pointers);
          if (ids.length >= 2 && self.enableZoom) {
            var a = pointers[ids[0]], b = pointers[ids[1]];
            pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
            var d = Math.hypot(a.x - b.x, a.y - b.y);
            if (lastPinch > 0 && d > 0) { radius *= lastPinch / d; sync(); }
            lastPinch = d;
          } else if (self.enableRotate) {
            tVel = -(e.clientX - p.x) * 0.008;
            pVel = -(e.clientY - p.y) * 0.006;
            theta += tVel;
            phi += pVel;
            pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
            sync();
          }
        });
        domElement.addEventListener("wheel", function (e) {
          if (!self.enableZoom) return;
          e.preventDefault();
          radius *= e.deltaY > 0 ? 1.08 : 0.92;
          sync();
        }, { passive: false });
      }
      this.update = function () {
        if (!Object.keys(pointers).length && (Math.abs(tVel) > 0.0004 || Math.abs(pVel) > 0.0004)) {
          theta += tVel;
          phi += pVel;
          tVel *= 1 - self.dampingFactor;
          pVel *= 1 - self.dampingFactor;
          sync();
        }
      };
      this.saveState = function () {};
      this.reset = function () { sync(); };
      this.dispose = function () {};
    };
  }

  function isVec3Like(v) {
    return Array.isArray(v) && v.length >= 3;
  }

  function toVec3(v) {
    if (v && typeof v.x === "number") return new THREE.Vector3(v.x, v.y, v.z);
    if (isVec3Like(v)) return new THREE.Vector3(Number(v[0]) || 0, Number(v[1]) || 0, Number(v[2]) || 0);
    return new THREE.Vector3(0, 0, 0);
  }

  /** Detect whether a bare value is a color (hex >= 0x1000, CSS string, or THREE.Color). */
  function isColorValue(v) {
    if (typeof v === "string") return true;
    if (v && typeof v === "object" && v.isColor) return true;
    return typeof v === "number" && v >= 0x1000;
  }

  /** Resolve (colorOrOpts, maybeOpts) so both `(w,h,d,color,opts)` and `(w,h,d,{color,pos})` work cleanly. */
  function resolveStyle(a, b, fallbackColor) {
    var out = {};
    var k;
    if (a && typeof a === "object" && !a.isColor) {
      for (k in a) out[k] = a[k];
      if (out.color === undefined) out.color = fallbackColor;
      return out;
    }
    if (b && typeof b === "object") {
      for (k in b) out[k] = b[k];
    }
    if (a !== undefined && out.color === undefined) out.color = a;
    if (out.color === undefined) out.color = fallbackColor;
    return out;
  }

  function create(container, opts) {
    opts = opts || {};
    var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    var coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.25 : 2));
    if (THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;
    if (THREE.ACESFilmicToneMapping) {
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = opts.exposure || 1.05;
    }
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap || THREE.PCFShadowMap || 1;
    renderer.domElement.dataset.simkit3d = "1";
    renderer.domElement.style.cssText = "display:block;width:100%;height:100%;touch-action:none";
    container.style.background =
      opts.background || "radial-gradient(120% 90% at 50% 8%,#34568a 0%,#16294a 55%,#0c1730 100%)";
    container.appendChild(renderer.domElement);

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(40, 1, 0.1, 5000);
    var initTargetY = opts.targetY || 0;
    var initDist = opts.distance || 10;
    var initYaw = opts.yaw === undefined ? 0.72 : opts.yaw;
    var initPitch = opts.pitch === undefined ? 0.44 : opts.pitch;

    var target = new THREE.Vector3(0, initTargetY, 0);
    var radius = initDist;
    var yaw = initYaw;
    var pitch = initPitch;

    // Studio dome environment for rich metallic and painted-plastic reflections (Claude 909be3d)
    if (THREE.PMREMGenerator && THREE.ShaderMaterial && opts.environment !== false) {
      try {
        var envScene = new THREE.Scene();
        var dome = new THREE.Mesh(
          new THREE.SphereGeometry(50, 32, 16),
          new THREE.ShaderMaterial({
            side: THREE.BackSide,
            uniforms: {},
            vertexShader:
              "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
            fragmentShader:
              "varying vec3 vP; void main(){ float h = vP.y*0.5+0.5; vec3 lo = vec3(0.10,0.14,0.22); vec3 hi = vec3(0.62,0.74,0.92); gl_FragColor = vec4(mix(lo,hi,smoothstep(0.0,1.0,h)),1.0); }",
          })
        );
        envScene.add(dome);
        var box1 = new THREE.Mesh(
          new THREE.PlaneGeometry(22, 12),
          new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 6, 6.4), side: THREE.DoubleSide })
        );
        box1.position.set(14, 22, 10);
        box1.lookAt(0, 0, 0);
        envScene.add(box1);
        var box2 = new THREE.Mesh(
          new THREE.PlaneGeometry(14, 8),
          new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.8, 4), side: THREE.DoubleSide })
        );
        box2.position.set(-20, 8, -12);
        box2.lookAt(0, 0, 0);
        envScene.add(box2);
        var pmrem = new THREE.PMREMGenerator(renderer);
        scene.environment = pmrem.fromScene(envScene, 0.03).texture;
        pmrem.dispose();
      } catch (err) { /* lighting below still works without PMREM */ }
    }

    scene.add(new THREE.HemisphereLight(0xdbeafe, 0x334155, scene.environment ? 0.6 : 1.35));
    var key = new THREE.DirectionalLight(0xfff4e5, scene.environment ? 2.0 : 2.35);
    key.position.set(6, 11, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048);
    var sc = key.shadow.camera;
    sc.left = -12; sc.right = 12; sc.top = 12; sc.bottom = -12; sc.near = 0.5; sc.far = 50;
    key.shadow.radius = 3;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.03;
    scene.add(key);

    var fill = new THREE.DirectionalLight(0xbfdbfe, 0.65);
    fill.position.set(-7, 4, -6);
    scene.add(fill);

    var rim = new THREE.DirectionalLight(0x93c5fd, 0.9);
    rim.position.set(-3, 6, -12);
    scene.add(rim);

    if (opts.floor !== false) {
      var groundMat = THREE.ShadowMaterial
        ? new THREE.ShadowMaterial({ opacity: 0.32 })
        : new THREE.MeshBasicMaterial({ color: 0x0f172a, transparent: true, opacity: 0.18 });
      var ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), groundMat);
      ground.rotation.x = -Math.PI / 2;
      ground.receiveShadow = true;
      scene.add(ground);

      var gc = document.createElement("canvas");
      gc.width = gc.height = 256;
      var gx = gc.getContext && gc.getContext("2d");
      if (gx && typeof gx.createRadialGradient === "function") {
        var gr = gx.createRadialGradient(128, 128, 0, 128, 128, 128);
        gr.addColorStop(0, "rgba(160,200,255,0.34)");
        gr.addColorStop(0.6, "rgba(120,170,255,0.10)");
        gr.addColorStop(1, "rgba(120,170,255,0)");
        gx.fillStyle = gr;
        gx.fillRect(0, 0, 256, 256);
        var pool = new THREE.Mesh(
          new THREE.CircleGeometry(24, 64),
          new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(gc), transparent: true, depthWrite: false })
        );
        pool.rotation.x = -Math.PI / 2;
        pool.position.y = -0.005;
        scene.add(pool);
      }

      if (THREE.GridHelper) {
        var grid = new THREE.GridHelper(32, 32, 0x3b6fb8, 0x234a8a);
        if (grid.material) {
          grid.material.transparent = true;
          grid.material.opacity = 0.22;
        }
        grid.position.y = 0.002;
        scene.add(grid);
      }
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

    var pointers = {};
    var lastPinch = 0;
    var yawV = 0, pitchV = 0;
    var el = renderer.domElement;
    el.addEventListener("pointerdown", function (e) {
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      try { el.setPointerCapture(e.pointerId); } catch (x) {}
    });
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
        if (lastPinch && d > 0) radius = Math.min(80, Math.max(1.8, radius * (lastPinch / d)));
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
    el.addEventListener("wheel", function (e) {
      e.preventDefault();
      radius = Math.min(80, Math.max(1.8, radius * (e.deltaY > 0 ? 1.08 : 0.92)));
      place();
    }, { passive: false });
    place();

    var objects = [];
    var frames = [];
    var rafId = 0;
    var disposed = false;
    var last = performance.now();
    function loop(now) {
      if (disposed) return;
      rafId = requestAnimationFrame(loop);
      var dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!Object.keys(pointers).length && (Math.abs(yawV) > 0.0004 || Math.abs(pitchV) > 0.0004)) {
        yaw += yawV;
        pitch = Math.min(1.45, Math.max(0.05, pitch + pitchV));
        yawV *= 0.92;
        pitchV *= 0.92;
        place();
      }
      for (var i = 0; i < frames.length; i++) frames[i](dt, now / 1000);
      renderer.render(scene, camera);
    }
    rafId = requestAnimationFrame(loop);

    function applyTransform(obj, o) {
      o = o || {};
      var pos = o.pos || o.position;
      if (isVec3Like(pos)) obj.position.set(pos[0] || 0, pos[1] || 0, pos[2] || 0);
      else if (pos && typeof pos.x === "number") obj.position.copy(pos);

      var rot = o.rot || o.rotation;
      if (isVec3Like(rot)) obj.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);

      var scl = o.scale;
      if (typeof scl === "number") obj.scale.set(scl, scl, scl);
      else if (isVec3Like(scl)) obj.scale.set(scl[0] || 1, scl[1] || 1, scl[2] || 1);

      if (o.name) obj.name = String(o.name);
      if (o.castShadow !== undefined) obj.castShadow = !!o.castShadow;
      if (o.receiveShadow !== undefined) obj.receiveShadow = !!o.receiveShadow;

      if (o.parent && typeof o.parent.add === "function") {
        o.parent.add(obj);
      } else {
        scene.add(obj);
        objects.push(obj);
      }
      return obj;
    }

    function orientBetween(obj, a, b) {
      var va = toVec3(a), vb = toVec3(b);
      var diff = vb.clone().sub(va);
      var len = diff.length();
      obj.position.copy(va).add(vb).multiplyScalar(0.5);
      if (len > 1e-6) {
        obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), diff.clone().divideScalar ? diff.clone().divideScalar(len) : diff.clone().normalize());
      }
      return len;
    }

    function makeSpringCurve(a, b, turns, rad) {
      var va = toVec3(a), vb = toVec3(b);
      var diff = vb.clone().sub(va);
      var len = Math.max(0.05, diff.length());
      var dir = diff.clone().normalize();
      var up = Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      var right = new THREE.Vector3().subVectors ? dir.clone().normalize() : dir.clone();
      // Deterministic perpendicular frame without depending on Vector3.cross in minimal mocks
      var px = dir.y * up.z - dir.z * up.y;
      var py = dir.z * up.x - dir.x * up.z;
      var pz = dir.x * up.y - dir.y * up.x;
      var plen = Math.hypot(px, py, pz) || 1;
      px /= plen; py /= plen; pz /= plen;
      var qx = dir.y * pz - dir.z * py;
      var qy = dir.z * px - dir.x * pz;
      var qz = dir.x * py - dir.y * px;
      var pts = [];
      var n = Math.max(24, (turns || 8) * 10);
      var R = rad || 0.14;
      for (var i = 0; i <= n; i++) {
        var t = i / n;
        var ang = t * (turns || 8) * Math.PI * 2;
        var taper = i === 0 || i === n ? 0 : 1;
        var c = Math.cos(ang) * R * taper, s = Math.sin(ang) * R * taper;
        pts.push(new THREE.Vector3(
          va.x + diff.x * t + px * c + qx * s,
          va.y + diff.y * t + py * c + qy * s,
          va.z + diff.z * t + pz * c + qz * s
        ));
      }
      return right && new THREE.CatmullRomCurve3(pts);
    }

    var kit = {
      THREE: THREE,
      scene: scene,
      camera: camera,
      renderer: renderer,
      onFrame: function (fn) { if (typeof fn === "function") frames.push(fn); },
      lookAt: function (x, y, z, distance) {
        target.set(x, y, z);
        if (distance) radius = distance;
        place();
      },
      resetCamera: function () {
        target.set(0, initTargetY, 0);
        radius = initDist;
        yaw = initYaw;
        pitch = initPitch;
        yawV = 0;
        pitchV = 0;
        place();
      },
      fitCamera: function (pad) {
        if (!objects.length || !THREE.Box3) { place(); return; }
        var box = new THREE.Box3();
        for (var i = 0; i < objects.length; i++) box.expandByObject(objects[i]);
        if (box.isEmpty && box.isEmpty()) { place(); return; }
        var center = box.getCenter(new THREE.Vector3());
        var size = box.getSize(new THREE.Vector3());
        var maxDim = Math.max(size.x, size.y, size.z, 1);
        var halfFov = ((camera.fov || 40) * Math.PI) / 360;
        var dist = (maxDim / 2) / Math.tan(halfFov || 0.36);
        target.copy(center);
        radius = Math.min(60, Math.max(2.6, dist * (pad || 1.28)));
        place();
      },
      clear: function () {
        for (var i = 0; i < objects.length; i++) scene.remove(objects[i]);
        objects.length = 0;
      },
      material: function (colorOrOpts, o) {
        var s = resolveStyle(colorOrOpts, o, 0x60a5fa);
        var MatCtor = THREE.MeshPhysicalMaterial || THREE.MeshStandardMaterial || THREE.MeshBasicMaterial;
        return new MatCtor({
          color: s.color,
          roughness: s.roughness === undefined ? 0.45 : s.roughness,
          metalness: s.metalness === undefined ? 0.15 : s.metalness,
          clearcoat: s.clearcoat === undefined ? 0.35 : s.clearcoat,
          clearcoatRoughness: s.clearcoatRoughness === undefined ? 0.25 : s.clearcoatRoughness,
          emissive: s.emissive || 0x000000,
          emissiveIntensity: s.emissiveIntensity || 0,
          transparent: s.opacity !== undefined && s.opacity < 1,
          opacity: s.opacity === undefined ? 1 : s.opacity,
          side: s.doubleSide || s.side === THREE.DoubleSide ? THREE.DoubleSide : undefined,
        });
      },
      solid: function (geometry, colorOrOpts, o) {
        var s = resolveStyle(colorOrOpts, o, 0x60a5fa);
        var m = new THREE.Mesh(geometry, kit.material(s));
        m.castShadow = s.castShadow !== false;
        m.receiveShadow = s.receiveShadow !== false;
        return applyTransform(m, s);
      },
      roundedBox: function (w, h, d, colorOrR, rOrOpts, maybeOpts) {
        var minSide = Math.min(w, h, d);
        var r, s;
        if (colorOrR && typeof colorOrR === "object" && !colorOrR.isColor) {
          r = undefined;
          s = resolveStyle(colorOrR, undefined, 0x60a5fa);
        } else if (typeof colorOrR === "number" && !isColorValue(colorOrR) && colorOrR <= minSide * 0.5 && (rOrOpts === undefined || typeof rOrOpts === "object")) {
          r = colorOrR;
          s = resolveStyle(rOrOpts, undefined, 0x60a5fa);
        } else if (typeof rOrOpts === "number") {
          r = rOrOpts;
          s = resolveStyle(colorOrR, maybeOpts, 0x60a5fa);
        } else {
          r = undefined;
          s = resolveStyle(colorOrR, rOrOpts, 0x60a5fa);
        }
        var rad = Math.max(0.001, Math.min(r === undefined ? minSide * 0.08 : r, minSide / 2 - 0.001));
        var shape = new THREE.Shape();
        var hw = w / 2 - rad, hh = h / 2 - rad;
        shape.moveTo(-hw, -h / 2); shape.lineTo(hw, -h / 2); shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -hh);
        shape.lineTo(w / 2, hh); shape.quadraticCurveTo(w / 2, h / 2, hw, h / 2);
        shape.lineTo(-hw, h / 2); shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, hh);
        shape.lineTo(-w / 2, -hh); shape.quadraticCurveTo(-w / 2, -h / 2, -hw, -h / 2);
        var g = new THREE.ExtrudeGeometry(shape, {
          depth: Math.max(0.001, d - 2 * rad),
          bevelEnabled: true,
          bevelThickness: rad,
          bevelSize: rad,
          bevelSegments: 4,
          curveSegments: 6,
        });
        if (typeof g.translate === "function") g.translate(0, 0, -(d - 2 * rad) / 2);
        return kit.solid(g, s);
      },
      box: function (w, h, d, colorOrOpts, o) {
        return kit.solid(new THREE.BoxGeometry(w, h, d), colorOrOpts, o);
      },
      cylinder: function (a1, a2, a3, a4, a5) {
        var rTop, rBot, h, s;
        if (a3 === undefined || (typeof a3 === "object" && !a3.isColor) || isColorValue(a3)) {
          rTop = a1; rBot = a1; h = a2;
          s = resolveStyle(a3, a4, 0x94a3b8);
        } else {
          rTop = a1; rBot = a2; h = a3;
          s = resolveStyle(a4, a5, 0x94a3b8);
        }
        return kit.solid(new THREE.CylinderGeometry(rTop, rBot, h, 36), s);
      },
      sphere: function (r, colorOrOpts, o) {
        return kit.solid(new THREE.SphereGeometry(r, 32, 20), colorOrOpts, o);
      },
      cone: function (r, h, colorOrOpts, o) {
        return kit.solid(new THREE.ConeGeometry(r, h, 32), colorOrOpts, o);
      },
      torus: function (R, r, colorOrOpts, o) {
        return kit.solid(new THREE.TorusGeometry(R, r, 16, 48), colorOrOpts, o);
      },
      capsule: function (r, len, colorOrOpts, o) {
        var geo = THREE.CapsuleGeometry
          ? new THREE.CapsuleGeometry(r, len, 8, 20)
          : new THREE.CylinderGeometry(r, r, len + 2 * r, 24);
        return kit.solid(geo, colorOrOpts, o);
      },
      plane: function (w, h, colorOrOpts, o) {
        var s = resolveStyle(colorOrOpts, o, 0x334155);
        s.doubleSide = true;
        return kit.solid(new THREE.PlaneGeometry(w, h), s);
      },
      ring: function (innerR, outerR, colorOrOpts, o) {
        var s = resolveStyle(colorOrOpts, o, 0x60a5fa);
        s.doubleSide = true;
        return kit.solid(new THREE.RingGeometry(innerR, outerR, 40), s);
      },
      disc: function (r, colorOrOpts, o) {
        var s = resolveStyle(colorOrOpts, o, 0x60a5fa);
        s.doubleSide = true;
        return kit.solid(new THREE.CircleGeometry(r, 40), s);
      },
      tube: function (points, radiusOrOpts, colorOrOpts, o) {
        var rad = typeof radiusOrOpts === "number" ? radiusOrOpts : 0.04;
        var s = typeof radiusOrOpts === "object" ? resolveStyle(radiusOrOpts, undefined, 0xef4444) : resolveStyle(colorOrOpts, o, 0xef4444);
        var curve = new THREE.CatmullRomCurve3((points || []).map(toVec3));
        return kit.solid(new THREE.TubeGeometry(curve, Math.max(16, (points || []).length * 4), rad, 8, false), s);
      },
      line: function (points, optsOrColor) {
        var s = resolveStyle(optsOrColor, undefined, 0x38bdf8);
        var vecs = (points || []).map(toVec3);
        var geo = new THREE.BufferGeometry().setFromPoints(vecs);
        var mat = new THREE.LineBasicMaterial({
          color: s.color,
          transparent: s.opacity !== undefined && s.opacity < 1,
          opacity: s.opacity === undefined ? 1 : s.opacity,
        });
        var ln = new THREE.Line(geo, mat);
        ln.setPoints = function (nextPts) {
          geo.setFromPoints((nextPts || []).map(toVec3));
          return ln;
        };
        return applyTransform(ln, s);
      },
      rod: function (from, to, radiusOrOpts, opts) {
        var rad = typeof radiusOrOpts === "number" ? radiusOrOpts : 0.04;
        var s = typeof radiusOrOpts === "object" ? resolveStyle(radiusOrOpts, undefined, 0xcbd5e1) : resolveStyle(opts, undefined, 0xcbd5e1);
        var mesh = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, 1, 20), kit.material(s));
        mesh.castShadow = s.castShadow !== false;
        mesh.receiveShadow = s.receiveShadow !== false;
        mesh.setEndpoints = function (a, b) {
          var len = orientBetween(mesh, a, b);
          mesh.scale.set(1, Math.max(0.001, len), 1);
          return mesh;
        };
        mesh.setEndpoints(from, to);
        return applyTransform(mesh, s);
      },
      spring: function (from, to, turns, rad, opts) {
        var s = resolveStyle(opts, undefined, 0x94a3b8);
        var tubeR = Math.min(0.035, (rad || 0.14) * 0.22);
        var mesh = new THREE.Mesh(new THREE.TubeGeometry(makeSpringCurve(from, to, turns || 8, rad || 0.14), 64, tubeR, 8, false), kit.material(s));
        mesh.castShadow = s.castShadow !== false;
        mesh.setEndpoints = function (a, b) {
          mesh.geometry = new THREE.TubeGeometry(makeSpringCurve(a, b, turns || 8, rad || 0.14), 64, tubeR, 8, false);
          return mesh;
        };
        return applyTransform(mesh, s);
      },
      arrow: function (from, to, opts) {
        var s = resolveStyle(opts, undefined, 0xfacc15);
        var grp = new THREE.Group();
        var r = s.radius || 0.04;
        var mat = kit.material(s);
        var shaft = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 16), mat);
        var head = new THREE.Mesh(new THREE.ConeGeometry(r * 2.4, r * 6, 20), mat);
        shaft.castShadow = true;
        head.castShadow = true;
        grp.add(shaft);
        grp.add(head);
        grp.setEndpoints = function (a, b) {
          var va = toVec3(a), vb = toVec3(b);
          var diff = vb.clone().sub(va);
          var len = Math.max(0.05, diff.length());
          var headLen = Math.min(len * 0.35, r * 6);
          var shaftLen = Math.max(0.01, len - headLen);
          orientBetween(grp, va, vb);
          shaft.scale.set(1, shaftLen, 1);
          shaft.position.set(0, -headLen * 0.5, 0);
          head.position.set(0, shaftLen * 0.5, 0);
          return grp;
        };
        grp.setEndpoints(from, to);
        return applyTransform(grp, s);
      },
      label: function (text, pos, opts) {
        var s = resolveStyle(opts, undefined, 0xffffff);
        var canvas = document.createElement("canvas");
        canvas.width = 256;
        canvas.height = 64;
        var ctx = canvas.getContext && canvas.getContext("2d");
        var tex = new THREE.CanvasTexture(canvas);
        if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
        function drawText(next) {
          if (!ctx) return;
          ctx.clearRect(0, 0, 256, 64);
          ctx.fillStyle = s.bg || "rgba(15,23,42,0.82)";
          if (typeof ctx.roundRect === "function") { ctx.beginPath(); ctx.roundRect(8, 8, 240, 48, 12); ctx.fill(); }
          else ctx.fillRect(8, 8, 240, 48);
          ctx.fillStyle = typeof s.color === "string" ? s.color : "#f8fafc";
          ctx.font = "600 22px system-ui,sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(String(next), 128, 33);
          tex.needsUpdate = true;
        }
        drawText(text);
        var mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
        var sp = new THREE.Sprite(mat);
        sp.scale.set(s.width || 1.8, s.height || 0.45, 1);
        sp.setText = drawText;
        sp.setPos = function (p) { var v = toVec3(p); sp.position.copy(v); return sp; };
        if (pos) sp.setPos(pos);
        return applyTransform(sp, s);
      },
      group: function (opts) {
        return applyTransform(new THREE.Group(), opts || {});
      },
      dispose: function () {
        disposed = true;
        if (rafId && typeof cancelAnimationFrame === "function") cancelAnimationFrame(rafId);
        if (renderer.dispose) renderer.dispose();
      },
    };
    return kit;
  }

  window.SimKit3D = { create: create };
})();
