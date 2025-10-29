# Werwolf Host

Diese App liefert eine komplett moderierte Werwolf-Erfahrung. Ein dedizierter Host verwaltet das Spiel, während Spieler als Clients beitreten, miteinander chatten und über Opfer abstimmen können. Werwölfe erhalten zusätzlich einen privaten Chat-Kanal zur geheimen Abstimmung. Über die integrierte Sprachausgabe lassen sich Ereignisse außerdem automatisch ansagen.

## Voraussetzungen

- Node.js 18 oder neuer
- npm 9 oder neuer
- Expo CLI (`npx expo`) für die mobile App

> **Hinweis:** Die Abhängigkeiten `expo-av`, `expo-speech` und `ws` werden für Sprachausgabe und WebSocket-Kommunikation benötigt. Installiere sie bei Bedarf mit `npm install`.

## Installation

```bash
npm install
```

Falls einzelne Pakete aufgrund restriktiver Registry-Einstellungen nicht automatisch heruntergeladen werden, installiere sie manuell oder hinterlege die passende Registry-Konfiguration.

## Host-Server starten

Der Host-Server verwaltet Verbindungen, Chats, Rollen und Abstimmungen.

```bash
npm run start:server
```

Standardmäßig lauscht der Server auf Port `8080`. Passe den Port bei Bedarf über die Umgebungsvariable `PORT` an.

## Mobile App starten

1. Setze die WebSocket-URL (falls der Server nicht auf `ws://localhost:8080` erreichbar ist):

   ```bash
   export EXPO_PUBLIC_WS_URL="ws://<IP_DES_HOSTS>:8080"
   ```

2. Starte die App:

   ```bash
   npx expo start
   ```

3. Verbinde dich wie gewohnt mit einem Emulator, der Expo-Go-App oder einem Development Build.

## Funktionen im Überblick

- **Host-Steuerung**: Rollenverwaltung (Dorfbewohner, Werwolf, Seher), Lebensstatus toggeln, Phasenwechsel und Abstimmungs-Reset.
- **Öffentlicher Chat**: Host und Spieler können Nachrichten austauschen.
- **Werwolf-Chat**: Private Kommunikation und Abstimmung unter Werwölfen.
- **Abstimmungen**: Separate Ergebnisse für Werwolf- und Tag-Abstimmungen mit Live-Tally.
- **Sprachausgabe**: Wähle Stimmen aus dem System oder hinterlege einen externen Provider für realistische Text-to-Speech-Ausgabe.

## Sprachausgabe konfigurieren

Die Einstellungen findest du in `constants/config.ts`.

- `provider: 'native'` nutzt die auf dem Gerät verfügbaren Stimmen (Expo Speech).
- `provider: 'remote'` ermöglicht die Anbindung an externe Dienste wie z. B. ElevenLabs. Hinterlege dafür `endpoint`, optional einen API-Key sowie Parameter-Namen (`textParameter`, `voiceParameter`). Der Dienst sollte ein JSON mit `audioUrl` oder `audioBase64` liefern.
- Passe `nativeVoiceIdentifier`, `rate` und `pitch` an, um die lokale Sprachausgabe natürlicher klingen zu lassen.

## Spielablauf

1. Der Host startet den Server und legt in der App eine neue Sitzung an.
2. Spieler treten mit dem ausgegebenen Raumcode bei.
3. Rollen und Lebensstatus werden durch den Host verwaltet.
4. Während der Nacht beraten sich Werwölfe im privaten Chat und stimmen ab.
5. In der Tagphase erfolgt die öffentliche Diskussion samt Abstimmung.
6. Über die Sprachausgabe kann der Host Ergebnisse automatisch ansagen lassen.

Viel Spaß beim moderierten Werwolf-Abend!
