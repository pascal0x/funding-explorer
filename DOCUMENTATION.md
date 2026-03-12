# Funding Rate Explorer — Documentation

> Exporté le 2026-03-12

---

## Vue d'ensemble

Application web React de visualisation et comparaison des **funding rates** (taux de financement) des marchés de futures perpétuels crypto, sur plusieurs exchanges CEX et DEX.

---

## Stack technique

| Élément | Version |
|---------|---------|
| React | 19.2.0 |
| Vite | 7.3.1 |
| Recharts | 3.8.0 |
| ESLint | 9.39.1 |

- Pas de state manager externe (Redux, Zustand) — hooks React uniquement (useState, useEffect, useCallback, useRef)
- Styles inline uniquement (pas de CSS-in-JS lib, pas de Tailwind)

---

## Structure des fichiers

```
funding-explorer/
├── src/
│   ├── App.jsx          # Application entière (~1800 lignes, monolithique)
│   ├── main.jsx         # Point d'entrée React
│   ├── App.css          # CSS minimal hérité
│   └── index.css        # Reset global
├── index.html           # Entrée HTML
├── package.json
├── vite.config.js
├── launch.sh            # Lance un serveur local port 3000 + ouvre Chrome
└── dist/                # Build prod (généré)
```

Toute la logique est dans `src/App.jsx` — pas de split en fichiers séparés.

---

## Pages de l'application

Navigation sidebar à gauche (4 onglets) :

### 1. Explorer
- Sélectionne un venue, une catégorie d'actif, un actif, une période (7 / 30 / 90 jours)
- Affiche le graphique historique du funding rate + stats (avg / max / min en APR %)
- Live rate auto-refresh toutes les 60s
- Pour Hyperliquid : sous-sélecteur **HIP-3** (DEXs builders sur HL)
- Table des données brutes (50 lignes / page)

### 2. Trend
- Analyse de moving averages du funding rate
- Mode **daily** : MA 7j / 30j / 90j
- Mode **intraday** : fenêtres de 6h à 7j
- Signal BULL / BEAR / FLAT basé sur la MA

### 3. Compare
- Tableau multi-venues chargé en parallèle (2 assets à la fois)
- APR moyen sur 7 / 30 / 90 jours par venue
- Filtrable par catégorie, triable par colonne
- Chargement progressif avec barre de progression

### 4. Spread (Arbitrage)
- Comparaison HL vs Binance vs Bybit sur les assets communs
- Calcul d'opportunités d'arbitrage de funding
- Sélecteur de période : 7d / 30d / 90d (défaut : 30d)

---

## Venues supportés

| ID | Label | Catégories | Fréquence APR |
|----|-------|-----------|---------------|
| `hl` | Hyperliquid | Crypto + Stocks + FX + Commodities | 24 × 365 (1h) |
| `bn` | Binance | Crypto uniquement | 3 × 365 (8h) |
| `by` | Bybit | Crypto uniquement | 3 × 365 (8h) |
| `okx` | OKX | Crypto uniquement | 3 × 365 (8h) |
| `dy` | dYdX | Crypto uniquement (13 assets) | 24 × 365 (1h) |
| `lt` | Lighter | Crypto uniquement (8 assets) | 24 × 365 (1h) |
| `ad` | Asterdex | Crypto uniquement | 3 × 365 (8h) |

**HIP-3** : Sous-sélecteur Hyperliquid pour les DEXs builders (chargé dynamiquement via API). Affiché uniquement quand HL est sélectionné.

---

## Catégories d'actifs

| Catégorie | Assets | Venues |
|-----------|--------|--------|
| Crypto | HYPE, BTC, ETH, SOL, AVAX, ARB, OP, MATIC, DYDX, BNB, WIF, LINK, SUI, APT, kPEPE, SPX | Tous |
| Stocks | NVDA, TSLA, AAPL, MSFT, META, AMZN, GOOGL, COIN, AMD, NFLX, PLTR, HOOD, MSTR, RKLB, IONQ, SMCI, INTC, MU, RDDT | HL uniquement |
| Commodities | GOLD, SILVER, NATGAS, BRENTOIL, COPPER, PLATINUM, PALLADIUM, URANIUM, ALUMINIUM | HL uniquement |
| FX/ETF | EUR, JPY, DXY, EWJ, EWY | HL uniquement |

**Assets XYZ** (Hyperliquid HIP-3) : Stocks et FX sont préfixés `xyz:` dans l'API (ex: `xyz:NVDA`). La fonction `isXyz()` détecte ce cas.

---

## APIs utilisées (toutes publiques, pas de clé)

| Venue | Endpoint principal |
|-------|-------------------|
| Hyperliquid | `https://api.hyperliquid.xyz/info` (POST, body JSON) |
| Binance Futures | `https://fapi.binance.com/fapi/v1/fundingRate` |
| Bybit | `https://api.bybit.com/v5/market/funding/history` |
| OKX | `https://www.okx.com/api/v5/public/funding-rate-history` |
| dYdX | `https://indexer.dydx.trade/v4/historicalFunding` |
| Lighter | `https://mainnet.zklighter.elliot.ai/api/v1/` |

Toutes les APIs sont appelées directement depuis le navigateur (CORS OK). Pas de backend/proxy.

---

## Logique de calcul APR

```
APR (%) = rate × fréquence_annuelle × 100
```

La fréquence varie par venue. La constante `VENUE_FREQ` dans `App.jsx` contient les valeurs :

```javascript
const VENUE_FREQ = {
  hl:  24 * 365,   // 8760  — funding 1h
  bn:   3 * 365,   // 1095  — funding 8h
  by:   3 * 365,
  okx:  3 * 365,
  dy:  24 * 365,
  lt:  24 * 365,
  ad:   3 * 365,
};
```

---

## Design system

### Thème jour/nuit

L'app suit automatiquement la préférence système (`prefers-color-scheme`). Les couleurs sont des CSS custom properties dans `src/index.css`.

| Token CSS | Dark | Light | Usage |
|-----------|------|-------|-------|
| `--bg` | `#05050d` | `#f0f4f8` | Fond principal |
| `--bg-card` | `#0a0a18` | `#ffffff` | Cards, inputs |
| `--bg-alt` | `#07070f` | `#f4f7fb` | Lignes alternées, tooltips |
| `--bg-dropdown` | `#0f0f20` | `#ffffff` | Menu déroulant CoinSelector |
| `--border` | `#1e3a5f` | `#c8d8ec` | Bordures partout |
| `--border-dim` | `#111827` | `#e2eaf5` | Bordures désactivées |
| `--text` | `#e0e0e0` | `#1a1a2e` | Texte principal |
| `--text-dim` | `#444` | `#445566` | Texte atténué |
| `--text-muted` | `#555` | `#607080` | Texte semi-transparent |
| `--text-label` | `#333` | `#8898b0` | Labels petits |
| `--ghost` | `#2a2a3a` | `#c8d8e8` | Texte fantôme |

**Couleurs d'accent** (identiques dark/light) :
- Bleu primaire : `#4a9eff`
- Positif : `#00d4aa`
- Négatif : `#ff4d6d`

**Couleurs de venue** :
- Hyperliquid `#4a9eff` · Binance `#f0b90b` · Bybit `#e6a817` · OKX `#3d7fff` · dYdX `#6966ff` · Lighter `#00d4aa` · Asterdex `#a855f7`

**Police** : IBM Plex Mono (Google Fonts), monospace, weights 300–600

---

## Navigation

Sidebar collapsible à gauche (200px ouverte / 52px fermée) :
- Toggle `☰` en haut
- Items : Explorer `◈`, Trend `⟲`, Compare `⊞`, Spread `⇌`
- Item actif : fond `#4a9eff22`, bordure gauche bleue, texte bleu
- Bas de sidebar : version, "built by psql", bouton thème `◑ auto / ● dark / ☀ light`

---

## Commandes de développement

```bash
npm run dev       # Serveur dev Vite (localhost:5173)
npm run build     # Build prod → dist/
npm run preview   # Preview du build
npm run lint      # ESLint
```

**Launch script** (`launch.sh`) : sert `dist/` sur le port 3000 et ouvre Chrome en mode app.

---

## Points d'attention

- **Monolithique** : tout est dans `App.jsx`. Si le fichier devient trop grand, envisager de splitter en composants.
- **Pagination HL** : l'API Hyperliquid renvoie 500 entrées max par requête — `fetchAllFunding()` pagine automatiquement.
- **Caches en mémoire** : `_hlDexCache` et `_lighterMarkets` évitent les requêtes répétées. Réinitialisés au rechargement.
- **Symbol mapping** : chaque venue a ses propres conventions de nommage. La fonction `apiCoin()` centralise les mappings.
- **Période par défaut** : Explorer démarre en 7d, Spread démarre en 30d — attention lors des comparaisons inter-pages.
- **Assets non supportés** : la comparaison inter-venues est limitée aux assets présents sur tous les venues sélectionnés.

---

## Branch de développement

`claude/funding-explorer-MZw43` — toutes les modifications Claude sont commitées et pushées sur cette branche.
