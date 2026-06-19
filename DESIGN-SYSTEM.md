# Xantle — Design System

**Source of truth:** [`sample-ui.png`](./sample-ui.png) (the approved UI sample) → tokens in
[`src/theme.ts`](./src/theme.ts).

> **THE RULE:** Never write a raw hex value in a screen. Import from `src/theme.ts`.
> If you need a colour that isn't here, **add it to `theme.ts` with a name** and note it in this
> file. Do **not** invent one-off colours inline. We ship **one** palette.

```ts
import { colors, gradients, radius, space, font, text, shadow } from '../theme';
```

---

## 1. Colours

### Backgrounds (dark slate-navy canvas)
| Token | Hex | Use |
|---|---|---|
| `colors.bg` | `#1C222B` | App background (the base everywhere) |
| `colors.bgTop` | `#232A36` | Top of the background gradient |
| `colors.bgBottom` | `#161B23` | Bottom of the background gradient |

Every screen's root uses the background gradient:
```tsx
<View style={{ flex: 1, backgroundColor: colors.bg, overflow: 'hidden' }}>
  <GradientFill colors={gradients.background} />
  {/* content */}
</View>
```

### Surfaces (cards & chips)
| Token | Hex | Use |
|---|---|---|
| `colors.surface` | `#303747` | Card / icon-chip surface |
| `colors.surfaceAlt` | `#3A4250` | Lighter edge / pressed state |
| `colors.hairline` | `rgba(255,255,255,0.06)` | 1px separators / glassy borders |

### Brand blue
| Token | Hex | Use |
|---|---|---|
| `colors.blue` | `#3B9DE7` | Primary accent (icons, active state, glow) |
| `colors.blueBright` | `#489AE7` | Gradient start |
| `colors.blueDeep` | `#3B6DCF` | Royal blue, gradient end |
| `colors.royal` | `#4967E0` | Alt deep blue |
| `colors.cyan` | `#6BC9F5` | Cyan accent (featured/hero cards) |

### Text
| Token | Hex | Use |
|---|---|---|
| `colors.text` | `#EAF0FA` | Primary text — headings & body |
| `colors.textMuted` | `#939BA7` | Secondary text |
| `colors.textFaint` | `#6086A9` | Faint labels / hints (the "PLATFORM / RELEASE" labels) |
| `colors.white` | `#FFFFFF` | On-gradient text (button labels) |

### Gradients (use `<GradientFill colors={...} />`)
| Token | Stops | Use |
|---|---|---|
| `gradients.background` | `#232A36 → #161B23` | App canvas |
| `gradients.button` | `#489AE7 → #3B6DCF` | Primary CTA (light blue → royal) |
| `gradients.featured` | `#6BC9F5 → #3B9DE7` | Featured / hero cards (cyan → blue) |

---

## 2. Radius & spacing
- **Radius** (`radius`): `sm 12` · `md 16` · `lg 20` · `xl 28` (big cards) · `pill 999`
- **Spacing** (`space`): `xs 6` · `sm 10` · `md 16` · `lg 24` · `xl 32`

## 3. Shadows
- `shadow.card` — soft neumorphic drop for cards/chips (black, low opacity, large blur).
- `shadow.blueGlow` — blue glow under primary buttons.

---

## 4. Typography
Two families (loaded in `src/app/_layout.tsx`):
- **Space Grotesk** (`font.display`, `font.displayMedium`) — the **logo** and big display headings only.
- **Nunito** (`font.regular/semibold/bold/extrabold/black`) — **all** UI text.

Type scale in `text`:
| Token | Family / size | Use |
|---|---|---|
| `text.h1` | Nunito ExtraBold 28 | Screen titles ("Dual Sense") |
| `text.h2` | Nunito ExtraBold 22 | Section titles |
| `text.title` | Nunito Bold 18 | Card titles |
| `text.body` | Nunito SemiBold 15 | Body copy |
| `text.label` | Nunito Bold 12, tracked, `textFaint` | Tiny labels ("PLATFORM") |
| `text.hint` | Nunito SemiBold 13, `textMuted` | Hints / captions |

---

## 5. Component patterns

### Card (neumorphic surface)
```tsx
<View style={{ backgroundColor: colors.surface, borderRadius: radius.xl, padding: space.lg, ...shadow.card }}>
  ...
</View>
```

### Primary button (gradient + glow) — see the landing CTA
```tsx
<Pressable>
  <View style={{ borderRadius: radius.lg, overflow: 'hidden', ...shadow.blueGlow }}>
    <View style={{ borderRadius: radius.lg, paddingVertical: 20, overflow: 'hidden', alignItems: 'center' }}>
      <GradientFill colors={gradients.button} />
      <Text style={{ color: colors.white, fontFamily: font.extrabold, fontSize: 18 }}>Label</Text>
    </View>
  </View>
</Pressable>
```

### Icon chip (the small rounded squares)
```tsx
<View style={{ width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.surface,
               alignItems: 'center', justifyContent: 'center', ...shadow.card }}>
  {/* icon tinted colors.blue */}
</View>
```

### Featured / hero card (cyan→blue gradient)
```tsx
<View style={{ borderRadius: radius.xl, overflow: 'hidden' }}>
  <GradientFill colors={gradients.featured} />
  {/* content over the gradient */}
</View>
```

---

## 6. Gradients without native modules
We render gradients with [`src/components/GradientFill.tsx`](./src/components/GradientFill.tsx) (interpolated
colour slices), **not** `expo-linear-gradient` — that one needs a native rebuild and the current dev
build doesn't include it. Always use `<GradientFill />`.

---

**Reference implementation:** the landing screen [`src/app/index.tsx`](./src/app/index.tsx) uses only these
tokens. Match it. New screens that introduce colours outside this file will be sent back.
