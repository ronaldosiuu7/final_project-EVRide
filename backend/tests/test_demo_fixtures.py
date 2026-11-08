import unittest
from collections import Counter
from datetime import datetime
from decimal import Decimal

from database.seeds.demo_fixtures import (
    ACTIVE_RENTALS,
    DEPOSIT_AMOUNT,
    DOCUMENTS,
    EXTRA_MINUTE_PRICE,
    FIRST_30_MINUTES_PRICE,
    HISTORICAL_RENTALS,
    STATIONS,
    USERS,
    VEHICLES,
)


class DemoFixtureTests(unittest.TestCase):
    def test_roles_and_document_review_states_are_covered(self) -> None:
        self.assertEqual(
            {user["role"] for user in USERS},
            {"CUSTOMER", "STAFF", "MANAGER"},
        )
        self.assertIn("PENDING", {document["verified_status"] for document in DOCUMENTS})
        self.assertIn("VERIFIED", {document["verified_status"] for document in DOCUMENTS})
        documented_users = {document["user"] for document in DOCUMENTS}
        self.assertNotIn("customer_without_document", documented_users)

    def test_three_stations_include_full_and_one_free_slot(self) -> None:
        occupied = Counter(
            vehicle["station"] for vehicle in VEHICLES if vehicle["station"]
        )
        stations = {station["key"]: station for station in STATIONS}
        self.assertEqual(occupied["full"], stations["full"]["capacity"])
        self.assertEqual(
            stations["one_slot"]["capacity"] - occupied["one_slot"],
            1,
        )

    def test_vehicle_and_active_rental_statuses_are_valid_and_unique(self) -> None:
        vehicle_keys = {vehicle["key"] for vehicle in VEHICLES}
        customer_keys = [rental["customer"] for rental in ACTIVE_RENTALS]
        active_vehicle_keys = [rental["vehicle"] for rental in ACTIVE_RENTALS]
        self.assertTrue(set(active_vehicle_keys).issubset(vehicle_keys))
        self.assertEqual(len(customer_keys), len(set(customer_keys)))
        self.assertEqual(len(active_vehicle_keys), len(set(active_vehicle_keys)))
        self.assertTrue(
            {
                "RESERVED",
                "IN_RENT",
                "RETURN_PENDING",
                "STOLEN",
            }.issubset({rental["status"] for rental in ACTIVE_RENTALS})
        )
        self.assertTrue(
            {
                "AVAILABLE",
                "RESERVED",
                "RENTED",
                "RETURN_PENDING",
                "MAINTENANCE",
                "SUSPECTED_STOLEN",
                "STOLEN",
            }.issubset({vehicle["status"] for vehicle in VEHICLES})
        )

    def test_historical_invoices_cover_multiple_months_at_r2_prices(self) -> None:
        months = {
            datetime.fromisoformat(rental["actual_end_time"]).strftime("%Y-%m")
            for rental in HISTORICAL_RENTALS
        }
        self.assertGreaterEqual(len(months), 6)
        first_block = Decimal(FIRST_30_MINUTES_PRICE)
        extra_minute = Decimal(EXTRA_MINUTE_PRICE)
        for rental in HISTORICAL_RENTALS:
            start = datetime.fromisoformat(rental["actual_start_time"])
            end = datetime.fromisoformat(rental["actual_end_time"])
            elapsed_minutes = int((end - start).total_seconds() // 60)
            expected = first_block + max(0, elapsed_minutes - 30) * extra_minute
            self.assertEqual(Decimal(rental["total_price"]), expected)
            self.assertEqual(rental["invoice_status"], "PAID")

    def test_fake_seed_accounts_and_policy_values_are_marked(self) -> None:
        self.assertTrue(all(user["email"].endswith("@evride.test") for user in USERS))
        self.assertTrue(all(vehicle["name"].startswith("[DEMO]") for vehicle in VEHICLES))
        self.assertTrue(all(vehicle["model"] for vehicle in VEHICLES))
        self.assertEqual(Decimal(DEPOSIT_AMOUNT), Decimal("100000.00"))


if __name__ == "__main__":
    unittest.main()
