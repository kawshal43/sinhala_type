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

## Optional controls

AutoCap matches control names without case or punctuation differences.

| AutoCap setting | Supported exposed names | Value expected by the template |
| --- | --- | --- |
| Unicode Font | `Font`, `Font Family`, `Font Name` | Text containing the installed font family name |
| Font Size | `Font Size`, `Text Size`, `Size` | Number |
| Text Color | `Fill Color`, `Text Color`, `Font Color`, `Color` | Color control |
| Position X | `Position X`, `X Position`, `Text X` | Number |
| Position Y | `Position Y`, `Y Position`, `Text Y` | Number |
| Alignment | `Alignment`, `Text Alignment`, `Align` | Dropdown: Left, Center, Right |
| Stroke Width | `Stroke Width`, `Outline Width`, `Stroke` | Number |
| Shadow | `Shadow`, `Drop Shadow`, `Shadow Enabled` | Checkbox |
| Background | `Background`, `Background Enabled`, `Box` | Checkbox |
| Animation | `Animation`, `Animation Style`, `Effect`, `Effect Style` | Dropdown: None, Fade, Pop, Slide Up |

The dropdown order matters because Premiere exposes dropdown selections as one-based numeric values.

## Mixed Sinhala and English

Keep the template text engine and AutoCap output in Unicode. Choose a font that contains both Sinhala and Latin glyphs, such as `Noto Sans Sinhala`. Legacy Wije and ISI encoding should be reserved for Sinhala-only workflows.

## Bundled default template

AutoCap bundles `AutoCapCaption.mogrt` directly within the extension. Users never need to provide or locate a `.mogrt` file during normal operation. Every caption placed on the timeline is immediately editable in Premiere's Essential Graphics / Properties panel with full Sinhala and English Unicode support via the bundled `Noto Sans Sinhala` font.

## Custom template override (Advanced)

For power users who create custom caption templates in After Effects:
Create your design in After Effects, connect controls to the text layer with expressions, expose them in Essential Graphics matching the table above, and export as a `.mogrt`. In AutoCap, go to **Settings > Advanced / Developer Settings** and set your custom `.mogrt` path. AutoCap will use your template instead of the bundled default.

