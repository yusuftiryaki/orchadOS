import pytest

from orchados_pipeline.events import (
    COLUMNS,
    EventsFormatError,
    anchor_to_gps_ns,
    format_events,
    parse_events,
)

HEADER = ",".join(COLUMNS) + "\n"


def test_parse_quotes_empty_values_and_anchor():
    text = (
        HEADER + "1000,1475000000000000000,session_start,parcel_id=P-1,900,1474999999900000000\n"
        '2000,1475000000001000000,corner,"c1,""extra""",900,1474999999900000000\r\n'
        "3000,,pps_lost,,,\n"
    )
    ev = parse_events(text)
    assert [e.event_type for e in ev] == ["session_start", "corner", "pps_lost"]
    assert ev[1].payload == 'c1,"extra"'
    assert (ev[0].pps_esp_micros, ev[0].pps_gps_time_ns) == (900, 1474999999900000000)
    assert ev[2].gps_time_ns is None and ev[2].pps_esp_micros is None
    assert not any(e.gps_time_derived for e in ev)


def test_gps_time_recomputed_from_anchor():
    ev = parse_events(HEADER + "12250000,,qr_sync,x,10000000,1476350120000000000\n")[0]
    assert ev.gps_time_derived
    assert ev.gps_time_ns == 1476350120000000000 + 2_250_000 * 1000
    assert ev.gps_time_ns == anchor_to_gps_ns(12250000, 10000000, 1476350120000000000)


def test_anchor_too_old_is_not_used():
    ev = parse_events(HEADER + "200000000,,qr_sync,x,10000000,1476350120000000000\n")[0]
    assert ev.gps_time_ns is None and not ev.gps_time_derived


def test_roundtrip():
    rows = [(1, 2, "qr_sync", "start", 0, 1), (3, None, "corner", "a,b", None, None)]
    ev = parse_events(format_events(rows))
    got = [
        (e.esp_micros, e.gps_time_ns, e.event_type, e.payload, e.pps_esp_micros, e.pps_gps_time_ns)
        for e in ev
    ]
    assert got == rows


def test_legacy_four_column_format_rejected():
    with pytest.raises(EventsFormatError, match="legacy 4-column"):
        parse_events("esp_micros,gps_time_ns,event_type,payload\n1,2,corner,\n")


def test_missing_header_rejected():
    with pytest.raises(EventsFormatError, match="expected header"):
        parse_events("1,2,corner,,3,4\n")
    with pytest.raises(EventsFormatError, match="missing header"):
        parse_events("")


@pytest.mark.parametrize(
    ("row", "message"),
    [
        ("abc,1,corner,,,", "line 2: esp_micros"),
        ("1,2,corner,", "expected 6 columns, got 4"),
        ("1,2,corner,a,b,c,d", "expected 6 columns, got 7"),
        ("1,2,corner,,5,", "only one of its two values"),
        ("1,2,,,,", "empty event_type"),
    ],
)
def test_bad_rows_report_line(row, message):
    with pytest.raises(EventsFormatError, match=message):
        parse_events(HEADER + row + "\n")
