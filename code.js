figma.showUI(__html__, { width: 300, height: 350 });

figma.ui.onmessage = async (msg) => {
  if (msg.type === 'resize') {
    figma.ui.resize(300, msg.height);
    return;
  }
  if (msg.type === 'create-sticker') {
    const activeSelection = figma.currentPage.selection;
    
    if (activeSelection.length === 0) {
      figma.notify("Please select at least one layer to create a sticker.");
      return;
    }

    try {
      // 1. Filter out existing sticker backgrounds
      const pureSelection = activeSelection.filter(n => n.getPluginData('isSticker') !== 'true');
      
      if (pureSelection.length === 0) {
        figma.notify("Please select the shapes, not just the sticker background.");
        return;
      }

      // 2. Identify if selection is a single container
      const isContainer = pureSelection.length === 1 && ['FRAME', 'GROUP', 'COMPONENT', 'SECTION'].includes(pureSelection[0].type);
      const msgThickness = String(msg.thickness || 12);
      const msgShadow = String(msg.shadow);
      const msgShadowBlur = String(msg.shadowBlur !== undefined ? msg.shadowBlur : 10);
      const msgOpacity = String(msg.opacity !== undefined ? msg.opacity : 24);
      const msgStyle = msg.style || 'modern';

      // 3. Find and manage existing stickers
      const searchSpace = isContainer ? pureSelection[0].children : activeSelection;
      const existingStickers = searchSpace.filter(n => n.getPluginData('isSticker') === 'true');
      
      if (existingStickers.length > 0) {
        const oldThickness = existingStickers[0].getPluginData('thickness');
        const oldShadow = existingStickers[0].getPluginData('shadow');
        const oldShadowBlur = existingStickers[0].getPluginData('shadowBlur') || '10';
        const oldOpacity = existingStickers[0].getPluginData('opacity') || '24';
        const oldStyle = existingStickers[0].getPluginData('style') || 'modern';
        
        if (oldThickness === msgThickness && oldShadow === msgShadow && oldStyle === msgStyle && oldOpacity === msgOpacity && oldShadowBlur === msgShadowBlur) {
          figma.notify("Sticker already created with these properties.");
          return;
        }
        existingStickers.forEach(s => s.remove());
      }
      
      // 4. Calculate placement
      const targetParent = isContainer ? pureSelection[0] : pureSelection[0].parent;
      let minIndex = 0;
      if (!isContainer) {
        const indices = pureSelection.map(n => targetParent.children.indexOf(n)).filter(i => i !== -1);
        minIndex = indices.length > 0 ? Math.min(...indices) : targetParent.children.length;
      }

      // 5. Clone and flatten selection into a single base silhouette
      var clones = pureSelection.map(function(n) { return n.clone(); });
      var baseVector = figma.flatten(clones);
      var tempParent = baseVector.parent;
      var thickness = parseInt(msgThickness, 10);
      var physicalThickness = thickness;
      var glowSize = 0;
      
      if (msgStyle === 'neon') {
        physicalThickness = Math.max(1, thickness / 2);
        glowSize = thickness / 2;
      }
      
      // 6. Apply stroke and convert it to pure fill geometry (no stroke property!)
      baseVector.strokes = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
      baseVector.strokeWeight = physicalThickness;
      baseVector.strokeAlign = 'OUTSIDE';
      baseVector.strokeJoin = 'ROUND';
      baseVector.strokeCap = 'ROUND';
      
      // Convert the stroke into filled vector paths
      var outlinedStroke = baseVector.outlineStroke();
      
      if (outlinedStroke) {
        baseVector.strokes = [];
        var merged = figma.union([baseVector, outlinedStroke], tempParent);
        var stickerBg = figma.flatten([merged]);
      } else {
        baseVector.strokes = [];
        var stickerBg = baseVector;
      }
      
      // 7. Remove inner artifact paths — keep only the outermost contour
      try {
        var vPaths = stickerBg.vectorPaths;
        var allSubs = [];
        
        for (var pi = 0; pi < vPaths.length; pi++) {
          var pathData = vPaths[pi].data;
          var rule = vPaths[pi].windingRule;
          // Split into sub-paths at each M command
          var parts = pathData.split(/(?=M)/);
          for (var si = 0; si < parts.length; si++) {
            var part = parts[si].trim();
            if (part.length < 5) continue;
            // Calculate approximate area using shoelace on endpoints
            var nums = part.match(/-?[\d.]+/g);
            if (!nums || nums.length < 6) continue;
            var pts = [];
            for (var ni = 0; ni < nums.length - 1; ni += 2) {
              pts.push([parseFloat(nums[ni]), parseFloat(nums[ni + 1])]);
            }
            var area = 0;
            for (var ai = 0; ai < pts.length; ai++) {
              var aj = (ai + 1) % pts.length;
              area += pts[ai][0] * pts[aj][1] - pts[aj][0] * pts[ai][1];
            }
            area = Math.abs(area) / 2;
            allSubs.push({ data: part, area: area, rule: rule });
          }
        }
        
        // Sort by area descending, keep the largest path
        allSubs.sort(function(a, b) { return b.area - a.area; });
        
        if (allSubs.length > 0) {
          // Keep only the outer contour (largest area)
          stickerBg.vectorPaths = [{ windingRule: allSubs[0].rule, data: allSubs[0].data }];
        }
      } catch (e) {
        // If cleanup fails, continue with the full shape
      }
      
      stickerBg.name = "Sticker Background";
      
      // 8. Store properties and apply styles
      stickerBg.setPluginData('isSticker', 'true');
      stickerBg.setPluginData('thickness', msgThickness);
      stickerBg.setPluginData('shadow', msgShadow);
      stickerBg.setPluginData('shadowBlur', msgShadowBlur);
      stickerBg.setPluginData('opacity', msgOpacity);
      stickerBg.setPluginData('style', msgStyle);
      
      // Extract dominant color from selection to use in styles
      var dominantColor = { r: 0, g: 1, b: 1 }; // Default to Cyan
      function extractColor(nodes) {
        var backupColor = null;
        for (var i = 0; i < nodes.length; i++) {
          var node = nodes[i];
          
          // Skip the old sticker if it somehow wasn't fully purged from the tree yet
          if (node.getPluginData('isSticker') === 'true') continue;

          // Only look at actual vector/shape nodes, not container backgrounds
          if (node.type !== 'FRAME' && node.type !== 'SECTION' && node.type !== 'GROUP' && node.type !== 'COMPONENT' && node.type !== 'COMPONENT_SET') {
            if ('fills' in node && Array.isArray(node.fills)) {
              for (var f = 0; f < node.fills.length; f++) {
                if (node.fills[f].type === 'SOLID' && node.fills[f].visible !== false) {
                  var c = node.fills[f].color;
                  // If the color is grayscale (white, black, grey), save it as a backup but keep looking for a vibrant color
                  if (Math.abs(c.r - c.g) < 0.1 && Math.abs(c.g - c.b) < 0.1) {
                    if (!backupColor) backupColor = c;
                  } else {
                    return c; // Found a colorful fill!
                  }
                }
              }
            }
          }
          if ('children' in node) {
            var childColor = extractColor(node.children);
            if (childColor) return childColor;
          }
        }
        return backupColor;
      }
      
      var extracted = extractColor(pureSelection);
      if (extracted) { dominantColor = extracted; }
      
      // Apply Fills and Strokes based on Style
      stickerBg.strokes = [];
      stickerBg.effects = [];

      switch (msgStyle) {
        case 'retro':
          stickerBg.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
          break;
        case 'holographic':
          // Mix the dominant color with classic holographic pastel hues
          // 60% dominant color, 40% iridescent hues to ensure it stays colorful
          var r = dominantColor.r;
          var g = dominantColor.g;
          var b = dominantColor.b;
          var mixRatio = 0.4;
          
          function blend(cR, cG, cB) {
            return {
              r: Math.min(1, r * (1 - mixRatio) + cR * mixRatio),
              g: Math.min(1, g * (1 - mixRatio) + cG * mixRatio),
              b: Math.min(1, b * (1 - mixRatio) + cB * mixRatio)
            };
          }

          // Auto-calculate user-defined opacity fade over a white background
          // This keeps the actual alpha channel at 100% (solid) but mathematically lightens the color
          function simulatedFade(c, position) {
            var targetOpacity = parseInt(msgOpacity, 10) / 100; // e.g. 24% -> 0.24
            var fadeRange = 1.0 - targetOpacity; // e.g. 0.76
            var blendRatio = 1.0 - (fadeRange * position); // 1.0 at 0, targetOpacity at 1
            return {
              r: Math.min(1, c.r * blendRatio + 1.0 * (1 - blendRatio)),
              g: Math.min(1, c.g * blendRatio + 1.0 * (1 - blendRatio)),
              b: Math.min(1, c.b * blendRatio + 1.0 * (1 - blendRatio)),
              a: 1
            };
          }

          var stop1 = simulatedFade(blend(1, 0.5, 0.8), 0);
          var stop2 = simulatedFade(blend(0.5, 0.8, 1), 0.25);
          var stop3 = simulatedFade(blend(1, 0.9, 0.5), 0.5);
          var stop4 = simulatedFade(blend(0.8, 0.5, 1), 0.75);
          var stop5 = simulatedFade(blend(1, 1, 1), 1);

          // Dynamic metallic/holographic gradient tinted by selected color
          stickerBg.fills = [{
            type: 'GRADIENT_LINEAR',
            gradientStops: [
              { position: 0, color: stop1 },
              { position: 0.25, color: stop2 },
              { position: 0.5, color: stop3 },
              { position: 0.75, color: stop4 },
              { position: 1, color: stop5 }
            ],
            gradientTransform: [[1, 0, 0], [0, 1, 0]]
          }];
          break;
        case 'neon':
          // Dark base with a bright neon outline matching the artwork's dominant color
          stickerBg.fills = [{ type: 'SOLID', color: { r: 0.05, g: 0.05, b: 0.1 } }];
          break;
        case 'gold':
          // Auto-calculate user-defined opacity fade over a white background
          function goldSimulatedFade(c, position) {
            var targetOpacity = parseInt(msgOpacity, 10) / 100; // e.g. 24% -> 0.24
            var fadeRange = 1.0 - targetOpacity; // e.g. 0.76
            var blendRatio = 1.0 - (fadeRange * position); // 1.0 at 0, targetOpacity at 1
            return {
              r: Math.min(1, c.r * blendRatio + 1.0 * (1 - blendRatio)),
              g: Math.min(1, c.g * blendRatio + 1.0 * (1 - blendRatio)),
              b: Math.min(1, c.b * blendRatio + 1.0 * (1 - blendRatio)),
              a: 1
            };
          }

          // Metallic diagonal gradient
          stickerBg.fills = [{
            type: 'GRADIENT_LINEAR',
            gradientStops: [
              { position: 0, color: goldSimulatedFade({ r: 0.95, g: 0.85, b: 0.5 }, 0) },
              { position: 0.5, color: goldSimulatedFade({ r: 1, g: 0.98, b: 0.8 }, 0.5) },
              { position: 1, color: goldSimulatedFade({ r: 0.8, g: 0.65, b: 0.2 }, 1) }
            ],
            gradientTransform: [[0.707, 0.707, 0], [-0.707, 0.707, 0.5]]
          }];
          break;
        case 'modern':
        default:
          stickerBg.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
          break;
      }
      
      // Apply Effects
      var effects = [];

      // Always apply intrinsic style effects (like glows or hard shadows)
      if (msgStyle === 'neon') {
        // Ensure the glow color is actually bright enough to look like Neon!
        var neonC = { r: dominantColor.r, g: dominantColor.g, b: dominantColor.b };
        var max = Math.max(neonC.r, neonC.g, neonC.b);
        
        // If the color is too dark (e.g. black outline), fallback to classic Neon Cyan
        if (max < 0.2) {
          neonC = { r: 0, g: 1, b: 1 };
        } else {
          // Normalize to make it a bright, saturated 'laser' color
          neonC.r = neonC.r / max;
          neonC.g = neonC.g / max;
          neonC.b = neonC.b / max;
        }

        // Double-layered intense glow scaled by border thickness
        effects.push({
          type: 'DROP_SHADOW',
          color: { r: neonC.r, g: neonC.g, b: neonC.b, a: 1 },
          offset: { x: 0, y: 0 },
          radius: glowSize,
          spread: glowSize / 4,
          visible: true,
          blendMode: 'NORMAL'
        });
        effects.push({
          type: 'DROP_SHADOW',
          color: { r: neonC.r, g: neonC.g, b: neonC.b, a: 0.6 },
          offset: { x: 0, y: 0 },
          radius: glowSize * 3,
          spread: glowSize * 0.75,
          visible: true,
          blendMode: 'NORMAL'
        });
      } else if (msgStyle === 'holographic') {
        // Soft pinkish aura
        effects.push({
          type: 'DROP_SHADOW',
          color: { r: 1, g: 0.8, b: 0.9, a: 0.4 },
          offset: { x: 0, y: 4 },
          radius: 16,
          spread: 0,
          visible: true,
          blendMode: 'NORMAL'
        });
      } else if (msgStyle === 'retro') {
        // Hard, bold solid drop shadow is essential for retro look, especially without strokes
        effects.push({
          type: 'DROP_SHADOW',
          color: { r: 0.1, g: 0.1, b: 0.1, a: 1 },
          offset: { x: 6, y: 6 },
          radius: 0,
          spread: 0,
          visible: true,
          blendMode: 'NORMAL'
        });
      }

      // Add the user-selected generic shadow if enabled
      if (msg.shadow) {
        var userBlur = parseInt(msgShadowBlur, 10);
        var baseShadow = {
          type: 'DROP_SHADOW',
          color: { r: 0, g: 0, b: 0, a: 0.25 },
          offset: { x: 0, y: userBlur / 2.5 }, // Scale offset with blur for a natural look
          radius: userBlur,
          spread: 0,
          visible: true,
          blendMode: 'NORMAL'
        };

        if (msgStyle === 'retro') {
          // Push standard shadow behind the hard retro shadow
          baseShadow.offset = { x: 10, y: 10 };
        } else if (msgStyle === 'neon') {
          // Push a standard dark shadow behind the glow to lift it off the canvas
          baseShadow.color.a = 0.5;
          baseShadow.radius = 16;
        }

        effects.push(baseShadow);
      }

      stickerBg.effects = effects;
      
      // 9. Insert and adjust positioning
      targetParent.insertChild(minIndex, stickerBg);

      if ('layoutMode' in targetParent && targetParent.layoutMode !== 'NONE') {
        stickerBg.layoutPositioning = 'ABSOLUTE';
      }
      
      if (isContainer && targetParent.type !== 'GROUP') {
        // Frames, Components, and Sections establish a new coordinate space.
        // Groups do NOT establish a new coordinate space in Figma, so their children use parent coordinates.
        stickerBg.x -= targetParent.x;
        stickerBg.y -= targetParent.y;
      }
      
      // 8. Select the sticker background and original selection together
      figma.currentPage.selection = [stickerBg, ...pureSelection];
      figma.notify("Sticker created successfully!");

    } catch (error) {
      console.error(error);
      figma.notify("Error creating sticker. Make sure shapes can be flattened.");
    }
  }
};