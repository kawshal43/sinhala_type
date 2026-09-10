# AutoCap styled-caption MOGRT contract

AutoCap can place every generated caption as an independently timed Motion Graphics Template item. The template must expose a text property and may expose the style properties below.

## Required control

Expose one text control with one of these names:

- `Text`
- `Caption`
- `Caption Text`
- `Source Text`
- `Title`

AutoCap stops after the first item when it cannot find this control, preventing a timeline full of blank graphics.

## Mixed Sinhala and English

Keep the template text engine and AutoCap output in Unicode. The bundled template and extension use `Noto Sans Sinhala` (and also bundle `Abhaya Libre`), which contain complete Sinhala and Latin (English) glyphs. Legacy Wije and ISI encoding should be reserved for Sinhala-only workflows.

## Bundled default template

AutoCap bundles `AutoCapCaption.mogrt` directly within the extension. Users never need to provide or locate a `.mogrt` file during normal operation. Every caption placed on the timeline exposes its source text, font, faux style, and font size in Premiere's Properties panel. Users can also apply Premiere effects to the resulting graphic clip.

## Custom template override (Advanced)

Power users may create a custom caption template in Premiere or After Effects. It must expose an editable text control using one of the required names above. In AutoCap, go to **Settings > Advanced / Developer Settings** and set the custom `.mogrt` path. AutoCap will use that template instead of the bundled default.
