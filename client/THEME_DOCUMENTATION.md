# Chorus Dark-Blue Theme Documentation

## Overview
This document outlines the professional dark-blue color theme implemented throughout the Chorus WASM compute platform. The theme combines a sophisticated dark-blue primary palette with complementary ocean cyan accent colors and warm gold secondary colors for a modern, cohesive visual design.

## Color Palette

### Primary: Dark Blue
The primary color palette forms the foundation of the interface, providing a professional and calming backdrop.

- **primary-50**: `#f0f4f9` - Lightest background
- **primary-100**: `#dbe4f0` - Light tint
- **primary-200**: `#b5c8e1` - Medium light
- **primary-300**: `#8fadd2` - Medium
- **primary-400**: `#6991c3` - Medium dark
- **primary-500**: `#4a75b4` - Standard blue
- **primary-600**: `#3a5d91` - Darker blue
- **primary-700**: `#2e4a73` - Deep blue
- **primary-800**: `#1e3048` - Main dark
- **primary-900**: `#0f1820` - Darkest (page background)

**Usage**: Main backgrounds, cards, containers, and secondary UI elements.

### Accent: Ocean Cyan
A vibrant ocean cyan used for interactive elements, highlights, and calls-to-action.

- **accent-50**: `#f0f9fc` - Lightest
- **accent-100**: `#dff1f8` - Light
- **accent-200**: `#b6e3f1` - Light medium
- **accent-300**: `#82d4e9` - Medium light
- **accent-400**: `#4ec5e1` - Medium
- **accent-500**: `#2eb8d9` - Primary accent
- **accent-600**: `#1fa4c6` - Dark accent
- **accent-700**: `#1689b0` - Darker accent
- **accent-800**: `#126e94` - Deep accent
- **accent-900**: `#0e5478` - Darkest accent

**Usage**: Button highlights, active states, progress bars, accent text, and interactive hover effects.

### Secondary: Warm Gold
A warm gold color for secondary actions and positive confirmations.

- **secondary-50**: `#fffbf0` - Lightest
- **secondary-100**: `#fff4dd` - Light
- **secondary-200**: `#ffe8b3` - Light medium
- **secondary-300**: `#ffd97d` - Medium light
- **secondary-400**: `#ffcc52` - Medium
- **secondary-500**: `#ffb800` - Primary gold
- **secondary-600**: `#e6a500` - Dark gold
- **secondary-700**: `#cc8f00` - Darker gold
- **secondary-800**: `#b37800` - Deep gold
- **secondary-900**: `#8a5a00` - Darkest gold

**Usage**: Primary call-to-action buttons, upload actions, positive confirmations.

### Neutral: Slate
Neutral colors for text, borders, and subtle UI elements.

- **neutral-50**: `#f8f9fa` - Lightest
- **neutral-100**: `#f1f3f5` - Light
- **neutral-200**: `#e9ecef` - Light medium
- **neutral-300**: `#dee2e6` - Medium light
- **neutral-400**: `#ced4da` - Medium
- **neutral-500**: `#adb5bd` - Medium dark
- **neutral-600**: `#868e96` - Dark
- **neutral-700**: `#495057` - Darker
- **neutral-800**: `#343a40` - Deep
- **neutral-900**: `#212529` - Darkest

**Usage**: Text, borders, disabled states, and subtle backgrounds.

### Status Colors
- **Success**: `#10b981` - Green for completed/success states
- **Success Background**: `#ecfdf5` - Light green
- **Warning**: `#f59e0b` - Amber for pending/warning states
- **Warning Background**: `#fffbeb` - Light amber
- **Danger**: `#ef4444` - Red for errors/failed states
- **Danger Background**: `#fef2f2` - Light red
- **Info**: `#2eb8d9` - Cyan for informational states (matches accent-500)
- **Info Background**: `#f0f9fc` - Light cyan

## Typography

### Font Family
- **Display Font**: Sora (for headings)
- **Body Font**: Inter with system fallbacks

### Font Sizes
- **h1**: 2.25rem (36px) - Page titles
- **h2**: 1.875rem (30px) - Section headings
- **h3**: 1.5rem (24px) - Card titles
- **h4**: 1.25rem (20px) - Subsection headings
- **body**: 1rem (16px) - Regular text
- **small**: 0.875rem (14px) - Smaller text
- **xs**: 0.75rem (12px) - Tiny text, labels

### Font Weights
- **Light**: 300 (Deprecated - use Medium or Semibold instead)
- **Normal**: 400 (Body text)
- **Medium**: 500 (Secondary labels, hints)
- **Semibold**: 600 (Labels, secondary headings)
- **Bold**: 700 (Primary headings)

## Component Styling

### Buttons

#### Primary Button
- Background: `bg-gradient-to-r from-accent-500 to-accent-600`
- Text: White (`text-white`)
- Hover: `hover:from-accent-600 hover:to-accent-700`
- Shadow: `shadow-md hover:shadow-lg`

#### Secondary Button
- Background: `bg-gradient-to-r from-secondary-500 to-secondary-600`
- Text: Neutral-900 (`text-neutral-900`)
- Hover: `hover:from-secondary-600 hover:to-secondary-700`
- Shadow: `shadow-md hover:shadow-lg`

#### Ghost Button
- Background: `bg-primary-700`
- Text: Neutral-300 (`text-neutral-300`)
- Hover: `hover:text-white hover:bg-primary-600`
- Border: `border border-primary-600`

### Cards
- Background: `bg-primary-800`
- Border: `border border-primary-700`
- Hover Border: `hover:border-accent-500`
- Hover Shadow: `hover:shadow-lg`
- Border Radius: `rounded-xl`

### Input Fields
- Background: `bg-primary-700`
- Border: `border border-primary-600`
- Text: White (`text-white`)
- Placeholder: `placeholder-neutral-500`
- Focus: `focus:ring-2 focus:ring-accent-400 focus:border-transparent`

### Badges
- Base: `inline-flex items-center px-3 py-1 rounded-full text-sm font-medium`
- Primary: `bg-primary-100 text-primary-700`
- Accent: `bg-accent-600 bg-opacity-20 text-accent-300 border border-accent-600 border-opacity-50`
- Success: `bg-green-600 bg-opacity-20 text-green-300 border border-green-600 border-opacity-50`
- Warning: `bg-secondary-600 bg-opacity-20 text-secondary-300 border border-secondary-600 border-opacity-50`
- Danger: `bg-red-600 bg-opacity-20 text-red-300 border border-red-600 border-opacity-50`

### Progress Bars
- Background: `bg-primary-700 rounded-full h-2`
- Fill: `bg-gradient-to-r from-accent-400 to-accent-600 h-full rounded-full transition-all`

## Spacing & Layout

### Spacing Scale
- **xs**: 0.5rem (8px)
- **sm**: 1rem (16px)
- **md**: 1.5rem (24px)
- **lg**: 2rem (32px)
- **xl**: 2.5rem (40px)
- **2xl**: 3rem (48px)

### Border Radius
- **xs**: 0.25rem (4px) - Subtle
- **sm**: 0.375rem (6px) - Small
- **md**: 0.5rem (8px) - Medium
- **lg**: 0.75rem (12px) - Large
- **xl**: 1rem (16px) - Extra large
- **2xl**: 1.5rem (24px) - Double extra large

### Box Shadows
- **xs**: Subtle elevation
- **sm**: Minimal shadow
- **md**: Standard shadow
- **lg**: Prominent shadow
- **xl**: Strong shadow
- **2xl**: Maximum shadow
- **glow**: Cyan glow effect `0 0 20px rgba(46, 184, 217, 0.3)`
- **glow-primary**: Blue glow effect `0 0 20px rgba(74, 117, 180, 0.2)`

## Implementation Notes

### Text Alignment
- All content is properly centered and aligned
- Use flexbox utilities for alignment: `flex items-center justify-center`
- Text is justified to the left for body content: `text-left`
- Centered text for headlines and important information

### Component Alignment
- Cards use proper padding and spacing: `p-6`
- Grid layouts use consistent gaps: `gap-4` or `gap-6`
- Flex containers use proper alignment: `flex-col` for vertical, `flex-row` for horizontal

### Responsive Design
- Mobile-first approach with media queries
- Responsive padding: `px-6 sm:px-8`
- Responsive text sizes: `text-sm sm:text-base`
- Responsive layout: `grid-cols-1 md:grid-cols-2`

## Gradient Examples

### Accent Gradient
```css
bg-gradient-to-r from-accent-500 to-accent-600
```

### Dark Gradient
```css
bg-gradient-to-b from-slate-50 to-slate-100
```

### Primary Gradient
```css
bg-gradient-to-br from-primary-800 to-primary-900
```

## CSS Custom Properties (Variables)

All colors are also available as CSS custom properties in `index.css`:

```css
--primary-50: #f0f4f9;
--primary-900: #0f1820;
--accent-50: #f0f9fc;
--accent-500: #2eb8d9;
--secondary-500: #ffb800;
--neutral-900: #212529;
```

Use them in CSS:
```css
color: var(--accent-500);
background: var(--primary-800);
```

## Accessibility Considerations

- Text contrast ratios meet WCAG AA standards
- Focus states use `focus:ring-2` for visibility
- Color is not the only differentiator - use text labels and icons
- Status messages include both color and text indicators

## Maintenance & Updates

When modifying the theme:
1. Update `tailwind.config.js` for Tailwind utilities
2. Update `index.css` for CSS custom properties
3. Test across all components
4. Update this documentation

## Migration Notes

This theme replaces the previous light theme based on Slate/Violet colors. Key changes:
- Light backgrounds → Dark primary backgrounds
- Violet accent → Ocean cyan accent
- Improved contrast and readability in dark mode
- Consistent gradient usage throughout
- Better visual hierarchy with color layering
