from __future__ import annotations

from typing import Literal

from pydantic import AwareDatetime, Field

from app.schemas.operations import EntityID, RequestModel


class EvidenceAction(RequestModel):
    evidence_ticket_id: EntityID
    note: str = Field(min_length=1, max_length=5000)


class IncidentRecoveryCreate(EvidenceAction):
    recovered_at: AwareDatetime


class IncidentArrivalCreate(EvidenceAction):
    station_id: EntityID
    arrived_at: AwareDatetime
    condition: Literal[
        "INTACT",
        "REPAIRABLE",
        "UNREPAIRABLE",
    ]
    inspected_at: AwareDatetime | None = None


class IncidentVehicleRelease(EvidenceAction):
    maintenance_order_id: EntityID
