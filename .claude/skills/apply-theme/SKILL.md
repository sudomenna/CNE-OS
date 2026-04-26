---
name: apply-theme
description: Aplica um tema shadcn/studio (@ss-themes) no projeto CNE-OS, convertendo variáveis OKLCH para HSL puro (compatível com Tailwind v3). Preserva a estrutura do globals.css.
---

Você vai aplicar um tema shadcn no projeto CNE-OS.

O argumento passado pelo usuário é o nome do tema, que pode ser:
- Formato curto: `material-design`, `spotify`, `claude`
- Formato namespace: `@ss-themes/material-design`
- URL direta: `https://shadcnstudio.com/r/themes/material-design.json`

## Passo 1 — Resolver o nome do tema

Normalize o argumento para o nome curto. Exemplos:
- `@ss-themes/material-design` → `material-design`
- `material-design` → `material-design`
- URL → extraia o filename sem `.json`

Monte a URL do registry: `https://shadcnstudio.com/r/themes/{nome}.json`

## Passo 2 — Buscar o JSON do tema

Use WebFetch na URL montada. O JSON tem estrutura:

```json
{
  "name": "...",
  "cssVars": {
    "theme": { "--primary": "oklch(...)", ... },
    "light": { "--background": "oklch(...)", ... },
    "dark":  { "--background": "oklch(...)", ... }
  }
}
```

Pode também aparecer como campos `light` e `dark` diretamente (sem `cssVars`). Adapte conforme o que vier.

Extraia todos os pares `--variavel: valor` dos blocos light (`:root`) e dark (`.dark`).

## Passo 3 — Converter OKLCH → HSL via Node.js

Execute o seguinte script Node.js inline via Bash, passando as variáveis como JSON. O script converte cada valor e imprime o resultado em formato CSS pronto.

```bash
node -e "
const vars = JSON.parse(process.argv[1]);

function oklchToHsl(str) {
  const m = str.match(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/i);
  if (!m) return str; // não é oklch, retorna original

  let [, L, C, H] = m.map(Number);

  // OKLCH → OKLab
  const hRad = H * Math.PI / 180;
  const a = C * Math.cos(hRad);
  const b = C * Math.sin(hRad);

  // OKLab → linear sRGB
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;

  const ll = l_*l_*l_, mm = m_*m_*m_, ss = s_*s_*s_;

  let r =  4.0767416621*ll - 3.3077115913*mm + 0.2309699292*ss;
  let g = -1.2684380046*ll + 2.6097574011*mm - 0.3413193965*ss;
  let bv= -0.0041960863*ll - 0.7034186147*mm + 1.7076147010*ss;

  // clamp
  r = Math.max(0, Math.min(1, r));
  g = Math.max(0, Math.min(1, g));
  bv= Math.max(0, Math.min(1, bv));

  // linear → sRGB gamma
  const gamma = x => x <= 0.0031308 ? 12.92*x : 1.055*Math.pow(x,1/2.4)-0.055;
  r = gamma(r); g = gamma(g); bv = gamma(bv);

  // sRGB → HSL
  const max = Math.max(r,g,bv), min = Math.min(r,g,bv);
  const lh = (max+min)/2;
  let hh=0, sh=0;
  if (max !== min) {
    const d = max - min;
    sh = lh > 0.5 ? d/(2-max-min) : d/(max+min);
    if (max===r) hh = ((g-bv)/d + (g<bv?6:0))/6;
    else if (max===g) hh = ((bv-r)/d + 2)/6;
    else hh = ((r-g)/d + 4)/6;
  }

  const hDeg = Math.round(hh*360);
  const sPct = Math.round(sh*100);
  const lPct = Math.round(lh*100);
  return hDeg + ' ' + sPct + '%' + ' ' + lPct + '%';
}

const result = {};
for (const [k,v] of Object.entries(vars)) {
  result[k] = oklchToHsl(String(v));
}
console.log(JSON.stringify(result));
" '<JSON_DAS_VARS>'
```

Substitua `<JSON_DAS_VARS>` pelo JSON real extraído no Passo 2.

Faça isso duas vezes: uma para as variáveis light, uma para as dark.

## Passo 4 — Montar o novo globals.css

Leia o `app/globals.css` atual. Substitua **apenas** o conteúdo interno do bloco `:root { ... }` e `.dark { ... }` dentro do primeiro `@layer base`, preservando:
- As diretivas `@tailwind base/components/utilities`
- O segundo `@layer base` com `border-border` e `bg-background text-foreground`
- Qualquer CSS customizado que existir abaixo

O novo bloco deve ter o formato:

```css
@layer base {
  :root {
    --background: <valor HSL>;
    --foreground: <valor HSL>;
    /* ... todos os outros tokens ... */
    --radius: <valor do tema ou 0.5rem como fallback>;
  }

  .dark {
    --background: <valor HSL>;
    /* ... */
  }
}
```

**Tokens obrigatórios** (se o tema não tiver, use os valores do globals.css atual como fallback):
`:root` → `background, foreground, card, card-foreground, popover, popover-foreground, primary, primary-foreground, secondary, secondary-foreground, muted, muted-foreground, accent, accent-foreground, destructive, destructive-foreground, border, input, ring, radius`

`.dark` → os mesmos, exceto `radius`.

Tokens sidebar (`--sidebar-*`) e chart (`--chart-*`): inclua se o tema tiver, omita se não tiver (o CSS atual tem fallbacks).

## Passo 5 — Verificar

Após escrever o `globals.css`, rode:

```bash
pnpm typecheck
```

Se passar, confirme ao usuário quais tokens foram aplicados e quais usaram fallback. Mostre as cores principais (`--primary`, `--background`, `--sidebar`) em formato legível.

## Regras

- **Nunca** escreva `oklch(...)` no `globals.css` — o projeto usa Tailwind v3 com `hsl(var(--...))`.
- **Nunca** adicione `@import "tw-animate-css"` ou `@import "shadcn/tailwind.css"` — são Tailwind v4.
- **Nunca** modifique o `tailwind.config.ts`.
- Se o JSON do tema não tiver campos light/dark separados (alguns temas têm só um bloco), aplique os mesmos valores em `:root` e ajuste `.dark` invertendo luminosidade.
- Se WebFetch retornar erro 404, informe o usuário que o tema não existe no registry e sugira verificar em https://shadcnstudio.com/theme-generator.
