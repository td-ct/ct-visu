# ct-visu

Interaktive **3D-Visualisierung eines KM-CT-Untersuchungsflusses** (Protokoll **„4-Phasen HCC“**) mit
Patienten im Scanner und einer **simulierten Dosisverteilung (CTDIvol / DLP)** während der Scans.

Educational / Demo — keine medizinische Anwendung, keine klinischen Dosiswerte.

Umgesetzt auf Basis von [angio-visu](https://github.com/td-ct/angio-visu) (Angio → CT).

## Features

- **3D-Szene**: CT-Gantry mit Bore, höhen- und längsverfahrbarer Tisch, Patient (Torso, Kopf, Arme, Beine),
  **Leber**, Herz, Aorta (bis Aortenbogen) und **Armgefäß**: rechte Armvene → Subclavia → V. cava →
  Herz → **Aortenboden** (anatomisch korrekt angeschlossen), KM-Spritze/Pumpe mit Schlauch zur Ellenbeuge
- **Rote Laser-Marker** auf 0° (transversal) und 90° (sagittal) zur Positionierung im Isozentrum
- **Kontrollbildschirm** (immer sichtbares 2D-Panel rechts):
  - AP- und LAT-Topogramme (Scouts), die **nebeneinander und nacheinander zeilenweise aufgebaut** werden
  - **Planung**: Abdomen (Leber) und Trackerschicht am Aortenbogen als Rechtecke — je 2× auf AP und LAT
  - **Axiale Schnittbilder** der 4 laufenden Scans, die den Körper durchstreichen (HU-Farbcodierung:
    Aorta hell in der arteriellen Phase), inkl. Mini-Topogrammen mit Scanlinie
  - **HU-Diagramm** nach dem nativen Scan: y-Achse 0–300 HU, x-Achse 0–120 s, Schwellenlinie bei **150 HU**,
    ROI in der Aorta am Aortenbogen, Bolus-Tracking-Kurve
- **Kompletter Untersuchungsfluss per Play-Knopf**:
  1. Patient liegt draußen auf abgesenktem Tisch
  2. KM-Spritze wird in der Ellenbeuge angelegt
  3. Tisch fährt hoch, Patient ins Isozentrum (Laser 0°/90°)
  4. Tisch fährt rein und wieder raus → 2 Scouts/Topos (AP, dann LAT mit Röhre auf 90°)
  5. Planung des Zielvolumens Abdomen + Trackerschicht in der Herzgegend (Aortenbogen)
  6. Erster nativer Scan des Abdomens
  7. Patient fährt so ins CT, dass der Aortenbogen im stationären Scan liegt
  8. Infusion startet → nach Delay Bolus-Tracking (ROI Aorta, Schwelle 150 HU)
  9. Arterieller Scan nach Trigger + Delay
  10. Längerer Delay (~1 min) → portal-venöser Scan
  11. Später nochmals spätvenöser Scan
  12. Patient fährt heraus, Tisch fährt herunter
- **Manuelle Tisch-Slider** (Position + Höhe) mit realistischen Constraints:
  - Einfahren in die Röhre erst ab Mindesthöhe (Scan-Höhe 0,82–0,90 m)
  - in der Röhre nur Mindest-/Maximalhöhe erlaubt
  - unter 0,78 m erst wieder ab Position |z| ≥ 1,2 m herunterfahrbar
- **CT-Dosismodell** (vereinfachend): CTDIvol je Phase, DLP = CTDIvol × Scanlänge (je Phase + gesamt),
  axiale Dosisverteilung im Isozentrum (1/r² vom rotierenden Fokus, Schwächung über µ(Wasser) entlang
  jedes Strahls durch den Patienten-Ellipsoiden) als Heatmap im 3D-Schnitt und im Dosis-Panel

## Start

```bash
npm install
npm run dev          # Entwicklungsserver
npm run build        # Production-Build nach dist/
npm run build:single # eine einzige, self-contained HTML-Datei: dist/ct-visu.html
npm run preview      # Build lokal ausliefern
```

**Ohne npm/Server direkt im Browser:** die fertige Single-File-App liegt im Repo-Root als
**[ct-visu.html](ct-visu.html)** — Doppelklick genügt (`file://` funktioniert, weil
alles inline ist). Achtung: die Quell-`index.html` allein ist *nicht* per Doppelklick
lauffähig (ES-Modul `/src/main.js` wird über `file://` blockiert) — dafür `ct-visu.html`
oder `npm run dev` verwenden.

## Single-File (eine HTML-Datei)

`npm run build:single` packt den kompletten Build (Three.js + App + CSS) inline in eine
einzige Datei: **`dist/ct-visu.html`** (im CI auch als Root-Datei `ct-visu.html` abgelegt und
per `npm run test:bundle` geprüft). Voll interaktiv per Doppelklick (`file://`).

## Smoke-Test (optional)

```bash
npx playwright install chromium
npm run preview &      # oder dev-Server
npm run smoke          # spielt den Fluss mit 4× ab, prüft Konsole auf Fehler, Screenshot
```

## Bedienung

- **▶ Abspielen / ⏸ Pause**: kompletter Untersuchungsfluss; Geschwindigkeit 1×/2×/4×
- **Tischposition / Tischhöhe**: manuelle Slider — Constraints (Mindesthöhe vor der Röhre,
  Höhenfenster in der Röhre, Herunterfahren erst ab Position x) werden live im Slider clamped;
  Slider-Eingriff während „Abspielen“ pausiert den Fluss
- Kamera: linke Maustaste drehen, rechts verschieben, Rad zoomen

## Tech

Vanilla JS + [Three.js](https://threejs.org) (r170) + [Vite](https://vite.dev). Kein Framework.

## Dosismodell (vereinfachend)

- Je Scan-Phase ein CTDIvol (mGy); DLP = CTDIvol × Scanlänge in cm (akkumuliert je Phase und gesamt)
- Axiale Dosisverteilung im Isozentrum: pro Frame Strahl vom aktuellen Fokuswinkel zu jedem
  Gitterpunkt, `dosis += C · (1/d²) · exp(−µ·Schord) · ω·dt`, normiert auf CTDIvol im Isozentrum
  je voller Rotation (µ(Wasser) bei E_eff ≈ 0,45·120 keV)
- HU-Modell (educational): Aorten-Bolus-Kurve mit Trigger bei 150 HU; Leber-HU je Phase
  (nativ 55, arteriell 100, portal-venös 115, spätvenös 85 HU)
