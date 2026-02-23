/**
 * Ryzm Terminal — 3D Globe Effect
 * A rotating wireframe globe with glowing data points representing
 * worldwide crypto market activity. Uses Three.js.
 *
 * Usage:
 *   RyzmGlobe.init('#container-id', { size: 'large' | 'small' });
 *   RyzmGlobe.destroy('#container-id');
 */
const RyzmGlobe = (() => {
  'use strict';

  const instances = new Map();

  /* ── Crypto exchange / market city coordinates [lat, lon] ── */
  const MARKET_NODES = [
    { lat: 37.5665, lon: 126.978, label: 'Seoul',      color: 0xc9a96e }, // KRX / Upbit
    { lat: 35.6762, lon: 139.6503, label: 'Tokyo',     color: 0x00e5ff },
    { lat: 22.3193, lon: 114.1694, label: 'Hong Kong',  color: 0x00e5ff },
    { lat: 1.3521,  lon: 103.8198, label: 'Singapore',  color: 0x00e5ff },
    { lat: 40.7128, lon: -74.006, label: 'New York',    color: 0x00e5ff },
    { lat: 37.7749, lon: -122.4194, label: 'San Fran',  color: 0x00e5ff },
    { lat: 51.5074, lon: -0.1278, label: 'London',      color: 0xc9a96e },
    { lat: 47.3769, lon: 8.5417, label: 'Zurich',       color: 0x00e5ff },
    { lat: 55.7558, lon: 37.6176, label: 'Moscow',      color: 0x00e5ff },
    { lat: -23.5505, lon: -46.6333, label: 'São Paulo',  color: 0x00e5ff },
    { lat: 25.276,  lon: 55.2963, label: 'Dubai',       color: 0xc9a96e },
    { lat: 19.076,  lon: 72.8777, label: 'Mumbai',      color: 0x00e5ff },
    { lat: -33.8688, lon: 151.2093, label: 'Sydney',    color: 0x00e5ff },
    { lat: 52.52,   lon: 13.405, label: 'Berlin',       color: 0x00e5ff },
    { lat: 13.7563, lon: 100.5018, label: 'Bangkok',    color: 0x00e5ff },
    { lat: 39.9042, lon: 116.4074, label: 'Beijing',    color: 0x00e5ff },
  ];

  /* ── Lat/Lon → Sphere XYZ ── */
  function latLonToVec3(lat, lon, radius) {
    const phi   = (90 - lat) * (Math.PI / 180);
    const theta = (lon + 180) * (Math.PI / 180);
    return new THREE.Vector3(
      -(radius * Math.sin(phi) * Math.cos(theta)),
       (radius * Math.cos(phi)),
       (radius * Math.sin(phi) * Math.sin(theta))
    );
  }

  /* ── Create arc curve between two points on sphere ── */
  function createArc(p1, p2, radius) {
    const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
    mid.normalize().multiplyScalar(radius * 1.25);
    const curve = new THREE.QuadraticBezierCurve3(p1, mid, p2);
    return curve.getPoints(32);
  }

  /* ── Main init ── */
  function init(containerSelector, opts = {}) {
    const container = typeof containerSelector === 'string'
      ? document.querySelector(containerSelector)
      : containerSelector;
    if (!container || instances.has(container)) return;
    if (typeof THREE === 'undefined') return;

    const isLarge  = opts.size === 'large';
    const width    = container.clientWidth  || 500;
    const height   = container.clientHeight || 500;

    /* ── Scene ── */
    const scene    = new THREE.Scene();
    const camera   = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.z = isLarge ? 2.8 : 3.2;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    /* ── Globe wireframe sphere ── */
    const GLOBE_RADIUS = 1;
    const globeGeo  = new THREE.SphereGeometry(GLOBE_RADIUS, 48, 48);
    const globeMat  = new THREE.MeshBasicMaterial({
      color: 0xc9a96e,
      wireframe: true,
      transparent: true,
      opacity: 0.08,
    });
    const globe = new THREE.Mesh(globeGeo, globeMat);
    scene.add(globe);

    /* ── Inner glow sphere ── */
    const glowGeo = new THREE.SphereGeometry(GLOBE_RADIUS * 0.98, 32, 32);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0x0a0a12,
      transparent: true,
      opacity: 0.6,
    });
    scene.add(new THREE.Mesh(glowGeo, glowMat));

    /* ── Latitude / Longitude rings ── */
    const ringGroup = new THREE.Group();
    const ringMat = new THREE.LineBasicMaterial({
      color: 0xc9a96e,
      transparent: true,
      opacity: 0.04,
    });
    // Latitude rings
    for (let lat = -60; lat <= 60; lat += 30) {
      const pts = [];
      for (let lon = 0; lon <= 360; lon += 5) {
        pts.push(latLonToVec3(lat, lon, GLOBE_RADIUS * 1.002));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      ringGroup.add(new THREE.Line(geo, ringMat));
    }
    // Longitude rings
    for (let lon = 0; lon < 360; lon += 30) {
      const pts = [];
      for (let lat = -90; lat <= 90; lat += 5) {
        pts.push(latLonToVec3(lat, lon, GLOBE_RADIUS * 1.002));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      ringGroup.add(new THREE.Line(geo, ringMat));
    }
    scene.add(ringGroup);

    /* ── Data points (market nodes) ── */
    const nodeGroup = new THREE.Group();
    const positions = [];
    MARKET_NODES.forEach(node => {
      const pos = latLonToVec3(node.lat, node.lon, GLOBE_RADIUS * 1.01);
      positions.push({ pos, color: node.color, label: node.label });

      // Outer ring
      const ringGeo = new THREE.RingGeometry(0.018, 0.025, 16);
      const ringMat2 = new THREE.MeshBasicMaterial({
        color: node.color,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat2);
      ring.position.copy(pos);
      ring.lookAt(0, 0, 0);
      nodeGroup.add(ring);

      // Inner dot
      const dotGeo = new THREE.CircleGeometry(0.012, 12);
      const dotMat = new THREE.MeshBasicMaterial({
        color: node.color,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
      });
      const dot = new THREE.Mesh(dotGeo, dotMat);
      dot.position.copy(pos);
      dot.lookAt(0, 0, 0);
      nodeGroup.add(dot);

      // Pulse ring (animated)
      const pulseGeo = new THREE.RingGeometry(0.01, 0.035, 16);
      const pulseMat = new THREE.MeshBasicMaterial({
        color: node.color,
        transparent: true,
        opacity: 0.4,
        side: THREE.DoubleSide,
      });
      const pulse = new THREE.Mesh(pulseGeo, pulseMat);
      pulse.position.copy(pos);
      pulse.lookAt(0, 0, 0);
      pulse.userData.isPulse = true;
      pulse.userData.phase = Math.random() * Math.PI * 2;
      nodeGroup.add(pulse);
    });
    scene.add(nodeGroup);

    /* ── Connection arcs between random pairs ── */
    const arcGroup = new THREE.Group();
    const arcPairs = [
      [0, 3], [0, 4], [1, 6], [3, 10], [4, 6], [7, 11],
      [2, 12], [5, 8], [9, 6], [13, 1], [14, 2], [15, 0],
    ];
    const arcMeshes = [];
    arcPairs.forEach(([i, j]) => {
      if (!positions[i] || !positions[j]) return;
      const pts = createArc(positions[i].pos, positions[j].pos, GLOBE_RADIUS);
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({
        color: 0xc9a96e,
        transparent: true,
        opacity: 0.12,
      });
      const line = new THREE.Line(geo, mat);
      line.userData.phase = Math.random() * Math.PI * 2;
      arcMeshes.push(line);
      arcGroup.add(line);
    });
    scene.add(arcGroup);

    /* ── Ambient particles around globe ── */
    const particleCount = isLarge ? 300 : 150;
    const particleGeo = new THREE.BufferGeometry();
    const pPositions = new Float32Array(particleCount * 3);
    const pSizes = new Float32Array(particleCount);
    for (let i = 0; i < particleCount; i++) {
      const r = GLOBE_RADIUS * (1.1 + Math.random() * 0.8);
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      pPositions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      pPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pPositions[i * 3 + 2] = r * Math.cos(phi);
      pSizes[i] = 1.0 + Math.random() * 2.0;
    }
    particleGeo.setAttribute('position', new THREE.BufferAttribute(pPositions, 3));
    particleGeo.setAttribute('size', new THREE.BufferAttribute(pSizes, 1));
    const particleMat = new THREE.PointsMaterial({
      color: 0xc9a96e,
      size: 0.008,
      transparent: true,
      opacity: 0.35,
      sizeAttenuation: true,
    });
    const particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);

    /* ── Outer atmosphere ring ── */
    const atmosGeo = new THREE.TorusGeometry(GLOBE_RADIUS * 1.15, 0.003, 8, 128);
    const atmosMat = new THREE.MeshBasicMaterial({
      color: 0xc9a96e,
      transparent: true,
      opacity: 0.12,
    });
    const atmos = new THREE.Mesh(atmosGeo, atmosMat);
    atmos.rotation.x = Math.PI / 2.2;
    scene.add(atmos);

    const atmos2 = new THREE.Mesh(
      new THREE.TorusGeometry(GLOBE_RADIUS * 1.22, 0.002, 8, 128),
      new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.06 })
    );
    atmos2.rotation.x = Math.PI / 1.8;
    atmos2.rotation.y = 0.3;
    scene.add(atmos2);

    /* ── Animation loop ── */
    let frameId = null;
    let time = 0;
    const rotateSpeed = isLarge ? 0.0008 : 0.0005;

    function animate() {
      frameId = requestAnimationFrame(animate);
      time += 0.016;

      // Rotate globe group
      globe.rotation.y      += rotateSpeed;
      ringGroup.rotation.y  += rotateSpeed;
      nodeGroup.rotation.y  += rotateSpeed;
      arcGroup.rotation.y   += rotateSpeed;
      particles.rotation.y  += rotateSpeed * 0.5;

      // Pulse data points
      nodeGroup.children.forEach(child => {
        if (child.userData.isPulse) {
          const t = Math.sin(time * 1.5 + child.userData.phase);
          const s = 1 + t * 0.5;
          child.scale.set(s, s, s);
          child.material.opacity = 0.15 + t * 0.15;
        }
      });

      // Animate arcs opacity
      arcMeshes.forEach(arc => {
        const t = Math.sin(time * 0.8 + arc.userData.phase);
        arc.material.opacity = 0.06 + t * 0.06;
      });

      // Subtle atmosphere rotation
      atmos.rotation.z  += 0.0003;
      atmos2.rotation.z -= 0.0002;

      renderer.render(scene, camera);
    }
    animate();

    /* ── Resize handling ── */
    function onResize() {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }
    window.addEventListener('resize', onResize);

    /* ── Mouse parallax (landing page only) ── */
    let mouseX = 0, mouseY = 0;
    function onMouseMove(e) {
      mouseX = (e.clientX / window.innerWidth - 0.5) * 0.3;
      mouseY = (e.clientY / window.innerHeight - 0.5) * 0.3;
    }
    if (isLarge) {
      window.addEventListener('mousemove', onMouseMove);
      const applyParallax = () => {
        requestAnimationFrame(applyParallax);
        camera.position.x += (mouseX - camera.position.x) * 0.02;
        camera.position.y += (-mouseY - camera.position.y) * 0.02;
        camera.lookAt(scene.position);
      };
      applyParallax();
    }

    /* ── Store instance for cleanup ── */
    instances.set(container, {
      renderer, scene, camera, frameId,
      onResize, onMouseMove, isLarge,
    });
  }

  /* ── Cleanup ── */
  function destroy(containerSelector) {
    const container = typeof containerSelector === 'string'
      ? document.querySelector(containerSelector)
      : containerSelector;
    if (!container || !instances.has(container)) return;

    const inst = instances.get(container);
    cancelAnimationFrame(inst.frameId);
    window.removeEventListener('resize', inst.onResize);
    if (inst.isLarge) window.removeEventListener('mousemove', inst.onMouseMove);
    inst.renderer.dispose();
    if (inst.renderer.domElement.parentNode) {
      inst.renderer.domElement.parentNode.removeChild(inst.renderer.domElement);
    }
    instances.delete(container);
  }

  return { init, destroy };
})();
