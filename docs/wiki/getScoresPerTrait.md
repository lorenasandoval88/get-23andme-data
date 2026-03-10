## getScoresPerTrait()

Retrieve **polygenic scores grouped by trait** using cached trait summaries and score metadata.

This function links **traits → associated PGS IDs → full score metadata**, allowing applications to explore polygenic scores by phenotype.

The function prioritizes **cached trait-linked score data** stored in  
`pgs:scores-per-trait-summary`. If the cache is missing or `forceRefresh` is enabled, the function rebuilds the dataset using the trait summary cache and the `loadScores()` function.

---

## Parameters

| Parameter | Type | Default | Description |
|---|---|---|---|
| `forceRefresh` | boolean | `false` | Ignore cached results and rebuild the dataset |
| `maxTraits` | number | `Infinity` | Limit the number of traits processed |

---

## Example

### Load scores grouped by trait

```javascript
const result = await sdk.getScoresPerTrait();

console.log(result.scoresPerTrait);
```

### Limit number of traits processed

```javascript
const result = await sdk.getScoresPerTrait({
  maxTraits: 10
});

console.log(result.scoresPerTrait);
```

## Example Result
```json
{
  "savedAt": "2026-03-04T21:40:00Z",
  "processedTraits": 100,
  "totalTraitEntries": 1727,
  "scoresPerTrait": {
    "Breast cancer": {
      "pgs_ids": ["PGS000001", "PGS000123"],
      "scores": [...],
      "summary": {
        "totalScores": 2,
        "uniqueTraits": 1
      }
    }
  }
}
```

## Related Functions

| Function | Purpose |
|---|---|
| `loadScores()` | Retrieve full metadata for specific PGS IDs |
| `getTraitToPgsIdsFromTraitSummary()` | Extract trait → PGS ID mapping from trait summary |
| `getStoredScoreSummary()` | Retrieve cached summary datasets |
| `loadTraitStats()` | Build the trait summary cache required by this function |

---

## Workflow

When `getScoresPerTrait()` runs, it performs the following steps:

1. **Check cache**
   - Reads cached dataset `pgs:scores-per-trait-summary`

2. **Return cache if available**
   - If cache exists and `forceRefresh` is `false`, return cached result

3. **Load trait summary**
   - Retrieve cached trait summary (`pgs:trait-summary`)

4. **Extract trait → PGS ID mapping**
   - Use `getTraitToPgsIdsFromTraitSummary()`

5. **Retrieve scores per trait**
   - For each trait:
     - Retrieve associated PGS IDs
     - Call `loadScores()` to load full score metadata

6. **Build trait-linked dataset**

   - trait → pgs_ids → score metadata → summary

7. **Store results**
   - Save dataset in LocalForage cache

8. **Return results**

---

## Key Features

- Links **traits to their associated polygenic scores**
- Uses **existing cached datasets when possible**
- Supports **incremental trait processing with `maxTraits`**
- Enables **trait-level exploration of PGS metadata**
- Automatically builds **summary statistics for each trait**
- Stores results in **LocalForage persistent cache**
