# Apple TV Proxy

Liten intern FastAPI-tjänst som startar YouTube-videor på Apple TV via Home Assistant.

## Viktigt om sökvägar

Projektet kan ligga var som helst, till exempel:

```text
/home/unilsson/Development/apple-tv-proxy
```

eller:

```text
/opt/apple-tv-proxy
```

Sökvägen till `targets.yaml` styrs av `.env`:

```env
APPLE_TV_TARGETS_FILE=/home/unilsson/Development/apple-tv-proxy/targets.yaml
```

Python-koden använder alltså inte en hårdkodad `/opt`-sökväg.

## Installation

```bash
cd ~/Development/apple-tv-proxy

python3 -m venv .venv
.venv/bin/python -m pip install --upgrade pip
.venv/bin/pip install -r requirements.txt

cp .env.example .env
```

Redigera sedan `.env`:

```env
HA_URL=http://homeassistant.local:8123
HA_TOKEN=DIN_LONG_LIVED_TOKEN
APPLE_TV_TARGETS_FILE=/home/unilsson/Development/apple-tv-proxy/targets.yaml
```

Justera `targets.yaml` vid behov.

## Starta

```bash
./run.sh
```

eller direkt:

```bash
.venv/bin/uvicorn app:app --host 127.0.0.1 --port 21966
```

## Testa

Health:

```bash
curl http://127.0.0.1:21966/health
```

Targets:

```bash
curl http://127.0.0.1:21966/targets
```

Spela YouTube på kökets Apple TV:

```bash
curl -X POST http://127.0.0.1:21966/play \
  -H 'Content-Type: application/json' \
  -d '{
    "target":"Kök",
    "url":"https://youtu.be/dQw4w9WgXcQ"
  }'
```

Swagger:

```text
http://127.0.0.1:21966/docs
```

## API bakom central Nginx-proxy

Avsedd extern intern adress:

```text
http://api.ulnihnw.net/api/apple-tv/
```

FastAPI använder:

```python
root_path="/api/apple-tv"
```

Nginx kan därför proxya:

```text
/api/apple-tv/ -> http://127.0.0.1:21966/
```

## Targets YAML

Exempel:

```yaml
default: Kök

targets:
  Kök: media_player.koket_apple_tv
  Vardagsrum: media_player.vardagsrummet_apple_tv
```

Alias matchas utan hänsyn till stora/små bokstäver.

## Violentmonkey userscript

Repot innehåller även ett userscript för Firefox/Violentmonkey:

```text
userscripts/youtube-to-apple-tv.user.js
