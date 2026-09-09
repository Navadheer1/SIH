import os
import json
import logging
from typing import Dict, Any
from collections import Counter, defaultdict

from app.ml.dataset.config import (
    MAIN_MANIFEST_PATH,
    BALANCE_REPORT_JSON,
    BALANCE_REPORT_MD
)
from app.ml.dataset.manifest import ManifestManager

logger = logging.getLogger("dataset_report")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")


def generate_dataset_report(manifest_path: str = MAIN_MANIFEST_PATH) -> Dict[str, Any]:
    """
    Generates structured balance, provenance, and geographic breakdown reports.
    """
    entries = ManifestManager.load_manifest(manifest_path)
    total_count = len(entries)

    # Matrix: class -> label_type -> count
    breakdown: Dict[str, Dict[str, int]] = {
        "WILDFIRE": {"GROUND_TRUTH": 0, "WEAK_LABEL": 0, "MANUAL_REVIEW": 0},
        "INDUSTRIAL_FIRE": {"GROUND_TRUTH": 0, "WEAK_LABEL": 0, "MANUAL_REVIEW": 0},
        "NON_FIRE": {"GROUND_TRUTH": 0, "WEAK_LABEL": 0, "MANUAL_REVIEW": 0}
    }

    cloud_dist = {"0-10%": 0, "10-30%": 0, "30-60%": 0, ">60%": 0}
    quality_counts: Dict[str, int] = Counter()
    sources: Dict[str, int] = Counter()

    for e in entries:
        if e.label in breakdown and e.label_type in breakdown[e.label]:
            breakdown[e.label][e.label_type] += 1

        quality_counts[e.quality] += 1
        sources[e.source_dataset] += 1

        if e.cloud_cover <= 10.0:
            cloud_dist["0-10%"] += 1
        elif e.cloud_cover <= 30.0:
            cloud_dist["10-30%"] += 1
        elif e.cloud_cover <= 60.0:
            cloud_dist["30-60%"] += 1
        else:
            cloud_dist[">60%"] += 1

    report_dict = {
        "total_samples": total_count,
        "class_breakdown": breakdown,
        "sources": dict(sources),
        "cloud_distribution": cloud_dist,
        "quality_distribution": dict(quality_counts)
    }

    # Save JSON report
    os.makedirs(os.path.dirname(BALANCE_REPORT_JSON), exist_ok=True)
    with open(BALANCE_REPORT_JSON, "w", encoding="utf-8") as f:
        json.dump(report_dict, f, indent=2)

    # Markdown Report formatting
    md_lines = [
        "# Satellite ML Dataset Balance & Provenance Report",
        "",
        f"**Total Samples:** {total_count}",
        "",
        "## Class and Label Type Breakdown",
        "```",
    ]

    for label in ("WILDFIRE", "INDUSTRIAL_FIRE", "NON_FIRE"):
        sub = breakdown[label]
        cls_total = sum(sub.values())
        md_lines.extend([
            f"{label} (Total: {cls_total})",
            f"  Ground truth:  {sub['GROUND_TRUTH']}",
            f"  Weak label:    {sub['WEAK_LABEL']}",
            f"  Manual review: {sub['MANUAL_REVIEW']}",
            ""
        ])

    md_lines.extend([
        f"Total: {total_count}",
        "```",
        "",
        "## Source Dataset Provenance",
        "| Source Dataset | Count | Percentage |",
        "| :--- | :--- | :--- |"
    ])

    for src, cnt in sources.items():
        md_lines.append(f"| `{src}` | {cnt} | {cnt/max(1, total_count)*100:.1f}% |")

    md_lines.extend([
        "",
        "## Cloud Quality Stratification",
        "| Cloud Range | Sample Count | Percentage |",
        "| :--- | :--- | :--- |",
        f"| `0–10%` (Optimal) | {cloud_dist['0-10%']} | {cloud_dist['0-10%']/max(1, total_count)*100:.1f}% |",
        f"| `10–30%` (Good) | {cloud_dist['10-30%']} | {cloud_dist['10-30%']/max(1, total_count)*100:.1f}% |",
        f"| `30–60%` (Acceptable) | {cloud_dist['30-60%']} | {cloud_dist['30-60%']/max(1, total_count)*100:.1f}% |",
        f"| `>60%` (Rejected for Training) | {cloud_dist['>60%']} | {cloud_dist['>60%']/max(1, total_count)*100:.1f}% |",
    ])

    with open(BALANCE_REPORT_MD, "w", encoding="utf-8") as f:
        f.write("\n".join(md_lines))

    # Print to console
    print("\n" + "="*60)
    print("DATASET BALANCE REPORT:")
    print("="*60)
    for label in ("WILDFIRE", "INDUSTRIAL_FIRE", "NON_FIRE"):
        sub = breakdown[label]
        print(f"{label}")
        print(f"  Ground truth:  {sub['GROUND_TRUTH']}")
        print(f"  Weak label:    {sub['WEAK_LABEL']}")
        print(f"  Manual review: {sub['MANUAL_REVIEW']}")
    print(f"\nTotal: {total_count}")
    print("="*60 + "\n")

    return report_dict


def main():
    generate_dataset_report()


if __name__ == "__main__":
    main()
