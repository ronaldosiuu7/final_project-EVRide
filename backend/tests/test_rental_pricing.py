import unittest
from datetime import datetime, time, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace

from app.services.fleet import station_is_open
from app.services.rentals import _quote_financials


START = datetime(2026, 11, 8, 9, 0, tzinfo=timezone.utc)


def pricing_snapshot():
    return SimpleNamespace(
        first_30_minutes_price_snapshot=Decimal("10000.00"),
        extra_minute_price_snapshot=Decimal("350.00"),
        vehicle_model_snapshot="CITY",
    )


def quote_at(elapsed_seconds):
    return _quote_financials(
        rental=SimpleNamespace(
            actual_start_time=START,
            deposit_held=Decimal("100000.00"),
        ),
        snapshot=pricing_snapshot(),
        return_time=START + timedelta(seconds=elapsed_seconds),
        promotion=None,
        promotion_now=START,
    )


class RentalPricingTests(unittest.TestCase):
    def test_billing_blocks_and_rounds_up_additional_minutes(self):
        cases = (
            (1800, Decimal("10000.00")),
            (1801, Decimal("10350.00")),
            (1860, Decimal("10350.00")),
            (1861, Decimal("10700.00")),
        )
        for elapsed, expected_fee in cases:
            with self.subTest(elapsed=elapsed):
                quote = quote_at(elapsed)
                self.assertEqual(quote["rental_fee"], expected_fee)
                self.assertEqual(quote["elapsed_seconds"], elapsed)

    def test_deposit_breakdown_never_exceeds_invoice_total(self):
        quote = quote_at(1801)
        self.assertEqual(quote["deposit_applied"], Decimal("10350.00"))
        self.assertEqual(quote["additional_payment"], Decimal("0.00"))
        self.assertEqual(quote["deposit_refund"], Decimal("89650.00"))

    def test_station_hours_support_overnight_windows(self):
        station = SimpleNamespace(
            status="ACTIVE",
            opens_at=time(22, 0),
            closes_at=time(6, 0),
        )
        self.assertTrue(
            station_is_open(
                station, datetime(2026, 11, 8, 20, 0, tzinfo=timezone.utc)
            )
        )
        self.assertFalse(
            station_is_open(
                station, datetime(2026, 11, 8, 12, 0, tzinfo=timezone.utc)
            )
        )
        station.status = "INACTIVE"
        self.assertFalse(
            station_is_open(
                station, datetime(2026, 11, 8, 20, 0, tzinfo=timezone.utc)
            )
        )


if __name__ == "__main__":
    unittest.main()
