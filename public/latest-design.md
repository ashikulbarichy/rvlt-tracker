# Updated Design Philosophy

## Core Principles
The app adheres to a modern minimalist, charcoal-based design philosophy. Precision and function are prioritized over decoration. Hierarchy and depth are achieved through shifts in surface tones rather than shadows, glows, or gradients. The UI utilizes a near-neutral charcoal base, avoiding pure black or colored blacks (like navy or brown-black). A single accent color is used deliberately and sparingly to mark primary actions and active states. 

## Typography (Overwritten in implementation)
While the original design guidelines specified `Inter` as the primary font and `JetBrains Mono` as the monospace font, the actual implementation has slightly diverged:
- **Primary UI / Body Text**: `Inter` is implemented in `tailwind.config.js` and loaded in `index.html`. It is actively used as the default font.
- **Secondary Font**: `Karla` is imported in `index.html` alongside `Inter`, despite not being in the original design document.
- **Monospace**: `JetBrains Mono` is mapped in `tailwind.config.js` for monospace styles, but it is currently missing from the Google Fonts import in `index.html`. 

## Color Palette (Overwritten in implementation)

The base surface colors in the live application (`index.css`) have been shifted darker compared to the original design specification. Below is the updated and applied color palette.

### Background and Surfaces
| Token | Live Value (`index.css`) | Original Spec (`design.md`) | Usage |
|---|---|---|---|
| `--color-bg-base` | **`#0A0A0A`** | `#121212` | Primary app background |
| `--color-bg-surface` | **`#121212`** | `#1A1A1A` | Cards, panels, sidebar |
| `--color-bg-surface-raised` | **`#1A1A1A`** | `#232323` | Modals, dropdowns, popovers |
| `--color-bg-surface-hover` | **`#232323`** | `#2A2A2A` | Hover state on rows/items |

### Borders
| Token | Live Value | Usage |
|---|---|---|
| `--color-border` | `#333333` | Dividers, borders |
| `--color-border-strong` | `#454545` | Emphasized borders (focused input, active tab) |

### Text
| Token | Live Value | Usage |
|---|---|---|
| `--color-text-primary` | `#EDEDED` | Primary text |
| `--color-text-secondary` | `#A3A3A3` | Secondary text, metadata, timestamps |
| `--color-text-tertiary` | `#6B6B6B` | Placeholder text, disabled states |

### Accents & Status
| Token | Live Value | Usage |
|---|---|---|
| `--color-accent-primary` | `#4C8DFF` | Primary actions, active nav item, links, focus rings |
| `--color-accent-primary-hover` | `#699DFF` | Hover state for primary accent |
| `--color-accent-muted` | `#233047` | Selected-row background, subtle accent fill |
| `--color-success` | `#4ADE9E` | Success states |
| `--color-warning` | `#F0B84C` | Warning states |
| `--color-error` | `#F0654C` | Error/destructive states |
| `--color-info` | `#4C8DFF` | Informational states |

### Button Variables (Added in implementation)
- `--color-button-primary`: `var(--color-accent-primary)`
- `--color-button-primary-hover`: `var(--color-accent-primary-hover)`
- `--color-button-text`: `#121212`
