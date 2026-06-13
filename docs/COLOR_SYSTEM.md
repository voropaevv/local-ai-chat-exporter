# Color System

The central app palette is defined in `src/ui/styles/palette.css`.

## Jelluvi Palette

- `--jelluvi-cyan`: `#00C6FF`
- `--jelluvi-blue`: `#168BFF`
- `--jelluvi-deep-blue`: `#005FEF`
- `--jelluvi-pupil-navy`: `#0D1B4D`
- `--jelluvi-ice`: `#E6F7FF`
- `--jelluvi-white`: `#FFFFFF`
- `--jelluvi-mist`: `#F7FAFF`
- `--jelluvi-frost`: `#F1F7FE`
- `--jelluvi-line`: `#D7E2EF`
- `--jelluvi-slate`: `#64748B`
- `--jelluvi-night`: `#0B1220`
- `--jelluvi-night-surface`: `#151E2E`
- `--jelluvi-night-lifted`: `#1A2232`
- `--jelluvi-night-line`: `#2A3447`
- `--jelluvi-moon-text`: `#F8FAFC`
- `--jelluvi-moon-muted`: `#8A94A6`
- `--jelluvi-mint`: `#18C992`
- `--jelluvi-mint-glow`: `#22D3A6`
- `--jelluvi-amber`: `#F59E0B`
- `--jelluvi-amber-glow`: `#FBBF24`
- `--jelluvi-coral`: `#EF4444`
- `--jelluvi-coral-glow`: `#F87171`

## Light Theme Mapping

- `--color-bg`: `var(--jelluvi-mist)`
- `--color-surface`: `var(--jelluvi-white)`
- `--color-surface-muted`: `var(--jelluvi-frost)`
- `--color-border`: `var(--jelluvi-line)`
- `--color-text`: `var(--jelluvi-pupil-navy)`
- `--color-text-muted`: `var(--jelluvi-slate)`
- `--color-primary`: `var(--jelluvi-blue)`
- `--color-primary-hover`: `#0877E8`
- `--color-primary-soft`: `var(--jelluvi-ice)`
- `--color-accent`: `var(--jelluvi-cyan)`
- `--color-success`: `var(--jelluvi-mint)`
- `--color-warning`: `var(--jelluvi-amber)`
- `--color-danger`: `var(--jelluvi-coral)`

## Dark Theme Mapping

- `--color-bg`: `var(--jelluvi-night)`
- `--color-surface`: `var(--jelluvi-night-surface)`
- `--color-surface-muted`: `var(--jelluvi-night-lifted)`
- `--color-border`: `var(--jelluvi-night-line)`
- `--color-text`: `var(--jelluvi-moon-text)`
- `--color-text-muted`: `var(--jelluvi-moon-muted)`
- `--color-primary`: `var(--jelluvi-blue)`
- `--color-primary-hover`: `#39D9FF`
- `--color-primary-soft`: `rgba(0, 198, 255, 0.14)`
- `--color-accent`: `var(--jelluvi-cyan)`
- `--color-success`: `var(--jelluvi-mint-glow)`
- `--color-warning`: `var(--jelluvi-amber-glow)`
- `--color-danger`: `var(--jelluvi-coral-glow)`

Components should consume semantic `--color-*` tokens rather than hard-coded brand hex values.
Primary buttons use Jelluvi Blue. Focus rings and active outlines use Jelluvi Cyan.
