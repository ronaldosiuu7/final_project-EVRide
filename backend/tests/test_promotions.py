import unittest
from datetime import datetime, timezone
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import Mock

from app.services.promotions import (
    PromotionNotApplicable,
    calculate_promotion_discount,
    consume_promotion,
)


NOW = datetime(2026, 11, 8, 9, 0, tzinfo=timezone.utc)


def promotion(**overrides):
    values = {
        "status": "ACTIVE",
        "start_date": datetime(2026, 1, 1, tzinfo=timezone.utc),
        "end_date": datetime(2027, 1, 1, tzinfo=timezone.utc),
        "usage_limit": 10,
        "used_count": 0,
        "min_rental_amount": Decimal("0.00"),
        "vehicle_model": None,
        "discount_type": "PERCENTAGE",
        "discount_value": Decimal("10.00"),
        "max_discount_amount": None,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


class PromotionServiceTests(unittest.TestCase):
    def test_percentage_discount_respects_cap_and_half_up_rounding(self):
        capped_discount = calculate_promotion_discount(
            promotion(max_discount_amount=Decimal("1000.00")),
            rental_amount=Decimal("15005.00"),
            vehicle_model="MODEL-A",
            now=NOW,
        )
        rounded_discount = calculate_promotion_discount(
            promotion(),
            rental_amount=Decimal("15005.00"),
            vehicle_model="MODEL-A",
            now=NOW,
        )
        self.assertEqual(capped_discount, Decimal("1000.00"))
        self.assertEqual(rounded_discount, Decimal("1500.00"))

    def test_fixed_discount_never_exceeds_rental_amount(self):
        discount = calculate_promotion_discount(
            promotion(
                discount_type="FIXED_AMOUNT",
                discount_value=Decimal("20000.00"),
            ),
            rental_amount=Decimal("15000.00"),
            vehicle_model="MODEL-A",
            now=NOW,
        )
        self.assertEqual(discount, Decimal("15000.00"))

    def test_scope_and_minimum_amount_are_enforced(self):
        scoped = promotion(
            min_rental_amount=Decimal("1000.00"),
            vehicle_model="MODEL-A",
        )
        for vehicle_model, amount in (
            ("MODEL-B", Decimal("20000.00")),
            ("MODEL-A", Decimal("500.00")),
        ):
            with self.subTest(vehicle_model=vehicle_model):
                with self.assertRaises(PromotionNotApplicable):
                    calculate_promotion_discount(
                        scoped,
                        rental_amount=amount,
                        vehicle_model=vehicle_model,
                        now=NOW,
                    )

    def test_exhausted_and_out_of_window_codes_are_rejected(self):
        exhausted = promotion(used_count=10)
        with self.assertRaises(PromotionNotApplicable) as raised:
            calculate_promotion_discount(
                exhausted,
                rental_amount=Decimal("10000.00"),
                vehicle_model="MODEL-A",
                now=NOW,
            )
        self.assertEqual(raised.exception.code, "PROMOTION_EXHAUSTED")

        not_started = promotion(
            start_date=datetime(2026, 12, 1, tzinfo=timezone.utc)
        )
        with self.assertRaises(PromotionNotApplicable):
            calculate_promotion_discount(
                not_started,
                rental_amount=Decimal("10000.00"),
                vehicle_model="MODEL-A",
                now=NOW,
            )

    def test_consumption_marks_claim_and_increments_usage_once(self):
        promo = promotion()
        claim = SimpleNamespace(is_used=False, used_at=None)
        session = Mock()
        session.scalar.side_effect = [promo, claim]

        discount = consume_promotion(
            session,
            user_id=1,
            promotion_id=2,
            rental_amount=Decimal("10000.00"),
            vehicle_model="MODEL-A",
            now=NOW,
        )

        self.assertEqual(discount, Decimal("1000.00"))
        self.assertEqual(promo.used_count, 1)
        self.assertTrue(claim.is_used)
        self.assertEqual(claim.used_at, NOW)

        retry_session = Mock()
        retry_session.scalar.side_effect = [promo, claim]
        with self.assertRaises(PromotionNotApplicable):
            consume_promotion(
                retry_session,
                user_id=1,
                promotion_id=2,
                rental_amount=Decimal("10000.00"),
                vehicle_model="MODEL-A",
                now=NOW,
            )
        self.assertEqual(promo.used_count, 1)


if __name__ == "__main__":
    unittest.main()
