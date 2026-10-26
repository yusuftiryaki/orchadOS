// ins_meta_dump: an Insta360 .insv file's metadata as JSON on stdout.
//
// Built against the vendor InsMetaData SDK (not in this repository; see
// build.sh). Output, one object:
//   {"camera_type", "serial", "firmware", "first_timestamp_ms",
//    "gyro": [[t, ax, ay, az, gx, gy, gz], ...],   // as the SDK reports them
//    "exposure": [[t_ms, shutter_s], ...],
//    "gps": [[t, lat, lon, alt], ...]}             // south/west as negative
// Units are the SDK's and are not yet checked on a real recording: the
// pipeline reads this file but does not use the gyro for time sync yet
// (docs/gorevler/insta360-sdk.md).
#include <cstdio>
#include <memory>
#include <string>
#include <vector>

#include "metaData.h"

static std::string esc(const std::string& s) {
    std::string o;
    for (char c : s) {
        if (c == '"' || c == '\\') { o += '\\'; o += c; }
        else if (static_cast<unsigned char>(c) < 0x20) { char b[8]; std::snprintf(b, sizeof b, "\\u%04x", c); o += b; }
        else o += c;
    }
    return o;
}

int main(int argc, char* argv[]) {
    if (argc != 2) {
        std::fprintf(stderr, "usage: ins_meta_dump FILE.insv\n");
        return 2;
    }
    auto parser = std::make_shared<ins_metadata::MetaDataParser>();
    if (!parser->Parse(argv[1])) {
        std::fprintf(stderr, "ins_meta_dump: cannot parse %s\n", argv[1]);
        return 1;
    }
    std::vector<GyroDataItem_t> gyro;
    std::vector<ExposureDataItem_t> exposure;
    std::vector<GpsDataItem_t> gps;
    parser->GetGyroData(gyro);
    parser->GetExposureData(exposure);
    parser->GetGPSData(gps);

    std::printf("{\"camera_type\":\"%s\",\"serial\":\"%s\",\"firmware\":\"%s\",\"first_timestamp_ms\":%lld,",
                esc(parser->GetCameraType()).c_str(), esc(parser->GetSerialNumber()).c_str(),
                esc(parser->GetFireWareVersion()).c_str(),
                static_cast<long long>(parser->GetFirstTimeStamp()));
    std::printf("\"gyro\":[");
    for (size_t i = 0; i < gyro.size(); ++i) {
        const auto& g = gyro[i];
        std::printf("%s[%lld,%.9g,%.9g,%.9g,%.9g,%.9g,%.9g]", i ? "," : "",
                    static_cast<long long>(g.timestamp), g.acceleration[0], g.acceleration[1],
                    g.acceleration[2], g.rotation[0], g.rotation[1], g.rotation[2]);
    }
    std::printf("],\"exposure\":[");
    for (size_t i = 0; i < exposure.size(); ++i)
        std::printf("%s[%lld,%.9g]", i ? "," : "", static_cast<long long>(exposure[i].timestamp),
                    exposure[i].shutter_speed_s);
    std::printf("],\"gps\":[");
    for (size_t i = 0; i < gps.size(); ++i) {
        const auto& p = gps[i];
        double lat = p.north_south == 'S' ? -p.latitude : p.latitude;
        double lon = p.east_west == 'W' ? -p.longitude : p.longitude;
        std::printf("%s[%lld,%.9f,%.9f,%.3f]", i ? "," : "", static_cast<long long>(p.timestampMs),
                    lat, lon, p.altitude);
    }
    std::printf("]}\n");
    return 0;
}
