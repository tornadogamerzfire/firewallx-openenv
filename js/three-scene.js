/**
 * FirewallXScene — the "Interception Scope".
 *
 * A shield built from a wireframe icosahedron floats in a void. Each time
 * the backend returns a prediction, a packet is launched from the edge of
 * the scene toward the shield:
 *   - allow   -> the packet passes clean through and exits the far side
 *   - block   -> the packet shatters into sparks on impact, shield flashes
 *   - sandbox -> the packet is caught, orbits the impact point, then fades
 *
 * No external dependencies beyond the vendored THREE global (js/vendor/three.min.js).
 */
const FirewallXScene = (() => {
  const COLOR = {
    signal: 0x4fd8e8,
    allow: 0x5eeaa0,
    sandbox: 0xf2b84b,
    block: 0xff5c72,
  };

  const SHIELD_RADIUS = 1.8;
  const LAUNCH_DIST = 5.5;

  function init(canvas) {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const motionScale = prefersReducedMotion ? 0.08 : 1;

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);

    // Orbit state (hand-rolled, no OrbitControls dependency)
    const spherical = { radius: 7.4, theta: 0.5, phi: 1.15 };
    const target = new THREE.Vector3(0, 0, 0);
    let dragging = false;
    let lastPointer = { x: 0, y: 0 };
    let autoRotate = !prefersReducedMotion;

    function syncCamera() {
      const phi = Math.min(Math.max(spherical.phi, 0.4), Math.PI - 0.4);
      camera.position.setFromSphericalCoords(spherical.radius, phi, spherical.theta);
      camera.position.add(target);
      camera.lookAt(target);
    }
    syncCamera();

    // ---- lighting (subtle; most materials are unlit/emissive-style) ----
    scene.add(new THREE.AmbientLight(0x223344, 1.2));
    const rim = new THREE.PointLight(0x4fd8e8, 1.2, 20);
    rim.position.set(3, 3, 4);
    scene.add(rim);

    // ---- starfield ----
    const starGeo = new THREE.BufferGeometry();
    const STAR_COUNT = 500;
    const starPos = new Float32Array(STAR_COUNT * 3);
    for (let i = 0; i < STAR_COUNT; i++) {
      const r = 20 + Math.random() * 30;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      starPos[i * 3 + 2] = r * Math.cos(phi);
    }
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    const starField = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ color: 0x3a4a5c, size: 0.05, sizeAttenuation: true })
    );
    scene.add(starField);

    // ---- shield: wireframe icosahedron + faint fill ----
    const shieldGroup = new THREE.Group();
    scene.add(shieldGroup);

    const icoGeo = new THREE.IcosahedronGeometry(SHIELD_RADIUS, 1);
    const edges = new THREE.EdgesGeometry(icoGeo);
    const shieldMat = new THREE.LineBasicMaterial({ color: COLOR.signal, transparent: true, opacity: 0.85 });
    const shieldWire = new THREE.LineSegments(edges, shieldMat);
    shieldGroup.add(shieldWire);

    const shieldFillMat = new THREE.MeshBasicMaterial({
      color: COLOR.signal,
      transparent: true,
      opacity: 0.035,
      side: THREE.DoubleSide,
    });
    const shieldFill = new THREE.Mesh(icoGeo, shieldFillMat);
    shieldGroup.add(shieldFill);

    // ---- core: small breathing nucleus ----
    const coreGeo = new THREE.IcosahedronGeometry(0.38, 2);
    const coreMat = new THREE.MeshBasicMaterial({ color: COLOR.signal, transparent: true, opacity: 0.9 });
    const core = new THREE.Mesh(coreGeo, coreMat);
    scene.add(core);

    // shield color flash state
    let flashColor = new THREE.Color(COLOR.signal);
    let flashTarget = new THREE.Color(COLOR.signal);
    let flashUntil = 0;

    function triggerFlash(hex, durationMs) {
      flashTarget = new THREE.Color(hex);
      flashUntil = performance.now() + durationMs;
    }

    // ---- active packets & particle bursts ----
    const packets = [];
    const bursts = [];

    function randomDirection() {
      // biased toward the camera-facing hemisphere so packets read as
      // "incoming" rather than spawning behind the shield out of view
      const theta = spherical.theta + (Math.random() - 0.5) * 1.6;
      const phi = Math.PI / 2 + (Math.random() - 0.5) * 1.4;
      const v = new THREE.Vector3();
      v.setFromSphericalCoords(1, phi, theta);
      return v;
    }

    function spawnBurst(position, hex, count, speed, life) {
      const group = new THREE.Group();
      const geo = new THREE.SphereGeometry(0.035, 6, 6);
      for (let i = 0; i < count; i++) {
        const mat = new THREE.MeshBasicMaterial({
          color: hex,
          transparent: true,
          opacity: 1,
          blending: THREE.AdditiveBlending,
        });
        const p = new THREE.Mesh(geo, mat);
        p.position.copy(position);
        const dir = new THREE.Vector3(
          Math.random() - 0.5,
          Math.random() - 0.5,
          Math.random() - 0.5
        ).normalize();
        p.userData.velocity = dir.multiplyScalar(speed * (0.5 + Math.random()));
        group.add(p);
      }
      scene.add(group);
      bursts.push({ group, born: performance.now(), life });
    }

    function launchPacket(decision, traffic) {
      const dir = randomDirection();
      const start = dir.clone().multiplyScalar(LAUNCH_DIST);
      const impact = dir.clone().multiplyScalar(SHIELD_RADIUS);

      const trafficHex = traffic === "attack" ? COLOR.block : COLOR.allow;
      const geo = new THREE.SphereGeometry(0.09, 12, 12);
      const mat = new THREE.MeshBasicMaterial({
        color: trafficHex,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(start);
      scene.add(mesh);

      packets.push({
        mesh,
        dir,
        start,
        impact,
        decision,
        phase: "approach",
        phaseStart: performance.now(),
      });
    }

    const APPROACH_MS = 650 * motionScale + (prefersReducedMotion ? 50 : 0);
    const PASS_MS = 500 * motionScale + (prefersReducedMotion ? 50 : 0);
    const ORBIT_MS = 900 * motionScale + (prefersReducedMotion ? 50 : 0);

    function easeInCubic(t) { return t * t * t; }
    function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

    function orbitBasis(normal) {
      const arbitrary = Math.abs(normal.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
      const u = new THREE.Vector3().crossVectors(normal, arbitrary).normalize();
      const v = new THREE.Vector3().crossVectors(normal, u).normalize();
      return { u, v };
    }

    function updatePackets(now) {
      for (let i = packets.length - 1; i >= 0; i--) {
        const p = packets[i];
        const elapsed = now - p.phaseStart;

        if (p.phase === "approach") {
          const t = Math.min(1, elapsed / APPROACH_MS);
          p.mesh.position.lerpVectors(p.start, p.impact, easeInCubic(t));
          if (t >= 1) {
            // arrived — branch by decision
            if (p.decision === "allow") {
              triggerFlash(COLOR.allow, 260);
              spawnBurst(p.impact, COLOR.allow, 6, 1.2, 400);
              p.phase = "pass";
              p.phaseStart = now;
              p.exit = p.dir.clone().multiplyScalar(-LAUNCH_DIST);
              p.mesh.material.color.setHex(COLOR.allow);
            } else if (p.decision === "block") {
              triggerFlash(COLOR.block, 320);
              spawnBurst(p.impact, COLOR.block, 20, 2.4, 650);
              scene.remove(p.mesh);
              p.mesh.geometry.dispose();
              p.mesh.material.dispose();
              packets.splice(i, 1);
              continue;
            } else {
              triggerFlash(COLOR.sandbox, 300);
              p.phase = "orbit";
              p.phaseStart = now;
              const normal = p.impact.clone().normalize();
              p.basis = orbitBasis(normal);
              p.mesh.material.color.setHex(COLOR.sandbox);
            }
          }
        } else if (p.phase === "pass") {
          const t = Math.min(1, elapsed / PASS_MS);
          p.mesh.position.lerpVectors(p.impact, p.exit, easeOutCubic(t));
          if (t > 0.6) p.mesh.material.opacity = 0.95 * (1 - (t - 0.6) / 0.4);
          if (t >= 1) {
            scene.remove(p.mesh);
            p.mesh.geometry.dispose();
            p.mesh.material.dispose();
            packets.splice(i, 1);
          }
        } else if (p.phase === "orbit") {
          const t = Math.min(1, elapsed / ORBIT_MS);
          const angle = t * Math.PI * 2 * 1.6;
          const radius = 0.35 * (1 - t * 0.85);
          const offset = p.basis.u.clone().multiplyScalar(Math.cos(angle) * radius)
            .add(p.basis.v.clone().multiplyScalar(Math.sin(angle) * radius));
          p.mesh.position.copy(p.impact).add(offset);
          if (t > 0.55) p.mesh.material.opacity = 0.95 * (1 - (t - 0.55) / 0.45);
          if (t >= 1) {
            scene.remove(p.mesh);
            p.mesh.geometry.dispose();
            p.mesh.material.dispose();
            packets.splice(i, 1);
          }
        }
      }
    }

    function updateBursts(now) {
      for (let i = bursts.length - 1; i >= 0; i--) {
        const b = bursts[i];
        const t = (now - b.born) / b.life;
        if (t >= 1) {
          b.group.children.forEach((p) => { p.geometry.dispose(); p.material.dispose(); });
          scene.remove(b.group);
          bursts.splice(i, 1);
          continue;
        }
        b.group.children.forEach((p) => {
          p.position.addScaledVector(p.userData.velocity, 0.016);
          p.material.opacity = 1 - t;
        });
      }
    }

    // ---- render loop ----
    const clock = new THREE.Clock();
    let raf = null;

    function frame() {
      raf = requestAnimationFrame(frame);
      const dt = clock.getDelta();
      const now = performance.now();

      if (autoRotate && !dragging) {
        spherical.theta += dt * 0.06;
      }
      syncCamera();

      if (!prefersReducedMotion) {
        core.scale.setScalar(1 + 0.08 * Math.sin(now * 0.0016));
        shieldGroup.rotation.y += dt * 0.05;
        starField.rotation.y += dt * 0.008;
      }

      // shield flash easing back to base signal color
      const flashRemaining = flashUntil - now;
      if (flashRemaining > 0) {
        const k = 1 - Math.max(0, flashRemaining) / 300;
        flashColor.copy(flashTarget);
        shieldMat.color.copy(flashColor);
        shieldFillMat.color.copy(flashColor);
        shieldMat.opacity = 0.85 + 0.15 * Math.sin(now * 0.05);
      } else {
        shieldMat.color.lerp(new THREE.Color(COLOR.signal), 0.06);
        shieldFillMat.color.lerp(new THREE.Color(COLOR.signal), 0.06);
        shieldMat.opacity = 0.85;
      }

      updatePackets(now);
      updateBursts(now);

      renderer.render(scene, camera);
    }
    frame();

    // ---- resize ----
    function resize() {
      const rect = canvas.parentElement.getBoundingClientRect();
      renderer.setSize(rect.width, rect.height, false);
      camera.aspect = rect.width / Math.max(1, rect.height);
      camera.updateProjectionMatrix();
    }
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas.parentElement);

    // ---- pointer drag-to-orbit ----
    function onPointerDown(e) {
      dragging = true;
      lastPointer = { x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
    }
    function onPointerMove(e) {
      if (!dragging) return;
      const dx = e.clientX - lastPointer.x;
      const dy = e.clientY - lastPointer.y;
      lastPointer = { x: e.clientX, y: e.clientY };
      spherical.theta -= dx * 0.005;
      spherical.phi -= dy * 0.005;
    }
    function onPointerUp(e) {
      dragging = false;
      try { canvas.releasePointerCapture(e.pointerId); } catch { /* noop */ }
    }
    function onWheel(e) {
      e.preventDefault();
      spherical.radius = Math.min(12, Math.max(4.2, spherical.radius + e.deltaY * 0.004));
    }

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    return {
      /** Call after a /predict response to animate the outcome. */
      reactToPrediction({ decision, traffic }) {
        launchPacket(decision, traffic);
      },
      dispose() {
        cancelAnimationFrame(raf);
        resizeObserver.disconnect();
        canvas.removeEventListener("pointerdown", onPointerDown);
        canvas.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        canvas.removeEventListener("wheel", onWheel);
        renderer.dispose();
      },
    };
  }

  return { init };
})();
