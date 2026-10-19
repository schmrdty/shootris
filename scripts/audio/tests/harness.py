"""A no-dependency test harness.

The build container has no pytest, so tests register themselves here and the
runner prints a TAP-ish report and exits non-zero on the first failing case's
suite. Each check gets its own line so a failure names the pack, the BPM and
the stem that caused it.
"""

from __future__ import annotations

import sys
import traceback

_TESTS: list[tuple[str, callable]] = []


def test(name: str):
    def register(fn):
        _TESTS.append((name, fn))
        return fn

    return register


class Failure(AssertionError):
    pass


def check(condition: bool, message: str) -> None:
    if not condition:
        raise Failure(message)


def near(actual: float, expected: float, tolerance: float, message: str) -> None:
    if abs(actual - expected) > tolerance:
        raise Failure(f"{message}: {actual!r} differs from {expected!r} by more than {tolerance}")


def run(title: str) -> int:
    print(f"# {title}")
    passed = failed = 0
    for index, (name, fn) in enumerate(_TESTS, start=1):
        try:
            detail = fn()
        except Failure as error:
            failed += 1
            print(f"not ok {index} - {name}\n  {error}")
        except Exception:  # a broken test is a failing test
            failed += 1
            print(f"not ok {index} - {name}")
            print("  " + traceback.format_exc().replace("\n", "\n  ").rstrip())
        else:
            passed += 1
            suffix = f"  # {detail}" if detail else ""
            print(f"ok {index} - {name}{suffix}")
    print(f"\n1..{len(_TESTS)}\n# pass {passed}\n# fail {failed}")
    return 1 if failed else 0


def main(title: str) -> None:
    sys.exit(run(title))
