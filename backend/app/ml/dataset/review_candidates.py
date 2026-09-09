import os
import sys
import argparse
import logging
from typing import List, Optional

from app.ml.dataset.config import MAIN_MANIFEST_PATH, SAMPLES_DIR
from app.ml.dataset.manifest import ManifestEntry, ManifestManager

logger = logging.getLogger("review_candidates")


def format_candidate_summary(entry: ManifestEntry) -> str:
    preview_path = os.path.join(SAMPLES_DIR, f"{entry.sample_id}_preview.png")
    lines = [
        "----------------------------------------------------------------",
        f"Sample ID:            {entry.sample_id}",
        f"Candidate Label:      {entry.label}",
        f"Label Type:           {entry.label_type}",
        f"Source Dataset:       {entry.source_dataset}",
        f"FIRMS Observation ID: {entry.firms_observation_id or 'N/A'}",
        f"Coordinates:          {entry.latitude:.5f}, {entry.longitude:.5f}",
        f"Acquisition Time:     {entry.acquisition_time}",
        f"Cloud Cover:          {entry.cloud_cover:.1f}% ({entry.quality})",
        f"Industrial Distance:  {f'{entry.industrial_distance_km:.2f} km' if entry.industrial_distance_km is not None else 'N/A'}",
        f"OSM Industrial Type:  {entry.osm_industrial_type or 'N/A'}",
        f"RGB Preview Image:    {preview_path if os.path.exists(preview_path) else 'N/A'}",
        f"Current Notes:        {entry.notes}",
        "----------------------------------------------------------------"
    ]
    return "\n".join(lines)


def apply_review_decision(
    sample_id: str,
    action: str,
    reviewer_notes: str = "",
    manifest_path: str = MAIN_MANIFEST_PATH
) -> Optional[ManifestEntry]:
    """
    Applies manual review decision (ACCEPT, REJECT, UNCERTAIN) to a specific sample,
    updating label_type to MANUAL_REVIEW without altering original source tracking.
    """
    action_upper = action.strip().upper()
    if action_upper not in ("ACCEPT", "REJECT", "UNCERTAIN"):
        raise ValueError(f"Invalid review action '{action}'. Must be ACCEPT, REJECT, or UNCERTAIN.")

    entries = ManifestManager.load_manifest(manifest_path)
    target = next((e for e in entries if e.sample_id == sample_id), None)
    if not target:
        logger.error(f"Sample ID '{sample_id}' not found in manifest.")
        return None

    target.label_type = "MANUAL_REVIEW"
    if action_upper == "REJECT":
        target.quality = "REJECT"
        target.notes = f"[MANUAL REJECT] {reviewer_notes or 'Discarded during expert inspection'} | Prior: {target.notes}"
    elif action_upper == "ACCEPT":
        target.notes = f"[MANUAL ACCEPT] {reviewer_notes or 'Verified by manual inspection'} | Prior: {target.notes}"
    else: # UNCERTAIN
        target.notes = f"[MANUAL UNCERTAIN] {reviewer_notes or 'Flagged for senior review'} | Prior: {target.notes}"

    ManifestManager.save_manifest(entries, manifest_path)
    logger.info(f"Updated sample {sample_id} to MANUAL_REVIEW with action {action_upper}")
    return target


def interactive_review_session(
    manifest_path: str = MAIN_MANIFEST_PATH,
    limit: int = 10,
    filter_label: Optional[str] = None
) -> None:
    """
    Terminal-based interactive inspection session for candidates requiring review.
    """
    entries = ManifestManager.load_manifest(manifest_path)
    candidates = [
        e for e in entries 
        if e.label_type == "WEAK_LABEL" and (filter_label is None or e.label == filter_label)
    ]

    print(f"\nLoaded {len(candidates)} weak-label candidate samples available for review.")
    reviewed_count = 0

    for entry in candidates[:limit]:
        print("\n" + format_candidate_summary(entry))
        print("Options: [A]ccept | [R]eject | [U]ncertain | [S]kip | [Q]uit")
        choice = input("Enter decision (a/r/u/s/q): ").strip().lower()

        if choice == "q":
            break
        elif choice == "s":
            continue
        elif choice == "a":
            apply_review_decision(entry.sample_id, "ACCEPT", manifest_path=manifest_path)
            reviewed_count += 1
        elif choice == "r":
            apply_review_decision(entry.sample_id, "REJECT", manifest_path=manifest_path)
            reviewed_count += 1
        elif choice == "u":
            apply_review_decision(entry.sample_id, "UNCERTAIN", manifest_path=manifest_path)
            reviewed_count += 1

    print(f"\nReview session finished. Reviewed {reviewed_count} samples.\n")


def main():
    parser = argparse.ArgumentParser(description="Manual inspection and candidate review tool")
    parser.add_argument("--sample-id", type=str, help="Specific sample ID to review")
    parser.add_argument("--action", type=str, choices=["ACCEPT", "REJECT", "UNCERTAIN"], help="Action to apply")
    parser.add_argument("--notes", type=str, default="", help="Reviewer notes")
    parser.add_argument("--interactive", action="store_true", help="Launch interactive terminal review")
    parser.add_argument("--limit", type=int, default=10, help="Limit samples in interactive mode")
    parser.add_argument("--filter-label", type=str, choices=["WILDFIRE", "INDUSTRIAL_FIRE", "NON_FIRE"], help="Filter by label")
    args = parser.parse_args()

    if args.sample_id and args.action:
        apply_review_decision(args.sample_id, args.action, args.notes)
    elif args.interactive or not len(sys.argv) > 1:
        interactive_review_session(limit=args.limit, filter_label=args.filter_label)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
