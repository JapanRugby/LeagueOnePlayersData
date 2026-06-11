# Raw data

Put the raw match files here and commit them to GitHub when using the automatic update workflow.

Accepted patterns:

- `*_advanced_superscout.xml`
- `*_BI.csv`

The builder scans this directory recursively, so either flat files or season/round subfolders are OK.

Examples:

```text
data/raw/LO/948799_HEATvSHBR_BI.csv
data/raw/LO/948799_HEATvSHBR_advanced_superscout.xml
data/raw/2026-27/round-01/123456_TEAMvTEAM_BI.csv
data/raw/2026-27/round-01/123456_TEAMvTEAM_advanced_superscout.xml
```

When files under `data/raw/` are pushed to `main`, GitHub Actions regenerates `docs/data/` and commits the updated public JSON back to the repository.


## Competition auto-detection

Competitions are generated from raw metadata at build time.

- Preferred source: BI CSV columns `competitionID` and `competitionName`
- Fallback source: advanced_superscout XML `FixData/Data@FxTID`

When a new competition appears in raw files, `tools/build_data.py` adds it to `docs/data/manifest.json`. The website reads that manifest, so no front-end code change is required to show the new competition in the selector.
