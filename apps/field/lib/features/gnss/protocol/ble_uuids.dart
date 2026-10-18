/// GATT identifiers of the GNSS logger (firmware/gnss-logger/README.md).
library;

const String gnssServiceUuid = 'cdee0001-a1bf-488e-8eda-a2c084827c6c';
const String gnssStatusUuid = 'cdee0002-a1bf-488e-8eda-a2c084827c6c';
const String gnssCommandUuid = 'cdee0003-a1bf-488e-8eda-a2c084827c6c';

/// Advertised name is `orchados-gnss-XXXX` (last two MAC bytes).
const String gnssDeviceNamePrefix = 'orchados-gnss-';

/// MTU the app asks for after connecting; the longest command is 204 bytes.
const int gnssRequestedMtu = 247;
