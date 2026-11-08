import unittest

from pydantic import ValidationError

from app.schemas.fleet import PriceCreate, VehicleCreate
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
                model="CITY",
                type="CITY",
                battery_percent=80,
                first_30_minutes_price=10000,
                extra_minute_price="350.00",
                deposit_amount="100000.00",
            )
        with self.assertRaises(ValidationError):
            PriceCreate(
                vehicle_id=1,
                first_30_minutes_price="10000.00",
                extra_minute_price="350.00",
                deposit_amount="100000.00",
            )

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
