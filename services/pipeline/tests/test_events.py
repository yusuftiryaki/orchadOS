import pytest

from orchados_pipeline.events import EventsFormatError, format_events, parse_events


def test_parse_header_quotes_and_empty_gps_time():
    text = (
        "esp_micros,gps_time_ns,event_type,payload\n"
        "# comment\n"
        "1000,1475000000000000000,session_start,abc\n"
        '2000,,corner,"c1,extra"\n'
        "3000,1475000001000000000,pps_lost,\n"
    )
    ev = parse_events(text)
    assert [e.event_type for e in ev] == ["session_start", "corner", "pps_lost"]
    assert ev[1].gps_time_ns is None and ev[1].payload == "c1,extra"
    assert ev[2].payload == ""


def test_roundtrip():
    rows = [(1, 2, "qr_sync", "start"), (3, None, "corner", "a,b")]
    ev = parse_events(format_events(rows))
    assert [(e.esp_micros, e.gps_time_ns, e.event_type, e.payload) for e in ev] == rows


def test_bad_number_reports_line():
    with pytest.raises(EventsFormatError, match="line 2"):
        parse_events("esp_micros,gps_time_ns,event_type,payload\nabc,1,corner,\n")
