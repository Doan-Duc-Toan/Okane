# Mockup source of truth — design tokens & i18n dictionary

Extracted directly from the approved mockup HTML (the mockup artifact URL is auth-gated and
cannot be fetched by agents — this file is the substitute source of truth). Carry these values
verbatim into the React app's token file; do not invent new values.

## Fonts

```html
<link rel="preconnect" href="https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@500;700&family=Noto+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap">
```
- Headings/`.display`: `"Zen Kaku Gothic New", "Noto Sans", sans-serif`
- Body/UI (`body`): `"Noto Sans", "Hiragino Sans", sans-serif`
- Money/rates (`.num`): `"IBM Plex Mono", ui-monospace, monospace` with `font-variant-numeric: tabular-nums`

## CSS custom properties (light = bare `:root`; dark = media query + `[data-theme]` override, per standard pattern)

```css
:root {
  --ink: #1c2430;
  --ink-soft: #5b6472;
  --ink-faint: #6e7261; /* corrected in Phase 10: original #8a8f7c was 3.03:1 on --paper, fails WCAG AA (4.5:1) for body text */
  --paper: #f7f4ec;
  --surface: #fffdf8;
  --line: #e2dcc9;
  --ai: #1f3a5f;
  --ai-bright: #2f5c8f;
  --ai-soft: #e7edf3;
  --jade: #3f6b52;
  --jade-soft: #e6ede4;
  --vermilion: #b5482f;
  --vermilion-soft: #f6e6df;
  --shadow: 0 1px 2px rgba(28, 36, 48, 0.04), 0 8px 24px rgba(28, 36, 48, 0.06);
}

/* dark: applies under prefers-color-scheme:dark (unless data-theme="light" wins),
   and again under data-theme="dark" (explicit toggle wins either direction) */
--ink: #ece7da;
--ink-soft: #aba497;
--ink-faint: #847e71; /* corrected in Phase 10: original #767065 was 3.72:1 on --paper, fails WCAG AA (4.5:1) for body text */
--paper: #12151c;
--surface: #1a1e27;
--line: #2b2f3a;
--ai: #7ea1cc;
--ai-bright: #9cbbe0;
--ai-soft: rgba(126, 161, 204, 0.14);
--jade: #86b494;
--jade-soft: rgba(134, 180, 148, 0.14);
--vermilion: #e08a70;
--vermilion-soft: rgba(224, 138, 112, 0.14);
--shadow: 0 1px 2px rgba(0, 0, 0, 0.2), 0 8px 24px rgba(0, 0, 0, 0.3);
```

Token roles: `--ai` = primary brand/action (Japanese indigo, "ai-iro"), `--jade` = positive/progress,
`--vermilion` = alerts/destructive, `--paper` = page background, `--surface` = card/panel background,
`--line` = borders/dividers, `--ink`/`--ink-soft`/`--ink-faint` = text hierarchy (primary/secondary/tertiary).

## Layout conventions from the mockup (carry into component design)

- Radius: cards/panels `10px` (`border-radius: 10px`), pills/badges `999px`, small controls `7px`.
- Spacing rhythm: card padding `1.5rem–1.75rem`, section gaps `1.75rem`, field stacks `1.1rem`.
- "Ledger" list pattern (not cards-in-a-grid): a bordered container with hairline-divided rows
  (`border-bottom: 1px solid var(--line)`, last child no border) — used for goal lists, activity,
  history. Prefer this over one-card-per-item for repeated list data.
- Top "ticker" band: `background: var(--ai)`, white-ish text, monospace, shows live rate + update
  time + a note — persistent across all authenticated screens.
- Progress bars: `height: 5px` (list rows) or `8px` (hero), track `var(--line)`, fill `var(--jade)`.
- Theme toggle + language switch: small icon-button + pill-switch cluster, fixed top-right, styled
  from `--surface`/`--line`/`--ink-soft` tokens (not hardcoded colors) so it reads correctly in
  either theme and over any background.

## i18n dictionary (VI default, JA secondary) — react-i18next resource shape

Use these as the seed translation resources (`vi.json` / `ja.json`, or equivalent per Phase 6's
i18next setup). Keys are illustrative groupings from the mockup; adapt key names to the app's
actual copy/routes as Phases 7–9 write real UI strings, but keep every string bilingual from the
start — do not ship VI-only text and backfill JA later.

```json
{
  "nav": {
    "dashboard": { "vi": "Tổng quan", "ja": "ダッシュボード" },
    "goal": { "vi": "Mục tiêu", "ja": "目標" },
    "exchange": { "vi": "Tỷ giá & Quy đổi", "ja": "為替・換算" },
    "newGoal": { "vi": "Tạo mục tiêu", "ja": "目標を作成" },
    "logout": { "vi": "Đăng xuất", "ja": "ログアウト" }
  },
  "login": {
    "h1": { "vi": "Tiết kiệm có mục đích, dù bạn đang làm việc ở đâu.", "ja": "どこで働いていても、目的を持って貯金しよう。" },
    "p": { "vi": "Đặt mục tiêu, ghi lại từng khoản để dành, và xem tỷ giá Yên–Đồng thời gian thực để biết mình đang ở đâu trên chặng đường.", "ja": "目標を設定し、貯金を記録し、円とドンのリアルタイム為替レートで今の進捗を確認できます。" },
    "tabLogin": { "vi": "Đăng nhập", "ja": "ログイン" },
    "tabRegister": { "vi": "Đăng ký", "ja": "新規登録" },
    "welcome": { "vi": "Chào mừng trở lại", "ja": "おかえりなさい" },
    "submit": { "vi": "Đăng nhập →", "ja": "ログイン →" },
    "or": { "vi": "HOẶC", "ja": "または" },
    "google": { "vi": "Đăng nhập với Google", "ja": "Googleでログイン" }
  },
  "field": {
    "email": { "vi": "Email", "ja": "メールアドレス" },
    "password": { "vi": "Mật khẩu", "ja": "パスワード" },
    "amount": { "vi": "Số tiền", "ja": "金額" },
    "date": { "vi": "Ngày", "ja": "日付" },
    "note": { "vi": "Ghi chú (tuỳ chọn)", "ja": "メモ（任意）" }
  },
  "dashboard": {
    "savedJpy": { "vi": "Đã tiết kiệm · JPY", "ja": "貯金額・JPY" },
    "savedVnd": { "vi": "Đã tiết kiệm · VND", "ja": "貯金額・VND" },
    "convertToday": { "vi": "Quy đổi JPY → VND hôm nay", "ja": "本日の JPY→VND 換算" },
    "yourGoals": { "vi": "Mục tiêu của bạn", "ja": "あなたの目標" },
    "recentActivity": { "vi": "Hoạt động gần đây", "ja": "最近のアクティビティ" },
    "newGoal": { "vi": "Mục tiêu mới", "ja": "新しい目標" }
  },
  "goal": {
    "back": { "vi": "← Về tổng quan", "ja": "← ダッシュボードへ" },
    "logEntry": { "vi": "Ghi khoản tiết kiệm mới", "ja": "新しい貯金を記録" },
    "addEntry": { "vi": "Thêm khoản này", "ja": "この記録を追加" },
    "history": { "vi": "Lịch sử", "ja": "履歴" }
  },
  "exchange": {
    "sub": { "vi": "Tỷ giá thị trường tham khảo — không phải tỷ giá giao dịch thực tế của bất kỳ đơn vị chuyển tiền nào", "ja": "参考市場レートです。送金業者の実際の取引レートではありません" },
    "quickConvert": { "vi": "Tính nhanh", "ja": "クイック換算" },
    "chart7d": { "vi": "7 ngày", "ja": "7日間" },
    "chart30d": { "vi": "30 ngày", "ja": "30日間" },
    "chart1y": { "vi": "1 năm", "ja": "1年間" },
    "alerts": { "vi": "Cảnh báo tỷ giá", "ja": "為替アラート" },
    "addAlert": { "vi": "+ Thêm cảnh báo", "ja": "+ アラートを追加" },
    "smilesTitle": { "vi": "Muốn chuyển khoản này về Việt Nam?", "ja": "この金額をベトナムへ送金しますか？" },
    "smilesDesc": { "vi": "Xem phí & tỷ giá thực tế trên Smiles Wallet", "ja": "Smiles Walletで実際の手数料・レートを確認" },
    "smilesCta": { "vi": "Kiểm tra trên Smiles →", "ja": "Smilesで確認 →" }
  },
  "newGoal": {
    "h1": { "vi": "Mục tiêu tiết kiệm", "ja": "貯金目標" },
    "name": { "vi": "Tên mục tiêu", "ja": "目標の名前" },
    "namePlaceholder": { "vi": "VD: Mua nhà ở Hà Nội, Trả nợ du học...", "ja": "例：ハノイでマイホーム購入、留学ローン返済..." },
    "target": { "vi": "Số tiền mục tiêu", "ja": "目標金額" },
    "currency": { "vi": "Loại tiền", "ja": "通貨" },
    "deadline": { "vi": "Hạn chót (tuỳ chọn)", "ja": "期限（任意）" },
    "hint": { "vi": "Nếu đặt hạn chót, Okane sẽ tự gợi ý số tiền nên để dành mỗi tháng — và quy đổi theo tỷ giá hiện tại nếu bạn tiết kiệm bằng đồng tiền khác.", "ja": "期限を設定すると、Okaneが毎月の目安貯金額を提案します。異なる通貨で貯金している場合は現在のレートで換算します。" },
    "submit": { "vi": "Tạo mục tiêu", "ja": "目標を作成" }
  },
  "smiles": {
    "outboundUrl": "https://www.smileswallet.com/japan/vi/"
  }
}
```

Note: this is a starting seed, not the complete final string set — the actual login/register/goal
forms built in Phases 7–9 will need additional keys (validation errors, empty states, loading
states) that don't exist in the static mockup. Follow the same VI/JA-together discipline for every
new string you add.

## Dark mode & language toggle behavior (already prototyped in the mockup, re-implement properly)

- Theme: three states — explicit light, explicit dark, or "system" (no attribute, follows
  `prefers-color-scheme`). Persist an explicit user choice (e.g. `localStorage`), default to
  system when nothing is stored.
- Language: persist the chosen language (`localStorage`), default to `vi` when nothing is stored.
- Both controls are small, fixed-position, theme-token-styled (not hardcoded colors) so they're
  legible in either theme and over any screen's background.
