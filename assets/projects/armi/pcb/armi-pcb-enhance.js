/* armi-pcb-enhance.js — Shared A.RM.I PCB model enhancement module
 * Extracted from pcb3d.js so that EVERY page displaying the ARMI PCB model
 * (Home showcase, PCB Exhibition Hall, ARMI project page) gets identical
 * material enhancements, LED animations, and via-barrel gold plating.
 *
 * Usage:
 *   // After loading the GLB and creating the model group:
 *   var state = ArmiPcbEnhance.process(modelGroup, { castShadow: true });
 *
 *   // In the animation loop, every frame:
 *   ArmiPcbEnhance.animate(state, time, elapsed);
 */
window.ArmiPcbEnhance = (function () {
  'use strict';

  // ── Helper: group LED meshes that share the same Z position ──
  function groupLedsByZ(ledArray) {
    var groups = [];
    for (var i = 0; i < ledArray.length; i++) {
      var sLed = ledArray[i];
      var found = false;
      for (var g = 0; g < groups.length; g++) {
        if (Math.abs(groups[g].z - sLed.localZ) < 0.001) {
          groups[g].meshes.push(sLed);
          found = true;
          break;
        }
      }
      if (!found) groups.push({ z: sLed.localZ, meshes: [sLed] });
    }
    groups.sort(function (a, b) { return b.z - a.z; });
    return groups;
  }

  // ─────────────────────────────────────────────────────────────
  //  process() — Material enhancement, LED detection, via split
  // ─────────────────────────────────────────────────────────────
  /**
   * @param {THREE.Group} model   The PCB model group (already scaled / centered).
   * @param {object}      [opts]  { castShadow: true, receiveShadow: true }
   * @returns {object}    state   Pass to animate() every frame.
   */
  function process(model, opts) {
    opts = opts || {};
    var castShadow = opts.castShadow !== false;
    var receiveShadow = opts.receiveShadow !== false;

    var ledMeshes = [];
    var singleLedMeshes = [];
    var ledLights = [];
    var matCache = {};

    // Ensure world matrices are current for getWorldPosition / worldToLocal
    model.updateMatrixWorld(true);

    // ── 1. Material Enhancement & LED Detection ──────────────
    model.traverse(function (child) {
      if (!child.isMesh) return;
      child.castShadow = castShadow;
      child.receiveShadow = receiveShadow;
      var mat = child.material;
      if (!mat) return;

      var mName = mat.name ? mat.name.toLowerCase() : '';
      var childName = (child.name || '').toLowerCase();

      var ancestorName = '';
      var curr = child;
      while (curr) {
        if (curr.name) ancestorName += curr.name.toLowerCase() + ' ';
        curr = curr.parent;
      }

      // ── Detect PCB edge mesh ──
      var allNames = mName + ' ' + childName + ' ' + ancestorName;
      var isPcbEdge = allNames.includes('pcb_edge') || allNames.includes('pcb edge') ||
                      allNames.includes('board_edge') || allNames.includes('board edge') ||
                      (allNames.includes('edge') && (allNames.includes('pcb') || allNames.includes('board')));

      // ── Detect 5050 RGB LED ──
      var is5050Group = !isPcbEdge && (ancestorName.includes('led_rgb_5050') || childName.includes('led_rgb_5050'));
      var is5050Body = is5050Group && (mName.includes('white') || mName.includes('body') || childName.endsWith('_1'));
      var is5050Pin  = is5050Group && (mName.includes('metal') || mName.includes('pin') || mName.includes('copper') || mName.includes('solder') || childName.endsWith('_2'));
      var is5050Lens = is5050Group && !is5050Body && !is5050Pin;

      // ── Detect Single LEDs ──
      var isSingleLEDGroup = !isPcbEdge && !is5050Group && (ancestorName.includes('led') || childName.includes('led') || mName.includes('led') || ancestorName.match(/d\d+/i));
      var isSingleLEDPin   = isSingleLEDGroup && (mName.includes('metal') || mName.includes('pin') || mName.includes('copper') || mName.includes('solder') || childName.endsWith('_2'));
      var isSingleLEDBody  = isSingleLEDGroup && !isSingleLEDPin && !mName.includes('black');

      // ── Switches / Connectors ──
      var isSwitchOrConnector = !is5050Group && !isSingleLEDGroup && !isPcbEdge &&
        (ancestorName.match(/(?:^|\s)sw\d/) || ancestorName.match(/(?:^|\s)j\d/) ||
         ancestorName.includes('usb') || ancestorName.includes('button') || ancestorName.includes('switch') ||
         mName.includes('plastic-white') || mName.includes('button') || mName.includes('usb'));

      // ── Capacitors ──
      var isCapacitor = !isSwitchOrConnector && !isSingleLEDGroup && !isPcbEdge &&
        (mName.includes('cap') || mName.includes('ceramic') || mName.includes('mlcc') ||
         mName.includes('tantalum') || mName.includes('tant') ||
         mName.includes('plastic-yellow') || mName.includes('plastic-orange') ||
         ancestorName.match(/(?:^|\s)c\d/));

      var cacheKey = mat.uuid + '_' +
        (is5050Lens ? 'led' : (isSingleLEDBody ? 'sled' : (isSwitchOrConnector ? 'sw' : (isCapacitor ? 'cap' : (isPcbEdge ? 'edge' : 'norm')))));

      // ── PCB Edge: skip — handled by splitPcbVias below ──
      if (isPcbEdge) {
        // noop
      } else if (is5050Lens) {
        // 5050 RGB LED lens — rainbow emissive glow
        var ledMat = mat.clone();
        child.material = ledMat;
        ledMat.emissive = new THREE.Color(1, 0, 0);
        ledMat.emissiveIntensity = 2.5;
        ledMat.metalness = 0.0;
        ledMat.roughness = 0.4;
        ledMat.needsUpdate = true;
        ledMeshes.push({ mesh: child, mat: ledMat });

        // Add a SpotLight attached to the model (rotates with PCB)
        if (ledLights.length === 0) {
          var worldPos = new THREE.Vector3();
          child.getWorldPosition(worldPos);
          var localPos = new THREE.Vector3();
          localPos.copy(worldPos);
          model.worldToLocal(localPos);

          var ledLight = new THREE.SpotLight(0xff0000, 1.5, 0.25, Math.PI / 2.1, 0.5, 1);
          ledLight.position.copy(localPos);
          var lightTarget = new THREE.Object3D();
          lightTarget.position.copy(localPos);
          lightTarget.position.y += (localPos.y >= 0 ? 0.1 : -0.1);
          model.add(ledLight);
          model.add(lightTarget);
          ledLight.target = lightTarget;
          ledLights.push(ledLight);
        }

      } else if (isSingleLEDBody) {
        // Single-color LED body — initially off
        var sLedMat = mat.clone();
        child.material = sLedMat;
        sLedMat.emissive = new THREE.Color(0, 0, 0);
        sLedMat.emissiveIntensity = 2.0;
        sLedMat.metalness = 0.1;
        sLedMat.roughness = 0.4;
        sLedMat.needsUpdate = true;

        var sLocalPos = new THREE.Vector3();
        child.getWorldPosition(sLocalPos);
        model.worldToLocal(sLocalPos);
        singleLedMeshes.push({ mesh: child, mat: sLedMat, localX: sLocalPos.x, localY: sLocalPos.y, localZ: sLocalPos.z });

      } else if (matCache[cacheKey]) {
        child.material = matCache[cacheKey];

      } else {
        // Generic material enhancement
        var newMat = mat;
        if (!Array.isArray(mat)) {
          newMat = mat.clone();
          child.material = newMat;
          matCache[cacheKey] = newMat;
        }

        (Array.isArray(newMat) ? newMat : [newMat]).forEach(function (m) {
          if (m.map) m.map.encoding = THREE.sRGBEncoding;
          if (m.emissiveMap) m.emissiveMap.encoding = THREE.sRGBEncoding;
          if (m.aoMap) m.aoMap.encoding = THREE.sRGBEncoding;

          if (mName.includes('metal') || mName.includes('solder') || mName.includes('iron') ||
              mName.includes('lead') || mName.includes('tin') || mName.includes('silver') ||
              mName.includes('pad')) {
            m.metalness = 1.0;
            m.roughness = Math.min(m.roughness, 0.2);
            if (m.color && m.color.getHSL({}).l < 0.5) m.color.offsetHSL(0, 0, 0.2);
          } else if (mName.includes('pin') || mName.includes('header')) {
            m.metalness = 0.9;
            m.roughness = Math.min(m.roughness, 0.3);
            if (m.color) {
              var hsl = m.color.getHSL({});
              if (hsl.l < 0.6) m.color.setHSL(hsl.h, hsl.s, 0.6);
            }
          } else if (isSwitchOrConnector) {
            m.metalness = 0.1;
            m.roughness = 0.6;
            if (m.color) m.color.setHSL(0, 0, 0.9);
          } else if (isCapacitor) {
            m.metalness = 0.1;
            m.roughness = 0.6;
            if (m.color) {
              var hslC = m.color.getHSL({});
              if (mName.includes('tantalum') || mName.includes('tant') || mName.includes('plastic-yellow') || mName.includes('plastic-orange')) {
                m.color.setHSL(hslC.s === 0 ? 0.1 : hslC.h, Math.max(hslC.s, 0.6), 0.45);
              } else {
                m.color.setHSL(hslC.s === 0 ? 0.08 : hslC.h, Math.max(hslC.s, 0.4), 0.3);
              }
            }
          } else if (mName.includes('plastic') || mName.includes('package') || mName.includes('body') ||
                     mName.includes('ic') || mName.includes('black') || mName.includes('resin') ||
                     mName.includes('chip') || mName.includes('mcu') || mName.includes('resistor') ||
                     mName.includes('res')) {
            m.metalness = 0.1;
            m.roughness = Math.max(m.roughness, 0.6);
            if (m.color) {
              var hslP = m.color.getHSL({});
              if (mName.includes('white')) {
                if (hslP.l < 0.85) m.color.setHSL(hslP.h, hslP.s, 0.85);
              } else {
                if (hslP.l > 0.01) m.color.setHSL(hslP.h, hslP.s, 0.01);
              }
            }
          }
          m.needsUpdate = true;
        });
      }
    }); // end traverse

    // ── 2. LED Grouping & Static Colors ──────────────────────
    var sequenceLeds = [];
    var frontRightLeds = [];
    var farLeftLeds = [];
    var sequenceLedGroups = [];

    if (singleLedMeshes.length > 0) {
      // Find dominant X column (where the 4-LED stacks live)
      var xCounts = {};
      for (var i = 0; i < singleLedMeshes.length; i++) {
        var rx = Math.round(singleLedMeshes[i].localX * 100);
        xCounts[rx] = (xCounts[rx] || 0) + 1;
      }
      var columnX = null, maxCount = 0;
      for (var xk in xCounts) {
        if (xCounts[xk] > maxCount) { maxCount = xCounts[xk]; columnX = parseInt(xk); }
      }

      for (var j = 0; j < singleLedMeshes.length; j++) {
        var sLed = singleLedMeshes[j];
        var rxx = Math.round(sLed.localX * 100);
        if (Math.abs(rxx - columnX) <= 2) sequenceLeds.push(sLed);
        else if (sLed.localX > 0)          frontRightLeds.push(sLed);
        else                                farLeftLeds.push(sLed);
      }
    }

    // Front Right LEDs → static Light Green
    for (var fr = 0; fr < frontRightLeds.length; fr++) {
      frontRightLeds[fr].mat.emissive.setHex(0x88ff00);
      frontRightLeds[fr].mat.emissiveIntensity = 2.0;
      frontRightLeds[fr].mat.needsUpdate = true;
    }

    // Far Left LEDs → static D11=Red, D12=Green
    var farLeftGroups = groupLedsByZ(farLeftLeds);
    for (var fl = 0; fl < farLeftGroups.length; fl++) {
      var hex = 0x000000, inten = 0.0;
      if (fl === 0) { hex = 0xff0000; inten = 2.0; }
      else if (fl === 1) { hex = 0x00ff00; inten = 2.0; }
      for (var fm = 0; fm < farLeftGroups[fl].meshes.length; fm++) {
        farLeftGroups[fl].meshes[fm].mat.emissive.setHex(hex);
        farLeftGroups[fl].meshes[fm].mat.emissiveIntensity = inten;
        farLeftGroups[fl].meshes[fm].mat.needsUpdate = true;
      }
    }

    // Sequence LEDs → animated (state returned to caller)
    sequenceLedGroups = groupLedsByZ(sequenceLeds);

    // ── 3. Via Splitting (PCB edge → FR4 + gold barrels) ─────
    splitPcbVias(model);

    console.log('[ArmiPcbEnhance] Processed — RGB LEDs:', ledMeshes.length,
      '| Sequence groups:', sequenceLedGroups.length,
      '| LED lights:', ledLights.length);

    return {
      ledMeshes: ledMeshes,
      ledLights: ledLights,
      sequenceLedGroups: sequenceLedGroups
    };
  }

  // ─────────────────────────────────────────────────────────────
  //  splitPcbVias — separate via barrels (gold) from board edge (FR4)
  // ─────────────────────────────────────────────────────────────
  function splitPcbVias(model) {
    var edgeMeshes = [];
    model.traverse(function (c) {
      if (!c.isMesh || !c.material) return;
      var mn = (c.material.name || '').toLowerCase();
      var cn = (c.name || '').toLowerCase();
      var anc = '';
      var p = c.parent;
      while (p) { if (p.name) anc += p.name.toLowerCase() + ' '; p = p.parent; }
      var all = mn + ' ' + cn + ' ' + anc;
      if (all.includes('pcb_edge') || all.includes('pcb edge') ||
          all.includes('board_edge') || all.includes('board edge') ||
          (all.includes('edge') && (all.includes('pcb') || all.includes('board')))) {
        edgeMeshes.push(c);
      }
    });

    if (edgeMeshes.length === 0) return;

    var boardBox = new THREE.Box3().setFromObject(model);
    var boardXZSize = Math.max(boardBox.max.x - boardBox.min.x, boardBox.max.z - boardBox.min.z);
    var viaThreshold = boardXZSize * 0.03;

    var fr4Mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.55, 0.50, 0.30), metalness: 0.0, roughness: 0.85 });
    var viaMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.85, 0.72, 0.35), metalness: 0.9, roughness: 0.15 });

    for (var em = 0; em < edgeMeshes.length; em++) {
      var edgeMesh = edgeMeshes[em];
      var geo = edgeMesh.geometry;
      var pos = geo.attributes.position;
      var idx = geo.index;

      if (!idx) { edgeMesh.material = fr4Mat.clone(); continue; }

      var faceCount = idx.count / 3;

      // Build edge-based adjacency (faces sharing 2 vertices)
      var edgeToFaces = new Map();
      for (var f = 0; f < faceCount; f++) {
        var v0 = idx.getX(f * 3), v1 = idx.getX(f * 3 + 1), v2 = idx.getX(f * 3 + 2);
        var edges = [
          Math.min(v0, v1) + '-' + Math.max(v0, v1),
          Math.min(v1, v2) + '-' + Math.max(v1, v2),
          Math.min(v0, v2) + '-' + Math.max(v0, v2)
        ];
        for (var ei = 0; ei < edges.length; ei++) {
          if (!edgeToFaces.has(edges[ei])) edgeToFaces.set(edges[ei], []);
          edgeToFaces.get(edges[ei]).push(f);
        }
      }

      // BFS to find connected components
      var visited = new Uint8Array(faceCount);
      var components = [];
      for (var f2 = 0; f2 < faceCount; f2++) {
        if (visited[f2]) continue;
        var component = [], queue = [f2];
        visited[f2] = 1;
        while (queue.length > 0) {
          var cf = queue.shift();
          component.push(cf);
          var cv0 = idx.getX(cf * 3), cv1 = idx.getX(cf * 3 + 1), cv2 = idx.getX(cf * 3 + 2);
          var cEdges = [
            Math.min(cv0, cv1) + '-' + Math.max(cv0, cv1),
            Math.min(cv1, cv2) + '-' + Math.max(cv1, cv2),
            Math.min(cv0, cv2) + '-' + Math.max(cv0, cv2)
          ];
          for (var ck = 0; ck < cEdges.length; ck++) {
            var neighbors = edgeToFaces.get(cEdges[ck]);
            for (var ni = 0; ni < neighbors.length; ni++) {
              if (!visited[neighbors[ni]]) { visited[neighbors[ni]] = 1; queue.push(neighbors[ni]); }
            }
          }
        }
        components.push(component);
      }

      // Classify by XZ extent: small = via, large = board edge
      var boardEdgeFaces = [], viaFaces = [];
      for (var ci = 0; ci < components.length; ci++) {
        var comp = components[ci];
        var minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (var fi = 0; fi < comp.length; fi++) {
          for (var jj = 0; jj < 3; jj++) {
            var vi = idx.getX(comp[fi] * 3 + jj);
            var xx = pos.getX(vi), zz = pos.getZ(vi);
            if (xx < minX) minX = xx; if (xx > maxX) maxX = xx;
            if (zz < minZ) minZ = zz; if (zz > maxZ) maxZ = zz;
          }
        }
        var xzExtent = Math.max(maxX - minX, maxZ - minZ);
        var target = (xzExtent < viaThreshold) ? viaFaces : boardEdgeFaces;
        for (var tf = 0; tf < comp.length; tf++) {
          target.push(idx.getX(comp[tf] * 3), idx.getX(comp[tf] * 3 + 1), idx.getX(comp[tf] * 3 + 2));
        }
      }

      if (viaFaces.length > 0 && boardEdgeFaces.length > 0) {
        geo.setIndex(new THREE.BufferAttribute(new Uint32Array(boardEdgeFaces), 1));
        edgeMesh.material = fr4Mat.clone();
        var viaGeo = geo.clone();
        viaGeo.setIndex(new THREE.BufferAttribute(new Uint32Array(viaFaces), 1));
        var viaMesh = new THREE.Mesh(viaGeo, viaMat.clone());
        viaMesh.position.copy(edgeMesh.position);
        viaMesh.rotation.copy(edgeMesh.rotation);
        viaMesh.scale.copy(edgeMesh.scale);
        viaMesh.castShadow = true;
        viaMesh.receiveShadow = true;
        edgeMesh.parent.add(viaMesh);
      } else if (boardEdgeFaces.length > 0) {
        edgeMesh.material = fr4Mat.clone();
      } else {
        edgeMesh.material = viaMat.clone();
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  //  animate() — LED effects, call every frame
  // ─────────────────────────────────────────────────────────────
  /**
   * @param {object} state   Returned by process().
   * @param {number} time    Current wall-clock in seconds (Date.now() * 0.001).
   * @param {number} elapsed Seconds since animation started (for sequential LEDs).
   */
  function animate(state, time, elapsed) {
    if (!state) return;

    // ── Rainbow RGB LED ──
    if (state.ledMeshes.length > 0) {
      var hue = (time * 0.25) % 1.0;          // full spectrum every 4 s
      var ledColor = new THREE.Color();
      ledColor.setHSL(hue, 1.0, 0.5);

      for (var i = 0; i < state.ledMeshes.length; i++) {
        var entry = state.ledMeshes[i];
        entry.mat.emissive.copy(ledColor);
        entry.mat.emissiveIntensity = 1.8 + Math.sin(time * 3) * 0.4;
        entry.mat.needsUpdate = true;
      }
      for (var j = 0; j < state.ledLights.length; j++) {
        state.ledLights[j].color.copy(ledColor);
        state.ledLights[j].intensity = 0.6 + Math.sin(time * 3) * 0.2;
      }
    }

    // ── Sequential Single LEDs (Red → Orange → Green → Blue) ──
    if (state.sequenceLedGroups && state.sequenceLedGroups.length > 0) {
      var singleColors = [0xff0000, 0xffa500, 0x00ff00, 0x1144ff];
      var cycleTime = elapsed % 2.0;           // 2 s total (0.5 s per LED)
      for (var k = 0; k < state.sequenceLedGroups.length; k++) {
        var group = state.sequenceLedGroups[k];
        var step = k % 4;
        var turnOn  = step * 0.5;
        var turnOff = turnOn + 0.5;
        var colorHex = 0x000000, intensity = 0.0;

        if (cycleTime >= turnOn && cycleTime < turnOff) {
          var pulse = Math.sin(((cycleTime - turnOn) / 0.5) * Math.PI);
          colorHex = singleColors[step];
          intensity = ((step === 3) ? 6.0 : 3.0) * pulse;
        }
        for (var m = 0; m < group.meshes.length; m++) {
          group.meshes[m].mat.emissive.setHex(colorHex);
          group.meshes[m].mat.emissiveIntensity = intensity;
          group.meshes[m].mat.needsUpdate = true;
        }
      }
    }
  }

  return { process: process, animate: animate };
})();
