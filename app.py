import os
import re
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import requests
import yaml
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

load_dotenv()

HA_URL = os.getenv("HA_URL", "").strip()
HA_TOKEN = os.getenv("HA_TOKEN", "").strip()

targets_file_env = os.getenv("APPLE_TV_TARGETS_FILE", "").strip()
if targets_file_env:
    TARGETS_FILE = Path(targets_file_env).expanduser().resolve()
else:
    TARGETS_FILE = Path(__file__).with_name("targets.yaml").resolve()

YOUTUBE_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")

app = FastAPI(
    title="Apple TV Proxy",
    description="Internt API för att starta YouTube-video på Apple TV via Home Assistant",
    version="1.0.0",
    root_path="/api/apple-tv",
)


class PlayRequest(BaseModel):
    url: str = Field(min_length=1)
    target: str | None = None


def load_target_config() -> tuple[str, dict[str, str]]:
    try:
        with TARGETS_FILE.open("r", encoding="utf-8") as fh:
            config = yaml.safe_load(fh) or {}
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Target-konfiguration saknas: {TARGETS_FILE}",
        ) from exc
    except yaml.YAMLError as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Felaktig YAML i {TARGETS_FILE}: {exc}",
        ) from exc

    default_alias = config.get("default")
    targets = config.get("targets")

    if not isinstance(default_alias, str) or not default_alias.strip():
        raise HTTPException(
            status_code=500,
            detail="YAML-filen saknar ett giltigt 'default'-alias",
        )

    if not isinstance(targets, dict) or not targets:
        raise HTTPException(
            status_code=500,
            detail="YAML-filen saknar en giltig 'targets'-sektion",
        )

    clean_targets: dict[str, str] = {}

    for alias, entity_id in targets.items():
        if not isinstance(alias, str) or not isinstance(entity_id, str):
            raise HTTPException(
                status_code=500,
                detail="Alla alias och entity_id i targets måste vara strängar",
            )

        alias = alias.strip()
        entity_id = entity_id.strip()

        if not alias:
            raise HTTPException(status_code=500, detail="Tomt target-alias i YAML-filen")

        if not entity_id.startswith("media_player."):
            raise HTTPException(
                status_code=500,
                detail=f"Ogiltigt Home Assistant entity_id för '{alias}': {entity_id}",
            )

        clean_targets[alias] = entity_id

    if default_alias.casefold() not in {alias.casefold() for alias in clean_targets}:
        raise HTTPException(
            status_code=500,
            detail=f"Default-alias '{default_alias}' finns inte bland targets",
        )

    return default_alias.strip(), clean_targets


def resolve_target(alias: str, targets: dict[str, str]) -> tuple[str, str]:
    wanted = alias.strip().casefold()

    for configured_alias, entity_id in targets.items():
        if configured_alias.casefold() == wanted:
            return configured_alias, entity_id

    raise HTTPException(
        status_code=400,
        detail={
            "message": f"Okänt target: {alias}",
            "available_targets": list(targets.keys()),
        },
    )


def validate_video_id(video_id: str | None) -> str:
    if video_id and YOUTUBE_ID_RE.fullmatch(video_id):
        return video_id
    raise ValueError("Kunde inte hitta ett giltigt YouTube-video-id")


def extract_youtube_video_id(value: str) -> str:
    raw = value.strip()

    if raw.startswith("youtube://watch/"):
        return validate_video_id(
            raw.removeprefix("youtube://watch/").split("?", 1)[0]
        )

    parsed = urlparse(raw)
    host = (parsed.hostname or "").casefold()
    parts = [p for p in parsed.path.split("/") if p]

    if host in {"youtu.be", "www.youtu.be"}:
        return validate_video_id(parts[0] if parts else None)

    youtube_hosts = {
        "youtube.com",
        "www.youtube.com",
        "m.youtube.com",
        "music.youtube.com",
        "youtube-nocookie.com",
        "www.youtube-nocookie.com",
    }

    if host not in youtube_hosts:
        raise ValueError("URL:en är inte en stödd YouTube-länk")

    if parsed.path == "/watch":
        return validate_video_id(parse_qs(parsed.query).get("v", [None])[0])

    if len(parts) >= 2 and parts[0] in {"shorts", "embed", "live"}:
        return validate_video_id(parts[1])

    raise ValueError("YouTube-URL-formatet stöds inte")


@app.get("/health")
def health():
    default_alias, targets = load_target_config()

    return {
        "status": "ok",
        "home_assistant_configured": bool(HA_URL and HA_TOKEN),
        "targets_file": str(TARGETS_FILE),
        "default_target": default_alias,
        "targets": list(targets.keys()),
    }


@app.get("/targets")
def get_targets():
    default_alias, targets = load_target_config()

    return {
        "default": default_alias,
        "targets": list(targets.keys()),
    }


@app.post("/play")
def play(request: PlayRequest):
    if not HA_URL:
        raise HTTPException(status_code=500, detail="HA_URL saknas i .env")

    if not HA_TOKEN:
        raise HTTPException(status_code=500, detail="HA_TOKEN saknas i .env")

    default_alias, targets = load_target_config()
    target_alias, entity_id = resolve_target(
        request.target or default_alias,
        targets,
    )

    try:
        video_id = extract_youtube_video_id(request.url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    media_content_id = f"youtube://watch/{video_id}"

    try:
        response = requests.post(
            f"{HA_URL.rstrip('/')}/api/services/media_player/play_media",
            headers={
                "Authorization": f"Bearer {HA_TOKEN}",
                "Content-Type": "application/json",
            },
            json={
                "entity_id": entity_id,
                "media_content_type": "url",
                "media_content_id": media_content_id,
            },
            timeout=15,
        )
    except requests.RequestException as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Kunde inte kontakta Home Assistant: {exc}",
        ) from exc

    if not response.ok:
        raise HTTPException(
            status_code=502,
            detail=f"Home Assistant svarade {response.status_code}: {response.text}",
        )

    return {
        "status": "playing",
        "target": target_alias,
        "video_id": video_id,
        "media_content_id": media_content_id,
    }
