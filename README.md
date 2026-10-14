# Cate

Ein Fenster für alle deine KI-Coding-Agenten. Cate hält mehrere Terminals
(Hermes, Claude Code, Codex, OpenCode oder eine normale Shell) in Projekten
zusammen, lässt sie im Hintergrund weiterlaufen und zeigt dir auf einen Blick,
wer gerade arbeitet, wer fertig ist und wer wartet. Dazu gibt es eine kleine
Pixel-Katze, die auf dem Desktop wohnt und Bescheid sagt, wenn eine Session
durch ist.

Electron + React + TypeScript, für Windows.

## Installieren

1. Aktuelle `Cate-Setup-x.y.z.exe` aus dem Ordner [`dist/`](dist) herunterladen.
2. Ausführen, Ordner wählen, fertig. Windows meldet evtl. eine SmartScreen-Warnung,
   weil der Installer nicht signiert ist („Weitere Informationen“ → „Trotzdem ausführen“).

**Aktualisieren:** Einfach den neuen Installer über die bestehende Installation
laufen lassen. Projekte, Sessions und Einstellungen bleiben erhalten.

## Was Cate kann

- **Projekte und Sessions**: Jedes Projekt bekommt einen Ordner und ein Hermes-Profil.
  Sessions laufen weiter, auch wenn die App geschlossen wird, und lassen sich
  später wieder öffnen. Eine Suche in der Sessions-Ansicht filtert nach Name,
  Agent und Status.
- **Split-Terminals**: Mehrere Panes nebeneinander, horizontal oder vertikal geteilt.
  Eine Anzeige „Agent arbeitet“ erscheint, solange ein Agent Ausgabe erzeugt.
- **Automatische Namen**: Aus der ersten Nachricht entsteht nach ein paar Sekunden
  ein kurzer Titel (höchstens 8 Wörter, `/`-Befehle werden ignoriert).
- **Modell-Wechsel und Usage-Dashboard**: `/model` direkt aus dem Pane-Menü,
  Verbrauch und Tagesbudget im Dashboard.
- **Rechtsklick in der Projektliste**: Auf freier Fläche „Neues Projekt“ (Importieren und Exportieren sind dort ausgegraut), auf einem Projekt zusätzlich Importieren und Exportieren.
- **Die Desktop-Katze**: läuft, putzt sich, schläft im Korb und meldet „Fertig“,
  wenn ein Agent zur Ruhe kommt. Ein Klick öffnet ein Schnell-Prompt-Feld, ein
  Doppelklick springt in die Session, Hovern zeigt den Status. Ein Tier (Hase,
  Maus, Vogel oder Schmetterling) schaut vorbei, jagt den Mauszeiger und lässt
  sich streicheln. Alles unter Einstellungen → Katze.

## Entwicklung

```bash
npm install --ignore-scripts
npm run rebuild-native   # einmalig: native Module (PTY, SQLite) gegen Electron bauen
npm run build
npm run dev              # Vite-Devserver + Electron mit Hot Reload
npm test                 # Unit-Tests (node:test)
npm run typecheck
npm run dist             # Windows-Installer nach dist/
```

Die Pixel-Katze und ihre Tiere entstehen aus `scripts/make-cat.py`
(`python scripts/make-cat.py` schreibt `assets/catFrames.js`), die App-Icons aus
`scripts/make-icons.mjs` (`npm run icons`).

### Aufbau

| Ordner | Inhalt |
| --- | --- |
| `electron/` | Hauptprozess: Sessions, PTY-Dienst, Projekt-Speicher, Desktop-Katze |
| `src/` | Oberfläche (React): Sidebar, Terminal-Panes, Einstellungen, Dashboard |
| `assets/` | Icons, Katzen-Sprites, `pet.html` (das Katzenfenster), Schriften |
| `scripts/` | Generatoren für Icons und Katze, Native-Build-Helfer |
| `tests/` | Tests für Layout, Titel, PTY-Dienst und Katzen-Einstellungen |

Terminals laufen in einem eigenen Hintergrunddienst (`electron/ptyHost.ts`) und
überleben daher App-Neustarts.

## Lizenz

© 2026 R.S. Alle Rechte vorbehalten. Der Code ist geistiges Eigentum von R.S.;
Nutzung, Weitergabe oder Veränderung nur mit schriftlicher Erlaubnis. Details in
[LICENSE](LICENSE). Bestandteile Dritter behalten ihre eigenen Lizenzen.
