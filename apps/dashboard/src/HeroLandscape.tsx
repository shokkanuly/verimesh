import { useEffect, useRef } from 'react';
import * as THREE from 'three';

export function HeroLandscape({ paused }: { paused: boolean }) {
  const surfaceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch {
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setClearColor(0x060708, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    renderer.domElement.setAttribute('aria-hidden', 'true');
    surface.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x060708, 0.043);
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 90);
    camera.position.set(0, 7.6, 16.8);
    camera.lookAt(0, 2.5, -1);
    scene.add(new THREE.AmbientLight(0xc6d4ff, 0.8));
    const moonlight = new THREE.DirectionalLight(0xe5e8f0, 2.6);
    moonlight.position.set(-8, 8, -4);
    scene.add(moonlight);
    const blueLight = new THREE.PointLight(0x2f2fff, 65, 18, 1.7);
    blueLight.position.set(0, 1, 3);
    scene.add(blueLight);
    const edgeLight = new THREE.PointLight(0x7ea29e, 25, 15, 1.8);
    edgeLight.position.set(10, 3, 3);
    scene.add(edgeLight);

    // Two rolling banks leave a quiet valley for the product and headline.
    const elevation = (x: number, z: number) => {
      const bank = Math.pow(Math.min(Math.abs(x) / 10, 1), 1.7) * 3.1;
      return -2.7 + bank + Math.sin(x * 0.35 + z * 0.24) * 0.6
        + Math.cos(z * 0.46 - x * 0.15) * 0.45 + Math.sin(x * 0.8 + z * 0.55) * 0.12;
    };
    const terrainGeometry = new THREE.PlaneGeometry(52, 36, 180, 120);
    terrainGeometry.rotateX(-Math.PI / 2);
    const position = terrainGeometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      position.setY(i, elevation(position.getX(i), position.getZ(i)));
    }
    terrainGeometry.computeVertexNormals();
    const grain = new Uint8Array(128 * 128 * 4);
    for (let i = 0; i < grain.length; i += 4) {
      const value = 105 + Math.floor((Math.sin(i * 12.9898) * 43758.5453 % 1 + 1) * 43);
      grain[i] = grain[i + 1] = grain[i + 2] = value;
      grain[i + 3] = 255;
    }
    const terrainTexture = new THREE.DataTexture(grain, 128, 128);
    terrainTexture.wrapS = terrainTexture.wrapT = THREE.RepeatWrapping;
    terrainTexture.repeat.set(18, 14);
    terrainTexture.magFilter = THREE.LinearFilter;
    terrainTexture.needsUpdate = true;
    const terrainMaterial = new THREE.MeshStandardMaterial({ color: 0x343942, roughness: 0.94, metalness: 0.2, bumpMap: terrainTexture, bumpScale: 0.13 });
    scene.add(new THREE.Mesh(terrainGeometry, terrainMaterial));

    const contourPositions: number[] = [];
    for (let z = -16; z < 16; z += 0.62) {
      for (let x = -25; x < 25; x += 0.25) {
        contourPositions.push(x, elevation(x, z) + 0.025, z, x + 0.25, elevation(x + 0.25, z) + 0.025, z);
      }
    }
    const contourGeometry = new THREE.BufferGeometry();
    contourGeometry.setAttribute('position', new THREE.Float32BufferAttribute(contourPositions, 3));
    scene.add(new THREE.LineSegments(contourGeometry, new THREE.LineBasicMaterial({ color: 0x8492b7, transparent: true, opacity: 0.13 })));

    const gate = new THREE.Group();
    const gateMaterial = new THREE.MeshStandardMaterial({ color: 0xb7bdcd, roughness: 0.3, metalness: 0.8 });
    const pillarGeometry = new THREE.BoxGeometry(0.35, 2.1, 0.42);
    [-0.74, 0.74].forEach((x) => {
      const pillar = new THREE.Mesh(pillarGeometry, gateMaterial);
      pillar.position.x = x;
      gate.add(pillar);
    });
    const crossbarGeometry = new THREE.BoxGeometry(1.48, 0.13, 0.25);
    gate.add(new THREE.Mesh(crossbarGeometry, gateMaterial));
    const discGeometry = new THREE.CylinderGeometry(0.27, 0.27, 0.12, 40);
    discGeometry.rotateX(Math.PI / 2);
    const discMaterial = new THREE.MeshBasicMaterial({ color: 0x2f2fff, toneMapped: false });
    gate.add(new THREE.Mesh(discGeometry, discMaterial));
    gate.position.set(-6, -0.6, 1.8);
    gate.rotation.y = 0.3;
    gate.scale.setScalar(1.5);
    scene.add(gate);

    const packetGeometry = new THREE.BoxGeometry(0.35, 0.35, 0.35);
    const packetMaterial = new THREE.MeshStandardMaterial({ color: 0x7179b4, emissive: 0x2f2fff, emissiveIntensity: 0.12, roughness: 0.4, metalness: 0.65 });
    const packets = [0, 1, 2, 3].map((index) => {
      const packet = new THREE.Mesh(packetGeometry, packetMaterial);
      packet.position.set(5.2 + index * 0.85, -0.25 + index * 0.18, 1.4 - index * 0.55);
      packet.rotation.set(0.2, index * 0.6, 0.2);
      scene.add(packet);
      return packet;
    });
    const railGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(3.8, -1.5, 5), new THREE.Vector3(6.5, -0.8, 1), new THREE.Vector3(9, -0.6, -4),
    ]);
    scene.add(new THREE.Line(railGeometry, new THREE.LineBasicMaterial({ color: 0x2f2fff, transparent: true, opacity: 0.55 })));

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let visible = true;
    let frame = 0;
    let elapsed = 0;
    let lastPaint = 0;
    let pointerX = 0;
    let pointerY = 0;
    let cameraOffset = 0;
    let cameraVertical = 0;
    let scrollOffset = 0;
    let compact = false;
    const paint = () => renderer.render(scene, camera);
    const animate = (now: number) => {
      frame = 0;
      if (!visible || document.hidden || reduced.matches || paused) return;
      if (now - lastPaint >= 1000 / 30) {
        elapsed += Math.min(now - lastPaint, 50) / 1000;
        lastPaint = now;
        cameraOffset += (pointerX - cameraOffset) * 0.045;
        cameraVertical += (pointerY - cameraVertical) * 0.045;
        camera.position.x = cameraOffset;
        camera.position.y = 7.6 + cameraVertical + scrollOffset;
        camera.lookAt(0, 2.5, -1);
        gate.rotation.y = 0.3 + Math.sin(elapsed * 0.3) * 0.17;
        packets.forEach((packet, index) => {
          packet.position.y = (compact ? 2.35 + index * 0.05 : -0.25 + index * 0.18) + Math.sin(elapsed * 0.65 + index) * 0.14;
          packet.rotation.y = index * 0.6 + elapsed * 0.15;
        });
        paint();
      }
      frame = requestAnimationFrame(animate);
    };
    const synchronize = () => {
      cancelAnimationFrame(frame);
      paint();
      if (visible && !document.hidden && !reduced.matches && !paused) {
        lastPaint = performance.now();
        frame = requestAnimationFrame(animate);
      }
    };
    const resize = () => {
      const { width, height } = surface.getBoundingClientRect();
      if (!width || !height) return;
      compact = width < 640;
      camera.aspect = width / height;
      camera.position.z = compact ? 21 : 16.8;
      gate.position.x = compact ? -1.55 : -6;
      gate.position.y = compact ? 3.15 : -0.6;
      gate.scale.setScalar(compact ? 0.45 : 1.5);
      packets.forEach((packet, index) => {
        packet.position.x = compact ? 1.25 + index * 0.23 : 5.2 + index * 0.85;
        packet.position.y = compact ? 2.35 + index * 0.05 : -0.25 + index * 0.18;
        packet.position.z = compact ? -1.5 - index * 0.3 : 1.4 - index * 0.55;
        packet.scale.setScalar(compact ? 0.35 : 1);
      });
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      synchronize();
    };
    const pointerMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || reduced.matches) return;
      pointerX = (event.clientX / window.innerWidth - 0.5) * 0.7;
      pointerY = (event.clientY / window.innerHeight - 0.5) * 0.3;
    };
    const pointerLeave = () => { pointerX = 0; pointerY = 0; };
    const scroll = () => { scrollOffset = Math.min(window.scrollY / 1500, 0.5); };
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; synchronize(); });
    const resizeObserver = new ResizeObserver(resize);
    observer.observe(surface);
    resizeObserver.observe(surface);
    reduced.addEventListener('change', synchronize);
    document.addEventListener('visibilitychange', synchronize);
    window.addEventListener('pointermove', pointerMove, { passive: true });
    window.addEventListener('scroll', scroll, { passive: true });
    document.documentElement.addEventListener('pointerleave', pointerLeave);
    resize();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      resizeObserver.disconnect();
      reduced.removeEventListener('change', synchronize);
      document.removeEventListener('visibilitychange', synchronize);
      window.removeEventListener('pointermove', pointerMove);
      window.removeEventListener('scroll', scroll);
      document.documentElement.removeEventListener('pointerleave', pointerLeave);
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
      renderer.dispose();
      terrainTexture.dispose();
      renderer.domElement.remove();
    };
  }, [paused]);

  return <div className="home-landscape" ref={surfaceRef} aria-hidden="true" />;
}
