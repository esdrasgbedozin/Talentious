"""Tests du logging structuré JSON (app.core.logging_config)."""

import json
import logging
import sys

from app.core.logging_config import JsonFormatter, request_id_var


def _record(msg="hello %s", args=("world",), level=logging.INFO, name="app.test"):
    return logging.LogRecord(
        name=name,
        level=level,
        pathname="x.py",
        lineno=1,
        msg=msg,
        args=args,
        exc_info=None,
    )


def test_emits_valid_json_with_severity_message_and_logger():
    out = json.loads(JsonFormatter().format(_record()))
    assert out["severity"] == "INFO"
    assert out["message"] == "hello world"  # args interpolés
    assert out["logger"] == "app.test"
    assert "timestamp" in out


def test_maps_level_to_cloud_logging_severity():
    out = json.loads(JsonFormatter().format(_record(level=logging.WARNING)))
    assert out["severity"] == "WARNING"


def test_includes_request_id_when_set():
    token = request_id_var.set("req-abc123")
    try:
        out = json.loads(JsonFormatter().format(_record()))
    finally:
        request_id_var.reset(token)
    assert out["request_id"] == "req-abc123"


def test_omits_request_id_when_unset():
    out = json.loads(JsonFormatter().format(_record()))
    assert "request_id" not in out


def test_serializes_exception():
    try:
        raise ValueError("boom interne")
    except ValueError:
        rec = logging.LogRecord(
            "app.e", logging.ERROR, "x.py", 1, "échec", (), sys.exc_info()
        )
    out = json.loads(JsonFormatter().format(rec))
    assert out["severity"] == "ERROR"
    assert "boom interne" in out["exception"]


def test_passes_extra_fields_through():
    rec = _record()
    rec.user_id = "u-42"  # logger.info(..., extra={"user_id": "u-42"})
    out = json.loads(JsonFormatter().format(rec))
    assert out["user_id"] == "u-42"
