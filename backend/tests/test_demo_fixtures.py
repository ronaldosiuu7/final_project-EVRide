import math
import unittest
from collections import Counter, defaultdict
from datetime import date, datetime, timezone
from decimal import Decimal

from app.schemas.auth import LoginRequest
from database.seeds.demo_fixtures import (
    ACTIVE_RENTALS,
    DEMO_PASSWORD,
    DEPOSIT_AMOUNT,
    DOCUMENTS,
    EXTRA_MINUTE_PRICE,
    FIRST_30_MINUTES_PRICE,
    HISTORICAL_RENTALS,
    MAINTENANCE_ORDERS,
    PROMOTION_CLAIMS,
    PROMOTIONS,
    STATIONS,
    USERS,
    VEHICLES,
    VEHICLE_MOVE_AUDITS,
    WALLETS,
)

DEMO_REFERENCE_DATE = date(2026, 11, 27)
DEMO_REFERENCE_TIME = datetime(2026, 11, 27, 12, 0, 0, tzinfo=timezone.utc)


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

        verified_users = {
            document["user"]
            for document in DOCUMENTS
            if document["verified_status"] == "VERIFIED"
        }
        for rental in ACTIVE_RENTALS:
            self.assertIn(rental["customer"], verified_users)
        for rental in HISTORICAL_RENTALS:
            self.assertIn(rental["customer"], verified_users)

    def test_stations_are_in_inner_hanoi_with_full_and_one_free_slot(self) -> None:
        self.assertGreaterEqual(len(STATIONS), 6)
        coords = set()
        for station in STATIONS:
            lat = Decimal(station["latitude"])
            lon = Decimal(station["longitude"])
            self.assertGreaterEqual(lat, Decimal("20.99"))
            self.assertLessEqual(lat, Decimal("21.08"))
            self.assertGreaterEqual(lon, Decimal("105.77"))
            self.assertLessEqual(lon, Decimal("105.87"))
            coords.add((lat, lon))
        self.assertEqual(len(coords), len(STATIONS))

        occupied = Counter(
            vehicle["station"] for vehicle in VEHICLES if vehicle["station"]
        )
        stations = {station["key"]: station for station in STATIONS}
        for station_key, station in stations.items():
            self.assertLessEqual(occupied[station_key], station["capacity"])
        self.assertEqual(occupied["full"], stations["full"]["capacity"])
        self.assertEqual(
            stations["one_slot"]["capacity"] - occupied["one_slot"],
            1,
        )

    def test_vehicle_and_active_rental_statuses_are_valid_and_unique(self) -> None:
        vehicles_by_key = {vehicle["key"]: vehicle for vehicle in VEHICLES}
        self.assertEqual(len(vehicles_by_key), len(VEHICLES))
        self.assertEqual(len({vehicle["id"] for vehicle in VEHICLES}), len(VEHICLES))
        self.assertEqual(len({vehicle["name"] for vehicle in VEHICLES}), len(VEHICLES))

        customer_keys = [rental["customer"] for rental in ACTIVE_RENTALS]
        active_vehicle_keys = [rental["vehicle"] for rental in ACTIVE_RENTALS]
        self.assertTrue(set(active_vehicle_keys).issubset(vehicles_by_key))
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

        active_by_vehicle = {rental["vehicle"]: rental for rental in ACTIVE_RENTALS}
        active_maintenance_vehicles = {
            order["vehicle"]
            for order in MAINTENANCE_ORDERS
            if order["status"] in {"OPEN", "IN_PROGRESS"}
        }
        for vehicle in VEHICLES:
            status = vehicle["status"]
            if status in {"RENTED", "SUSPECTED_STOLEN", "STOLEN"}:
                self.assertIsNone(vehicle["station"])
                self.assertIn(vehicle["key"], active_by_vehicle)
            else:
                self.assertIsNotNone(vehicle["station"])
            if status == "RESERVED":
                self.assertEqual(active_by_vehicle[vehicle["key"]]["status"], "RESERVED")
                self.assertEqual(
                    vehicle["station"],
                    active_by_vehicle[vehicle["key"]]["pickup_station"],
                )
            elif status == "RETURN_PENDING":
                self.assertEqual(
                    active_by_vehicle[vehicle["key"]]["status"], "RETURN_PENDING"
                )
                self.assertEqual(vehicle["station"], "spacious")
            elif status == "RENTED":
                self.assertEqual(active_by_vehicle[vehicle["key"]]["status"], "IN_RENT")
            elif status == "SUSPECTED_STOLEN":
                self.assertEqual(active_by_vehicle[vehicle["key"]]["status"], "IN_RENT")
            elif status == "STOLEN":
                self.assertEqual(active_by_vehicle[vehicle["key"]]["status"], "STOLEN")
            elif status == "MAINTENANCE":
                self.assertIn(vehicle["key"], active_maintenance_vehicles)
                self.assertNotIn(vehicle["key"], active_by_vehicle)
            elif status == "AVAILABLE":
                self.assertNotIn(vehicle["key"], active_maintenance_vehicles)
                self.assertNotIn(vehicle["key"], active_by_vehicle)

    def test_historical_invoices_cover_multiple_months_at_r2_prices_without_overlap(
        self,
    ) -> None:
        months = {
            datetime.fromisoformat(rental["actual_end_time"]).strftime("%Y-%m")
            for rental in HISTORICAL_RENTALS
        }
        self.assertGreaterEqual(len(months), 6)
        first_block = Decimal(FIRST_30_MINUTES_PRICE)
        extra_minute = Decimal(EXTRA_MINUTE_PRICE)
        customer_intervals: dict[str, list[tuple[datetime, datetime]]] = defaultdict(list)
        vehicle_intervals: dict[str, list[tuple[datetime, datetime]]] = defaultdict(list)

        for rental in HISTORICAL_RENTALS:
            created = datetime.fromisoformat(rental["created_at"])
            start = datetime.fromisoformat(rental["actual_start_time"])
            end = datetime.fromisoformat(rental["actual_end_time"])
            self.assertLessEqual(created, start)
            self.assertLessEqual(start, end)
            elapsed_seconds = int((end - start).total_seconds())
            extra_minutes = math.ceil(max(elapsed_seconds - 1800, 0) / 60)
            expected = first_block + extra_minutes * extra_minute
            self.assertEqual(Decimal(rental["total_price"]), expected)
            self.assertEqual(rental["invoice_status"], "PAID")
            customer_intervals[rental["customer"]].append((created, end))
            vehicle_intervals[rental["vehicle"]].append((created, end))

        for intervals in (*customer_intervals.values(), *vehicle_intervals.values()):
            ordered = sorted(intervals)
            for previous, current in zip(ordered, ordered[1:]):
                self.assertLess(previous[1], current[0])

    def test_seed_records_and_policy_values_have_no_demo_labels(self) -> None:
        placeholder_models = {"DEMO-CITY", "DEMO-LONG-RANGE", "CITY", "LONG RANGE"}
        forbidden_tokens = ("demo", "fictional", "mô phỏng", "thử nghiệm")
        self.assertTrue(all(user["email"].endswith("@example.com") for user in USERS))
        self.assertTrue(all(vehicle["name"].startswith("EV-") for vehicle in VEHICLES))
        self.assertTrue(all(vehicle["model"] for vehicle in VEHICLES))
        self.assertTrue(
            all(
                vehicle["model"].upper() not in placeholder_models
                and not vehicle["model"].startswith("-")
                for vehicle in VEHICLES
            )
        )
        self.assertTrue(all("type" not in vehicle for vehicle in VEHICLES))
        self.assertEqual(Decimal(DEPOSIT_AMOUNT), Decimal("100000.00"))

        display_texts = [
            *(user["name"] for user in USERS),
            *(station["name"] for station in STATIONS),
            *(station["address"] for station in STATIONS),
            *(vehicle["name"] for vehicle in VEHICLES),
            *(vehicle["model"] for vehicle in VEHICLES),
            *(document["document_number"] for document in DOCUMENTS),
            *(promotion["code"] for promotion in PROMOTIONS),
            *(promotion["description"] for promotion in PROMOTIONS),
            *(order["title"] for order in MAINTENANCE_ORDERS),
            *(order["description"] for order in MAINTENANCE_ORDERS),
            *(move["note"] for move in VEHICLE_MOVE_AUDITS),
        ]
        for text in display_texts:
            lowered = text.casefold()
            for token in forbidden_tokens:
                self.assertNotIn(token, lowered, f"Unexpected {token!r} in {text!r}")

    def test_demo_account_emails_pass_login_request_validation(self) -> None:
        self.assertGreaterEqual(len(USERS), 8)
        for user in USERS:
            payload = LoginRequest(email=user["email"], password=DEMO_PASSWORD)
            self.assertEqual(payload.email, user["email"])

    def test_cross_references_are_valid(self) -> None:
        user_keys = {user["key"] for user in USERS}
        station_keys = {station["key"] for station in STATIONS}
        vehicle_keys = {vehicle["key"] for vehicle in VEHICLES}
        vehicle_models = {vehicle["model"].casefold() for vehicle in VEHICLES}
        promo_codes = {promotion["code"] for promotion in PROMOTIONS}

        for wallet in WALLETS:
            self.assertIn(wallet["user"], user_keys)
        for document in DOCUMENTS:
            self.assertIn(document["user"], user_keys)
            if document["verified_by"] is not None:
                self.assertIn(document["verified_by"], user_keys)
        for promotion in PROMOTIONS:
            if promotion["vehicle_model"] is not None:
                self.assertIn(promotion["vehicle_model"].casefold(), vehicle_models)
        for claim in PROMOTION_CLAIMS:
            self.assertIn(claim["user"], user_keys)
            self.assertIn(claim["promotion"], promo_codes)
        for rental in HISTORICAL_RENTALS:
            self.assertIn(rental["customer"], user_keys)
            self.assertIn(rental["vehicle"], vehicle_keys)
            self.assertIn(rental["pickup_station"], station_keys)
            self.assertIn(rental["return_station"], station_keys)
        for rental in ACTIVE_RENTALS:
            self.assertIn(rental["customer"], user_keys)
            self.assertIn(rental["vehicle"], vehicle_keys)
            self.assertIn(rental["pickup_station"], station_keys)
        for order in MAINTENANCE_ORDERS:
            self.assertIn(order["vehicle"], vehicle_keys)
        for move in VEHICLE_MOVE_AUDITS:
            self.assertIn(move["vehicle"], vehicle_keys)
            self.assertIn(move["from_station"], station_keys)
            self.assertIn(move["to_station"], station_keys)
            self.assertNotEqual(move["from_station"], move["to_station"])

    def test_checkout_demo_account_supports_fixed_model_promotion(self) -> None:
        checkout_user = next(user for user in USERS if user["key"] == "customer_checkout")
        checkout_document = next(
            document
            for document in DOCUMENTS
            if document["user"] == "customer_checkout"
        )
        checkout_wallet = next(
            wallet for wallet in WALLETS if wallet["user"] == "customer_checkout"
        )
        checkout_claim = next(
            claim
            for claim in PROMOTION_CLAIMS
            if claim["user"] == "customer_checkout"
        )
        promotion = next(
            promotion
            for promotion in PROMOTIONS
            if promotion["code"] == checkout_claim["promotion"]
        )
        active_maintenance_vehicles = {
            order["vehicle"]
            for order in MAINTENANCE_ORDERS
            if order["status"] in {"OPEN", "IN_PROGRESS"}
        }

        self.assertEqual(checkout_user["role"], "CUSTOMER")
        self.assertEqual(checkout_user["status"], "ACTIVE")
        self.assertEqual(checkout_document["verified_status"], "VERIFIED")
        self.assertGreater(
            date.fromisoformat(checkout_document["expires_on"]), DEMO_REFERENCE_DATE
        )
        self.assertEqual(checkout_wallet["status"], "ACTIVE")
        self.assertGreaterEqual(
            Decimal(checkout_wallet["balance"]),
            Decimal(DEPOSIT_AMOUNT) + Decimal(FIRST_30_MINUTES_PRICE),
        )
        self.assertNotIn(
            "customer_checkout",
            {rental["customer"] for rental in ACTIVE_RENTALS},
        )
        self.assertFalse(checkout_claim["is_used"])
        self.assertEqual(promotion["status"], "ACTIVE")
        self.assertEqual(promotion["discount_type"], "FIXED_AMOUNT")
        self.assertIsNotNone(promotion["vehicle_model"])
        self.assertLess(
            datetime.fromisoformat(promotion["start_date"]), DEMO_REFERENCE_TIME
        )
        self.assertGreater(
            datetime.fromisoformat(promotion["end_date"]), DEMO_REFERENCE_TIME
        )
        self.assertLess(promotion["used_count"], promotion["usage_limit"])

        matching_rentable_vehicles = [
            vehicle
            for vehicle in VEHICLES
            if vehicle["status"] == "AVAILABLE"
            and vehicle["station"] is not None
            and vehicle["battery_percent"] >= 30
            and vehicle["key"] not in active_maintenance_vehicles
            and vehicle["model"].casefold() == promotion["vehicle_model"].casefold()
        ]
        self.assertGreaterEqual(len(matching_rentable_vehicles), 1)


if __name__ == "__main__":
    unittest.main()
