import unittest

from pydantic import ValidationError

from app.schemas.fleet import PriceCreate, VehicleCreate, vehicle_out
from app.schemas.wallet import PromotionCreate, TopUpRequest


class BusinessSchemaTests(unittest.TestCase):
    def test_money_inputs_require_decimal_strings(self):
        self.assertEqual(TopUpRequest(amount="1000.00").amount, 1000)
        with self.assertRaises(ValidationError):
            TopUpRequest(amount=1000)
        with self.assertRaises(ValidationError):
            PriceCreate(
                vehicle_id="1",
                first_30_minutes_price=10000,
                extra_minute_price="350.00",
                deposit_amount="100000.00",
            )
        with self.assertRaises(ValidationError):
            VehicleCreate(
                current_station_id="1",
                name="Xe",
                model="DEMO-CITY",
                battery_percent=80,
                first_30_minutes_price=10000,
                extra_minute_price="350.00",
                deposit_amount="100000.00",
            )
        vehicle = VehicleCreate(
            current_station_id="1",
            name="Xe",
            model="DEMO-CITY",
            battery_percent=80,
            first_30_minutes_price="10000.00",
            extra_minute_price="350.00",
            deposit_amount="100000.00",
        )
        self.assertEqual(vehicle.model, "DEMO-CITY")
        with self.assertRaises(ValidationError):
            VehicleCreate(
                current_station_id="1",
                name="Xe",
                model="DEMO-CITY",
                type="CITY",
                battery_percent=80,
                first_30_minutes_price="10000.00",
                extra_minute_price="350.00",
                deposit_amount="100000.00",
            )

    def test_vehicle_response_exposes_model_without_type(self):
        from datetime import datetime, timezone
        from decimal import Decimal
        from types import SimpleNamespace

        vehicle = SimpleNamespace(
            id=1,
            current_station_id=2,
            name="Xe demo",
            model="DEMO-CITY",
            battery_percent=80,
            status="AVAILABLE",
            first_30_minutes_price=Decimal("10000.00"),
            extra_minute_price=Decimal("350.00"),
            deposit_amount=Decimal("100000.00"),
            created_at=datetime.now(timezone.utc),
        )
        response = vehicle_out(vehicle)
        self.assertEqual(response["model"], "DEMO-CITY")
        self.assertNotIn("type", response)

    def test_percentage_promotion_requires_integer_value_and_model_only_scope(self):
        valid = PromotionCreate(
            code=" save10 ",
            discount_type="PERCENTAGE",
            discount_value="10",
            usage_limit=2,
            start_date="2026-11-01T00:00:00Z",
            end_date="2026-12-01T00:00:00Z",
            vehicle_model=" CITY ",
        )
        self.assertEqual(valid.code, "SAVE10")
        self.assertEqual(valid.vehicle_model, "CITY")
        with self.assertRaises(ValidationError):
            PromotionCreate(
                code="SAVE",
                discount_type="PERCENTAGE",
                discount_value="10.5",
                usage_limit=2,
                start_date="2026-11-01T00:00:00Z",
                end_date="2026-12-01T00:00:00Z",
            )


if __name__ == "__main__":
    unittest.main()
