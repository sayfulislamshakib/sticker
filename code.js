figma.showUI(__html__, { width: 280, height: 350 });

// Load previous settings and send to UI
figma.clientStorage.getAsync('sticker_settings').then(settings => {
  if (settings) {
    figma.ui.postMessage({ type: 'load-settings', settings });
  }
});

figma.ui.onmessage = async (msg) => {
  if (msg.type === 'resize') {
    figma.ui.resize(280, msg.height);
    return;
  }
  if (msg.type === 'notify') {
    figma.notify(msg.message);
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

      const msgThickness = String(msg.thickness || 12);
      const msgShadow = String(msg.shadow);
      const msgShadowBlur = String(msg.shadowBlur !== undefined ? msg.shadowBlur : 10);
      const msgOpacity = String(msg.opacity !== undefined ? msg.opacity : 24);
      const msgStyle = msg.style || 'modern';

      // Save user settings for next time
      figma.clientStorage.setAsync('sticker_settings', {
        thickness: msg.thickness,
        shadow: msg.shadow,
        shadowBlur: msg.shadowBlur,
        opacity: msg.opacity,
        style: msg.style
      });

      const selectedStickers = activeSelection.filter(n => n.getPluginData('isSticker') === 'true');
      let finalSelection = [];
      let skippedCount = 0;
      let processedCount = 0;

      for (let i = 0; i < pureSelection.length; i++) {
        const node = pureSelection[i];
        const isContainer = ['FRAME', 'GROUP', 'COMPONENT', 'SECTION', 'COMPONENT_SET'].includes(node.type);

        // 3. Find and manage existing stickers
        let existingStickers = [];
        if (isContainer && 'children' in node) {
          existingStickers = node.children.filter(n => n.getPluginData('isSticker') === 'true');
        } else {
          existingStickers = i === 0 ? selectedStickers : [];
        }

        let skipThisNode = false;
        if (existingStickers.length > 0) {
          const oldThickness = existingStickers[0].getPluginData('thickness');
          const oldShadow = existingStickers[0].getPluginData('shadow');
          const oldShadowBlur = existingStickers[0].getPluginData('shadowBlur') || '10';
          const oldOpacity = existingStickers[0].getPluginData('opacity') || '24';
          const oldStyle = existingStickers[0].getPluginData('style') || 'modern';

          if (oldThickness === msgThickness && oldShadow === msgShadow && oldStyle === msgStyle && oldOpacity === msgOpacity && oldShadowBlur === msgShadowBlur) {
            skipThisNode = true;
          } else {
            existingStickers.forEach(s => {
              try { s.remove(); } catch (e) { }
            });
          }
        }

        if (skipThisNode) {
          skippedCount++;
          finalSelection.push(node);
          if (existingStickers.length > 0) finalSelection.push(existingStickers[0]);
          continue;
        }

        // 4. Calculate placement
        const targetParent = isContainer ? node : node.parent;
        let minIndex = 0;
        if (!isContainer) {
          minIndex = targetParent.children.indexOf(node);
          if (minIndex === -1) minIndex = targetParent.children.length;
        }

        // 5. Clone and flatten selection into a single base silhouette
        var clone = node.clone();
        var baseVector;
        try {
          baseVector = figma.flatten([clone]);
        } catch (e) {
          baseVector = clone;
        }

        var tempParent = baseVector.parent;
        var thickness = parseInt(msgThickness, 10);
        var physicalThickness = thickness;
        var glowSize = 0;

        if (msgStyle === 'neon') {
          physicalThickness = Math.max(1, thickness / 2);
          glowSize = thickness / 2;
        }

        // 6. Apply stroke and convert it to pure fill geometry
        if ('strokes' in baseVector) {
          baseVector.strokes = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
          baseVector.strokeWeight = physicalThickness;
          baseVector.strokeAlign = 'OUTSIDE';
          baseVector.strokeJoin = 'ROUND';
          baseVector.strokeCap = 'ROUND';

          var outlinedStroke = null;
          try {
            outlinedStroke = baseVector.outlineStroke();
          } catch (e) { }

          if (outlinedStroke) {
            baseVector.strokes = [];
            try {
              var merged = figma.union([baseVector, outlinedStroke], tempParent);
              var stickerBg = figma.flatten([merged]);
            } catch (e) {
              var stickerBg = outlinedStroke;
            }
          } else {
            baseVector.strokes = [];
            var stickerBg = baseVector;
          }
        } else {
          var stickerBg = baseVector;
        }

        // 7. Remove inner artifact paths — keep only the outermost contour
        try {
          if ('vectorPaths' in stickerBg) {
            var vPaths = stickerBg.vectorPaths;
            var allSubs = [];

            for (var pi = 0; pi < vPaths.length; pi++) {
              var pathData = vPaths[pi].data;
              var rule = vPaths[pi].windingRule;
              var parts = pathData.split(/(?=M)/);
              for (var si = 0; si < parts.length; si++) {
                var part = parts[si].trim();
                if (part.length < 5) continue;
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

            allSubs.sort(function (a, b) { return b.area - a.area; });

            if (allSubs.length > 0) {
              stickerBg.vectorPaths = [{ windingRule: allSubs[0].rule, data: allSubs[0].data }];
            }
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
        var dominantColor = { r: 0, g: 1, b: 1 };
        function extractColor(nodes) {
          var backupColor = null;
          for (var idx = 0; idx < nodes.length; idx++) {
            var n = nodes[idx];
            if (n.getPluginData('isSticker') === 'true') continue;

            if (n.type !== 'FRAME' && n.type !== 'SECTION' && n.type !== 'GROUP' && n.type !== 'COMPONENT' && n.type !== 'COMPONENT_SET') {
              if ('fills' in n && Array.isArray(n.fills)) {
                for (var f = 0; f < n.fills.length; f++) {
                  if (n.fills[f].type === 'SOLID' && n.fills[f].visible !== false) {
                    var c = n.fills[f].color;
                    if (Math.abs(c.r - c.g) < 0.1 && Math.abs(c.g - c.b) < 0.1) {
                      if (!backupColor) backupColor = c;
                    } else {
                      return c;
                    }
                  }
                }
              }
            }
            if ('children' in n) {
              var childColor = extractColor(n.children);
              if (childColor) return childColor;
            }
          }
          return backupColor;
        }

        var extracted = extractColor([node]);
        if (extracted) { dominantColor = extracted; }

        // Apply Fills and Strokes based on Style
        if ('strokes' in stickerBg) stickerBg.strokes = [];
        if ('effects' in stickerBg) stickerBg.effects = [];

        if ('fills' in stickerBg) {
          switch (msgStyle) {
            case 'retro':
              stickerBg.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
              break;
            case 'holographic':
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

              function simulatedFade(c, position) {
                var targetOpacity = parseInt(msgOpacity, 10) / 100;
                var fadeRange = 1.0 - targetOpacity;
                var blendRatio = 1.0 - (fadeRange * position);
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
              stickerBg.fills = [{ type: 'SOLID', color: { r: 0.05, g: 0.05, b: 0.1 } }];
              break;
            case 'gold':
              function goldSimulatedFade(c, position) {
                var targetOpacity = parseInt(msgOpacity, 10) / 100;
                var fadeRange = 1.0 - targetOpacity;
                var blendRatio = 1.0 - (fadeRange * position);
                return {
                  r: Math.min(1, c.r * blendRatio + 1.0 * (1 - blendRatio)),
                  g: Math.min(1, c.g * blendRatio + 1.0 * (1 - blendRatio)),
                  b: Math.min(1, c.b * blendRatio + 1.0 * (1 - blendRatio)),
                  a: 1
                };
              }

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
        }

        // Apply Effects
        var effects = [];

        if (msgStyle === 'neon') {
          var neonC = { r: dominantColor.r, g: dominantColor.g, b: dominantColor.b };
          var max = Math.max(neonC.r, neonC.g, neonC.b);

          if (max < 0.2) {
            neonC = { r: 0, g: 1, b: 1 };
          } else {
            neonC.r = neonC.r / max;
            neonC.g = neonC.g / max;
            neonC.b = neonC.b / max;
          }

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

        if (msg.shadow === 'true' || msg.shadow === true) {
          var userBlur = parseInt(msgShadowBlur, 10);
          var baseShadow = {
            type: 'DROP_SHADOW',
            color: { r: 0, g: 0, b: 0, a: 0.25 },
            offset: { x: 0, y: userBlur / 2.5 },
            radius: userBlur,
            spread: 0,
            visible: true,
            blendMode: 'NORMAL'
          };

          if (msgStyle === 'retro') {
            baseShadow.offset = { x: 10, y: 10 };
          } else if (msgStyle === 'neon') {
            baseShadow.color.a = 0.5;
            baseShadow.radius = 16;
          }

          effects.push(baseShadow);
        }

        if ('effects' in stickerBg) stickerBg.effects = effects;

        // 9. Insert and adjust positioning
        try {
          targetParent.insertChild(minIndex, stickerBg);

          if ('layoutMode' in targetParent && targetParent.layoutMode !== 'NONE') {
            stickerBg.layoutPositioning = 'ABSOLUTE';
          }

          if (isContainer && targetParent.type !== 'GROUP') {
            stickerBg.x -= targetParent.x;
            stickerBg.y -= targetParent.y;
          }

          if ('clipsContent' in targetParent) {
            targetParent.clipsContent = false;
          }
        } catch (e) {
          stickerBg.remove();
          continue;
        }

        finalSelection.push(stickerBg);
        finalSelection.push(node);
        processedCount++;
      }

      if (finalSelection.length > 0) {
        figma.currentPage.selection = finalSelection;
      }

      if (processedCount > 0) {
        figma.notify(processedCount === 1 ? "Sticker created successfully!" : `${processedCount} stickers created successfully!`);
      } else if (skippedCount > 0) {
        figma.notify("Stickers already match these properties.");
      } else {
        figma.notify("Could not create stickers.");
      }

    } catch (error) {
      console.error(error);
      figma.notify("Error creating stickers. Make sure shapes can be flattened.");
    }
  }
};