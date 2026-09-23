"""Unit tests for detection decision logic.

These cover the parts that decide whether a frame becomes an alert — class
gating, confidence floor, cooldown suppression, and bounded backoff. All pure
functions, so they run without OpenCV, a camera, or model weights.

Run from rasberry-pi-setup/:
    python3 -m unittest discover -s tests -v
"""

from __future__ import annotations

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from pi_hub import config  # noqa: E402
from pi_hub.detect import (  # noqa: E402
    Detection,
    cooldown_active,
    next_backoff,
    select_triggers,
)


def det(label: str, confidence: float) -> Detection:
    return Detection(label=label, confidence=confidence, box=(0, 0, 10, 10))


class SelectTriggersTest(unittest.TestCase):
    def test_person_above_threshold_triggers(self):
        picked = select_triggers([det("person", 0.9)])
        self.assertEqual([d.label for d in picked], ["person"])

    def test_person_below_threshold_ignored(self):
        picked = select_triggers([det("person", 0.10)])
        self.assertEqual(picked, [])

    def test_cat_never_triggers_even_when_certain(self):
        """A cat at 3am must not wake anyone, no matter how confident."""
        picked = select_triggers([det("cat", 0.99)])
        self.assertEqual(picked, [])

    def test_mixed_frame_keeps_only_targets(self):
        picked = select_triggers(
            [det("cat", 0.99), det("person", 0.80), det("sofa", 0.95)]
        )
        self.assertEqual([d.label for d in picked], ["person"])

    def test_empty_frame(self):
        self.assertEqual(select_triggers([]), [])

    def test_threshold_is_inclusive(self):
        picked = select_triggers(
            [det("person", config.DETECT_MIN_CONFIDENCE)],
        )
        self.assertEqual(len(picked), 1)

    def test_label_match_is_case_insensitive(self):
        picked = select_triggers([det("Person", 0.9)])
        self.assertEqual(len(picked), 1)

    def test_targets_are_configurable(self):
        picked = select_triggers(
            [det("car", 0.9)], targets=("car",), min_confidence=0.5
        )
        self.assertEqual([d.label for d in picked], ["car"])

    def test_multiple_people_all_returned(self):
        picked = select_triggers([det("person", 0.7), det("person", 0.8)])
        self.assertEqual(len(picked), 2)


class CooldownTest(unittest.TestCase):
    def test_no_previous_event_is_not_suppressed(self):
        self.assertFalse(cooldown_active(None, now=1000.0))

    def test_immediately_after_event_is_suppressed(self):
        self.assertTrue(cooldown_active(1000.0, now=1000.5, cooldown_sec=30.0))

    def test_after_cooldown_expires_is_allowed(self):
        self.assertFalse(cooldown_active(1000.0, now=1031.0, cooldown_sec=30.0))

    def test_boundary_is_not_suppressed(self):
        self.assertFalse(cooldown_active(1000.0, now=1030.0, cooldown_sec=30.0))


class BackoffTest(unittest.TestCase):
    def test_first_backoff_uses_base(self):
        self.assertEqual(next_backoff(0.0, base=2.0, ceiling=30.0), 2.0)

    def test_backoff_doubles(self):
        self.assertEqual(next_backoff(2.0, base=2.0, ceiling=30.0), 4.0)

    def test_backoff_is_clamped_to_ceiling(self):
        self.assertEqual(next_backoff(20.0, base=2.0, ceiling=30.0), 30.0)

    def test_backoff_never_exceeds_ceiling_when_repeated(self):
        """Bounded retry: the interval must converge, not run away."""
        delay = 0.0
        for _ in range(50):
            delay = next_backoff(delay, base=2.0, ceiling=30.0)
        self.assertEqual(delay, 30.0)


if __name__ == "__main__":
    unittest.main()
