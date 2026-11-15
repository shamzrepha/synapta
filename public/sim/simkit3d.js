/**
 * SimKit3D — Sunroot's lightweight 3D lab kit on top of Three.js (r186).
 *
 * Preloaded in every 3D simulation iframe so a generated lab can build a lit,
 * shadowed, orbitable 3D scene in ~30 lines instead of spending tokens on
 * boilerplate. Also provides:
 * - window.THREE.OrbitControls (so scripts using raw Three.js never fail)
 * - Full primitive set (box, roundedBox, cylinder, sphere, cone, torus, capsule,
 *   plane, ring, disc, rod, spring, arrow, line, tube, group, text/label, light)
 * - Self-healing 3D Lab Artifact & live slider binding if a model's script
 *   crashes mid-setup or leaves the stage empty.
 */
(function () {
  var THREE = window.THREE;
  if (!THREE) return;

  var trackedKits = [];
  var trackedRenderers = [];
  var scriptHadError = false;
  var inputsWithListeners = new WeakSet();

  // Track whether scripts register input/change listeners on sliders
  if (typeof HTMLInputElement !== "undefined" && HTMLInputElement.prototype.addEventListener) {
    var origAddEvent = HTMLInputElement.prototype.addEventListener;
    HTMLInputElement.prototype.addEventListener = function (type, listener, options) {
      if (type === "input" || type === "change") {
        try {
          inputsWithListeners.add(this);
        } catch (_) {}
      }
      return origAddEvent.call(this, type, listener, options);
    };
  }

  window.addEventListener("error", function () {
    scriptHadError = true;
  });
  window.addEventListener("unhandledrejection", function () {
    scriptHadError = true;
  });

  // Track raw THREE.WebGLRenderer instances too
  if (THREE.WebGLRenderer && !THREE.WebGLRenderer.__sunrootPatched) {
    var OrigRenderer = THREE.WebGLRenderer;
    var PatchedRenderer = function (params) {
      var inst = new OrigRenderer(params);
      var origRender = inst.render.bind(inst);
      inst.__lastScene = null;
      inst.__lastCamera = null;
      inst.render = function (scene, camera) {
        inst.__lastScene = scene;
        inst.__lastCamera = camera;
        return origRender(scene, camera);
      };
      trackedRenderers.push(inst);
      return inst;
    };
    PatchedRenderer.prototype = OrigRenderer.prototype;
    Object.assign(PatchedRenderer, OrigRenderer);
    PatchedRenderer.__sunrootPatched = true;
    THREE.WebGLRenderer = PatchedRenderer;
  }

  // Provide THREE.OrbitControls so raw Three.js scripts calling `new THREE.OrbitControls(...)` work
  if (!THREE.OrbitControls) {
    var OrbitControls = function (camera, domElement) {
      var self = this;
      this.object = camera;
      this.domElement = domElement || document.body;
      this.enabled = true;
      this.target = new THREE.Vector3(0, 0.8, 0);
      this.enableDamping = true;
      this.dampingFactor = 0.08;
      this.enableZoom = true;
      this.enablePan = true;
      this.autoRotate = false;
      this.autoRotateSpeed = 2.0;
      this.minDistance = 0.8;
      this.maxDistance = 400;

      var off = camera.position.clone().sub(this.target);
      var radius = Math.max(1.5, off.length() || 7);
      var theta = Math.atan2(off.x, off.z) || 0.65;
      var phi = Math.acos(Math.max(-0.99, Math.min(0.99, (off.y || 2.5) / radius))) || 1.05;
      var drag = null;
      var pinchDist = 0;

      function syncCamera() {
        phi = Math.max(0.12, Math.min(Math.PI - 0.12, phi));
        radius = Math.max(self.minDistance, Math.min(self.maxDistance, radius));
        camera.position.set(
          self.target.x + radius * Math.sin(phi) * Math.sin(theta),
          self.target.y + radius * Math.cos(phi),
          self.target.z + radius * Math.sin(phi) * Math.cos(theta)
        );
        camera.lookAt(self.target);
      }

      if (this.domElement && this.domElement.addEventListener) {
        this.domElement.style.touchAction = "none";
        this.domElement.addEventListener("pointerdown", function (e) {
          if (!self.enabled) return;
          drag = { x: e.clientX, y: e.clientY, pan: e.button === 2 || e.shiftKey };
          try {
            self.domElement.setPointerCapture(e.pointerId);
          } catch (_) {}
        });
        this.domElement.addEventListener("pointermove", function (e) {
          if (!self.enabled || !drag) return;
          var dx = e.clientX - drag.x;
          var dy = e.clientY - drag.y;
          drag.x = e.clientX;
          drag.y = e.clientY;
          if (drag.pan && self.enablePan) {
            var right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0).multiplyScalar(-dx * 0.008 * (radius / 7));
            var up = new THREE.Vector3(0, dy * 0.008 * (radius / 7), 0);
            self.target.add(right).add(up);
          } else {
            theta -= dx * 0.007;
            phi = Math.max(0.12, Math.min(Math.PI * 0.49, phi - dy * 0.007));
          }
          syncCamera();
        });
        var endDrag = function () {
          drag = null;
        };
        this.domElement.addEventListener("pointerup", endDrag);
        this.domElement.addEventListener("pointercancel", endDrag);
        this.domElement.addEventListener("contextmenu", function (e) {
          e.preventDefault();
        });
        this.domElement.addEventListener(
          "wheel",
          function (e) {
            if (!self.enabled || !self.enableZoom) return;
            e.preventDefault();
            radius = Math.max(self.minDistance, Math.min(self.maxDistance, radius * (e.deltaY > 0 ? 1.1 : 0.9)));
            syncCamera();
          },
          { passive: false }
        );
        this.domElement.addEventListener(
          "touchstart",
          function (e) {
            if (e.touches.length === 2) {
              pinchDist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
              );
            }
          },
          { passive: true }
        );
        this.domElement.addEventListener(
          "touchmove",
          function (e) {
            if (self.enabled && self.enableZoom && e.touches.length === 2 && pinchDist > 0) {
              var d = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
              );
              if (d > 4) radius = Math.max(self.minDistance, Math.min(self.maxDistance, radius * (pinchDist / d)));
              pinchDist = d;
              syncCamera();
            }
          },
          { passive: true }
        );
      }

      this.update = function () {
        if (self.autoRotate && !drag) {
          theta += 0.003 * self.autoRotateSpeed;
          syncCamera();
        } else {
          camera.lookAt(self.target);
        }
        return true;
      };
      this.reset = function () {
        self.target.set(0, 0.8, 0);
        radius = 7;
        theta = 0.65;
        phi = 1.1;
        syncCamera();
      };
      this.dispose = function () {};
      this.addEventListener = function () {};
      this.removeEventListener = function () {};
    };
    THREE.OrbitControls = OrbitControls;
    window.OrbitControls = OrbitControls;
  }

  function normOpts(o, fallbackColor) {
    if (typeof o === "number" || typeof o === "string") return { color: o };
    if (o && typeof o === "object" && !Array.isArray(o)) return o;
    return fallbackColor !== undefined ? { color: fallbackColor } : {};
  }

  function safeColor(c, fallback) {
    try {
      return new THREE.Color(c !== undefined && c !== null ? c : fallback !== undefined ? fallback : 0x60a5fa);
    } catch (_) {
      return new THREE.Color(fallback !== undefined ? fallback : 0x60a5fa);
    }
  }

  function isColorValue(v) {
    if (typeof v === "string") return true;
    return typeof v === "number" && Number.isFinite(v) && Number.isInteger(v) && v >= 0 && v > 64;
  }

  function mergeColorOpts(colorOrOpts, maybeOpts) {
    if (maybeOpts && typeof maybeOpts === "object" && !Array.isArray(maybeOpts)) {
      if (typeof colorOrOpts === "number" || typeof colorOrOpts === "string") {
        return Object.assign({}, maybeOpts, { color: colorOrOpts });
      }
      return maybeOpts;
    }
    if ((typeof colorOrOpts === "number" || typeof colorOrOpts === "string") && maybeOpts === undefined) {
      return { color: colorOrOpts };
    }
    return normOpts(colorOrOpts);
  }

  function clampDim(v, defVal) {
    var n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return defVal;
    return Math.min(80, Math.max(0.005, n));
  }

  function toVec3(v, defX, defY, defZ) {
    if (v && v.isVector3) return v.clone();
    if (Array.isArray(v)) return new THREE.Vector3(Number(v[0]) || 0, Number(v[1]) || 0, Number(v[2]) || 0);
    if (v && typeof v === "object") return new THREE.Vector3(Number(v.x) || 0, Number(v.y) || 0, Number(v.z) || 0);
    return new THREE.Vector3(defX || 0, defY || 0, defZ || 0);
  }

  function makeMaterial(opts) {
    opts = normOpts(opts);
    var matOpts = {
      color: safeColor(opts.color, 0x60a5fa),
      roughness: opts.roughness !== undefined ? Number(opts.roughness) : 0.36,
      metalness: opts.metalness !== undefined ? Number(opts.metalness) : 0.18,
      transparent: !!(opts.opacity !== undefined && opts.opacity < 1) || !!opts.transparent,
      opacity: opts.opacity !== undefined ? Number(opts.opacity) : 1,
      wireframe: !!opts.wireframe,
    };
    if (opts.emissive !== undefined) {
      matOpts.emissive = safeColor(opts.emissive, 0x000000);
      matOpts.emissiveIntensity = opts.emissiveIntensity !== undefined ? Number(opts.emissiveIntensity) : 0.65;
    }
    if (opts.doubleSided || opts.side === THREE.DoubleSide) {
      matOpts.side = THREE.DoubleSide;
    }
    return new THREE.MeshStandardMaterial(matOpts);
  }

  function solid(geo, opts) {
    opts = normOpts(opts);
    var m = new THREE.Mesh(geo, makeMaterial(opts));
    m.castShadow = opts.shadow !== false;
    m.receiveShadow = opts.shadow !== false;
    if (opts.edges !== false && !opts.wireframe) {
      try {
        var edge = new THREE.LineSegments(
          new THREE.EdgesGeometry(geo, 28),
          new THREE.LineBasicMaterial({ color: 0x0f172a, transparent: true, opacity: 0.25 })
        );
        m.add(edge);
      } catch (_) {}
    }
    if (opts.pos) {
      var p = toVec3(opts.pos);
      m.position.copy(p);
    }
    if (opts.x !== undefined) m.position.x = Number(opts.x) || 0;
    if (opts.y !== undefined) m.position.y = Number(opts.y) || 0;
    if (opts.z !== undefined) m.position.z = Number(opts.z) || 0;
    if (opts.rot) {
      var rVec = toVec3(opts.rot);
      m.rotation.set(rVec.x, rVec.y, rVec.z);
    }
    if (opts.scale !== undefined) {
      if (typeof opts.scale === "number") {
        m.scale.setScalar(clampDim(opts.scale, 1));
      } else {
        var sv = toVec3(opts.scale, 1, 1, 1);
        m.scale.set(sv.x || 1, sv.y || 1, sv.z || 1);
      }
    }
    return m;
  }

  function makeLabelSprite(text, opts) {
    opts = normOpts(opts);
    var canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 128;
    var ctx = canvas.getContext("2d");
    var tex = new THREE.CanvasTexture(canvas);
    var mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    var sprite = new THREE.Sprite(mat);
    var scale = opts.scale || 1.8;
    sprite.scale.set(scale, scale * 0.25, 1);
    if (opts.pos) sprite.position.copy(toVec3(opts.pos));

    sprite.setText = function (newText) {
      var str = String(newText === undefined || newText === null ? "" : newText);
      if (!ctx) return sprite;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = opts.bg || "rgba(15, 23, 42, 0.86)";
      ctx.strokeStyle = opts.border || "rgba(56, 189, 248, 0.7)";
      ctx.lineWidth = 4;
      var pad = 16;
      var r = 24;
      var w = canvas.width - pad * 2;
      var h = canvas.height - pad * 2;
      ctx.beginPath();
      ctx.moveTo(pad + r, pad);
      ctx.lineTo(pad + w - r, pad);
      ctx.quadraticCurveTo(pad + w, pad, pad + w, pad + r);
      ctx.lineTo(pad + w, pad + h - r);
      ctx.quadraticCurveTo(pad + w, pad + h, pad + w - r, pad + h);
      ctx.lineTo(pad + r, pad + h);
      ctx.quadraticCurveTo(pad, pad + h, pad, pad + h - r);
      ctx.lineTo(pad, pad + r);
      ctx.quadraticCurveTo(pad, pad, pad + r, pad);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = opts.textColor || "#f8fafc";
      ctx.font = "bold 34px system-ui, -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(str.slice(0, 36), canvas.width / 2, canvas.height / 2);
      tex.needsUpdate = true;
      return sprite;
    };

    sprite.setText(text || "");
    return sprite;
  }

  function resolveContainer(container) {
    var el = null;
    if (typeof container === "string") {
      el =
        document.querySelector(container) ||
        document.getElementById(container.replace(/^#/, ""));
    } else if (container && container.nodeType === 1) {
      el = container;
    }
    if (!el) {
      el =
        document.querySelector("#stage, #sim-stage, #viewport, #canvas-container, .stage") ||
        document.querySelector("canvas");
    }
    if (!el) {
      el = document.createElement("div");
      el.id = "stage";
      el.style.cssText = "width:100%;height:380px;min-height:340px;position:relative;border-radius:12px;overflow:hidden;";
      if (document.body.firstChild) {
        document.body.insertBefore(el, document.body.firstChild);
      } else {
        document.body.appendChild(el);
      }
    }
    return el;
  }

  function create(container, opts) {
    opts = opts || {};
    var targetEl = resolveContainer(container);
    var isCanvas = targetEl.tagName === "CANVAS";
    var host = isCanvas ? targetEl.parentElement || document.body : targetEl;

    if (!isCanvas) {
      if (!targetEl.style.position) targetEl.style.position = "relative";
      if ((targetEl.clientHeight || 0) < 180) {
        targetEl.style.minHeight = "340px";
        if (!targetEl.style.height || targetEl.style.height === "0px") {
          targetEl.style.height = "380px";
        }
      }
    } else {
      if ((targetEl.clientHeight || 0) < 180) {
        targetEl.style.minHeight = "340px";
        targetEl.style.height = "380px";
      }
      targetEl.style.width = "100%";
      targetEl.style.display = "block";
    }

    var renderer = new THREE.WebGLRenderer(
      isCanvas ? { canvas: targetEl, antialias: true } : { antialias: true }
    );
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.dataset.simkit3d = "1";
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = isCanvas ? "380px" : "100%";
    renderer.domElement.style.touchAction = "none";
    if (!isCanvas) {
      targetEl.appendChild(renderer.domElement);
    }

    var scene = new THREE.Scene();
    scene.background = safeColor(opts.background !== undefined ? opts.background : 0x0f172a, 0x0f172a);

    var camera = new THREE.PerspectiveCamera(42, 16 / 10, 0.1, 500);
    var target = new THREE.Vector3(0, 0.8, 0);

    var hemi = new THREE.HemisphereLight(0xe2e8f0, 0x1e293b, 1.15);
    scene.add(hemi);
    var key = new THREE.DirectionalLight(0xffffff, 2.0);
    key.position.set(5, 9, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 35;
    var d = 8;
    key.shadow.camera.left = -d;
    key.shadow.camera.right = d;
    key.shadow.camera.top = d;
    key.shadow.camera.bottom = -d;
    key.shadow.bias = -0.0005;
    scene.add(key);
    var fill = new THREE.DirectionalLight(0x93c5fd, 0.65);
    fill.position.set(-6, 4, -5);
    scene.add(fill);

    if (opts.floor !== false) {
      var floor = new THREE.Mesh(
        new THREE.PlaneGeometry(32, 32),
        new THREE.MeshStandardMaterial({ color: 0x131d31, roughness: 0.92, metalness: 0.05 })
      );
      floor.rotation.x = -Math.PI / 2;
      floor.receiveShadow = true;
      floor.userData.__simkitFloor = true;
      scene.add(floor);
      var grid = new THREE.GridHelper(16, 16, 0x334155, 0x1e293b);
      grid.position.y = 0.004;
      grid.userData.__simkitFloor = true;
      scene.add(grid);
    }

    function resize() {
      var measureEl = isCanvas ? targetEl : host;
      var w = Math.max(280, (measureEl && measureEl.clientWidth) || 640);
      var h = Math.max(240, (measureEl && measureEl.clientHeight) || 380);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    if (typeof ResizeObserver !== "undefined" && host) {
      new ResizeObserver(resize).observe(host);
    }
    window.addEventListener("resize", resize);
    resize();

    var radius = opts.distance || 7.2;
    var theta = opts.theta !== undefined ? opts.theta : 0.65;
    var phi = opts.phi !== undefined ? opts.phi : 1.08;
    var drag = null;
    function placeCamera() {
      camera.position.set(
        target.x + radius * Math.sin(phi) * Math.sin(theta),
        target.y + radius * Math.cos(phi),
        target.z + radius * Math.sin(phi) * Math.cos(theta)
      );
      camera.lookAt(target);
    }
    placeCamera();

    var dom = renderer.domElement;
    dom.addEventListener("pointerdown", function (e) {
      drag = { x: e.clientX, y: e.clientY, pan: e.button === 2 || e.shiftKey };
      try {
        dom.setPointerCapture(e.pointerId);
      } catch (_) {}
    });
    dom.addEventListener("pointermove", function (e) {
      if (!drag) return;
      var dx = e.clientX - drag.x;
      var dy = e.clientY - drag.y;
      drag.x = e.clientX;
      drag.y = e.clientY;
      if (drag.pan) {
        var right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0).multiplyScalar(-dx * 0.008);
        var up = new THREE.Vector3(0, dy * 0.008, 0);
        target.add(right).add(up);
      } else {
        theta -= dx * 0.007;
        phi = Math.max(0.15, Math.min(Math.PI * 0.48, phi - dy * 0.007));
      }
      placeCamera();
    });
    var end = function () {
      drag = null;
    };
    dom.addEventListener("pointerup", end);
    dom.addEventListener("pointercancel", end);
    dom.addEventListener("contextmenu", function (e) {
      e.preventDefault();
    });
    dom.addEventListener(
      "wheel",
      function (e) {
        e.preventDefault();
        radius = Math.max(1.8, Math.min(40, radius * (e.deltaY > 0 ? 1.1 : 0.9)));
        placeCamera();
      },
      { passive: false }
    );
    var pinch = 0;
    dom.addEventListener(
      "touchstart",
      function (e) {
        if (e.touches.length === 2) {
          pinch = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
          );
        }
      },
      { passive: true }
    );
    dom.addEventListener(
      "touchmove",
      function (e) {
        if (e.touches.length === 2 && pinch > 0) {
          var d2 = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
          );
          if (d2 > 4) radius = Math.max(1.8, Math.min(40, radius * (pinch / d2)));
          pinch = d2;
          placeCamera();
        }
      },
      { passive: true }
    );

    var steps = [];
    var last = performance.now();
    var start = last;
    function tick(now) {
      requestAnimationFrame(tick);
      var dt = Math.min(0.05, (now - last) / 1000);
      var elapsed = (now - start) / 1000;
      last = now;
      for (var i = 0; i < steps.length; i++) {
        try {
          steps[i](dt, elapsed);
        } catch (_) {}
      }
      renderer.render(scene, camera);
    }
    requestAnimationFrame(tick);

    function add(m) {
      if (m) scene.add(m);
      return m;
    }

    var kit = {
      scene: scene,
      camera: camera,
      renderer: renderer,
      target: target,
      domElement: dom,
      box: function (w, h, d2, o, extraOpts) {
        return add(
          solid(
            new THREE.BoxGeometry(clampDim(w, 1), clampDim(h, 1), clampDim(d2, 1)),
            mergeColorOpts(o, extraOpts)
          )
        );
      },
      roundedBox: function (w, h, d2, a4, a5, a6) {
        var r = 0.08;
        var opts2 = {};
        if (a4 && typeof a4 === "object") {
          opts2 = a4;
        } else if (isColorValue(a4)) {
          if (typeof a5 === "number" && !isColorValue(a5)) {
            r = a5;
            opts2 = mergeColorOpts(a4, a6);
          } else {
            opts2 = mergeColorOpts(a4, a5 && typeof a5 === "object" ? a5 : a6);
          }
        } else if (typeof a4 === "number") {
          r = a4;
          opts2 = mergeColorOpts(a5, a6);
        } else {
          opts2 = mergeColorOpts(a4, a5);
        }
        w = clampDim(w, 1);
        h = clampDim(h, 1);
        d2 = clampDim(d2, 1);
        r = Math.min(Math.max(0.01, Number(r) || 0.08), w / 3, h / 3, d2 / 3);
        var s = new THREE.Shape();
        var hw = w / 2 - r;
        var hh = h / 2 - r;
        s.moveTo(-hw, -h / 2);
        s.lineTo(hw, -h / 2);
        s.quadraticCurveTo(w / 2, -h / 2, w / 2, -hh);
        s.lineTo(w / 2, hh);
        s.quadraticCurveTo(w / 2, h / 2, hw, h / 2);
        s.lineTo(-hw, h / 2);
        s.quadraticCurveTo(-w / 2, h / 2, -w / 2, hh);
        s.lineTo(-w / 2, -hh);
        s.quadraticCurveTo(-w / 2, -h / 2, -hw, -h / 2);
        var g = new THREE.ExtrudeGeometry(s, {
          depth: Math.max(0.01, d2 - r * 2),
          bevelEnabled: true,
          bevelThickness: r,
          bevelSize: r,
          bevelSegments: 3,
        });
        g.center();
        return add(solid(g, opts2));
      },
      cylinder: function (rTop, rBotOrH, hOrOpts, o, extraOpts) {
        var r1 = clampDim(rTop, 0.4);
        var r2 = r1;
        var h = 1;
        var opts2 = {};
        if (typeof hOrOpts === "number" && !isColorValue(hOrOpts) && hOrOpts <= 48 && (!o || typeof o === "object" || isColorValue(o))) {
          r2 = clampDim(rBotOrH, r1);
          h = clampDim(hOrOpts, 1);
          opts2 = mergeColorOpts(o, extraOpts);
        } else {
          h = clampDim(rBotOrH, 1);
          opts2 = mergeColorOpts(hOrOpts, o);
        }
        return add(solid(new THREE.CylinderGeometry(r1, r2, h, 36), opts2));
      },
      sphere: function (r, o, extraOpts) {
        return add(solid(new THREE.SphereGeometry(clampDim(r, 0.5), 32, 20), mergeColorOpts(o, extraOpts)));
      },
      cone: function (r, h, o, extraOpts) {
        return add(solid(new THREE.ConeGeometry(clampDim(r, 0.5), clampDim(h, 1), 32), mergeColorOpts(o, extraOpts)));
      },
      torus: function (r, tube, o, extraOpts) {
        return add(solid(new THREE.TorusGeometry(clampDim(r, 1), clampDim(tube, 0.2), 20, 48), mergeColorOpts(o, extraOpts)));
      },
      capsule: function (r, len, o, extraOpts) {
        var rad = clampDim(r, 0.3);
        var length = clampDim(len, 1);
        var geo = THREE.CapsuleGeometry
          ? new THREE.CapsuleGeometry(rad, length, 8, 20)
          : new THREE.CylinderGeometry(rad, rad, length + rad * 2, 28);
        return add(solid(geo, mergeColorOpts(o, extraOpts)));
      },
      plane: function (w, d2, o, extraOpts) {
        var opts2 = mergeColorOpts(o, extraOpts);
        opts2.doubleSided = true;
        var m = solid(new THREE.PlaneGeometry(clampDim(w, 4), clampDim(d2, 4)), opts2);
        return add(m);
      },
      ring: function (innerR, outerR, o, extraOpts) {
        var opts2 = mergeColorOpts(o, extraOpts);
        opts2.doubleSided = true;
        return add(solid(new THREE.RingGeometry(clampDim(innerR, 0.4), clampDim(outerR, 0.8), 36), opts2));
      },
      disc: function (r, o, extraOpts) {
        var opts2 = mergeColorOpts(o, extraOpts);
        opts2.doubleSided = true;
        return add(solid(new THREE.CircleGeometry(clampDim(r, 0.8), 36), opts2));
      },
      rod: function (from, to, r, o, extraOpts) {
        var rad = 0.06;
        var opts2 = {};
        if (r && typeof r === "object") {
          opts2 = r;
        } else if (isColorValue(r)) {
          opts2 = mergeColorOpts(r, o);
        } else {
          rad = clampDim(r, 0.06);
          opts2 = mergeColorOpts(o, extraOpts);
        }
        var mesh = solid(new THREE.CylinderGeometry(rad, rad, 1, 20), opts2);
        mesh.setEndpoints = function (a, b) {
          var va = toVec3(a, 0, 0, 0);
          var vb = toVec3(b, 0, 1, 0);
          var diff = vb.clone().sub(va);
          var len = Math.max(0.001, diff.length());
          mesh.position.copy(va).addScaledVector(diff, 0.5);
          mesh.scale.set(1, len, 1);
          mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), diff.normalize());
          return mesh;
        };
        mesh.setEndpoints(from, to);
        return add(mesh);
      },
      spring: function (from, to, coils, radius2, o) {
        if (coils && typeof coils === "object") {
          o = coils;
          coils = 10;
          radius2 = 0.18;
        } else if (radius2 && typeof radius2 === "object") {
          o = radius2;
          radius2 = 0.18;
        }
        var numCoils = Math.max(2, Number(coils) || 10);
        var sprR = Number(radius2) || 0.18;
        var wireR = (o && o.wireRadius) || sprR * 0.18;
        var grp = new THREE.Group();
        var innerMesh = null;
        grp.setEndpoints = function (a, b) {
          var va = toVec3(a, 0, 0, 0);
          var vb = toVec3(b, 0, 2, 0);
          var diff = vb.clone().sub(va);
          var len = Math.max(0.05, diff.length());
          var pts = [];
          var stepsCount = numCoils * 12;
          for (var i = 0; i <= stepsCount; i++) {
            var t = i / stepsCount;
            var ang = t * numCoils * Math.PI * 2;
            pts.push(new THREE.Vector3(Math.cos(ang) * sprR, t * len, Math.sin(ang) * sprR));
          }
          var curve = new THREE.CatmullRomCurve3(pts);
          var geo = new THREE.TubeGeometry(curve, stepsCount, wireR, 8, false);
          if (!innerMesh) {
            innerMesh = solid(geo, o);
            grp.add(innerMesh);
          } else {
            innerMesh.geometry.dispose();
            innerMesh.geometry = geo;
          }
          grp.position.copy(va);
          grp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), diff.normalize());
          return grp;
        };
        grp.setEndpoints(from, to);
        return add(grp);
      },
      arrow: function (from, to, o) {
        var opts2 = normOpts(o, 0xfbbf24);
        var grp = new THREE.Group();
        var shaftR = opts2.radius || 0.045;
        var headR = shaftR * 2.5;
        var headH = shaftR * 5.5;
        var shaft = solid(new THREE.CylinderGeometry(shaftR, shaftR, 1, 16), opts2);
        var head = solid(new THREE.ConeGeometry(headR, headH, 20), opts2);
        grp.add(shaft, head);
        grp.setPoints = function (a, b) {
          var va = toVec3(a, 0, 0, 0);
          var vb = toVec3(b, 1, 1, 0);
          var diff = vb.clone().sub(va);
          var len = diff.length();
          if (len < 0.02) {
            grp.visible = false;
            return grp;
          }
          grp.visible = true;
          var sLen = Math.max(0.02, len - headH);
          shaft.scale.set(1, sLen, 1);
          shaft.position.set(0, sLen / 2, 0);
          head.position.set(0, sLen + headH / 2, 0);
          grp.position.copy(va);
          grp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), diff.normalize());
          return grp;
        };
        grp.setDirection = function (origin, dir, len) {
          var vo = toVec3(origin, 0, 0, 0);
          var vd = toVec3(dir, 1, 0, 0).normalize();
          return grp.setPoints(vo, vo.clone().addScaledVector(vd, Number(len) || 1));
        };
        grp.setPoints(from || [0, 0.5, 0], to || [1, 1.5, 0]);
        return add(grp);
      },
      line: function (pts, o, extraOpts) {
        var opts2 = mergeColorOpts(o, extraOpts);
        var vecs = (Array.isArray(pts) && pts.length >= 2 ? pts : [[0, 0, 0], [1, 1, 0]]).map(function (p) {
          return toVec3(p);
        });
        var geo = new THREE.BufferGeometry().setFromPoints(vecs);
        var ln = new THREE.Line(
          geo,
          new THREE.LineBasicMaterial({
            color: safeColor(opts2.color, 0x38bdf8),
            transparent: opts2.opacity !== undefined && opts2.opacity < 1,
            opacity: opts2.opacity !== undefined ? opts2.opacity : 1,
          })
        );
        ln.setPoints = function (nextPts) {
          var nextVecs = (nextPts || []).map(function (p) {
            return toVec3(p);
          });
          if (nextVecs.length >= 2) {
            ln.geometry.dispose();
            ln.geometry = new THREE.BufferGeometry().setFromPoints(nextVecs);
          }
          return ln;
        };
        return add(ln);
      },
      tube: function (pts, r, o, extraOpts) {
        var rad = 0.06;
        var opts2 = {};
        if (r && typeof r === "object") {
          opts2 = r;
        } else if (isColorValue(r)) {
          opts2 = mergeColorOpts(r, o);
        } else {
          rad = clampDim(r, 0.06);
          opts2 = mergeColorOpts(o, extraOpts);
        }
        var vecs = (Array.isArray(pts) && pts.length >= 2 ? pts : [[0, 0, 0], [1, 1, 0]]).map(function (p) {
          return toVec3(p);
        });
        var curve = new THREE.CatmullRomCurve3(vecs);
        var segs = (opts2 && opts2.segments) || 48;
        var mesh = solid(new THREE.TubeGeometry(curve, segs, rad, 16, !!(opts2 && opts2.closed)), opts2);
        mesh.setPoints = function (nextPts) {
          var nv = (nextPts || []).map(function (p) {
            return toVec3(p);
          });
          if (nv.length >= 2) {
            var c2 = new THREE.CatmullRomCurve3(nv);
            mesh.geometry.dispose();
            mesh.geometry = new THREE.TubeGeometry(c2, segs, rad, 16, !!(opts2 && opts2.closed));
          }
          return mesh;
        };
        return add(mesh);
      },
      group: function () {
        var g = new THREE.Group();
        return add(g);
      },
      text: function (str, o) {
        return add(makeLabelSprite(str, o));
      },
      label: function (str, o) {
        return add(makeLabelSprite(str, o));
      },
      light: function (o) {
        var opts2 = normOpts(o, 0xffffff);
        var l = new THREE.PointLight(
          safeColor(opts2.color, 0xffffff),
          opts2.intensity !== undefined ? Number(opts2.intensity) : 1.5,
          opts2.distance !== undefined ? Number(opts2.distance) : 20
        );
        if (opts2.pos) l.position.copy(toVec3(opts2.pos));
        return add(l);
      },
      add: add,
      remove: function (m) {
        if (m) scene.remove(m);
      },
      clear: function () {
        var toRemove = [];
        scene.traverse(function (obj) {
          if (obj.parent === scene && !obj.isLight && !obj.userData.__simkitFloor) {
            toRemove.push(obj);
          }
        });
        for (var i = 0; i < toRemove.length; i++) scene.remove(toRemove[i]);
      },
      solid: solid,
      material: makeMaterial,
      lookAt: function (x, y, z, dist) {
        if (x && typeof x === "object") {
          target.copy(toVec3(x));
          if (typeof y === "number" && Number.isFinite(y) && y > 0.8) {
            radius = Math.min(40, y);
          }
        } else {
          target.set(Number(x) || 0, Number(y) || 0, Number(z) || 0);
          if (typeof dist === "number" && Number.isFinite(dist) && dist > 0.8) {
            radius = Math.min(40, dist);
          }
        }
        placeCamera();
      },
      fitCamera: function (pad) {
        var box = new THREE.Box3();
        var hasAny = false;
        scene.traverse(function (obj) {
          if (obj.isMesh && !obj.userData.__simkitFloor) {
            box.expandByObject(obj);
            hasAny = true;
          }
        });
        if (!hasAny || box.isEmpty()) return;
        var center = new THREE.Vector3();
        var size = new THREE.Vector3();
        box.getCenter(center);
        box.getSize(size);
        var maxExtent = Math.max(size.x, size.y, size.z, 1);
        var idealDist = Math.max(4.5, Math.min(34, maxExtent * (pad || 1.65)));
        target.copy(center);
        radius = idealDist;
        placeCamera();
      },
      resetCamera: function () {
        target.set(0, 0.8, 0);
        radius = opts.distance || 7.2;
        theta = opts.theta !== undefined ? opts.theta : 0.65;
        phi = opts.phi !== undefined ? opts.phi : 1.08;
        placeCamera();
      },
      onFrame: function (fn) {
        if (typeof fn === "function") steps.push(fn);
      },
    };

    trackedKits.push(kit);
    return kit;
  }

  // ============================================================================
  // Self-Healing 3D Lab Artifact & Slider Binding
  // Guarantees that even if an AI model's script crashes or leaves the stage
  // empty, the user sees a vivid, topic-grounded 3D artifact and working sliders.
  // ============================================================================
  function countUserMeshes(scene) {
    if (!scene) return 0;
    var count = 0;
    scene.traverse(function (o) {
      if ((o.isMesh || o.isLine || o.isSprite) && !o.userData.__simkitFloor) {
        count++;
      }
    });
    return count;
  }

  function findSliderLabel(inp, idx) {
    var id = inp.id || "";
    if (id) {
      var lbl = document.querySelector('label[for="' + id.replace(/"/g, "") + '"]');
      if (lbl && lbl.textContent) return lbl.textContent.trim();
    }
    var parentLbl = inp.closest("label");
    if (parentLbl && parentLbl.textContent) return parentLbl.textContent.trim();
    var prev = inp.previousElementSibling;
    if (prev && prev.textContent) return prev.textContent.trim();
    var parent = inp.parentElement;
    if (parent && parent.textContent) return parent.textContent.trim().slice(0, 40);
    return inp.name || id || "Parameter " + (idx + 1);
  }

  function syncSliderReadout(inp) {
    var val = Number(inp.value);
    var formatted = Number.isFinite(val) ? (Math.abs(val) >= 100 || Number.isInteger(val) ? String(val) : val.toFixed(2).replace(/\.?0+$/, "")) : inp.value;
    var next = inp.nextElementSibling;
    if (next && (next.tagName === "SPAN" || next.tagName === "OUTPUT" || next.tagName === "STRONG" || next.tagName === "B")) {
      var unitMatch = (next.textContent || "").match(/[a-zA-Z°%Ωµ/²³]+$/);
      next.textContent = formatted + (unitMatch ? " " + unitMatch[0] : "");
      return;
    }
    if (inp.id) {
      var suffixes = ["-val", "-value", "_val", "_value", "Val", "Value", "-out", "-readout", "-display"];
      for (var i = 0; i < suffixes.length; i++) {
        var el = document.getElementById(inp.id + suffixes[i]);
        if (el) {
          el.textContent = formatted;
          return;
        }
      }
    }
  }

  function getNormSliderValue(inp, fallback) {
    if (!inp) return fallback !== undefined ? fallback : 0.5;
    var min = inp.min !== "" ? Number(inp.min) : 0;
    var max = inp.max !== "" ? Number(inp.max) : 100;
    var val = Number(inp.value);
    if (!Number.isFinite(min)) min = 0;
    if (!Number.isFinite(max) || max <= min) max = min + 100;
    if (!Number.isFinite(val)) val = (min + max) / 2;
    return Math.max(0, Math.min(1, (val - min) / (max - min)));
  }

  function detectArchetype(text) {
    var s = (text || "").toLowerCase();
    if (/volt|current|ohm|resist|capacit|induct|circuit|led|diode|transistor|ampere|watt|charge|coulomb/.test(s)) {
      return "circuit";
    }
    if (/chem|react|molec|atom|ph\b|acid|alkali|molar|titrat|gas|boyle|charles|kelvin|pressure|temperat|catalyst|enthalp|bond/.test(s)) {
      return "chemistry";
    }
    if (/wave|freq|wavelength|amplitud|harmonic|oscill|sound|doppler|optic|lens|refract|diffract|pendulum|spring|hooke/.test(s)) {
      return "waves";
    }
    if (/cell|bio|organ|heart|neuron|dna|gene|enzyme|osmosis|photosynth|mitosis|respirat|ecolog/.test(s)) {
      return "biology";
    }
    return "physics";
  }

  function buildSelfHealingArtifact(kit, sliders) {
    var pageText = (document.title || "") + " " + (document.body ? document.body.innerText.slice(0, 800) : "");
    var archetype = detectArchetype(pageText);
    var titleEl = document.querySelector("h1, h2, .title");
    var titleStr = (titleEl && titleEl.textContent ? titleEl.textContent.trim() : document.title || "3D Interactive Lab").slice(0, 32);

    var hud = kit.label(titleStr, { pos: [0, 3.1, 0], scale: 2.6 });

    if (archetype === "circuit") {
      // 3D Circuit Bench with Battery, Variable Resistor, Glowing Bulb & Electron Flow
      kit.roundedBox(5.2, 0.16, 3.4, 0.06, { color: 0x1e293b, y: 0.08 });
      // Track rails
      kit.box(4.0, 0.06, 0.08, { color: 0x94a3b8, pos: [0, 0.2, -1.1] });
      kit.box(4.0, 0.06, 0.08, { color: 0x94a3b8, pos: [0, 0.2, 1.1] });
      kit.box(0.08, 0.06, 2.28, { color: 0x94a3b8, pos: [-2.0, 0.2, 0] });
      kit.box(0.08, 0.06, 2.28, { color: 0x94a3b8, pos: [2.0, 0.2, 0] });

      // Battery source on left
      var battery = kit.cylinder(0.38, 1.1, { color: 0xf59e0b, pos: [-2.0, 0.72, 0] });
      kit.cylinder(0.16, 0.15, { color: 0xe2e8f0, pos: [-2.0, 1.32, 0] });

      // Resistor in back
      var resistor = kit.capsule(0.24, 1.1, { color: 0xd6b88d, pos: [0, 0.42, -1.1] });
      resistor.rotation.z = Math.PI / 2;

      // Glowing load / lamp on right
      kit.cylinder(0.34, 0.3, { color: 0x475569, pos: [2.0, 0.32, 0] });
      var bulb = kit.sphere(0.52, { color: 0xfef08a, emissive: 0xfacc15, emissiveIntensity: 0.9, pos: [2.0, 0.92, 0] });
      var bulbLight = kit.light({ color: 0xfacc15, intensity: 2.2, distance: 8, pos: [2.0, 1.2, 0] });

      // Moving charge carriers around loop
      var electrons = [];
      for (var i = 0; i < 12; i++) {
        electrons.push(kit.sphere(0.09, { color: 0x38bdf8, emissive: 0x0284c7, emissiveIntensity: 0.8 }));
      }
      var phase = 0;
      kit.onFrame(function (dt) {
        var n0 = getNormSliderValue(sliders[0], 0.6);
        var n1 = getNormSliderValue(sliders[1], 0.4);
        var n2 = getNormSliderValue(sliders[2], 0.5);
        var currentSpeed = Math.max(0.15, (0.3 + n0 * 1.8) / (0.4 + n1 * 1.4));
        phase = (phase + dt * currentSpeed * 0.45) % 1;

        var glow = Math.min(2.5, currentSpeed * (0.6 + n2 * 0.7));
        bulb.scale.setScalar(0.85 + Math.min(0.45, glow * 0.18));
        if (bulb.material) bulb.material.emissiveIntensity = 0.25 + glow;
        bulbLight.intensity = 0.5 + glow * 1.8;
        resistor.scale.set(1, 0.7 + n1 * 0.8, 1);
        battery.scale.set(1, 0.8 + n0 * 0.5, 1);

        for (var k = 0; k < electrons.length; k++) {
          var p = (phase + k / electrons.length) % 1;
          var s = p * 4;
          var ex = 0, ez = 0;
          if (s < 1) { ex = -2 + s * 4; ez = -1.1; }
          else if (s < 2) { ex = 2; ez = -1.1 + (s - 1) * 2.2; }
          else if (s < 3) { ex = 2 - (s - 2) * 4; ez = 1.1; }
          else { ex = -2; ez = 1.1 - (s - 3) * 2.2; }
          electrons[k].position.set(ex, 0.28, ez);
        }
      });
    } else if (archetype === "chemistry") {
      // 3D Reaction Chamber with Burner Flame, Colliding Molecules & Piston
      kit.cylinder(1.5, 0.14, { color: 0x334155, pos: [0, 0.07, 0] });
      var flame = kit.cone(0.42, 0.75, { color: 0xf97316, emissive: 0xea580c, emissiveIntensity: 1.1, pos: [0, 0.48, 0] });
      var vessel = kit.cylinder(1.25, 2.2, { color: 0x38bdf8, opacity: 0.24, pos: [0, 1.75, 0] });
      var piston = kit.cylinder(1.18, 0.18, { color: 0x94a3b8, pos: [0, 2.6, 0] });
      var molecules = [];
      var colors = [0xef4444, 0x38bdf8, 0x22c55e, 0xa855f7, 0xfacc15];
      for (var m = 0; m < 18; m++) {
        var ang = (m / 18) * Math.PI * 2;
        molecules.push({
          mesh: kit.sphere(0.14, { color: colors[m % colors.length], emissive: colors[m % colors.length], emissiveIntensity: 0.35 }),
          x: Math.cos(ang) * 0.65,
          y: 1.1 + (m % 5) * 0.25,
          z: Math.sin(ang) * 0.65,
          vx: Math.cos(ang * 1.7) * 1.6,
          vy: (m % 2 === 0 ? 1 : -1) * 1.3,
          vz: Math.sin(ang * 1.7) * 1.6,
        });
      }
      kit.onFrame(function (dt, elapsed) {
        var tempN = getNormSliderValue(sliders[0], 0.55);
        var pressN = getNormSliderValue(sliders[1], 0.45);
        var concN = getNormSliderValue(sliders[2], 0.6);
        var topY = 2.65 - pressN * 0.75;
        piston.position.y = topY;
        flame.scale.set(0.7 + tempN * 0.7, 0.5 + tempN * 1.1 + Math.sin(elapsed * 14) * 0.08, 0.7 + tempN * 0.7);
        vessel.material.opacity = 0.18 + concN * 0.22;

        var speedMult = 0.4 + tempN * 2.4;
        var activeCount = Math.max(6, Math.round(6 + concN * 12));
        for (var j = 0; j < molecules.length; j++) {
          var mol = molecules[j];
          mol.mesh.visible = j < activeCount;
          mol.x += mol.vx * dt * speedMult;
          mol.y += mol.vy * dt * speedMult;
          mol.z += mol.vz * dt * speedMult;
          var rHoriz = Math.hypot(mol.x, mol.z);
          if (rHoriz > 0.95) {
            mol.vx = -mol.vx;
            mol.vz = -mol.vz;
            mol.x *= 0.92;
            mol.z *= 0.92;
          }
          if (mol.y < 0.85) { mol.y = 0.85; mol.vy = Math.abs(mol.vy); }
          if (mol.y > topY - 0.18) { mol.y = topY - 0.18; mol.vy = -Math.abs(mol.vy); }
          mol.mesh.position.set(mol.x, mol.y, mol.z);
        }
      });
    } else if (archetype === "waves") {
      // 3D Wave Lattice & Harmonic Oscillator
      kit.roundedBox(6.2, 0.14, 2.2, 0.05, { color: 0x1e293b, y: 0.07 });
      var nodes = [];
      var count = 24;
      for (var w = 0; w < count; w++) {
        var xPos = -2.6 + (w / (count - 1)) * 5.2;
        var sphere = kit.sphere(0.13, {
          color: w % 2 === 0 ? 0x38bdf8 : 0xa855f7,
          emissive: w % 2 === 0 ? 0x0284c7 : 0x7e22ce,
          emissiveIntensity: 0.45,
          pos: [xPos, 1.3, 0],
        });
        var stem = kit.cylinder(0.025, 1.2, { color: 0x475569, pos: [xPos, 0.65, 0] });
        nodes.push({ sphere: sphere, stem: stem, x: xPos });
      }
      var waveLine = kit.tube([[-2.6, 1.3, 0], [0, 1.3, 0], [2.6, 1.3, 0]], 0.04, { color: 0xfacc15 });
      kit.onFrame(function (dt, elapsed) {
        var amp = 0.2 + getNormSliderValue(sliders[0], 0.6) * 0.95;
        var freq = 0.8 + getNormSliderValue(sliders[1], 0.5) * 3.5;
        var kWave = 0.8 + getNormSliderValue(sliders[2], 0.5) * 2.2;
        var pts = [];
        for (var idx = 0; idx < nodes.length; idx++) {
          var nd = nodes[idx];
          var yVal = 1.35 + Math.sin(nd.x * kWave - elapsed * freq * 2.5) * amp;
          nd.sphere.position.y = yVal;
          nd.stem.scale.y = Math.max(0.1, yVal - 0.1);
          nd.stem.position.y = (yVal - 0.1) / 2 + 0.07;
          pts.push([nd.x, yVal, 0]);
        }
        waveLine.setPoints(pts);
      });
    } else if (archetype === "biology") {
      // 3D Interactive Cell / Organelle System
      var membrane = kit.sphere(1.65, { color: 0x10b981, opacity: 0.25, pos: [0, 1.65, 0] });
      var nucleus = kit.sphere(0.62, { color: 0x8b5cf6, emissive: 0x6d28d9, emissiveIntensity: 0.45, pos: [0, 1.65, 0] });
      var organelles = [];
      for (var b = 0; b < 10; b++) {
        var a1 = (b / 10) * Math.PI * 2;
        organelles.push({
          mesh: kit.capsule(0.12, 0.26, { color: b % 2 === 0 ? 0xf59e0b : 0x38bdf8, pos: [Math.cos(a1), 1.65, Math.sin(a1)] }),
          ang: a1,
          r: 0.95 + (b % 3) * 0.18,
          yOff: ((b % 3) - 1) * 0.35,
        });
      }
      kit.onFrame(function (dt, elapsed) {
        var n0 = getNormSliderValue(sliders[0], 0.5);
        var n1 = getNormSliderValue(sliders[1], 0.5);
        var n2 = getNormSliderValue(sliders[2], 0.5);
        var cellScale = 0.75 + n0 * 0.55;
        membrane.scale.setScalar(cellScale);
        nucleus.scale.setScalar(0.75 + n1 * 0.6);
        for (var q = 0; q < organelles.length; q++) {
          var org = organelles[q];
          var curA = org.ang + elapsed * (0.4 + n2 * 1.8);
          var rad = org.r * cellScale;
          org.mesh.position.set(
            Math.cos(curA) * rad,
            1.65 + org.yOff * cellScale + Math.sin(elapsed * 2 + q) * 0.1,
            Math.sin(curA) * rad
          );
          org.mesh.rotation.y = -curA;
        }
      });
    } else {
      // 3D Physics & Mechanics Lab Rig (Ramp / Pendulum / Force Vectors / Trajectory)
      kit.roundedBox(5.6, 0.14, 2.8, 0.05, { color: 0x1e293b, y: 0.07 });
      var pivotGrp = kit.group();
      pivotGrp.position.set(-2.0, 0.14, 0);
      var ramp = kit.solid(new THREE.BoxGeometry(3.2, 0.12, 1.2), { color: 0x475569 });
      ramp.position.set(1.6, 0.06, 0);
      pivotGrp.add(ramp);

      var block = kit.solid(new THREE.BoxGeometry(0.55, 0.42, 0.55), { color: 0x38bdf8, emissive: 0x0284c7, emissiveIntensity: 0.25 });
      pivotGrp.add(block);

      var forceArrow = kit.arrow([-1, 1, 0], [0, 1.8, 0], { color: 0xfacc15, radius: 0.05 });
      var velArrow = kit.arrow([-1, 1, 0], [0.5, 1.2, 0], { color: 0x22c55e, radius: 0.045 });
      var arcTube = kit.tube([[-2, 0.2, 0], [0, 1.5, 0], [2, 0.2, 0]], 0.035, { color: 0xf43f5e });

      kit.onFrame(function (dt, elapsed) {
        var n0 = getNormSliderValue(sliders[0], 0.5);
        var n1 = getNormSliderValue(sliders[1], 0.5);
        var n2 = getNormSliderValue(sliders[2], 0.5);
        var angleRad = (10 + n0 * 45) * (Math.PI / 180);
        pivotGrp.rotation.z = angleRad;

        var slideT = (Math.sin(elapsed * (1.2 + n1 * 2.2)) * 0.5 + 0.5);
        var distAlong = 0.5 + slideT * 2.2;
        block.position.set(distAlong, 0.33, 0);
        block.scale.setScalar(0.8 + n2 * 0.5);

        var worldPos = new THREE.Vector3();
        block.getWorldPosition(worldPos);
        var dir = new THREE.Vector3(Math.cos(angleRad), Math.sin(angleRad), 0);
        var normal = new THREE.Vector3(-Math.sin(angleRad), Math.cos(angleRad), 0);
        forceArrow.setDirection(worldPos, normal, 0.7 + n2 * 1.1);
        velArrow.setDirection(worldPos, dir, 0.6 + n1 * 1.3);

        // Parabolic trajectory preview
        var v0 = 3.2 + n1 * 3.5;
        var g = 9.81 * (0.5 + n2 * 0.8);
        var pts = [];
        for (var s = 0; s <= 20; s++) {
          var t = (s / 20) * ((2 * v0 * Math.sin(angleRad)) / g);
          var px = -2.0 + v0 * Math.cos(angleRad) * t;
          var py = Math.max(0.14, 0.25 + v0 * Math.sin(angleRad) * t - 0.5 * g * t * t);
          pts.push([Math.min(2.6, px), py, -0.85]);
        }
        arcTube.setPoints(pts);
      });
    }

    // Update floating 3D readout whenever any slider changes
    function updateHud() {
      if (!sliders.length) return;
      var parts = [];
      for (var i = 0; i < Math.min(3, sliders.length); i++) {
        var lbl = findSliderLabel(sliders[i], i).split(":")[0].replace(/\s+/g, " ").trim().slice(0, 10);
        parts.push((lbl || "P" + (i + 1)) + ": " + sliders[i].value);
      }
      hud.setText(parts.join("  |  "));
    }
    for (var s = 0; s < sliders.length; s++) {
      sliders[s].addEventListener("input", updateHud);
      sliders[s].addEventListener("change", updateHud);
    }
    updateHud();
  }

  function bindOrphanSlidersToScene(sliders, scene, renderer, camera) {
    var userMeshes = [];
    if (scene) {
      scene.traverse(function (o) {
        if (o.isMesh && !o.userData.__simkitFloor) {
          if (!o.userData.__baseScale) o.userData.__baseScale = o.scale.clone();
          if (!o.userData.__basePos) o.userData.__basePos = o.position.clone();
          if (!o.userData.__baseRot) o.userData.__baseRot = o.rotation.clone();
          userMeshes.push(o);
        }
      });
    }
    sliders.forEach(function (inp, idx) {
      inp.addEventListener("input", function () {
        syncSliderReadout(inp);
      });
      inp.addEventListener("change", function () {
        syncSliderReadout(inp);
      });
      if (!inputsWithListeners.has(inp) && userMeshes.length > 0) {
        inp.addEventListener("input", function () {
          var norm = getNormSliderValue(inp, 0.5);
          for (var i = 0; i < userMeshes.length; i++) {
            var m = userMeshes[i];
            if (idx % 3 === 0) {
              var factor = 0.6 + norm * 0.9;
              m.scale.set(
                m.userData.__baseScale.x * factor,
                m.userData.__baseScale.y * factor,
                m.userData.__baseScale.z * factor
              );
            } else if (idx % 3 === 1) {
              m.position.y = m.userData.__basePos.y + (norm - 0.5) * 1.2;
            } else {
              m.rotation.y = m.userData.__baseRot.y + (norm - 0.5) * Math.PI;
            }
          }
          if (renderer && scene && camera) {
            try {
              renderer.render(scene, camera);
            } catch (_) {}
          }
        });
      }
    });
  }

  function ensureLivingLab() {
    var sliders = Array.prototype.slice.call(document.querySelectorAll('input[type="range"]'));
    sliders.forEach(syncSliderReadout);

    // Check if any SimKit3D kit was created
    if (trackedKits.length > 0) {
      var primaryKit = trackedKits[0];
      var meshCount = countUserMeshes(primaryKit.scene);
      if (meshCount === 0) {
        buildSelfHealingArtifact(primaryKit, sliders);
      } else {
        bindOrphanSlidersToScene(sliders, primaryKit.scene, primaryKit.renderer, primaryKit.camera);
        // Auto-frame oversized or off-center models so nothing fills the viewport as a giant cropped mesh
        try {
          var box = new THREE.Box3();
          primaryKit.scene.traverse(function (o) {
            if (o.isMesh && !o.userData.__simkitFloor) box.expandByObject(o);
          });
          if (!box.isEmpty()) {
            var sz = new THREE.Vector3();
            box.getSize(sz);
            var ext = Math.max(sz.x, sz.y, sz.z);
            var camDist = primaryKit.camera ? primaryKit.camera.position.distanceTo(primaryKit.target || new THREE.Vector3()) : 7;
            if (ext > 6 || camDist < ext * 1.1) {
              primaryKit.fitCamera(1.65);
            }
          }
        } catch (_) {}
      }
      return;
    }

    // Check if a raw THREE.WebGLRenderer was used without SimKit3D
    if (trackedRenderers.length > 0) {
      var r = trackedRenderers[0];
      var meshCount2 = countUserMeshes(r.__lastScene);
      if (meshCount2 > 0) {
        bindOrphanSlidersToScene(sliders, r.__lastScene, r, r.__lastCamera);
        return;
      }
    }

    // Check if a 2D canvas or SVG with real content is present
    var svg = document.querySelector("#stage svg, .stage svg, main svg, svg:not([width='16']):not([width='20']):not([width='24'])");
    if (svg && svg.querySelectorAll("path, circle, rect, line, polygon, polyline").length > 3 && !scriptHadError) {
      return;
    }

    var stageEl = document.querySelector("#stage, #sim-stage, #viewport, #canvas-container, .stage, canvas");
    if (stageEl || scriptHadError) {
      // If it's a 2D canvas that already drew content and didn't error, keep it; otherwise heal into 3D
      if (stageEl && stageEl.tagName === "CANVAS" && !stageEl.dataset.simkit3d && !scriptHadError) {
        try {
          var ctx2d = stageEl.getContext("2d");
          if (ctx2d && stageEl.width > 10 && stageEl.height > 10) {
            var img = ctx2d.getImageData(0, 0, Math.min(64, stageEl.width), Math.min(64, stageEl.height)).data;
            var nonBlank = 0;
            var r0 = img[0], g0 = img[1], b0 = img[2], a0 = img[3];
            for (var p = 0; p < img.length; p += 16) {
              if (Math.abs(img[p] - r0) + Math.abs(img[p + 1] - g0) + Math.abs(img[p + 2] - b0) + Math.abs(img[p + 3] - a0) > 15) {
                nonBlank++;
              }
            }
            if (nonBlank > 4) return;
          }
        } catch (_) {}
      }
      var autoKit = create(stageEl);
      buildSelfHealingArtifact(autoKit, sliders);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      setTimeout(ensureLivingLab, 180);
      setTimeout(ensureLivingLab, 650);
    });
  } else {
    setTimeout(ensureLivingLab, 180);
    setTimeout(ensureLivingLab, 650);
  }

  window.SimKit3D = { create: create, solid: solid, material: makeMaterial };
})();
