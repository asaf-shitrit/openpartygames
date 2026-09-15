# Avatars and Doodle Notebook tokens

Source of truth for the 12 doodle avatars (ids match `AVATARS` in @opg/protocol) and the style rules used by the design mockups in this folder.

Avatar id mapping: 1 blob, 2 toast, 3 drop, 4 cloud, 5 star, 6 cat, 7 ghost, 8 bean, 9 robot, 10 mushroom, 11 egg, 12 sun. The person names below are the sample players used in the mockups.

## Tokens

- Ink `#2B2B2B`. Secondary text `#555555`. Muted borders `#8A8A8A`.
- Paper `#FBF8F1`, cards `#FFFFFF`.
- Marker red `#D7372B`: only for marker headings/stamps/arrows at ≥24px on TV-sized or ≥20px bold on phone. Never the only signal.
- Highlighter `#FFE45C`. Tape `rgba(255, 228, 92, 0.8)`.
- Fonts: `'Permanent Marker', 'Marker Felt', 'Comic Sans MS', cursive` for HEADINGS, stamps and short labels only (it renders as caps). Everything else `'Atkinson Hyperlegible'` (inherited), weights 400/700.
- Wobbly radii (border 4px solid #2B2B2B unless noted):
  - card L: `40px 12px 36px 14px / 14px 36px 12px 40px`
  - card M: `30px 10px 26px 12px / 12px 26px 10px 30px`
  - card M alt: `12px 30px 10px 26px / 26px 10px 30px 12px`
  - button/chip: `26px 10px 22px 12px / 12px 22px 10px 26px`
- Slight tilts (`transform: rotate(-2deg..2deg)`) on cards, sticky notes and stamps. Not on long lists or text inputs.

## Type scale

TV (read from 3 m): marker hero 96–140px, marker heading 56–76px, body 32–40px, smallest text 28px.
Phone: marker heading 28–40px, body 19–21px, labels ≥16px. Hit targets ≥44px; primary buttons 56–64px tall.

## Components (copy these patterns)

Highlighter swipe behind a key word:
```
<div style="align-self: flex-start; position: relative; padding: 0 12px;">
  <div style="position: absolute; left: 0; right: 0; top: 44%; height: 50%; background: #FFE45C; border-radius: 8px; transform: rotate(-2deg);"></div>
  <div style="position: relative; font-family: 'Permanent Marker', 'Marker Felt', 'Comic Sans MS', cursive; font-size: 72px; line-height: 1.1;">ZEBRA</div>
</div>
```
Tape strip on a card: absolutely positioned div, `top: -22px`, ~160–200px × 44px, tape color, `rotate(-3deg)`, on a `position: relative` card.

Sticky note: `background: #FFE45C; box-shadow: 0 6px 12px rgba(43, 43, 43, 0.14); transform: rotate(-1.5deg); padding: 12px 14px;` (no border).

Lined index card (phone): as in PhoneImposterCard.dc.html (red margin line at 38–40px, blue rules every 38px, left padding 56px, card M radius, rotate 1deg).

Primary button (phone): `height: 60px; box-sizing: border-box; padding: 0 24px; display: flex; align-items: center; justify-content: center; gap: 10px; background: #2B2B2B; color: #FBF8F1; border-radius: 26px 10px 22px 12px / 12px 22px 10px 26px; font-size: 21px; font-weight: 700;`
Secondary button: white background, `border: 4px solid #2B2B2B`, ink text.
Disabled: `opacity: 0.45` PLUS a text label saying why (e.g. "Your lie").

Selected state (never color only): marker-red check icon + ink 4px border + highlighter background `#FFF6BF`, and/or a red marker "picked" stamp.
Check icon: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#D7372B" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7"></path></svg>`

Stamp (e.g. REAL / NAH / IMPOSTER!): marker font, color #D7372B, `border: 5px solid #D7372B`, button/chip radius, padding 4px 18px, `rotate(-6deg)`.

Timer, hand-drawn circle (phone 78px; TV scale to 150–180px):
```
<div style="width: 78px; height: 78px; position: relative; display: flex; align-items: center; justify-content: center;">
  <svg width="78" height="78" viewBox="0 0 78 78" style="position: absolute; left: 0; top: 0;"><path d="M40 5c19 1 33 15 33 34 0 19-15 34-35 33C19 71 5 57 6 38 7 20 22 5 42 6" fill="#FFFFFF" stroke="#2B2B2B" stroke-width="4" stroke-linecap="round"></path></svg>
  <div style="position: relative; font-size: 22px; font-weight: 700;">0:24</div>
</div>
```
(On TV use width/height 170, svg width/height 170 with the same viewBox, stroke-width 3, text 48px.)

TV header, NON-game screens (landing, lobby, picker, full, credits): copy Main.dc.html's header row (highlighted wordmark + "Sound on" chip).

TV header, IN-GAME screens:
- Left: column with game name in marker 52px (line-height 1.1) and progress in Atkinson 700 30px #555555 (e.g. "Word 3 of 6").
- Right: row gap 16px: chip `Room BKTZ` (white, 4px ink border, button radius, height 68px, padding 0 26px, 28px 700; "Room" in 400 weight #555555, "BKTZ" in 700) + the "Sound on" chip from Main.dc.html.

Phone in-game strip (top row): copy PhoneImposterCard.dc.html's first row (game name marker 30px + progress 17px 700 #4A4A4A, timer right). Phones always mirror the essentials: the current prompt / whose turn / the timer.

Player "you" chip (phone bottom row): avatar 50px + name 21px 700, as in PhoneImposterCard.dc.html.

## Avatars (viewBox 0 0 100 100; stroke #2B2B2B width 4 at ≥90px render size, width 5 below 90px; eyes/mouth fills #2B2B2B)

1. Maya — blob, fill #FFA8A8:
   body `M50 8c24 0 40 18 40 42s-14 42-40 42S10 74 10 50 26 8 50 8z`; eyes circle (38,46) r5, (62,46) r5; mouth `M37 62q13 12 26 0` (fill none, stroke).
2. Dov — toast, fill #FFBE7A:
   body `M22 30c0-14 12-20 28-20s28 6 28 20c0 4-3 7-6 8v44c0 5-3 8-8 8H36c-5 0-8-3-8-8V38c-3-1-6-4-6-8z`; eyes (41,55) r4.5, (59,55) r4.5; brows+mouth `M33 44l10 4M67 44l-10 4M44 71h12` (fill none, stroke).
3. Priya — drop with one eye, fill #93E3C9:
   body `M50 6c6 10 34 30 34 56 0 18-15 30-34 30S16 80 16 62C16 36 44 16 50 6z`; eye white circle (50,58) r13 fill #FFFFFF stroke #2B2B2B width 4; pupil (53,59) r5.5; mouth `M42 81q8 5 16 0`.
4. Sam — cloud, fill #A3CCFF:
   body `M28 84c-12 0-20-8-20-19 0-10 7-17 16-18 1-15 12-27 27-27 12 0 22 8 25 19 10 1 18 9 18 20 0 14-9 25-22 25z`; sleepy eyes `M35 60q6 5 12 0M57 60q6 5 12 0` (stroke); mouth circle (52,72) r4.
5. Noa — star, fill #FFE45C:
   body `M50 8l12 26 28 3-21 19 6 28-25-14-25 14 6-28-21-19 28-3z` (stroke-linejoin round); eyes (43,50) r4, (57,50) r4; mouth `M44 59q6 9 12 0z` fill #2B2B2B.
6. Leo — cat, fill #CDB8FF:
   body `M20 36L18 10l20 14c4-1 8-2 12-2s8 1 12 2l20-14-2 26c6 7 10 16 10 26 0 20-18 30-40 30S10 82 10 62c0-10 4-19 10-26z`; eyes (38,58) r4.5, (62,58) r4.5; mouth `M44 70l6 5 6-5` (stroke).
7. Ava (late joiner) — ghost, fill #F5C2E7:
   body `M50 10c19 0 32 15 32 34v46l-8-6-8 6-8-6-8 6-8-6-8 6-8-6-8 6V44c0-19 13-34 32-34z`; eyes (41,44) r5, (59,44) r5; mouth circle (50,60) r4.
8. bean, fill #B8E986: body `M34 12c16-6 30 2 38 18 10 20 14 40 8 54-5 11-18 14-30 10C34 90 20 78 16 58 12 38 18 18 34 12z`; eyes (44,44) r4, (60,40) r4; mouth `M44 60q10 8 20-2` (stroke).
9. robot, fill #C9D3DD: body `M22 30h56a6 6 0 0 1 6 6v46a6 6 0 0 1-6 6H22a6 6 0 0 1-6-6V36a6 6 0 0 1 6-6z`; antenna `M50 30V17` (stroke) + circle (50,13) r4 fill #FFE45C stroke; eyes (38,54) r6, (62,54) r6; mouth `M38 72h24` (stroke).
10. mushroom, cap fill #FF9E80: cap `M12 52C12 28 30 12 50 12s38 16 38 40z`; stem fill #FFF3DC `M34 52h32v28c0 6-5 10-10 10H44c-5 0-10-4-10-10z`; spots circles (36,34) r5, (62,30) r6 fill #FFFFFF no stroke; eyes (44,66) r3.5, (56,66) r3.5; mouth `M46 76q4 4 8 0` (stroke).
11. egg, fill #FFF1B8: body `M50 8c20 0 36 30 36 52 0 20-16 32-36 32S14 80 14 60C14 38 30 8 50 8z`; eyes (40,56) r4.5, (60,56) r4.5; mouth `M44 70q6 5 12 0` (stroke).
12. sun, fill #FFD36E: rays `M50 6v12M50 82v12M6 50h12M82 50h12M19 19l8 8M73 73l8 8M19 81l8-8M73 27l8-8` (stroke, fill none); face circle (50,50) r26; eyes (42,46) r4, (58,46) r4; mouth `M40 58q10 10 20 0` (stroke).

Every player shown on screen has avatar + name (never color alone). VIP = red marker stamp "VIP" (see Main.dc.html). Crowns = doodle crown SVG + marker "×2" (see Main.dc.html).

