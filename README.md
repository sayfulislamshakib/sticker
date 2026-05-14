# Figma Sticker Generator Plugin

A professional-grade Figma plugin that instantly generates beautiful, high-fidelity sticker backgrounds for your shapes, icons, text, or groups. With advanced contour detection and dynamic style generation, this plugin helps you turn any Figma layer into a stunning, production-ready sticker in seconds.

## Features

- **Instant Silhouette Generation**: Select one or more layers, and the plugin automatically merges them, calculates the outermost contour, and removes inner path artifacts to create a clean, single sticker background.
- **Dynamic Color Detection**: The plugin smartly detects the dominant color of your selected artwork to apply matching tints to styles like Neon and Holographic.
- **Multiple Aesthetic Styles**:
  - **Modern**: Clean, solid white background with optional drop shadows.
  - **Retro**: Bold solid drop shadows for a classic pop-art/retro feel.
  - **Holographic**: Iridescent, metallic gradients that adapt to your artwork's dominant color with a soft pinkish aura.
  - **Neon Glow**: Dark background with intense, double-layered bright neon strokes matching your artwork.
  - **Gold Foil**: Premium diagonal metallic gold gradient with customizable fade opacity.
- **Customizable Properties**:
  - **Border Thickness**: Adjust the padding/border width from 2px up to 64px.
  - **Shadows**: Toggle drop shadows and adjust the shadow blur to lift your sticker off the canvas.
  - **Fade Opacity**: Fine-tune the blend intensity for Holographic and Gold styles.
- **Smart Replacement**: Re-running the plugin on an existing sticker automatically updates the background without creating duplicates.
- **Reset to Defaults**: Quickly revert all settings to their default values with a single click.

## How to Use

1. Run the **Sticker** plugin in Figma.
2. Select the layers (shapes, text, frames, or groups) you want to turn into a sticker.
3. Configure your desired **Border Thickness**, **Style**, and **Shadow** settings in the plugin UI.
4. Click **Create**.
5. A single "Sticker Background" shape will be placed directly behind your selection.

## Installation / Development

To use this plugin locally for development:
1. Open the Figma desktop app.
2. Go to **Plugins** -> **Development** -> **Import plugin from manifest...**
3. Select the `manifest.json` file in this directory.
