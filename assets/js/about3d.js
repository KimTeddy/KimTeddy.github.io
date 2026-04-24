// about3d.js — 3D Architecture for Home IoT Section
(function () {
  const container = document.getElementById('iot-3d-container');
  if (!container || typeof THREE === 'undefined') return;

  const accentColor = 0x00e5a0;
  const wallColor = 0x333344;
  const floorColor = 0x111118;

  let scene, camera, renderer, controls;
  let raycaster, mouse;
  let nodes = [];
  let connectionLines = [];
  let hoveredNode = null;
  let mainGroup; // Group to tilt for gyro parallax
  let gyroX = 0, gyroY = 0;
  let targetGyroX = 0, targetGyroY = 0;


  const hud = document.getElementById('iot-hud');
  const hudTitle = document.getElementById('iot-hud-title');
  const hudDesc = document.getElementById('iot-hud-desc');

  init();
  animate();

  function init() {
    // 1. Scene setup
    scene = new THREE.Scene();
    // Add very subtle fog that starts much further away
    scene.fog = new THREE.Fog(floorColor, 25, 80);

    // 2. Camera setup
    camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 200);
    camera.position.set(0, 15, 20);

    // 3. Renderer setup
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    // 4. Controls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enableZoom = true;
    controls.enablePan = true;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.5;
    controls.maxPolarAngle = Math.PI / 2 - 0.1;

    // Map Middle click to Zoom (Dolly)
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN
    };

    // Only allow zoom with Shift key on desktop
    renderer.domElement.addEventListener('wheel', (e) => {
      if (!e.shiftKey) {
        e.stopImmediatePropagation();
      }
    }, true);

    // 5. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.9); // Increased brightness
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(10, 20, 10);
    scene.add(dirLight);

    // 6. Environment Grid / Floor
    const gridHelper = new THREE.GridHelper(40, 40, accentColor, 0x444455);
    gridHelper.position.y = -0.1;
    gridHelper.material.opacity = 0.2;
    gridHelper.material.transparent = true;
    scene.add(gridHelper);

    // 7. Create Rooms and Nodes
    mainGroup = new THREE.Group();
    scene.add(mainGroup);

    createRooms();
    fetchIotNodes();


    // 8. Interaction Setup
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();
    renderer.domElement.addEventListener('pointermove', onMouseMove);
    renderer.domElement.style.touchAction = 'none';

    window.addEventListener('resize', onWindowResize);

    // Add click handler for nodes with links
    let startX = 0;
    let startY = 0;
    renderer.domElement.addEventListener('pointerdown', (e) => {
      startX = e.clientX;
      startY = e.clientY;
      onMouseMove(e); // Ensure node is detected on touch start for mobile
    });

    renderer.domElement.addEventListener('pointerup', (e) => {
      const dist = Math.hypot(e.clientX - startX, e.clientY - startY);
      // If pointer moved less than 10 pixels, it's a click, not a drag (adjusted for mobile)
      if (dist < 10 && hoveredNode && hoveredNode.userData.link) {
        window.open(hoveredNode.userData.link, '_blank');
      }
    });

    // Scroll zoom effect (cinematic)
    window.addEventListener('scroll', onScroll);

    // 9. Add minimalist control hint
    const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;
    const controlHint = document.createElement('div');
    controlHint.id = 'iot-control-hint';

    if (isTouchDevice) {
      controlHint.innerHTML = `
        <div class="control-hint-mobile">
          Rotate: <span class="key">1-Finger</span> <span class="sep">|</span> Pan: <span class="key">3-Finger</span> <span class="sep">|</span> Zoom: <span class="key">Pinch</span>
          <button id="gyro-btn" class="key" style="margin-left: 10px; cursor: pointer; border: 1px solid var(--accent-primary); background: rgba(0, 229, 160, 0.1); color: var(--accent-primary); font-size: inherit; font-family: inherit; border-radius: 4px; padding: 0 6px;">📳 Motion</button>
        </div>
      `;
    } else {
      controlHint.innerHTML = `
        <div class="control-hint-desktop">
          <span>Rotate: <span class="key">L-Drag</span></span>
          <span class="sep">|</span>
          <span>Pan: <span class="key">R-Drag</span></span>
          <span class="sep">|</span>
          <span>Zoom: <span class="key">Shift+Scroll</span></span>
        </div>
      `;
    }

    Object.assign(controlHint.style, {
      position: 'absolute',
      bottom: 'var(--space-6)',
      right: 'var(--space-6)',
      padding: 'var(--space-2) var(--space-4)',
      background: 'rgba(10, 10, 15, 0.6)',
      backdropFilter: 'blur(10px)',
      webkitBackdropFilter: 'blur(10px)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      borderRadius: 'var(--radius-full)',
      color: 'rgba(255, 255, 255, 0.7)',
      fontSize: 'var(--text-xs)',
      fontFamily: 'var(--font-mono)',
      pointerEvents: 'none',
      zIndex: '10',
      opacity: '0',
      transition: 'opacity 0.5s ease, transform 0.5s ease',
      transform: 'translateY(10px)'
    });
    container.appendChild(controlHint);

    // 10. Add Gallery Link Badge (Actual Night View)
    const galleryLink = document.createElement('a');
    galleryLink.href = 'https://blog.naver.com/teddy_02/222859866355'; // Example link based on YAML, replace if needed
    galleryLink.target = '_blank';
    galleryLink.id = 'iot-gallery-link';
    galleryLink.innerHTML = `
      <div class="gallery-badge">
        <span class="icon">📸</span>
        <span class="text">실제 스마트 홈 야경 보기</span>
        <span class="arrow">↗</span>
      </div>
    `;
    Object.assign(galleryLink.style, {
      position: 'absolute',
      top: 'var(--space-6)',
      right: 'var(--space-6)',
      textDecoration: 'none',
      zIndex: '15',
      opacity: '0',
      transition: 'opacity 0.8s ease, transform 0.8s ease',
      transform: 'translateY(-10px)'
    });
    container.appendChild(galleryLink);

    // Gyroscope Setup
    const gyroBtn = controlHint.querySelector('#gyro-btn');
    const handleOrientation = (event) => {
      // gamma: left/right tilt, beta: front/back tilt
      targetGyroX = event.gamma * 0.003;
      targetGyroY = Math.max(-0.2, Math.min(0.2, (event.beta - 45) * 0.003));
    };

    if (gyroBtn) {
      gyroBtn.addEventListener('click', () => {
        if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
          DeviceOrientationEvent.requestPermission()
            .then(state => {
              if (state === 'granted') {
                window.addEventListener('deviceorientation', handleOrientation);
                gyroBtn.style.display = 'none';
              }
            })
            .catch(e => console.error(e));
        } else {
          window.addEventListener('deviceorientation', handleOrientation);
          gyroBtn.style.display = 'none';
        }
      });
    }


    // Show gallery link when section is in view
    const showGallery = () => {
      galleryLink.style.opacity = '1';
      galleryLink.style.transform = 'translateY(0)';
    };

    // Show hints when section is in view or hovered
    const showHint = () => {
      controlHint.style.opacity = '1';
      controlHint.style.transform = 'translateY(0)';
      showGallery();
    };
    const hideHint = () => {
      controlHint.style.opacity = '0.5';
    };

    container.addEventListener('mouseenter', showHint);
    container.addEventListener('mouseleave', hideHint);

    // Cinematic Title Animation (Center to Corner)
    const titleBox = document.getElementById('iot-title-box');
    if (titleBox) {
      const observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) {
          showHint();
          setTimeout(() => {
            titleBox.classList.add('corner');
            // Fade out the background vignette for complete visibility
            const bg = document.getElementById('iot-overlay-bg');
            if (bg) bg.style.opacity = '0';
          }, 2500); // Wait 2.5 seconds before moving to corner
          observer.disconnect(); // Play only once
        }
      }, { threshold: 0.5 });
      observer.observe(container);
    }
  }

  function createRooms() {
    const rooms = [
      { name: '주방 (Kitchen)', color: 0xffaa00, x: -4, z: -5, w: 8, d: 6 },
      { name: '작은방 (Small Room)', color: 0xff4444, x: 4, z: -5, w: 8, d: 6 },
      { name: '거실 (Living Room)', color: 0x00e5a0, x: -3, z: 3, w: 10, d: 10 },
      { name: '안방 (Bedroom)', color: 0x44aaff, x: 5, z: 4.5, w: 6, d: 7 }
    ];

    rooms.forEach(room => {
      // Wall Box (edges only for wireframe look)
      const geometry = new THREE.BoxGeometry(room.w, 3, room.d); // height 3
      const edges = new THREE.EdgesGeometry(geometry);
      const material = new THREE.LineBasicMaterial({ color: room.color, transparent: true, opacity: 0.15 });
      const line = new THREE.LineSegments(edges, material);
      line.position.set(room.x, 1.5, room.z); // y=1.5 so bottom is at y=0
      mainGroup.add(line);


      // 8. Floor Text (Integrated Design - Filling the floor)
      const aspect = room.w / room.d;
      const canvas = document.createElement('canvas');
      // Set high resolution while maintaining floor aspect ratio
      const baseSize = 1024;
      canvas.width = baseSize * aspect;
      canvas.height = baseSize;

      const context = canvas.getContext('2d');
      context.fillStyle = 'rgba(0,0,0,0)';
      context.fillRect(0, 0, canvas.width, canvas.height);

      // Dynamic font size based on room dimensions
      const fontSize = baseSize * 0.25;
      context.font = `900 ${fontSize}px sans-serif`;
      context.fillStyle = '#' + room.color.toString(16).padStart(6, '0');
      context.globalAlpha = 0.25;
      context.textAlign = "center";
      context.textBaseline = "middle";

      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;

      const parts = room.name.split(' (');
      const padding = canvas.width * 0.05;
      const maxWidth = canvas.width - padding * 2;

      if (parts.length > 1) {
        context.fillText(parts[0].toUpperCase(), centerX, centerY - fontSize * 0.35, maxWidth);
        context.font = `900 ${fontSize * 0.6}px sans-serif`;
        context.fillText('(' + parts[1].toUpperCase(), centerX, centerY + fontSize * 0.4, maxWidth);
      } else {
        context.fillText(room.name.toUpperCase(), centerX, centerY, maxWidth);
      }

      const texture = new THREE.CanvasTexture(canvas);
      const floorLabelMaterial = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
        side: THREE.DoubleSide
      });

      // Fill the floor area almost entirely (0.95)
      const floorLabelGeo = new THREE.PlaneGeometry(room.w * 0.95, room.d * 0.95);
      const floorLabel = new THREE.Mesh(floorLabelGeo, floorLabelMaterial);

      floorLabel.rotation.x = -Math.PI / 2;
      floorLabel.position.set(room.x, 0.05, room.z);
      mainGroup.add(floorLabel);
    });

    // --- Architectural Details ---
    // 1. Living Room Veranda Glass Door (Bottom wall of living room, z = 8)
    // Living room x: -8 to 2 (center -3). Width 10. Let's make door width 8.
    const glassMaterial = new THREE.MeshBasicMaterial({ color: 0x88ccff, transparent: true, opacity: 0.05, side: THREE.DoubleSide, depthWrite: false });
    const doorGeo = new THREE.BoxGeometry(8, 3, 0.1);
    const door = new THREE.Mesh(doorGeo, glassMaterial);
    door.position.set(-3, 1.5, 8); // At z=8 (bottom wall)
    mainGroup.add(door);

    const doorEdges = new THREE.LineSegments(new THREE.EdgesGeometry(doorGeo), new THREE.LineBasicMaterial({ color: 0x88ccff, transparent: true, opacity: 0.2, depthWrite: false }));
    doorEdges.position.set(-3, 1.5, 8);
    mainGroup.add(doorEdges);


    // 2. Small Room Window (Top wall of small room, z = -8)
    // Small room x: 0 to 8 (center 4). Width 8. Let's make window width 4.
    const windowGeo = new THREE.BoxGeometry(4, 1.5, 0.1);
    const windowMesh = new THREE.Mesh(windowGeo, glassMaterial);
    windowMesh.position.set(4, 1.5, -8); // At z=-8, y=1.5 (half up)
    mainGroup.add(windowMesh);

    const windowEdges = new THREE.LineSegments(new THREE.EdgesGeometry(windowGeo), new THREE.LineBasicMaterial({ color: 0x88ccff, transparent: true, opacity: 0.2, depthWrite: false }));
    windowEdges.position.set(4, 1.5, -8);
    mainGroup.add(windowEdges);


    // 3. Small Room Desk
    // Bottom wall of small room is now at z = -2
    const deskMaterial = new THREE.MeshBasicMaterial({ color: 0xff4444, transparent: true, opacity: 0.05, side: THREE.DoubleSide, depthWrite: false });
    const deskGeo = new THREE.BoxGeometry(4, 1, 1.5);
    const desk = new THREE.Mesh(deskGeo, deskMaterial);
    desk.position.set(4, 0.5, -2.75);
    mainGroup.add(desk);

    const deskEdges = new THREE.LineSegments(new THREE.EdgesGeometry(deskGeo), new THREE.LineBasicMaterial({ color: 0xff4444, transparent: true, opacity: 0.2, depthWrite: false }));
    deskEdges.position.set(4, 0.5, -2.75);
    mainGroup.add(deskEdges);


    // 4. Living Room TV (Transparent / Ghost Mesh)
    const tvMaterial = new THREE.MeshBasicMaterial({
      color: 0x44aaff,
      transparent: true,
      opacity: 0.05,
      depthWrite: false // Don't block objects behind it in the depth buffer
    });
    const tvGeo = new THREE.BoxGeometry(0.2, 2, 4);
    const tv = new THREE.Mesh(tvGeo, tvMaterial);
    tv.position.set(1.8, 1.5, 3);
    mainGroup.add(tv);

    const tvEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(tvGeo),
      new THREE.LineBasicMaterial({ color: 0x44aaff, transparent: true, opacity: 0.2, depthWrite: false })
    );
    tvEdges.position.set(1.8, 1.5, 3);
    mainGroup.add(tvEdges);


    // 5. Display Cabinet (Between Small Room and Master Room, z = -0.5)
    // Positioned against the back wall (x = 8), center at x = 7.25
    const cabinetMaterial = new THREE.MeshBasicMaterial({ color: 0xaa8844, transparent: true, opacity: 0.05, depthWrite: false });
    const cabinetGeo = new THREE.BoxGeometry(1.5, 2.5, 3);
    const cabinet = new THREE.Mesh(cabinetGeo, cabinetMaterial);
    cabinet.position.set(7.25, 1.25, -0.5);
    mainGroup.add(cabinet);

    const cabinetEdges = new THREE.LineSegments(new THREE.EdgesGeometry(cabinetGeo), new THREE.LineBasicMaterial({ color: 0xaa8844, transparent: true, opacity: 0.2, depthWrite: false }));
    cabinetEdges.position.set(7.25, 1.25, -0.5);
    mainGroup.add(cabinetEdges);

  }

  async function fetchIotNodes() {
    try {
      const response = await fetch('assets/data/iot-nodes.yml');
      const yamlText = await response.text();
      const data = jsyaml.load(yamlText);

      const parsedNodes = data.nodes.map(node => ({
        ...node,
        color: parseInt(node.color, 16)
      }));

      createEcosystem(parsedNodes);
    } catch (e) {
      console.error('Failed to load IoT nodes YAML:', e);
    }
  }

  function createEcosystem(nodeData) {
    const serverNode = nodeData.find(n => n.id === 'server') || nodeData[0];

    nodeData.forEach(data => {
      let geometry;
      if (data.type === 'box') geometry = new THREE.BoxGeometry(data.size, data.size, data.size, 2, 2, 2);
      else if (data.type === 'sphere') geometry = new THREE.SphereGeometry(data.size * 0.6, 12, 12);
      else if (data.type === 'cylinder') geometry = new THREE.CylinderGeometry(data.size * 0.5, data.size * 0.5, data.size, 12, 3);
      else if (data.type === 'strip') geometry = new THREE.BoxGeometry(data.width || 5, 0.1, 0.1, 8, 1, 1);
      else if (data.type === 'strip_z') geometry = new THREE.BoxGeometry(0.1, 0.1, data.width || 5, 1, 1, 8);
      else if (data.type === 'nest_hub') {
        geometry = new THREE.SphereGeometry(data.size * 0.45, 24, 24);
      }
      else if (data.type === 'ceiling_sq') {
        const shape = new THREE.Shape();
        const w = 2, h = 2, r = 0.5;
        shape.moveTo(-w / 2 + r, -h / 2);
        shape.lineTo(w / 2 - r, -h / 2);
        shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
        shape.lineTo(w / 2, h / 2 - r);
        shape.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
        shape.lineTo(-w / 2 + r, h / 2);
        shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
        shape.lineTo(-w / 2, -h / 2 + r);
        shape.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
        geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: false });
        geometry.translate(0, 0, -0.05);
        geometry.rotateX(Math.PI / 2);
      }
      else if (data.type === 'ceiling_line') geometry = new THREE.BoxGeometry(3, 0.1, 0.4);

      const isSolidLight = data.type === 'strip' || data.type === 'strip_z' || data.type === 'ceiling_sq' || data.type === 'ceiling_line';

      const material = new THREE.MeshBasicMaterial({
        color: data.color,
        transparent: true,
        opacity: isSolidLight ? 0.9 : 0.8, // Increased from 0.5/0.8
        wireframe: !isSolidLight
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(data.pos[0], data.pos[1], data.pos[2]);

      if (data.type === 'nest_hub') {
        mesh.scale.set(1.0, 0.35, 1.0); // Slightly thicker on Y-axis
        mesh.rotation.y = 0;
      }

      mesh.userData = {
        name: data.name,
        desc: data.desc,
        baseColor: data.color,
        type: data.type,
        link: data.link,
        baseScale: mesh.scale.clone()
      };

      mainGroup.add(mesh);
      nodes.push(mesh);


      // Create connection line (to parent or server)
      if (data.id !== 'server') {
        const targetId = data.parent || 'server';
        const targetNode = nodeData.find(n => n.id === targetId) || serverNode;

        const materialLine = new THREE.LineBasicMaterial({ color: data.color, transparent: true, opacity: 0.3 });
        const points = [];
        points.push(new THREE.Vector3(targetNode.pos[0], targetNode.pos[1], targetNode.pos[2]));
        // curve up slightly
        const midX = (targetNode.pos[0] + data.pos[0]) / 2;
        const midZ = (targetNode.pos[2] + data.pos[2]) / 2;
        const midY = Math.max(targetNode.pos[1], data.pos[1]) + 2;
        points.push(new THREE.Vector3(midX, midY, midZ));
        points.push(new THREE.Vector3(data.pos[0], data.pos[1], data.pos[2]));

        const curve = new THREE.CatmullRomCurve3(points);
        const curvePoints = curve.getPoints(20);
        const geometryLine = new THREE.BufferGeometry().setFromPoints(curvePoints);
        const line = new THREE.Line(geometryLine, materialLine);
        mainGroup.add(line);
        connectionLines.push({ line, color: data.color });

      }
    });
  }

  function onMouseMove(event) {
    const rect = container.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(nodes);

    if (intersects.length > 0) {
      container.style.cursor = 'pointer';
      const object = intersects[0].object;

      // If we hovered a new object
      if (hoveredNode !== object) {
        hoveredNode = object;
        // Highlight object
        nodes.forEach(n => {
          n.material.opacity = 0.3; // Dim others more for contrast
          if (n.userData.baseScale) {
            n.scale.copy(n.userData.baseScale);
          }
        });
        object.material.opacity = 1.0;
        if (object.userData.baseScale) {
          object.scale.copy(object.userData.baseScale).multiplyScalar(1.2);
        }

        // Show HUD text
        hudTitle.textContent = object.userData.name;

        let descHtml = object.userData.desc;
        if (object.userData.link) {
          descHtml += '<br><br><span style="color: var(--accent-color); font-weight: 600; font-size: 0.9em; display: inline-block; padding: 4px 8px; border: 1px solid var(--accent-color); border-radius: 4px; background: rgba(0, 229, 160, 0.1);">🔗 클릭하여 자세히 보기</span>';
        }
        hudDesc.innerHTML = descHtml;
        hud.style.display = 'block';

        // Force reflow before opacity change for smooth fade
        hud.offsetHeight;
        hud.style.opacity = '1';

        // Stop scene rotation while inspecting
        controls.autoRotate = false;
      }
    } else {
      container.style.cursor = 'grab';
      if (hoveredNode) {
        nodes.forEach(n => {
          const isSolidLight = n.userData.type === 'strip' || n.userData.type === 'strip_z' || n.userData.type === 'ceiling_sq' || n.userData.type === 'ceiling_line';
          n.material.opacity = isSolidLight ? 0.9 : 0.8;
          if (n.userData.baseScale) {
            n.scale.copy(n.userData.baseScale);
          }
        });
        hud.style.opacity = '0';
        controls.autoRotate = true;
        hoveredNode = null;

        // Hide completely after fade out
        setTimeout(() => {
          if (!hoveredNode) hud.style.display = 'none';
        }, 200);
      }
    }
  }

  function onWindowResize() {
    if (!camera || !renderer) return;
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  }

  function onScroll() {
    if (!camera) return;
    // Parallax effect on scroll
    const scrollY = window.scrollY;
    const offset = container.offsetTop;
    const height = container.offsetHeight;

    // Only calculate if in view
    if (scrollY + window.innerHeight > offset && scrollY < offset + height) {
      const progress = (scrollY + window.innerHeight - offset) / (window.innerHeight + height);
      // Zoom slightly based on scroll
      camera.position.y = 15 - (progress * 5);
      camera.lookAt(0, 0, 0);
    }
  }

  function animate() {
    requestAnimationFrame(animate);
    controls.update();

    // Animate lines (pulse effect)
    const time = Date.now() * 0.002;
    connectionLines.forEach((item, index) => {
      item.line.material.opacity = 0.15 + Math.sin(time + index) * 0.15;
    });

    // Make nodes float slightly
    nodes.forEach((node, index) => {
      const isSolidLight = node.userData.type === 'strip' || node.userData.type === 'strip_z' || node.userData.type === 'ceiling_sq' || node.userData.type === 'ceiling_line';
      // Small vertical float for all except ceiling lights / strips (which are fixed to the ceiling/box)
      if (!isSolidLight) {
        node.position.y += Math.sin(time * 2 + index) * 0.005;
      }

      if (node !== hoveredNode && !isSolidLight) {
        node.rotation.y += 0.005; // Slow idle rotation
      }
    });

    // Animation and HUD positioning for hovered node
    if (hoveredNode) {
      const isSolidLight = hoveredNode.userData.type === 'strip' || hoveredNode.userData.type === 'strip_z' || hoveredNode.userData.type === 'ceiling_sq' || hoveredNode.userData.type === 'ceiling_line';
      if (!isSolidLight) {
        hoveredNode.rotation.y += 0.05; // Fast spin on hover
        hoveredNode.rotation.x += 0.02;
      }

      // Stick HUD to the 3D object like a speech bubble
      const vector = new THREE.Vector3();
      hoveredNode.getWorldPosition(vector);
      vector.y += 1.5; // Offset above the shape
      vector.project(camera);

      const rect = container.getBoundingClientRect();
      const x = (vector.x * 0.5 + 0.5) * rect.width;
      const y = (vector.y * -0.5 + 0.5) * rect.height;

      const hudWidth = hud.offsetWidth;
      const hudHeight = hud.offsetHeight;

      // Clamp x so it doesn't bleed out of horizontal bounds
      // Since translate(-50%, -120%) is applied, x is the center of HUD
      const clampedX = Math.max(hudWidth / 2 + 10, Math.min(rect.width - hudWidth / 2 - 10, x));

      // Clamp y so it doesn't bleed out of vertical bounds
      // HUD is roughly from y-120% to y-20%
      const clampedY = Math.max(hudHeight * 1.2 + 10, Math.min(rect.height - 10, y));

      hud.style.left = `${clampedX}px`;
      hud.style.top = `${clampedY}px`;
    }

    // Gyro Parallax
    gyroX += (targetGyroX - gyroX) * 0.1;
    gyroY += (targetGyroY - gyroY) * 0.1;
    if (mainGroup) {
      mainGroup.rotation.z = gyroX;
      mainGroup.rotation.x = gyroY;
    }

    renderer.render(scene, camera);

  }
})();
