# Hermes Harness

Multi-Terminal Harness mit Hermes-Integration, Projekt-/Profil-Verwaltung,
Modell-Switcher und einem Usage/Budget-Dashboard. Electron + React + TypeScript.

## Entwicklung

    npm install --ignore-scripts
    npm run rebuild-native   # einmalig: native Module (PTY, SQLite) gegen Electron bauen
    npm run build
    npm run dev               # Vite-Devserver + Electron, Hot Reload
    npm test                  # Unit-Tests (node:test) fuer Layout-Logik, Agent-Presets, Projekt-Slugs
    npm run typecheck

## Status (Stand: erste durchimplementierte Version)

Implementiert:
- Phase 0: Electron+Vite+React+TS Grundgeruest
- Phase 1: Split-Pane-Layout (tmux-artig), xterm.js-Terminal pro Pane
- Phase 2: Projekt-Verwaltung (Ordner + automatisch angelegtes Hermes-Profil)
- Phase 3: Pane-Typen / Agent-Hub-Registry (Shell, Hermes, Claude Code, Codex, OpenCode, generisch erweiterbar)
- Phase 4: Modell-Switcher UI (sendet /model <alias> in die laufende Hermes-PTY-Session)
- Phase 5: Usage-Dashboard — liest NICHT mehr state.db direkt, sondern shellt auf das echte
  `hermes insights --days N` CLI (electron/hermesUsage.ts, Text-Output geparst) genau wie der
  Modell-Picker auf Hermes-erzeugte Daten zurueckgreift. Nur Account-weit (kein --profile-Filter
  in `hermes insights`), dafuer korrekt offiziell. Wird NUR bei Oeffnen des Dashboards bzw. Klick
  auf "Aktualisieren" abgefragt — kein Hintergrund-Polling mehr.
- Phase 6: Budget-Soft-Warnung (Tagesbudget, Live-Prozentanzeige, keine Zwangs-Drosselung)
- Phase 7 (teilweise): lokale Persistenz von Projekten/Profilen (JSON im userData-Ordner)
- Phase 8 (teilweise): electron-builder-Grundkonfiguration (`npm run dist`)

Native Module (echtes PTY via ConPTY + better-sqlite3) sind erfolgreich gegen
die Electron-ABI gebaut und per End-to-End-Test verifiziert (siehe unten) —
**kein Admin/UAC-Schritt mehr noetig.**

### Session-Auto-Titel

Panes starten mit einem generischen Label ("Hermes", "Shell") — nach der ersten vom Nutzer
eingegebenen Zeile (bis zum ersten Enter) wird daraus automatisch ein kurzer Titel abgeleitet
(electron/airFormat.ts: `deriveSessionTitle`/`applyBackspaces`, aufgerufen aus
electron/sessionManager.ts: `SessionManager.captureTitle`). Der Titel wird in sessionStore
persistiert (`renameSession`) und per neuem IPC-Event `sessions:renamed` live an die offene
TerminalPane gepusht, damit ein Projekt nicht mehr mit vier identischen "Hermes"-Zeilen endet.
Programmatische Injektionen (der Cross-Session-Digest-Hinweis) sind explizit über
`{ isUserInput: false }` von der Titel-Erfassung ausgeschlossen.

### Codex/Claude via Hermes

`hermes codex-runtime` erlaubt es, Codex-Modelle direkt UEBER Hermes zu nutzen, ohne ein
separates `codex`-CLI-Binary auf PATH zu haben — das ist unabhaengig vom separaten
"Codex CLI"-Preset (das einen echten eigenstaendigen `codex`-Befehl erwartet und entsprechend
zurecht "nicht gefunden" meldet, wenn der nicht installiert ist). Der Modell-Picker im
"Neuen Agent starten"-Popover gruppiert Modelle jetzt nach Provider (`<optgroup>` im
`<datalist>`) und zeigt bei gewaehltem "Hermes"-Preset einen Hinweis, dass Codex/Claude & Co.
einfach als Modell waehlbar sind statt ein eigenes CLI-Tool zu brauchen.

Noch offen / bewusst zurueckgestellt:
- Autostart-Registry-Eintrag (Windows) fuer "App startet automatisch mit letztem Projekt"
- Tastatur-Shortcuts fuer Pane-Fokus-Wechsel
- Vollwertiger Installer (NSIS) statt `--dir`/portable Build

### Design

Komplette visuelle Ueberarbeitung auf ein echtes Dark-Theme-Designsystem:
- Neue `src/theme.css` mit CSS-Custom-Properties fuer Farbpalette
  (`--bg-primary/--bg-elevated/--border/--text-primary/--accent/...`),
  einer 4/8/12/16/24px-Spacing-Skala und einer Typografie-Hierarchie
  (App-Titel, Section-Header, Body, Muted) — statt verstreuter Hex-Literale.
- Wiederverwendbare CSS-Klassen fuer Buttons (`hh-btn`, `hh-btn-primary`,
  `hh-btn-ghost`, `hh-icon-btn`), Inputs (`hh-input`), Projekt-Listeneintraege,
  Overlays/Modals und eine Segmented-Control — inkl. Hover/Active/Disabled
  und `:focus-visible`-Outline fuer Tastaturbedienung.
- Horse-Race-Loading-Screen und Onboarding-Karte wurden als "Hook"-Momente
  poliert (weichere Easing-Kurven, Fade/Scale-in-Karte, Dot-Pulse-Indikator),
  ProjectSidebar, TerminalPane-Topbars und das Usage-Dashboard nutzen jetzt
  dieselben Farb-/Abstands-/Typografie-Tokens.
- Neue **Settings**-Ansicht (Button oben rechts in der Kopfzeile,
  schliessbar per Escape oder Klick auf den Hintergrund): aktuell mit der
  Einstellung fuer die **Sidebar-Position** (links/rechts), persistiert in
  `hermes-harness-state.json` (`sidebarPosition`) via neue IPC-Routen
  `settings:getSidebarPosition` / `settings:setSidebarPosition`. Standard
  bleibt unveraendert: Sidebar links, sichtbar, wie bisher.
- **Projekt anlegen ohne Pfad-Tippen**: die Sidebar hat jetzt einen
  nativen Ordner-Dialog (`dialog:pickFolder` IPC-Route, `Durchsuchen`-Button)
  statt reiner Texteingabe, sowie einen zweiten Reiter **Git-Repo**, der eine
  Remote-URL per `git clone` (IPC-Route `git:clone`, `electron/gitRepo.ts`)
  in einen gewaehlten Zielordner klont und den Projektordner automatisch
  befuellt. Keine Emojis mehr in der UI (bewusst entfernt).
- **Redesign**: Projekterstellung lebt jetzt in einem eigenen Modal
  (`src/NewProjectModal.tsx`) statt in der schmalen Sidebar; Settings und
  Usage-Dashboard sind ausschliesslich ueber die Sidebar erreichbar (nicht
  mehr im Top-Header); alle Icons sind inline-SVGs (`src/icons.tsx`), keine
  Unicode-/Emoji-Symbole mehr; Buttons haben Hover-Lift/Scale-Animationen;
  vier waehlbare Themes (Nous/Obsidian/Slate/Daylight, `data-theme` auf
  `<html>`, persistiert via `settings:getTheme`/`setTheme`). **Nous** ist der
  neue Standard: die tatsaechliche Default-Identitaet der echten Hermes-
  Desktop-App (GitHub-Dark-Chrome + Nous-Blau `#4a84fe`, aus
  `apps/desktop/src/themes/presets.ts` im Hermes-Agent-Repo abgeleitet) statt
  einer erfundenen Palette. Die Segmented-Controls (`.hh-segmented`, genutzt
  fuer Workspace/Sessions-Tabs, Links/Rechts, Ordner/Git-Umschalter) wurden
  von einer fragilen absolut-positionierten Sliding-Pill (brach sichtbar bei
  unterschiedlich breiten Labels/Icon+Text-Kombinationen) auf das reale
  Hermes-Desktop-Muster umgestellt: getoente Flaeche, aktive Option einfach
  als angehobene Zelle (Hintergrund + Schatten) statt Akzentfarben-Fuellung.

### Sessions, Hintergrund-Persistenz und Kontext (neu)

- **Sessions laufen im Hintergrund weiter**: Ein Pane schliessen/das Projekt
  wechseln killt den Prozess nicht mehr — `electron/ptyManager.ts` haengt
  Prozesse nicht mehr an die UI-Lebensdauer, `electron/sessionManager.ts`
  haelt sie unabhaengig am Leben. Einzige Ausnahmen: explizites "Beenden"
  im Pane/in der Sessions-Ansicht, Projekt-Loeschung, oder App-Beenden
  (siehe Caveat unten).
- **Sessions-Ansicht pro Projekt** (`src/SessionsView.tsx`, Reiter
  "Workspace"/"Sessions" oben im Projekt-Bereich): zeigt alle Sessions
  (laufend/beendet/gestoppt) mit Status, letzter Aktivitaet, "Oeffnen"
  (haengt eine laufende Session wieder in den Layout-Baum ein, inkl.
  gepuffertem Backlog), "Verlauf" (zeigt die komprimierte `.air`-Datei einer
  beendeten Session), "Beenden", "Loeschen".
- **Kontext-Speicherung**: `electron/sessionStore.ts` fuehrt eine eigene,
  leichte SQLite-Datenbank (`harness-sessions.db`, better-sqlite3, selbes
  Lazy-Load-Pattern wie beim Usage-Reader) als Index. Der eigentliche
  Transkript-Inhalt wird beim Sessionende durch `electron/airFormat.ts`
  stark komprimiert (ANSI/Control-Codes entfernt, wiederholte Zeilen/Leer-
  zeilen zusammengefasst, hart gekuerzt) und als gzip-komprimierte `.air`-
  Datei abgelegt — bewusst auf Lesbarkeit durch ein LLM mit minimalem
  Tokenverbrauch getrimmt, nicht auf verlustfreies Replay.
- **Aufbewahrung**: Standard 30 Tage (einstellbar in Settings →
  "Kontext-Aufbewahrung"), Pruefung/Loeschung erfolgt lazy beim naechsten
  Oeffnen der Sessions-Ansicht (`sweepExpiredSessions()`, kein Hintergrund-
  Timer) — oder sofort, wenn das zugehoerige Projekt geloescht wird.
- **Cross-Session-Bewusstsein (v1)**: Eine frisch gestartete Hermes-Pane
  bekommt nach ein paar Sekunden Bootzeit automatisch eine kurze,
  Token-gedeckelte Zusammenfassung dessen, was andere laufende Sessions
  im selben Projekt gerade tun (`SessionManager.getProjectActivityDigest`),
  als Terminal-Eingabe injiziert.
- **Agent kann eigene Sub-Terminals oeffnen**: `scripts/hh-spawn.cjs` ist ein
  Begleit-Skript, das jede Pane ueber `HH_SCRIPTS_DIR`/`HH_SPAWN_QUEUE`/
  `HH_PROJECT_ID`-Umgebungsvariablen kennt. Der Agent ruft es mit
  `node "$HH_SCRIPTS_DIR/hh-spawn.cjs" --label X --preset shell --cwd .` auf;
  es haengt eine Zeile an eine Datei-Queue an, die `main.ts` alle 4s abfragt
  und daraus eine echte getrackte Pane erzeugt (erscheint automatisch im
  Layout, falls das Projekt gerade offen ist, sonst taucht sie spaeter in
  der Sessions-Liste auf). Bewusst ueber eine simple JSONL-Datei statt ueber
  die SQLite-DB geloest, weil ein externer `node`-Prozess das native
  better-sqlite3-Modul (Electron-ABI-gebunden) nicht laden kann.

**Persistenz**: Alle Terminals gehoert einem eigenen Hintergrundprozess, dem
PTY-Daemon (`electron/ptyHost.ts`, startet automatisch, Named Pipe
`hermes-harness-pty-<user>`). Die App (`electron/ptyManager.ts`) ist nur Client:
Fenster schliessen, App beenden oder abstuerzen laesst die Sessions weiterlaufen,
beim naechsten Start werden sie samt Backlog wieder uebernommen
(`SessionManager.adoptLive`). Nur "Beenden & alle Sessions stoppen" im Tray
beendet sie. Nach einem **PC-Neustart** sind die Prozesse weg; dann startet der
Autostart die Agenten neu und setzt ihre Konversation fort (Claude Code per
`--session-id`/`--resume <Session-ID>`, Hermes ueber den Kontext-Seed).

**Katze**: `assets/pet.html` laeuft als durchsichtiges, klickdurchlaessiges
Fenster am unteren Bildschirmrand und meldet sich, sobald ein Terminal nach einer
Ausgabe 8 s ruhig ist ("Fertig: <Session>"). Klick auf die Blase oeffnet das
Harness-Fenster, Tray-Eintrag "Katze ein/aus" blendet sie aus.

Direkte, bidirektionale Informationsuebertragung zwischen mehreren
gleichzeitig laufenden Agenten (z. B. Agent A injiziert gezielt in Agent B
statt nur einen Lese-Digest bereitzustellen) ist nicht umgesetzt — bewusst
zurueckgestellt, wie urspruenglich besprochen.

## Native Module unter Windows (node-pty / better-sqlite3) — geloest

`@homebridge/node-pty-prebuilt-multiarch` ist ein **prebuild-only** npm-Paket:
der veroeffentlichte Tarball enthaelt ueberhaupt keinen C++-Quellcode, nur
vorkompilierte Binaries fuer bestimmte Node-ABIs (nicht fuer die hier
benutzte Electron-ABI 130 / Electron 33). Ein Build "from source" scheiterte
ausserdem an zwei im `binding.gyp` hart codierten Anforderungen:

1. `SpectreMitigation: 'Spectre'` (Windows) — verlangt eine zusaetzliche
   VS-Installer-Komponente, deren Installation Admin+UAC braucht.
2. Ein `pty`-Zieltarget (Legacy-winpty-Fallback), dessen `deps/winpty/*`-Quellen
   gar nicht im npm-Paket enthalten sind — kann nie aus dem npm-Install heraus
   gebaut werden.

Beides ist fuer uns irrelevant: Windows 10 1903+ (Build >= 18309) nutzt ohnehin
automatisch ConPTY statt winpty (siehe `lib/windowsPtyAgent.js` der
Bibliothek), d.h. wir brauchen nur die Targets `conpty` und
`conpty_console_list` — und die Spectre-Anforderung ist optionale
Haertung, keine funktionale Notwendigkeit.

**Loesung**, automatisiert in `scripts/patch-native.cjs` (laeuft bei jedem
`npm run rebuild-native` automatisch mit):
1. Entfernt `SpectreMitigation` aus `binding.gyp` und streicht das
   unbaubare `pty`/winpty-Target komplett.
2. Laedt die fehlenden `src/win/*.cc`/`.h`-Dateien direkt vom GitHub-Tag
   nach, der der installierten Paketversion entspricht (Quellcode existiert
   im Repo, nur eben nicht im npm-Tarball).
3. `electron-rebuild -f -w better-sqlite3,@homebridge/node-pty-prebuilt-multiarch`
   baut danach beide nativen Module sauber gegen die Electron-ABI.

Verifiziert per End-to-End-Test (Electron-Hauptprozess spawnt `cmd.exe /c echo`
ueber die echte `PtyManager`-Klasse): `PTY_BACKEND = node-pty`, ConPTY-
Escapesequenzen und die Befehlsausgabe kommen korrekt durch. `better-sqlite3`
oeffnet eine In-Memory-DB und fuehrt eine Query aus, ebenfalls erfolgreich.

Falls `npm install` das Paket je neu installiert: einfach erneut
`npm run rebuild-native` ausfuehren — der Patch- und Download-Schritt ist
idempotent.
