"""Fails when R8 broke a class or member that Dart code looks up through JNI.

JNI looks classes and members up by name and signature at runtime, so a
release APK can build and pass every test yet crash on startup with
NoSuchMethodError or ClassNotFoundException when R8 removed or renamed them.

This collects every JNI lookup with literal names from the Dart sources of the
app's packages (`JClass.forName`, `instanceMethodId`, `staticMethodId`,
`instanceFieldId`, `staticFieldId`, `constructorId`: the calls jnigen and
Pigeon JNI generate) and checks that each class and member is in the APK's dex
with the same name and signature. Platform classes (java/, android/, ...) come
from the phone and are not checked.

usage: python3 tool/check_apk_jni.py <app.apk> <.dart_tool/package_config.json>
"""

import json
import re
import struct
import sys
import zipfile
from pathlib import Path
from urllib.parse import unquote, urlparse

PLATFORM_PREFIXES = ("java/", "javax/", "android/", "dalvik/", "org/json/", "org/w3c/", "org/xml/")

_STR = r"r?'([^']+)'"
_CLASS_DEF = re.compile(
    r"(?:final|var)\s+(?:[\w$.<>]+\s+)?([\w$]+)\s*=\s*(?:[\w$]+\.)?JClass\.forName\(\s*" + _STR
)
_MEMBER = re.compile(
    r"(?:[\w$]+\.)?([\w$]+)\.(instanceMethodId|staticMethodId|instanceFieldId|staticFieldId)\(\s*"
    + _STR
    + r"\s*,\s*"
    + _STR
)
_CONSTRUCTOR = re.compile(r"(?:[\w$]+\.)?([\w$]+)\.constructorId\(\s*" + _STR)


def jni_lookups(source: str) -> tuple[set[str], set[tuple[str, str, str]]]:
    """Classes and (class, member, signature) looked up in one Dart file."""
    defs = [(m.start(), m.group(1), m.group(2)) for m in _CLASS_DEF.finditer(source)]
    classes = {cls for _, _, cls in defs}

    def resolve(var: str, pos: int) -> str | None:
        # The nearest preceding definition: generated files reuse `_class`.
        found = [cls for start, name, cls in defs if name == var and start < pos]
        return found[-1] if found else None

    members = set()
    for m in _MEMBER.finditer(source):
        cls = resolve(m.group(1), m.start())
        if cls:
            members.add((cls, m.group(3), m.group(4)))
    for m in _CONSTRUCTOR.finditer(source):
        cls = resolve(m.group(1), m.start())
        if cls:
            members.add((cls, "<init>", m.group(2)))
    return classes, members


def package_lookups(package_config: Path) -> tuple[set[str], set[tuple[str, str, str]]]:
    config = json.loads(package_config.read_text())
    classes, members = set(), set()
    for package in config["packages"]:
        uri = package["rootUri"]
        root = (
            Path(unquote(urlparse(uri).path))
            if uri.startswith("file:")
            else (package_config.parent / uri).resolve()
        )
        for dart in (root / package.get("packageUri", "lib/")).rglob("*.dart"):
            source = dart.read_text(errors="replace")
            if "JClass.forName" not in source:
                continue
            c, m = jni_lookups(source)
            classes |= c
            members |= m
    is_app = lambda cls: not cls.startswith(PLATFORM_PREFIXES)  # noqa: E731
    return {c for c in classes if is_app(c)}, {m for m in members if is_app(m[0])}


class Dex:
    """Classes, their supertypes and the member ids of the APK's dex files."""

    def __init__(self, apk: str):
        self.supers: dict[str, list[str]] = {}
        self.members: set[tuple[str, str, str]] = set()
        with zipfile.ZipFile(apk) as z:
            for name in z.namelist():
                if re.fullmatch(r"classes\d*\.dex", name):
                    self._read(z.read(name))

    def _read(self, dex: bytes) -> None:
        (string_ids_off,) = struct.unpack_from("<I", dex, 0x3C)
        (type_ids_off,) = struct.unpack_from("<I", dex, 0x44)
        (proto_ids_off,) = struct.unpack_from("<I", dex, 0x4C)
        field_ids_size, field_ids_off = struct.unpack_from("<2I", dex, 0x50)
        method_ids_size, method_ids_off = struct.unpack_from("<2I", dex, 0x58)
        class_defs_size, class_defs_off = struct.unpack_from("<2I", dex, 0x60)

        def string(idx: int) -> str:
            pos = struct.unpack_from("<I", dex, string_ids_off + 4 * idx)[0]
            while dex[pos] & 0x80:  # skip the uleb128 length
                pos += 1
            return dex[pos + 1 : dex.index(b"\0", pos + 1)].decode("utf-8", "replace")

        def type_name(idx: int) -> str:
            return string(struct.unpack_from("<I", dex, type_ids_off + 4 * idx)[0])

        def type_list(off: int) -> list[str]:
            if not off:
                return []
            (count,) = struct.unpack_from("<I", dex, off)
            return [type_name(struct.unpack_from("<H", dex, off + 4 + 2 * k)[0]) for k in range(count)]

        def proto(idx: int) -> str:
            _, return_idx, params_off = struct.unpack_from("<3I", dex, proto_ids_off + 12 * idx)
            return "(" + "".join(type_list(params_off)) + ")" + type_name(return_idx)

        for i in range(class_defs_size):
            class_idx, _, super_idx, interfaces_off = struct.unpack_from(
                "<4I", dex, class_defs_off + 32 * i
            )
            supers = type_list(interfaces_off)
            if super_idx != 0xFFFFFFFF:
                supers.insert(0, type_name(super_idx))
            self.supers[type_name(class_idx)] = supers
        for i in range(field_ids_size):
            class_idx, type_idx, name_idx = struct.unpack_from("<HHI", dex, field_ids_off + 8 * i)
            self.members.add((type_name(class_idx), string(name_idx), type_name(type_idx)))
        for i in range(method_ids_size):
            class_idx, proto_idx, name_idx = struct.unpack_from("<HHI", dex, method_ids_off + 8 * i)
            self.members.add((type_name(class_idx), string(name_idx), proto(proto_idx)))

    def has_member(self, cls: str, name: str, signature: str) -> bool:
        # JNI also finds members declared in supertypes (e.g. Kotlin facades).
        seen, todo = set(), [cls]
        while todo:
            current = todo.pop()
            if current in seen:
                continue
            seen.add(current)
            if (current, name, signature) in self.members:
                return True
            if name != "<init>":
                todo += self.supers.get(current, [])
        return False


def problems(apk: str, package_config: Path) -> list[str]:
    classes, members = package_lookups(package_config)
    if not classes:
        return [f"no JNI lookups found in the packages of {package_config}"]
    print(f"checking {len(classes)} classes and {len(members)} members looked up through JNI")
    dex = Dex(apk)
    found = [f"class {c} is missing" for c in sorted(classes) if f"L{c};" not in dex.supers]
    found += [
        f"{cls}.{name}{signature} is missing"
        for cls, name, signature in sorted(members)
        if f"L{cls};" in dex.supers and not dex.has_member(f"L{cls};", name, signature)
    ]
    return found


def main(apk: str, package_config: str) -> int:
    found = problems(apk, Path(package_config))
    for problem in found:
        print(f"R8 broke a JNI lookup: {problem}")
    if found:
        print("Add -keep rules to android/app/proguard-rules.pro.")
    return 1 if found else 0


if __name__ == "__main__":
    sys.exit(main(*sys.argv[1:3]))
