"""Fails when R8 broke the signatures of Kotlin methods called through JNI.

JNI looks methods up by name and signature at runtime, so a release APK can
build and pass every test yet crash on startup with NoSuchMethodError. R8
renames classes into the default package (`Lvo;`), so a renamed parameter
type (e.g. `kotlin.coroutines.Continuation`) changes the signature. This
reads the dex method table and fails when a method of a JNI-called class is
missing or has a parameter or return type without a package.

usage: python3 tool/check_apk_jni.py <app.apk>
"""

import re
import struct
import sys
import zipfile

# Classes whose methods plugins call through JNI (jnigen / Pigeon JNI).
JNI_CLASSES = [
    "Lio/flutter/plugins/sharedpreferences/SharedPreferencesApiRegistrar;",
    "Lio/flutter/plugins/sharedpreferences/SharedPreferencesAsyncApiRegistrar;",
]
# Methods that must survive shrinking, on top of the signature check.
REQUIRED = {"getAll", "setString"}


def dex_methods(dex: bytes) -> list[tuple[str, str, list[str]]]:
    """(class, method, parameter and return types) for each method id."""
    string_ids_off, = struct.unpack_from("<I", dex, 0x3C)
    _, type_ids_off = struct.unpack_from("<2I", dex, 0x40)
    _, proto_ids_off = struct.unpack_from("<2I", dex, 0x48)
    method_ids_size, method_ids_off = struct.unpack_from("<2I", dex, 0x58)

    def string(idx: int) -> str:
        pos = struct.unpack_from("<I", dex, string_ids_off + 4 * idx)[0]
        while dex[pos] & 0x80:  # skip the uleb128 length
            pos += 1
        return dex[pos + 1 : dex.index(b"\0", pos + 1)].decode("utf-8", "replace")

    def type_name(idx: int) -> str:
        return string(struct.unpack_from("<I", dex, type_ids_off + 4 * idx)[0])

    def proto_types(idx: int) -> list[str]:
        _, return_idx, params_off = struct.unpack_from("<3I", dex, proto_ids_off + 12 * idx)
        types = [type_name(return_idx)]
        if params_off:
            count, = struct.unpack_from("<I", dex, params_off)
            types += [
                type_name(struct.unpack_from("<H", dex, params_off + 4 + 2 * k)[0])
                for k in range(count)
            ]
        return types

    methods = []
    for i in range(method_ids_size):
        class_idx, proto_idx, name_idx = struct.unpack_from("<HHI", dex, method_ids_off + 8 * i)
        methods.append((type_name(class_idx), string(name_idx), proto_types(proto_idx)))
    return methods


def problems(apk: str) -> list[str]:
    with zipfile.ZipFile(apk) as z:
        methods = [
            m
            for name in z.namelist()
            if re.fullmatch(r"classes\d*\.dex", name)
            for m in dex_methods(z.read(name))
            if m[0] in JNI_CLASSES
        ]
    found = []
    for cls in JNI_CLASSES:
        names = {name for c, name, _ in methods if c == cls}
        found += [f"{cls}.{name} is missing" for name in sorted(REQUIRED - names)]
    for cls, name, types in methods:
        for t in types:
            if t.lstrip("[").startswith("L") and "/" not in t:
                found.append(f"{cls}.{name} uses renamed type {t}")
    return found


def main(apk: str) -> int:
    found = problems(apk)
    for problem in found:
        print(f"R8 broke a JNI signature: {problem}")
    if found:
        print("Add -keep rules to android/app/proguard-rules.pro.")
    return 1 if found else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
